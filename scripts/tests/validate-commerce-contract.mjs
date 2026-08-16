import {
  PRODUCT_SUMMARY_BY_HANDLE_QUERY,
  createShopifyStorefrontClient,
  getProductSummaryByHandle,
} from 'gcss-commerce';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  PRODUCT_SUMMARY_BY_HANDLE_QUERY.includes('product(handle: $handle)'),
  'Product query must use the current product(handle:) Storefront API field.',
);
assert(
  PRODUCT_SUMMARY_BY_HANDLE_QUERY.includes('optionValues'),
  'Product options must use optionValues instead of deprecated values.',
);
assert(
  PRODUCT_SUMMARY_BY_HANDLE_QUERY.includes('featuredImage') &&
    PRODUCT_SUMMARY_BY_HANDLE_QUERY.includes('images(first: 6)'),
  'Product query must include Shopify product media for build-time storefront images.',
);
assert(
  !/\bmutation\b/i.test(PRODUCT_SUMMARY_BY_HANDLE_QUERY),
  'Day 5 commerce query must remain read-only.',
);
assert(
  !/cartCreate|checkoutCreate|customerAccessTokenCreate/i.test(PRODUCT_SUMMARY_BY_HANDLE_QUERY),
  'Day 5 must not create carts, checkout, or customer tokens.',
);

const fetchCalls = [];
const client = createShopifyStorefrontClient({
  storeDomain: 'example-brand-test.myshopify.com',
  storefrontAccessToken: 'test-token',
  fetch: async (url, init) => {
    fetchCalls.push({ url, init });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            product: {
              id: 'gid://shopify/Product/1',
              handle: 'example-product',
              title: 'Example Product',
              description: '',
              descriptionHtml: '',
              vendor: 'Example Brand',
              productType: 'Complexion',
              tags: [],
              availableForSale: true,
              featuredImage: null,
              images: { nodes: [] },
              options: [],
              variants: { nodes: [] },
            },
          },
        };
      },
    };
  },
});

const product = await getProductSummaryByHandle(client, {
  handle: 'example-product',
});

assert(product?.handle === 'example-product', 'Product handle should round-trip from mock API.');
assert(fetchCalls.length === 1, 'Client should make exactly one Storefront API request.');
assert(
    fetchCalls[0].url === 'https://example-brand-test.myshopify.com/api/2026-04/graphql.json',
  'Client should build the expected Storefront API endpoint.',
);
assert(
  fetchCalls[0].init.headers['X-Shopify-Storefront-Access-Token'] === 'test-token',
  'Client should send the Storefront access token header.',
);

console.log('Commerce contract OK: read-only product summary query and client boundary validated.');
