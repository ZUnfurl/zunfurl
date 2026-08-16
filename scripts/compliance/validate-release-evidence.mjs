/**
 * 验证仓库外的 ZUnfurl public-detached Release evidence JSON。
 *
 * 公共 evidence 只绑定净化 candidate，不暴露私有 source commit。Schema、跨字段
 * Gate 语义、本地候选、真实 tag 签名、GitHub run/job/status、ruleset、tag 与
 * Release asset 任一不可确证时均 fail-closed；人工可证明但 API 不可证明的内容
 * 必须以独立 operator attestation 和私有证据摘要呈现。
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { TextDecoder } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { buildCandidateManifest } from './prepare-public-candidate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemaPath = path.join(root, 'docs', 'compliance', 'release-evidence.schema.json');
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const VERSION = '0.3.0-preview.1';
const TAG = `v${VERSION}`;
const REPOSITORY = 'ZUnfurl/zunfurl';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const CLONE_URL = `${REPOSITORY_URL}.git`;
const API_PREFIX = 'repos/ZUnfurl/zunfurl/';
const GITHUB_API_URL = ['https://api', 'github.com'].join('.');
const SIGNER_PRINCIPAL = ['36223737+mp4102', 'users.noreply.github.com'].join('@');
const SANITIZED_ROOT_OID = 'e50b0cec829cee08397bbc87b7ed483e8ee7afda';

const PREVIEW_CONTEXTS = Object.freeze([
  'Fixture A1 / Node 22.12',
  'Fixture A2 / Node 22.12',
  'Fixture B / Node 22.12',
  'Fixture C / Node 22.12',
  'Node 22.12 primary validation',
  'Node 24 compatibility',
  'Windows / Node 22.12 validation',
]);
const SECRET_CONTEXT = 'TruffleHog verified and unknown results';
const DCO_CONTEXT = 'DCO / Signed-off-by';
const CODEQL_CONTEXT = 'JavaScript and TypeScript analysis';
const DEPENDENCY_CONTEXT = 'Vulnerability and license policy';
const WORKFLOW_PATHS = Object.freeze({
  [DCO_CONTEXT]: '.github/workflows/dco.yml',
  [SECRET_CONTEXT]: '.github/workflows/secret-scan.yml',
  [CODEQL_CONTEXT]: '.github/workflows/codeql.yml',
  [DEPENDENCY_CONTEXT]: '.github/workflows/dependency-review.yml',
});
const G6A_CONTEXTS = Object.freeze([...PREVIEW_CONTEXTS, SECRET_CONTEXT].sort());
const G6B_CONTEXTS = Object.freeze([
  ...G6A_CONTEXTS,
  DCO_CONTEXT,
  CODEQL_CONTEXT,
  DEPENDENCY_CONTEXT,
].sort());

const LIMITATIONS = Object.freeze({
  BACKUP_RESTORE_ROADMAP:
    'Backup and Restore are roadmap only; this release provides no production recovery point.',
  G6B_SAME_MAINTAINER_TEST_IDENTITY:
    'The fork canary uses the same maintainer identity with target-repository admin permission; it verifies fork topology and no-secret workflow boundaries, not an independent external contributor.',
  PREVIEW_STABILITY:
    'This is a 0.x preview; APIs and migration contracts may change before 1.0.',
  RETAIL_NO_TRANSACTION:
    'Retail is a catalog and content foundation only; it has no Cart, Checkout, payment, order, tax, shipping, fulfillment, real-time price, or inventory.',
});

const ATTESTATIONS = Object.freeze({
  G6A_CLEAN_ROOM_NO_PRODUCTION_SECRETS: 'candidate',
  G6B_ANONYMOUS_CLONE_NO_CREDENTIALS: 'head',
  G6B_NO_PRODUCTION_SECRET_EXPOSURE: 'head',
  G6B_TEST_MERGE_OBSERVED_BEFORE_CLOSE: 'merge',
});

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  return value;
}

function requireOwn(object, key, label) {
  requireObject(object, label);
  if (!Object.hasOwn(object, key) || object[key] === null) fail(`${label}.${key} is required and must not be null.`);
  return object[key];
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.includes('\0')) {
    fail(`${label} must be a non-empty exact string.`);
  }
  return value;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) fail(`${label} must be a full lowercase SHA-1.`);
  return value;
}

function requireInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer.`);
  return value;
}

function assertNoNull(value, label) {
  if (value === null) fail(`${label} must not be null.`);
  if (Array.isArray(value)) value.forEach((entry, index) => assertNoNull(entry, `${label}[${index}]`));
  else if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) assertNoNull(entry, `${label}.${key}`);
  }
}

function requireTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail(`${label} must be a canonical UTC timestamp with milliseconds.`);
  }
  return Date.parse(value);
}

function requireGithubUrl(value, label, { exact, pathPattern } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL.`);
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.search || url.hash) {
    fail(`${label} must be a credential-free canonical https://github.com URL.`);
  }
  if (exact && url.href !== exact) fail(`${label} must equal ${exact}.`);
  if (!exact && !url.pathname.startsWith('/ZUnfurl/zunfurl/')) fail(`${label} must stay under ${REPOSITORY}.`);
  if (pathPattern && !pathPattern.test(url.pathname)) fail(`${label} has an unexpected GitHub path.`);
  return url;
}

function requireGithubApiUrl(value, label, exact) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL.`);
  }
  if (url.protocol !== 'https:' || url.origin !== GITHUB_API_URL || url.username || url.password ||
      url.search || url.hash || url.href !== exact) {
    fail(`${label} must equal the credential-free canonical GitHub API URL ${exact}.`);
  }
  return url;
}

function sortedUnique(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array.`);
  if (new Set(values).size !== values.length) fail(`${label} must not contain duplicates.`);
  return [...values].sort();
}

function assertExactSet(values, expected, label) {
  const actual = sortedUnique(values, label);
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} differs: expected ${wanted.join(', ')}; actual ${actual.join(', ')}.`);
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function run(command, args, label, { cwd = root, env = process.env, input, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || (!allowFailure && result.status !== 0)) fail(`${label} failed.`);
  return {
    status: result.status,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error,
  };
}

function git(args, label, options = {}) {
  return run('git', args, label, options);
}

export function assertPhase8AuditResult(result) {
  if (!isPlainObject(result) || result.error || result.status !== 0 ||
      !/^Phase 8 GitHub public security OK: ZUnfurl\/zunfurl; 3 rulesets; 11 GitHub Actions contexts; release Team members=1\.$/m.test(result.stdout)) {
    fail('Final full Phase 8 GitHub security audit did not produce the exact success receipt.');
  }
}

function runFullPhase8SecurityAudit() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = run(npm, ['run', 'audit:phase8:github:security'], 'rerun final full Phase 8 GitHub security audit', {
    allowFailure: true,
  });
  assertPhase8AuditResult(result);
}

function ghJson(endpoint, label) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith(API_PREFIX) || endpoint.includes('..') || /[\r\n]/.test(endpoint)) {
    fail(`${label} endpoint escaped the frozen GitHub repository.`);
  }
  const result = run('gh', [
    'api',
    '--hostname', 'github.com',
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2026-03-10',
    endpoint,
  ], label);
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`${label} returned invalid JSON.`);
  }
}

function ghPaginated(endpoint, label) {
  const entries = [];
  for (let page = 1; page <= 100; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const records = ghJson(`${endpoint}${separator}per_page=100&page=${page}`, `${label} page ${page}`);
    if (!Array.isArray(records) || records.length > 100) fail(`${label} page ${page} cardinality is invalid.`);
    entries.push(...records);
    if (records.length < 100) return entries;
  }
  fail(`${label} pagination did not terminate.`);
}

function ghPaginatedCollection(endpoint, collectionKey, label) {
  const entries = [];
  let totalCount;
  for (let page = 1; page <= 100; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const record = ghJson(`${endpoint}${separator}per_page=100&page=${page}`, `${label} page ${page}`);
    requireObject(record, `${label} page ${page}`);
    const pageTotal = requireOwn(record, 'total_count', `${label} page ${page}`);
    if (!Number.isSafeInteger(pageTotal) || pageTotal < 0) fail(`${label}.total_count must be a non-negative integer.`);
    if (totalCount === undefined) totalCount = pageTotal;
    else if (pageTotal !== totalCount) fail(`${label}.total_count changed during pagination.`);
    const pageEntries = requireOwn(record, collectionKey, `${label} page ${page}`);
    if (!Array.isArray(pageEntries) || pageEntries.length > 100) fail(`${label} page ${page} cardinality is invalid.`);
    entries.push(...pageEntries);
    if (entries.length > totalCount) fail(`${label} returned more entries than total_count.`);
    if (pageEntries.length < 100) {
      if (entries.length !== totalCount) fail(`${label} pagination ended before total_count.`);
      return entries;
    }
  }
  fail(`${label} pagination did not terminate.`);
}

export function validateLatestCheckRunSet(checks, records, expectedSha, label) {
  if (!Array.isArray(checks) || !Array.isArray(records)) fail(`${label} checks and records must be arrays.`);
  const expected = checks.filter((check) => check.sourceKind === 'actions-job');
  const ids = new Set();
  const byName = new Map();
  for (const [index, record] of records.entries()) {
    const recordLabel = `${label}[${index}]`;
    requireObject(record, recordLabel);
    const id = requireInteger(requireOwn(record, 'id', recordLabel), `${recordLabel}.id`);
    if (ids.has(id)) fail(`${label} contains duplicate check-run IDs.`);
    ids.add(id);
    const name = requireString(requireOwn(record, 'name', recordLabel), `${recordLabel}.name`);
    const app = requireOwn(record, 'app', recordLabel);
    if (requireOwn(record, 'head_sha', recordLabel) !== expectedSha ||
        requireOwn(app, 'id', `${recordLabel}.app`) !== 15368 ||
        requireOwn(app, 'slug', `${recordLabel}.app`) !== 'github-actions') {
      fail(`${label} escaped the frozen SHA or GitHub Actions App filter.`);
    }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(record);
  }
  for (const check of expected) {
    const matches = byName.get(check.observedJobName) ?? [];
    if (matches.length !== 1) fail(`${label} must contain exactly one latest ${check.observedJobName} check run.`);
    const latest = matches[0];
    if (requireOwn(latest, 'id', `${label} latest ${check.observedJobName}`) !== check.checkRunId ||
        requireOwn(latest, 'status', `${label} latest ${check.observedJobName}`) !== 'completed' ||
        requireOwn(latest, 'conclusion', `${label} latest ${check.observedJobName}`) !== 'success') {
      fail(`${label} latest ${check.observedJobName} result differs from evidence.`);
    }
  }
}

export function validateLatestAttemptJobSet(checks, jobs, runId, runAttempt, label) {
  if (!Array.isArray(checks) || !Array.isArray(jobs)) fail(`${label} checks and jobs must be arrays.`);
  const expected = checks.filter((check) => check.workflowRunId === runId && check.runAttempt === runAttempt);
  if (expected.length === 0) fail(`${label} has no evidence jobs for the selected run attempt.`);
  const ids = new Set();
  const byName = new Map();
  for (const [index, job] of jobs.entries()) {
    const jobLabel = `${label}[${index}]`;
    requireObject(job, jobLabel);
    const id = requireInteger(requireOwn(job, 'id', jobLabel), `${jobLabel}.id`);
    if (ids.has(id)) fail(`${label} contains duplicate job IDs.`);
    ids.add(id);
    if (requireOwn(job, 'run_id', jobLabel) !== runId) fail(`${label} contains a job from a different workflow run.`);
    const name = requireString(requireOwn(job, 'name', jobLabel), `${jobLabel}.name`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(job);
  }
  for (const check of expected) {
    const matches = byName.get(check.observedJobName) ?? [];
    if (matches.length !== 1 || requireOwn(matches[0], 'id', `${label} latest ${check.observedJobName}`) !== check.jobId) {
      fail(`${label} latest ${check.observedJobName} job differs from evidence.`);
    }
  }
}

export function releaseLookupEndpoint(releaseStage, releaseId) {
  if (releaseStage === 'draft-prepublish') {
    return `${API_PREFIX}releases/${requireInteger(releaseId, 'Release evidence releaseId')}`;
  }
  if (releaseStage === 'published') return `${API_PREFIX}releases/tags/${TAG}`;
  fail('Release evidence stage is not supported.');
}

export function validateReleaseApi(release, evidence, releaseStage) {
  requireObject(release, 'GitHub Release');
  const expectedDraft = releaseStage === 'draft-prepublish';
  if (!expectedDraft && releaseStage !== 'published') fail('Release evidence stage is not supported.');
  const releaseId = evidence.release.releaseId;
  const releaseAssets = requireOwn(release, 'assets', 'GitHub Release');
  const htmlUrl = requireOwn(release, 'html_url', 'GitHub Release');
  if (expectedDraft) {
    requireGithubUrl(htmlUrl, 'draft GitHub Release.html_url', {
      pathPattern: /^\/ZUnfurl\/zunfurl\/releases\/(?:tag|edit)\/[^/]+$/,
    });
  } else {
    requireGithubUrl(htmlUrl, 'published GitHub Release.html_url', { exact: evidence.release.releaseUrl });
  }
  if (!Array.isArray(releaseAssets) ||
      requireOwn(release, 'id', 'GitHub Release') !== releaseId ||
      requireOwn(release, 'url', 'GitHub Release') !== `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/${releaseId}` ||
      requireOwn(release, 'tag_name', 'GitHub Release') !== TAG ||
      requireOwn(release, 'name', 'GitHub Release') !== `ZUnfurl v${VERSION}` ||
      requireOwn(release, 'draft', 'GitHub Release') !== expectedDraft ||
      requireOwn(release, 'prerelease', 'GitHub Release') !== true ||
      requireOwn(release, 'immutable', 'GitHub Release') !== !expectedDraft) {
    fail('Live GitHub Release projection differs from evidence or expected lifecycle stage.');
  }
  return releaseAssets;
}

function validateRemoteAlertGates(evidence) {
  let codeScanningOpenCriticalHigh = 0;
  const codeNumbers = new Set();
  for (const [index, alert] of ghPaginated(`${API_PREFIX}code-scanning/alerts?state=open`, 'open code scanning alerts').entries()) {
    const label = `code scanning alert ${index}`;
    const number = requireInteger(requireOwn(alert, 'number', label), `${label}.number`);
    if (codeNumbers.has(number)) fail('Code scanning alerts contain duplicate numbers.');
    codeNumbers.add(number);
    if (requireOwn(alert, 'state', label) !== 'open') fail(`${label}.state differs from the query.`);
    const rule = requireOwn(alert, 'rule', label);
    const severity = rule.security_severity_level;
    if (severity !== null && !['critical', 'high', 'medium', 'low'].includes(severity)) fail(`${label} severity is unknown.`);
    if (['critical', 'high'].includes(severity)) codeScanningOpenCriticalHigh += 1;
  }
  let dependabotOpenCriticalHigh = 0;
  const dependabotNumbers = new Set();
  for (const [index, alert] of ghPaginated(`${API_PREFIX}dependabot/alerts?state=open`, 'open Dependabot alerts').entries()) {
    const label = `Dependabot alert ${index}`;
    const number = requireInteger(requireOwn(alert, 'number', label), `${label}.number`);
    if (dependabotNumbers.has(number)) fail('Dependabot alerts contain duplicate numbers.');
    dependabotNumbers.add(number);
    if (requireOwn(alert, 'state', label) !== 'open') fail(`${label}.state differs from the query.`);
    const advisory = requireOwn(alert, 'security_advisory', label);
    const severity = requireString(requireOwn(advisory, 'severity', `${label}.security_advisory`), `${label}.security_advisory.severity`);
    if (!['critical', 'high', 'moderate', 'low'].includes(severity)) fail(`${label} severity is unknown.`);
    if (['critical', 'high'].includes(severity)) dependabotOpenCriticalHigh += 1;
  }
  const secretAlerts = ghPaginated(`${API_PREFIX}secret-scanning/alerts?state=open`, 'open secret scanning alerts');
  const counts = { codeScanningOpenCriticalHigh, dependabotOpenCriticalHigh, secretScanningOpen: secretAlerts.length };
  for (const [key, count] of Object.entries(counts)) {
    if (count !== evidence.releaseSummary.githubSecurityAlerts[key]) {
      fail(`Live ${key} count differs from the zero-alert Release evidence Gate.`);
    }
  }
}

function ghBytes(endpoint, label) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith(API_PREFIX) || endpoint.includes('..') || /[\r\n]/.test(endpoint)) {
    fail(`${label} endpoint escaped the frozen GitHub repository.`);
  }
  const result = spawnSync('gh', [
    'api',
    '--hostname', 'github.com',
    '-H', 'Accept: application/octet-stream',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    endpoint,
  ], {
    cwd: root,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail(`${label} failed.`);
  return result.stdout;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertExternalEvidencePath(filePath) {
  const lexical = path.resolve(filePath);
  const realRoot = realpathSync(root);
  if (isWithin(root, lexical)) fail('Release evidence file must be outside the repository.');
  const realFile = realpathSync(lexical);
  if (isWithin(realRoot, realFile)) fail('Release evidence real path must be outside the repository.');
  const stats = statSync(realFile);
  if (!stats.isFile()) fail('Release evidence path must resolve to a regular file.');
  if (stats.size <= 0 || stats.size > MAX_EVIDENCE_BYTES) fail(`Release evidence must be between 1 and ${MAX_EVIDENCE_BYTES} bytes.`);
  return realFile;
}

function loadJson(filePath, label) {
  const bytes = readFileSync(filePath);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} must be valid UTF-8.`);
  }
  if (text.charCodeAt(0) === 0xfeff) fail(`${label} must not contain a UTF-8 BOM.`);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is invalid JSON: ${error.message}`);
  }
}

function buildSchemaValidator() {
  const schema = loadJson(schemaPath, 'Release evidence schema');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  try {
    return ajv.compile(schema);
  } catch (error) {
    fail(`Release evidence schema cannot compile: ${error.message}`);
  }
}

function validateAudit(result, label) {
  if (result.total !== result.critical + result.high + result.moderate + result.low) {
    fail(`${label}.total must equal the severity sum.`);
  }
}

function validateSummary(summary, candidateSha, generatedAt) {
  const environments = new Map(summary.environments.map((entry) => [entry.runner, entry]));
  assertExactSet([...environments.keys()], ['linux-node-22', 'linux-node-24', 'windows-node-22'], 'releaseSummary environment runners');
  const linux22 = environments.get('linux-node-22');
  const linux24 = environments.get('linux-node-24');
  const windows22 = environments.get('windows-node-22');
  if (linux22.osName !== 'Linux' || linux22.nodeVersion !== '22.12.0' ||
      linux24.osName !== 'Linux' || !/^24\./.test(linux24.nodeVersion) ||
      windows22.osName !== 'Windows' || windows22.nodeVersion !== '22.12.0') {
    fail('releaseSummary environments do not match the frozen Linux/Windows Node matrix.');
  }
  validateAudit(summary.npmAudit.full, 'releaseSummary.npmAudit.full');
  validateAudit(summary.npmAudit.production, 'releaseSummary.npmAudit.production');
  const scanners = new Map(summary.scanners.map((entry) => [entry.id, entry]));
  assertExactSet([...scanners.keys()], ['gitleaks', 'trufflehog', 'zunfurl-pii-ip-rules'], 'releaseSummary scanner IDs');
  const expectedVersions = { gitleaks: '8.30.1', trufflehog: '3.97.0', 'zunfurl-pii-ip-rules': '1' };
  for (const [id, version] of Object.entries(expectedVersions)) {
    if (scanners.get(id).version !== version) fail(`${id} version differs from the frozen scanner version.`);
  }
  const checkedAt = requireTimestamp(summary.checkedAt, 'releaseSummary.checkedAt');
  if (checkedAt > generatedAt) fail('releaseSummary.checkedAt follows evidence generation.');
  requireSha(candidateSha, 'candidate commit');
}

function expectedG6aCheck(context, candidateSha) {
  return {
    event: context === SECRET_CONTEXT ? 'push' : 'workflow_dispatch',
    runHeadSha: candidateSha,
    jobCheckSha: candidateSha,
    resultSha: candidateSha,
    sourceKind: 'actions-job',
    observedJobName: context,
    workflowPath: WORKFLOW_PATHS[context] ?? '.github/workflows/preview.yml',
  };
}

function expectedG6bCheck(context, evidence) {
  if (context === DCO_CONTEXT) {
    return {
      event: 'pull_request_target',
      runHeadSha: evidence.gates.g6b.baseSha,
      jobCheckSha: evidence.gates.g6b.baseSha,
      resultSha: evidence.gates.g6b.headSha,
      sourceKind: 'commit-status',
      observedJobName: 'DCO metadata publisher',
      workflowPath: WORKFLOW_PATHS[context],
    };
  }
  return {
    event: 'pull_request',
    runHeadSha: evidence.gates.g6b.headSha,
    jobCheckSha: evidence.gates.g6b.headSha,
    resultSha: evidence.gates.g6b.headSha,
    sourceKind: 'actions-job',
    observedJobName: context,
    workflowPath: WORKFLOW_PATHS[context] ?? '.github/workflows/preview.yml',
  };
}

function validateChecks(checks, expectedContexts, expectedFor, label) {
  assertExactSet(checks.map((entry) => entry.context), expectedContexts, `${label} contexts`);
  if (new Set(checks.map((entry) => entry.jobId)).size !== checks.length) fail(`${label} job IDs must be unique.`);
  for (const [index, check] of checks.entries()) {
    const expected = expectedFor(check.context);
    for (const [key, value] of Object.entries(expected)) {
      if (check[key] !== value) fail(`${label}[${index}].${key} differs from the frozen Gate semantics.`);
    }
    requireGithubUrl(check.detailsUrl, `${label}[${index}].detailsUrl`, {
      exact: `${REPOSITORY_URL}/actions/runs/${check.workflowRunId}/job/${check.jobId}`,
    });
  }
  const workflowIds = new Map();
  const runAttempts = new Map();
  for (const check of checks) {
    if (workflowIds.has(check.workflowPath) && workflowIds.get(check.workflowPath) !== check.workflowId) {
      fail(`${label} uses multiple workflow IDs for ${check.workflowPath}.`);
    }
    workflowIds.set(check.workflowPath, check.workflowId);
    if (runAttempts.has(check.workflowRunId) && runAttempts.get(check.workflowRunId) !== check.runAttempt) {
      fail(`${label} uses multiple attempts for workflow run ${check.workflowRunId}.`);
    }
    runAttempts.set(check.workflowRunId, check.runAttempt);
  }
  if (new Set(workflowIds.values()).size !== workflowIds.size) fail(`${label} reuses a workflow ID across distinct paths.`);
}

/** 严格验证 evidence 模型的跨字段发布语义。 */
export function validateEvidenceModel(evidence, validateSchema = buildSchemaValidator()) {
  assertNoNull(evidence, 'evidence');
  if (!validateSchema(evidence)) {
    const errors = (validateSchema.errors ?? []).map((entry) => `${entry.instancePath || '/'} ${entry.message}`).join('; ');
    fail(`Release evidence schema validation failed: ${errors}.`);
  }

  const candidateSha = evidence.candidate.commitSha;
  if (evidence.candidate.rootCommitSha !== SANITIZED_ROOT_OID) {
    fail('candidate.rootCommitSha differs from the approved sanitized root OID.');
  }
  const generatedAt = requireTimestamp(evidence.release.generatedAt, 'release.generatedAt');
  requireGithubUrl(evidence.release.releaseUrl, 'release.releaseUrl', { exact: `${REPOSITORY_URL}/releases/tag/${TAG}` });
  requireGithubUrl(evidence.release.schemaUrl, 'release.schemaUrl', {
    exact: `${REPOSITORY_URL}/blob/${candidateSha}/docs/compliance/release-evidence.schema.json`,
  });
  requireGithubUrl(evidence.repository.webUrl, 'repository.webUrl', { exact: `${REPOSITORY_URL}/` });
  requireGithubUrl(evidence.repository.anonymousCloneUrl, 'repository.anonymousCloneUrl', { exact: CLONE_URL });
  validateSummary(evidence.releaseSummary, candidateSha, generatedAt);

  const g6aStarted = requireTimestamp(evidence.gates.g6a.startedAt, 'gates.g6a.startedAt');
  const g6aCompleted = requireTimestamp(evidence.gates.g6a.completedAt, 'gates.g6a.completedAt');
  const phase8Completed = requireTimestamp(evidence.gates.phase8Security.completedAt, 'gates.phase8Security.completedAt');
  const g6bStarted = requireTimestamp(evidence.gates.g6b.startedAt, 'gates.g6b.startedAt');
  const g6bCompleted = requireTimestamp(evidence.gates.g6b.completedAt, 'gates.g6b.completedAt');
  const g6bClosedAt = requireTimestamp(evidence.gates.g6b.closedAt, 'gates.g6b.closedAt');
  const signedAt = requireTimestamp(evidence.tagSignature.signedAt, 'tagSignature.signedAt');
  const githubVerifiedAt = requireTimestamp(evidence.tagSignature.githubVerification.verifiedAt, 'tagSignature.githubVerification.verifiedAt');
  if (!(g6aStarted <= g6aCompleted && g6aCompleted <= phase8Completed &&
        phase8Completed <= g6bStarted && g6bStarted <= g6bCompleted &&
        g6bCompleted === g6bClosedAt && g6bClosedAt <= signedAt && signedAt <= githubVerifiedAt && githubVerifiedAt <= generatedAt)) {
    fail('Gate, signature, and evidence timestamps are out of release order.');
  }

  if (evidence.gates.g6a.candidateCommitSha !== candidateSha ||
      evidence.gates.phase8Security.candidateCommitSha !== candidateSha ||
      evidence.gates.g6b.baseSha !== candidateSha ||
      evidence.tagSignature.targetCommitSha !== candidateSha) {
    fail('G6a, G6b base, Phase 8, and tag target must equal candidate.commitSha.');
  }
  const { headSha, testMergeSha } = evidence.gates.g6b;
  if (new Set([candidateSha, headSha, testMergeSha]).size !== 3) {
    fail('G6b baseSha, headSha, and testMergeSha must be three distinct commits.');
  }
  const forkCanary = evidence.gates.g6b.forkCanary;
  const forkOwner = forkCanary.repositoryNameWithOwner.split('/')[0];
  if (forkCanary.actorLogin !== 'mp4102' ||
      forkOwner.toLowerCase() !== forkCanary.actorLogin.toLowerCase() ||
      forkCanary.repositoryNameWithOwner.toLowerCase() === REPOSITORY.toLowerCase() ||
      forkCanary.repositoryId === evidence.repository.id) {
    fail('G6b forkCanary must identify the disclosed same-maintainer personal fork and a distinct repository.');
  }
  validateChecks(evidence.gates.g6a.checks, G6A_CONTEXTS, (context) => expectedG6aCheck(context, candidateSha), 'gates.g6a.checks');
  validateChecks(evidence.gates.g6b.checks, G6B_CONTEXTS, (context) => expectedG6bCheck(context, evidence), 'gates.g6b.checks');
  requireGithubUrl(evidence.gates.g6a.evidenceUrl, 'gates.g6a.evidenceUrl', {
    pathPattern: /^\/ZUnfurl\/zunfurl\/actions\/runs\/\d+$/,
  });
  requireGithubUrl(evidence.gates.phase8Security.evidenceUrl, 'gates.phase8Security.evidenceUrl', {
    pathPattern: /^\/ZUnfurl\/zunfurl\/(?:actions\/runs\/\d+|pull\/\d+)$/,
  });
  requireGithubUrl(evidence.gates.g6b.cloneUrl, 'gates.g6b.cloneUrl', { exact: CLONE_URL });
  const prUrl = requireGithubUrl(evidence.gates.g6b.prUrl, 'gates.g6b.prUrl', {
    pathPattern: /^\/ZUnfurl\/zunfurl\/pull\/\d+$/,
  });
  if (!/^\d+$/.test(prUrl.pathname.split('/').at(-1))) fail('G6b PR URL lacks an exact PR number.');

  const expectedRulesets = new Map([
    ['main-protection', { target: 'branch', bypassActorCount: 0 }],
    ['release-tag-creation', { target: 'tag', bypassActorCount: 1 }],
    ['release-tag-immutability', { target: 'tag', bypassActorCount: 0 }],
  ]);
  assertExactSet(evidence.rulesets.map((entry) => entry.name), [...expectedRulesets.keys()], 'ruleset names');
  if (new Set(evidence.rulesets.map((entry) => entry.id)).size !== 3) fail('Ruleset IDs must be distinct.');
  for (const ruleset of evidence.rulesets) {
    const expected = expectedRulesets.get(ruleset.name);
    if (ruleset.target !== expected.target || ruleset.bypassActorCount !== expected.bypassActorCount) {
      fail(`${ruleset.name} evidence does not match the frozen target/bypass semantics.`);
    }
    if (requireTimestamp(ruleset.verifiedAt, `${ruleset.name}.verifiedAt`) > phase8Completed) {
      fail(`${ruleset.name}.verifiedAt must not follow Phase 8 completion.`);
    }
    requireGithubUrl(ruleset.settingsUrl, `${ruleset.name}.settingsUrl`, {
      exact: `${REPOSITORY_URL}/settings/rules/${ruleset.id}`,
    });
  }
  const expectedScopes = {
    public: 'repository-visibility-public',
    tag: 'signed-tag-create-and-push',
    release: 'github-release-publish',
  };
  const privateDigests = [];
  for (const [name, scope] of Object.entries(expectedScopes)) {
    const authorization = evidence.authorizations[name];
    if (authorization.scope !== scope) fail(`authorizations.${name}.scope is incorrect.`);
    if (requireTimestamp(authorization.grantedAt, `authorizations.${name}.grantedAt`) > generatedAt) {
      fail(`authorizations.${name}.grantedAt follows evidence generation.`);
    }
    privateDigests.push(authorization.evidenceSha256);
  }
  privateDigests.push(forkCanary.authorizationEvidenceSha256);

  assertExactSet(evidence.operatorAttestations.map((entry) => entry.id), Object.keys(ATTESTATIONS), 'operator attestation IDs');
  for (const attestation of evidence.operatorAttestations) {
    const subject = ATTESTATIONS[attestation.id];
    const expectedSha = subject === 'candidate' ? candidateSha : subject === 'merge' ? testMergeSha : headSha;
    if (attestation.subjectSha !== expectedSha) fail(`${attestation.id}.subjectSha is incorrect.`);
    if (requireTimestamp(attestation.attestedAt, `${attestation.id}.attestedAt`) > generatedAt) {
      fail(`${attestation.id}.attestedAt follows evidence generation.`);
    }
    privateDigests.push(attestation.privateEvidenceSha256);
  }
  if (new Set(privateDigests).size !== privateDigests.length) {
    fail('Each authorization and operator attestation must use a distinct private evidence digest.');
  }

  if (evidence.tagSignature.signatureType === 'ssh') {
    if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(evidence.tagSignature.keyFingerprint) ||
        evidence.tagSignature.localVerification.trustSource !== 'github-registered-ssh-signing-key') {
      fail('SSH tag signature fingerprint/trust source is invalid.');
    }
  } else if (!/^[A-F0-9]{40,64}$/.test(evidence.tagSignature.keyFingerprint) ||
             evidence.tagSignature.localVerification.trustSource !== 'github-registered-gpg-key') {
    fail('GPG tag signature fingerprint/trust source is invalid.');
  }
  if (evidence.tagSignature.signerPrincipal !== SIGNER_PRINCIPAL) {
    fail('Tag signer principal differs from the approved public Git identity.');
  }
  requireGithubUrl(evidence.tagSignature.tagUrl, 'tagSignature.tagUrl', {
    exact: `${REPOSITORY_URL}/releases/tag/${TAG}`,
  });

  const artifacts = new Map(evidence.artifacts.map((entry) => [entry.name, entry]));
  assertExactSet([...artifacts.keys()], ['SHA256SUMS', 'sbom.cdx.json'], 'Release artifact names');
  if (new Set(evidence.artifacts.map((entry) => entry.assetId)).size !== 2) fail('Release artifact IDs must be distinct.');
  const sbomArtifact = artifacts.get('sbom.cdx.json');
  const sumsArtifact = artifacts.get('SHA256SUMS');
  if (sbomArtifact.mediaType !== 'application/json' ||
      sumsArtifact.mediaType !== 'text/plain' ||
      sbomArtifact.sha256 !== evidence.candidate.sbomSha256) {
    fail('SBOM/SHA256SUMS artifact media types or candidate digest are incorrect.');
  }
  for (const [index, artifact] of evidence.artifacts.entries()) {
    requireGithubApiUrl(
      artifact.apiUrl,
      `artifacts[${index}].apiUrl`,
      `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/assets/${artifact.assetId}`,
    );
    requireGithubUrl(artifact.downloadUrl, `artifacts[${index}].downloadUrl`, {
      exact: `${REPOSITORY_URL}/releases/download/${TAG}/${artifact.name}`,
    });
  }

  assertExactSet(evidence.knownLimitations.map((entry) => entry.id), Object.keys(LIMITATIONS), 'known limitation IDs');
  for (const limitation of evidence.knownLimitations) {
    if (limitation.summary !== LIMITATIONS[limitation.id]) fail(`${limitation.id} summary differs from the frozen disclosure.`);
    requireGithubUrl(limitation.documentationUrl, `${limitation.id}.documentationUrl`, {
      pathPattern: new RegExp(`^/ZUnfurl/zunfurl/blob/${candidateSha}/docs/`),
    });
  }
  return evidence;
}

async function validateLocalCandidate(evidence) {
  if (git(['status', '--porcelain=v1', '--untracked-files=all'], 'inspect local candidate').stdout !== '') {
    fail('Local candidate worktree and index must be clean.');
  }
  const head = git(['rev-parse', '--verify', 'HEAD'], 'resolve local candidate HEAD').stdout;
  if (head !== evidence.candidate.commitSha) fail('Local HEAD must equal evidence candidate.commitSha.');
  if (git(['remote', 'get-url', 'origin'], 'resolve local origin').stdout !== `${REPOSITORY_URL}.git`) {
    fail('Local origin must equal the canonical GitHub HTTPS URL.');
  }
  const roots = git(['rev-list', '--max-parents=0', 'HEAD'], 'resolve candidate roots').stdout.split(/\r?\n/).filter(Boolean);
  if (roots.length !== 1 || roots[0] !== SANITIZED_ROOT_OID ||
      evidence.candidate.rootCommitSha !== SANITIZED_ROOT_OID) {
    fail('Evidence rootCommitSha and the unique local history root must equal the approved sanitized root OID.');
  }
  for (const [relativePath, expectedDigest] of [
    ['sbom.cdx.json', evidence.candidate.sbomSha256],
    ['package-lock.json', evidence.candidate.packageLockSha256],
    ['docs/compliance/github-public-security-policy.json', evidence.candidate.securityPolicySha256],
    ['docs/compliance/ASSET_LICENSES.yml', evidence.releaseSummary.assetManifestSha256],
  ]) {
    if (sha256File(path.join(root, ...relativePath.split('/'))) !== expectedDigest) {
      fail(`${relativePath} SHA-256 differs from Release evidence.`);
    }
  }
  const sbomStats = statSync(path.join(root, 'sbom.cdx.json'));
  const sbomArtifact = evidence.artifacts.find((entry) => entry.name === 'sbom.cdx.json');
  if (sbomStats.size !== sbomArtifact.sizeBytes) fail('Local SBOM size differs from Release evidence.');
  const manifest = await buildCandidateManifest({ root });
  if (manifest.candidateTreeSha256 !== evidence.candidate.publicTreeSha256 ||
      manifest.summary.includedFiles !== evidence.candidate.fileCount || manifest.summary.excludedFiles !== 0) {
    fail('Public candidate digest/file count differs from Release evidence.');
  }
  const tagType = git(['cat-file', '-t', `refs/tags/${TAG}`], 'resolve release tag type').stdout;
  if (tagType !== 'tag') fail('Release tag must be an annotated tag object.');
  const tagObjectSha = git(['rev-parse', `refs/tags/${TAG}^{tag}`], 'resolve release tag object').stdout;
  const tagTarget = git(['rev-parse', `refs/tags/${TAG}^{commit}`], 'resolve release tag target').stdout;
  if (tagObjectSha !== evidence.tagSignature.tagObjectSha || tagTarget !== evidence.candidate.commitSha) {
    fail('Local release tag object/target differs from Release evidence.');
  }
}

function validateRunAndJob(check, runRecord, jobRecord, checkRunRecord, { prNumber } = {}) {
  requireObject(runRecord, `run ${check.workflowRunId}`);
  if (requireOwn(runRecord, 'id', 'run') !== check.workflowRunId ||
      requireOwn(runRecord, 'run_attempt', 'run') !== check.runAttempt ||
      requireOwn(runRecord, 'status', 'run') !== 'completed' ||
      requireOwn(runRecord, 'conclusion', 'run') !== 'success' ||
      requireOwn(runRecord, 'event', 'run') !== check.event ||
      requireOwn(runRecord, 'head_sha', 'run') !== check.runHeadSha ||
      requireOwn(runRecord, 'workflow_id', 'run') !== check.workflowId ||
      requireOwn(runRecord, 'path', 'run') !== check.workflowPath ||
      requireOwn(runRecord, 'html_url', 'run') !== `${REPOSITORY_URL}/actions/runs/${check.workflowRunId}`) {
    fail(`${check.context} GitHub Actions run projection differs from evidence.`);
  }
  if (prNumber !== undefined) {
    const pullRequests = requireOwn(runRecord, 'pull_requests', 'run');
    if (!Array.isArray(pullRequests) || !pullRequests.some((entry) =>
      isPlainObject(entry) && entry.number === prNumber && entry.url === `${GITHUB_API_URL}/repos/${REPOSITORY}/pulls/${prNumber}`)) {
      fail(`${check.context} run is not bound to the G6b PR.`);
    }
  }
  requireObject(jobRecord, `job ${check.jobId}`);
  if (requireOwn(jobRecord, 'id', 'job') !== check.jobId ||
      requireOwn(jobRecord, 'run_id', 'job') !== check.workflowRunId ||
      requireOwn(jobRecord, 'status', 'job') !== 'completed' ||
      requireOwn(jobRecord, 'conclusion', 'job') !== 'success' ||
      requireOwn(jobRecord, 'head_sha', 'job') !== check.runHeadSha ||
      requireOwn(jobRecord, 'name', 'job') !== check.observedJobName ||
      requireOwn(jobRecord, 'html_url', 'job') !== check.detailsUrl ||
      requireOwn(jobRecord, 'check_run_url', 'job') !==
        `${GITHUB_API_URL}/repos/${REPOSITORY}/check-runs/${check.checkRunId}`) {
    fail(`${check.context} GitHub Actions job projection differs from evidence.`);
  }
  requireObject(checkRunRecord, `check run ${check.checkRunId}`);
  const app = requireOwn(checkRunRecord, 'app', `check run ${check.checkRunId}`);
  if (requireOwn(checkRunRecord, 'id', 'check run') !== check.checkRunId ||
      requireOwn(checkRunRecord, 'name', 'check run') !== check.observedJobName ||
      requireOwn(checkRunRecord, 'status', 'check run') !== 'completed' ||
      requireOwn(checkRunRecord, 'conclusion', 'check run') !== 'success' ||
      requireOwn(checkRunRecord, 'head_sha', 'check run') !== check.jobCheckSha ||
      requireOwn(checkRunRecord, 'details_url', 'check run') !== check.detailsUrl ||
      requireOwn(app, 'id', 'check run application') !== 15368 ||
      requireOwn(app, 'slug', 'check run application') !== 'github-actions') {
    fail(`${check.context} GitHub check-run projection differs from evidence.`);
  }
}

function validateRulesetApi(record, evidence) {
  requireObject(record, `${evidence.name} API record`);
  const bypassActors = requireOwn(record, 'bypass_actors', `${evidence.name} API record`);
  if (!Array.isArray(bypassActors) ||
      requireOwn(record, 'id', `${evidence.name} API record`) !== evidence.id ||
      requireOwn(record, 'name', `${evidence.name} API record`) !== evidence.name ||
      requireOwn(record, 'target', `${evidence.name} API record`) !== evidence.target ||
      requireOwn(record, 'enforcement', `${evidence.name} API record`) !== 'active' ||
      bypassActors.length !== evidence.bypassActorCount) {
    fail(`${evidence.name} live ruleset projection differs from evidence.`);
  }
}

function validateArtifactApi(record, artifact) {
  requireObject(record, 'Release asset API record');
  if (requireOwn(record, 'id', 'Release asset API record') !== artifact.assetId ||
      requireOwn(record, 'name', 'Release asset API record') !== artifact.name ||
      requireOwn(record, 'state', 'Release asset API record') !== 'uploaded' ||
      requireOwn(record, 'content_type', 'Release asset API record') !== artifact.mediaType ||
      requireOwn(record, 'size', 'Release asset API record') !== artifact.sizeBytes ||
      requireOwn(record, 'digest', 'Release asset API record') !== `sha256:${artifact.sha256}` ||
      requireOwn(record, 'browser_download_url', 'Release asset API record') !== artifact.downloadUrl ||
      requireOwn(record, 'url', 'Release asset API record') !== `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/assets/${artifact.assetId}`) {
    fail('Live Release asset projection differs from evidence.');
  }
}

const G6B_README_APPEND = Buffer.from(
  '<!-- ZUnfurl G6b external-fork smoke; deliberately unmerged. -->\n',
  'utf8',
);

export function validateReadmeDelta(baseBytes, headBytes) {
  if (!Buffer.isBuffer(baseBytes) || !Buffer.isBuffer(headBytes) || baseBytes.length === 0 || baseBytes.at(-1) !== 0x0a) {
    fail('G6b README base must be a non-empty LF-terminated byte sequence.');
  }
  const expected = Buffer.concat([baseBytes, G6B_README_APPEND]);
  if (!headBytes.equals(expected)) fail('G6b README head must contain only the exact approved appended smoke comment.');
}

function projectRecursiveTree(record, label) {
  requireObject(record, label);
  if (requireOwn(record, 'truncated', label) !== false) fail(`${label} must be complete and untruncated.`);
  const entries = requireOwn(record, 'tree', label);
  if (!Array.isArray(entries)) fail(`${label}.tree must be an array.`);
  const projected = new Map();
  for (const [index, entry] of entries.entries()) {
    const entryLabel = `${label}.tree[${index}]`;
    const pathValue = requireString(requireOwn(entry, 'path', entryLabel), `${entryLabel}.path`);
    if (projected.has(pathValue)) fail(`${label} repeats ${pathValue}.`);
    projected.set(pathValue, {
      mode: requireString(requireOwn(entry, 'mode', entryLabel), `${entryLabel}.mode`),
      type: requireString(requireOwn(entry, 'type', entryLabel), `${entryLabel}.type`),
      sha: requireSha(requireOwn(entry, 'sha', entryLabel), `${entryLabel}.sha`),
    });
  }
  return projected;
}

function validateTreeDelta(baseTree, headTree) {
  assertExactSet([...headTree.keys()], [...baseTree.keys()], 'G6b base/head tree paths');
  for (const [entryPath, baseEntry] of baseTree) {
    const headEntry = headTree.get(entryPath);
    if (entryPath === 'README.md') {
      if (baseEntry.type !== 'blob' || headEntry.type !== 'blob' ||
          baseEntry.mode !== headEntry.mode || baseEntry.sha === headEntry.sha) {
        fail('G6b README tree entry must be the only changed blob.');
      }
      continue;
    }
    if (JSON.stringify(headEntry) !== JSON.stringify(baseEntry)) {
      fail(`G6b changed protected or non-fixture tree entry ${entryPath}.`);
    }
  }
  for (const requiredPath of [
    '.github/workflows/codeql.yml',
    '.github/workflows/dco.yml',
    '.github/workflows/dependency-review.yml',
    '.github/workflows/preview.yml',
    '.github/workflows/secret-scan.yml',
    'docs/compliance/github-public-security-policy.json',
    'docs/compliance/public-candidate-policy.json',
    'package-lock.json',
    'package.json',
    'scripts/compliance/validate-release-evidence.mjs',
    'scripts/tests/validate-dco.mjs',
  ]) {
    if (!baseTree.has(requiredPath)) fail(`G6b protected-tree proof is missing ${requiredPath}.`);
  }
}

function readCommitTree(commitSha, label) {
  const commit = ghJson(`${API_PREFIX}git/commits/${commitSha}`, `${label} commit`);
  const tree = requireOwn(commit, 'tree', `${label} commit`);
  if (requireOwn(commit, 'sha', `${label} commit`) !== commitSha) fail(`${label} commit SHA differs.`);
  const treeSha = requireSha(requireOwn(tree, 'sha', `${label} commit.tree`), `${label} tree SHA`);
  return projectRecursiveTree(
    ghJson(`${API_PREFIX}git/trees/${treeSha}?recursive=1`, `${label} recursive tree`),
    `${label} recursive tree`,
  );
}

function readBlobBytes(blobSha, label) {
  const record = ghJson(`${API_PREFIX}git/blobs/${blobSha}`, label);
  if (requireOwn(record, 'sha', label) !== blobSha || requireOwn(record, 'encoding', label) !== 'base64') {
    fail(`${label} projection differs.`);
  }
  const content = requireString(requireOwn(record, 'content', label), `${label}.content`).replace(/\r?\n/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) fail(`${label}.content is not canonical base64.`);
  const bytes = Buffer.from(content, 'base64');
  if (bytes.length !== requireOwn(record, 'size', label)) fail(`${label}.size differs from decoded bytes.`);
  const gitBlobSha = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
  if (gitBlobSha !== blobSha) fail(`${label} decoded bytes do not match the Git blob SHA.`);
  return bytes;
}

function validateG6bFixture(prNumber, baseSha, headSha) {
  const files = ghJson(`${API_PREFIX}pulls/${prNumber}/files?per_page=100&page=1`, 'read G6b PR changed files');
  if (!Array.isArray(files) || files.length !== 1) fail('G6b PR must expose exactly one complete changed-file record.');
  const file = requireObject(files[0], 'G6b PR file');
  if (requireOwn(file, 'filename', 'G6b PR file') !== 'README.md' ||
      requireOwn(file, 'status', 'G6b PR file') !== 'modified' ||
      requireOwn(file, 'additions', 'G6b PR file') !== 1 ||
      requireOwn(file, 'deletions', 'G6b PR file') !== 0 ||
      requireOwn(file, 'changes', 'G6b PR file') !== 1) {
    fail('G6b PR changed-file projection differs from the exact README smoke fixture.');
  }
  const baseTree = readCommitTree(baseSha, 'G6b base');
  const headTree = readCommitTree(headSha, 'G6b head');
  validateTreeDelta(baseTree, headTree);
  const baseReadme = baseTree.get('README.md');
  const headReadme = headTree.get('README.md');
  validateReadmeDelta(
    readBlobBytes(baseReadme.sha, 'read G6b base README blob'),
    readBlobBytes(headReadme.sha, 'read G6b head README blob'),
  );
}

function validateTagApi(tagRecord, evidence) {
  requireObject(tagRecord, 'Git tag API record');
  const object = requireOwn(tagRecord, 'object', 'Git tag API record');
  const tagger = requireOwn(tagRecord, 'tagger', 'Git tag API record');
  const verification = requireOwn(tagRecord, 'verification', 'Git tag API record');
  if (requireOwn(tagRecord, 'tag', 'Git tag API record') !== TAG ||
      requireOwn(object, 'type', 'Git tag API record.object') !== 'commit' ||
      requireOwn(object, 'sha', 'Git tag API record.object') !== evidence.candidate.commitSha ||
      requireOwn(tagger, 'name', 'Git tag API record.tagger') !== 'Noodle Freeman' ||
      requireOwn(tagger, 'email', 'Git tag API record.tagger') !== evidence.tagSignature.signerPrincipal ||
      requireOwn(tagger, 'date', 'Git tag API record.tagger') !== evidence.tagSignature.signedAt ||
      requireOwn(verification, 'verified', 'Git tag API record.verification') !== true ||
      requireOwn(verification, 'reason', 'Git tag API record.verification') !== 'valid' ||
      requireOwn(verification, 'verified_at', 'Git tag API record.verification') !== evidence.tagSignature.githubVerification.verifiedAt) {
    fail('GitHub tag verification projection differs from Release evidence.');
  }
  requireString(requireOwn(verification, 'signature', 'Git tag API record.verification'), 'Git tag verification signature');
  requireString(requireOwn(verification, 'payload', 'Git tag API record.verification'), 'Git tag verification payload');
}

function readRegisteredSigningKey(evidence) {
  const resource = evidence.tagSignature.signatureType === 'ssh' ? 'ssh_signing_keys' : 'gpg_keys';
  const records = [];
  for (let page = 1; page <= 100; page += 1) {
    const exactEndpoint = `users/mp4102/${resource}?per_page=100&page=${page}`;
    const result = run('gh', [
      'api', '--hostname', 'github.com',
      '-H', 'Accept: application/vnd.github+json',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      exactEndpoint,
    ], `read registered GitHub signing keys page ${page}`);
    let pageRecords;
    try {
      pageRecords = JSON.parse(result.stdout);
    } catch {
      fail('Registered GitHub signing keys returned invalid JSON.');
    }
    if (!Array.isArray(pageRecords) || pageRecords.length > 100) fail('Registered signing-key page cardinality is invalid.');
    records.push(...pageRecords);
    if (pageRecords.length < 100) break;
    if (page === 100) fail('Registered signing-key pagination did not terminate.');
  }
  if (new Set(records.map((entry) => isPlainObject(entry) ? entry.id : undefined)).size !== records.length) {
    fail('Registered signing-key pagination contains duplicate or invalid records.');
  }
  const matches = records.filter((entry) => isPlainObject(entry) && entry.id === evidence.tagSignature.registeredSigningKeyId);
  if (matches.length !== 1) fail('Evidence signing key is not an exact registered key for mp4102.');
  return matches[0];
}

export function assertVerifiedCommandResult(result, label) {
  if (!isPlainObject(result) || result.error || result.status !== 0) fail(`${label} did not cryptographically verify.`);
}

function verifyLocalTagWithRegisteredKey(evidence, keyRecord) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'zunfurl-tag-verify-'));
  try {
    if (evidence.tagSignature.signatureType === 'ssh') {
      const key = requireString(requireOwn(keyRecord, 'key', 'registered SSH signing key'), 'registered SSH signing key.key');
      if (sha256Bytes(Buffer.from(key, 'utf8')) !== evidence.tagSignature.localVerification.trustMaterialSha256) {
        fail('Registered SSH signing key digest differs from Release evidence.');
      }
      const keyPath = path.join(tempRoot, 'signing-key.pub');
      const allowedSignersPath = path.join(tempRoot, 'allowed_signers');
      writeFileSync(keyPath, `${key}\n`, { encoding: 'utf8', flag: 'wx' });
      writeFileSync(allowedSignersPath, `${evidence.tagSignature.signerPrincipal} ${key}\n`, { encoding: 'utf8', flag: 'wx' });
      const fingerprintResult = run('ssh-keygen', ['-lf', keyPath, '-E', 'sha256'], 'derive registered SSH signing-key fingerprint');
      const fingerprint = fingerprintResult.stdout.match(/\bSHA256:[A-Za-z0-9+/]{43}\b/)?.[0];
      if (fingerprint !== evidence.tagSignature.keyFingerprint) fail('Registered SSH signing-key fingerprint differs from Release evidence.');
      const verifyResult = git([
        '-c', 'gpg.format=ssh',
        '-c', `gpg.ssh.allowedSignersFile=${allowedSignersPath}`,
        'verify-tag', TAG,
      ], 'cryptographically verify SSH-signed tag', { allowFailure: true });
      assertVerifiedCommandResult(verifyResult, 'git verify-tag with registered SSH key');
      return;
    }

    const rawKey = requireString(requireOwn(keyRecord, 'raw_key', 'registered GPG key'), 'registered GPG key.raw_key');
    if (sha256Bytes(Buffer.from(rawKey, 'utf8')) !== evidence.tagSignature.localVerification.trustMaterialSha256) {
      fail('Registered GPG key digest differs from Release evidence.');
    }
    const keyPath = path.join(tempRoot, 'signing-key.asc');
    const gpgHome = path.join(tempRoot, 'gnupg');
    mkdirSync(gpgHome, { mode: 0o700 });
    writeFileSync(keyPath, rawKey, { encoding: 'utf8', flag: 'wx' });
    run('gpg', ['--batch', '--homedir', gpgHome, '--import', keyPath], 'import registered GPG key');
    const show = run('gpg', ['--batch', '--homedir', gpgHome, '--with-colons', '--show-keys', keyPath], 'derive registered GPG fingerprint');
    const fingerprint = show.stdout.split(/\r?\n/).find((line) => line.startsWith('fpr:'))?.split(':')[9];
    if (fingerprint !== evidence.tagSignature.keyFingerprint) fail('Registered GPG key fingerprint differs from Release evidence.');
    const verifyResult = git(['-c', 'gpg.format=openpgp', 'verify-tag', TAG], 'cryptographically verify GPG-signed tag', {
      allowFailure: true,
      env: { ...process.env, GNUPGHOME: gpgHome },
    });
    assertVerifiedCommandResult(verifyResult, 'git verify-tag with registered GPG key');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function validateRemoteEvidence(evidence, externalEvidencePath, { releaseStage }) {
  runFullPhase8SecurityAudit();
  const prNumber = Number(new URL(evidence.gates.g6b.prUrl).pathname.split('/').at(-1));
  const pr = ghJson(`${API_PREFIX}pulls/${prNumber}`, 'read G6b pull request');
  const base = requireOwn(pr, 'base', 'G6b pull request');
  const head = requireOwn(pr, 'head', 'G6b pull request');
  const baseRepo = requireOwn(base, 'repo', 'G6b pull request.base');
  const headRepo = requireOwn(head, 'repo', 'G6b pull request.head');
  const headOwner = requireOwn(headRepo, 'owner', 'G6b pull request.head.repo');
  const headParent = requireOwn(headRepo, 'parent', 'G6b pull request.head.repo');
  const headSource = requireOwn(headRepo, 'source', 'G6b pull request.head.repo');
  const author = requireOwn(pr, 'user', 'G6b pull request');
  const fork = evidence.gates.g6b.forkCanary;
  if (requireOwn(pr, 'number', 'G6b pull request') !== prNumber ||
      requireOwn(pr, 'html_url', 'G6b pull request') !== evidence.gates.g6b.prUrl ||
      requireOwn(pr, 'state', 'G6b pull request') !== 'closed' ||
      requireOwn(pr, 'draft', 'G6b pull request') !== false ||
      requireOwn(pr, 'merged', 'G6b pull request') !== false ||
      requireOwn(pr, 'closed_at', 'G6b pull request') !== evidence.gates.g6b.closedAt ||
      requireOwn(base, 'sha', 'G6b pull request.base') !== evidence.gates.g6b.baseSha ||
      requireOwn(baseRepo, 'id', 'G6b pull request.base.repo') !== 1292385902 ||
      requireOwn(baseRepo, 'full_name', 'G6b pull request.base.repo') !== REPOSITORY ||
      requireOwn(head, 'sha', 'G6b pull request.head') !== evidence.gates.g6b.headSha ||
      requireOwn(headRepo, 'id', 'G6b pull request.head.repo') !== fork.repositoryId ||
      requireOwn(headRepo, 'full_name', 'G6b pull request.head.repo') !== fork.repositoryNameWithOwner ||
      requireOwn(headRepo, 'fork', 'G6b pull request.head.repo') !== true ||
      requireOwn(headOwner, 'login', 'G6b pull request.head.repo.owner') !== fork.actorLogin ||
      requireOwn(headParent, 'id', 'G6b pull request.head.repo.parent') !== 1292385902 ||
      requireOwn(headParent, 'full_name', 'G6b pull request.head.repo.parent') !== REPOSITORY ||
      requireOwn(headSource, 'id', 'G6b pull request.head.repo.source') !== 1292385902 ||
      requireOwn(headSource, 'full_name', 'G6b pull request.head.repo.source') !== REPOSITORY ||
      requireOwn(author, 'login', 'G6b pull request.user') !== fork.actorLogin ||
      requireOwn(author, 'id', 'G6b pull request.user') !== fork.actorId) {
    fail('Live G6b PR base/head/test-merge projection differs from evidence.');
  }
  const currentTestMerge = pr.merge_commit_sha;
  if (currentTestMerge !== null && currentTestMerge !== evidence.gates.g6b.testMergeSha) {
    fail('Closed G6b PR retained a different synthetic test-merge SHA.');
  }
  if (requireOwn(pr, 'changed_files', 'G6b pull request') !== 1) {
    fail('G6b PR must report exactly one changed file.');
  }
  validateG6bFixture(prNumber, evidence.gates.g6b.baseSha, evidence.gates.g6b.headSha);
  const canaryPermission = ghJson(`${API_PREFIX}collaborators/mp4102/permission`, 'read same-maintainer canary permission');
  const canaryUser = requireOwn(canaryPermission, 'user', 'same-maintainer canary permission');
  if (requireOwn(canaryPermission, 'permission', 'same-maintainer canary permission') !== fork.targetRepositoryPermission ||
      requireOwn(canaryUser, 'login', 'same-maintainer canary permission.user') !== fork.actorLogin ||
      requireOwn(canaryUser, 'id', 'same-maintainer canary permission.user') !== fork.actorId) {
    fail('G6b same-maintainer canary target permission differs from the disclosed admin boundary.');
  }

  const allChecks = [
    ...evidence.gates.g6a.checks.map((check) => ({ check })),
    ...evidence.gates.g6b.checks.map((check) => ({ check, prNumber })),
  ];
  const runCache = new Map();
  const evidenceChecks = allChecks.map((entry) => entry.check);
  for (const entry of allChecks) {
    const { check } = entry;
    if (!runCache.has(check.workflowRunId)) {
      runCache.set(check.workflowRunId, ghJson(`${API_PREFIX}actions/runs/${check.workflowRunId}`, `read run ${check.workflowRunId}`));
    }
    const job = ghJson(`${API_PREFIX}actions/jobs/${check.jobId}`, `read job ${check.jobId}`);
    const checkRun = ghJson(`${API_PREFIX}check-runs/${check.checkRunId}`, `read check run ${check.checkRunId}`);
    validateRunAndJob(check, runCache.get(check.workflowRunId), job, checkRun, entry);
  }
  const attemptKeys = new Set(evidenceChecks.map((check) => `${check.workflowRunId}:${check.runAttempt}`));
  for (const key of attemptKeys) {
    const [runIdText, runAttemptText] = key.split(':');
    const runId = Number(runIdText);
    const runAttempt = Number(runAttemptText);
    const jobs = ghPaginatedCollection(
      `${API_PREFIX}actions/runs/${runId}/attempts/${runAttempt}/jobs`,
      'jobs',
      `workflow run ${runId} attempt ${runAttempt} jobs`,
    );
    validateLatestAttemptJobSet(
      evidenceChecks,
      jobs,
      runId,
      runAttempt,
      `workflow run ${runId} attempt ${runAttempt} jobs`,
    );
  }
  const g6aLatestCheckRuns = ghPaginatedCollection(
    `${API_PREFIX}commits/${evidence.gates.g6a.candidateCommitSha}/check-runs?filter=latest&app_id=15368`,
    'check_runs',
    'G6a latest GitHub Actions check runs',
  );
  validateLatestCheckRunSet(
    evidence.gates.g6a.checks,
    g6aLatestCheckRuns,
    evidence.gates.g6a.candidateCommitSha,
    'G6a latest GitHub Actions check runs',
  );
  const g6bLatestCheckRuns = ghPaginatedCollection(
    `${API_PREFIX}commits/${evidence.gates.g6b.headSha}/check-runs?filter=latest&app_id=15368`,
    'check_runs',
    'G6b latest GitHub Actions check runs',
  );
  validateLatestCheckRunSet(
    evidence.gates.g6b.checks,
    g6bLatestCheckRuns,
    evidence.gates.g6b.headSha,
    'G6b latest GitHub Actions check runs',
  );

  const dcoCheck = evidence.gates.g6b.checks.find((check) => check.context === DCO_CONTEXT);
  const statuses = ghJson(`${API_PREFIX}commits/${evidence.gates.g6b.headSha}/statuses?per_page=100&page=1`, 'read G6b DCO commit statuses');
  if (!Array.isArray(statuses) || statuses.length >= 100) fail('DCO commit-status pagination is ambiguous or unterminated.');
  const matches = statuses.filter((status) => isPlainObject(status) && status.context === DCO_CONTEXT);
  if (matches.length === 0) fail('G6b head lacks the required DCO commit status.');
  matches.sort((left, right) => right.id - left.id);
  const status = matches[0];
  const creator = requireOwn(status, 'creator', 'DCO commit status');
  if (requireOwn(status, 'state', 'DCO commit status') !== 'success' ||
      requireOwn(status, 'sha', 'DCO commit status') !== dcoCheck.resultSha ||
      requireOwn(status, 'target_url', 'DCO commit status') !== `${REPOSITORY_URL}/actions/runs/${dcoCheck.workflowRunId}` ||
      requireOwn(creator, 'login', 'DCO commit status.creator') !== 'github-actions[bot]' ||
      requireOwn(creator, 'id', 'DCO commit status.creator') !== 41898282 ||
      requireOwn(creator, 'type', 'DCO commit status.creator') !== 'Bot') {
    fail('G6b DCO commit status is not the exact trusted workflow result.');
  }

  for (const ruleset of evidence.rulesets) {
    validateRulesetApi(ghJson(`${API_PREFIX}rulesets/${ruleset.id}`, `read ${ruleset.name} ruleset`), ruleset);
  }
  validateRemoteAlertGates(evidence);

  const ref = ghJson(`${API_PREFIX}git/ref/tags/${TAG}`, 'read release tag ref');
  const refObject = requireOwn(ref, 'object', 'release tag ref');
  if (requireOwn(refObject, 'type', 'release tag ref.object') !== 'tag' ||
      requireOwn(refObject, 'sha', 'release tag ref.object') !== evidence.tagSignature.tagObjectSha) {
    fail('GitHub release tag ref differs from evidence.');
  }
  const tag = ghJson(`${API_PREFIX}git/tags/${evidence.tagSignature.tagObjectSha}`, 'read signed Git tag object');
  validateTagApi(tag, evidence);

  const release = ghJson(
    releaseLookupEndpoint(releaseStage, evidence.release.releaseId),
    releaseStage === 'draft-prepublish' ? 'read draft GitHub Release by ID' : 'read published GitHub Release by tag',
  );
  const expectedDraft = releaseStage === 'draft-prepublish';
  const releaseAssets = validateReleaseApi(release, evidence, releaseStage);
  assertExactSet(
    releaseAssets.map((asset) => requireString(requireOwn(asset, 'name', 'GitHub Release asset'), 'GitHub Release asset.name')),
    expectedDraft
      ? ['SHA256SUMS', 'sbom.cdx.json']
      : ['SHA256SUMS', 'sbom.cdx.json', evidence.release.evidenceAssetName],
    'GitHub Release uploaded asset names',
  );
  for (const artifact of evidence.artifacts) {
    const record = ghJson(`${API_PREFIX}releases/assets/${artifact.assetId}`, `read Release ${artifact.name} asset`);
    validateArtifactApi(record, artifact);
    const bytes = ghBytes(`${API_PREFIX}releases/assets/${artifact.assetId}`, `download Release ${artifact.name} asset`);
    if (bytes.length !== artifact.sizeBytes || sha256Bytes(bytes) !== artifact.sha256) {
      fail(`Downloaded ${artifact.name} bytes differ from Release evidence.`);
    }
    if (artifact.name === 'SHA256SUMS') {
      let sumsText;
      try {
        sumsText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        fail('SHA256SUMS asset must be valid UTF-8.');
      }
      if (sumsText !== `${evidence.candidate.sbomSha256}  sbom.cdx.json\n`) {
        fail('SHA256SUMS must contain the single canonical SBOM digest line.');
      }
    }
  }

  if (expectedDraft) return readRegisteredSigningKey(evidence);

  const evidenceAssetSummary = releaseAssets.find((asset) =>
    isPlainObject(asset) && asset.name === evidence.release.evidenceAssetName);
  requireObject(evidenceAssetSummary, 'Release evidence asset summary');
  const evidenceAssetId = requireInteger(requireOwn(evidenceAssetSummary, 'id', 'Release evidence asset summary'), 'Release evidence asset ID');
  const evidenceAsset = ghJson(`${API_PREFIX}releases/assets/${evidenceAssetId}`, 'read published Release evidence asset');
  const localEvidenceBytes = readFileSync(externalEvidencePath);
  const localEvidenceDigest = sha256Bytes(localEvidenceBytes);
  if (requireOwn(evidenceAsset, 'name', 'Release evidence asset') !== evidence.release.evidenceAssetName ||
      requireOwn(evidenceAsset, 'state', 'Release evidence asset') !== 'uploaded' ||
      requireOwn(evidenceAsset, 'content_type', 'Release evidence asset') !== 'application/json' ||
      requireOwn(evidenceAsset, 'size', 'Release evidence asset') !== localEvidenceBytes.length ||
      requireOwn(evidenceAsset, 'digest', 'Release evidence asset') !== `sha256:${localEvidenceDigest}` ||
      requireOwn(evidenceAsset, 'browser_download_url', 'Release evidence asset') !==
        `${REPOSITORY_URL}/releases/download/${TAG}/${evidence.release.evidenceAssetName}`) {
    fail('Published Release evidence asset metadata differs from the local evidence file.');
  }
  const remoteEvidenceBytes = ghBytes(`${API_PREFIX}releases/assets/${evidenceAssetId}`, 'download published Release evidence asset');
  if (!remoteEvidenceBytes.equals(localEvidenceBytes)) fail('Published Release evidence asset bytes differ from the local evidence file.');
  return readRegisteredSigningKey(evidence);
}

export async function validateExternalEvidenceFile(
  filePath,
  { verifyLocal = true, verifyRemote = true, releaseStage = 'published' } = {},
) {
  if (!['draft-prepublish', 'published'].includes(releaseStage)) fail('Release evidence stage is not supported.');
  const externalPath = assertExternalEvidencePath(filePath);
  const evidence = loadJson(externalPath, 'Release evidence');
  validateEvidenceModel(evidence);
  if (verifyLocal) await validateLocalCandidate(evidence);
  let signingKey;
  if (verifyRemote) signingKey = await validateRemoteEvidence(evidence, externalPath, { releaseStage });
  if (verifyLocal && verifyRemote) verifyLocalTagWithRegisteredKey(evidence, signingKey);
  return evidence;
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--self-test') return { selfTest: true };
  if (argv.length === 2 && argv[0] === '--file' && argv[1]) {
    return { selfTest: false, file: argv[1], releaseStage: 'published' };
  }
  if (argv.length === 2 && argv[0] === '--prepublish-file' && argv[1]) {
    return { selfTest: false, file: argv[1], releaseStage: 'draft-prepublish' };
  }
  fail('Use --self-test, --prepublish-file <outside-json>, or --file <outside-json>.');
}

function check(context, runHeadSha, resultSha, workflowRunId, jobId, event, sourceKind = 'actions-job', observedJobName = context) {
  const workflowPath = WORKFLOW_PATHS[context] ?? '.github/workflows/preview.yml';
  const workflowIds = {
    '.github/workflows/preview.yml': 10,
    '.github/workflows/secret-scan.yml': 11,
    '.github/workflows/dco.yml': 12,
    '.github/workflows/codeql.yml': 13,
    '.github/workflows/dependency-review.yml': 14,
  };
  return {
    context,
    conclusion: 'success',
    event,
    runHeadSha,
    jobCheckSha: runHeadSha,
    resultSha,
    workflowId: workflowIds[workflowPath],
    workflowPath,
    workflowRunId,
    runAttempt: 1,
    jobId,
    checkRunId: jobId + 10000,
    observedJobName,
    sourceKind,
    detailsUrl: `${REPOSITORY_URL}/actions/runs/${workflowRunId}/job/${jobId}`,
  };
}

function validEvidence() {
  const candidateSha = 'a'.repeat(40);
  const headSha = 'd'.repeat(40);
  const testMergeSha = 'e'.repeat(40);
  const digest = (char) => char.repeat(64);
  let jobId = 1000;
  const g6aChecks = G6A_CONTEXTS.map((context) => check(
    context,
    candidateSha,
    candidateSha,
    context === SECRET_CONTEXT ? 101 : 100,
    jobId++,
    context === SECRET_CONTEXT ? 'push' : 'workflow_dispatch',
  ));
  const g6bChecks = G6B_CONTEXTS.map((context) => context === DCO_CONTEXT
    ? check(context, candidateSha, headSha, 202, jobId++, 'pull_request_target', 'commit-status', 'DCO metadata publisher')
    : check(context, headSha, headSha, context === SECRET_CONTEXT ? 201 : 200, jobId++, 'pull_request'));
  return {
    schemaVersion: 1,
    evidenceScope: { classification: 'public-detached', privateSourceCommitIncluded: false },
    release: {
      version: VERSION,
      tag: TAG,
      name: `ZUnfurl v${VERSION}`,
      releaseId: 55,
      lifecycleStage: 'published-prerelease',
      draft: false,
      prerelease: true,
      evidenceAssetName: `release-evidence-${TAG}.json`,
      generatedAt: '2026-08-16T12:00:09.000Z',
      releaseUrl: `${REPOSITORY_URL}/releases/tag/${TAG}`,
      schemaUrl: `${REPOSITORY_URL}/blob/${candidateSha}/docs/compliance/release-evidence.schema.json`,
    },
    repository: {
      id: 1292385902,
      nameWithOwner: REPOSITORY,
      visibility: 'public',
      defaultBranch: 'main',
      isTemplate: true,
      webUrl: `${REPOSITORY_URL}/`,
      anonymousCloneUrl: CLONE_URL,
    },
    candidate: {
      commitSha: candidateSha,
      rootCommitSha: SANITIZED_ROOT_OID,
      publicTreeSha256: digest('1'),
      fileCount: 311,
      sbomSha256: digest('2'),
      packageLockSha256: digest('3'),
      securityPolicySha256: digest('4'),
    },
    releaseSummary: {
      assetManifestSha256: digest('8'),
      environments: [
        { runner: 'linux-node-22', osName: 'Linux', osVersion: 'Ubuntu 24.04', nodeVersion: '22.12.0', npmVersion: '11.9.0' },
        { runner: 'linux-node-24', osName: 'Linux', osVersion: 'Ubuntu 24.04', nodeVersion: '24.7.0', npmVersion: '11.9.0' },
        { runner: 'windows-node-22', osName: 'Windows', osVersion: 'Windows Server 2025', nodeVersion: '22.12.0', npmVersion: '11.9.0' },
      ],
      fixtures: { A1: 'passed', A2: 'passed', B: 'passed', C: 'passed' },
      npmAudit: {
        full: { critical: 0, high: 0, moderate: 7, low: 0, total: 7 },
        production: { critical: 0, high: 0, moderate: 7, low: 0, total: 7 },
        signaturesPassed: true,
      },
      githubSecurityAlerts: {
        codeScanningOpenCriticalHigh: 0,
        dependabotOpenCriticalHigh: 0,
        secretScanningOpen: 0,
      },
      scanners: [
        { id: 'gitleaks', version: '8.30.1', scope: 'candidate-and-origin', findingCount: 0 },
        { id: 'trufflehog', version: '3.97.0', scope: 'candidate-and-origin', findingCount: 0 },
        { id: 'zunfurl-pii-ip-rules', version: '1', scope: 'candidate-and-origin', findingCount: 0 },
      ],
      checkedAt: '2026-08-16T12:00:04.500Z',
      responsibleParty: 'Noodle Freeman',
    },
    gates: {
      g6a: {
        status: 'passed',
        candidateCommitSha: candidateSha,
        cleanRoomCheckout: true,
        productionSecretsUsed: false,
        dcoHistoryValidated: true,
        operatorAttestationId: 'G6A_CLEAN_ROOM_NO_PRODUCTION_SECRETS',
        startedAt: '2026-08-16T12:00:00.000Z',
        completedAt: '2026-08-16T12:00:01.000Z',
        evidenceUrl: `${REPOSITORY_URL}/actions/runs/100`,
        checks: g6aChecks,
      },
      g6b: {
        status: 'passed',
        baseSha: candidateSha,
        headSha,
        testMergeSha,
        prState: 'closed',
        merged: false,
        closedAt: '2026-08-16T12:00:04.000Z',
        forkCanary: {
          actorLogin: 'mp4102',
          actorId: 987654,
          repositoryId: 987655,
          repositoryNameWithOwner: 'mp4102/zunfurl',
          independentExternalActor: false,
          targetRepositoryPermission: 'admin',
          authorizationEvidenceSha256: digest('e'),
        },
        anonymousHttpsClone: true,
        credentialsPresent: false,
        quickStartPassed: true,
        forkCanaryPullRequestPassed: true,
        productionSecretsExposed: false,
        operatorAttestationIds: [
          'G6B_ANONYMOUS_CLONE_NO_CREDENTIALS',
          'G6B_NO_PRODUCTION_SECRET_EXPOSURE',
          'G6B_TEST_MERGE_OBSERVED_BEFORE_CLOSE',
        ],
        startedAt: '2026-08-16T12:00:03.000Z',
        completedAt: '2026-08-16T12:00:04.000Z',
        cloneUrl: CLONE_URL,
        prUrl: `${REPOSITORY_URL}/pull/42`,
        checks: g6bChecks,
      },
      phase8Security: {
        status: 'passed',
        candidateCommitSha: candidateSha,
        command: 'npm.cmd run audit:phase8:github:security',
        completedAt: '2026-08-16T12:00:02.000Z',
        evidenceUrl: `${REPOSITORY_URL}/actions/runs/150`,
      },
    },
    rulesets: [
      ['main-protection', 'branch', 0],
      ['release-tag-creation', 'tag', 1],
      ['release-tag-immutability', 'tag', 0],
    ].map(([name, target, bypassActorCount], index) => ({
      id: index + 1,
      name,
      target,
      enforcement: 'active',
      bypassActorCount,
      verifiedAt: '2026-08-16T12:00:02.000Z',
      settingsUrl: `${REPOSITORY_URL}/settings/rules/${index + 1}`,
    })),
    authorizations: {
      public: { status: 'granted', scope: 'repository-visibility-public', grantedAt: '2026-08-16T11:00:00.000Z', grantedByRole: 'repository-owner', evidenceSha256: digest('5') },
      tag: { status: 'granted', scope: 'signed-tag-create-and-push', grantedAt: '2026-08-16T11:00:01.000Z', grantedByRole: 'repository-owner', evidenceSha256: digest('6') },
      release: { status: 'granted', scope: 'github-release-publish', grantedAt: '2026-08-16T11:00:02.000Z', grantedByRole: 'repository-owner', evidenceSha256: digest('7') },
    },
    operatorAttestations: [
      { id: 'G6A_CLEAN_ROOM_NO_PRODUCTION_SECRETS', status: 'operator-attested', subjectSha: candidateSha, attestedAt: '2026-08-16T12:00:01.000Z', attestedBy: 'Noodle Freeman', privateEvidenceSha256: digest('9') },
      { id: 'G6B_ANONYMOUS_CLONE_NO_CREDENTIALS', status: 'operator-attested', subjectSha: headSha, attestedAt: '2026-08-16T12:00:04.000Z', attestedBy: 'Noodle Freeman', privateEvidenceSha256: digest('a') },
      { id: 'G6B_NO_PRODUCTION_SECRET_EXPOSURE', status: 'operator-attested', subjectSha: headSha, attestedAt: '2026-08-16T12:00:04.000Z', attestedBy: 'Noodle Freeman', privateEvidenceSha256: digest('b') },
      { id: 'G6B_TEST_MERGE_OBSERVED_BEFORE_CLOSE', status: 'operator-attested', subjectSha: testMergeSha, attestedAt: '2026-08-16T12:00:04.000Z', attestedBy: 'Noodle Freeman', privateEvidenceSha256: digest('f') },
    ],
    tagSignature: {
      tag: TAG,
      tagType: 'annotated',
      targetCommitSha: candidateSha,
      tagObjectSha: 'c'.repeat(40),
      signed: true,
      signatureType: 'ssh',
      keyFingerprint: `SHA256:${'A'.repeat(43)}`,
      signerLogin: 'mp4102',
      signerPrincipal: SIGNER_PRINCIPAL,
      registeredSigningKeyId: 123,
      localVerification: { status: 'verified', command: `git verify-tag ${TAG}`, trustSource: 'github-registered-ssh-signing-key', trustMaterialSha256: digest('c') },
      githubVerification: { verified: true, reason: 'valid', verifiedAt: '2026-08-16T12:00:06.000Z' },
      signedAt: '2026-08-16T12:00:05.000Z',
      tagUrl: `${REPOSITORY_URL}/releases/tag/${TAG}`,
    },
    artifacts: [
      {
        assetId: 77,
        name: 'sbom.cdx.json',
        mediaType: 'application/json',
        sizeBytes: 100,
        digestAlgorithm: 'sha256',
        sha256: digest('2'),
        apiUrl: `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/assets/77`,
        downloadUrl: `${REPOSITORY_URL}/releases/download/${TAG}/sbom.cdx.json`,
      },
      {
        assetId: 78,
        name: 'SHA256SUMS',
        mediaType: 'text/plain',
        sizeBytes: 82,
        digestAlgorithm: 'sha256',
        sha256: digest('d'),
        apiUrl: `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/assets/78`,
        downloadUrl: `${REPOSITORY_URL}/releases/download/${TAG}/SHA256SUMS`,
      },
    ],
    knownLimitations: Object.entries(LIMITATIONS).map(([id, summary]) => ({
      id,
      status: 'known',
      summary,
      documentationUrl: `${REPOSITORY_URL}/blob/${candidateSha}/docs/release-status.md`,
    })),
  };
}

function expectBlocked(mutator, pattern, label) {
  const evidence = validEvidence();
  mutator(evidence);
  try {
    validateEvidenceModel(evidence);
  } catch (error) {
    if (pattern.test(error.message)) return;
    fail(`${label} returned unexpected error: ${error.message}`);
  }
  fail(`${label} must block.`);
}

function runSelfTest() {
  validateEvidenceModel(validEvidence());
  const cases = [
    ['unknown field', (value) => { value.unknown = true; }, /additional properties/],
    ['private source commit disclosure', (value) => { value.candidate.sourceCommitSha = 'f'.repeat(40); }, /additional properties/],
    ['null field', (value) => { value.release.generatedAt = null; }, /must not be null/],
    ['wrong type', (value) => { value.candidate.fileCount = '311'; }, /must be integer/],
    ['bad SHA', (value) => { value.candidate.commitSha = 'ABC'; }, /pattern/],
    ['unapproved sanitized root', (value) => { value.candidate.rootCommitSha = 'b'.repeat(40); }, /approved sanitized root/],
    ['bad digest', (value) => { value.candidate.sbomSha256 = 'F'.repeat(64); }, /pattern/],
    ['G6a DCO contamination', (value) => { value.gates.g6a.checks[0].context = DCO_CONTEXT; }, /contexts.*duplicates|contexts differs/],
    ['G6a wrong event', (value) => { value.gates.g6a.checks.find((entry) => entry.context === SECRET_CONTEXT).event = 'pull_request'; }, /event differs/],
    ['G6b head reused as merge', (value) => { value.gates.g6b.testMergeSha = value.gates.g6b.headSha; }, /three distinct/],
    ['same-namespace fork', (value) => { value.gates.g6b.forkCanary.actorLogin = 'ZUnfurl'; value.gates.g6b.forkCanary.repositoryNameWithOwner = 'ZUnfurl/fork'; }, /equal to constant|same-maintainer personal fork/],
    ['G6b check bound to test merge', (value) => { value.gates.g6b.checks.find((entry) => entry.context === CODEQL_CONTEXT).runHeadSha = value.gates.g6b.testMergeSha; }, /runHeadSha differs/],
    ['DCO wrong source kind', (value) => { value.gates.g6b.checks.find((entry) => entry.context === DCO_CONTEXT).sourceKind = 'actions-job'; }, /sourceKind differs/],
    ['mixed workflow run attempts', (value) => { value.gates.g6a.checks[0].runAttempt = 2; }, /multiple attempts/],
    ['duplicate job ID', (value) => { value.gates.g6b.checks[1].jobId = value.gates.g6b.checks[0].jobId; value.gates.g6b.checks[1].detailsUrl = value.gates.g6b.checks[0].detailsUrl; }, /job IDs/],
    ['audit total mismatch', (value) => { value.releaseSummary.npmAudit.full.total = 8; }, /severity sum/],
    ['open critical alert', (value) => { value.releaseSummary.githubSecurityAlerts.codeScanningOpenCriticalHigh = 1; }, /equal to constant/],
    ['scanner version drift', (value) => { value.releaseSummary.scanners[0].version = 'latest'; }, /frozen scanner version/],
    ['environment drift', (value) => { value.releaseSummary.environments[0].nodeVersion = '22.13.0'; }, /environment/],
    ['ruleset bypass drift', (value) => { value.rulesets[0].bypassActorCount = 1; }, /target\/bypass/],
    ['duplicate ruleset', (value) => { value.rulesets[1].name = value.rulesets[0].name; }, /ruleset names.*duplicates|ruleset names differs/],
    ['authorization scope swap', (value) => { value.authorizations.public.scope = 'github-release-publish'; }, /scope is incorrect/],
    ['reused private digest', (value) => { value.operatorAttestations[0].privateEvidenceSha256 = value.authorizations.public.evidenceSha256; }, /distinct private evidence/],
    ['attestation wrong subject', (value) => { value.operatorAttestations[1].subjectSha = value.candidate.commitSha; }, /subjectSha/],
    ['fake SSH fingerprint', (value) => { value.tagSignature.keyFingerprint = 'SHA256:fake'; }, /fingerprint|fewer than/],
    ['signature trust source drift', (value) => { value.tagSignature.localVerification.trustSource = 'github-registered-gpg-key'; }, /trust source/],
    ['SBOM artifact mismatch', (value) => { value.artifacts.find((entry) => entry.name === 'sbom.cdx.json').sha256 = 'f'.repeat(64); }, /SBOM\/SHA256SUMS/],
    ['extra artifact', (value) => { value.artifacts.push({ ...value.artifacts[0], assetId: 79 }); }, /more than 2/],
    ['missing limitation', (value) => { value.knownLimitations.pop(); }, /fewer than 4/],
    ['weakened limitation', (value) => { value.knownLimitations[0].summary = 'not a real limitation'; }, /frozen disclosure/],
    ['timestamp disorder', (value) => { value.gates.g6b.startedAt = '2026-08-16T11:00:00.000Z'; }, /out of release order/],
  ];
  for (const [label, mutator, pattern] of cases) expectBlocked(mutator, pattern, label);
  try {
    assertExternalEvidencePath(schemaPath);
    fail('inside-repository evidence path must block.');
  } catch (error) {
    if (!/outside the repository/.test(error.message)) throw error;
  }
  try {
    assertVerifiedCommandResult({ status: 1, stdout: '-----BEGIN SSH SIGNATURE-----', stderr: '', error: undefined }, 'fake marker');
    fail('fake signature marker must not pass.');
  } catch (error) {
    if (!/cryptographically verify/.test(error.message)) throw error;
  }
  try {
    validateReadmeDelta(Buffer.from('# Base\n', 'utf8'), Buffer.from('# Base\nunauthorized change\n', 'utf8'));
    fail('unauthorized G6b README delta must block.');
  } catch (error) {
    if (!/exact approved appended smoke comment/.test(error.message)) throw error;
  }
  try {
    validateArtifactApi({ id: 77, name: 'sbom.cdx.json', state: 'uploaded', content_type: 'application/json', size: 100, digest: null }, validEvidence().artifacts[0]);
    fail('null API artifact digest must block.');
  } catch (error) {
    if (!/must not be null/.test(error.message)) throw error;
  }
  try {
    assertPhase8AuditResult({ status: 0, stdout: 'plausible but incomplete receipt', stderr: '', error: undefined });
    fail('incomplete Phase 8 audit receipt must block.');
  } catch (error) {
    if (!/exact success receipt/.test(error.message)) throw error;
  }
  const lifecycleEvidence = validEvidence();
  if (releaseLookupEndpoint('draft-prepublish', lifecycleEvidence.release.releaseId) !==
      `${API_PREFIX}releases/${lifecycleEvidence.release.releaseId}` ||
      releaseLookupEndpoint('published', lifecycleEvidence.release.releaseId) !== `${API_PREFIX}releases/tags/${TAG}`) {
    fail('Release lifecycle lookup endpoints are not stage-specific.');
  }
  const apiRelease = (draft, immutable) => ({
    assets: [],
    draft,
    html_url: draft
      ? `${REPOSITORY_URL}/releases/tag/untagged-draft123`
      : lifecycleEvidence.release.releaseUrl,
    id: lifecycleEvidence.release.releaseId,
    immutable,
    name: `ZUnfurl v${VERSION}`,
    prerelease: true,
    tag_name: TAG,
    url: `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/${lifecycleEvidence.release.releaseId}`,
  });
  validateReleaseApi(apiRelease(true, false), lifecycleEvidence, 'draft-prepublish');
  validateReleaseApi(apiRelease(false, true), lifecycleEvidence, 'published');
  for (const [label, mutate] of [
    ['draft Release already immutable', (release) => { release.immutable = true; }],
    ['published Release remains mutable', (release) => { release.immutable = false; }],
    ['Release API identity mismatch', (release) => { release.url = `${GITHUB_API_URL}/repos/${REPOSITORY}/releases/999`; }],
  ]) {
    const release = apiRelease(label.startsWith('draft'), label !== 'published Release remains mutable');
    mutate(release);
    try {
      validateReleaseApi(release, lifecycleEvidence, label.startsWith('draft') ? 'draft-prepublish' : 'published');
      fail(`${label} must block.`);
    } catch (error) {
      if (!/Release projection/.test(error.message)) throw error;
    }
  }
  const latestEvidence = validEvidence();
  const latestChecks = latestEvidence.gates.g6a.checks.map((entry) => ({
    app: { id: 15368, slug: 'github-actions' },
    conclusion: 'success',
    head_sha: latestEvidence.gates.g6a.candidateCommitSha,
    id: entry.checkRunId,
    name: entry.observedJobName,
    status: 'completed',
  }));
  validateLatestCheckRunSet(
    latestEvidence.gates.g6a.checks,
    latestChecks,
    latestEvidence.gates.g6a.candidateCommitSha,
    'self-test latest check runs',
  );
  const staleChecks = structuredClone(latestChecks);
  staleChecks[0].id += 99999;
  try {
    validateLatestCheckRunSet(
      latestEvidence.gates.g6a.checks,
      staleChecks,
      latestEvidence.gates.g6a.candidateCommitSha,
      'self-test stale check runs',
    );
    fail('stale successful check run must block.');
  } catch (error) {
    if (!/latest .* result differs/.test(error.message)) throw error;
  }
  const runId = latestEvidence.gates.g6a.checks[0].workflowRunId;
  const runChecks = latestEvidence.gates.g6a.checks.filter((entry) => entry.workflowRunId === runId);
  const latestJobs = runChecks.map((entry) => ({ id: entry.jobId, name: entry.observedJobName, run_id: runId }));
  validateLatestAttemptJobSet(runChecks, latestJobs, runId, 1, 'self-test latest attempt jobs');
  const staleJobs = structuredClone(latestJobs);
  staleJobs[0].id += 99999;
  try {
    validateLatestAttemptJobSet(runChecks, staleJobs, runId, 1, 'self-test stale attempt jobs');
    fail('job from an older workflow attempt must block.');
  } catch (error) {
    if (!/latest .* job differs/.test(error.message)) throw error;
  }
  console.log(`External Release evidence logic OK: ${cases.length + 10} fail-closed mutations.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();
  const evidence = await validateExternalEvidenceFile(options.file, {
    verifyLocal: true,
    verifyRemote: true,
    releaseStage: options.releaseStage,
  });
  console.log(
    `External Release evidence ${options.releaseStage} OK: ${evidence.release.tag}; ` +
    `candidate=${evidence.candidate.commitSha}; files=${evidence.candidate.fileCount}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Release evidence validation blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
