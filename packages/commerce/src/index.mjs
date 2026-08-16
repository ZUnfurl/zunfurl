export const defaultStorefrontApiVersion = '2026-04';

export const PRODUCT_SUMMARY_BY_HANDLE_QUERY = /* GraphQL */ `
  query ProductSummaryByHandle($handle: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      vendor
      productType
      tags
      availableForSale
      featuredImage {
        url
        altText
        width
        height
      }
      images(first: 6) {
        nodes {
          url
          altText
          width
          height
        }
      }
      options {
        id
        name
        optionValues {
          id
          name
        }
      }
      variants(first: 50) {
        nodes {
          id
          title
          sku
          availableForSale
          currentlyNotInStock
          quantityAvailable
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          image {
            url
            altText
            width
            height
          }
        }
      }
    }
  }
`;

export class ShopifyStorefrontError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message);
    this.name = 'ShopifyStorefrontError';
    this.status = status;
    this.errors = errors;
  }
}

function normalizeStoreDomain(storeDomain) {
  if (!storeDomain) {
    throw new Error('Missing SHOPIFY_STORE_DOMAIN for Shopify Storefront API.');
  }

  let normalized = String(storeDomain).trim();
  if (normalized.startsWith('https://')) {
    normalized = normalized.slice('https://'.length);
  } else if (normalized.startsWith('http://')) {
    normalized = normalized.slice('http://'.length);
  }
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function getFetch(fetchImpl) {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;

  if (typeof resolvedFetch !== 'function') {
    throw new Error('A fetch implementation is required for Shopify Storefront API requests.');
  }

  return resolvedFetch;
}

export function createShopifyStorefrontClient({
  storeDomain,
  storefrontAccessToken,
  apiVersion = defaultStorefrontApiVersion,
  fetch: fetchImpl,
} = {}) {
  if (!storefrontAccessToken) {
    throw new Error('Missing SHOPIFY_STOREFRONT_ACCESS_TOKEN for Shopify Storefront API.');
  }

  const normalizedDomain = normalizeStoreDomain(storeDomain);
  const endpoint = `https://${normalizedDomain}/api/${apiVersion}/graphql.json`;
  const resolvedFetch = getFetch(fetchImpl);

  return {
    endpoint,
    async request(query, variables = {}) {
      const response = await resolvedFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      const payload = await response.json();

      if (!response.ok || payload.errors) {
        throw new ShopifyStorefrontError('Shopify Storefront API request failed.', {
          status: response.status,
          errors: payload.errors,
        });
      }

      return payload.data;
    },
  };
}

export async function getProductSummaryByHandle(client, { handle, country, language }) {
  if (!handle) {
    throw new Error('Shopify product handle is required.');
  }

  const data = await client.request(PRODUCT_SUMMARY_BY_HANDLE_QUERY, {
    handle,
    country,
    language,
  });

  return data.product;
}

export function createShopifyStorefrontClientFromEnv(env = process.env, options = {}) {
  return createShopifyStorefrontClient({
    storeDomain: env.SHOPIFY_STORE_DOMAIN,
    storefrontAccessToken: env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    apiVersion: env.SHOPIFY_STOREFRONT_API_VERSION || defaultStorefrontApiVersion,
    ...options,
  });
}
