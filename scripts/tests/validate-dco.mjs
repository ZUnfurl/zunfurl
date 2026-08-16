/**
 * 从受信任默认分支校验 PR commit 的 DCO Signed-off-by trailer。
 *
 * 真实模式只读取 pull_request_target event 与 GitHub REST commit metadata；不
 * checkout、fetch 或执行 PR head。每个 commit 必须形成以 event base 为起点的
 * 单父线性链，并且只含一个与 Author 逐字匹配的最终 Signed-off-by trailer。
 * API 权限、分页、schema、head/base 绑定有任何歧义时一律 fail-closed。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dcoWorkflowPath = path.join(root, '.github', 'workflows', 'dco.yml');
const API_ORIGIN = 'https://api.github.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const DEPENDABOT_EMAIL = ['49699333+dependabot[bot]', 'users.noreply.github.com'].join('@');
const MAINTAINER_EMAIL = ['36223737+mp4102', 'users.noreply.github.com'].join('@');
const CANONICAL_DCO_WORKFLOW = `name: DCO

on:
  pull_request_target:
    branches:
      - main
    types:
      - opened
      - reopened
      - synchronize

permissions:
  contents: read
  pull-requests: read
  statuses: write

concurrency:
  group: \${{ github.workflow }}-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  dco:
    name: DCO metadata publisher
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout trusted base validator
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: \${{ github.sha }}
          fetch-depth: 1
          persist-credentials: false

      - name: Validate PR commit metadata through GitHub API
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: node scripts/tests/validate-dco.mjs --event "$GITHUB_EVENT_PATH" --github-api
`;

function fail(message) {
  throw new Error(message);
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function requireOwn(object, key, label) {
  requireObject(object, label);
  if (!Object.hasOwn(object, key) || object[key] === null) fail(`${label}.${key} is required and must not be null.`);
  return object[key];
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.includes('\0')) {
    fail(`${label} must be a non-empty exact string.`);
  }
  return value;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) fail(`${label} must be a full lowercase commit SHA.`);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer.`);
  return value;
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--self-test') return { selfTest: true };
  if (argv.length === 3 && argv[0] === '--event' && argv[2] === '--github-api') {
    return { selfTest: false, eventPath: requireString(argv[1], '--event') };
  }
  fail('Use --self-test alone or --event <GITHUB_EVENT_PATH> --github-api.');
}

function parseTrailerBlock(message) {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  let start = lines.length;
  while (start > 0 && /^[A-Za-z0-9-]+:\s+\S.*$/.test(lines[start - 1])) start -= 1;
  return lines.slice(start);
}

/** 校验严格投影后的 commit record，供 GitHub API 审计与自测共用。 */
export function validateCommitRecord(record) {
  requireObject(record, 'commit record');
  const keys = Object.keys(record).sort();
  const expectedKeys = ['authorEmail', 'authorName', 'dcoExemption', 'message', 'parents', 'sha'];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) fail('commit record keys differ.');
  requireSha(record.sha, 'commit sha');
  if (!Array.isArray(record.parents) || record.parents.length !== 1) {
    fail(`${record.sha} must have exactly one parent; merge/root ambiguity is not accepted.`);
  }
  requireSha(record.parents[0], 'commit parent');
  requireString(record.authorName, `${record.sha} Author name`);
  if (typeof record.authorEmail !== 'string' || !/^[^<>\s@]+@[^<>\s@]+$/.test(record.authorEmail)) {
    fail(`${record.sha} Author email is invalid.`);
  }
  if (typeof record.message !== 'string' || record.message.length === 0 || record.message.includes('\0')) {
    fail(`${record.sha} message is invalid.`);
  }

  const messageLines = record.message.replace(/\r\n/g, '\n').split('\n');
  if (messageLines.some((line) => /^co-authored-by:/i.test(line))) {
    fail(`${record.sha} Co-authored-by is unsupported because every human author must independently satisfy DCO.`);
  }
  const allSignoffLines = messageLines.filter((line) => /signed-off-by/i.test(line));
  if (record.dcoExemption === 'dependabot') {
    if (record.authorName !== 'dependabot[bot]' ||
        record.authorEmail !== DEPENDABOT_EMAIL ||
        allSignoffLines.length !== 0) {
      fail(`${record.sha} Dependabot exemption projection is inconsistent.`);
    }
    return record;
  }
  if (record.dcoExemption !== 'none') fail(`${record.sha} DCO exemption is not recognized.`);
  if (allSignoffLines.length !== 1) fail(`${record.sha} must contain exactly one Signed-off-by line.`);
  const expected = `Signed-off-by: ${record.authorName} <${record.authorEmail}>`;
  if (allSignoffLines[0] !== expected) fail(`${record.sha} Signed-off-by must exactly match Author.`);
  if (!parseTrailerBlock(record.message).includes(expected)) fail(`${record.sha} Signed-off-by must be in the final trailer block.`);
  return record;
}

function projectApiCommit(raw, label) {
  const commit = requireOwn(raw, 'commit', label);
  const author = requireOwn(commit, 'author', `${label}.commit`);
  const parents = requireOwn(raw, 'parents', label);
  if (!Array.isArray(parents)) fail(`${label}.parents must be an array.`);
  const apiAuthor = raw.author;
  const authorName = requireString(requireOwn(author, 'name', `${label}.commit.author`), `${label}.commit.author.name`);
  const authorEmail = requireString(requireOwn(author, 'email', `${label}.commit.author`), `${label}.commit.author.email`);
  const resemblesDependabot = authorName === 'dependabot[bot]' ||
    authorEmail.includes('dependabot[bot]') ||
    (apiAuthor !== null && typeof apiAuthor === 'object' && apiAuthor.login === 'dependabot[bot]');
  let dcoExemption = 'none';
  if (resemblesDependabot) {
    requireObject(apiAuthor, `${label}.author`);
    const verification = requireOwn(commit, 'verification', `${label}.commit`);
    if (requireOwn(apiAuthor, 'login', `${label}.author`) !== 'dependabot[bot]' ||
        requireOwn(apiAuthor, 'id', `${label}.author`) !== 49699333 ||
        requireOwn(apiAuthor, 'type', `${label}.author`) !== 'Bot' ||
        authorName !== 'dependabot[bot]' ||
        authorEmail !== DEPENDABOT_EMAIL ||
        requireOwn(verification, 'verified', `${label}.commit.verification`) !== true ||
        requireOwn(verification, 'reason', `${label}.commit.verification`) !== 'valid') {
      fail(`${label} resembles Dependabot but lacks the exact GitHub-authenticated bot identity.`);
    }
    requireString(requireOwn(verification, 'signature', `${label}.commit.verification`), `${label}.commit.verification.signature`);
    requireString(requireOwn(verification, 'payload', `${label}.commit.verification`), `${label}.commit.verification.payload`);
    dcoExemption = 'dependabot';
  }
  return validateCommitRecord({
    sha: requireSha(requireOwn(raw, 'sha', label), `${label}.sha`),
    parents: parents.map((parent, index) =>
      requireSha(requireOwn(parent, 'sha', `${label}.parents[${index}]`), `${label}.parents[${index}].sha`)),
    authorName,
    authorEmail,
    dcoExemption,
    message: requireOwn(commit, 'message', `${label}.commit`),
  });
}

function projectEvent(raw) {
  const action = requireString(requireOwn(raw, 'action', 'event'), 'event.action');
  if (!['opened', 'reopened', 'synchronize'].includes(action)) fail('event.action is outside the exact workflow trigger set.');
  const repository = requireOwn(raw, 'repository', 'event');
  const repositoryFullName = requireString(requireOwn(repository, 'full_name', 'event.repository'), 'event.repository.full_name');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryFullName)) fail('event.repository.full_name is invalid.');
  const pullRequest = requireOwn(raw, 'pull_request', 'event');
  const base = requireOwn(pullRequest, 'base', 'event.pull_request');
  const baseRepo = requireOwn(base, 'repo', 'event.pull_request.base');
  const baseRepoFullName = requireString(requireOwn(baseRepo, 'full_name', 'event.pull_request.base.repo'), 'event.pull_request.base.repo.full_name');
  if (baseRepoFullName !== repositoryFullName) fail('event base repository must equal the target repository.');
  const baseRef = requireString(requireOwn(base, 'ref', 'event.pull_request.base'), 'event.pull_request.base.ref');
  if (baseRef !== 'main') fail('event base ref must be main.');
  const head = requireOwn(pullRequest, 'head', 'event.pull_request');
  const number = requirePositiveInteger(requireOwn(raw, 'number', 'event'), 'event.number');
  const pullNumber = requirePositiveInteger(requireOwn(pullRequest, 'number', 'event.pull_request'), 'event.pull_request.number');
  if (pullNumber !== number) fail('event PR number fields differ.');
  return {
    repositoryFullName,
    number,
    baseSha: requireSha(requireOwn(base, 'sha', 'event.pull_request.base'), 'event.pull_request.base.sha'),
    headSha: requireSha(requireOwn(head, 'sha', 'event.pull_request.head'), 'event.pull_request.head.sha'),
    commitCount: requirePositiveInteger(requireOwn(pullRequest, 'commits', 'event.pull_request'), 'event.pull_request.commits'),
  };
}

function validateCommitChain(event, commits) {
  if (!Array.isArray(commits) || commits.length === 0) fail('GitHub API PR commit list must not be empty.');
  if (commits.length !== event.commitCount) fail('GitHub API commit count differs from event.pull_request.commits.');
  const seen = new Set();
  let expectedParent = event.baseSha;
  for (const [index, commit] of commits.entries()) {
    validateCommitRecord(commit);
    if (seen.has(commit.sha)) fail(`GitHub API repeated commit ${commit.sha}.`);
    if (commit.parents[0] !== expectedParent) fail(`GitHub API commit[${index}] does not form the exact event base..head linear chain.`);
    seen.add(commit.sha);
    expectedParent = commit.sha;
  }
  if (commits.at(-1).sha !== event.headSha) fail('GitHub API final commit does not equal event head SHA.');
  return commits.length;
}

export async function requestGithubJson(
  url,
  token,
  { method = 'GET', body, expectedStatus = 200, fetchImpl = fetch } = {},
) {
  requireString(token, 'GITHUB_TOKEN');
  if (typeof url !== 'string' || !url.startsWith(`${API_ORIGIN}/`) || new URL(url).origin !== API_ORIGIN) {
    fail('GitHub API URL must stay on https://api.github.com.');
  }
  const response = await fetchImpl(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'User-Agent': 'ZUnfurl-DCO-validator',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
  });
  if (response === null || typeof response !== 'object' ||
      response.status !== expectedStatus || response.redirected !== false || response.url !== url) {
    fail(`GitHub API request failed closed with HTTP ${response?.status ?? 'unknown'}.`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:;|$)/i.test(contentType)) fail('GitHub API response is not JSON.');
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    fail('GitHub API response contains invalid JSON.');
  }
  return responseBody;
}

async function defaultFetchPage(url, token) {
  return requestGithubJson(url, token);
}

const STATUS_CONTEXT = 'DCO / Signed-off-by';
const STATUS_DESCRIPTIONS = Object.freeze({
  pending: 'Validating PR commit metadata.',
  success: 'All commits satisfy DCO or the narrow Dependabot exemption.',
  failure: 'DCO validation failed; inspect the trusted workflow run.',
});

function validateStatusFields(response, expected, label) {
  requireObject(response, label);
  for (const key of ['url', 'state', 'context', 'description', 'target_url']) {
    if (requireOwn(response, key, label) !== expected[key]) {
      fail(`${label}.${key} differs from the requested status.`);
    }
  }
  if (Object.hasOwn(response, 'commit_url') &&
      requireOwn(response, 'commit_url', label) !== expected.commitUrl) {
    fail(`${label}.commit_url differs from the exact target commit.`);
  }
  return response;
}

export function validateStatusResponse(response, expected) {
  validateStatusFields(response, expected, 'commit status response');
  requirePositiveInteger(requireOwn(response, 'id', 'commit status response'), 'commit status response.id');
  const creator = requireOwn(response, 'creator', 'commit status response');
  if (requireOwn(creator, 'login', 'commit status response.creator') !== 'github-actions[bot]' ||
      requireOwn(creator, 'id', 'commit status response.creator') !== 41898282 ||
      requireOwn(creator, 'type', 'commit status response.creator') !== 'Bot' ||
      requireOwn(creator, 'site_admin', 'commit status response.creator') !== false) {
    fail('commit status response creator is not the exact GitHub Actions bot identity.');
  }
  return response;
}

function validateCombinedStatusBinding(response, expected, createdStatusId) {
  requireObject(response, 'combined commit status response');
  if (requireOwn(response, 'sha', 'combined commit status response') !== expected.headSha ||
      requireOwn(response, 'commit_url', 'combined commit status response') !== expected.commitUrl ||
      requireOwn(response, 'url', 'combined commit status response') !== expected.combinedUrl) {
    fail('combined commit status response differs from the exact target commit URL/head binding.');
  }
  const statuses = requireOwn(response, 'statuses', 'combined commit status response');
  const totalCount = requireOwn(response, 'total_count', 'combined commit status response');
  if (!Array.isArray(statuses) || !Number.isSafeInteger(totalCount) || totalCount < 0 || totalCount !== statuses.length) {
    fail('combined commit status response cardinality is invalid.');
  }
  const matches = statuses.filter((status) => {
    requireObject(status, 'combined commit status entry');
    const context = requireString(requireOwn(status, 'context', 'combined commit status entry'), 'combined commit status entry.context');
    return context.toLowerCase() === STATUS_CONTEXT.toLowerCase();
  });
  if (matches.length !== 1) fail('combined commit status response must contain one exact latest DCO context.');
  validateStatusFields(matches[0], expected, 'combined DCO status entry');
  if (requirePositiveInteger(requireOwn(matches[0], 'id', 'combined DCO status entry'), 'combined DCO status entry.id') !==
      createdStatusId) {
    fail('combined DCO status entry does not bind the newly created status ID.');
  }
}

async function readBackCreatedStatus(event, token, expected, createdStatusId, request) {
  const [owner, repo] = event.repositoryFullName.split('/');
  const encodedRepository = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const matching = [];
  const seenIds = new Set();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${API_ORIGIN}/repos/${encodedRepository}/commits/${event.headSha}` +
      `/statuses?per_page=${PAGE_SIZE}&page=${page}`;
    const records = await request(url, token, { expectedStatus: 200 });
    if (!Array.isArray(records) || records.length > PAGE_SIZE) {
      fail(`commit status readback page ${page} has invalid cardinality.`);
    }
    for (const [index, record] of records.entries()) {
      requireObject(record, `commit status readback page[${page}][${index}]`);
      const context = requireString(
        requireOwn(record, 'context', `commit status readback page[${page}][${index}]`),
        `commit status readback page[${page}][${index}].context`,
      );
      if (context.toLowerCase() !== STATUS_CONTEXT.toLowerCase()) continue;
      const id = requirePositiveInteger(
        requireOwn(record, 'id', `commit status readback page[${page}][${index}]`),
        `commit status readback page[${page}][${index}].id`,
      );
      if (seenIds.has(id)) fail('commit status readback contains a duplicate DCO status ID.');
      seenIds.add(id);
      matching.push(record);
    }
    if (records.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) fail('commit status readback pagination did not terminate within the fail-closed bound.');
  }
  if (matching.length === 0) fail('commit status readback did not return the newly created DCO status.');
  matching.sort((left, right) => right.id - left.id);
  const latest = validateStatusResponse(matching[0], expected);
  if (latest.id !== createdStatusId) fail('newly created DCO status is not the maximum-ID latest status on the exact head.');

  const combined = await request(expected.combinedUrl, token, { expectedStatus: 200 });
  validateCombinedStatusBinding(combined, expected, createdStatusId);
  return latest;
}

export async function publishCommitStatus(event, state, token, runId, request = requestGithubJson) {
  if (!Object.hasOwn(STATUS_DESCRIPTIONS, state)) fail('Commit status state is not approved.');
  if (typeof runId !== 'string' || !/^[1-9][0-9]*$/.test(runId)) fail('GITHUB_RUN_ID must be a positive integer string.');
  const targetUrl = `https://github.com/${event.repositoryFullName}/actions/runs/${runId}`;
  const expected = {
    headSha: event.headSha,
    state,
    context: STATUS_CONTEXT,
    description: STATUS_DESCRIPTIONS[state],
    target_url: targetUrl,
  };
  const [owner, repo] = event.repositoryFullName.split('/');
  const encodedRepository = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  expected.url = `${API_ORIGIN}/repos/${encodedRepository}/statuses/${event.headSha}`;
  expected.commitUrl = `${API_ORIGIN}/repos/${encodedRepository}/commits/${event.headSha}`;
  expected.combinedUrl = `${expected.commitUrl}/status`;
  const response = await request(expected.url, token, { method: 'POST', body: {
    state,
    context: STATUS_CONTEXT,
    description: STATUS_DESCRIPTIONS[state],
    target_url: targetUrl,
  }, expectedStatus: 201 });
  const created = validateStatusResponse(response, expected);
  return readBackCreatedStatus(event, token, expected, created.id, request);
}

async function readAllCommitPages(event, token, fetchPage = defaultFetchPage) {
  const [owner, repo] = event.repositoryFullName.split('/');
  const records = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/pulls/${event.number}/commits?per_page=${PAGE_SIZE}&page=${page}`;
    const rawPage = await fetchPage(url, token);
    if (!Array.isArray(rawPage) || rawPage.length > PAGE_SIZE) fail(`GitHub API page ${page} has invalid cardinality.`);
    records.push(...rawPage.map((raw, index) => projectApiCommit(raw, `page[${page}][${index}]`)));
    if (rawPage.length < PAGE_SIZE) return records;
  }
  fail('GitHub API pagination did not terminate within the fail-closed bound.');
}

/** 仅依赖 event 和分页 REST metadata 审计 PR，不读取本地 head。 */
export async function validatePullRequestEvent(rawEvent, token, fetchPage = defaultFetchPage) {
  const event = projectEvent(rawEvent);
  requireString(token, 'GITHUB_TOKEN');
  return validateCommitChain(event, await readAllCommitPages(event, token, fetchPage));
}

/** 冻结 DCO workflow 完整字节；任何额外 trigger/job/step/绕过均拒绝。 */
export function validateDcoWorkflow(content) {
  if (typeof content !== 'string') fail('DCO workflow must be text.');
  const normalized = content.replace(/\r\n/g, '\n');
  if (normalized !== CANONICAL_DCO_WORKFLOW) fail('DCO workflow differs from the canonical fail-closed structure.');
  return normalized;
}

function apiRawCommit({ sha, parent, authorName, authorEmail, message, apiAuthor, verification }) {
  return {
    sha,
    parents: [{ sha: parent }],
    ...(apiAuthor === undefined ? {} : { author: apiAuthor }),
    commit: {
      author: { name: authorName, email: authorEmail },
      message,
      ...(verification === undefined ? {} : { verification }),
    },
  };
}

async function expectBlocked(action, pattern, label) {
  try {
    await action();
  } catch (error) {
    if (pattern.test(error.message)) return;
    fail(`${label} returned unexpected error: ${error.message}`);
  }
  fail(`${label} must block.`);
}

async function runSelfTest() {
  const identity = { authorName: 'Noodle Freeman', authorEmail: MAINTAINER_EMAIL };
  const signedMessage = (subject) => `${subject}\n\nSigned-off-by: ${identity.authorName} <${identity.authorEmail}>`;
  const baseSha = '1'.repeat(40);
  const firstSha = '2'.repeat(40);
  const headSha = '3'.repeat(40);
  const rawCommits = [
    apiRawCommit({ sha: firstSha, parent: baseSha, ...identity, message: signedMessage('fix(test): first') }),
    apiRawCommit({ sha: headSha, parent: firstSha, ...identity, message: signedMessage('fix(test): second') }),
  ];
  const event = {
    action: 'synchronize', number: 7, repository: { full_name: 'ZUnfurl/zunfurl' },
    pull_request: {
      number: 7, commits: 2,
      base: { ref: 'main', sha: baseSha, repo: { full_name: 'ZUnfurl/zunfurl' } },
      head: { sha: headSha },
    },
  };
  await validatePullRequestEvent(event, 'test-token', async () => structuredClone(rawCommits));
  const oneCommitEvent = { ...event, pull_request: { ...event.pull_request, commits: 1, head: { sha: firstSha } } };
  const dependabotCommit = apiRawCommit({
    sha: firstSha,
    parent: baseSha,
    authorName: 'dependabot[bot]',
    authorEmail: DEPENDABOT_EMAIL,
    message: 'chore(deps): bump a reviewed dependency',
    apiAuthor: { login: 'dependabot[bot]', id: 49699333, type: 'Bot' },
    verification: { verified: true, reason: 'valid', signature: 'signed-by-github', payload: 'verified-payload' },
  });
  await validatePullRequestEvent(oneCommitEvent, 'test-token', async () => [dependabotCommit]);

  const commitCases = [
    ['missing signoff', { ...rawCommits[0], commit: { ...rawCommits[0].commit, message: 'fix(test): missing' } }, /exactly one/],
    ['duplicate signoff', { ...rawCommits[0], commit: { ...rawCommits[0].commit, message: `${rawCommits[0].commit.message}\n${rawCommits[0].commit.message.split('\n').at(-1)}` } }, /exactly one/],
    ['mismatched author', { ...rawCommits[0], commit: { ...rawCommits[0].commit, author: { ...rawCommits[0].commit.author, email: 'different@example.com' } } }, /match Author/],
    ['body-only signoff', { ...rawCommits[0], commit: { ...rawCommits[0].commit, message: `${rawCommits[0].commit.message.split('\n').at(-1)}\n\nfix(test): body` } }, /final trailer/],
    ['merge commit', { ...rawCommits[0], parents: [{ sha: baseSha }, { sha: '4'.repeat(40) }] }, /exactly one parent/],
    ['null author', { ...rawCommits[0], commit: { ...rawCommits[0].commit, author: null } }, /must not be null/],
    ['co-authored commit', { ...rawCommits[0], commit: { ...rawCommits[0].commit, message: `${rawCommits[0].commit.message}\nCo-authored-by: Other Person <${['other', 'example.invalid'].join('@')}>` } }, /Co-authored-by is unsupported/],
    ['forged Dependabot author', { ...dependabotCommit, author: { login: 'attacker', id: 1, type: 'User' } }, /exact GitHub-authenticated/],
    ['unverified Dependabot commit', { ...dependabotCommit, commit: { ...dependabotCommit.commit, verification: { ...dependabotCommit.commit.verification, verified: false } } }, /exact GitHub-authenticated/],
  ];
  for (const [label, raw, pattern] of commitCases) {
    await expectBlocked(() => validatePullRequestEvent(oneCommitEvent, 'test-token', async () => [raw]), pattern, label);
  }

  const auditCases = [
    ['event head mismatch', { event: { ...event, pull_request: { ...event.pull_request, head: { sha: '4'.repeat(40) } } }, commits: rawCommits }, /final commit/],
    ['base chain mismatch', { event, commits: [{ ...rawCommits[0], parents: [{ sha: '4'.repeat(40) }] }, rawCommits[1]] }, /exact event base/],
    ['event count mismatch', { event: { ...event, pull_request: { ...event.pull_request, commits: 3 } }, commits: rawCommits }, /count differs/],
    ['duplicate API commit', { event, commits: [rawCommits[0], { ...rawCommits[1], sha: firstSha, parents: [{ sha: firstSha }] }] }, /repeated commit/],
    ['wrong base repository', { event: { ...event, pull_request: { ...event.pull_request, base: { ...event.pull_request.base, repo: { full_name: 'Other/repo' } } } }, commits: rawCommits }, /base repository/],
    ['empty page', { event, commits: [] }, /must not be empty/],
  ];
  for (const [label, fixture, pattern] of auditCases) {
    await expectBlocked(() => validatePullRequestEvent(fixture.event, 'test-token', async () => fixture.commits), pattern, label);
  }

  const projected = projectEvent(event);
  const statusTargetUrl = 'https://github.com/ZUnfurl/zunfurl/actions/runs/123';
  const statusApiUrl = `${API_ORIGIN}/repos/ZUnfurl/zunfurl/statuses/${headSha}`;
  const statusCommitUrl = `${API_ORIGIN}/repos/ZUnfurl/zunfurl/commits/${headSha}`;
  const statusCombinedUrl = `${statusCommitUrl}/status`;
  const statusResponse = (state, overrides = {}) => ({
    id: 99,
    url: statusApiUrl,
    state,
    context: STATUS_CONTEXT,
    description: STATUS_DESCRIPTIONS[state],
    target_url: statusTargetUrl,
    creator: { login: 'github-actions[bot]', id: 41898282, type: 'Bot', site_admin: false },
    ...overrides,
  });
  const combinedResponse = (state, status, overrides = {}) => ({
    sha: headSha,
    total_count: 1,
    commit_url: statusCommitUrl,
    url: statusCombinedUrl,
    state,
    statuses: [{
      id: status.id,
      url: status.url,
      state: status.state,
      context: status.context,
      description: status.description,
      target_url: status.target_url,
    }],
    ...overrides,
  });
  const statusRequest = (state, { postOverrides = {}, listRecords, combinedOverrides = {} } = {}) => {
    const posted = statusResponse(state, postOverrides);
    return async (url, token, options) => {
      if (token !== 'test-token') fail('status publisher token projection drifted.');
      if (options.method === 'POST') {
        if (url !== statusApiUrl || options.expectedStatus !== 201 || options.body.context !== STATUS_CONTEXT ||
            options.body.state !== state || options.body.target_url !== statusTargetUrl) {
          fail('status publisher POST projection drifted.');
        }
        return posted;
      }
      if (options.expectedStatus !== 200 || Object.hasOwn(options, 'method')) {
        fail('status publisher GET projection drifted.');
      }
      if (url === `${statusCommitUrl}/statuses?per_page=${PAGE_SIZE}&page=1`) {
        return listRecords ?? [posted];
      }
      if (url === statusCombinedUrl) return combinedResponse(state, posted, combinedOverrides);
      fail('status publisher readback escaped the exact event head.');
    };
  };
  const realShapeResponse = statusResponse('pending');
  if (Object.hasOwn(realShapeResponse, 'sha')) {
    fail('real-shape commit status fixture must model GitHub 201 without a sha field.');
  }
  await publishCommitStatus(projected, 'pending', 'test-token', '123', statusRequest('pending'));
  const statusCases = [
    ['wrong status API URL', () => publishCommitStatus(projected, 'success', 'test-token', '123', statusRequest('success', {
      postOverrides: { url: `${API_ORIGIN}/repos/ZUnfurl/zunfurl/statuses/${'4'.repeat(40)}` },
    })), /response\.url differs/],
    ['wrong combined status head', () => publishCommitStatus(projected, 'success', 'test-token', '123', statusRequest('success', {
      combinedOverrides: { sha: '4'.repeat(40) },
    })), /exact target commit URL\/head binding/],
    ['wrong combined commit URL', () => publishCommitStatus(projected, 'success', 'test-token', '123', statusRequest('success', {
      combinedOverrides: { commit_url: `${API_ORIGIN}/repos/ZUnfurl/zunfurl/commits/${'4'.repeat(40)}` },
    })), /exact target commit URL\/head binding/],
    ['newer conflicting status', () => {
      const posted = statusResponse('success');
      return publishCommitStatus(projected, 'success', 'test-token', '123', statusRequest('success', {
        listRecords: [posted, statusResponse('success', { id: posted.id + 1 })],
      }));
    }, /maximum-ID latest status/],
    ['wrong status creator', () => publishCommitStatus(projected, 'success', 'test-token', '123', statusRequest('success', {
      postOverrides: { creator: { login: 'attacker', id: 1, type: 'User', site_admin: false } },
    })), /exact GitHub Actions bot/],
    ['empty status token', () => requestGithubJson(`${API_ORIGIN}/repos/ZUnfurl/zunfurl`, '', { fetchImpl: async () => null }), /GITHUB_TOKEN/],
    ['redirected status request', () => requestGithubJson(`${API_ORIGIN}/repos/ZUnfurl/zunfurl`, 'token', { fetchImpl: async (url) => ({ status: 200, redirected: true, url, headers: { get: () => 'application/json' }, json: async () => ({}) }) }), /failed closed/],
    ['wrong HTTP status', () => requestGithubJson(`${API_ORIGIN}/repos/ZUnfurl/zunfurl`, 'token', { fetchImpl: async (url) => ({ status: 403, redirected: false, url, headers: { get: () => 'application/json' }, json: async () => ({}) }) }), /HTTP 403/],
  ];
  for (const [label, action, pattern] of statusCases) await expectBlocked(action, pattern, label);

  const workflow = readFileSync(dcoWorkflowPath, 'utf8');
  validateDcoWorkflow(workflow);
  const workflowMutations = [
    ['head checkout', (value) => value.replace('github.sha', 'github.event.pull_request.head.sha')],
    ['stale base checkout', (value) => value.replace('github.sha', 'github.event.pull_request.base.sha')],
    ['job if bypass', (value) => value.replace('    runs-on:', '    if: true\n    runs-on:')],
    ['continue on error', (value) => value.replace('        run:', '        continue-on-error: true\n        run:')],
    ['self-test substitution', (value) => value.replace('--event "$GITHUB_EVENT_PATH" --github-api', '--self-test')],
    ['shell success bypass', (value) => value.replace('--github-api', '--github-api || true')],
    ['secret use', (value) => value.replace('github.token', 'secrets.DCO_TOKEN')],
    ['environment write', (value) => value.replace('run: node', 'run: echo unsafe >> "$GITHUB_ENV" && node')],
    ['extra trigger', (value) => value.replace('  pull_request_target:', '  push:\n  pull_request_target:')],
    ['comment disguise', (value) => `${value}# benign-looking drift\n`],
  ];
  for (const [label, mutate] of workflowMutations) {
    await expectBlocked(() => Promise.resolve(validateDcoWorkflow(mutate(workflow))), /canonical fail-closed/, label);
  }
  console.log(`DCO validation logic OK: ${commitCases.length + auditCases.length + statusCases.length + workflowMutations.length} fail-closed mutations.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request_target') fail('GITHUB_EVENT_NAME must be pull_request_target.');
  if (process.env.GITHUB_API_URL !== API_ORIGIN) fail(`GITHUB_API_URL must equal ${API_ORIGIN}.`);
  let event;
  try {
    event = JSON.parse(readFileSync(options.eventPath, 'utf8'));
  } catch {
    fail('GITHUB_EVENT_PATH contains invalid JSON.');
  }
  const projected = projectEvent(event);
  if (process.env.GITHUB_REPOSITORY !== projected.repositoryFullName) {
    fail('GITHUB_REPOSITORY differs from the event target repository.');
  }
  requireSha(process.env.GITHUB_SHA, 'GITHUB_SHA');
  const token = process.env.GITHUB_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;
  await publishCommitStatus(projected, 'pending', token, runId);
  let count;
  try {
    count = await validatePullRequestEvent(event, token);
    await publishCommitStatus(projected, 'success', token, runId);
  } catch (error) {
    try {
      await publishCommitStatus(projected, 'failure', token, runId);
    } catch (statusError) {
      fail(`${error.message} Failure status publication also blocked: ${statusError.message}`);
    }
    throw error;
  }
  console.log(`DCO Signed-off-by OK: ${count} PR commits form the exact event base..head chain.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`DCO validation blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
