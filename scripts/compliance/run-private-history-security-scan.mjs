/**
 * 扫描原始私有 Git 历史，并把脱敏证据写到仓库外目录。
 *
 * 边界：
 * - 只读取当前仓库和 origin；不会 fetch、commit、push 或修改远程。
 * - Gitleaks 与 TruffleHog 的原始 secret 字段只在进程内存中短暂存在；落盘前会移除。
 * - TruffleHog 禁用在线验证，避免把疑似 credential 发送给第三方验证端点。
 * - Evidence 目录必须位于仓库外；临时 origin mirror 在退出时删除。
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const PUBLIC_TEXT_SCANNER = path.join(REPOSITORY_ROOT, 'scripts', 'tests', 'validate-public-text.mjs');
const PUBLIC_TEXT_ALLOWLIST = path.join(REPOSITORY_ROOT, 'docs', 'compliance', 'public-text-allowlist.json');

export const SCAN_CONTRACT = Object.freeze({
  schemaVersion: 1,
  profile: 'original-private-history-v1',
  gitleaksVersion: '8.30.1',
  trufflehogVersion: '3.97.0',
});

function parseArguments(argv) {
  const options = {
    evidenceDirectory: null,
    gitleaksPath: null,
    repositoryRoot: REPOSITORY_ROOT,
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
    } else if (argument === '--trufflehog') {
      options.trufflehogPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--repository-root') {
      options.repositoryRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  for (const [name, value] of [
    ['--evidence-directory', options.evidenceDirectory],
    ['--gitleaks', options.gitleaksPath],
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
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...options.env,
    },
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    windowsHide: true,
  });
}

function runCaptured(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...options.env,
    },
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

async function prepareEvidenceDirectory(repositoryRoot, evidenceDirectory) {
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  const [realRepositoryRoot, realEvidenceDirectory] = await Promise.all([
    realpath(repositoryRoot),
    realpath(evidenceDirectory),
  ]);

  if (isWithin(realRepositoryRoot, realEvidenceDirectory)) {
    throw new Error('Evidence directory must be outside the repository root.');
  }
  if (isWithin(realEvidenceDirectory, realRepositoryRoot)) {
    throw new Error('Evidence directory must not contain the repository root.');
  }

  try {
    await chmod(realEvidenceDirectory, 0o700);
  } catch {
    // Windows ACL 不由 POSIX mode 控制；调用方仍必须把目录放在私有用户边界内。
  }
  return realEvidenceDirectory;
}

function assertToolVersion(binaryPath, args, expectedVersion, toolName) {
  const output = run(binaryPath, args).trim();
  const match = output.match(/\d+\.\d+\.\d+/u);
  if (!match || match[0] !== expectedVersion) {
    throw new Error(`${toolName} version mismatch: expected ${expectedVersion}.`);
  }
  return match[0];
}

function parseRefs(raw) {
  return raw
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [name, objectId = null, objectType = null] = line.split('\0');
      return { name, objectId, objectType };
    });
}

function listLocalRefs(repositoryPath) {
  return parseRefs(run('git', ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(objecttype)'], {
    cwd: repositoryPath,
  }));
}

function listAdvertisedOriginRefs(repositoryRoot) {
  const lines = run('git', ['ls-remote', 'origin'], { cwd: repositoryRoot })
    .split(/\r?\n/u)
    .filter(Boolean);
  return lines
    .map((line) => {
      const [objectId, name] = line.split(/\s+/u);
      return { name, objectId };
    })
    .filter((entry) => entry.name && entry.name !== 'HEAD' && !entry.name.endsWith('^{}'));
}

function countBy(items, keySelector) {
  const counts = new Map();
  for (const item of items) {
    const key = keySelector(item) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sanitizeGitleaksFinding(finding) {
  const secret = typeof finding.Secret === 'string' ? finding.Secret : '';
  return {
    ruleId: String(finding.RuleID ?? 'unknown'),
    file: String(finding.File ?? ''),
    commit: String(finding.Commit ?? ''),
    startLine: Number(finding.StartLine ?? 0),
    endLine: Number(finding.EndLine ?? 0),
    secretFingerprint: secret ? `sha256:${sha256(secret).slice(0, 16)}` : null,
  };
}

function deduplicateFindings(findings, fields) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = fields.map((field) => String(finding[field] ?? '')).join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runGitleaks({ binaryPath, evidenceDirectory, repositoryPath, scope }) {
  const rawReportPath = path.join(evidenceDirectory, `${scope}.gitleaks.raw-redacted.json`);
  const result = runCaptured(binaryPath, [
    'git',
    '--log-opts=--all --full-history',
    '--redact=100',
    '--report-format=json',
    `--report-path=${rawReportPath}`,
    '--exit-code=0',
    '--log-level=error',
    repositoryPath,
  ]);

  if (result.status !== 0) {
    throw new Error(`Gitleaks ${scope} scan failed with status ${result.status}.`);
  }

  const rawFindings = JSON.parse(await readFile(rawReportPath, 'utf8'));
  const findings = rawFindings.map(sanitizeGitleaksFinding);
  await rm(rawReportPath, { force: true });
  const report = {
    schemaVersion: 1,
    tool: 'gitleaks',
    toolVersion: SCAN_CONTRACT.gitleaksVersion,
    scope,
    redactionPercent: 100,
    findingCount: findings.length,
    ruleCounts: countBy(findings, (finding) => finding.ruleId),
    findings,
  };
  const reportPath = path.join(evidenceDirectory, `${scope}.gitleaks.sanitized.json`);
  await writePrivateJson(reportPath, report);
  return { report, reportPath };
}

async function runGitleaksDirectory({ binaryPath, directoryPath, rawReportPath }) {
  const result = runCaptured(binaryPath, [
    'dir',
    '--redact=100',
    '--report-format=json',
    `--report-path=${rawReportPath}`,
    '--exit-code=0',
    '--log-level=error',
    directoryPath,
  ]);
  if (result.status !== 0) {
    throw new Error(`Gitleaks ref snapshot scan failed with status ${result.status}.`);
  }
  const rawFindings = JSON.parse(await readFile(rawReportPath, 'utf8'));
  await rm(rawReportPath, { force: true });
  return rawFindings.map(sanitizeGitleaksFinding);
}

function findGitMetadata(record) {
  return record?.SourceMetadata?.Data?.Git ?? record?.source_metadata?.data?.git ?? {};
}

function findFilesystemMetadata(record) {
  return record?.SourceMetadata?.Data?.Filesystem ??
    record?.source_metadata?.data?.filesystem ??
    {};
}

function sanitizeTruffleHogFinding(record) {
  const git = findGitMetadata(record);
  const filesystem = findFilesystemMetadata(record);
  const rawSecret = record.Raw ?? record.RawV2 ?? record.raw ?? record.raw_v2 ?? '';
  const secretBytes = Buffer.isBuffer(rawSecret)
    ? rawSecret
    : Buffer.from(typeof rawSecret === 'string' ? rawSecret : JSON.stringify(rawSecret));
  return {
    detectorName: String(record.DetectorName ?? record.detector_name ?? 'unknown'),
    decoderName: String(record.DecoderName ?? record.decoder_name ?? 'unknown'),
    verified: Boolean(record.Verified ?? record.verified),
    file: String(git.file ?? git.File ?? filesystem.file ?? filesystem.File ?? ''),
    commit: String(git.commit ?? git.Commit ?? ''),
    line: Number(git.line ?? git.Line ?? 0),
    secretFingerprint: secretBytes.length > 0 ? `sha256:${sha256(secretBytes).slice(0, 16)}` : null,
  };
}

async function runTruffleHogFilesystem({ binaryPath, directoryPath }) {
  const result = runCaptured(binaryPath, [
    'filesystem',
    directoryPath,
    '--json',
    '--no-update',
    '--no-verification',
    '--results=unverified',
    '--filter-unverified',
    '--fail',
    '--fail-on-scan-errors',
    '--concurrency=4',
  ]);
  if (![0, 183].includes(result.status)) {
    throw new Error(`TruffleHog ref snapshot scan failed with status ${result.status}.`);
  }
  return result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => sanitizeTruffleHogFinding(JSON.parse(line)));
}

function localOnlyCommitObjects(repositoryRoot, localRefs) {
  const objectIds = new Set();
  for (const ref of localRefs.filter((entry) => entry.objectType === 'commit')) {
    const result = runCaptured('git', [
      'rev-list',
      ref.objectId,
      '--not',
      '--remotes=origin',
    ], { cwd: repositoryRoot });
    if (result.status !== 0) {
      throw new Error(`Unable to enumerate local-only commits for ${ref.name}.`);
    }
    for (const objectId of result.stdout.split(/\r?\n/u).filter(Boolean)) {
      objectIds.add(objectId);
    }
  }
  return objectIds;
}

async function scanAdditionalLocalRefSnapshots({
  evidenceDirectory,
  gitleaksPath,
  localRefs,
  repositoryRoot,
  trufflehogPath,
}) {
  const snapshotObjects = localOnlyCommitObjects(repositoryRoot, localRefs);
  for (const ref of localRefs.filter((entry) => entry.objectType !== 'commit')) {
    snapshotObjects.add(ref.objectId);
  }

  const snapshotRoot = path.join(evidenceDirectory, '.local-ref-snapshots');
  const allGitleaksFindings = [];
  const allTruffleHogFindings = [];
  await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
  try {
    let index = 0;
    for (const objectId of [...snapshotObjects].sort()) {
      const snapshotDirectory = path.join(snapshotRoot, `snapshot-${index}`);
      const temporaryIndex = path.join(snapshotRoot, `index-${index}`);
      await mkdir(snapshotDirectory, { recursive: true, mode: 0o700 });
      run('git', ['read-tree', objectId], {
        cwd: repositoryRoot,
        env: { GIT_INDEX_FILE: temporaryIndex },
      });
      const gitPrefix = `${snapshotDirectory.replaceAll('\\', '/')}/`;
      run('git', ['checkout-index', '--all', '--force', `--prefix=${gitPrefix}`], {
        cwd: repositoryRoot,
        env: { GIT_INDEX_FILE: temporaryIndex },
      });
      allGitleaksFindings.push(...await runGitleaksDirectory({
        binaryPath: gitleaksPath,
        directoryPath: snapshotDirectory,
        rawReportPath: path.join(snapshotRoot, `gitleaks-${index}.raw-redacted.json`),
      }));
      allTruffleHogFindings.push(...await runTruffleHogFilesystem({
        binaryPath: trufflehogPath,
        directoryPath: snapshotDirectory,
      }));
      index += 1;
    }
  } finally {
    await rm(snapshotRoot, { force: true, recursive: true });
  }

  const gitleaksFindings = deduplicateFindings(
    allGitleaksFindings,
    ['ruleId', 'file', 'secretFingerprint'],
  );
  const trufflehogFindings = deduplicateFindings(
    allTruffleHogFindings,
    ['detectorName', 'file', 'secretFingerprint'],
  );
  const gitleaksReportPath = path.join(
    evidenceDirectory,
    'local-additional-refs.gitleaks.sanitized.json',
  );
  const trufflehogReportPath = path.join(
    evidenceDirectory,
    'local-additional-refs.trufflehog.sanitized.json',
  );
  await writePrivateJson(gitleaksReportPath, {
    schemaVersion: 1,
    tool: 'gitleaks',
    toolVersion: SCAN_CONTRACT.gitleaksVersion,
    scope: 'local-additional-refs',
    snapshotObjectCount: snapshotObjects.size,
    findingCount: gitleaksFindings.length,
    ruleCounts: countBy(gitleaksFindings, (finding) => finding.ruleId),
    findings: gitleaksFindings,
  });
  await writePrivateJson(trufflehogReportPath, {
    schemaVersion: 1,
    tool: 'trufflehog',
    toolVersion: SCAN_CONTRACT.trufflehogVersion,
    scope: 'local-additional-refs',
    verificationMode: 'disabled',
    snapshotObjectCount: snapshotObjects.size,
    findingCount: trufflehogFindings.length,
    detectorCounts: countBy(trufflehogFindings, (finding) => finding.detectorName),
    findings: trufflehogFindings,
  });

  return {
    snapshotObjectCount: snapshotObjects.size,
    gitleaksFindingCount: gitleaksFindings.length,
    gitleaksRuleCounts: countBy(gitleaksFindings, (finding) => finding.ruleId),
    trufflehogFindingCount: trufflehogFindings.length,
    trufflehogDetectorCounts: countBy(trufflehogFindings, (finding) => finding.detectorName),
    privateReportDigests: {
      [path.basename(gitleaksReportPath)]: await sha256File(gitleaksReportPath),
      [path.basename(trufflehogReportPath)]: await sha256File(trufflehogReportPath),
    },
  };
}

async function runTruffleHog({ binaryPath, evidenceDirectory, gitUri, scope }) {
  const result = runCaptured(binaryPath, [
    'git',
    gitUri,
    '--json',
    '--no-update',
    '--no-verification',
    '--results=unverified',
    '--filter-unverified',
    '--fail',
    '--fail-on-scan-errors',
    '--concurrency=4',
  ]);

  if (![0, 183].includes(result.status)) {
    throw new Error(`TruffleHog ${scope} scan failed with status ${result.status}.`);
  }

  const findings = result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => sanitizeTruffleHogFinding(JSON.parse(line)));
  const report = {
    schemaVersion: 1,
    tool: 'trufflehog',
    toolVersion: SCAN_CONTRACT.trufflehogVersion,
    scope,
    verificationMode: 'disabled',
    resultClasses: ['unverified'],
    findingCount: findings.length,
    detectorCounts: countBy(findings, (finding) => finding.detectorName),
    findings,
  };
  const reportPath = path.join(evidenceDirectory, `${scope}.trufflehog.sanitized.json`);
  await writePrivateJson(reportPath, report);

  const diagnosticPath = path.join(evidenceDirectory, `${scope}.trufflehog.diagnostics.txt`);
  await writePrivateFile(
    diagnosticPath,
    'Diagnostics intentionally omitted to prevent accidental sensitive-value persistence.\n',
  );
  return { report, reportPath };
}

async function runPublicTextHistoryScan({ evidenceDirectory, repositoryPath, scope }) {
  const reportPath = path.join(evidenceDirectory, `${scope}.public-text-history.json`);
  const result = runCaptured(process.execPath, [
    PUBLIC_TEXT_SCANNER,
    '--history',
    '--root',
    repositoryPath,
    '--allowlist',
    PUBLIC_TEXT_ALLOWLIST,
    '--report',
    reportPath,
  ], { cwd: REPOSITORY_ROOT });

  if (![0, 1].includes(result.status)) {
    throw new Error(`Public text ${scope} scan failed with status ${result.status}.`);
  }
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  return { report, reportPath };
}

async function writePrivateFile(filePath, content) {
  await writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
  try {
    await chmod(filePath, 0o600);
  } catch {
    // 见 prepareEvidenceDirectory 中的 Windows ACL 说明。
  }
}

async function writePrivateJson(filePath, value) {
  await writePrivateFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function summarizeScope(scope, refCount, results) {
  const largeObjects = results.publicText.report.largeObjects ?? [];
  const privateReportPaths = [
    results.gitleaks.reportPath,
    results.trufflehog.reportPath,
    results.publicText.reportPath,
  ];
  const reportDigests = {};
  for (const reportPath of privateReportPaths) {
    reportDigests[path.basename(reportPath)] = await sha256File(reportPath);
  }

  return {
    refCount,
    commitCount: results.publicText.report.commitCount,
    reachableBlobCount: results.publicText.report.reachableBlobCount,
    gitleaksFindingCount: results.gitleaks.report.findingCount,
    gitleaksRuleCounts: results.gitleaks.report.ruleCounts,
    trufflehogFindingCount: results.trufflehog.report.findingCount,
    trufflehogDetectorCounts: results.trufflehog.report.detectorCounts,
    publicTextFindingCount: results.publicText.report.findings.length,
    publicTextRuleCounts: countBy(results.publicText.report.findings, (finding) => finding.rule),
    largeObjectCount: largeObjects.length,
    maximumLargeObjectBytes: largeObjects.reduce(
      (maximum, entry) => Math.max(maximum, Number(entry.sizeBytes ?? 0)),
      0,
    ),
    privateReportDigests: reportDigests,
    scope,
  };
}

async function scanScope({
  evidenceDirectory,
  gitleaksPath,
  repositoryPath,
  scope,
  trufflehogGitUri,
  trufflehogPath,
}) {
  const [gitleaks, trufflehog, publicText] = await Promise.all([
    runGitleaks({
      binaryPath: gitleaksPath,
      evidenceDirectory,
      repositoryPath,
      scope,
    }),
    runTruffleHog({
      binaryPath: trufflehogPath,
      evidenceDirectory,
      gitUri: trufflehogGitUri,
      scope,
    }),
    runPublicTextHistoryScan({ evidenceDirectory, repositoryPath, scope }),
  ]);
  return { gitleaks, publicText, trufflehog };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = await realpath(options.repositoryRoot);
  const evidenceDirectory = await prepareEvidenceDirectory(
    repositoryRoot,
    options.evidenceDirectory,
  );
  const mirrorPath = path.join(evidenceDirectory, '.origin-mirror.git');

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
  const toolEvidence = {
    gitleaks: {
      version: gitleaksVersion,
      binarySha256: await sha256File(options.gitleaksPath),
    },
    trufflehog: {
      version: trufflehogVersion,
      binarySha256: await sha256File(options.trufflehogPath),
      verificationMode: 'disabled',
    },
  };

  const sourceCommit = run('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }).trim();
  const localRefs = listLocalRefs(repositoryRoot);
  const advertisedOriginRefs = listAdvertisedOriginRefs(repositoryRoot);
  const originUrl = run('git', ['remote', 'get-url', 'origin'], { cwd: repositoryRoot }).trim();
  const originUrlFingerprint = `sha256:${sha256(originUrl).slice(0, 16)}`;

  let originRefs = [];
  try {
    run('git', ['clone', '--mirror', '--no-hardlinks', originUrl, mirrorPath], {
      cwd: evidenceDirectory,
    });
    originRefs = listLocalRefs(mirrorPath);
    const mirroredTips = new Set(originRefs.map((entry) => `${entry.name}\0${entry.objectId}`));
    const missingOriginRefs = advertisedOriginRefs.filter(
      (entry) => !mirroredTips.has(`${entry.name}\0${entry.objectId}`),
    );
    if (missingOriginRefs.length > 0) {
      throw new Error('Origin mirror does not cover every advertised origin ref.');
    }

    console.log('Scanning local refs with Gitleaks, TruffleHog, and the PII/IP ruleset...');
    const localResults = await scanScope({
      evidenceDirectory,
      gitleaksPath: options.gitleaksPath,
      repositoryPath: repositoryRoot,
      scope: 'local',
      trufflehogGitUri: originUrl,
      trufflehogPath: options.trufflehogPath,
    });
    console.log('Scanning advertised origin refs from a temporary read-only mirror...');
    const originResults = await scanScope({
      evidenceDirectory,
      gitleaksPath: options.gitleaksPath,
      repositoryPath: mirrorPath,
      scope: 'origin',
      trufflehogGitUri: originUrl,
      trufflehogPath: options.trufflehogPath,
    });
    console.log('Scanning local-only commit snapshots and non-commit refs...');
    const localAdditionalRefs = await scanAdditionalLocalRefSnapshots({
      evidenceDirectory,
      gitleaksPath: options.gitleaksPath,
      localRefs,
      repositoryRoot,
      trufflehogPath: options.trufflehogPath,
    });

    const [localSummary, originSummary] = await Promise.all([
      summarizeScope('local', localRefs.length, localResults),
      summarizeScope('origin', originRefs.length, originResults),
    ]);
    const blocked = [localSummary, originSummary].some(
      (scope) => scope.gitleaksFindingCount > 0 ||
        scope.trufflehogFindingCount > 0 ||
        scope.publicTextFindingCount > 0,
    ) || localAdditionalRefs.gitleaksFindingCount > 0 ||
      localAdditionalRefs.trufflehogFindingCount > 0;
    const publicSummary = {
      schemaVersion: SCAN_CONTRACT.schemaVersion,
      scanProfile: SCAN_CONTRACT.profile,
      generatedAt: new Date().toISOString(),
      sourceCommit,
      originalHistoryPublicationAssessment: blocked ? 'blocked' : 'clear',
      reason: blocked
        ? 'Original private history contains findings and must not become public.'
        : 'No scanner findings were detected in the original private history.',
      remoteMode: 'read-only',
      remoteWritesPerformed: false,
      originUrlFingerprint,
      advertisedOriginRefCount: advertisedOriginRefs.length,
      advertisedOriginRefsCovered: true,
      rawSecretValuesPersisted: false,
      rawScannerReportsPersisted: false,
      tools: toolEvidence,
      scopes: {
        local: localSummary,
        localAdditionalRefs,
        origin: originSummary,
      },
    };
    const publicSummaryPath = path.join(evidenceDirectory, 'history-security-scan-summary.public.json');
    await writePrivateJson(publicSummaryPath, publicSummary);

    console.log(`History scan complete: assessment=${publicSummary.originalHistoryPublicationAssessment}.`);
    console.log('Sensitive values were not printed or persisted; see the external evidence directory.');
  } finally {
    await rm(mirrorPath, { force: true, recursive: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Private history security scan failed: ${error.message}`);
    process.exitCode = 1;
  });
}
