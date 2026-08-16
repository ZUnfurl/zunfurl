import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDcoWorkflow } from './validate-dco.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const workflowDir = new URL('../../.github/workflows/', import.meta.url);
const roadmapWorkflowDir = new URL('../../docs/roadmap/workflows/', import.meta.url);
const dependabotPath = new URL('../../.github/dependabot.yml', import.meta.url);
const requiredWorkflows = [
  'codeql.yml',
  'dco.yml',
  'dependency-review.yml',
  'deploy.yml',
  'preview.yml',
  'rebuild-request.yml',
  'secret-scan.yml',
];
const retiredWorkflowNames = ['backup.yml', 'restore-test.yml'];
const roadmapExamples = ['backup-plan.example.yml', 'restore-check-plan.example.yml'];
const ignoredScanDirectories = new Set([
  '.astro',
  '.git',
  '.sanity',
  '.wrangler',
  'dist',
  'node_modules',
]);

const approvedActionPins = new Map([
  [
    'actions/checkout',
    { sha: '3d3c42e5aac5ba805825da76410c181273ba90b1', version: 'v7.0.1' },
  ],
  [
    'actions/setup-node',
    { sha: '820762786026740c76f36085b0efc47a31fe5020', version: 'v7.0.0' },
  ],
  [
    'actions/dependency-review-action',
    { sha: 'a1d282b36b6f3519aa1f3fc636f609c47dddb294', version: 'v5.0.0' },
  ],
  [
    'github/codeql-action/init',
    { sha: 'ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd', version: 'v4.37.7' },
  ],
  [
    'github/codeql-action/analyze',
    { sha: 'ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd', version: 'v4.37.7' },
  ],
  [
    'trufflesecurity/trufflehog',
    { sha: 'bcfcf73aaf4759d4dadc2783177c245a02792318', version: 'v3.97.0' },
  ],
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readWorkflow(fileName) {
  return readFile(new URL(fileName, workflowDir), 'utf8');
}

async function readRoadmapExample(fileName) {
  return readFile(new URL(fileName, roadmapWorkflowDir), 'utf8');
}

function workflowLines(content) {
  return content.split(/\r?\n/);
}

function repositoryPath(path) {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

async function discoverWorkflowLikeYamlFiles(directory = repositoryRoot) {
  const discovered = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredScanDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...await discoverWorkflowLikeYamlFiles(path));
      continue;
    }
    if (!entry.isFile() || !['.yml', '.yaml'].includes(extname(entry.name).toLowerCase())) continue;

    const content = await readFile(path, 'utf8');
    if (/^jobs:\s*$/m.test(content)) {
      discovered.push({ content, path: repositoryPath(path) });
    }
  }

  return discovered;
}

function assertApprovedActionPins(fileName, content) {
  const usesLines = workflowLines(content).filter((line) => /^\s*uses:\s*/.test(line));

  for (const line of usesLines) {
    const match = line.match(
      /^\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)@([0-9a-f]{40})\s+#\s+(v\d+\.\d+\.\d+)\s*$/,
    );
    assert(
      match,
      `${fileName} action references must use a complete lowercase commit SHA and an exact version comment: ${line.trim()}`,
    );

    const [, action, sha, version] = match;
    const approved = approvedActionPins.get(action);
    assert(approved, `${fileName} uses unapproved action ${action}.`);
    assert(sha === approved.sha, `${fileName} uses an unapproved SHA for ${action}.`);
    assert(version === approved.version, `${fileName} has a stale version comment for ${action}.`);
  }
}

function getJobBlocks(fileName, content) {
  const lines = workflowLines(content);
  const jobsIndex = lines.findIndex((line) => line === 'jobs:');
  assert(jobsIndex >= 0, `${fileName} must define jobs.`);

  const jobIndexes = [];
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) break;
    if (/^  \S/.test(line)) {
      assert(
        /^  [A-Za-z0-9_-]+:\s*$/.test(line),
        `${fileName} must declare each job as a reviewable block mapping.`,
      );
      jobIndexes.push(index);
    }
  }
  assert(jobIndexes.length > 0, `${fileName} must contain at least one job.`);

  return jobIndexes.map((start, index) => ({
    block: lines.slice(start, jobIndexes[index + 1] ?? lines.length).join('\n'),
    name: lines[start].trim().slice(0, -1),
  }));
}

function assertJobTimeouts(fileName, content) {
  for (const { block, name: jobName } of getJobBlocks(fileName, content)) {
    const timeout = block.match(/^    timeout-minutes:\s*(\d+)\s*$/m);
    assert(timeout, `${fileName} job ${jobName} must set timeout-minutes.`);
    assert(Number(timeout[1]) >= 1 && Number(timeout[1]) <= 60, `${fileName} job ${jobName} timeout is unreasonable.`);
  }
}

function assertCheckoutBoundary(fileName, content) {
  const checkoutCount = (content.match(/uses:\s*actions\/checkout@/g) ?? []).length;
  if (checkoutCount === 0) return;
  const disabledCredentialCount = (content.match(/^\s*persist-credentials:\s*false\s*$/gm) ?? []).length;
  assert(
    disabledCredentialCount === checkoutCount,
    `${fileName} must set persist-credentials: false for every checkout step.`,
  );
}

function assertCommonBoundary(fileName, content) {
  assert(content.includes('permissions:\n  contents: read'), `${fileName} must use read-only content permissions.`);
  assert(content.includes('concurrency:'), `${fileName} must define concurrency.`);
  assert(
    /^  cancel-in-progress:\s*(true|false)\s*$/m.test(content),
    `${fileName} must make its cancellation policy explicit.`,
  );
  assert(!content.includes('permissions: write-all'), `${fileName} must not request write-all permissions.`);
  assert(!content.includes('permissions: read-all'), `${fileName} must keep permissions explicit.`);
  assert(
    !content.includes('pull_request_target:') || fileName === 'dco.yml',
    `${fileName} must not execute untrusted code with base-repository privileges.`,
  );
  assert(!content.includes('GITHUB_STEP_SUMMARY'), `${fileName} must not publish custom summaries containing configuration or logs.`);
  assert(!/\b(toJson\(secrets\)|printenv\b|cat\s+\.env\b|Get-Content\s+\.env\b)/i.test(content), `${fileName} must not print secrets or environment files.`);
  assertApprovedActionPins(fileName, content);
  assertCheckoutBoundary(fileName, content);
  assertJobTimeouts(fileName, content);

  if (/^  pull_request:\s*$/m.test(content)) {
    assert(!content.includes('secrets.'), `${fileName} pull-request jobs must not read repository or production secrets.`);
  }
}

function assertNoDangerousCommands(fileName, content) {
  const lines = workflowLines(content);

  for (const line of lines) {
    const trimmed = line.trim();

    assert(
      !/npm\s+run\s+cf:deploy\b/.test(trimmed),
      `${fileName} must not call the broad cf:deploy script.`,
    );
    if (fileName !== 'deploy.yml') {
      assert(
        !/wrangler\s+deploy\b(?!.*--dry-run)/.test(trimmed),
        `${fileName} must not run wrangler deploy without --dry-run.`,
      );
      assert(
        !/gcss-worker\s+run\s+deploy\b(?!.*--dry-run)/.test(trimmed),
        `${fileName} must not deploy the Worker.`,
      );
    }
    assert(
      !/wrangler\s+r2\s+(object\s+put|object\s+delete|bucket\s+create|bucket\s+delete)\b/.test(trimmed),
      `${fileName} must not write or delete R2 resources.`,
    );
    assert(
      !/sanity\s+dataset\s+import\b/.test(trimmed),
      `${fileName} must not import into a Sanity dataset.`,
    );
  }

  assert(!content.includes('SANITY_API_WRITE_TOKEN'), `${fileName} must not wire Sanity write secrets yet.`);
  assert(!content.includes('SHOPIFY_ADMIN_ACCESS_TOKEN'), `${fileName} must not wire Shopify Admin secrets yet.`);
}

const activeWorkflowNames = await readdir(workflowDir);
const workflows = new Map();
const activeWorkflowYamlNames = activeWorkflowNames
  .filter((fileName) => ['.yml', '.yaml'].includes(extname(fileName).toLowerCase()))
  .sort();

assert(
  JSON.stringify(activeWorkflowYamlNames) === JSON.stringify([...requiredWorkflows].sort()),
  `Active workflow inventory changed without security review: ${activeWorkflowYamlNames.join(', ')}.`,
);

for (const fileName of retiredWorkflowNames) {
  assert(
    !activeWorkflowNames.includes(fileName),
    `${fileName} must remain outside .github/workflows until production capability exists.`,
  );
}

for (const fileName of requiredWorkflows) {
  assert(activeWorkflowNames.includes(fileName), `${fileName} must exist as an active workflow.`);
  const content = await readWorkflow(fileName);
  workflows.set(fileName, content);
  assertCommonBoundary(fileName, content);
  assertNoDangerousCommands(fileName, content);
}

const discoveredWorkflowFiles = await discoverWorkflowLikeYamlFiles();
for (const { content, path } of discoveredWorkflowFiles) {
  assertApprovedActionPins(path, content);
  assertCheckoutBoundary(path, content);
  assertJobTimeouts(path, content);
}

const deployWorkflow = workflows.get('deploy.yml');
const previewWorkflow = workflows.get('preview.yml');
const rebuildRequestWorkflow = workflows.get('rebuild-request.yml');
const dependencyReviewWorkflow = workflows.get('dependency-review.yml');
const dcoWorkflow = workflows.get('dco.yml');
const codeqlWorkflow = workflows.get('codeql.yml');
const secretScanWorkflow = workflows.get('secret-scan.yml');

assert(codeqlWorkflow.includes('actions: read'), 'codeql.yml must allow private-repository workflow metadata reads.');

assert(previewWorkflow.includes('pull_request:'), 'preview.yml must validate pull requests.');
assert(previewWorkflow.includes('export-project-env.mjs'), 'preview.yml must export gcss.project.json.');
assert(previewWorkflow.includes('npm run framework:audit'), 'preview.yml must validate framework boundaries.');
assert(previewWorkflow.includes('npm run test:sanity'), 'preview.yml must retain Sanity boundary validation.');
assert(previewWorkflow.includes('npm run test:commerce'), 'preview.yml must retain commerce boundary validation.');
assert(previewWorkflow.includes('npm run test:worker'), 'preview.yml must retain Worker boundary validation.');
assert(
  previewWorkflow.includes('npm audit --audit-level=high') &&
    previewWorkflow.includes('npm audit --omit=dev --audit-level=high'),
  'preview.yml primary gate must reject full-tree and production high/critical vulnerabilities.',
);
assert(
  previewWorkflow.includes('npm run test:supply-chain'),
  'preview.yml primary gate must validate the reproducible SBOM and canonical license policy.',
);
assert(
  previewWorkflow.includes('npm run test:phase1'),
  'preview.yml primary gate must retain public asset and text validation.',
);
assert(
  previewWorkflow.includes('npm run test:phase5:metadata'),
  'preview.yml primary gate must validate release metadata, repository licensing, community files, and Markdown links.',
);
assert(previewWorkflow.includes('node-version: "22.12.0"'), 'preview.yml must use Node 22.12 as the primary gate.');
assert(previewWorkflow.includes('node-version: "24.x"'), 'preview.yml must include a Node 24 compatibility gate.');
assert(previewWorkflow.includes('node-24-compatibility:'), 'preview.yml must keep Node 24 in an independent job.');
assert(previewWorkflow.includes('windows-node-22:'), 'preview.yml must keep Windows Node 22.12 in an independent job.');
assert(previewWorkflow.includes('fixtures:'), 'preview.yml must keep fixture validation in an independent job.');
for (const variant of ['A1', 'A2', 'B', 'C']) {
  assert(new RegExp(`^          - ${variant}$`, 'm').test(previewWorkflow), `preview.yml fixture matrix must include ${variant}.`);
}
assert(
  previewWorkflow.includes('npm run test:fixtures -- --variant "${{ matrix.variant }}"'),
  'preview.yml fixture matrix must run exactly one initialized variant per job.',
);
assert(
  !/^\s*CONTENT_SOURCE:\s*local\s*$/m.test(previewWorkflow),
  'preview.yml must not override an initialized project contract with local content.',
);
assert(!previewWorkflow.includes('secrets.'), 'preview.yml must be safe for external forks and use no repository secrets.');
assert(
  previewWorkflow.includes('Build local-content Studio') &&
    previewWorkflow.includes("env.GCSS_HAS_STUDIO == 'true' && env.CONTENT_SOURCE == 'local'"),
  'preview.yml must retain credential-free Studio builds only for local content.',
);
assert(
  previewWorkflow.includes('Build local-content storefront') &&
    previewWorkflow.includes("if: env.CONTENT_SOURCE == 'local'"),
  'preview.yml must retain credential-free storefront builds without overriding the project contract.',
);
assert(
  previewWorkflow.includes('gcss-worker run deploy -- --dry-run'),
  'preview.yml must validate the Worker package without deploying it.',
);
const previewJobBlocks = new Map(
  getJobBlocks('preview.yml', previewWorkflow).map(({ block, name }) => [name, block]),
);
const node24Block = previewJobBlocks.get('node-24-compatibility');
assert(node24Block, 'preview.yml must define the Node 24 compatibility job.');
assert(
  node24Block.indexOf('run: npm run build') >= 0 &&
    node24Block.indexOf('run: npm run build') <
      node24Block.indexOf('run: npm --workspace gcss-worker run deploy -- --dry-run'),
  'preview.yml Node 24 job must build the storefront before Wrangler dry-run.',
);
const windowsBlock = previewJobBlocks.get('windows-node-22');
assert(windowsBlock, 'preview.yml must define the Windows Node 22.12 job.');
for (const requiredFragment of [
  'runs-on: windows-latest',
  'node-version: "22.12.0"',
  'run: npm.cmd ci',
  'run: npm.cmd run test:phase6',
  'run: npm.cmd run framework:audit',
  'run: npm.cmd run typecheck',
  'run: npm.cmd run build',
  'run: npm.cmd run studio:build',
  'run: npm.cmd --workspace gcss-worker run deploy -- --dry-run',
  'run: git diff --check',
]) {
  assert(
    windowsBlock.includes(requiredFragment),
    `preview.yml Windows job must retain ${requiredFragment}.`,
  );
}

assert(deployWorkflow.includes('workflow_dispatch:'), 'deploy.yml must keep an explicit manual trigger.');
assert(
  !deployWorkflow.includes('repository_dispatch:') &&
    !deployWorkflow.includes('pull_request:') &&
    !deployWorkflow.includes('push:') &&
    !deployWorkflow.includes('schedule:'),
  'deploy.yml must be reachable only through manual workflow_dispatch.',
);
assert(
  /^concurrency:\s*\n  group:\s*production-deploy\s*\n  cancel-in-progress:\s*false\s*$/m.test(deployWorkflow),
  'deploy.yml must serialize production deployment attempts without cancelling an in-flight deployment.',
);
assert(
  getJobBlocks('deploy.yml', deployWorkflow).map(({ name }) => name).join(',') === 'build-and-deploy',
  'deploy.yml must expose exactly one manually triggered production deployment job.',
);
assert(
  /^    environment:\s*\n      name:\s*production\s*$/m.test(deployWorkflow),
  'deploy.yml must bind the complete deployment job to the production Environment approval boundary.',
);
assert(
  deployWorkflow.includes('required reviewers 与 deployment branch policy 属于发布前远程 Gate'),
  'deploy.yml must state that remote Environment protection remains a separate release gate.',
);
const authorizationStepIndex = deployWorkflow.indexOf('- name: Verify manual production authorization');
const checkoutStepIndex = deployWorkflow.indexOf('- name: Checkout');
assert(
  authorizationStepIndex >= 0 && checkoutStepIndex > authorizationStepIndex,
  'deploy.yml must fail closed before checkout or any project-controlled code executes.',
);
assert(
  deployWorkflow.includes('REQUESTED_REF: ${{ github.ref }}') &&
    deployWorkflow.includes('if [ "$REQUESTED_REF" != "refs/heads/main" ]; then'),
  'deploy.yml must reject every ref except refs/heads/main before checkout.',
);
assert(
  deployWorkflow.includes('PRODUCTION_DEPLOYMENT_ARMED: ${{ vars.PRODUCTION_DEPLOYMENT_ARMED }}') &&
    deployWorkflow.includes('if [ "$PRODUCTION_DEPLOYMENT_ARMED" != "true" ]; then'),
  'deploy.yml must fail closed unless the production Environment is explicitly armed.',
);
assert(
  !/^\s+(confirm|confirmation|approve|approval|approved):\s*$/mi.test(deployWorkflow),
  'deploy.yml must not present a workflow input as an approval control.',
);
assert(deployWorkflow.includes('export-project-env.mjs'), 'deploy.yml must export gcss.project.json.');
assert(deployWorkflow.includes('Reject template deployment'), 'deploy.yml must reject template-mode deployment.');
assert(deployWorkflow.includes('npm run project:scan'), 'deploy.yml must block unresolved client projects.');
assert(deployWorkflow.includes('secrets.SANITY_API_READ_TOKEN'), 'deploy.yml must use a Sanity read token only.');
assert(deployWorkflow.includes('secrets.SHOPIFY_STOREFRONT_ACCESS_TOKEN'), 'deploy.yml must use Storefront API token only.');
assert(deployWorkflow.includes('secrets.CLOUDFLARE_API_TOKEN'), 'deploy.yml must use a Cloudflare API token secret.');
assert(deployWorkflow.includes("if: env.GCSS_HAS_STUDIO == 'true'"), 'deploy.yml must gate Studio by profile.');
assert(deployWorkflow.includes("if: env.GCSS_HAS_COMMERCE == 'true'"), 'deploy.yml must gate Shopify by profile.');
assert(
  !deployWorkflow.includes('shopify:summary:preview'),
  'Normal C deploys must not run a live Shopify summary without an explicit product handle.',
);
assert(
  deployWorkflow.includes('npm --workspace gcss-worker run deploy -- --dry-run'),
  'deploy.yml must validate the Worker deployment package before deploy.',
);
assert(
  deployWorkflow.includes('npm --workspace gcss-worker run deploy'),
  'deploy.yml must retain the explicitly approved Worker deployment step.',
);
assert(
  !/shopify_(inventory|order|cart|checkout|price)/.test(deployWorkflow),
  'deploy.yml must not rebuild for Shopify inventory, order, cart, checkout, or normal price events.',
);

assert(
  rebuildRequestWorkflow.includes('repository_dispatch:') &&
    rebuildRequestWorkflow.includes('- sanity_publish') &&
    rebuildRequestWorkflow.includes('- shopify_product_structure'),
  'rebuild-request.yml must reserve only the approved structural content events.',
);
assert(
  !rebuildRequestWorkflow.includes('workflow_dispatch:') &&
    !rebuildRequestWorkflow.includes('pull_request:') &&
    !rebuildRequestWorkflow.includes('push:') &&
    !rebuildRequestWorkflow.includes('schedule:'),
  'rebuild-request.yml must only acknowledge repository_dispatch events.',
);
assert(
  getJobBlocks('rebuild-request.yml', rebuildRequestWorkflow).map(({ name }) => name).join(',') === 'acknowledge',
  'rebuild-request.yml must contain exactly one acknowledgement job.',
);
assert(
  rebuildRequestWorkflow.includes('timeout-minutes: 2'),
  'rebuild-request.yml acknowledgement must have a short timeout.',
);
assert(
  !rebuildRequestWorkflow.includes('environment:') &&
    !rebuildRequestWorkflow.includes('secrets.') &&
    !rebuildRequestWorkflow.includes('vars.') &&
    !/^\s*uses:\s*/m.test(rebuildRequestWorkflow),
  'repository_dispatch acknowledgement must have no production Environment, secret, variable, or third-party action.',
);
assert(
  !rebuildRequestWorkflow.includes('client_payload') &&
    !rebuildRequestWorkflow.includes('github.event.') &&
    !rebuildRequestWorkflow.includes('GITHUB_STEP_SUMMARY'),
  'repository_dispatch acknowledgement must not echo its payload or publish a custom summary.',
);
assert(
  rebuildRequestWorkflow.includes('Rebuild request received. A maintainer must run the manual Deploy workflow.'),
  'repository_dispatch acknowledgement must direct maintainers to the manual Deploy workflow.',
);

assert(
  dependencyReviewWorkflow.includes('actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0'),
  'dependency-review.yml must use the approved Dependency Review action.',
);
assert(
  dependencyReviewWorkflow.includes("config-file: './.github/dependency-review-config.yml'"),
  'dependency-review.yml must consume the canonical local license and vulnerability policy.',
);
assert(
  dependencyReviewWorkflow.includes("if: ${{ github.event.repository.visibility == 'public' }}"),
  'Dependency Review must skip unsupported Private/Free repositories and run immediately after Public.',
);
assert(!dependencyReviewWorkflow.includes('push:'), 'Dependency Review must only execute for pull requests.');

validateDcoWorkflow(dcoWorkflow);
assert(
  !dcoWorkflow.includes('github.event.pull_request.head.sha') &&
    !dcoWorkflow.includes('secrets.') &&
    !dcoWorkflow.includes('GITHUB_ENV') &&
    !dcoWorkflow.includes('GITHUB_OUTPUT'),
  'dco.yml metadata-only exception must never checkout, execute, or export PR head-controlled data.',
);

assert(codeqlWorkflow.includes('security-events: write'), 'codeql.yml must grant only the CodeQL upload permission it needs.');
assert(
  codeqlWorkflow.includes("if: ${{ github.event.repository.visibility == 'public' }}"),
  'CodeQL must skip unsupported Private/Free repositories and run immediately after Public.',
);
assert(codeqlWorkflow.includes('github/codeql-action/init@'), 'codeql.yml must initialize CodeQL.');
assert(codeqlWorkflow.includes('github/codeql-action/analyze@'), 'codeql.yml must upload CodeQL analysis.');
assert(codeqlWorkflow.includes('languages: javascript-typescript'), 'codeql.yml must analyze JavaScript and TypeScript.');
assert(codeqlWorkflow.includes('build-mode: none'), 'codeql.yml must use the supported no-build JavaScript analysis mode.');

assert(secretScanWorkflow.includes('fetch-depth: 0'), 'secret-scan.yml must scan reachable committed history.');
assert(secretScanWorkflow.includes('version: "3.97.0"'), 'secret-scan.yml must pin the scanner image version.');
assert(!secretScanWorkflow.includes('secrets.'), 'secret-scan.yml must require no custom or production secret.');
assert(
  !/^\s+(base|head):\s*/m.test(secretScanWorkflow),
  'secret-scan.yml must let the pinned action derive immutable base/head SHAs from the event.',
);
assert(
  secretScanWorkflow.includes('extra_args: --results=verified,unknown --fail-on-scan-errors'),
  'secret-scan.yml must fail closed for verified/unknown results and scan errors.',
);

for (const content of [deployWorkflow, previewWorkflow]) {
  assert(!content.includes('test:backup'), 'Active workflows must not claim production backup validation.');
  assert(!content.includes('test:roadmap-recovery'), 'Active workflows must not run roadmap recovery plans.');
}

for (const fileName of roadmapExamples) {
  const content = await readRoadmapExample(fileName);

  assert(
    content.includes('ROADMAP DESIGN EXAMPLE — NO EXPORT / NO IMPORT / NO RESTORE'),
    `${fileName} must state that export, import, and restore are unavailable.`,
  );
  assert(/^on:\s*\[\]\s*$/m.test(content), `${fileName} must have no GitHub event trigger.`);
  assert(content.includes('if: ${{ false }}'), `${fileName} jobs must remain explicitly disabled.`);
  assert(!content.includes('workflow_dispatch:'), `${fileName} must not advertise a runnable manual action.`);
  assert(
    content.includes('npm run test:roadmap-recovery'),
    `${fileName} must use the roadmap-only boundary test name.`,
  );
  assert(!content.includes('npm run test:backup'), `${fileName} must not use the ambiguous backup test name.`);
  assertCommonBoundary(fileName, content);
  assertNoDangerousCommands(fileName, content);
}

const roadmapWorkflowNames = (await readdir(roadmapWorkflowDir))
  .filter((fileName) => ['.yml', '.yaml'].includes(extname(fileName).toLowerCase()))
  .sort();
assert(
  JSON.stringify(roadmapWorkflowNames) === JSON.stringify([...roadmapExamples].sort()),
  `Roadmap workflow inventory changed without boundary review: ${roadmapWorkflowNames.join(', ')}.`,
);

const backupRoadmap = await readRoadmapExample('backup-plan.example.yml');
const restoreRoadmap = await readRoadmapExample('restore-check-plan.example.yml');

assert(
  backupRoadmap.includes('npm run roadmap:backup:sanity:plan') &&
    backupRoadmap.includes('npm run roadmap:backup:shopify:plan'),
  'The backup roadmap sample must use explicit roadmap planner names.',
);
assert(
  restoreRoadmap.includes('npm run roadmap:restore:check:plan'),
  'The restore roadmap sample must use the explicit roadmap planner name.',
);

const dependabot = await readFile(dependabotPath, 'utf8');
assert(dependabot.includes('package-ecosystem: npm'), 'Dependabot must monitor the npm workspace lockfile.');
assert(dependabot.includes('package-ecosystem: github-actions'), 'Dependabot must monitor pinned GitHub Actions.');
assert((dependabot.match(/interval:\s*weekly/g) ?? []).length === 2, 'Dependabot update streams must run weekly.');
assert(!dependabot.includes('insecure-external-code-execution: allow'), 'Dependabot must not enable insecure external execution.');

console.log(
  `GitHub workflow boundaries OK: ${discoveredWorkflowFiles.length} workflow-like YAML files use approved immutable action pins.`,
);
