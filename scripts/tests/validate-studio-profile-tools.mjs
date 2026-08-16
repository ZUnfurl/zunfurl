import { readFileSync } from 'node:fs';
import {
  createTestSiteProfileFromEnv,
  isFeatureEnabled,
} from '../../packages/config/src/index.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, 'utf8');
}

const studioPackageSource = read('apps/studio/package.json');
const studioConfigSource = read('apps/studio/sanity.config.ts');
const studioProfileSource = read('apps/studio/src/studioProfile.ts');
const structureSource = read('apps/studio/src/structure.ts');
const pageWorkbenchSource = read('apps/studio/src/pageOperations/PageOperationsTool.tsx');
const studioEnvRunnerSource = read('scripts/studio/run-with-env.mjs');

const staticProfile = createTestSiteProfileFromEnv({ GCSS_TEST_SITE_PROFILE: 'static-brand' });
const cmsProfile = createTestSiteProfileFromEnv({ GCSS_TEST_SITE_PROFILE: 'cms-brand' });
const retailProfile = createTestSiteProfileFromEnv({ GCSS_TEST_SITE_PROFILE: 'retail' });

assert(!isFeatureEnabled(staticProfile, 'studio'), 'static-brand must not enable Studio by default.');
assert(isFeatureEnabled(cmsProfile, 'studio'), 'cms-brand must enable Studio.');
assert(isFeatureEnabled(cmsProfile, 'contentCms'), 'cms-brand must enable content CMS.');
assert(!isFeatureEnabled(cmsProfile, 'commerce'), 'cms-brand must not enable commerce.');
assert(!isFeatureEnabled(cmsProfile, 'productCms'), 'cms-brand must not enable product CMS.');
assert(isFeatureEnabled(retailProfile, 'productCms'), 'retail must enable product CMS.');

assert(
  studioPackageSource.includes('"gcss-config": "file:../../packages/config"'),
  'Studio package must explicitly depend on gcss-config.',
);

for (const expected of [
  'createSiteProfileFromEnv',
]) {
  assert(studioEnvRunnerSource.includes(expected), `Studio env runner must validate ${expected}.`);
}

assert(
  !studioEnvRunnerSource.includes('SANITY_STUDIO_SITE_MODE') &&
    !studioEnvRunnerSource.includes('SANITY_STUDIO_FEATURE_'),
  'Studio runner must not turn environment variables into production profile/feature overrides.',
);

assert(
  studioEnvRunnerSource.includes('productCmsEnabled') &&
    studioEnvRunnerSource.includes("!name.startsWith('SANITY_STUDIO_SHOPIFY_')"),
  'Studio env runner must not bundle Shopify Storefront config when product CMS is disabled.',
);

for (const expected of [
  'isStudioContentCmsEnabled',
  'isStudioProductCmsEnabled',
  'isStudioContactFormEnabled',
  'getStudioPageKinds',
  "id: 'products'",
]) {
  assert(studioProfileSource.includes(expected), `Studio profile helper must expose ${expected}.`);
}

assert(
  studioConfigSource.includes('isStudioContentCmsEnabled') &&
    studioConfigSource.includes('isStudioProductCmsEnabled'),
  'Sanity config must use profile helpers for tool registration.',
);
assert(
  studioConfigSource.includes("title: '页面工作台'") &&
    studioConfigSource.includes("title: '商品工作台'") &&
    studioConfigSource.includes("title: '商品上线向导'"),
  'Retail Studio config must keep page and product tools available.',
);
assert(
  studioConfigSource.includes('...(isStudioContentCmsEnabled()') &&
    studioConfigSource.includes('...(isStudioProductCmsEnabled()'),
  'Studio tools must be conditionally registered by profile.',
);

assert(
  structureSource.includes('getStudioPageKinds') &&
    structureSource.includes('isStudioContentCmsEnabled') &&
    structureSource.includes('isStudioProductCmsEnabled'),
  'Structure tool must use profile helpers.',
);
assert(
  structureSource.includes("title('商品工作台')") &&
    structureSource.includes("S.documentTypeListItem('productPage')") &&
    structureSource.includes("S.documentTypeListItem('productLocalePage')"),
  'Retail structure must keep product master and language page lists.',
);
assert(
  structureSource.includes('productCmsEnabled') &&
    structureSource.includes('contentCmsEnabled') &&
    structureSource.includes('当前 profile 未启用 Studio 内容管理'),
  'Structure tool must hide content/product branches when disabled by profile.',
);

assert(
  pageWorkbenchSource.includes('getStudioPageKinds') &&
    pageWorkbenchSource.includes('productCmsEnabled') &&
    pageWorkbenchSource.includes('contactFormEnabled'),
  'Page workbench must use profile-aware page kinds and module checks.',
);
assert(
  pageWorkbenchSource.includes('const productPageProjection = productCmsEnabled') &&
    pageWorkbenchSource.includes('${productPageProjection}'),
  'B page workbench queries must omit product-only nested fields instead of fetching hidden data.',
);
assert(
  !pageWorkbenchSource.includes("const pageKinds: Array<{ id: PageKind; title: string }> = ["),
  'Page workbench must not hard-code all page kinds locally.',
);

console.log('Studio profile tools OK: B/C Studio entries are profile-aware.');
