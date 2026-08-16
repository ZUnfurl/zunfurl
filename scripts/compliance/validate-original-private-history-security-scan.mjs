/**
 * 验证 Phase 6 原始私有历史公开摘要的结构、脱敏边界和阻断结论。
 *
 * 本脚本不会读取仓库外私有证据，也不会尝试复原命中值。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const SUMMARY_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'compliance',
  'original-private-history-security-scan.json',
);
const FORBIDDEN_KEYS = new Set([
  'author',
  'email',
  'match',
  'raw',
  'rawv2',
  'remoteurl',
  'repositoryurl',
  'runid',
  'secret',
  'token',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertInteger(value, name) {
  assert(Number.isInteger(value) && value >= 0, `${name} must be a non-negative integer.`);
}

function walk(value, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, [...pathParts, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assert(!FORBIDDEN_KEYS.has(key.toLowerCase()), `Forbidden key in public summary: ${[...pathParts, key].join('.')}`);
    walk(entry, [...pathParts, key]);
  }
}

async function main() {
  const summary = JSON.parse(await readFile(SUMMARY_PATH, 'utf8'));
  walk(summary);

  assert(summary.schemaVersion === 1, 'Unexpected summary schemaVersion.');
  assert(summary.scope.remoteMode === 'read-only', 'Remote mode must remain read-only.');
  assert(summary.scope.remoteWritesPerformed === false, 'Remote writes must be false.');
  assert(summary.scope.advertisedOriginRefsCovered === true, 'Every advertised origin ref must be covered.');
  assert(summary.tools.gitleaks.version === '8.30.1', 'Unexpected Gitleaks version.');
  assert(summary.tools.trufflehog.version === '3.97.0', 'Unexpected TruffleHog version.');
  assert(summary.tools.trufflehog.verificationMode === 'disabled', 'TruffleHog verification must remain disabled.');
  assert(summary.tools.gitleaks.archiveChecksumVerified === true, 'Gitleaks archive checksum evidence is missing.');
  assert(summary.tools.trufflehog.archiveChecksumVerified === true, 'TruffleHog archive checksum evidence is missing.');
  assert(/^[a-f0-9]{64}$/u.test(summary.tools.gitleaks.binarySha256), 'Invalid Gitleaks binary SHA-256.');
  assert(/^[a-f0-9]{64}$/u.test(summary.tools.trufflehog.binarySha256), 'Invalid TruffleHog binary SHA-256.');

  for (const [scopeName, scope] of Object.entries({
    local: summary.results.originalHistory.local,
    origin: summary.results.originalHistory.origin,
    oldActionsLogs: summary.results.oldActionsLogs,
  })) {
    assertInteger(scope.gitleaksFindingCount, `${scopeName}.gitleaksFindingCount`);
    assertInteger(scope.trufflehogFindingCount, `${scopeName}.trufflehogFindingCount`);
    assertInteger(scope.publicTextFindingCount, `${scopeName}.publicTextFindingCount`);
  }
  assert(summary.results.originalHistory.assessment === 'blocked', 'Original history must remain blocked.');
  assert(summary.results.oldActionsLogs.assessment === 'blocked', 'Old Actions logs must remain blocked.');
  assert(summary.results.originalHistory.local.publicTextFindingCount > 0, 'Local history blocker evidence is missing.');
  assert(summary.results.originalHistory.origin.publicTextFindingCount > 0, 'Origin history blocker evidence is missing.');
  assert(summary.results.oldActionsLogs.publicTextFindingCount > 0, 'Actions log blocker evidence is missing.');
  assert(summary.publicationDecision.originalHistoryAllowed === false, 'Original history must not be allowed.');
  assert(summary.publicationDecision.oldActionsLogsAllowed === false, 'Old Actions logs must not be allowed.');
  assert(summary.privacy.rawSecretValuesPersisted === false, 'Raw secret values must not be persisted.');
  assert(summary.privacy.rawScannerReportsPersisted === false, 'Raw scanner reports must not be persisted.');
  assert(summary.privacy.publicSummaryContainsRunIdentifiers === false, 'Run identifiers must not be public.');
  assert(summary.privacy.publicSummaryContainsOriginUrl === false, 'Origin URL must not be public.');
  assert(summary.privacy.privateEvidenceStoredOutsideRepository === true, 'Private evidence must remain outside the repository.');

  const serialized = JSON.stringify(summary);
  assert(!/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+/iu.test(serialized), 'Public summary contains a repository URL.');
  assert(!/actions\/runs\/\d+/iu.test(serialized), 'Public summary contains an Actions run identifier.');
  console.log('Original private history security summary OK: blocked history and logs remain fail-closed.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Original private history security summary failed: ${error.message}`);
    process.exitCode = 1;
  });
}
