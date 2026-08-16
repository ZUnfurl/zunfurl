/**
 * 对 Phase 6 复用的 GitHub 仓库容器执行只读、脱敏审计。
 *
 * 本脚本只调用 GitHub REST/GraphQL 读取接口、`git ls-remote` 和本地
 * `git lfs ls-files`。输出仅包含计数、布尔设置和状态码分类；不得输出
 * secret、variable、run ID、日志 URL、GitHub App 名称或授权明细。
 *
 * 默认模式用于生成审计快照；传入 `--require-clean` 时，若远程仍含旧历史、
 * 旧 Actions 记录或其他必须清场的对象，则以非零状态退出。GitHub App 的
 * 仓库授权范围及不可用 API 背后的 Codespaces secret 空状态受 Web UI 权限
 * 保护，只有调用者显式传入对应人工复核 attestation 后才可解除 Gate。
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TARGET = 'ZUnfurl/zunfurl';
const SANITIZED_ROOT_OID = 'e50b0cec829cee08397bbc87b7ed483e8ee7afda';

/**
 * Codespaces repository secrets 在“GitHub Free Organization + Private repository”
 * 组合下不可用，REST API 会返回 404。404 本身不能证明 secret 数量为零：仓库
 * 转移会保留既有 secrets。因此这里只登记已经由转移前认证 API 审计确认为 0、
 * 且可由不可变 repository ID 与已审计 commit 继续证明身份连续性的基线。
 */
const CODESPACES_EMPTY_TRANSFER_BASELINES = Object.freeze([
  Object.freeze({
    repositoryId: 1292385902,
    target: DEFAULT_TARGET.toLowerCase(),
    verifiedHeadOid: '2b7aa20efdc57564bbc36c720d208b64d1a2f3f5',
    verifiedCount: 0,
  }),
]);
const APPROVED_GITHUB_DYNAMIC_WORKFLOWS = new Set([
  'dynamic/agents/copilot-pull-request-reviewer',
  'dynamic/dependabot/dependabot-updates',
]);

function parseArgs(argv) {
  const options = {
    repository: undefined,
    target: DEFAULT_TARGET,
    requireClean: false,
    selfTest: false,
    codespacesSecretsEmptyAttested: false,
    githubAppsReviewedAttested: false,
  };
  let operationalArgumentSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-clean') {
      options.requireClean = true;
      operationalArgumentSeen = true;
      continue;
    }
    if (argument === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (argument === '--attest-codespaces-secrets-empty') {
      options.codespacesSecretsEmptyAttested = true;
      operationalArgumentSeen = true;
      continue;
    }
    if (argument === '--attest-github-apps-reviewed') {
      options.githubAppsReviewedAttested = true;
      operationalArgumentSeen = true;
      continue;
    }
    if (argument === '--repository' || argument === '--target') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires an owner/name value.`);
      }
      const key = argument === '--repository' ? 'repository' : 'target';
      options[key] = value;
      operationalArgumentSeen = true;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  for (const [label, value] of [
    ['repository', options.repository],
    ['target', options.target],
  ].filter(([, value]) => value != null)) {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]+$/.test(value)) {
      throw new Error(`Invalid ${label} owner/name: ${value}`);
    }
  }
  if (options.selfTest && operationalArgumentSeen) {
    throw new Error('--self-test must be used alone.');
  }
  return options;
}

function command(commandName, args, { discardStdout = false } = {}) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: discardStdout ? undefined : 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: discardStdout ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`Cannot execute ${commandName}: ${result.error.message}`);
  }
  const stderr = discardStdout
    ? Buffer.from(result.stderr ?? []).toString('utf8')
    : String(result.stderr ?? '');
  const httpMatch = stderr.match(/HTTP\s+(\d{3})/i);
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: discardStdout ? '' : String(result.stdout ?? '').trim(),
    httpStatus: httpMatch ? Number(httpMatch[1]) : null,
  };
}

function parseJsonResult(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed${result.httpStatus ? ` with HTTP ${result.httpStatus}` : ''}.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function ghJson(endpoint, jq, label = endpoint) {
  return parseJsonResult(command('gh', ['api', endpoint, '--jq', jq]), label);
}

function ghStatus(endpoint, jq = '.') {
  const result = command('gh', ['api', endpoint, '--jq', jq]);
  return {
    ok: result.ok,
    httpStatus: result.httpStatus,
    value: result.ok && result.stdout ? JSON.parse(result.stdout) : null,
  };
}

function ghGraphql({ owner, name, query, jq, label }) {
  return parseJsonResult(
    command('gh', [
      'api',
      'graphql',
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-f',
      `query=${query}`,
      '--jq',
      jq,
    ]),
    label,
  );
}

function splitRepository(repository) {
  const [owner, name] = repository.split('/');
  return { owner, name };
}

function repositoryFromOrigin() {
  const remote = command('git', ['remote', 'get-url', 'origin']);
  if (!remote.ok) {
    throw new Error('Cannot infer --repository because origin is unavailable.');
  }
  const match = remote.stdout.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/i,
  );
  if (!match) {
    throw new Error('Cannot infer --repository because origin is not a GitHub owner/name URL.');
  }
  return match[1];
}

function localHeadWorkflowEntries() {
  const result = command('git', [
    'ls-tree',
    '-r',
    '--full-tree',
    'HEAD',
    '--',
    '.github/workflows',
  ]);
  if (!result.ok) throw new Error('Cannot read workflow paths from local HEAD.');
  if (!result.stdout) return [];
  return result.stdout.split(/\r?\n/).map((line) => {
    const match = line.match(/^\d+\s+blob\s+([0-9a-f]{40})\t(.+)$/i);
    if (!match) throw new Error('Local HEAD workflow tree returned an unexpected entry.');
    return { sha: match[1], path: match[2] };
  }).filter((entry) => /\.ya?ml$/i.test(entry.path)).sort((left, right) =>
    left.path.localeCompare(right.path));
}

function localRepositoryBindingState() {
  const head = command('git', ['rev-parse', '--verify', 'HEAD']);
  if (!head.ok || !/^[0-9a-f]{40}$/i.test(head.stdout)) {
    throw new Error('Cannot resolve the local committed HEAD.');
  }
  const workflowStatus = command('git', [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    '.github/workflows',
  ]);
  if (!workflowStatus.ok) throw new Error('Cannot inspect the local workflow worktree state.');
  return {
    headOid: head.stdout,
    workflowWorktreeAndIndexClean: workflowStatus.stdout === '',
  };
}

function listRemoteRefs(repository) {
  const result = command('git', [
    'ls-remote',
    '--refs',
    `https://github.com/${repository}.git`,
  ]);
  if (!result.ok) {
    throw new Error('git ls-remote failed for the audited repository.');
  }
  return result.stdout
    ? result.stdout.split(/\r?\n/).map((line) => {
      const [sha, ref] = line.split(/\s+/);
      return { sha, ref };
    }).filter((entry) => entry.sha && entry.ref)
    : [];
}

export function summarizeRemoteRefs(refs) {
  const count = (prefix) => refs.filter((entry) => entry.ref.startsWith(prefix)).length;
  const pullRequests = count('refs/pull/');
  const pullRequestHeads = refs.filter((entry) => /^refs\/pull\/\d+\/head$/.test(entry.ref)).length;
  const pullRequestMerges = refs.filter((entry) => /^refs\/pull\/\d+\/merge$/.test(entry.ref)).length;
  return {
    total: refs.length,
    branches: count('refs/heads/'),
    tags: count('refs/tags/'),
    pullRequests,
    pullRequestHeads,
    pullRequestMerges,
    invalidPullRequestShapes: pullRequests - pullRequestHeads - pullRequestMerges,
    other: refs.filter((entry) => !/^refs\/(?:heads|tags|pull)\//.test(entry.ref)).length,
  };
}

function inspectCommitGraph(repository, startShas) {
  const pending = [...new Set(startShas.filter(Boolean))];
  const visited = new Set();
  const roots = new Set();
  let unresolved = 0;

  while (pending.length > 0) {
    if (visited.size > 10000) {
      throw new Error('Remote commit graph exceeds the Phase 6 audit safety limit.');
    }
    const sha = pending.pop();
    if (visited.has(sha)) continue;
    visited.add(sha);
    const result = command('gh', [
      'api',
      `repos/${repository}/git/commits/${sha}`,
      '--jq',
      '{sha: .sha, parents: [.parents[].sha]}',
    ]);
    if (!result.ok) {
      unresolved += 1;
      continue;
    }
    const commit = JSON.parse(result.stdout);
    if (commit.parents.length === 0) {
      roots.add(commit.sha);
      continue;
    }
    pending.push(...commit.parents);
  }

  return { commitCount: visited.size, roots, unresolved };
}

function countReachableLfsPointers(repository) {
  const remote = command('git', ['remote', 'get-url', 'origin']);
  if (!remote.ok) {
    return { status: 'unverified-no-origin', count: null, attributesFilePresent: null };
  }
  const normalized = remote.stdout
    .replace(/^git@github\.com:/i, '')
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
  if (normalized !== repository.toLowerCase()) {
    return { status: 'unverified-origin-mismatch', count: null, attributesFilePresent: null };
  }
  const result = command('git', ['lfs', 'ls-files', '--all']);
  if (!result.ok) {
    return { status: 'unverified-git-lfs-unavailable', count: null, attributesFilePresent: null };
  }
  return {
    status: 'verified-reachable-refs',
    count: result.stdout ? result.stdout.split(/\r?\n/).filter(Boolean).length : 0,
    attributesFilePresent: existsSync(path.join(process.cwd(), '.gitattributes')),
  };
}

export function classifyLogArchiveResults(results) {
  let available = 0;
  let confirmedUnavailable = 0;
  let forbidden = 0;
  let unknown = 0;
  for (const result of results) {
    if (result.ok) available += 1;
    else if ([404, 410].includes(result.httpStatus)) confirmedUnavailable += 1;
    else if (result.httpStatus === 403) forbidden += 1;
    else unknown += 1;
  }
  return {
    available,
    confirmedUnavailable,
    forbidden,
    unknown,
    unverified: forbidden + unknown,
  };
}

function countAvailableLogArchives(repository, runIds) {
  const results = [];
  for (const runId of runIds) {
    results.push(command(
      'gh',
      ['api', `repos/${repository}/actions/runs/${runId}/logs`],
      { discardStdout: true },
    ));
  }
  return classifyLogArchiveResults(results);
}

function featureState(result, { privateUnavailable = false } = {}) {
  if (result.ok) {
    return result.value?.enabled === false ? 'disabled' : 'enabled';
  }
  if (privateUnavailable && [403, 404].includes(result.httpStatus)) {
    return 'unavailable-while-private-on-current-plan';
  }
  if (result.httpStatus === 404) {
    return 'disabled-or-unavailable';
  }
  if (result.httpStatus === 403) {
    return 'disabled-or-insufficient-api-permission';
  }
  return 'unverified';
}

function collectionState(result, { privateUnavailable = false } = {}) {
  if (result.ok) {
    return Number(result.value) > 0 ? 'configured' : 'available-not-configured';
  }
  return featureState(result, { privateUnavailable });
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function expectSelfTestFailure(callback, message) {
  let failed = false;
  try {
    callback();
  } catch {
    failed = true;
  }
  assertSelfTest(failed, message);
}

function requireNonNegativeSafeInteger(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

export function resolveDefaultRootGate(history) {
  const roots = history?.roots instanceof Set ? [...history.roots] : [];
  const blockers = [];
  if (history?.unresolved !== 0 || roots.length !== 1) {
    blockers.push('DEFAULT_BRANCH_ROOT_HISTORY_UNVERIFIED');
  }
  if (roots.length !== 1 || roots[0] !== SANITIZED_ROOT_OID) {
    blockers.push('DEFAULT_BRANCH_ROOT_NOT_APPROVED_SANITIZED_ROOT');
  }
  return {
    defaultRoot: roots.length === 1 ? roots[0] : null,
    blockers,
  };
}

export function resolveRepositoryStateBlockers({ archived, disabled, defaultBranch }) {
  const blockers = [];
  if (archived === true) blockers.push('REPOSITORY_ARCHIVED');
  else if (archived !== false) blockers.push('REPOSITORY_ARCHIVED_STATE_UNVERIFIED');
  if (disabled === true) blockers.push('REPOSITORY_DISABLED');
  else if (disabled !== false) blockers.push('REPOSITORY_DISABLED_STATE_UNVERIFIED');
  if (defaultBranch !== 'main') blockers.push('UNAPPROVED_DEFAULT_BRANCH');
  return blockers;
}

/**
 * 将 Codespaces repository secrets 查询收敛为可用于清场 Gate 的计数与证据状态。
 *
 * 404 只有同时满足以下条件时才可回落为 0：当前对象仍是已登记的同一仓库、
 * 默认分支仍包含转移前的已审计 commit、当前为 Free Organization 的 Private
 * repository，且 secrets list 与 public-key 两个功能端点都明确不可用。任何
 * 权限错误、计划变化、仓库替换或历史替换均继续 fail closed。
 */
export function resolveCodespacesRepositorySecretAudit({
  listResult,
  publicKeyResult = null,
  repository,
  ownerPlan = null,
  baselineReachable = false,
  manualEmptyAttestation = false,
}) {
  if (listResult.ok) {
    const count = requireNonNegativeSafeInteger(
      listResult.value,
      'Codespaces repository secrets count',
    );
    return {
      count,
      state: 'api-verified',
      blocker: count === 0 ? null : 'NONEMPTY_CODESPACES_SECRETS',
    };
  }

  const baseline = CODESPACES_EMPTY_TRANSFER_BASELINES.find((entry) =>
    entry.repositoryId === repository.id &&
    entry.target === repository.nameWithOwner.toLowerCase());
  const documentedUnavailableState =
    listResult.httpStatus === 404 &&
    publicKeyResult?.httpStatus === 404 &&
    repository.private === true &&
    repository.ownerType === 'Organization' &&
    ownerPlan?.ok === true &&
    ownerPlan.value?.name === 'free';
  const verifiedEmptyTransferBaseline =
    baseline?.verifiedCount === 0 && baselineReachable === true;

  if (documentedUnavailableState && verifiedEmptyTransferBaseline &&
      manualEmptyAttestation === true) {
    return {
      count: 0,
      state: 'unavailable-on-free-private-organization-manually-attested-empty',
      blocker: null,
    };
  }

  if (documentedUnavailableState && verifiedEmptyTransferBaseline) {
    return {
      count: null,
      state: 'unavailable-on-free-private-organization-manual-empty-attestation-required',
      blocker: 'CODESPACES_REPOSITORY_SECRETS_REQUIRE_MANUAL_EMPTY_ATTESTATION',
    };
  }

  throw new Error(
    `Codespaces repository secrets query failed${
      listResult.httpStatus ? ` with HTTP ${listResult.httpStatus}` : ''
    }; no approved empty-state fallback applies.`,
  );
}

/** GitHub Apps 的仓库授权明细只可由已登录 Web UI 对精确目标仓库人工复核。 */
export function resolveGithubAppRepositoryAccessReview({
  manualReviewAttested = false,
  repository,
} = {}) {
  const exactRepository =
    repository?.id === 1292385902 &&
    repository?.nameWithOwner?.toLowerCase() === DEFAULT_TARGET.toLowerCase() &&
    repository?.ownerType === 'Organization';
  if (manualReviewAttested === true && exactRepository) {
    return { state: 'manually-reviewed-no-unapproved-repository-access', blocker: null };
  }
  if (manualReviewAttested === true) {
    return {
      state: 'manual-review-attestation-repository-mismatch',
      blocker: 'GITHUB_APP_ATTESTATION_REPOSITORY_MISMATCH',
    };
  }
  return {
      state: 'manual-review-required-sudo-protected',
      blocker: 'GITHUB_APP_REPOSITORY_ACCESS_REQUIRES_MANUAL_REVIEW',
  };
}

/**
 * 使用 API 元数据把 cache 分类为“匹配净化根之后的批准 ref”或“不匹配”。
 * 该分类只用于诊断：cache API 不提供 commit/run，root commit timestamp 又可能
 * 早于远端历史替换，因此不能证明 cache 来源。Phase 6 clean Gate 对所有非零
 * cache 都要求最终 purge。cache key、version 和 ID 不参与判断，也不进入输出。
 */
export function resolveActionsCacheAudit({
  cacheData,
  sanitizedCutoff,
  defaultBranch,
  approvedPullRequests = [],
}) {
  const total = requireNonNegativeSafeInteger(cacheData?.total, 'Actions cache total');
  const entries = Array.isArray(cacheData?.entries) ? cacheData.entries : [];
  if (entries.length !== total) {
    throw new Error('Actions cache query was incomplete or returned an invalid total.');
  }

  const cutoffTime = Date.parse(sanitizedCutoff);
  if (!Number.isFinite(cutoffTime)) {
    throw new Error('Sanitized Actions cache cutoff is unavailable or invalid.');
  }
  const approvedPulls = new Map(
    approvedPullRequests.map((entry) => [String(entry.number), entry]),
  );
  let defaultBranchCaches = 0;
  let sanitizedPullRequestCaches = 0;
  let unapproved = 0;

  for (const entry of entries) {
    const createdTime = Date.parse(entry.created_at);
    if (!Number.isFinite(createdTime) || createdTime <= cutoffTime) {
      unapproved += 1;
      continue;
    }
    if (entry.ref === `refs/heads/${defaultBranch}`) {
      defaultBranchCaches += 1;
      continue;
    }

    const pullRef = String(entry.ref ?? '').match(/^refs\/pull\/(\d+)\/merge$/);
    const pull = pullRef ? approvedPulls.get(pullRef[1]) : null;
    const pullCreatedTime = Date.parse(pull?.createdAt);
    if (pull?.baseAndHeadUseDefaultRoot === true &&
        Number.isFinite(pullCreatedTime) && pullCreatedTime > cutoffTime &&
        createdTime >= pullCreatedTime) {
      sanitizedPullRequestCaches += 1;
      continue;
    }
    unapproved += 1;
  }

  return {
    total,
    postRootMetadataMatched: total - unapproved,
    unapproved,
    metadataMatchedByRefClass: {
      defaultBranch: defaultBranchCaches,
      sanitizedPullRequest: sanitizedPullRequestCaches,
    },
    blocker: total === 0
      ? null
      : (unapproved === 0
        ? 'NONEMPTY_ACTIONS_CACHES_REQUIRE_FINAL_PURGE'
        : 'UNAPPROVED_OR_PRE_SANITIZATION_ACTIONS_CACHES'),
  };
}

export function classifyRuntimeWorkflows({ total, entries }, approvedCommittedPaths) {
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(entries) ||
      entries.length !== total) {
    throw new Error('Actions workflow query was incomplete or returned an invalid total.');
  }
  const approvedCommitted = new Set(approvedCommittedPaths);
  const approvedDynamic = entries.filter((entry) =>
    APPROVED_GITHUB_DYNAMIC_WORKFLOWS.has(entry.path));
  return {
    total,
    active: entries.filter((entry) => entry.state === 'active').length,
    inactive: entries.filter((entry) => entry.state !== 'active').length,
    approvedDynamic: approvedDynamic.length,
    unapproved: entries.filter((entry) =>
      !approvedCommitted.has(entry.path) &&
      !APPROVED_GITHUB_DYNAMIC_WORKFLOWS.has(entry.path)).length,
  };
}

export function classifyCommittedWorkflowBlobs(localEntries, remoteEntries) {
  if (!Array.isArray(localEntries) || !Array.isArray(remoteEntries)) {
    throw new Error('Workflow blob comparison requires complete entry arrays.');
  }
  const localByPath = new Map(localEntries.map((entry) => [entry.path, entry]));
  const comparableRemote = remoteEntries.filter((entry) =>
    entry.type === 'file' && /\.ya?ml$/i.test(entry.path) && localByPath.has(entry.path));
  return {
    matching: comparableRemote.filter((entry) =>
      /^[0-9a-f]{40}$/i.test(String(entry.sha ?? '')) &&
      localByPath.get(entry.path).sha === entry.sha).length,
    mismatched: comparableRemote.filter((entry) =>
      !/^[0-9a-f]{40}$/i.test(String(entry.sha ?? '')) ||
      localByPath.get(entry.path).sha !== entry.sha).length,
  };
}

export function validateCompleteActionsRunPage({ total, entries }) {
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(entries) ||
      entries.length !== total) {
    throw new Error('Actions runs query exceeded one complete page; refusing partial history audit.');
  }
  if (entries.some((entry) => !/^[0-9a-f]{40}$/i.test(String(entry.head_sha ?? '')))) {
    throw new Error('Actions run query contains an absent or invalid head SHA.');
  }
}

/** 仅放行结构完全为空的 GitHub-managed `copilot` environment。 */
export function resolveEnvironmentAudit({ total, entries }) {
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(entries) ||
      entries.length !== total) {
    throw new Error('Environment query was incomplete or returned an invalid total.');
  }
  let platformEmpty = 0;
  let unapproved = 0;
  for (const entry of entries) {
    const isPlatformEmptyCopilot =
      entry.name === 'copilot' &&
      Array.isArray(entry.protectionRules) && entry.protectionRules.length === 0 &&
      entry.deploymentBranchPolicy === null &&
      entry.secrets === 0 &&
      entry.variables === 0 &&
      entry.deployments === 0;
    if (isPlatformEmptyCopilot) platformEmpty += 1;
    else unapproved += 1;
  }
  return {
    total,
    platformEmpty,
    unapproved,
    state: total === 0
      ? 'none'
      : (unapproved === 0 ? 'github-managed-copilot-platform-empty' : 'configured-or-unapproved'),
    blocker: unapproved === 0 ? null : 'UNAPPROVED_OR_CONFIGURED_ENVIRONMENTS',
  };
}

function runSelfTests() {
  for (const operationalArgs of [
    ['--require-clean'],
    ['--attest-codespaces-secrets-empty'],
    ['--attest-github-apps-reviewed'],
    ['--repository', DEFAULT_TARGET],
    ['--target', DEFAULT_TARGET],
  ]) {
    expectSelfTestFailure(
      () => parseArgs(['--self-test', ...operationalArgs]),
      `--self-test combined with ${operationalArgs[0]} must be rejected`,
    );
  }

  const exactRootGate = resolveDefaultRootGate({
    unresolved: 0,
    roots: new Set([SANITIZED_ROOT_OID]),
  });
  assertSelfTest(exactRootGate.blockers.length === 0,
    'the exact approved sanitized root must pass the root gate');
  const substitutedRootGate = resolveDefaultRootGate({
    unresolved: 0,
    roots: new Set(['f'.repeat(40)]),
  });
  assertSelfTest(
    substitutedRootGate.blockers.includes('DEFAULT_BRANCH_ROOT_NOT_APPROVED_SANITIZED_ROOT'),
    'a different single root must remain blocked',
  );
  assertSelfTest(resolveRepositoryStateBlockers({
    archived: false,
    disabled: false,
    defaultBranch: 'main',
  }).length === 0, 'an active repository with default branch main must pass state checks');
  for (const [label, state, expected] of [
    ['archived', { archived: true, disabled: false, defaultBranch: 'main' }, 'REPOSITORY_ARCHIVED'],
    ['disabled', { archived: false, disabled: true, defaultBranch: 'main' }, 'REPOSITORY_DISABLED'],
    ['wrong default branch', {
      archived: false, disabled: false, defaultBranch: 'master',
    }, 'UNAPPROVED_DEFAULT_BRANCH'],
    ['unknown archived state', {
      archived: null, disabled: false, defaultBranch: 'main',
    }, 'REPOSITORY_ARCHIVED_STATE_UNVERIFIED'],
    ['unknown disabled state', {
      archived: false, disabled: null, defaultBranch: 'main',
    }, 'REPOSITORY_DISABLED_STATE_UNVERIFIED'],
  ]) {
    assertSelfTest(resolveRepositoryStateBlockers(state).includes(expected),
      `${label} repository state must remain blocked`);
  }

  const validPullRefSummary = summarizeRemoteRefs([
    { ref: 'refs/heads/main' },
    { ref: 'refs/pull/1/head' },
    { ref: 'refs/pull/1/merge' },
  ]);
  assertSelfTest(
    validPullRefSummary.pullRequests === 2 &&
      validPullRefSummary.invalidPullRequestShapes === 0,
    'standard pull head and merge refs must be recognized exactly',
  );
  const invalidPullRefSummary = summarizeRemoteRefs([
    { ref: 'refs/heads/main' },
    { ref: 'refs/pull/1/unexpected' },
  ]);
  assertSelfTest(invalidPullRefSummary.invalidPullRequestShapes === 1,
    'a non-standard refs/pull shape must remain visible to the gate',
  );

  const repository = {
    id: 1292385902,
    nameWithOwner: DEFAULT_TARGET,
    private: true,
    ownerType: 'Organization',
  };
  const freePlan = { ok: true, httpStatus: null, value: { name: 'free' } };
  const notFound = { ok: false, httpStatus: 404, value: null };

  const direct = resolveCodespacesRepositorySecretAudit({
    listResult: { ok: true, httpStatus: null, value: 2 },
    repository,
  });
  assertSelfTest(direct.count === 2 && direct.state === 'api-verified',
    'a successful API count must remain authoritative');
  for (const invalidCount of [null, '0', false, true, -1, Number.MAX_SAFE_INTEGER + 1]) {
    expectSelfTestFailure(
      () => resolveCodespacesRepositorySecretAudit({
        listResult: { ok: true, httpStatus: null, value: invalidCount },
        repository,
      }),
      `Codespaces count ${String(invalidCount)} must not be coerced or accepted`,
    );
  }

  const approvedFallback = resolveCodespacesRepositorySecretAudit({
    listResult: notFound,
    publicKeyResult: notFound,
    repository,
    ownerPlan: freePlan,
    baselineReachable: true,
    manualEmptyAttestation: true,
  });
  assertSelfTest(
    approvedFallback.count === 0 && approvedFallback.state.includes('attested-empty'),
    'the exact Free/private transferred repository baseline plus UI attestation must resolve to zero',
  );

  const pendingAttestation = resolveCodespacesRepositorySecretAudit({
    listResult: notFound,
    publicKeyResult: notFound,
    repository,
    ownerPlan: freePlan,
    baselineReachable: true,
  });
  assertSelfTest(
    pendingAttestation.count === null && pendingAttestation.blocker?.includes('ATTESTATION'),
    'documented endpoint unavailability without UI attestation must remain blocked',
  );

  for (const [label, overrides] of [
    ['unknown repository ID', { repository: { ...repository, id: repository.id + 1 } }],
    ['public repository', { repository: { ...repository, private: false } }],
    ['paid plan', { ownerPlan: { ...freePlan, value: { name: 'team' } } }],
    ['reachable baseline missing', { baselineReachable: false }],
    ['public key endpoint available', {
      publicKeyResult: { ok: true, httpStatus: null, value: { available: true } },
    }],
    ['permission failure', { listResult: { ok: false, httpStatus: 403, value: null } }],
  ]) {
    expectSelfTestFailure(
      () => resolveCodespacesRepositorySecretAudit({
        listResult: notFound,
        publicKeyResult: notFound,
        repository,
        ownerPlan: freePlan,
        baselineReachable: true,
        manualEmptyAttestation: true,
        ...overrides,
      }),
      `${label} must fail closed`,
    );
  }

  assertSelfTest(
    resolveGithubAppRepositoryAccessReview({ repository }).blocker?.includes('MANUAL_REVIEW'),
    'GitHub Apps must remain blocked without explicit UI attestation',
  );
  assertSelfTest(
    resolveGithubAppRepositoryAccessReview({
      manualReviewAttested: true,
      repository,
    }).blocker === null,
    'an explicit GitHub Apps UI attestation must release only that blocker',
  );
  for (const [label, mismatchedRepository] of [
    ['repository ID', { ...repository, id: repository.id + 1 }],
    ['repository name', { ...repository, nameWithOwner: 'ZUnfurl/other' }],
    ['owner type', { ...repository, ownerType: 'User' }],
  ]) {
    assertSelfTest(
      resolveGithubAppRepositoryAccessReview({
        manualReviewAttested: true,
        repository: mismatchedRepository,
      }).blocker === 'GITHUB_APP_ATTESTATION_REPOSITORY_MISMATCH',
      `GitHub Apps attestation with a mismatched ${label} must remain blocked`,
    );
  }

  const sanitizedCacheAudit = resolveActionsCacheAudit({
    cacheData: {
      total: 2,
      entries: [
        { ref: 'refs/heads/main', created_at: '2026-08-16T03:10:00Z' },
        { ref: 'refs/pull/4/merge', created_at: '2026-08-16T03:50:00Z' },
      ],
    },
    sanitizedCutoff: '2026-08-16T03:08:29Z',
    defaultBranch: 'main',
    approvedPullRequests: [{
      number: 4,
      createdAt: '2026-08-16T03:45:18Z',
      baseAndHeadUseDefaultRoot: true,
    }],
  });
  assertSelfTest(
    sanitizedCacheAudit.postRootMetadataMatched === 2 &&
      sanitizedCacheAudit.blocker === 'NONEMPTY_ACTIONS_CACHES_REQUIRE_FINAL_PURGE',
    'post-root metadata matches must remain blocked until the final cache purge',
  );
  const emptyCacheAudit = resolveActionsCacheAudit({
    cacheData: { total: 0, entries: [] },
    sanitizedCutoff: '2026-08-16T03:08:29Z',
    defaultBranch: 'main',
  });
  assertSelfTest(emptyCacheAudit.blocker === null,
    'only an empty Actions cache collection may pass the Phase 6 cache gate');

  for (const [label, entry] of [
    ['pre-sanitization cache', {
      ref: 'refs/heads/main', created_at: '2026-08-16T03:08:29Z',
    }],
    ['unknown branch cache', {
      ref: 'refs/heads/feature', created_at: '2026-08-16T03:50:00Z',
    }],
    ['unknown PR cache', {
      ref: 'refs/pull/99/merge', created_at: '2026-08-16T03:50:00Z',
    }],
  ]) {
    const result = resolveActionsCacheAudit({
      cacheData: { total: 1, entries: [entry] },
      sanitizedCutoff: '2026-08-16T03:08:29Z',
      defaultBranch: 'main',
      approvedPullRequests: [{
        number: 4,
        createdAt: '2026-08-16T03:45:18Z',
        baseAndHeadUseDefaultRoot: true,
      }],
    });
    assertSelfTest(result.unapproved === 1 && result.blocker != null,
      `${label} must remain blocked`);
  }
  const unprovenPullCache = resolveActionsCacheAudit({
    cacheData: { total: 1, entries: [{
      ref: 'refs/pull/4/merge', created_at: '2026-08-16T03:50:00Z',
    }] },
    sanitizedCutoff: '2026-08-16T03:08:29Z',
    defaultBranch: 'main',
    approvedPullRequests: [{
      number: 4,
      createdAt: '2026-08-16T03:45:18Z',
      baseAndHeadUseDefaultRoot: false,
    }],
  });
  assertSelfTest(unprovenPullCache.unapproved === 1,
    'a PR cache without sanitized base and head proof must remain blocked');
  const preRootPullCache = resolveActionsCacheAudit({
    cacheData: { total: 1, entries: [{
      ref: 'refs/pull/4/merge', created_at: '2026-08-16T03:50:00Z',
    }] },
    sanitizedCutoff: '2026-08-16T03:08:29Z',
    defaultBranch: 'main',
    approvedPullRequests: [{
      number: 4,
      createdAt: '2026-08-16T03:08:29Z',
      baseAndHeadUseDefaultRoot: true,
    }],
  });
  assertSelfTest(preRootPullCache.unapproved === 1,
    'a PR created at or before the sanitized root cutoff must remain blocked');
  expectSelfTestFailure(
    () => resolveActionsCacheAudit({
      cacheData: { total: 2, entries: [{
        ref: 'refs/heads/main', created_at: '2026-08-16T03:10:00Z',
      }] },
      sanitizedCutoff: '2026-08-16T03:08:29Z',
      defaultBranch: 'main',
    }),
    'an incomplete Actions cache page must fail closed',
  );
  for (const invalidTotal of [null, '0', false, true, -1, Number.MAX_SAFE_INTEGER + 1]) {
    expectSelfTestFailure(
      () => resolveActionsCacheAudit({
        cacheData: { total: invalidTotal, entries: [] },
        sanitizedCutoff: '2026-08-16T03:08:29Z',
        defaultBranch: 'main',
      }),
      `Actions cache total ${String(invalidTotal)} must not be coerced or accepted`,
    );
  }

  const workflowClassification = classifyRuntimeWorkflows({
    total: 3,
    entries: [
      { path: '.github/workflows/preview.yml', state: 'active' },
      { path: 'dynamic/agents/copilot-pull-request-reviewer', state: 'active' },
      { path: 'dynamic/dependabot/dependabot-updates', state: 'active' },
    ],
  }, ['.github/workflows/preview.yml']);
  assertSelfTest(
    workflowClassification.approvedDynamic === 2 &&
      workflowClassification.unapproved === 0 && workflowClassification.inactive === 0,
    'only the two exact active GitHub dynamic workflow paths may be classified as approved',
  );
  const unknownDynamic = classifyRuntimeWorkflows({
    total: 1,
    entries: [{ path: 'dynamic/agents/unknown', state: 'active' }],
  }, []);
  assertSelfTest(unknownDynamic.unapproved === 1,
    'an unknown dynamic workflow path must remain unapproved');
  expectSelfTestFailure(
    () => classifyRuntimeWorkflows({ total: 2, entries: [] }, []),
    'an incomplete workflow page must fail closed',
  );
  const workflowBlobClassification = classifyCommittedWorkflowBlobs(
    [
      { path: '.github/workflows/a.yml', sha: 'a'.repeat(40) },
      { path: '.github/workflows/b.yml', sha: 'b'.repeat(40) },
    ],
    [
      { path: '.github/workflows/a.yml', type: 'file', sha: 'a'.repeat(40) },
      { path: '.github/workflows/b.yml', type: 'file', sha: 'c'.repeat(40) },
    ],
  );
  assertSelfTest(
    workflowBlobClassification.matching === 1 &&
      workflowBlobClassification.mismatched === 1,
    'remote workflow blobs must be compared against exact local HEAD blob SHAs',
  );
  validateCompleteActionsRunPage({
    total: 1,
    entries: [{ head_sha: 'a'.repeat(40) }],
  });
  expectSelfTestFailure(
    () => validateCompleteActionsRunPage({
      total: 1,
      entries: [{ head_sha: null }],
    }),
    'an Actions run without a 40-character head SHA must fail closed',
  );
  const knownLogStates = classifyLogArchiveResults([
    { ok: true, httpStatus: null },
    { ok: false, httpStatus: 404 },
    { ok: false, httpStatus: 410 },
  ]);
  assertSelfTest(
    knownLogStates.available === 1 && knownLogStates.confirmedUnavailable === 2 &&
      knownLogStates.unverified === 0,
    'readable logs and explicit 404/410 states must remain distinguishable',
  );
  const unknownLogStates = classifyLogArchiveResults([
    { ok: false, httpStatus: 403 },
    { ok: false, httpStatus: 500 },
    { ok: false, httpStatus: null },
  ]);
  assertSelfTest(
    unknownLogStates.forbidden === 1 && unknownLogStates.unknown === 2 &&
      unknownLogStates.unverified === 3,
    '403 and unknown log archive states must remain unverified',
  );

  const emptyCopilotEnvironment = {
    name: 'copilot',
    protectionRules: [],
    deploymentBranchPolicy: null,
    secrets: 0,
    variables: 0,
    deployments: 0,
  };
  const environmentAudit = resolveEnvironmentAudit({
    total: 1,
    entries: [emptyCopilotEnvironment],
  });
  assertSelfTest(environmentAudit.platformEmpty === 1 && environmentAudit.blocker === null,
    'the exact empty copilot environment may be classified as platform-empty');
  for (const [label, environment] of [
    ['production-named environment', { ...emptyCopilotEnvironment, name: 'production' }],
    ['copilot environment with a secret', { ...emptyCopilotEnvironment, secrets: 1 }],
    ['copilot environment with a deployment', { ...emptyCopilotEnvironment, deployments: 1 }],
    ['copilot environment with branch policy', {
      ...emptyCopilotEnvironment,
      deploymentBranchPolicy: { protected_branches: true },
    }],
  ]) {
    const result = resolveEnvironmentAudit({ total: 1, entries: [environment] });
    assertSelfTest(result.unapproved === 1 && result.blocker != null,
      `${label} must remain blocked`);
  }
}

/** 执行仓库容器审计；返回值不会携带 secret、变量值或远程对象名称。 */
export function auditPhase6Repository({
  repository = repositoryFromOrigin(),
  target = DEFAULT_TARGET,
  codespacesSecretsEmptyAttested = false,
  githubAppsReviewedAttested = false,
} = {}) {
  const { owner, name } = splitRepository(repository);
  const { owner: targetOwner, name: targetName } = splitRepository(target);
  const repo = ghJson(
    `repos/${repository}`,
    '{id: .id, name_with_owner: .full_name, owner_type: .owner.type, private: .private, visibility: .visibility, is_template: .is_template, default_branch: .default_branch, archived: .archived, disabled: .disabled, has_issues: .has_issues, has_projects: .has_projects, has_wiki: .has_wiki, has_discussions: .has_discussions, fork_count: .fork_count, allow_forking: .allow_forking, web_commit_signoff_required: .web_commit_signoff_required, security_and_analysis: .security_and_analysis}',
    'repository metadata query',
  );

  const graph = ghGraphql({
    owner,
    name,
    label: 'repository GraphQL count query',
    query: `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        packages(first: 1) { totalCount }
        discussions(first: 1) { totalCount }
        pullRequests(first: 1) { totalCount }
        defaultBranchRef {
          target { ... on Commit { history(first: 1) { totalCount } oid } }
        }
      }
    }`,
    jq: '{packages: .data.repository.packages.totalCount, discussions: .data.repository.discussions.totalCount, pull_requests: .data.repository.pullRequests.totalCount, commits: .data.repository.defaultBranchRef.target.history.totalCount, head_oid: .data.repository.defaultBranchRef.target.oid}',
  });

  const branches = ghJson(
    `repos/${repository}/branches?per_page=100`,
    '{count: length, protected: ([.[] | select(.protected == true)] | length)}',
  );
  const actionsRunData = ghJson(
    `repos/${repository}/actions/runs?per_page=100`,
    '{total: .total_count, completed: ([.workflow_runs[] | select(.status == "completed")] | length), success: ([.workflow_runs[] | select(.conclusion == "success")] | length), failure: ([.workflow_runs[] | select(.conclusion == "failure")] | length), entries: [.workflow_runs[] | {id: .id, head_sha: .head_sha}]}',
  );
  validateCompleteActionsRunPage(actionsRunData);
  const logArchives = countAvailableLogArchives(
    repository,
    actionsRunData.entries.map((entry) => entry.id),
  );

  const remoteWorkflows = ghJson(
    `repos/${repository}/actions/workflows?per_page=100`,
    '{total: .total_count, entries: [.workflows[] | {path: .path, state: .state}]}',
  );
  const localBinding = localRepositoryBindingState();
  const localWorkflowEntriesAtHead = localHeadWorkflowEntries();
  const approvedWorkflowPaths = localWorkflowEntriesAtHead.map((entry) => entry.path);
  const approvedWorkflowSet = new Set(approvedWorkflowPaths);
  const committedWorkflowEntries = ghJson(
    `repos/${repository}/contents/.github/workflows?ref=${encodeURIComponent(repo.default_branch)}`,
    '[.[] | {path: .path, type: .type, sha: .sha}]',
    'default-branch workflow contents query',
  );
  const committedWorkflowPaths = committedWorkflowEntries
    .filter((entry) => entry.type === 'file' && /\.ya?ml$/i.test(entry.path))
    .map((entry) => entry.path)
    .sort();
  const committedWorkflowSet = new Set(committedWorkflowPaths);
  const committedWorkflowBlobClassification = classifyCommittedWorkflowBlobs(
    localWorkflowEntriesAtHead,
    committedWorkflowEntries,
  );
  const runtimeWorkflowClassification = classifyRuntimeWorkflows(
    remoteWorkflows,
    approvedWorkflowPaths,
  );
  const workflows = {
    runtimeTotal: runtimeWorkflowClassification.total,
    runtimeActive: runtimeWorkflowClassification.active,
    runtimeInactive: runtimeWorkflowClassification.inactive,
    runtimeApprovedDynamic: runtimeWorkflowClassification.approvedDynamic,
    runtimeUnapproved: runtimeWorkflowClassification.unapproved,
    committedRemoteTotal: committedWorkflowPaths.length,
    approvedLocalTotal: approvedWorkflowPaths.length,
    matchingCommitted: committedWorkflowPaths.filter((entry) => approvedWorkflowSet.has(entry)).length,
    matchingCommittedBlobs: committedWorkflowBlobClassification.matching,
    committedBlobMismatches: committedWorkflowBlobClassification.mismatched,
    unapprovedCommitted: committedWorkflowPaths.filter((entry) => !approvedWorkflowSet.has(entry)).length,
    missingCommitted: approvedWorkflowPaths.filter((entry) => !committedWorkflowSet.has(entry)).length,
    localHeadMatchesRemoteDefault: localBinding.headOid === graph.head_oid,
    localWorkflowWorktreeAndIndexClean: localBinding.workflowWorktreeAndIndexClean,
  };
  const actionsPermissions = ghJson(
    `repos/${repository}/actions/permissions`,
    '{enabled: .enabled, allowed_actions: .allowed_actions, sha_pinning_required: (.sha_pinning_required // false)}',
  );
  const workflowPermissions = ghJson(
    `repos/${repository}/actions/permissions/workflow`,
    '{default_workflow_permissions: .default_workflow_permissions, can_approve_pull_request_reviews: .can_approve_pull_request_reviews}',
  );

  const rulesets = ghStatus(`repos/${repository}/rulesets?per_page=100`, 'length');
  const branchProtection = ghStatus(
    `repos/${repository}/branches/${repo.default_branch}/protection`,
    '{configured: true}',
  );
  const pages = ghStatus(`repos/${repository}/pages`, '{configured: true}');
  const pvr = ghStatus(
    `repos/${repository}/private-vulnerability-reporting`,
    '{enabled: .enabled}',
  );
  const vulnerabilityAlerts = ghStatus(`repos/${repository}/vulnerability-alerts`, '.');
  const automatedSecurityFixes = ghStatus(
    `repos/${repository}/automated-security-fixes`,
    '{enabled: true}',
  );
  const dependabotAlerts = ghStatus(
    `repos/${repository}/dependabot/alerts?per_page=1`,
    'length',
  );
  const codeScanning = ghStatus(
    `repos/${repository}/code-scanning/alerts?per_page=1`,
    'length',
  );
  const secretScanning = ghStatus(
    `repos/${repository}/secret-scanning/alerts?per_page=1`,
    'length',
  );

  const targetAccount = ghStatus(`users/${targetOwner}`, '{exists: true, type: .type}');
  const targetRepository = ghStatus(`repos/${targetOwner}/${targetName}`, '{exists: true}');

  const codespacesSecretsList = ghStatus(
    `repos/${repository}/codespaces/secrets?per_page=1`,
    '.total_count',
  );
  let codespacesSecretsPublicKey = null;
  let codespacesOwnerPlan = null;
  let codespacesBaselineReachable = false;
  if (!codespacesSecretsList.ok) {
    codespacesSecretsPublicKey = ghStatus(
      `repos/${repository}/codespaces/secrets/public-key`,
      '{available: true}',
    );
    if (repo.owner_type === 'Organization') {
      codespacesOwnerPlan = ghStatus(`orgs/${owner}`, '{name: (.plan.name // null)}');
    }
    const baseline = CODESPACES_EMPTY_TRANSFER_BASELINES.find((entry) =>
      entry.repositoryId === repo.id &&
      entry.target === repo.name_with_owner.toLowerCase());
    if (baseline) {
      const reachability = ghStatus(
        `repos/${repository}/compare/${baseline.verifiedHeadOid}...${graph.head_oid}`,
        '{status: .status, ahead_by: .ahead_by}',
      );
      codespacesBaselineReachable = graph.head_oid === baseline.verifiedHeadOid ||
        (reachability.ok && ['identical', 'ahead'].includes(reachability.value?.status));
    }
  }
  const codespacesSecretAudit = resolveCodespacesRepositorySecretAudit({
    listResult: codespacesSecretsList,
    publicKeyResult: codespacesSecretsPublicKey,
    repository: {
      id: repo.id,
      nameWithOwner: repo.name_with_owner,
      private: repo.private,
      ownerType: repo.owner_type,
    },
    ownerPlan: codespacesOwnerPlan,
    baselineReachable: codespacesBaselineReachable,
    manualEmptyAttestation: codespacesSecretsEmptyAttested,
  });
  const githubAppReview = resolveGithubAppRepositoryAccessReview({
    manualReviewAttested: githubAppsReviewedAttested,
    repository: {
      id: repo.id,
      nameWithOwner: repo.name_with_owner,
      ownerType: repo.owner_type,
    },
  });

  const advertisedRefs = listRemoteRefs(repository);
  const remoteRefSummary = summarizeRemoteRefs(advertisedRefs);
  const pullRequestRecords = ghJson(
    `repos/${repository}/pulls?state=all&per_page=100`,
    '[.[] | {number: .number, state: .state, created_at: .created_at, merged_at: .merged_at, head_sha: .head.sha, base_sha: .base.sha, base_ref: .base.ref, merge_commit_sha: .merge_commit_sha}]',
    'pull request history query',
  );
  if (pullRequestRecords.length !== graph.pull_requests) {
    throw new Error('Pull request query exceeded one complete page; refusing partial ref audit.');
  }
  const pullRequestByNumber = new Map(
    pullRequestRecords.map((entry) => [String(entry.number), entry]),
  );
  const retainedPullRefs = advertisedRefs
    .map((entry) => {
      const match = entry.ref.match(/^refs\/pull\/(\d+)\/(head|merge)$/);
      return match ? { ...entry, number: match[1], kind: match[2] } : null;
    })
    .filter(Boolean);
  const retainedPullHeadRecords = retainedPullRefs
    .filter((entry) => entry.kind === 'head')
    .map((entry) => ({ ref: entry, pull: pullRequestByNumber.get(entry.number) }));
  const defaultHistory = inspectCommitGraph(repository, [graph.head_oid]);
  const retainedPullHistory = inspectCommitGraph(
    repository,
    retainedPullHeadRecords.map((entry) => entry.ref.sha),
  );
  const retainedPullBaseHistory = inspectCommitGraph(
    repository,
    retainedPullHeadRecords.map((entry) => entry.pull?.base_sha),
  );
  const actionHistory = inspectCommitGraph(
    repository,
    actionsRunData.entries.map((entry) => entry.head_sha),
  );
  const defaultRootGate = resolveDefaultRootGate(defaultHistory);
  const defaultRoot = defaultRootGate.defaultRoot;
  const graphUsesOnlyDefaultRoot = (history) =>
    history.unresolved === 0 && history.roots.size <= 1 &&
    (history.roots.size === 0 || history.roots.has(defaultRoot));
  const actionsRuns = {
    total: actionsRunData.total,
    completed: actionsRunData.completed,
    success: actionsRunData.success,
    failure: actionsRunData.failure,
    sanitizedHistory: graphUsesOnlyDefaultRoot(actionHistory)
      ? actionsRunData.total
      : 0,
  };
  const actionsCacheData = ghJson(
    `repos/${repository}/actions/caches?per_page=100`,
    '{total: .total_count, entries: [.actions_caches[] | {ref: .ref, created_at: .created_at}]}',
    'Actions cache metadata query',
  );
  const actionsCacheTotal = requireNonNegativeSafeInteger(
    actionsCacheData.total,
    'Actions cache total',
  );
  if (!Array.isArray(actionsCacheData.entries) ||
      actionsCacheData.entries.length !== actionsCacheTotal) {
    throw new Error('Actions cache query was incomplete or returned an invalid total.');
  }
  let actionsCacheAudit;
  if (defaultRoot === SANITIZED_ROOT_OID) {
    const rootCommit = ghJson(
      `repos/${repository}/git/commits/${defaultRoot}`,
      '{committed_at: (.committer.date // .author.date)}',
      'default root commit timestamp query',
    );
    const approvedPullRequests = graphUsesOnlyDefaultRoot(retainedPullHistory) &&
      graphUsesOnlyDefaultRoot(retainedPullBaseHistory)
      ? retainedPullHeadRecords
        .filter(({ ref, pull }) =>
          pull?.state === 'closed' &&
          pull.head_sha === ref.sha &&
          pull.base_sha &&
          pull.base_ref === repo.default_branch)
        .map(({ pull }) => ({
          number: pull.number,
          createdAt: pull.created_at,
          baseAndHeadUseDefaultRoot: true,
        }))
      : [];
    actionsCacheAudit = resolveActionsCacheAudit({
      cacheData: actionsCacheData,
      sanitizedCutoff: rootCommit.committed_at,
      defaultBranch: repo.default_branch,
      approvedPullRequests,
    });
  } else {
    actionsCacheAudit = {
      total: actionsCacheTotal,
      postRootMetadataMatched: 0,
      unapproved: actionsCacheTotal,
      metadataMatchedByRefClass: { defaultBranch: 0, sanitizedPullRequest: 0 },
      blocker: actionsCacheTotal === 0
        ? null
        : 'ACTIONS_CACHE_SANITIZED_ROOT_UNVERIFIED',
    };
  }
  const environmentData = ghJson(
    `repos/${repository}/environments?per_page=100`,
    '{total: .total_count, entries: [.environments[] | {name: .name, protection_rules: .protection_rules, deployment_branch_policy: .deployment_branch_policy}]}',
    'environment metadata query',
  );
  const environmentEntries = environmentData.entries.map((entry) => {
    const encodedName = encodeURIComponent(entry.name);
    return {
      name: entry.name,
      protectionRules: entry.protection_rules,
      deploymentBranchPolicy: entry.deployment_branch_policy,
      secrets: ghJson(
        `repos/${repository}/environments/${encodedName}/secrets?per_page=1`,
        '.total_count',
        'environment secrets count query',
      ),
      variables: ghJson(
        `repos/${repository}/environments/${encodedName}/variables?per_page=1`,
        '.total_count',
        'environment variables count query',
      ),
      deployments: ghJson(
        `repos/${repository}/deployments?environment=${encodedName}&per_page=1`,
        'length',
        'environment deployments presence query',
      ),
    };
  });
  const environmentAudit = resolveEnvironmentAudit({
    total: environmentData.total,
    entries: environmentEntries,
  });

  const counts = {
    remoteRefs: remoteRefSummary,
    branches,
    tags: ghJson(`repos/${repository}/tags?per_page=100`, 'length'),
    pullRequests: pullRequestRecords.length,
    openPullRequests: pullRequestRecords.filter((entry) => entry.state === 'open').length,
    issues: ghJson(
      `repos/${repository}/issues?state=all&per_page=100`,
      '[.[] | select(.pull_request == null)] | length',
    ),
    discussions: graph.discussions,
    releases: ghJson(`repos/${repository}/releases?per_page=100`, 'length'),
    deployments: ghJson(`repos/${repository}/deployments?per_page=100`, 'length'),
    environments: environmentAudit.total,
    webhooks: ghJson(`repos/${repository}/hooks?per_page=100`, 'length'),
    deployKeys: ghJson(`repos/${repository}/keys?per_page=100`, 'length'),
    collaborators: ghJson(`repos/${repository}/collaborators?affiliation=all&per_page=100`, 'length'),
    forks: ghJson(`repos/${repository}/forks?per_page=100`, 'length'),
    packages: graph.packages,
    actionsArtifacts: ghJson(`repos/${repository}/actions/artifacts?per_page=1`, '.total_count'),
    actionsCaches: actionsCacheAudit.total,
    actionsSecrets: ghJson(`repos/${repository}/actions/secrets?per_page=1`, '.total_count'),
    dependabotSecrets: ghJson(`repos/${repository}/dependabot/secrets?per_page=1`, '.total_count'),
    codespacesSecrets: codespacesSecretAudit.count,
    actionsVariables: ghJson(`repos/${repository}/actions/variables?per_page=1`, '.total_count'),
  };

  const lfs = countReachableLfsPointers(repository);
  const cleanupBlockers = [];
  cleanupBlockers.push(...resolveRepositoryStateBlockers({
    archived: repo.archived,
    disabled: repo.disabled,
    defaultBranch: repo.default_branch,
  }));
  if (!repo.private) cleanupBlockers.push('REPOSITORY_NOT_PRIVATE');
  if (!repo.is_template) cleanupBlockers.push('TEMPLATE_MODE_DISABLED');
  cleanupBlockers.push(...defaultRootGate.blockers);
  if (counts.remoteRefs.branches !== 1 || counts.remoteRefs.tags !== 0 ||
      counts.remoteRefs.other !== 0) {
    cleanupBlockers.push('UNAPPROVED_REMOTE_REFS');
  }
  if (counts.remoteRefs.invalidPullRequestShapes !== 0 ||
      counts.remoteRefs.pullRequests !==
        counts.remoteRefs.pullRequestHeads + counts.remoteRefs.pullRequestMerges) {
    cleanupBlockers.push('INVALID_PULL_REQUEST_REF_SHAPE');
  }
  const retainedPullRefsAreApproved =
    counts.openPullRequests === 0 &&
    counts.remoteRefs.pullRequests ===
      counts.remoteRefs.pullRequestHeads + counts.remoteRefs.pullRequestMerges &&
    counts.remoteRefs.pullRequestMerges === 0 &&
    retainedPullHeadRecords.length === counts.remoteRefs.pullRequestHeads &&
    retainedPullHeadRecords.every(({ ref, pull }) =>
      pull?.state === 'closed' && pull.head_sha === ref.sha) &&
    graphUsesOnlyDefaultRoot(retainedPullHistory);
  if (!retainedPullRefsAreApproved) {
    cleanupBlockers.push('UNAPPROVED_PULL_REQUEST_REFS');
  }
  if (actionsRuns.total !== actionsRuns.sanitizedHistory) {
    cleanupBlockers.push('PRE_CANDIDATE_ACTIONS_RUNS_OR_LOGS');
  }
  if (logArchives.unverified !== 0) {
    cleanupBlockers.push('ACTION_LOG_ARCHIVE_STATUS_UNVERIFIED');
  }
  if (workflows.unapprovedCommitted !== 0 || workflows.missingCommitted !== 0 ||
      workflows.runtimeUnapproved !== 0 || workflows.runtimeInactive !== 0) {
    cleanupBlockers.push('REMOTE_WORKFLOW_PATH_SET_MISMATCH');
  }
  if (!workflows.localHeadMatchesRemoteDefault) {
    cleanupBlockers.push('LOCAL_HEAD_DOES_NOT_MATCH_REMOTE_DEFAULT_HEAD');
  }
  if (!workflows.localWorkflowWorktreeAndIndexClean) {
    cleanupBlockers.push('LOCAL_WORKFLOW_WORKTREE_OR_INDEX_DIRTY');
  }
  if (workflows.committedBlobMismatches !== 0 ||
      workflows.matchingCommittedBlobs !== workflows.approvedLocalTotal) {
    cleanupBlockers.push('REMOTE_WORKFLOW_BLOB_MISMATCH');
  }
  for (const [nameKey, value] of Object.entries({
    releases: counts.releases,
    issues: counts.issues,
    discussions: counts.discussions,
    deployments: counts.deployments,
    webhooks: counts.webhooks,
    deployKeys: counts.deployKeys,
    forks: counts.forks,
    packages: counts.packages,
    actionsArtifacts: counts.actionsArtifacts,
    actionsSecrets: counts.actionsSecrets,
    dependabotSecrets: counts.dependabotSecrets,
    actionsVariables: counts.actionsVariables,
  })) {
    if (value !== 0) cleanupBlockers.push(`NONEMPTY_${nameKey.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);
  }
  if (codespacesSecretAudit.blocker) {
    cleanupBlockers.push(codespacesSecretAudit.blocker);
  }
  if (actionsCacheAudit.blocker) {
    cleanupBlockers.push(actionsCacheAudit.blocker);
  }
  if (environmentAudit.blocker) {
    cleanupBlockers.push(environmentAudit.blocker);
  }
  if (pages.ok) cleanupBlockers.push('PAGES_CONFIGURED');
  if (lfs.count !== 0) cleanupBlockers.push('REACHABLE_LFS_POINTERS');
  const targetIsCurrent = repo.name_with_owner.toLowerCase() === target.toLowerCase();
  const targetOwnerIsOrganization = targetAccount.ok && targetAccount.value?.type === 'Organization';
  if (targetIsCurrent && !targetOwnerIsOrganization) {
    cleanupBlockers.push('CURRENT_TARGET_OWNER_NOT_ORGANIZATION');
  } else if (!targetIsCurrent && !targetAccount.ok) {
    cleanupBlockers.push('TARGET_ORGANIZATION_NOT_CREATED');
  } else if (!targetIsCurrent && !targetOwnerIsOrganization) {
    cleanupBlockers.push('TARGET_OWNER_EXISTS_BUT_IS_NOT_ORGANIZATION');
  } else if (!targetIsCurrent && targetRepository.ok) {
    cleanupBlockers.push('TARGET_REPOSITORY_NAME_COLLISION');
  }
  if (githubAppReview.blocker) cleanupBlockers.push(githubAppReview.blocker);

  return {
    schemaVersion: 1,
    auditedAt: new Date().toISOString(),
    repository: {
      nameWithOwner: repo.name_with_owner,
      visibility: repo.visibility,
      private: repo.private,
      template: repo.is_template,
      defaultBranch: repo.default_branch,
      defaultBranchCommitCount: graph.commits,
      archived: repo.archived,
      disabled: repo.disabled,
    },
    features: {
      issuesEnabled: repo.has_issues,
      projectsEnabled: repo.has_projects,
      wikiEnabled: repo.has_wiki,
      discussionsEnabled: repo.has_discussions,
      pages: pages.ok ? 'configured' : 'not-configured-or-unavailable',
    },
    counts,
    actions: {
      workflows,
      runs: actionsRuns,
      caches: {
        total: actionsCacheAudit.total,
        postRootMetadataMatched: actionsCacheAudit.postRootMetadataMatched,
        unapproved: actionsCacheAudit.unapproved,
        metadataMatchedByRefClass: actionsCacheAudit.metadataMatchedByRefClass,
        cutoffEvidence: 'project-specific-sanitized-root-commit-time',
        gatePolicy: 'must-be-empty-before-public',
      },
      logArchives,
      permissions: actionsPermissions,
      workflowPermissions,
    },
    security: {
      protectedBranchCount: branches.protected,
      branchProtection: featureState(branchProtection, { privateUnavailable: true }),
      rulesets: collectionState(rulesets, { privateUnavailable: true }),
      privateVulnerabilityReporting: featureState(pvr, { privateUnavailable: true }),
      vulnerabilityAlerts: featureState(vulnerabilityAlerts),
      automatedSecurityFixes: featureState(automatedSecurityFixes),
      dependabotAlerts: featureState(dependabotAlerts),
      codeScanning: featureState(codeScanning),
      secretScanning: featureState(secretScanning),
    },
    integrations: {
      githubAppRepositoryAccess: githubAppReview.state,
      codespacesRepositorySecrets: codespacesSecretAudit.state,
      manualUiAttestations: {
        codespacesRepositorySecretsEmpty: codespacesSecretsEmptyAttested,
        githubAppRepositoryAccessReviewed: githubAppsReviewedAttested,
      },
      environments: {
        state: environmentAudit.state,
        total: environmentAudit.total,
        platformEmpty: environmentAudit.platformEmpty,
        unapproved: environmentAudit.unapproved,
      },
      reachableLfs: lfs,
    },
    history: {
      defaultBranchCommitCount: defaultHistory.commitCount,
      defaultBranchRootCount: defaultHistory.roots.size,
      retainedPullRefCommitCount: retainedPullHistory.commitCount,
      retainedPullRefsUseDefaultRoot: graphUsesOnlyDefaultRoot(retainedPullHistory),
      retainedPullBaseCommitCount: retainedPullBaseHistory.commitCount,
      retainedPullBasesUseDefaultRoot: graphUsesOnlyDefaultRoot(retainedPullBaseHistory),
      actionsUseDefaultRoot: graphUsesOnlyDefaultRoot(actionHistory),
    },
    target: {
      nameWithOwner: target,
      transitionState: targetIsCurrent ? 'already-transferred' : 'pre-transfer',
      ownerLookup: targetAccount.ok
        ? (targetOwnerIsOrganization ? 'organization-exists' : 'non-organization-account-exists')
        : 'not-found-or-inaccessible',
      repositoryLookup: targetRepository.ok
        ? (targetIsCurrent ? 'current-repository' : 'name-collision')
        : 'not-found-or-inaccessible',
    },
    gate: {
      phase6RemoteCleanup: cleanupBlockers.length === 0 ? 'go' : 'blocked',
      blockers: [...new Set(cleanupBlockers)].sort(),
      postPublicImmediateGates: [
        'ENABLE_AND_VERIFY_BRANCH_RULESET_OR_PROTECTION',
        'ENABLE_AND_VERIFY_PRIVATE_VULNERABILITY_REPORTING',
        'VERIFY_PUBLIC_SECURITY_SCANNING_AND_DEPENDABOT',
      ],
    },
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.selfTest) {
    runSelfTests();
    process.stdout.write('Phase 6 GitHub repository audit self-test PASSED.\n');
    return { selfTest: 'passed' };
  }
  const result = auditPhase6Repository(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (options.requireClean && result.gate.phase6RemoteCleanup !== 'go') {
    process.exitCode = 1;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Phase 6 GitHub repository audit FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
