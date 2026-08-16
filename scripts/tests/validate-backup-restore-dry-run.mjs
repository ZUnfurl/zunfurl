import { readFile } from 'node:fs/promises';
import { buildSanityBackupPlan } from '../backup-sanity/plan.mjs';
import { buildShopifyBackupPlan } from '../backup-shopify/plan.mjs';
import { buildRestoreCheckPlan } from '../restore-check/plan.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDryRunR2Boundary(manifest, name) {
  assert(manifest.status === 'roadmap-design', `${name} must be labeled roadmap-design.`);
  assert(manifest.mode === 'dry-run', `${name} must remain dry-run.`);
  assert(manifest.capabilities.export === false, `${name} must not claim export capability.`);
  assert(manifest.capabilities.import === false, `${name} must not claim import capability.`);
  assert(manifest.capabilities.restore === false, `${name} must not claim restore capability.`);
  assert(manifest.r2.bucketEnv === 'R2_BACKUP_BUCKET', `${name} must use the R2 backup bucket env placeholder.`);
  assert(manifest.r2.publicBucket === false, `${name} must not require a public R2 bucket.`);
  assert(manifest.r2.writesToR2 === false, `${name} must not write to R2.`);
  assert(manifest.r2.deletesFromR2 === false, `${name} must not delete from R2.`);
  assert(manifest.safety.dryRunOnly === true, `${name} safety block must mark dryRunOnly=true.`);
}

async function assertSourceHasNoRemoteWrites(filePath) {
  const source = await readFile(filePath, 'utf8');

  assert(!/wrangler\s+r2\s+object\s+put/.test(source), `${filePath} must not upload R2 objects.`);
  assert(!/wrangler\s+r2\s+object\s+delete/.test(source), `${filePath} must not delete R2 objects.`);
  assert(!/wrangler\s+r2\s+bucket\s+(create|delete)/.test(source), `${filePath} must not create or delete R2 buckets.`);
  assert(!/public\s+bucket/i.test(source), `${filePath} must not enable public R2 buckets.`);
  assert(!/sanity\s+dataset\s+import/.test(source), `${filePath} must not import Sanity datasets.`);
  assert(!/\bfetch\s*\(/.test(source), `${filePath} must not make remote requests.`);
  assert(!/node:(?:http|https)/.test(source), `${filePath} must not import HTTP clients.`);
  assert(!source.includes('SHOPIFY_ADMIN_ACCESS_TOKEN'), `${filePath} must not require Shopify Admin tokens.`);
  assert(!source.includes('SANITY_API_WRITE_TOKEN'), `${filePath} must not require Sanity write tokens.`);
}

const runId = 'roadmap-test-run';
const sanityManifest = await buildSanityBackupPlan({ runId });
const shopifyManifest = await buildShopifyBackupPlan({ runId });
const restoreManifest = buildRestoreCheckPlan({ runId });

assertDryRunR2Boundary(sanityManifest, 'Sanity backup manifest');
assertDryRunR2Boundary(shopifyManifest, 'Shopify backup manifest');
assertDryRunR2Boundary(restoreManifest, 'Restore check manifest');

assert(sanityManifest.dataset === 'development', 'Sanity backup plan should target development only.');
assert(
  sanityManifest.r2.prefix === 'backup/sanity-assets/roadmap-test-run/',
  'Sanity backup prefix should use backup/sanity-assets.',
);
assert(
  sanityManifest.artifacts[0].documentCount === 16,
  `Expected 16 Sanity dry-run documents, received ${sanityManifest.artifacts[0].documentCount}.`,
);
assert(sanityManifest.safety.productionDatasetWrite === false, 'Sanity backup must not write production dataset.');
assert(
  sanityManifest.safety.operatorOneClickProductionImport === false,
  'Sanity backup must not expose one-click production import.',
);
assert(
  sanityManifest.artifacts.every((artifact) => artifact.plannedOnly === true),
  'Every Sanity artifact must be labeled plannedOnly.',
);

await assertRejects(
  () => buildSanityBackupPlan({ dataset: 'production', runId }),
  'Sanity backup plan must refuse production dataset planning.',
);

assert(
  shopifyManifest.r2.prefix === 'backup/shopify-originals/roadmap-test-run/',
  'Shopify backup prefix should use backup/shopify-originals.',
);
assert(
  shopifyManifest.scope.productHandles.length === 1 &&
    shopifyManifest.scope.productHandles[0] === 'example-product',
  'Shopify backup plan should only include the Example Product handle for now.',
);
assert(shopifyManifest.safety.shopifyMutation === false, 'Shopify backup must not mutate Shopify.');
assert(
  shopifyManifest.safety.shopifyAdminTokenRequired === false,
  'Shopify backup dry-run must not require Admin API credentials.',
);
assert(
  shopifyManifest.artifacts.every((artifact) => artifact.plannedOnly === true),
  'Every Shopify artifact must be labeled plannedOnly.',
);

assert(
  restoreManifest.prefixes.sanityAssets === 'backup/sanity-assets/roadmap-test-run/',
  'Restore check should include sanity-assets prefix.',
);
assert(
  restoreManifest.prefixes.shopifyOriginals === 'backup/shopify-originals/roadmap-test-run/',
  'Restore check should include shopify-originals prefix.',
);
assert(
  restoreManifest.prefixes.brandMasters === 'backup/brand-masters/roadmap-test-run/',
  'Restore check should include brand-masters prefix.',
);
assert(restoreManifest.safety.productionDatasetImport === false, 'Restore check must not import production dataset.');
assert(restoreManifest.safety.remoteDelete === false, 'Restore check must not delete remote data.');
assert(
  restoreManifest.checks.every((check) => check.plannedOnly === true),
  'Every restore check must be labeled plannedOnly.',
);

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const scripts = packageJson.scripts ?? {};

assert(!('test:backup' in scripts), 'The ambiguous test:backup command must not be published.');
assert(!('backup:sanity:plan' in scripts), 'The ambiguous backup:sanity:plan command must not be published.');
assert(!('backup:shopify:plan' in scripts), 'The ambiguous backup:shopify:plan command must not be published.');
assert(!('restore:check:plan' in scripts), 'The ambiguous restore:check:plan command must not be published.');
assert(
  scripts['test:roadmap-recovery'] === 'node ./scripts/tests/validate-backup-restore-dry-run.mjs',
  'The roadmap recovery boundary test must have an explicit roadmap name.',
);
assert(
  scripts['roadmap:backup:sanity:plan'] === 'node ./scripts/backup-sanity/plan.mjs',
  'The Sanity design planner must have an explicit roadmap name.',
);
assert(
  scripts['roadmap:backup:shopify:plan'] === 'node ./scripts/backup-shopify/plan.mjs',
  'The Shopify design planner must have an explicit roadmap name.',
);
assert(
  scripts['roadmap:restore:check:plan'] === 'node ./scripts/restore-check/plan.mjs',
  'The restore-check design planner must have an explicit roadmap name.',
);

await Promise.all([
  assertSourceHasNoRemoteWrites(new URL('../backup-sanity/plan.mjs', import.meta.url)),
  assertSourceHasNoRemoteWrites(new URL('../backup-shopify/plan.mjs', import.meta.url)),
  assertSourceHasNoRemoteWrites(new URL('../restore-check/plan.mjs', import.meta.url)),
]);

console.log('Roadmap recovery boundary OK: design manifests cannot claim export, import, or restore capability.');

async function assertRejects(fn, message) {
  try {
    await fn();
  } catch {
    return;
  }

  throw new Error(message);
}
