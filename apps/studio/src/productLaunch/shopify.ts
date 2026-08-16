import type { ShopifyProductSummary } from './logic';

export interface ShopifyStorefrontConfig {
  apiVersion: string;
  storeDomain: string;
  storefrontAccessToken: string;
}

interface ShopifyGraphQlPayload<TData> {
  data?: TData;
  errors?: Array<{ message?: string }>;
}

const productLaunchProductsQuery = /* GraphQL */ `
  query ProductLaunchProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      nodes {
        id
        handle
        title
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
        variants(first: 20) {
          nodes {
            title
            availableForSale
            currentlyNotInStock
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

const productSummaryFields = /* GraphQL */ `
  id
  handle
  title
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
  variants(first: 20) {
    nodes {
      title
      availableForSale
      currentlyNotInStock
      selectedOptions {
        name
        value
      }
    }
  }
`;

const productByGidQuery = /* GraphQL */ `
  query ProductLaunchProductByGid($id: ID!) {
    node(id: $id) {
      ... on Product {
        ${productSummaryFields}
      }
    }
  }
`;

const productByHandleQuery = /* GraphQL */ `
  query ProductLaunchProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${productSummaryFields}
    }
  }
`;

function trimEnvValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function getShopifyStorefrontConfig(): ShopifyStorefrontConfig {
  const storeDomain =
    trimEnvValue(process.env.SANITY_STUDIO_SHOPIFY_STORE_DOMAIN) ||
    trimEnvValue(process.env.SHOPIFY_STORE_DOMAIN);
  const storefrontAccessToken = trimEnvValue(
    process.env.SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN,
  ) || trimEnvValue(process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN);
  const apiVersion =
    trimEnvValue(process.env.SANITY_STUDIO_SHOPIFY_STOREFRONT_API_VERSION) ||
    trimEnvValue(process.env.SHOPIFY_STOREFRONT_API_VERSION) ||
    '2026-04';

  if (!storeDomain || !storefrontAccessToken) {
    throw new Error(
      '缺少 Studio Shopify Storefront 配置。请设置 SANITY_STUDIO_SHOPIFY_STORE_DOMAIN / SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN，或复用 SHOPIFY_STORE_DOMAIN / SHOPIFY_STOREFRONT_ACCESS_TOKEN。',
    );
  }

  return {
    apiVersion,
    storeDomain: storeDomain.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    storefrontAccessToken,
  };
}

export async function requestShopifyStorefront<TData>(
  config: ShopifyStorefrontConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> {
  const response = await fetch(`https://${config.storeDomain}/api/${config.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': config.storefrontAccessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as ShopifyGraphQlPayload<TData>;

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
        `Shopify Storefront API request failed with HTTP ${response.status}.`,
    );
  }

  if (!payload.data) {
    throw new Error('Shopify Storefront API returned no data.');
  }

  return payload.data;
}

export async function fetchShopifyProducts({
  first = 20,
  search,
}: {
  first?: number;
  search?: string;
} = {}): Promise<ShopifyProductSummary[]> {
  const config = getShopifyStorefrontConfig();
  const query = search?.trim() ? search.trim() : undefined;
  const data = await requestShopifyStorefront<{ products: { nodes: ShopifyProductSummary[] } }>(
    config,
    productLaunchProductsQuery,
    {
      first,
      query,
    },
  );

  return data.products.nodes;
}

export async function fetchShopifyProductByGidOrHandle({
  handle,
  productGid,
}: {
  handle?: string;
  productGid?: string;
}): Promise<ShopifyProductSummary | undefined> {
  const config = getShopifyStorefrontConfig();
  const gid = productGid?.trim();

  if (gid) {
    const data = await requestShopifyStorefront<{ node?: ShopifyProductSummary | null }>(
      config,
      productByGidQuery,
      { id: gid },
    );

    return data.node ?? undefined;
  }

  const fallbackHandle = handle?.trim();

  if (!fallbackHandle) {
    throw new Error('缺少 Shopify Product GID 或 handle，无法同步 Shopify 映射。');
  }

  const data = await requestShopifyStorefront<{ product?: ShopifyProductSummary | null }>(
    config,
    productByHandleQuery,
    { handle: fallbackHandle },
  );

  return data.product ?? undefined;
}
