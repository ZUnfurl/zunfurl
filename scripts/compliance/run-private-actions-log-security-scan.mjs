/**
 * 扫描仓库外的 GitHub Actions 日志归档。
 *
 * 输入目录和 Evidence 目录都必须位于仓库外。工具输出会在落盘前移除
 * Secret、Raw、Match、邮箱和远程 URL 等字段；公开摘要只保留计数与哈希。
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertGitleaksConfig,
  buildGitleaksArguments,
  SCAN_CONTRACT,
  verifyGitleaksPolicySemantics,
} from './run-private-history-security-scan.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const PUBLIC_TEXT_SCANNER = path.join(REPOSITORY_ROOT, 'scripts', 'tests', 'validate-public-text.mjs');
const PUBLIC_TEXT_ALLOWLIST = path.join(REPOSITORY_ROOT, 'docs', 'compliance', 'public-text-allowlist.json');

function parseArguments(argv) {
  const options = {
    evidenceDirectory: null,
    gitleaksPath: null,
    logDirectory: null,
    trufflehogPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--evidence-directory') {
      options.evidenceDirectory = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--gitleaks') {
      options.gitleaksPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--log-directory') {
      options.logDirectory = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--trufflehog') {
      options.trufflehogPath = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  for (const [name, value] of [
    ['--evidence-directory', options.evidenceDirectory],
    ['--gitleaks', options.gitleaksPath],
    ['--log-directory', options.logDirectory],
    ['--trufflehog', options.trufflehogPath],
  ]) {
    if (!value) throw new Error(`${name} is required.`);
  }
  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env },
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    windowsHide: true,
  });
}

function runCaptured(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env },
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    windowsHide: true,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

function isWithin(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertExternalDirectory(directoryPath, label) {
  const [repositoryRoot, candidate] = await Promise.all([
    realpath(REPOSITORY_ROOT),
    realpath(directoryPath),
  ]);
  if (isWithin(repositoryRoot, candidate) || isWithin(candidate, repositoryRoot)) {
    throw new Error(`${label} must be outside the repository root.`);
  }
  return candidate;
}

function assertToolVersion(binaryPath, args, expectedVersion, toolName) {
  const output = run(binaryPath, args).trim();
  const match = output.match(/\d+\.\d+\.\d+/u);
  if (!match || match[0] !== expectedVersion) {
    throw new Error(`${toolName} version mismatch: expected ${expectedVersion}.`);
  }
  return match[0];
}

function countBy(items, keySelector) {
  const counts = new Map();
  for (const item of items) {
    const key = keySelector(item) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function sanitizeGitleaksFinding(finding) {
  const secret = typeof finding.Secret === 'string' ? finding.Secret : '';
  return {
    ruleId: String(finding.RuleID ?? 'unknown'),
    file: String(finding.File ?? ''),
    startLine: Number(finding.StartLine ?? 0),
    endLine: Number(finding.EndLine ?? 0),
    secretFingerprint: secret ? `sha256:${sha256(secret).slice(0, 16)}` : null,
  };
}

function sanitizeTruffleHogFinding(record) {
  const filesystem = record?.SourceMetadata?.Data?.Filesystem ?? {};
  const rawSecret = record.Raw ?? record.RawV2 ?? '';
  const secretBytes = Buffer.isBuffer(rawSecret)
    ? rawSecret
    : Buffer.from(typeof rawSecret === 'string' ? rawSecret : JSON.stringify(rawSecret));
  return {
    detectorName: String(record.DetectorName ?? 'unknown'),
    decoderName: String(record.DecoderName ?? 'unknown'),
    verified: Boolean(record.Verified),
    file: String(filesystem.file ?? filesystem.File ?? ''),
    secretFingerprint: secretBytes.length > 0 ? `sha256:${sha256(secretBytes).slice(0, 16)}` : null,
  };
}

async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const metadata = await stat(absolutePath);
        files.push({
          absolutePath,
          relativePath: path.relative(root, absolutePath).split(path.sep).join('/'),
          sizeBytes: metadata.size,
        });
      }
    }
  }
  await walk(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await mkdir(options.evidenceDirectory, { recursive: true, mode: 0o700 });
  const [evidenceDirectory, logDirectory] = await Promise.all([
    assertExternalDirectory(options.evidenceDirectory, 'Evidence directory'),
    assertExternalDirectory(options.logDirectory, 'Actions log directory'),
  ]);
  const gitleaksConfigPath = await assertGitleaksConfig(REPOSITORY_ROOT);
  if (isWithin(logDirectory, evidenceDirectory) || isWithin(evidenceDirectory, logDirectory)) {
    throw new Error('Actions log directory and Evidence directory must be separate.');
  }

  const gitleaksVersion = assertToolVersion(
    options.gitleaksPath,
    ['version'],
    SCAN_CONTRACT.gitleaksVersion,
    'Gitleaks',
  );
  const trufflehogVersion = assertToolVersion(
    options.trufflehogPath,
    ['--version'],
    SCAN_CONTRACT.trufflehogVersion,
    'TruffleHog',
  );
  await verifyGitleaksPolicySemantics({
    binaryPath: options.gitleaksPath,
    configPath: gitleaksConfigPath,
    evidenceDirectory,
  });

  const rawGitleaksPath = path.join(evidenceDirectory, '.gitleaks.raw-redacted.json');
  const gitleaksResult = runCaptured(options.gitleaksPath, buildGitleaksArguments({
    configPath: gitleaksConfigPath,
    mode: 'dir',
    rawReportPath: rawGitleaksPath,
    targetPath: '.',
  }), { cwd: logDirectory });
  if (gitleaksResult.status !== 0) {
    throw new Error(`Gitleaks Actions log scan failed with status ${gitleaksResult.status}.`);
  }
  const gitleaksFindings = JSON.parse(await readFile(rawGitleaksPath, 'utf8'))
    .map(sanitizeGitleaksFinding);
  await rm(rawGitleaksPath, { force: true });
  const gitleaksReportPath = path.join(evidenceDirectory, 'actions-logs.gitleaks.sanitized.json');
  await writeJson(gitleaksReportPath, {
    schemaVersion: 1,
    tool: 'gitleaks',
    toolVersion: gitleaksVersion,
    findingCount: gitleaksFindings.length,
    ruleCounts: countBy(gitleaksFindings, (finding) => finding.ruleId),
    findings: gitleaksFindings,
  });

  const trufflehogResult = runCaptured(options.trufflehogPath, [
    'filesystem',
    logDirectory,
    '--json',
    '--no-update',
    '--no-verification',
    '--results=unverified',
    '--filter-unverified',
    '--fail',
    '--fail-on-scan-errors',
    '--concurrency=4',
  ]);
  if (![0, 183].includes(trufflehogResult.status)) {
    throw new Error(`TruffleHog Actions log scan failed with status ${trufflehogResult.status}.`);
  }
  const trufflehogFindings = trufflehogResult.stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => sanitizeTruffleHogFinding(JSON.parse(line)));
  const trufflehogReportPath = path.join(evidenceDirectory, 'actions-logs.trufflehog.sanitized.json');
  await writeJson(trufflehogReportPath, {
    schemaVersion: 1,
    tool: 'trufflehog',
    toolVersion: trufflehogVersion,
    verificationMode: 'disabled',
    findingCount: trufflehogFindings.length,
    detectorCounts: countBy(trufflehogFindings, (finding) => finding.detectorName),
    findings: trufflehogFindings,
  });

  const publicTextRoot = path.join(evidenceDirectory, '.public-text-worktree');
  const publicTextReportPath = path.join(evidenceDirectory, 'actions-logs.public-text.json');
  await mkdir(publicTextRoot, { recursive: true, mode: 0o700 });
  try {
    await cp(logDirectory, publicTextRoot, { force: true, recursive: true });
    run('git', ['init', '--quiet'], { cwd: publicTextRoot });
    const publicTextResult = runCaptured(process.execPath, [
      PUBLIC_TEXT_SCANNER,
      '--current',
      '--root',
      publicTextRoot,
      '--allowlist',
      PUBLIC_TEXT_ALLOWLIST,
      '--report',
      publicTextReportPath,
    ], { cwd: REPOSITORY_ROOT });
    if (![0, 1].includes(publicTextResult.status)) {
      throw new Error(`Actions log PII/IP scan failed with status ${publicTextResult.status}.`);
    }
  } finally {
    await rm(publicTextRoot, { force: true, recursive: true });
  }
  const publicTextReport = JSON.parse(await readFile(publicTextReportPath, 'utf8'));

  const files = await listFiles(logDirectory);
  const archiveFiles = files.filter((file) => file.relativePath.endsWith('.zip'));
  const archiveDigests = [];
  for (const file of archiveFiles) archiveDigests.push(await sha256File(file.absolutePath));
  archiveDigests.sort();
  const archiveSetSha256 = sha256(archiveDigests.join('\n'));
  const blocked = gitleaksFindings.length > 0 ||
    trufflehogFindings.length > 0 ||
    publicTextReport.findings.length > 0;

  const summary = {
    schemaVersion: 1,
    scanProfile: 'private-actions-log-archives-v1',
    generatedAt: new Date().toISOString(),
    publicationAssessment: blocked ? 'blocked' : 'clear',
    remoteMode: 'read-only-download',
    remoteWritesPerformed: false,
    archiveCount: archiveFiles.length,
    archiveSetSha256,
    scannedFileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    gitleaksFindingCount: gitleaksFindings.length,
    gitleaksRuleCounts: countBy(gitleaksFindings, (finding) => finding.ruleId),
    trufflehogFindingCount: trufflehogFindings.length,
    trufflehogDetectorCounts: countBy(trufflehogFindings, (finding) => finding.detectorName),
    publicTextFindingCount: publicTextReport.findings.length,
    publicTextRuleCounts: countBy(publicTextReport.findings, (finding) => finding.rule),
    rawSecretValuesPersisted: false,
    rawScannerReportsPersisted: false,
    tools: {
      gitleaks: {
        version: gitleaksVersion,
        binarySha256: await sha256File(options.gitleaksPath),
        configurationSha256: await sha256File(gitleaksConfigPath),
        policySemanticsValidated: true,
      },
      trufflehog: {
        version: trufflehogVersion,
        binarySha256: await sha256File(options.trufflehogPath),
        verificationMode: 'disabled',
      },
    },
    privateReportDigests: {
      [path.basename(gitleaksReportPath)]: await sha256File(gitleaksReportPath),
      [path.basename(trufflehogReportPath)]: await sha256File(trufflehogReportPath),
      [path.basename(publicTextReportPath)]: await sha256File(publicTextReportPath),
    },
  };
  await writeJson(path.join(evidenceDirectory, 'actions-log-security-scan-summary.public.json'), summary);
  console.log(`Actions log scan complete: assessment=${summary.publicationAssessment}.`);
  console.log('Sensitive values and run identifiers were not printed or included in the public summary.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Private Actions log scan failed: ${error.message}`);
    process.exitCode = 1;
  });
}
