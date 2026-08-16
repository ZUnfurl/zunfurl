import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCANNER_VERSION = 1;
const DEFAULT_ALLOWLIST_PATH = 'docs/compliance/public-text-allowlist.json';
const LARGE_OBJECT_THRESHOLD = 1024 * 1024;
const MAX_HISTORY_BLOB_BYTES = 32 * 1024 * 1024;

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

const clientTermRules = [
  new RegExp(['Premi', '[eè]re\\s+Dame'].join(''), 'giu'),
  new RegExp(['premiere', 'dame'].join(''), 'giu'),
  new RegExp(['black', '[\\s-]+swan'].join(''), 'giu'),
  new RegExp(['luminous', '[\\s-]+veil'].join(''), 'giu'),
  new RegExp(['trw', 'ten33'].join(''), 'giu'),
  new RegExp(['premiere', 'dame-web'].join(''), 'giu'),
];

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const urlHostPattern = /https?:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)/giu;
const bareDomainPattern = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:ai|app|ch|cn|co|com|de|dev|fr|gov|int|io|mil|net|org|sg|store|uk)\b/giu;
const myShopifyPattern = /\b[a-z0-9][a-z0-9-]{2,}\.myshopify\.com\b/giu;
const shopifyAdminPattern = /https:\/\/admin\.shopify\.com\/store\/[a-z0-9][a-z0-9-]*\/products\/\d+/giu;
const shopifyGidPattern = /gid:\/\/shopify\/(?:Collection|Order|Product|ProductVariant)\/\d{1,20}/giu;
const orderLiteralPattern = /(?:order(?:Id|Number)|订单(?:号|编号))\s*[:=]\s*["']([#A-Z0-9][A-Z0-9_-]{3,})["']/giu;
const windowsAbsolutePathPattern = /\b[A-Z]:[\\/][^\s"'`<>|]+/giu;
const uncPathPattern = /\\\\[^\\\s"'`<>|]+\\[^\\\s"'`<>|]+/gu;
const unixPrivatePathPattern = /(?<![A-Za-z0-9_./-])\/(?:Users|home|Volumes)\/[^\s"'`<>|]+/gu;
const privateIpv4Pattern = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/gu;
const phoneCandidatePattern = /(?<![\w.-])(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,4}\)?[\s.-]*){2,4}\d{3,4}(?![\w.-])/gu;

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.root ?? process.cwd(),
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    input: options.input,
    windowsHide: true,
  });
}

export function resolveSourceCommit({ mode, root }) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status === 0) return result.stdout.trim();
  if (mode === 'current') return 'WORKTREE-UNBORN';
  throw new Error('History scan requires a reachable HEAD commit.');
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeSensitiveValue(value) {
  return value.trim().toLowerCase();
}

function summaryHash(value) {
  const digest = createHash('sha256').update(normalizeSensitiveValue(value)).digest('hex');
  return `sha256:${digest.slice(0, 16)}`;
}

function collectMatches(pattern, content) {
  pattern.lastIndex = 0;
  return [...content.matchAll(pattern)];
}

function isLikelyText(buffer) {
  if (buffer.includes(0)) return false;
  try {
    utf8Decoder.decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function normalizeDomain(domain) {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

function isReservedTestDomain(domain) {
  const value = normalizeDomain(domain);
  return value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.test') ||
    value.endsWith('.invalid') ||
    value.endsWith('.example');
}

function isAllowedDomain(domain, allowlist) {
  const value = normalizeDomain(domain);
  if (isReservedTestDomain(value)) return true;
  if ([...allowlist.allowedDomains].some(
    (domain) => value === domain ||
      (['example.com', 'example.net', 'example.org'].includes(domain) && value.endsWith(`.${domain}`)),
  )) return true;
  return [...allowlist.allowedDomainBases].some(
    (base) => value === base || value.endsWith(`.${base}`),
  );
}

function isAllowedEmail(email, allowlist) {
  const normalized = normalizeSensitiveValue(email);
  const separator = normalized.lastIndexOf('@');
  if (separator < 0) return false;
  const domain = normalized.slice(separator + 1);
  return allowlist.allowedEmailDomains.has(domain) || isReservedTestDomain(domain);
}

function makeHitKey({ path: relativePath, rule, summaryHash: hash }) {
  return `${relativePath}\u0000${rule}\u0000${hash}`;
}

async function loadAllowlist(root, allowlistPath = DEFAULT_ALLOWLIST_PATH) {
  const absolutePath = path.resolve(root, allowlistPath);
  const document = JSON.parse(await readFile(absolutePath, 'utf8'));
  if (document.schemaVersion !== 1) {
    throw new Error(`Unsupported public text allowlist schemaVersion: ${document.schemaVersion}`);
  }

  const allowedDomains = new Set(
    (document.allowedDomains ?? []).map((entry) => normalizeDomain(entry.domain)),
  );
  const allowedDomainBases = new Set(
    (document.allowedDomainBases ?? []).map((entry) => normalizeDomain(entry.domain)),
  );
  const allowedEmailDomains = new Set(
    (document.allowedEmailDomains ?? []).map((entry) => normalizeDomain(entry.domain)),
  );
  const pathRuleHashes = new Set(
    (document.pathRuleHashes ?? []).map((entry) => makeHitKey(entry)),
  );

  return {
    allowedDomains,
    allowedDomainBases,
    allowedEmailDomains,
    pathRuleHashes,
  };
}

function addCandidate(candidates, { line, path: relativePath, rule, value }) {
  if (!value) return;
  candidates.push({
    line,
    path: relativePath,
    rule,
    summaryHash: summaryHash(value),
    value,
  });
}

function rangeOverlaps(range, ranges) {
  return ranges.some((candidate) => range.start < candidate.end && range.end > candidate.start);
}

function looksLikePhone(value) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return false;
  return /[+().\s-]/.test(trimmed);
}

function scanText({ content, relativePath }) {
  const candidates = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const emailRanges = [];

    for (const pattern of clientTermRules) {
      for (const match of collectMatches(pattern, line)) {
        addCandidate(candidates, {
          line: lineNumber,
          path: relativePath,
          rule: 'CLIENT_TERM',
          value: match[0],
        });
      }
    }

    for (const match of collectMatches(emailPattern, line)) {
      const value = match[0];
      emailRanges.push({ start: match.index, end: match.index + value.length });
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'EMAIL_ADDRESS',
        value,
      });
    }

    for (const match of collectMatches(urlHostPattern, line)) {
      const value = match[1];
      const hostStart = match.index + match[0].indexOf(value);
      if (rangeOverlaps({ start: hostStart, end: hostStart + value.length }, emailRanges)) continue;
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'REAL_DOMAIN',
        value,
      });
    }

    for (const match of collectMatches(bareDomainPattern, line)) {
      const value = match[0];
      if (rangeOverlaps({ start: match.index, end: match.index + value.length }, emailRanges)) continue;
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'REAL_DOMAIN',
        value,
      });
    }

    for (const match of collectMatches(myShopifyPattern, line)) {
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'STORE_IDENTIFIER',
        value: match[0],
      });
    }

    for (const match of collectMatches(shopifyAdminPattern, line)) {
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'STORE_IDENTIFIER',
        value: match[0],
      });
    }

    for (const match of collectMatches(shopifyGidPattern, line)) {
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'ORDER_SHAPED_DATA',
        value: match[0],
      });
    }

    for (const match of collectMatches(orderLiteralPattern, line)) {
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'ORDER_SHAPED_DATA',
        value: match[1],
      });
    }

    for (const pattern of [windowsAbsolutePathPattern, uncPathPattern, unixPrivatePathPattern]) {
      for (const match of collectMatches(pattern, line)) {
        addCandidate(candidates, {
          line: lineNumber,
          path: relativePath,
          rule: 'INTERNAL_ABSOLUTE_PATH',
          value: match[0],
        });
      }
    }

    for (const match of collectMatches(privateIpv4Pattern, line)) {
      addCandidate(candidates, {
        line: lineNumber,
        path: relativePath,
        rule: 'PRIVATE_NETWORK_ADDRESS',
        value: match[0],
      });
    }

    if (path.extname(relativePath).toLowerCase() !== '.svg') {
      for (const match of collectMatches(phoneCandidatePattern, line)) {
        if (!looksLikePhone(match[0])) continue;
        addCandidate(candidates, {
          line: lineNumber,
          path: relativePath,
          rule: 'PHONE_NUMBER',
          value: match[0],
        });
      }
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.path}\u0000${candidate.line}\u0000${candidate.rule}\u0000${candidate.summaryHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function partitionFindings(candidates, allowlist) {
  const findings = [];
  let allowlistedHitCount = 0;

  for (const candidate of candidates) {
    let allowed = false;
    if (candidate.rule === 'EMAIL_ADDRESS') {
      allowed = isAllowedEmail(candidate.value, allowlist);
    } else if (candidate.rule === 'REAL_DOMAIN') {
      allowed = isAllowedDomain(candidate.value, allowlist);
    } else if (
      candidate.rule === 'STORE_IDENTIFIER' &&
      candidate.value.endsWith(['.myshopify', '.com'].join(''))
    ) {
      allowed = isAllowedDomain(candidate.value, allowlist);
    }

    if (!allowed) {
      allowed = allowlist.pathRuleHashes.has(makeHitKey(candidate));
    }

    if (allowed) {
      allowlistedHitCount += 1;
      continue;
    }

    findings.push({
      path: candidate.path,
      line: candidate.line,
      rule: candidate.rule,
      summaryHash: candidate.summaryHash,
    });
  }

  findings.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.rule.localeCompare(right.rule) ||
    left.summaryHash.localeCompare(right.summaryHash));

  return { allowlistedHitCount, findings };
}

async function scanCurrentTree({ root, allowlist }) {
  const rawPaths = runGit(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    root,
    encoding: 'buffer',
  });
  const relativePaths = rawPaths.toString('utf8').split('\0').filter(Boolean).sort();
  const candidates = [];
  let scannedTextFiles = 0;
  let skippedBinaryFiles = 0;

  for (const gitPath of relativePaths) {
    const relativePath = toPosixPath(gitPath);
    const absolutePath = path.resolve(root, gitPath);
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      continue;
    }
    if (!fileStat.isFile()) continue;

    const buffer = await readFile(absolutePath);
    if (!isLikelyText(buffer)) {
      skippedBinaryFiles += 1;
      continue;
    }

    scannedTextFiles += 1;
    candidates.push(...scanText({ content: utf8Decoder.decode(buffer), relativePath }));
  }

  return {
    allowlist,
    candidatePathCount: relativePaths.length,
    mode: 'current',
    scannedTextFiles,
    skippedBinaryFiles,
    ...partitionFindings(candidates, allowlist),
  };
}

function getReachableObjects(root) {
  const raw = runGit(['rev-list', '--objects', '--all'], { root });
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const objects = lines.map((line) => {
    const separator = line.indexOf(' ');
    return separator < 0
      ? { objectId: line, path: null }
      : { objectId: line.slice(0, separator), path: toPosixPath(line.slice(separator + 1)) };
  });
  const objectIds = objects.map((entry) => entry.objectId);
  const check = spawnSync(
    'git',
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    {
      cwd: root,
      encoding: 'utf8',
      input: `${objectIds.join('\n')}\n`,
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (check.status !== 0) {
    throw new Error(`git cat-file --batch-check failed with status ${check.status}`);
  }

  const metadata = new Map();
  for (const line of check.stdout.split(/\r?\n/).filter(Boolean)) {
    const [objectId, type, size] = line.split(' ');
    metadata.set(objectId, { sizeBytes: Number(size), type });
  }

  return objects.map((entry) => ({ ...entry, ...metadata.get(entry.objectId) }));
}

async function scanReachableHistory({ root, allowlist }) {
  const objects = getReachableObjects(root);
  const blobs = objects.filter((entry) => entry.type === 'blob');
  const candidates = [];
  const largeObjects = [];
  let scannedTextBlobs = 0;
  let skippedBinaryBlobs = 0;
  let skippedOversizeBlobs = 0;

  for (const blob of blobs) {
    const relativePath = blob.path ?? `[unmapped-blob:${blob.objectId.slice(0, 12)}]`;
    if (blob.sizeBytes >= LARGE_OBJECT_THRESHOLD) {
      largeObjects.push({
        blobSha: blob.objectId,
        path: relativePath,
        sizeBytes: blob.sizeBytes,
      });
    }
    if (blob.sizeBytes > MAX_HISTORY_BLOB_BYTES) {
      skippedOversizeBlobs += 1;
      continue;
    }

    const buffer = runGit(['cat-file', 'blob', blob.objectId], {
      root,
      encoding: 'buffer',
      maxBuffer: Math.max(MAX_HISTORY_BLOB_BYTES * 2, blob.sizeBytes + 1024),
    });
    if (!isLikelyText(buffer)) {
      skippedBinaryBlobs += 1;
      continue;
    }

    scannedTextBlobs += 1;
    candidates.push(...scanText({ content: utf8Decoder.decode(buffer), relativePath }));
  }

  const refs = runGit(['for-each-ref', '--format=%(refname)'], { root })
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();

  largeObjects.sort((left, right) => right.sizeBytes - left.sizeBytes || left.path.localeCompare(right.path));

  return {
    allowlist,
    commitCount: Number(runGit(['rev-list', '--count', '--all'], { root }).trim()),
    largeObjects,
    mode: 'history',
    reachableBlobCount: blobs.length,
    refs,
    scannedTextBlobs,
    skippedBinaryBlobs,
    skippedOversizeBlobs,
    ...partitionFindings(candidates, allowlist),
  };
}

function publicReport(result, sourceCommit) {
  const report = {
    schemaVersion: 1,
    scannerVersion: SCANNER_VERSION,
    mode: result.mode,
    sourceCommit,
    generatedAt: new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(result)) {
    if (key === 'allowlist' || key === 'mode') continue;
    report[key] = value;
  }

  return report;
}

async function writeReportFile(root, reportPath, report) {
  const absolutePath = path.resolve(root, reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function parseArguments(argv) {
  const options = {
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    mode: 'current',
    reportPath: null,
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--history') {
      options.mode = 'history';
    } else if (argument === '--current') {
      options.mode = 'current';
    } else if (argument === '--allowlist') {
      options.allowlistPath = argv[index + 1];
      index += 1;
    } else if (argument === '--report') {
      options.reportPath = argv[index + 1];
      index += 1;
    } else if (argument === '--root') {
      options.root = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export async function runPublicTextScan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const mode = options.mode ?? 'current';
  const sourceCommit = resolveSourceCommit({ mode, root });
  const allowlist = await loadAllowlist(root, options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH);
  const result = mode === 'history'
    ? await scanReachableHistory({ root, allowlist })
    : await scanCurrentTree({ root, allowlist });
  const report = publicReport(result, sourceCommit);

  if (options.reportPath) {
    await writeReportFile(root, options.reportPath, report);
  }

  return report;
}

export async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const report = await runPublicTextScan(options);

  if (report.findings.length > 0) {
    console.error(`Public text scan failed: mode=${report.mode}; findings=${report.findings.length}.`);
    for (const finding of report.findings) {
      console.error(
        `- ${finding.path}:${finding.line} rule=${finding.rule} hash=${finding.summaryHash}`,
      );
    }
    process.exitCode = 1;
    return report;
  }

  const scannedCount = report.mode === 'history' ? report.scannedTextBlobs : report.scannedTextFiles;
  console.log(
    `Public text scan OK: mode=${report.mode}; scannedText=${scannedCount}; allowlisted=${report.allowlistedHitCount}; findings=0.`,
  );
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`Public text scan error: ${error.message}`);
    process.exitCode = 1;
  });
}
