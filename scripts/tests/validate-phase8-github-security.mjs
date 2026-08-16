/**
 * 验证 Phase 8 公开仓库的 GitHub 安全设置是否精确符合冻结策略。
 *
 * 默认模式只读取 GitHub REST API，不修改仓库、Organization、ruleset
 * 或安全功能。任何 API 权限不足、字段缺失、null、未知策略字段、分页未抵达
 * 终止页或语义漂移都会阻断。`--self-test` 只测试本地 fail-closed 逻辑，供
 * Private 阶段的 metadata Gate 使用，绝不会访问 GitHub。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const policyPath = path.join(root, 'docs', 'compliance', 'github-public-security-policy.json');
const POLICY_SCHEMA_VERSION = 1;
const GITHUB_API_VERSION = '2026-03-10';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

const EXPECTED_CONTEXTS = Object.freeze([
  'DCO / Signed-off-by',
  'Fixture A1 / Node 22.12',
  'Fixture A2 / Node 22.12',
  'Fixture B / Node 22.12',
  'Fixture C / Node 22.12',
  'JavaScript and TypeScript analysis',
  'Node 22.12 primary validation',
  'Node 24 compatibility',
  'TruffleHog verified and unknown results',
  'Vulnerability and license policy',
  'Windows / Node 22.12 validation',
]);

const EXPECTED_READABLE_APIS = Object.freeze([
  'code-scanning-alerts',
  'dependabot-alerts',
  'secret-scanning-alerts',
]);

const EXPECTED_TOPICS = Object.freeze([
  'astro',
  'brand-site',
  'cloudflare-workers',
  'headless-cms',
  'product-catalog',
  'sanity',
  'shopify',
  'site-framework',
  'static-site',
  'typescript',
  'website-template',
]);

const ALLOWED_RULESET_KEYS = Object.freeze([
  '_links',
  'bypass_actors',
  'conditions',
  'created_at',
  'current_user_can_bypass',
  'enforcement',
  'id',
  'name',
  'node_id',
  'rules',
  'source',
  'source_type',
  'target',
  'updated_at',
]);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  return value;
}

function assertNoNull(value, label) {
  if (value === null) fail(`${label} must not be null.`);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoNull(entry, `${label}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertNoNull(entry, `${label}.${key}`);
    }
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys differ: expected ${expected.join(', ')}; actual ${actual.join(', ')}.`);
  }
}

function assertAllowedKeys(value, keys, label) {
  assertPlainObject(value, label);
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) fail(`${label} contains unknown keys: ${unknown.join(', ')}.`);
}

function requireOwn(value, key, label) {
  if (!hasOwn(value, key)) fail(`${label}.${key} is required.`);
  return value[key];
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean.`);
  return value;
}

function requireSafeInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be a safe integer >= ${minimum}.`);
  }
  return value;
}

function requireLiteral(value, expected, label) {
  if (value !== expected) fail(`${label} must equal ${JSON.stringify(expected)}.`);
  return value;
}

function requireCommitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    fail(`${label} must be a full lowercase commit SHA.`);
  }
  return value;
}

function sortedUniqueStrings(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  if (!allowEmpty && value.length === 0) fail(`${label} must not be empty.`);
  const entries = value.map((entry, index) => requireString(entry, `${label}[${index}]`));
  if (new Set(entries).size !== entries.length) fail(`${label} must not contain duplicates.`);
  return [...entries].sort();
}

function assertStringSet(value, expected, label, options) {
  const actual = sortedUniqueStrings(value, label, options);
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} differs: expected ${wanted.join(', ')}; actual ${actual.join(', ')}.`);
  }
  return actual;
}

function validateConditions(conditions, expectedInclude, label) {
  assertExactKeys(conditions, ['exclude', 'include'], label);
  assertStringSet(conditions.include, expectedInclude, `${label}.include`);
  assertStringSet(conditions.exclude, [], `${label}.exclude`, { allowEmpty: true });
}

function validateCommonPolicyRuleset(ruleset, expected, label) {
  assertPlainObject(ruleset, label);
  for (const key of ['name', 'target', 'sourceType', 'source', 'enforcement', 'bypassActors', 'conditions', 'rules']) {
    requireOwn(ruleset, key, label);
  }
  requireLiteral(ruleset.name, expected.name, `${label}.name`);
  requireLiteral(ruleset.target, expected.target, `${label}.target`);
  requireLiteral(ruleset.sourceType, 'Repository', `${label}.sourceType`);
  requireLiteral(ruleset.source, 'ZUnfurl/zunfurl', `${label}.source`);
  requireLiteral(ruleset.enforcement, 'active', `${label}.enforcement`);
  validateConditions(ruleset.conditions, expected.include, `${label}.conditions`);
  if (!Array.isArray(ruleset.bypassActors)) fail(`${label}.bypassActors must be an array.`);
}

/** 严格校验冻结策略；未知键、null、类型漂移和弱化值一律拒绝。 */
export function validatePolicy(policy) {
  assertNoNull(policy, 'policy');
  assertExactKeys(
    policy,
    ['actions', 'githubApiVersion', 'organization', 'repository', 'rulesets', 'schemaVersion', 'security'],
    'policy',
  );
  requireLiteral(policy.schemaVersion, POLICY_SCHEMA_VERSION, 'policy.schemaVersion');
  requireLiteral(policy.githubApiVersion, GITHUB_API_VERSION, 'policy.githubApiVersion');

  assertExactKeys(
    policy.repository,
    [
      'archived',
      'allowMergeCommit',
      'allowRebaseMerge',
      'allowSquashMerge',
      'defaultBranch',
      'deleteBranchOnMerge',
      'description',
      'disabled',
      'hasDiscussions',
      'hasIssues',
      'hasProjects',
      'hasWiki',
      'homepage',
      'id',
      'isTemplate',
      'nameWithOwner',
      'originUrl',
      'ownerType',
      'topics',
      'visibility',
      'webCommitSignoffRequired',
    ],
    'policy.repository',
  );
  requireLiteral(policy.repository.id, 1292385902, 'policy.repository.id');
  requireLiteral(policy.repository.nameWithOwner, 'ZUnfurl/zunfurl', 'policy.repository.nameWithOwner');
  requireLiteral(
    policy.repository.originUrl,
    'https://github.com/ZUnfurl/zunfurl.git',
    'policy.repository.originUrl',
  );
  requireLiteral(policy.repository.ownerType, 'Organization', 'policy.repository.ownerType');
  requireLiteral(
    policy.repository.description,
    'Static-first Astro framework for brand sites, Sanity CMS, and read-only Shopify retail catalogs. 0.x preview.',
    'policy.repository.description',
  );
  requireLiteral(policy.repository.homepage, '', 'policy.repository.homepage');
  requireLiteral(policy.repository.visibility, 'public', 'policy.repository.visibility');
  requireLiteral(policy.repository.isTemplate, true, 'policy.repository.isTemplate');
  requireLiteral(policy.repository.defaultBranch, 'main', 'policy.repository.defaultBranch');
  requireLiteral(policy.repository.archived, false, 'policy.repository.archived');
  requireLiteral(policy.repository.disabled, false, 'policy.repository.disabled');
  assertStringSet(policy.repository.topics, EXPECTED_TOPICS, 'policy.repository.topics');
  requireLiteral(policy.repository.hasIssues, true, 'policy.repository.hasIssues');
  requireLiteral(policy.repository.hasProjects, false, 'policy.repository.hasProjects');
  requireLiteral(policy.repository.hasWiki, false, 'policy.repository.hasWiki');
  requireLiteral(policy.repository.hasDiscussions, false, 'policy.repository.hasDiscussions');
  requireLiteral(policy.repository.deleteBranchOnMerge, true, 'policy.repository.deleteBranchOnMerge');
  requireLiteral(policy.repository.allowSquashMerge, true, 'policy.repository.allowSquashMerge');
  requireLiteral(policy.repository.allowRebaseMerge, false, 'policy.repository.allowRebaseMerge');
  requireLiteral(policy.repository.allowMergeCommit, false, 'policy.repository.allowMergeCommit');
  requireLiteral(policy.repository.webCommitSignoffRequired, true, 'policy.repository.webCommitSignoffRequired');

  assertExactKeys(
    policy.organization,
    ['defaultRepositoryPermission', 'effectiveWriteMaintainers', 'login'],
    'policy.organization',
  );
  requireLiteral(policy.organization.login, 'ZUnfurl', 'policy.organization.login');
  requireLiteral(
    policy.organization.defaultRepositoryPermission,
    'read',
    'policy.organization.defaultRepositoryPermission',
  );
  assertStringSet(
    policy.organization.effectiveWriteMaintainers,
    ['mp4102'],
    'policy.organization.effectiveWriteMaintainers',
  );

  assertExactKeys(
    policy.rulesets,
    ['expectedCollectionCount', 'main'],
    'policy.rulesets',
  );
  requireLiteral(policy.rulesets.expectedCollectionCount, 1, 'policy.rulesets.expectedCollectionCount');

  assertExactKeys(
    policy.rulesets.main,
    ['bypassActors', 'conditions', 'enforcement', 'name', 'rules', 'source', 'sourceType', 'target'],
    'policy.rulesets.main',
  );
  validateCommonPolicyRuleset(
    policy.rulesets.main,
    { name: 'main-protection', target: 'branch', include: ['refs/heads/main'] },
    'policy.rulesets.main',
  );
  if (policy.rulesets.main.bypassActors.length !== 0) {
    fail('policy.rulesets.main must have zero bypass actors.');
  }
  assertExactKeys(
    policy.rulesets.main.rules,
    ['deletion', 'nonFastForward', 'pullRequest', 'requiredLinearHistory', 'requiredStatusChecks'],
    'policy.rulesets.main.rules',
  );
  requireLiteral(policy.rulesets.main.rules.deletion, true, 'policy.rulesets.main.rules.deletion');
  requireLiteral(
    policy.rulesets.main.rules.nonFastForward,
    true,
    'policy.rulesets.main.rules.nonFastForward',
  );
  requireLiteral(
    policy.rulesets.main.rules.requiredLinearHistory,
    true,
    'policy.rulesets.main.rules.requiredLinearHistory',
  );

  const pullRequest = policy.rulesets.main.rules.pullRequest;
  assertExactKeys(
    pullRequest,
    [
      'allowedMergeMethods',
      'dismissStaleReviewsOnPush',
      'requireCodeOwnerReview',
      'requireLastPushApproval',
      'requiredApprovingReviewCount',
      'requiredReviewThreadResolution',
    ],
    'policy.rulesets.main.rules.pullRequest',
  );
  assertStringSet(
    pullRequest.allowedMergeMethods,
    ['squash'],
    'policy.rulesets.main.rules.pullRequest.allowedMergeMethods',
  );
  requireLiteral(pullRequest.dismissStaleReviewsOnPush, false, 'pullRequest.dismissStaleReviewsOnPush');
  requireLiteral(pullRequest.requireCodeOwnerReview, false, 'pullRequest.requireCodeOwnerReview');
  requireLiteral(pullRequest.requireLastPushApproval, false, 'pullRequest.requireLastPushApproval');
  requireLiteral(pullRequest.requiredApprovingReviewCount, 0, 'pullRequest.requiredApprovingReviewCount');
  requireLiteral(
    pullRequest.requiredReviewThreadResolution,
    true,
    'pullRequest.requiredReviewThreadResolution',
  );

  const statusChecks = policy.rulesets.main.rules.requiredStatusChecks;
  assertExactKeys(
    statusChecks,
    ['contexts', 'doNotEnforceOnCreate', 'integrationSlug', 'strictRequiredStatusChecksPolicy'],
    'policy.rulesets.main.rules.requiredStatusChecks',
  );
  requireLiteral(statusChecks.doNotEnforceOnCreate, false, 'requiredStatusChecks.doNotEnforceOnCreate');
  requireLiteral(
    statusChecks.strictRequiredStatusChecksPolicy,
    true,
    'requiredStatusChecks.strictRequiredStatusChecksPolicy',
  );
  requireLiteral(statusChecks.integrationSlug, 'github-actions', 'requiredStatusChecks.integrationSlug');
  assertStringSet(statusChecks.contexts, EXPECTED_CONTEXTS, 'requiredStatusChecks.contexts');

  assertExactKeys(
    policy.actions,
    ['allowedActions', 'enabled', 'selectedActions', 'shaPinningRequired', 'workflowPermissions'],
    'policy.actions',
  );
  requireLiteral(policy.actions.enabled, true, 'policy.actions.enabled');
  requireLiteral(policy.actions.allowedActions, 'selected', 'policy.actions.allowedActions');
  requireLiteral(policy.actions.shaPinningRequired, true, 'policy.actions.shaPinningRequired');
  assertExactKeys(
    policy.actions.selectedActions,
    ['githubOwnedAllowed', 'patternsAllowed', 'verifiedAllowed'],
    'policy.actions.selectedActions',
  );
  requireLiteral(policy.actions.selectedActions.githubOwnedAllowed, true, 'selectedActions.githubOwnedAllowed');
  requireLiteral(policy.actions.selectedActions.verifiedAllowed, false, 'selectedActions.verifiedAllowed');
  assertStringSet(
    policy.actions.selectedActions.patternsAllowed,
    ['trufflesecurity/trufflehog@bcfcf73aaf4759d4dadc2783177c245a02792318'],
    'selectedActions.patternsAllowed',
  );
  assertExactKeys(
    policy.actions.workflowPermissions,
    ['canApprovePullRequestReviews', 'defaultWorkflowPermissions'],
    'policy.actions.workflowPermissions',
  );
  requireLiteral(
    policy.actions.workflowPermissions.defaultWorkflowPermissions,
    'read',
    'workflowPermissions.defaultWorkflowPermissions',
  );
  requireLiteral(
    policy.actions.workflowPermissions.canApprovePullRequestReviews,
    false,
    'workflowPermissions.canApprovePullRequestReviews',
  );

  assertExactKeys(
    policy.security,
    [
      'advancedSecurity',
      'alertGates',
      'dependabotSecurityUpdates',
      'immutableReleases',
      'privateVulnerabilityReporting',
      'requiredReadableApis',
      'secretScanning',
      'secretScanningPushProtection',
      'vulnerabilityAlertsAndDependencyGraph',
    ],
    'policy.security',
  );
  requireLiteral(policy.security.advancedSecurity, 'enabled', 'policy.security.advancedSecurity');
  assertExactKeys(
    policy.security.alertGates,
    ['codeScanningOpenCriticalHigh', 'dependabotOpenCriticalHigh', 'secretScanningOpen'],
    'policy.security.alertGates',
  );
  for (const key of ['codeScanningOpenCriticalHigh', 'dependabotOpenCriticalHigh', 'secretScanningOpen']) {
    requireLiteral(policy.security.alertGates[key], 0, `policy.security.alertGates.${key}`);
  }
  requireLiteral(policy.security.secretScanning, 'enabled', 'policy.security.secretScanning');
  requireLiteral(
    policy.security.secretScanningPushProtection,
    'enabled',
    'policy.security.secretScanningPushProtection',
  );
  requireLiteral(
    policy.security.vulnerabilityAlertsAndDependencyGraph,
    true,
    'policy.security.vulnerabilityAlertsAndDependencyGraph',
  );
  assertExactKeys(
    policy.security.dependabotSecurityUpdates,
    ['enabled', 'paused'],
    'policy.security.dependabotSecurityUpdates',
  );
  requireLiteral(policy.security.dependabotSecurityUpdates.enabled, true, 'dependabotSecurityUpdates.enabled');
  requireLiteral(policy.security.dependabotSecurityUpdates.paused, false, 'dependabotSecurityUpdates.paused');
  requireLiteral(policy.security.immutableReleases, true, 'policy.security.immutableReleases');
  requireLiteral(
    policy.security.privateVulnerabilityReporting,
    true,
    'policy.security.privateVulnerabilityReporting',
  );
  assertStringSet(policy.security.requiredReadableApis, EXPECTED_READABLE_APIS, 'security.requiredReadableApis');
  return policy;
}

function parseArgs(argv) {
  if (argv.length === 0) return { selfTest: false };
  if (argv.length === 1 && argv[0] === '--self-test') return { selfTest: true };
  fail('--self-test must be used alone; live audit accepts no arguments.');
}

function commandGh(args, label, { silent = false } = {}) {
  const result = spawnSync(
    'gh',
    [
      'api',
      '--hostname',
      'github.com',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
      ...(silent ? ['--silent'] : []),
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error) fail(`${label} is not verifiable because gh could not execute.`);
  if (result.status !== 0) {
    const status = String(result.stderr ?? '').match(/HTTP\s+(\d{3})/i)?.[1] ?? 'unknown';
    fail(`${label} is not verifiable (HTTP ${status}); missing API permission must block.`);
  }
  return String(result.stdout ?? '');
}

function commandGit(args, label) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) fail(`${label} is not verifiable.`);
  return String(result.stdout ?? '').trim();
}

function localRepositoryBinding() {
  const headSha = commandGit(['rev-parse', '--verify', 'HEAD'], 'local HEAD');
  if (!/^[0-9a-f]{40}$/.test(headSha)) fail('local HEAD must be a full lowercase commit SHA.');
  return {
    branch: commandGit(['branch', '--show-current'], 'local branch'),
    headSha,
    originUrl: commandGit(['remote', 'get-url', 'origin'], 'local origin'),
    worktreeClean: commandGit(['status', '--porcelain=v1', '--untracked-files=all'], 'local worktree') === '',
  };
}

function ghJson(endpoint, label) {
  const stdout = commandGh([endpoint], label);
  if (stdout.trim() === '') fail(`${label} returned an empty JSON body.`);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} returned invalid JSON.`);
    throw error;
  }
}

function ghProbe(endpoint, label) {
  commandGh([endpoint], label, { silent: true });
  return true;
}

/** 校验显式终止页分页证明；最后一页必须少于 pageSize。 */
export function validatePagination(pagination, expectedTotal, label) {
  assertNoNull(pagination, label);
  assertExactKeys(
    pagination,
    ['complete', 'pageCount', 'pageSize', 'terminalPageItemCount', 'totalItems'],
    label,
  );
  requireLiteral(pagination.complete, true, `${label}.complete`);
  requireLiteral(pagination.pageSize, PAGE_SIZE, `${label}.pageSize`);
  requireSafeInteger(pagination.pageCount, `${label}.pageCount`, { minimum: 1 });
  requireSafeInteger(pagination.terminalPageItemCount, `${label}.terminalPageItemCount`);
  requireSafeInteger(pagination.totalItems, `${label}.totalItems`);
  if (pagination.terminalPageItemCount >= pagination.pageSize) {
    fail(`${label} lacks a terminal page shorter than pageSize.`);
  }
  const computed = (pagination.pageCount - 1) * pagination.pageSize + pagination.terminalPageItemCount;
  if (pagination.totalItems !== computed || pagination.totalItems !== expectedTotal) {
    fail(`${label} total does not match its complete page sequence.`);
  }
}

function fetchPaginatedArray(endpoint, label) {
  const pages = [];
  const entries = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const value = ghJson(`${endpoint}${separator}per_page=${PAGE_SIZE}&page=${page}`, `${label} page ${page}`);
    if (!Array.isArray(value)) fail(`${label} page ${page} must be an array.`);
    if (value.length > PAGE_SIZE) fail(`${label} page ${page} exceeds pageSize.`);
    pages.push(value);
    entries.push(...value);
    if (value.length < PAGE_SIZE) {
      return {
        entries,
        pagination: {
          complete: true,
          pageCount: pages.length,
          pageSize: PAGE_SIZE,
          terminalPageItemCount: value.length,
          totalItems: entries.length,
        },
      };
    }
  }
  fail(`${label} exceeded ${MAX_PAGES} pages without a terminal page.`);
}

function projectAlertGate(result, kind) {
  validatePagination(result.pagination, result.entries.length, `${kind} alert pagination`);
  const numbers = new Set();
  let blockedCount = 0;
  for (const [index, alert] of result.entries.entries()) {
    const label = `${kind} alert ${index}`;
    assertPlainObject(alert, label);
    const number = requireSafeInteger(requireOwn(alert, 'number', label), `${label}.number`, { minimum: 1 });
    if (numbers.has(number)) fail(`${kind} alerts contain duplicate numbers.`);
    numbers.add(number);
    requireLiteral(requireOwn(alert, 'state', label), 'open', `${label}.state`);
    if (kind === 'code scanning') {
      const rule = assertPlainObject(requireOwn(alert, 'rule', label), `${label}.rule`);
      const severity = rule.security_severity_level;
      if (severity !== null && !['critical', 'high', 'medium', 'low'].includes(severity)) {
        fail(`${label}.rule.security_severity_level is unknown.`);
      }
      if (['critical', 'high'].includes(severity)) blockedCount += 1;
    } else if (kind === 'Dependabot') {
      const advisory = assertPlainObject(requireOwn(alert, 'security_advisory', label), `${label}.security_advisory`);
      const severity = requireString(requireOwn(advisory, 'severity', `${label}.security_advisory`), `${label}.security_advisory.severity`);
      if (!['critical', 'high', 'moderate', 'low'].includes(severity)) fail(`${label} advisory severity is unknown.`);
      if (['critical', 'high'].includes(severity)) blockedCount += 1;
    } else {
      blockedCount += 1;
    }
  }
  return { blockedCount, pagination: result.pagination };
}

function featureStatus(securityAndAnalysis, key, label) {
  const feature = requireOwn(securityAndAnalysis, key, label);
  assertExactKeys(feature, ['status'], `${label}.${key}`);
  return requireString(feature.status, `${label}.${key}.status`);
}

function projectRepository(raw) {
  assertPlainObject(raw, 'repository API');
  const owner = assertPlainObject(requireOwn(raw, 'owner', 'repository API'), 'repository API.owner');
  const securityAndAnalysis = assertPlainObject(
    requireOwn(raw, 'security_and_analysis', 'repository API'),
    'repository API.security_and_analysis',
  );
  return {
    allowMergeCommit: requireBoolean(requireOwn(raw, 'allow_merge_commit', 'repository API'), 'repository API.allow_merge_commit'),
    allowRebaseMerge: requireBoolean(requireOwn(raw, 'allow_rebase_merge', 'repository API'), 'repository API.allow_rebase_merge'),
    allowSquashMerge: requireBoolean(requireOwn(raw, 'allow_squash_merge', 'repository API'), 'repository API.allow_squash_merge'),
    id: requireSafeInteger(requireOwn(raw, 'id', 'repository API'), 'repository API.id', { minimum: 1 }),
    archived: requireBoolean(requireOwn(raw, 'archived', 'repository API'), 'repository API.archived'),
    defaultBranch: requireString(requireOwn(raw, 'default_branch', 'repository API'), 'repository API.default_branch'),
    deleteBranchOnMerge: requireBoolean(
      requireOwn(raw, 'delete_branch_on_merge', 'repository API'),
      'repository API.delete_branch_on_merge',
    ),
    description: requireString(requireOwn(raw, 'description', 'repository API'), 'repository API.description'),
    disabled: requireBoolean(requireOwn(raw, 'disabled', 'repository API'), 'repository API.disabled'),
    hasDiscussions: requireBoolean(requireOwn(raw, 'has_discussions', 'repository API'), 'repository API.has_discussions'),
    hasIssues: requireBoolean(requireOwn(raw, 'has_issues', 'repository API'), 'repository API.has_issues'),
    hasProjects: requireBoolean(requireOwn(raw, 'has_projects', 'repository API'), 'repository API.has_projects'),
    hasWiki: requireBoolean(requireOwn(raw, 'has_wiki', 'repository API'), 'repository API.has_wiki'),
    homepage: requireOwn(raw, 'homepage', 'repository API') === null
      ? ''
      : requireString(raw.homepage, 'repository API.homepage'),
    isTemplate: requireBoolean(requireOwn(raw, 'is_template', 'repository API'), 'repository API.is_template'),
    nameWithOwner: requireString(requireOwn(raw, 'full_name', 'repository API'), 'repository API.full_name'),
    ownerType: requireString(requireOwn(owner, 'type', 'repository API.owner'), 'repository API.owner.type'),
    private: requireBoolean(requireOwn(raw, 'private', 'repository API'), 'repository API.private'),
    securityAndAnalysis: {
      advancedSecurity: featureStatus(securityAndAnalysis, 'advanced_security', 'repository API.security_and_analysis'),
      secretScanning: featureStatus(securityAndAnalysis, 'secret_scanning', 'repository API.security_and_analysis'),
      secretScanningPushProtection: featureStatus(
        securityAndAnalysis,
        'secret_scanning_push_protection',
        'repository API.security_and_analysis',
      ),
    },
    topics: sortedUniqueStrings(requireOwn(raw, 'topics', 'repository API'), 'repository API.topics', { allowEmpty: true }),
    visibility: requireString(requireOwn(raw, 'visibility', 'repository API'), 'repository API.visibility'),
    webCommitSignoffRequired: requireBoolean(
      requireOwn(raw, 'web_commit_signoff_required', 'repository API'),
      'repository API.web_commit_signoff_required',
    ),
  };
}

function projectActionsPermissions(raw) {
  assertExactKeys(raw, ['allowed_actions', 'enabled', 'selected_actions_url', 'sha_pinning_required'], 'Actions permissions API');
  requireString(raw.selected_actions_url, 'Actions permissions API.selected_actions_url');
  return {
    allowedActions: requireString(raw.allowed_actions, 'Actions permissions API.allowed_actions'),
    enabled: requireBoolean(raw.enabled, 'Actions permissions API.enabled'),
    shaPinningRequired: requireBoolean(raw.sha_pinning_required, 'Actions permissions API.sha_pinning_required'),
  };
}

function projectSelectedActions(raw) {
  assertExactKeys(raw, ['github_owned_allowed', 'patterns_allowed', 'verified_allowed'], 'Selected Actions API');
  return {
    githubOwnedAllowed: requireBoolean(raw.github_owned_allowed, 'Selected Actions API.github_owned_allowed'),
    patternsAllowed: sortedUniqueStrings(raw.patterns_allowed, 'Selected Actions API.patterns_allowed', { allowEmpty: true }),
    verifiedAllowed: requireBoolean(raw.verified_allowed, 'Selected Actions API.verified_allowed'),
  };
}

function projectWorkflowPermissions(raw) {
  assertExactKeys(
    raw,
    ['can_approve_pull_request_reviews', 'default_workflow_permissions'],
    'Workflow permissions API',
  );
  return {
    canApprovePullRequestReviews: requireBoolean(
      raw.can_approve_pull_request_reviews,
      'Workflow permissions API.can_approve_pull_request_reviews',
    ),
    defaultWorkflowPermissions: requireString(
      raw.default_workflow_permissions,
      'Workflow permissions API.default_workflow_permissions',
    ),
  };
}

function projectCollaborator(raw, index) {
  const label = `repository collaborator ${index}`;
  assertPlainObject(raw, label);
  const permissions = requireOwn(raw, 'permissions', label);
  assertExactKeys(permissions, ['admin', 'maintain', 'pull', 'push', 'triage'], `${label}.permissions`);
  for (const key of ['admin', 'maintain', 'pull', 'push', 'triage']) {
    requireBoolean(permissions[key], `${label}.permissions.${key}`);
  }
  const roleName = requireString(requireOwn(raw, 'role_name', label), `${label}.role_name`);
  if (!['admin', 'maintain', 'read', 'triage', 'write'].includes(roleName)) {
    fail(`${label}.role_name is an unreviewed custom role.`);
  }
  const permissionTruthTable = {
    admin: { admin: true, maintain: true, pull: true, push: true, triage: true },
    maintain: { admin: false, maintain: true, pull: true, push: true, triage: true },
    write: { admin: false, maintain: false, pull: true, push: true, triage: true },
    triage: { admin: false, maintain: false, pull: true, push: false, triage: true },
    read: { admin: false, maintain: false, pull: true, push: false, triage: false },
  };
  for (const [permission, expected] of Object.entries(permissionTruthTable[roleName])) {
    if (permissions[permission] !== expected) {
      fail(`${label}.role_name and permissions do not match the exact built-in role truth table.`);
    }
  }
  return {
    login: requireString(requireOwn(raw, 'login', label), `${label}.login`),
    permissions: { ...permissions },
    roleName,
  };
}

function validateRemoteRuleKeys(rule, allowedKeys, label) {
  assertAllowedKeys(rule, allowedKeys, label);
  requireOwn(rule, 'type', label);
  requireString(rule.type, `${label}.type`);
}

function validateRemoteRules(rules, expectedPolicy, integrationId, label) {
  if (!Array.isArray(rules)) fail(`${label} must be an array.`);
  const byType = new Map();
  for (const [index, rule] of rules.entries()) {
    validateRemoteRuleKeys(rule, ['parameters', 'type'], `${label}[${index}]`);
    if (byType.has(rule.type)) fail(`${label} contains duplicate rule type ${rule.type}.`);
    byType.set(rule.type, rule);
  }

  const expectedTypes = ['deletion', 'non_fast_forward', 'pull_request', 'required_linear_history', 'required_status_checks'];
  assertStringSet([...byType.keys()], expectedTypes, `${label} types`);

  for (const type of expectedTypes.filter((entry) => !['pull_request', 'required_status_checks', 'update'].includes(entry))) {
    assertExactKeys(byType.get(type), ['type'], `${label}.${type}`);
  }

  const pullRule = byType.get('pull_request');
    assertExactKeys(pullRule, ['parameters', 'type'], `${label}.pull_request`);
    const parameters = pullRule.parameters;
    assertAllowedKeys(
      parameters,
      [
        'allowed_merge_methods',
        'dismiss_stale_reviews_on_push',
        'dismissal_restriction',
        'require_code_owner_review',
        'require_last_push_approval',
        'required_approving_review_count',
        'required_review_thread_resolution',
        'required_reviewers',
      ],
      `${label}.pull_request.parameters`,
    );
    for (const key of [
      'allowed_merge_methods',
      'dismiss_stale_reviews_on_push',
      'require_code_owner_review',
      'require_last_push_approval',
      'required_approving_review_count',
      'required_review_thread_resolution',
    ]) requireOwn(parameters, key, `${label}.pull_request.parameters`);
    assertStringSet(
      parameters.allowed_merge_methods,
      expectedPolicy.rules.pullRequest.allowedMergeMethods,
      `${label}.pull_request.parameters.allowed_merge_methods`,
    );
    requireLiteral(
      parameters.dismiss_stale_reviews_on_push,
      expectedPolicy.rules.pullRequest.dismissStaleReviewsOnPush,
      `${label}.pull_request.parameters.dismiss_stale_reviews_on_push`,
    );
    requireLiteral(
      parameters.require_code_owner_review,
      expectedPolicy.rules.pullRequest.requireCodeOwnerReview,
      `${label}.pull_request.parameters.require_code_owner_review`,
    );
    requireLiteral(
      parameters.require_last_push_approval,
      expectedPolicy.rules.pullRequest.requireLastPushApproval,
      `${label}.pull_request.parameters.require_last_push_approval`,
    );
    requireLiteral(
      parameters.required_approving_review_count,
      expectedPolicy.rules.pullRequest.requiredApprovingReviewCount,
      `${label}.pull_request.parameters.required_approving_review_count`,
    );
    requireLiteral(
      parameters.required_review_thread_resolution,
      expectedPolicy.rules.pullRequest.requiredReviewThreadResolution,
      `${label}.pull_request.parameters.required_review_thread_resolution`,
    );
    if (hasOwn(parameters, 'required_reviewers')) {
      if (!Array.isArray(parameters.required_reviewers) || parameters.required_reviewers.length !== 0) {
        fail(`${label}.pull_request.parameters.required_reviewers must be absent or empty.`);
      }
    }
    if (hasOwn(parameters, 'dismissal_restriction')) {
      assertExactKeys(
        parameters.dismissal_restriction,
        ['allowed_actors', 'enabled'],
        `${label}.pull_request.parameters.dismissal_restriction`,
      );
      requireLiteral(
        parameters.dismissal_restriction.enabled,
        false,
        `${label}.pull_request.parameters.dismissal_restriction.enabled`,
      );
      if (!Array.isArray(parameters.dismissal_restriction.allowed_actors) ||
          parameters.dismissal_restriction.allowed_actors.length !== 0) {
        fail(`${label}.pull_request.parameters.dismissal_restriction.allowed_actors must be empty.`);
      }
    }

    const statusRule = byType.get('required_status_checks');
    assertExactKeys(statusRule, ['parameters', 'type'], `${label}.required_status_checks`);
    assertExactKeys(
      statusRule.parameters,
      ['do_not_enforce_on_create', 'required_status_checks', 'strict_required_status_checks_policy'],
      `${label}.required_status_checks.parameters`,
    );
    requireLiteral(
      statusRule.parameters.do_not_enforce_on_create,
      expectedPolicy.rules.requiredStatusChecks.doNotEnforceOnCreate,
      `${label}.required_status_checks.parameters.do_not_enforce_on_create`,
    );
    requireLiteral(
      statusRule.parameters.strict_required_status_checks_policy,
      expectedPolicy.rules.requiredStatusChecks.strictRequiredStatusChecksPolicy,
      `${label}.required_status_checks.parameters.strict_required_status_checks_policy`,
    );
    if (!Array.isArray(statusRule.parameters.required_status_checks)) {
      fail(`${label}.required_status_checks.parameters.required_status_checks must be an array.`);
    }
    const contexts = [];
    for (const [index, check] of statusRule.parameters.required_status_checks.entries()) {
      assertExactKeys(check, ['context', 'integration_id'], `${label}.required_status_checks[${index}]`);
      contexts.push(requireString(check.context, `${label}.required_status_checks[${index}].context`));
      requireLiteral(
        requireSafeInteger(check.integration_id, `${label}.required_status_checks[${index}].integration_id`, { minimum: 1 }),
        integrationId,
        `${label}.required_status_checks[${index}].integration_id`,
      );
    }
  assertStringSet(contexts, expectedPolicy.rules.requiredStatusChecks.contexts, `${label} required contexts`);
}

function validateRemoteRuleset(raw, expectedPolicy, integrationId, label) {
  assertAllowedKeys(raw, ALLOWED_RULESET_KEYS, label);
  for (const key of ['id', 'name', 'target', 'source_type', 'source', 'enforcement', 'bypass_actors', 'conditions', 'rules']) {
    requireOwn(raw, key, label);
  }
  assertNoNull(
    {
      id: raw.id,
      name: raw.name,
      target: raw.target,
      source_type: raw.source_type,
      source: raw.source,
      enforcement: raw.enforcement,
      bypass_actors: raw.bypass_actors,
      conditions: raw.conditions,
      rules: raw.rules,
    },
    label,
  );
  requireSafeInteger(raw.id, `${label}.id`, { minimum: 1 });
  requireLiteral(raw.name, expectedPolicy.name, `${label}.name`);
  requireLiteral(raw.target, expectedPolicy.target, `${label}.target`);
  requireLiteral(raw.source_type, expectedPolicy.sourceType, `${label}.source_type`);
  requireLiteral(raw.source, expectedPolicy.source, `${label}.source`);
  requireLiteral(raw.enforcement, expectedPolicy.enforcement, `${label}.enforcement`);

  assertExactKeys(raw.conditions, ['ref_name'], `${label}.conditions`);
  assertExactKeys(raw.conditions.ref_name, ['exclude', 'include'], `${label}.conditions.ref_name`);
  assertStringSet(raw.conditions.ref_name.include, expectedPolicy.conditions.include, `${label}.conditions.include`);
  assertStringSet(raw.conditions.ref_name.exclude, expectedPolicy.conditions.exclude, `${label}.conditions.exclude`, { allowEmpty: true });

  if (!Array.isArray(raw.bypass_actors)) fail(`${label}.bypass_actors must be an array.`);
  if (raw.bypass_actors.length !== 0) {
    fail(`${label} must have zero bypass actors.`);
  }
  validateRemoteRules(raw.rules, expectedPolicy, integrationId, `${label}.rules`);
}

/** 对采集后的最小快照执行严格语义比较。 */
export function validateRemoteSnapshot(snapshot, policy) {
  validatePolicy(policy);
  assertExactKeys(
    snapshot,
    [
      'access',
      'actions',
      'localRepository',
      'remoteDefaultBranch',
      'repository',
      'requiredCheckIntegration',
      'rulesets',
      'security',
    ],
    'snapshot',
  );

  assertExactKeys(
    snapshot.access,
    ['collaborators', 'pagination', 'organizationDefaultRepositoryPermission', 'organizationLogin'],
    'snapshot.access',
  );
  requireLiteral(snapshot.access.organizationLogin, policy.organization.login, 'snapshot.access.organizationLogin');
  requireLiteral(
    snapshot.access.organizationDefaultRepositoryPermission,
    policy.organization.defaultRepositoryPermission,
    'snapshot.access.organizationDefaultRepositoryPermission',
  );
  if (!Array.isArray(snapshot.access.collaborators)) fail('snapshot.access.collaborators must be an array.');
  validatePagination(snapshot.access.pagination, snapshot.access.collaborators.length, 'snapshot.access.pagination');
  const collaboratorLogins = new Set();
  const effectiveWriters = [];
  for (const [index, collaborator] of snapshot.access.collaborators.entries()) {
    assertExactKeys(collaborator, ['login', 'permissions', 'roleName'], `snapshot.access.collaborators[${index}]`);
    const projected = projectCollaborator(
      {
        login: collaborator.login,
        permissions: collaborator.permissions,
        role_name: collaborator.roleName,
      },
      index,
    );
    if (collaboratorLogins.has(projected.login)) fail('snapshot.access.collaborators contains duplicate logins.');
    collaboratorLogins.add(projected.login);
    if (['write', 'maintain', 'admin'].includes(projected.roleName)) {
      effectiveWriters.push(projected.login);
    }
  }
  assertStringSet(
    effectiveWriters,
    policy.organization.effectiveWriteMaintainers,
    'snapshot.access effective write maintainers',
  );

  assertExactKeys(
    snapshot.repository,
    [
      'archived',
      'allowMergeCommit',
      'allowRebaseMerge',
      'allowSquashMerge',
      'defaultBranch',
      'deleteBranchOnMerge',
      'description',
      'disabled',
      'hasDiscussions',
      'hasIssues',
      'hasProjects',
      'hasWiki',
      'homepage',
      'id',
      'isTemplate',
      'nameWithOwner',
      'ownerType',
      'private',
      'securityAndAnalysis',
      'topics',
      'visibility',
      'webCommitSignoffRequired',
    ],
    'snapshot.repository',
  );
  requireLiteral(snapshot.repository.id, policy.repository.id, 'snapshot.repository.id');
  requireLiteral(snapshot.repository.nameWithOwner, policy.repository.nameWithOwner, 'snapshot.repository.nameWithOwner');
  requireLiteral(snapshot.repository.ownerType, policy.repository.ownerType, 'snapshot.repository.ownerType');
  requireLiteral(snapshot.repository.description, policy.repository.description, 'snapshot.repository.description');
  requireLiteral(snapshot.repository.homepage, policy.repository.homepage, 'snapshot.repository.homepage');
  requireLiteral(snapshot.repository.visibility, policy.repository.visibility, 'snapshot.repository.visibility');
  requireLiteral(snapshot.repository.private, false, 'snapshot.repository.private');
  requireLiteral(snapshot.repository.isTemplate, policy.repository.isTemplate, 'snapshot.repository.isTemplate');
  requireLiteral(snapshot.repository.defaultBranch, policy.repository.defaultBranch, 'snapshot.repository.defaultBranch');
  requireLiteral(snapshot.repository.archived, policy.repository.archived, 'snapshot.repository.archived');
  requireLiteral(snapshot.repository.disabled, policy.repository.disabled, 'snapshot.repository.disabled');
  assertStringSet(snapshot.repository.topics, policy.repository.topics, 'snapshot.repository.topics');
  for (const key of [
    'hasIssues',
    'hasProjects',
    'hasWiki',
    'hasDiscussions',
    'deleteBranchOnMerge',
    'allowSquashMerge',
    'allowRebaseMerge',
    'allowMergeCommit',
    'webCommitSignoffRequired',
  ]) {
    requireLiteral(snapshot.repository[key], policy.repository[key], `snapshot.repository.${key}`);
  }
  assertExactKeys(
    snapshot.repository.securityAndAnalysis,
    ['advancedSecurity', 'secretScanning', 'secretScanningPushProtection'],
    'snapshot.repository.securityAndAnalysis',
  );
  requireLiteral(
    snapshot.repository.securityAndAnalysis.advancedSecurity,
    policy.security.advancedSecurity,
    'snapshot.repository.securityAndAnalysis.advancedSecurity',
  );
  requireLiteral(
    snapshot.repository.securityAndAnalysis.secretScanning,
    policy.security.secretScanning,
    'snapshot.repository.securityAndAnalysis.secretScanning',
  );
  requireLiteral(
    snapshot.repository.securityAndAnalysis.secretScanningPushProtection,
    policy.security.secretScanningPushProtection,
    'snapshot.repository.securityAndAnalysis.secretScanningPushProtection',
  );

  assertExactKeys(
    snapshot.localRepository,
    ['branch', 'headSha', 'originUrl', 'worktreeClean'],
    'snapshot.localRepository',
  );
  requireLiteral(snapshot.localRepository.branch, policy.repository.defaultBranch, 'snapshot.localRepository.branch');
  const localHeadSha = requireCommitSha(snapshot.localRepository.headSha, 'snapshot.localRepository.headSha');
  requireLiteral(snapshot.localRepository.originUrl, policy.repository.originUrl, 'snapshot.localRepository.originUrl');
  requireLiteral(snapshot.localRepository.worktreeClean, true, 'snapshot.localRepository.worktreeClean');
  assertExactKeys(
    snapshot.remoteDefaultBranch,
    ['headSha', 'name', 'objectType'],
    'snapshot.remoteDefaultBranch',
  );
  requireLiteral(snapshot.remoteDefaultBranch.name, policy.repository.defaultBranch, 'snapshot.remoteDefaultBranch.name');
  requireLiteral(snapshot.remoteDefaultBranch.objectType, 'commit', 'snapshot.remoteDefaultBranch.objectType');
  requireLiteral(
    requireCommitSha(snapshot.remoteDefaultBranch.headSha, 'snapshot.remoteDefaultBranch.headSha'),
    localHeadSha,
    'snapshot.remoteDefaultBranch.headSha',
  );

  assertExactKeys(snapshot.requiredCheckIntegration, ['id', 'slug'], 'snapshot.requiredCheckIntegration');
  const integrationId = requireSafeInteger(
    snapshot.requiredCheckIntegration.id,
    'snapshot.requiredCheckIntegration.id',
    { minimum: 1 },
  );
  requireLiteral(
    snapshot.requiredCheckIntegration.slug,
    policy.rulesets.main.rules.requiredStatusChecks.integrationSlug,
    'snapshot.requiredCheckIntegration.slug',
  );

  assertExactKeys(snapshot.rulesets, ['items', 'pagination'], 'snapshot.rulesets');
  if (!Array.isArray(snapshot.rulesets.items)) fail('snapshot.rulesets.items must be an array.');
  validatePagination(snapshot.rulesets.pagination, snapshot.rulesets.items.length, 'snapshot.rulesets.pagination');
  requireLiteral(
    snapshot.rulesets.items.length,
    policy.rulesets.expectedCollectionCount,
    'snapshot.rulesets.items.length',
  );
  const byName = new Map();
  for (const [index, ruleset] of snapshot.rulesets.items.entries()) {
    const name = requireString(requireOwn(ruleset, 'name', `snapshot.rulesets.items[${index}]`), `snapshot.rulesets.items[${index}].name`);
    if (byName.has(name)) fail(`snapshot.rulesets contains duplicate name ${name}.`);
    byName.set(name, ruleset);
  }
  for (const expected of [policy.rulesets.main]) {
    const ruleset = byName.get(expected.name);
    if (!ruleset) fail(`snapshot.rulesets is missing ${expected.name}.`);
    validateRemoteRuleset(
      ruleset,
      expected,
      integrationId,
      `snapshot.rulesets.${expected.name}`,
    );
  }

  assertExactKeys(snapshot.actions, ['permissions', 'selectedActions', 'workflowPermissions'], 'snapshot.actions');
  assertExactKeys(snapshot.actions.permissions, ['allowedActions', 'enabled', 'shaPinningRequired'], 'snapshot.actions.permissions');
  requireLiteral(snapshot.actions.permissions.enabled, policy.actions.enabled, 'snapshot.actions.permissions.enabled');
  requireLiteral(
    snapshot.actions.permissions.allowedActions,
    policy.actions.allowedActions,
    'snapshot.actions.permissions.allowedActions',
  );
  requireLiteral(
    snapshot.actions.permissions.shaPinningRequired,
    policy.actions.shaPinningRequired,
    'snapshot.actions.permissions.shaPinningRequired',
  );
  assertExactKeys(
    snapshot.actions.selectedActions,
    ['githubOwnedAllowed', 'patternsAllowed', 'verifiedAllowed'],
    'snapshot.actions.selectedActions',
  );
  requireLiteral(
    snapshot.actions.selectedActions.githubOwnedAllowed,
    policy.actions.selectedActions.githubOwnedAllowed,
    'snapshot.actions.selectedActions.githubOwnedAllowed',
  );
  requireLiteral(
    snapshot.actions.selectedActions.verifiedAllowed,
    policy.actions.selectedActions.verifiedAllowed,
    'snapshot.actions.selectedActions.verifiedAllowed',
  );
  assertStringSet(
    snapshot.actions.selectedActions.patternsAllowed,
    policy.actions.selectedActions.patternsAllowed,
    'snapshot.actions.selectedActions.patternsAllowed',
  );
  assertExactKeys(
    snapshot.actions.workflowPermissions,
    ['canApprovePullRequestReviews', 'defaultWorkflowPermissions'],
    'snapshot.actions.workflowPermissions',
  );
  requireLiteral(
    snapshot.actions.workflowPermissions.defaultWorkflowPermissions,
    policy.actions.workflowPermissions.defaultWorkflowPermissions,
    'snapshot.actions.workflowPermissions.defaultWorkflowPermissions',
  );
  requireLiteral(
    snapshot.actions.workflowPermissions.canApprovePullRequestReviews,
    policy.actions.workflowPermissions.canApprovePullRequestReviews,
    'snapshot.actions.workflowPermissions.canApprovePullRequestReviews',
  );

  assertExactKeys(
    snapshot.security,
    [
      'codeScanningAlerts',
      'dependabotAlerts',
      'dependabotSecurityUpdates',
      'immutableReleases',
      'privateVulnerabilityReporting',
      'secretScanningAlerts',
      'vulnerabilityAlertsAndDependencyGraph',
    ],
    'snapshot.security',
  );
  requireLiteral(
    snapshot.security.vulnerabilityAlertsAndDependencyGraph,
    policy.security.vulnerabilityAlertsAndDependencyGraph,
    'snapshot.security.vulnerabilityAlertsAndDependencyGraph',
  );
  for (const [snapshotKey, policyKey] of [
    ['codeScanningAlerts', 'codeScanningOpenCriticalHigh'],
    ['dependabotAlerts', 'dependabotOpenCriticalHigh'],
    ['secretScanningAlerts', 'secretScanningOpen'],
  ]) {
    const gate = snapshot.security[snapshotKey];
    assertExactKeys(gate, ['blockedCount', 'pagination'], `snapshot.security.${snapshotKey}`);
    validatePagination(gate.pagination, gate.pagination.totalItems, `snapshot.security.${snapshotKey}.pagination`);
    requireLiteral(
      gate.blockedCount,
      policy.security.alertGates[policyKey],
      `snapshot.security.${snapshotKey}.blockedCount`,
    );
  }
  assertExactKeys(
    snapshot.security.dependabotSecurityUpdates,
    ['enabled', 'paused'],
    'snapshot.security.dependabotSecurityUpdates',
  );
  requireLiteral(
    snapshot.security.dependabotSecurityUpdates.enabled,
    policy.security.dependabotSecurityUpdates.enabled,
    'snapshot.security.dependabotSecurityUpdates.enabled',
  );
  requireLiteral(
    snapshot.security.dependabotSecurityUpdates.paused,
    policy.security.dependabotSecurityUpdates.paused,
    'snapshot.security.dependabotSecurityUpdates.paused',
  );
  requireLiteral(
    snapshot.security.immutableReleases,
    policy.security.immutableReleases,
    'snapshot.security.immutableReleases',
  );
  requireLiteral(
    snapshot.security.privateVulnerabilityReporting,
    policy.security.privateVulnerabilityReporting,
    'snapshot.security.privateVulnerabilityReporting',
  );
  return snapshot;
}

function loadPolicy() {
  let policy;
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  } catch (error) {
    fail(`Cannot parse ${path.relative(root, policyPath)}: ${error.message}`);
  }
  return validatePolicy(policy);
}

function gatherRemoteSnapshot(policy) {
  const repository = policy.repository.nameWithOwner;
  const organizationRaw = ghJson(`orgs/${policy.organization.login}`, 'Organization settings');
  const collaborators = fetchPaginatedArray(
    `repos/${repository}/collaborators?affiliation=all`,
    'repository collaborators',
  );
  const defaultRefRaw = ghJson(
    `repos/${repository}/git/ref/heads/${policy.repository.defaultBranch}`,
    'remote default branch ref',
  );
  const defaultRefObject = assertPlainObject(
    requireOwn(defaultRefRaw, 'object', 'remote default branch ref'),
    'remote default branch ref.object',
  );
  const rulesetList = fetchPaginatedArray(
    `repos/${repository}/rulesets?includes_parents=true`,
    'repository rulesets',
  );
  const rulesetIds = rulesetList.entries.map((entry, index) => {
    assertPlainObject(entry, `repository rulesets entry ${index}`);
    return requireSafeInteger(requireOwn(entry, 'id', `repository rulesets entry ${index}`), `repository rulesets entry ${index}.id`, { minimum: 1 });
  });
  if (new Set(rulesetIds).size !== rulesetIds.length) fail('repository rulesets list contains duplicate IDs.');
  const fullRulesets = rulesetIds.map((id) =>
    ghJson(`repos/${repository}/rulesets/${id}?includes_parents=true`, `repository ruleset ${id}`));

  const appRaw = ghJson(`apps/${policy.rulesets.main.rules.requiredStatusChecks.integrationSlug}`, 'required check GitHub App');
  const immutableReleasesRaw = ghJson(`repos/${repository}/immutable-releases`, 'Immutable Releases');
  assertExactKeys(immutableReleasesRaw, ['enabled', 'enforced_by_owner'], 'Immutable Releases API');
  requireBoolean(immutableReleasesRaw.enforced_by_owner, 'Immutable Releases API.enforced_by_owner');
  const pvrRaw = ghJson(`repos/${repository}/private-vulnerability-reporting`, 'Private Vulnerability Reporting');
  assertExactKeys(pvrRaw, ['enabled'], 'Private Vulnerability Reporting API');
  const securityFixesRaw = ghJson(`repos/${repository}/automated-security-fixes`, 'Dependabot security updates');
  assertExactKeys(securityFixesRaw, ['enabled', 'paused'], 'Dependabot security updates API');
  const codeScanningAlerts = projectAlertGate(
    fetchPaginatedArray(`repos/${repository}/code-scanning/alerts?state=open`, 'open code scanning alerts'),
    'code scanning',
  );
  const dependabotAlerts = projectAlertGate(
    fetchPaginatedArray(`repos/${repository}/dependabot/alerts?state=open`, 'open Dependabot alerts'),
    'Dependabot',
  );
  const secretScanningAlerts = projectAlertGate(
    fetchPaginatedArray(`repos/${repository}/secret-scanning/alerts?state=open`, 'open secret scanning alerts'),
    'secret scanning',
  );

  return {
    access: {
      collaborators: collaborators.entries.map(projectCollaborator),
      organizationDefaultRepositoryPermission: requireString(
        requireOwn(organizationRaw, 'default_repository_permission', 'Organization settings'),
        'Organization settings.default_repository_permission',
      ),
      organizationLogin: requireString(
        requireOwn(organizationRaw, 'login', 'Organization settings'),
        'Organization settings.login',
      ),
      pagination: collaborators.pagination,
    },
    repository: projectRepository(ghJson(`repos/${repository}`, 'repository settings')),
    localRepository: localRepositoryBinding(),
    remoteDefaultBranch: {
      headSha: requireCommitSha(
        requireOwn(defaultRefObject, 'sha', 'remote default branch ref.object'),
        'remote default branch ref.object.sha',
      ),
      name: policy.repository.defaultBranch,
      objectType: requireString(
        requireOwn(defaultRefObject, 'type', 'remote default branch ref.object'),
        'remote default branch ref.object.type',
      ),
    },
    requiredCheckIntegration: {
      id: requireSafeInteger(requireOwn(appRaw, 'id', 'required check GitHub App'), 'required check GitHub App.id', { minimum: 1 }),
      slug: requireString(requireOwn(appRaw, 'slug', 'required check GitHub App'), 'required check GitHub App.slug'),
    },
    rulesets: {
      items: fullRulesets,
      pagination: rulesetList.pagination,
    },
    actions: {
      permissions: projectActionsPermissions(
        ghJson(`repos/${repository}/actions/permissions`, 'Actions permissions'),
      ),
      selectedActions: projectSelectedActions(
        ghJson(`repos/${repository}/actions/permissions/selected-actions`, 'selected Actions allowlist'),
      ),
      workflowPermissions: projectWorkflowPermissions(
        ghJson(`repos/${repository}/actions/permissions/workflow`, 'default workflow permissions'),
      ),
    },
    security: {
      codeScanningAlerts,
      dependabotAlerts,
      dependabotSecurityUpdates: {
        enabled: requireBoolean(securityFixesRaw.enabled, 'Dependabot security updates API.enabled'),
        paused: requireBoolean(securityFixesRaw.paused, 'Dependabot security updates API.paused'),
      },
      immutableReleases: requireBoolean(immutableReleasesRaw.enabled, 'Immutable Releases API.enabled'),
      privateVulnerabilityReporting: requireBoolean(pvrRaw.enabled, 'Private Vulnerability Reporting API.enabled'),
      secretScanningAlerts,
      vulnerabilityAlertsAndDependencyGraph: ghProbe(
        `repos/${repository}/vulnerability-alerts`,
        'vulnerability alerts and dependency graph',
      ),
    },
  };
}

function apiRuleset({ id, policy, integrationId }) {
  const rules = [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'required_linear_history' },
      {
        type: 'pull_request',
        parameters: {
          allowed_merge_methods: [...policy.rules.pullRequest.allowedMergeMethods],
          dismiss_stale_reviews_on_push: policy.rules.pullRequest.dismissStaleReviewsOnPush,
          require_code_owner_review: policy.rules.pullRequest.requireCodeOwnerReview,
          require_last_push_approval: policy.rules.pullRequest.requireLastPushApproval,
          required_approving_review_count: policy.rules.pullRequest.requiredApprovingReviewCount,
          required_review_thread_resolution: policy.rules.pullRequest.requiredReviewThreadResolution,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          do_not_enforce_on_create: policy.rules.requiredStatusChecks.doNotEnforceOnCreate,
          required_status_checks: policy.rules.requiredStatusChecks.contexts.map((context) => ({
            context,
            integration_id: integrationId,
          })),
          strict_required_status_checks_policy: policy.rules.requiredStatusChecks.strictRequiredStatusChecksPolicy,
        },
      },
  ];
  return {
    id,
    name: policy.name,
    target: policy.target,
    source_type: policy.sourceType,
    source: policy.source,
    enforcement: policy.enforcement,
    bypass_actors: [],
    conditions: {
      ref_name: {
        include: [...policy.conditions.include],
        exclude: [...policy.conditions.exclude],
      },
    },
    rules,
  };
}

function validSnapshot(policy) {
  const integrationId = 15368;
  return {
    access: {
      collaborators: [
        {
          login: 'mp4102',
          permissions: { admin: true, maintain: true, pull: true, push: true, triage: true },
          roleName: 'admin',
        },
      ],
      organizationDefaultRepositoryPermission: 'read',
      organizationLogin: 'ZUnfurl',
      pagination: {
        complete: true,
        pageCount: 1,
        pageSize: PAGE_SIZE,
        terminalPageItemCount: 1,
        totalItems: 1,
      },
    },
    repository: {
      allowMergeCommit: false,
      allowRebaseMerge: false,
      allowSquashMerge: true,
      id: 1292385902,
      archived: false,
      defaultBranch: 'main',
      deleteBranchOnMerge: true,
      description: 'Static-first Astro framework for brand sites, Sanity CMS, and read-only Shopify retail catalogs. 0.x preview.',
      disabled: false,
      hasDiscussions: false,
      hasIssues: true,
      hasProjects: false,
      hasWiki: false,
      homepage: '',
      isTemplate: true,
      nameWithOwner: 'ZUnfurl/zunfurl',
      ownerType: 'Organization',
      private: false,
      securityAndAnalysis: {
        advancedSecurity: 'enabled',
        secretScanning: 'enabled',
        secretScanningPushProtection: 'enabled',
      },
      topics: [...EXPECTED_TOPICS],
      visibility: 'public',
      webCommitSignoffRequired: true,
    },
    localRepository: {
      branch: 'main',
      headSha: 'a'.repeat(40),
      originUrl: 'https://github.com/ZUnfurl/zunfurl.git',
      worktreeClean: true,
    },
    remoteDefaultBranch: {
      headSha: 'a'.repeat(40),
      name: 'main',
      objectType: 'commit',
    },
    requiredCheckIntegration: { id: integrationId, slug: 'github-actions' },
    rulesets: {
      items: [
        apiRuleset({ id: 1, policy: policy.rulesets.main, integrationId }),
      ],
      pagination: {
        complete: true,
        pageCount: 1,
        pageSize: PAGE_SIZE,
        terminalPageItemCount: 1,
        totalItems: 1,
      },
    },
    actions: {
      permissions: { allowedActions: 'selected', enabled: true, shaPinningRequired: true },
      selectedActions: {
        githubOwnedAllowed: true,
        patternsAllowed: ['trufflesecurity/trufflehog@bcfcf73aaf4759d4dadc2783177c245a02792318'],
        verifiedAllowed: false,
      },
      workflowPermissions: { canApprovePullRequestReviews: false, defaultWorkflowPermissions: 'read' },
    },
    security: {
      codeScanningAlerts: {
        blockedCount: 0,
        pagination: { complete: true, pageCount: 1, pageSize: PAGE_SIZE, terminalPageItemCount: 0, totalItems: 0 },
      },
      dependabotAlerts: {
        blockedCount: 0,
        pagination: { complete: true, pageCount: 1, pageSize: PAGE_SIZE, terminalPageItemCount: 0, totalItems: 0 },
      },
      dependabotSecurityUpdates: { enabled: true, paused: false },
      immutableReleases: true,
      privateVulnerabilityReporting: true,
      secretScanningAlerts: {
        blockedCount: 0,
        pagination: { complete: true, pageCount: 1, pageSize: PAGE_SIZE, terminalPageItemCount: 0, totalItems: 0 },
      },
      vulnerabilityAlertsAndDependencyGraph: true,
    },
  };
}

function expectBlocked(action, pattern, label) {
  try {
    action();
  } catch (error) {
    if (pattern.test(String(error.message))) return;
    fail(`${label} failed with an unexpected message: ${error.message}`);
  }
  fail(`${label} must block.`);
}

function runSelfTest(policy) {
  validatePolicy(policy);
  validateRemoteSnapshot(validSnapshot(policy), policy);

  const cases = [
    ['unknown policy key', (candidate) => { candidate.repository.unknown = true; }, /keys differ/],
    ['null policy value', (candidate) => { candidate.actions.enabled = null; }, /must not be null/],
    ['wrong policy type', (candidate) => { candidate.rulesets.expectedCollectionCount = '1'; }, /must equal 1/],
    ['weakened context set', (candidate) => { candidate.rulesets.main.rules.requiredStatusChecks.contexts.pop(); }, /differs/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const candidate = structuredClone(policy);
    mutate(candidate);
    expectBlocked(() => validatePolicy(candidate), pattern, label);
  }

  const snapshotCases = [
    ['unknown snapshot key', (candidate) => { candidate.unknown = true; }, /keys differ/],
    ['Organization default write', (candidate) => {
      candidate.access.organizationDefaultRepositoryPermission = 'write';
    }, /must equal "read"/],
    ['second effective writer', (candidate) => {
      candidate.access.collaborators.push({
        login: 'second-writer',
        permissions: { admin: false, maintain: false, pull: true, push: true, triage: true },
        roleName: 'write',
      });
      candidate.access.pagination.terminalPageItemCount = 2;
      candidate.access.pagination.totalItems = 2;
    }, /effective write maintainers differs/],
    ['custom elevated collaborator role', (candidate) => {
      candidate.access.collaborators[0].roleName = 'custom-admin';
    }, /unreviewed custom role/],
    ['elevated role with false permission bits', (candidate) => {
      candidate.access.collaborators[0].roleName = 'admin';
      candidate.access.collaborators[0].permissions = {
        admin: false, maintain: false, pull: false, push: false, triage: false,
      };
    }, /built-in role truth table/],
    ['wrong repository ID', (candidate) => { candidate.repository.id = 1; }, /must equal 1292385902/],
    ['Private visibility', (candidate) => { candidate.repository.visibility = 'private'; }, /must equal "public"/],
    ['Wiki enabled', (candidate) => { candidate.repository.hasWiki = true; }, /must equal false/],
    ['merge commits enabled', (candidate) => { candidate.repository.allowMergeCommit = true; }, /must equal false/],
    ['dirty local candidate', (candidate) => { candidate.localRepository.worktreeClean = false; }, /must equal true/],
    ['remote HEAD mismatch', (candidate) => { candidate.remoteDefaultBranch.headSha = 'b'.repeat(40); }, /must equal/],
    ['main bypass actor', (candidate) => {
      candidate.rulesets.items[0].bypass_actors.push({ actor_id: 1, actor_type: 'User', bypass_mode: 'always' });
    }, /zero bypass actors/],
    ['missing bypass evidence', (candidate) => { delete candidate.rulesets.items[0].bypass_actors; }, /bypass_actors is required/],
    ['unknown ruleset field', (candidate) => { candidate.rulesets.items[0].surprise = true; }, /unknown keys/],
    ['unknown pull request parameter', (candidate) => {
      candidate.rulesets.items[0].rules.find((rule) => rule.type === 'pull_request')
        .parameters.force_push_allowed = true;
    }, /unknown keys/],
    ['null integration ID', (candidate) => {
      candidate.rulesets.items[0].rules.find((rule) => rule.type === 'required_status_checks')
        .parameters.required_status_checks[0].integration_id = null;
    }, /must not be null/],
    ['unbound integration ID', (candidate) => {
      candidate.rulesets.items[0].rules.find((rule) => rule.type === 'required_status_checks')
        .parameters.required_status_checks[0].integration_id = 999;
    }, /must equal 15368/],
    ['non-strict checks', (candidate) => {
      candidate.rulesets.items[0].rules.find((rule) => rule.type === 'required_status_checks')
        .parameters.strict_required_status_checks_policy = false;
    }, /must equal true/],
    ['Actions allow all', (candidate) => { candidate.actions.permissions.allowedActions = 'all'; }, /must equal "selected"/],
    ['SHA pinning disabled', (candidate) => { candidate.actions.permissions.shaPinningRequired = false; }, /must equal true/],
    ['mutable Release assets', (candidate) => { candidate.security.immutableReleases = false; }, /must equal true/],
    ['open critical CodeQL alert', (candidate) => {
      candidate.security.codeScanningAlerts.blockedCount = 1;
      candidate.security.codeScanningAlerts.pagination.terminalPageItemCount = 1;
      candidate.security.codeScanningAlerts.pagination.totalItems = 1;
    }, /must equal 0/],
    ['pagination incomplete', (candidate) => { candidate.rulesets.pagination.complete = false; }, /must equal true/],
    ['pagination missing terminal page', (candidate) => {
      candidate.rulesets.pagination.pageCount = 1;
      candidate.rulesets.pagination.terminalPageItemCount = PAGE_SIZE;
      candidate.rulesets.pagination.totalItems = PAGE_SIZE;
    }, /lacks a terminal page/],
  ];
  for (const [label, mutate, pattern] of snapshotCases) {
    const candidate = validSnapshot(policy);
    mutate(candidate);
    expectBlocked(() => validateRemoteSnapshot(candidate, policy), pattern, label);
  }

  console.log(
    `Phase 8 GitHub security audit logic OK: ${cases.length + snapshotCases.length} fail-closed mutations; ` +
    `${EXPECTED_CONTEXTS.length} exact required contexts; 1 exact ruleset.`,
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const policy = loadPolicy();
  if (options.selfTest) {
    runSelfTest(policy);
    return;
  }
  const snapshot = gatherRemoteSnapshot(policy);
  validateRemoteSnapshot(snapshot, policy);
  console.log(
    `Phase 8 GitHub public security OK: ${policy.repository.nameWithOwner}; ` +
    `${snapshot.rulesets.items.length} rulesets; ${EXPECTED_CONTEXTS.length} GitHub Actions contexts; ` +
    'Phase 8 Lite.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Phase 8 GitHub security audit blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
