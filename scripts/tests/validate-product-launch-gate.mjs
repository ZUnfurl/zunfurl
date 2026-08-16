import { schemaTypes } from 'gcss-schemas';
import { queries } from 'gcss-sanity-queries';
import { readFile } from 'node:fs/promises';
import { buildSanitySeed } from '../migrations/local-content-to-sanity.mjs';
import { buildCopyProductContentPlan, getDraftAwareTargetIds } from '../products/copy-product-content.mjs';
import { buildProductDraftPlan } from '../products/create-product-draft.mjs';
import {
  buildDraftAwareLaunchStatusTargets,
  buildLaunchStatusPlan,
} from '../products/set-product-launch-status.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const productPage = schemaTypes.find((schemaType) => schemaType.name === 'productPage');
const productLocalePage = schemaTypes.find((schemaType) => schemaType.name === 'productLocalePage');
assert(productPage, 'schema must include productPage.');
assert(!schemaTypes.some((schemaType) => schemaType.name === 'productPageLocale'), 'schema must remove legacy productPageLocale object.');
assert(productLocalePage, 'schema must include productLocalePage.');

const pageFieldsByName = new Map(productPage.fields.map((field) => [field.name, field]));
const localeFieldsByName = new Map(productLocalePage.fields.map((field) => [field.name, field]));
const productStatusField = pageFieldsByName.get('productStatus');
const launchStatusField = localeFieldsByName.get('launchStatus');

assert(productStatusField, 'productPage must include productStatus.');
assert(productStatusField.group === 'identity', 'productStatus must stay in the identity group.');
assert(productStatusField.options.list.some((option) => option.value === 'archived'), 'productStatus must include archived.');

assert(launchStatusField, 'productLocalePage must include launchStatus.');
assert(launchStatusField.group === 'launch', 'launchStatus must be visible in the launch/path editor tab.');
assert(launchStatusField.initialValue === 'draft', 'New locale entries must default to draft.');
assert(launchStatusField.title === '上线状态', 'launchStatus Studio title must stay localized in Chinese.');
assert(
  launchStatusField.description.includes('只有“上线”的语言页面会进入前台构建'),
  'launchStatus Studio description must explain the language page storefront gate in Chinese.',
);
assert(
  launchStatusField.options.list.some((option) => option.title === '上线 - 进入前台构建'),
  'launchStatus live option title must stay localized in Chinese.',
);

let launchStatusValidator;
launchStatusField.validation({
  required: () => ({
    custom: (validator) => {
      launchStatusValidator = validator;
      return validator;
    },
  }),
});

assert(typeof launchStatusValidator === 'function', 'launchStatus must have a custom validator.');
assert(
  launchStatusValidator('live', { document: { shopifyStatus: 'storefront-available' } }) !== true,
  'launchStatus live must require structural Shopify Product GID and handle mapping.',
);
assert(
  launchStatusValidator('live', {
    document: {
      shopifyProductGid: 'gid://shopify/Product/fixture',
      shopifyHandle: 'mapped-product',
      shopifyStatus: 'storefront-unavailable',
    },
  }) === true,
  'launchStatus live must allow mapped products even when availableForSale snapshot is false.',
);
assert(
  launchStatusValidator('draft', { document: { shopifyStatus: 'pending-shopify-summary' } }) === true,
  'launchStatus draft must remain editable before Shopify summary sync.',
);

assert(
  queries.productPagesByLocale.includes('productPage->productStatus == "active"'),
  'Public product list query must require active product master records.',
);
assert(
  queries.productPagesByLocale.includes('defined(productPage->shopifyProductGid)') &&
    queries.productPagesByLocale.includes('defined(productPage->shopifyHandle)'),
  'Public product list query must require structural Shopify mapping.',
);
assert(
  !queries.productPagesByLocale.includes('shopifyStatus == "storefront-available"'),
  'Public product eligibility must not use an availableForSale-derived snapshot.',
);

const launchWizardSource = await readFile(
  new URL('../../apps/studio/src/productLaunch/ProductLaunchWizard.tsx', import.meta.url),
  'utf8',
);
const productWorkbenchSource = await readFile(
  new URL('../../apps/studio/src/productOperations/ProductOperationsTool.tsx', import.meta.url),
  'utf8',
);

assert(
  !launchWizardSource.includes("shopifyStatus !== 'storefront-available'"),
  'Product launch wizard must not block content launch on availableForSale-derived status.',
);
assert(
  launchWizardSource.includes('当前不可售（不阻断内容上线）'),
  'Product launch wizard may show availability only as a non-blocking runtime hint.',
);
assert(
  !productWorkbenchSource.includes("product.shopifyStatus === 'storefront-available'"),
  'Product workbench mapping readiness must use structural identity, not availability.',
);
assert(
  queries.productPagesByLocale.includes('launchStatus == "live"'),
  'Public product list query must only return live locale entries.',
);
assert(
  queries.productPageByLocaleAndSlug.includes('launchStatus == "live"'),
  'Public product detail query must only return live locale entries.',
);
assert(
  queries.productPagePathsByLocales.includes('launchStatus == "live"'),
  'Product path query must only expose live locale entries.',
);
assert(
  queries.productPagesByLocale.includes('!(_id in path("drafts.**"))'),
  'Public product list query must exclude Sanity drafts.',
);

const draftPlan = buildProductDraftPlan({
  handle: 'example-launch-product',
  name: 'Example Launch Product',
});
const draftProductPage = draftPlan.documents.find((document) => document._type === 'productPage');
const draftLocalePages = draftPlan.documents.filter((document) => document._type === 'productLocalePage');

assert(draftProductPage, 'Generated new product must use productPage.');
assert(draftLocalePages.length === 3, 'Generated new product must use productLocalePage documents.');
assert(!('defaultLocale' in draftProductPage), 'Generated productPage must not include defaultLocale.');
assert(!('locales' in draftProductPage), 'Generated productPage must not include productPage.locales[].');
assert(
  draftLocalePages.every((page) => page.launchStatus === 'draft'),
  'Generated productLocalePage documents must default to draft launchStatus.',
);

const seed = await buildSanitySeed();
const baselineProductPage = seed.documents.find((document) => document._type === 'productPage');
const baselineLocalePages = seed.documents.filter((document) => document._type === 'productLocalePage');

assert(baselineProductPage, 'Migrated baseline product must use productPage.');
assert(baselineLocalePages.length === 3, 'Migrated baseline product must use productLocalePage documents.');
assert(!('defaultLocale' in baselineProductPage), 'Migrated productPage must not include defaultLocale.');
assert(!('locales' in baselineProductPage), 'Migrated productPage must not include productPage.locales[].');
assert(
  baselineLocalePages.every((page) => page.launchStatus === 'live'),
  'Migrated baseline productLocalePage documents must stay live.',
);

const livePlan = buildLaunchStatusPlan({
  handle: 'example-product',
  launchStatus: 'live',
  locales: ['en'],
});

assert(livePlan.documentIds.length === 1, 'Launch status plan must target one productPage.');
assert(
  livePlan.documentIds.includes('productPage.example-product'),
  'Launch status plan must include productPage.',
);
assert(
  livePlan.localeDocumentIds.length === 1 &&
    livePlan.localeDocumentIds[0] === 'productLocalePage.en.example-product',
  'Launch status plan must include the selected productLocalePage.',
);
assert(livePlan.locales.length === 1 && livePlan.locales[0] === 'en', 'Launch status plan must support single-locale publish.');

const draftAwareLaunchTargets = buildDraftAwareLaunchStatusTargets(livePlan.documentIds, [
  { _id: 'productPage.example-product' },
  { _id: 'drafts.productPage.example-product' },
]);

assert(
  draftAwareLaunchTargets.includes('drafts.productPage.example-product'),
  'Launch status updates must include existing Sanity drafts.',
);
const draftAwareLocaleLaunchTargets = buildDraftAwareLaunchStatusTargets(livePlan.localeDocumentIds, [
  { _id: 'productLocalePage.en.example-product' },
  { _id: 'drafts.productLocalePage.en.example-product' },
]);

assert(
  draftAwareLocaleLaunchTargets.includes('drafts.productLocalePage.en.example-product'),
  'Launch status updates must include existing productLocalePage drafts.',
);

try {
  buildLaunchStatusPlan({ handle: 'example-product', launchStatus: 'published' });
  throw new Error('Expected invalid launch status guard to throw.');
} catch (error) {
  assert(
    error.message.includes('draft, ready, live, archived'),
    'Launch status plan must reject unsupported statuses.',
  );
}

const copyPlan = buildCopyProductContentPlan({
  sourceHandle: 'example-product',
  targetHandle: 'example-launch-product',
  targetName: 'Example Launch Product',
});

assert(copyPlan.documentIds.length === 1, 'Product content copy must check one target productPage.');
assert(
  copyPlan.documentIds.includes('productPage.example-launch-product'),
  'Product content copy must include the target productPage.',
);
assert(
  copyPlan.localeDocumentIds.length === 3 &&
    copyPlan.localeDocumentIds.includes('productLocalePage.en.example-launch-product'),
  'Product content copy must include target productLocalePage documents.',
);

const draftAwareCopyTargets = getDraftAwareTargetIds(
  'productLocalePage.en.example-launch-product',
  new Map([
    ['productLocalePage.en.example-launch-product', {}],
    ['drafts.productLocalePage.en.example-launch-product', {}],
  ]),
);

assert(
  draftAwareCopyTargets.includes('drafts.productLocalePage.en.example-launch-product'),
  'Product content copy must update existing productLocalePage drafts.',
);

try {
  buildCopyProductContentPlan({
    sourceHandle: 'example-product',
    targetHandle: 'example-product',
    targetName: 'Example Product',
  });
  throw new Error('Expected same source and target guard to throw.');
} catch (error) {
  assert(
    error.message.includes('must be different'),
    'Product content copy must reject same source and target handles.',
  );
}

console.log('Product launch gate OK: only live productLocalePage documents enter storefront builds.');
