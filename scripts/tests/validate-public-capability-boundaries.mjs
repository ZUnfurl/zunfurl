import { access, readFile, readdir } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readRepo(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

async function assertMissing(relativePath) {
  try {
    await access(new URL(`../../${relativePath}`, import.meta.url));
    throw new Error(`${relativePath} must be absent from the public candidate.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const approvedRetailNameZh = 'C 零售目录与内容运营基础框架';
const approvedRetailNameEn = 'C Retail Catalog & Content Foundation';
const authoritativeRetailPaths = [
  'README.md',
  'AGENTS.md',
  '.agents/skills/gcss-v3-site-framework/SKILL.md',
  '.agents/skills/gcss-v3-site-framework/references/profiles.md',
  '.agents/skills/gcss-v3-site-framework/references/new-project-retail.md',
  '.agents/skills/gcss-v3-site-framework/references/retail-operations.md',
  'docs/gcss-v3-site-framework-template-plan.md',
  'docs/customer-operations.md',
  'docs/customer-operations-retail.md',
  'docs/customer-page-operations.md',
  'docs/customer-product-operations.md',
];

for (const relativePath of authoritativeRetailPaths) {
  const content = await readRepo(relativePath);
  assert(
    content.includes(approvedRetailNameZh) || content.includes(approvedRetailNameEn),
    `${relativePath} must use the approved C public name.`,
  );
  assert(!content.includes('品牌零售独立站'), `${relativePath} must not use the retired C positioning.`);
  assert(!/完整\s*commerce|完整零售/iu.test(content), `${relativePath} must not imply complete commerce.`);
  assert(!content.includes('可恢复快照'), `${relativePath} must not present a product recycle entry as recovery.`);
}

const readme = await readRepo('README.md');
for (const expected of [
  'Astro 本地 preview',
  'npm.cmd run preview',
  '不包含 Cart、Checkout',
  '公开框架 Template repository',
  '客户专属 GitHub Organization',
  'Private repository',
]) {
  assert(readme.includes(expected), `README must include ${expected}.`);
}

const projectSchema = await readRepo('gcss.project.schema.json');
const projectConfig = await readRepo('packages/config/src/index.mjs');
const projectRenderers = await readRepo('scripts/template/project-renderers.mjs');
const productWorkbench = await readRepo('apps/studio/src/productOperations/ProductOperationsTool.tsx');
assert(projectSchema.includes('"retail"'), 'The machine profile retail must remain in the project schema.');
assert(projectConfig.includes("'retail'"), 'The machine profile retail must remain in runtime config.');
assert(projectRenderers.includes(approvedRetailNameZh), 'Generated customer summaries must use the approved C name.');
assert(productWorkbench.includes('取消归档'), 'Product content lifecycle UI must use unarchive terminology.');
assert(!productWorkbench.includes('可恢复快照'), 'Product UI must not promise a recoverable snapshot.');
assert(
  productWorkbench.includes('不是 Production Backup 或 Disaster Recovery Restore'),
  'Recycle-bin UI must distinguish best-effort re-creation from production recovery.',
);

const upstreamDocuments = [
  'README.md',
  'AGENTS.md',
  'docs/project-startup-and-handoff.md',
  'docs/customer-repository-settings.md',
  'docs/template-placeholder-audit.md',
  'docs/gcss-v3-site-framework-template-plan.md',
  'docs/customer-operations.md',
  '.agents/skills/gcss-v3-site-framework/references/new-project-workflow.md',
  '.agents/skills/gcss-v3-site-framework/references/new-project-static-brand.md',
  '.agents/skills/gcss-v3-site-framework/references/new-project-cms-brand.md',
  '.agents/skills/gcss-v3-site-framework/references/new-project-retail.md',
];

for (const relativePath of upstreamDocuments) {
  const content = await readRepo(relativePath);
  assert(
    content.includes('公开框架 Template repository'),
    `${relativePath} must identify the public framework Template repository.`,
  );
  assert(content.includes('客户专属 GitHub Organization'), `${relativePath} must preserve client ownership.`);
  assert(/Private repository/i.test(content), `${relativePath} must keep the customer repository private.`);
}

for (const retiredPath of [
  'docs/astro-sanity-shopify-cloudflare-retail-framework-v2.1.md',
  'docs/client-v3-architecture-advantages.md',
  'docs/framework-module-audit.md',
  'docs/framework-productization-plan.md',
  'docs/site-image-source-migration-plan.md',
  'docs/storefront-page-layering.md',
]) {
  await assertMissing(retiredPath);
}

const previewWorkflow = await readRepo('.github/workflows/preview.yml');
const deployWorkflow = await readRepo('.github/workflows/deploy.yml');
const rebuildRequestWorkflow = await readRepo('.github/workflows/rebuild-request.yml');
const worker = await readRepo('apps/worker/index.mjs');
const roadmap = await readRepo('docs/roadmap.md');
const releaseStatus = await readRepo('docs/release-status.md');
const pageOperations = await readRepo('apps/studio/src/pageOperations/PageOperationsTool.tsx');
assert(previewWorkflow.startsWith('name: CI / Pull Request Validation\n'), 'preview.yml must be named as CI validation.');
assert(previewWorkflow.includes('gcss-worker run deploy -- --dry-run'), 'PR validation must keep Worker dry-run validation.');
assert(!/gcss-worker\s+run\s+deploy\s*(?:\r?\n|$)/u.test(previewWorkflow), 'PR validation must not deploy a Worker.');
assert(
  deployWorkflow.includes('workflow_dispatch:') && !deployWorkflow.includes('repository_dispatch:'),
  'Production Deploy must remain manual-only.',
);
assert(
  deployWorkflow.includes('PRODUCTION_DEPLOYMENT_ARMED') && deployWorkflow.includes('refs/heads/main'),
  'Production Deploy must fail closed unless main is explicitly armed.',
);
assert(
  rebuildRequestWorkflow.includes('repository_dispatch:') &&
    !rebuildRequestWorkflow.includes('environment:') &&
    !rebuildRequestWorkflow.includes('secrets.') &&
    !/gcss-worker\s+run\s+deploy/u.test(rebuildRequestWorkflow),
  'Webhook dispatch must stop at a secret-free receipt instead of deploying.',
);
for (const retiredPreviewMarker of [
  'handlePreviewRequest',
  'PREVIEW_SECRET',
  'x-gcss-preview-secret',
  "searchParams.get('token')",
]) {
  assert(!worker.includes(retiredPreviewMarker), `Worker must not include ${retiredPreviewMarker}.`);
}
assert(worker.includes("url.pathname === '/preview'"), 'Worker must explicitly reserve the unavailable preview path.');
assert(worker.includes("code: 'route_not_found'"), 'Unavailable preview paths must fail closed.');
assert(
  releaseStatus.includes('当前 Worker 不提供该 handler；`/preview` 和 `/preview/*` 固定返回 `404`'),
  'Release status must describe the current fail-closed preview boundary.',
);
assert(
  releaseStatus.includes('结构性事件的 rebuild-request receipt') &&
    releaseStatus.includes('不自动 build/deploy'),
  'Release status must disclose that webhook receipts never auto-deploy.',
);
assert(
  readme.includes('`rebuild-request.yml`') && readme.includes('不构建也不部署'),
  'README must separate webhook receipts from manual production Deploy.',
);
assert(pageOperations.includes('查看已发布页面'), 'Studio must identify the published-site link accurately.');
assert(!pageOperations.includes('预览页面'), 'Studio must not label a published-site link as Draft Preview.');
for (const relativePath of [
  'docs/customer-page-operations.md',
  'docs/customer-operations-cms-brand.md',
  '.agents/skills/gcss-v3-site-framework/references/customer-docs.md',
]) {
  const content = await readRepo(relativePath);
  assert(!content.includes('点击预览页面'), `${relativePath} must not call the published-site link a preview.`);
}
for (const expected of ['真实 Sanity draft', 'HTML 页面', '身份认证', '短期会话', '`noindex`', 'query-string token', '按 Profile 裁剪', '可审计']) {
  assert(roadmap.includes(expected), `Draft Preview roadmap must include ${expected}.`);
}

const activeWorkflows = await readdir(new URL('../../.github/workflows/', import.meta.url));
assert(!activeWorkflows.includes('backup.yml'), 'backup.yml must not remain an executable Action.');
assert(!activeWorkflows.includes('restore-test.yml'), 'restore-test.yml must not remain an executable Action.');
const backupExample = await readRepo('docs/roadmap/workflows/backup-plan.example.yml');
const restoreExample = await readRepo('docs/roadmap/workflows/restore-check-plan.example.yml');
for (const [name, content] of [['backup', backupExample], ['restore', restoreExample]]) {
  assert(content.includes('NO EXPORT / NO IMPORT / NO RESTORE'), `${name} design must state unavailable capabilities.`);
  assert(/^on:\s*\[\]\s*$/mu.test(content), `${name} design must have no trigger.`);
  assert(content.includes('if: ${{ false }}'), `${name} design must remain disabled.`);
}

const packageJson = JSON.parse(await readRepo('package.json'));
for (const command of [
  'test:roadmap-recovery',
  'roadmap:backup:sanity:plan',
  'roadmap:backup:shopify:plan',
  'roadmap:restore:check:plan',
]) {
  assert(packageJson.scripts[command], `package.json must expose ${command}.`);
}
for (const retiredCommand of ['test:backup', 'backup:sanity:plan', 'backup:shopify:plan', 'restore:check:plan']) {
  assert(!packageJson.scripts[retiredCommand], `package.json must retire ambiguous command ${retiredCommand}.`);
}

console.log('Public capability boundaries OK: C, Preview, Roadmap recovery, and public-template claims are aligned.');
