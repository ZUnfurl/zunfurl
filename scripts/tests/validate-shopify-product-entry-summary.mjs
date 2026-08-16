import { schemaTypes } from 'gcss-schemas';
import {
  createProductPageShopifySummary,
  productPageShopifySummaryFields,
} from '../shopify/product-entry-summary.mjs';
import {
  buildDraftAwareProductPageSummaryTargets,
  parseArgs,
} from '../shopify/preview-product-entry-summary.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  parseArgs([]);
  throw new Error('Expected an explicit Shopify handle guard.');
} catch (error) {
  assert(
    error.message.includes('Missing required --handle'),
    'Live Shopify summary CLI must reject an omitted handle instead of using example-product.',
  );
}

assert(
  parseArgs(['--handle', 'customer-catalog-item']).handle === 'customer-catalog-item',
  'Live Shopify summary CLI must accept an explicit customer handle.',
);

const productPage = schemaTypes.find((schemaType) => schemaType.name === 'productPage');
const productLocalePage = schemaTypes.find((schemaType) => schemaType.name === 'productLocalePage');

assert(productPage, 'schema must include productPage.');
assert(!schemaTypes.some((schemaType) => schemaType.name === 'productPageLocale'), 'schema must remove productPageLocale.');
assert(productLocalePage, 'schema must include productLocalePage.');

const pageFieldsByName = new Map(productPage.fields.map((field) => [field.name, field]));
const productLocalePageFieldsByName = new Map(productLocalePage.fields.map((field) => [field.name, field]));
const productLocalePageSlugField = productLocalePageFieldsByName.get('slug');

assert(
  productLocalePageSlugField?.options?.isUnique({ current: 'example-product' }) === true,
  'productLocalePage slug must bypass Sanity default global slug uniqueness.',
);

for (const fieldName of productPageShopifySummaryFields) {
  const field = pageFieldsByName.get(fieldName);
  const expectedGroup = ['shopifyProductGid', 'shopifyImageSummary', 'shopifyVariantSummary'].includes(fieldName)
    ? 'system'
    : 'shopify';

  assert(field, `Missing productPage Shopify summary field: ${fieldName}.`);
  assert(field.group === expectedGroup, `${fieldName} must stay in the expected Studio group.`);
  assert(field.readOnly === true, `${fieldName} must stay read-only.`);
}
assert(pageFieldsByName.get('shopifyProductGid').hidden === true, 'Product GID must be hidden from customer-facing product master UI.');
assert(!pageFieldsByName.has('defaultLocale'), 'Legacy defaultLocale must be removed from product master UI.');
assert(!pageFieldsByName.has('locales'), 'Legacy locales array must be removed from product master UI.');

for (const fieldName of ['shopifyProductGid', 'shopifyHandle', 'shopifyStatus', 'shopifyTitle', 'shopifyAdminUrl']) {
  const field = productLocalePageFieldsByName.get(fieldName);

  assert(field, `Missing productLocalePage Shopify summary field: ${fieldName}.`);
  assert(field.readOnly === true, `${fieldName} must stay read-only on productLocalePage.`);
}

const summary = createProductPageShopifySummary({
  id: 'gid://shopify/Product/0000000000000',
  handle: 'example-product',
  title: 'Example Product',
  availableForSale: true,
  images: {
    nodes: [
      {
        url: 'https://cdn.shopify.com/s/files/example-product.webp',
        altText: 'Example Product',
        width: 1200,
        height: 1600,
      },
    ],
  },
  variants: {
    nodes: [
      {
        title: 'Default Title',
        sku: 'BSC-001',
        availableForSale: true,
        currentlyNotInStock: false,
        quantityAvailable: 999,
        selectedOptions: [{ name: 'Title', value: 'Default Title' }],
        price: { amount: '198.00', currencyCode: 'CNY' },
      },
    ],
  },
}, {
  storeDomain: 'example-store.myshopify.com',
});

assert(summary.shopifyProductGid === 'gid://shopify/Product/0000000000000', 'Product GID should be preserved.');
assert(summary.shopifyHandle === 'example-product', 'Product handle should be preserved.');
assert(summary.shopifyStatus === 'storefront-available', 'Storefront availability should be mapped.');
assert(
  summary.shopifyAdminUrl === 'https://admin.shopify.com/store/example-store/products/0000000000000',
  'Shopify Admin product URL should be derived from store domain and product GID.',
);

const serialized = JSON.stringify(summary);

assert(!serialized.includes('BSC-001'), 'Sanity summary must not store Shopify SKU.');
assert(!serialized.includes('198.00'), 'Sanity summary must not store Shopify price.');
assert(!serialized.includes('999'), 'Sanity summary must not store Shopify inventory quantity.');

const draftAwareSummaryTargets = buildDraftAwareProductPageSummaryTargets(
  ['productPage.example-product', 'productLocalePage.en.example-product'],
  [
    { _id: 'productPage.example-product' },
    { _id: 'drafts.productPage.example-product' },
    { _id: 'productLocalePage.en.example-product' },
    { _id: 'drafts.productLocalePage.en.example-product' },
  ],
);

assert(
  draftAwareSummaryTargets.includes('drafts.productPage.example-product'),
  'Shopify summary sync must include existing Sanity drafts.',
);
assert(
  draftAwareSummaryTargets.includes('drafts.productLocalePage.en.example-product'),
  'Shopify summary sync must include existing productLocalePage drafts.',
);

console.log('Shopify productPage summary OK: schema fields are read-only and summary omits SKU, price, and inventory.');
