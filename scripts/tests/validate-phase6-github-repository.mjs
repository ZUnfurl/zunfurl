/**
 * 对 Phase 6 复用的 GitHub 仓库容器执行只读、脱敏审计。
 *
 * 本脚本只调用 GitHub REST/GraphQL 读取接口、`git ls-remote` 和本地
 * `git lfs ls-files`。输出仅包含计数、布尔设置和状态码分类；不得输出
 * secret、variable、run ID、日志 URL、GitHub App 名称或授权明细。
 *
 * 默认模式用于生成审计快照；传入 `--require-clean` 时，若远程仍含旧历史、
 * 旧 Actions 记录或其他必须清场的对象，则以非零状态退出。GitHub App 的
 * 仓库授权范围受账户权限与 sudo mode 保护，始终保留为人工 Gate。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TARGET = 'ZUnfurl/zunfurl';

function parseArgs(argv) {
  const options = {
    repository: undefined,
    target: DEFAULT_TARGET,
    requireClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-clean') {
      options.requireClean = true;
      continue;
    }
    if (argument === '--repository' || argument === '--target') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires an owner/name value.`);
      }
      const key = argument === '--repository' ? 'repository' : 'target';
      options[key] = value;
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

function localWorkflowPaths() {
  const directory = path.join(process.cwd(), '.github', 'workflows');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => `.github/workflows/${entry.name}`)
    .sort();
}

function countRemoteRefs(repository) {
  const result = command('git', [
    'ls-remote',
    '--refs',
    `https://github.com/${repository}.git`,
  ]);
  if (!result.ok) {
    throw new Error('git ls-remote failed for the audited repository.');
  }
  const refs = result.stdout
    ? result.stdout.split(/\r?\n/).map((line) => line.split(/\s+/)[1]).filter(Boolean)
    : [];
  const count = (prefix) => refs.filter((entry) => entry.startsWith(prefix)).length;
  return {
    total: refs.length,
    branches: count('refs/heads/'),
    tags: count('refs/tags/'),
    pullRequests: count('refs/pull/'),
    other: refs.filter((entry) => !/^refs\/(?:heads|tags|pull)\//.test(entry)).length,
  };
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

function countAvailableLogArchives(repository, runIds) {
  let available = 0;
  let unavailable = 0;
  for (const runId of runIds) {
    const result = command(
      'gh',
      ['api', `repos/${repository}/actions/runs/${runId}/logs`],
      { discardStdout: true },
    );
    if (result.ok) {
      available += 1;
    } else {
      unavailable += 1;
    }
  }
  return { available, unavailable };
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

/** 执行仓库容器审计；返回值不会携带 secret、变量值或远程对象名称。 */
export function auditPhase6Repository({
  repository = repositoryFromOrigin(),
  target = DEFAULT_TARGET,
} = {}) {
  const { owner, name } = splitRepository(repository);
  const { owner: targetOwner, name: targetName } = splitRepository(target);
  const repo = ghJson(
    `repos/${repository}`,
    '{name_with_owner: .full_name, private: .private, visibility: .visibility, is_template: .is_template, default_branch: .default_branch, archived: .archived, disabled: .disabled, has_issues: .has_issues, has_projects: .has_projects, has_wiki: .has_wiki, has_discussions: .has_discussions, fork_count: .fork_count, allow_forking: .allow_forking, web_commit_signoff_required: .web_commit_signoff_required, security_and_analysis: .security_and_analysis}',
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
        defaultBranchRef {
          target { ... on Commit { history(first: 1) { totalCount } oid } }
        }
      }
    }`,
    jq: '{packages: .data.repository.packages.totalCount, discussions: .data.repository.discussions.totalCount, commits: .data.repository.defaultBranchRef.target.history.totalCount, head_oid: .data.repository.defaultBranchRef.target.oid}',
  });

  const branches = ghJson(
    `repos/${repository}/branches?per_page=100`,
    '{count: length, protected: ([.[] | select(.protected == true)] | length)}',
  );
  const actionsRuns = ghJson(
    `repos/${repository}/actions/runs?per_page=100`,
    '{total: .total_count, completed: ([.workflow_runs[] | select(.status == "completed")] | length), success: ([.workflow_runs[] | select(.conclusion == "success")] | length), failure: ([.workflow_runs[] | select(.conclusion == "failure")] | length), approved_head: ([.workflow_runs[] | select(.head_sha == $head)] | length), ids: [.workflow_runs[].id]}'
      .replace('$head', JSON.stringify(graph.head_oid)),
  );
  const logArchives = countAvailableLogArchives(repository, actionsRuns.ids);
  delete actionsRuns.ids;

  const remoteWorkflows = ghJson(
    `repos/${repository}/actions/workflows?per_page=100`,
    '{total: .total_count, entries: [.workflows[] | {path: .path, state: .state}]}',
  );
  const approvedWorkflowPaths = localWorkflowPaths();
  const approvedWorkflowSet = new Set(approvedWorkflowPaths);
  const remoteWorkflowSet = new Set(remoteWorkflows.entries.map((entry) => entry.path));
  const workflows = {
    remoteTotal: remoteWorkflows.total,
    remoteActive: remoteWorkflows.entries.filter((entry) => entry.state === 'active').length,
    remoteInactive: remoteWorkflows.entries.filter((entry) => entry.state !== 'active').length,
    approvedLocalTotal: approvedWorkflowPaths.length,
    matchingRemote: remoteWorkflows.entries.filter((entry) => approvedWorkflowSet.has(entry.path)).length,
    unapprovedRemote: remoteWorkflows.entries.filter((entry) => !approvedWorkflowSet.has(entry.path)).length,
    missingRemote: approvedWorkflowPaths.filter((entry) => !remoteWorkflowSet.has(entry)).length,
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

  const counts = {
    remoteRefs: countRemoteRefs(repository),
    branches,
    tags: ghJson(`repos/${repository}/tags?per_page=100`, 'length'),
    pullRequests: ghJson(`repos/${repository}/pulls?state=all&per_page=100`, 'length'),
    issues: ghJson(
      `repos/${repository}/issues?state=all&per_page=100`,
      '[.[] | select(.pull_request == null)] | length',
    ),
    discussions: graph.discussions,
    releases: ghJson(`repos/${repository}/releases?per_page=100`, 'length'),
    deployments: ghJson(`repos/${repository}/deployments?per_page=100`, 'length'),
    environments: ghJson(`repos/${repository}/environments?per_page=100`, '.total_count'),
    webhooks: ghJson(`repos/${repository}/hooks?per_page=100`, 'length'),
    deployKeys: ghJson(`repos/${repository}/keys?per_page=100`, 'length'),
    collaborators: ghJson(`repos/${repository}/collaborators?affiliation=all&per_page=100`, 'length'),
    forks: ghJson(`repos/${repository}/forks?per_page=100`, 'length'),
    packages: graph.packages,
    actionsArtifacts: ghJson(`repos/${repository}/actions/artifacts?per_page=1`, '.total_count'),
    actionsCaches: ghJson(`repos/${repository}/actions/caches?per_page=1`, '.total_count'),
    actionsSecrets: ghJson(`repos/${repository}/actions/secrets?per_page=1`, '.total_count'),
    dependabotSecrets: ghJson(`repos/${repository}/dependabot/secrets?per_page=1`, '.total_count'),
    codespacesSecrets: ghJson(`repos/${repository}/codespaces/secrets?per_page=1`, '.total_count'),
    actionsVariables: ghJson(`repos/${repository}/actions/variables?per_page=1`, '.total_count'),
  };

  const lfs = countReachableLfsPointers(repository);
  const cleanupBlockers = [];
  if (!repo.private) cleanupBlockers.push('REPOSITORY_NOT_PRIVATE');
  if (!repo.is_template) cleanupBlockers.push('TEMPLATE_MODE_DISABLED');
  if (graph.commits !== 1) cleanupBlockers.push('MULTI_COMMIT_OLD_HISTORY');
  if (counts.remoteRefs.branches !== 1 || counts.remoteRefs.tags !== 0 ||
      counts.remoteRefs.pullRequests !== 0 || counts.remoteRefs.other !== 0) {
    cleanupBlockers.push('UNAPPROVED_REMOTE_REFS');
  }
  if (actionsRuns.total !== actionsRuns.approved_head || graph.commits !== 1) {
    cleanupBlockers.push('PRE_CANDIDATE_ACTIONS_RUNS_OR_LOGS');
  }
  if (workflows.unapprovedRemote !== 0 || workflows.missingRemote !== 0 ||
      workflows.remoteInactive !== 0) {
    cleanupBlockers.push('REMOTE_WORKFLOW_PATH_SET_MISMATCH');
  }
  for (const [nameKey, value] of Object.entries({
    releases: counts.releases,
    issues: counts.issues,
    discussions: counts.discussions,
    deployments: counts.deployments,
    environments: counts.environments,
    webhooks: counts.webhooks,
    deployKeys: counts.deployKeys,
    forks: counts.forks,
    packages: counts.packages,
    actionsArtifacts: counts.actionsArtifacts,
    actionsCaches: counts.actionsCaches,
    actionsSecrets: counts.actionsSecrets,
    dependabotSecrets: counts.dependabotSecrets,
    codespacesSecrets: counts.codespacesSecrets,
    actionsVariables: counts.actionsVariables,
  })) {
    if (value !== 0) cleanupBlockers.push(`NONEMPTY_${nameKey.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);
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
  cleanupBlockers.push('GITHUB_APP_REPOSITORY_ACCESS_REQUIRES_MANUAL_REVIEW');

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
      githubAppRepositoryAccess: 'manual-review-required-sudo-protected',
      reachableLfs: lfs,
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
