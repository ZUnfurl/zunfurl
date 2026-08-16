import {
  assertDevelopmentDataset,
  buildProductDraftPlan,
  parseArgs,
} from '../products/create-product-draft.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findDocument(plan, id) {
  return plan.documents.find((document) => document._id === id);
}

function scanForbiddenCommerceFields(value, path = []) {
  const forbiddenKeys = new Set([
    'price',
    'compareAtPrice',
    'inventory',
    'inventoryQuantity',
    'availableForSale',
    'sku',
    'variants',
    'order',
    'orders',
    'payment',
    'fulfillment',
  ]);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanForbiddenCommerceFields(item, [...path, index]));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, entryValue]) => {
    const entryPath = [...path, key];
    const hits = forbiddenKeys.has(key) ? [entryPath.join('.')] : [];

    return [...hits, ...scanForbiddenCommerceFields(entryValue, entryPath)];
  });
}

const parsed = parseArgs([
  '--handle',
  'example-launch-product',
  '--name',
  'Example Launch Product',
  '--collection',
  'Le Voile',
  '--roadmap-order',
  '2',
  '--json',
]);

assert(parsed.handle === 'example-launch-product', 'CLI parser must accept --handle.');
assert(parsed.name === 'Example Launch Product', 'CLI parser must accept --name.');
assert(parsed.collection === 'Le Voile', 'CLI parser must accept --collection.');
assert(parsed.roadmapOrder === 2, 'CLI parser must parse --roadmap-order as a number.');
assert(parsed.launchStatus === 'draft', 'Product draft CLI must default launchStatus to draft.');
assert(parsed.write === false, 'Product draft CLI must remain dry-run by default.');

const plan = buildProductDraftPlan(parsed);
const productPage = findDocument(plan, 'productPage.example-launch-product');
const removedLegacyContentFields = [
  'benefits',
  'gallery',
  'longDescription',
  'roadmapDescription',
  'roadmapEyebrow',
  'roadmapFooterPrimary',
  'roadmapFooterSecondary',
  'roadmapHref',
  'roadmapPill',
  'roadmapSilhouette',
  'ritual',
  'science',
  'shortDescription',
  'status',
];

assert(plan.mode === 'dry-run', 'Product draft plan must be dry-run by default.');
assert(plan.documents.length === 4, `Expected 4 Sanity documents, received ${plan.documents.length}.`);
assert(plan.productPageDocuments.length === 1, 'Product draft plan must include one productPage document.');
assert(plan.productLocalePageDocuments.length === 3, 'Product draft plan must include three productLocalePage documents.');
assert(productPage, 'Missing productPage draft.');
assert(productPage.shopifyHandle === 'example-launch-product', 'Missing Shopify handle on productPage.');
assert(
  productPage.shopifyStatus === 'pending-shopify-summary',
  'New productPage draft should wait for Shopify summary sync.',
);
assert(!('defaultLocale' in productPage), 'Product page draft must not generate defaultLocale.');
assert(!('locales' in productPage), 'Product page draft must not generate productPage.locales[].');

for (const locale of ['en', 'fr', 'zh-cn']) {
  const languagePage = findDocument(plan, `productLocalePage.${locale}.example-launch-product`);

  assert(languagePage, `Missing productLocalePage draft for ${locale}.`);
  assert(languagePage.productPage._ref === 'productPage.example-launch-product', `Invalid productPage reference for ${locale}.`);
  assert(languagePage.slug.current === 'example-launch-product', `Invalid productLocalePage slug for ${locale}.`);
  assert(languagePage.launchStatus === 'draft', `New product language page must be hidden from storefront for ${locale}.`);
  assert(languagePage.detailHero.gallery.length === 4, `Product language page needs gallery placeholders for ${locale}.`);
  for (const fieldName of removedLegacyContentFields) {
    assert(!(fieldName in languagePage), `Product language page must not generate legacy field ${fieldName} for ${locale}.`);
  }
  for (const fieldName of ['eyebrow', 'backLabel', 'mosaicLabel', 'carouselLabel', 'previousLabel', 'nextLabel', 'surface']) {
    assert(
      !(fieldName in languagePage.detailHero),
      `Product language detail hero must not generate legacy/system field: ${fieldName}.`,
    );
  }
  for (const storyPage of languagePage.storyPages ?? []) {
    assert(!('align' in storyPage), `Product language page story must not generate align for ${locale}.`);
  }
}

for (const document of plan.documents) {
  const forbiddenHits = scanForbiddenCommerceFields(document);

  assert(
    forbiddenHits.length === 0,
    `Product draft ${document._id} contains Shopify runtime fields: ${forbiddenHits.join(', ')}.`,
  );
}

assertDevelopmentDataset('development');

try {
  assertDevelopmentDataset('production');
  throw new Error('Expected production dataset guard to throw.');
} catch (error) {
  assert(
    error.message.includes('non-development'),
    'Product draft writes must refuse non-development Sanity datasets.',
  );
}

try {
  buildProductDraftPlan({ handle: 'Invalid_Handle' });
  throw new Error('Expected invalid handle guard to throw.');
} catch (error) {
  assert(
    error.message.includes('lowercase kebab-case'),
    'Product draft handles must use lowercase kebab-case.',
  );
}

try {
  buildProductDraftPlan({ handle: 'example-launch-product', launchStatus: 'published' });
  throw new Error('Expected invalid launch status guard to throw.');
} catch (error) {
  assert(
    error.message.includes('draft, ready, live, or archived'),
    'Product draft launch status must be restricted to supported values.',
  );
}

console.log('Product draft OK: new productPage and productLocalePage documents are generated as safe dry-run drafts.');
