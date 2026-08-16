export const defaultStorefrontApiVersion: string;
export const PRODUCT_SUMMARY_BY_HANDLE_QUERY: string;

export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface ShopifySelectedOption {
  name: string;
  value: string;
}

export interface ShopifyProductOptionValue {
  id: string;
  name: string;
}

export interface ShopifyProductOption {
  id: string;
  name: string;
  optionValues: ShopifyProductOptionValue[];
}

export interface ShopifyAvailability {
  availableForSale: boolean;
  currentlyNotInStock?: boolean;
  quantityAvailable?: number | null;
}

export interface ShopifyVariantSummary extends ShopifyAvailability {
  id: string;
  title: string;
  sku: string | null;
  selectedOptions: ShopifySelectedOption[];
  price: ShopifyMoney;
  compareAtPrice: ShopifyMoney | null;
  image: ShopifyImage | null;
}

export interface ShopifyProductSummary {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  availableForSale: boolean;
  featuredImage: ShopifyImage | null;
  images: {
    nodes: ShopifyImage[];
  };
  options: ShopifyProductOption[];
  variants: {
    nodes: ShopifyVariantSummary[];
  };
}

export interface ShopifyStorefrontClientOptions {
  storeDomain?: string;
  storefrontAccessToken?: string;
  apiVersion?: string;
  fetch?: typeof fetch;
}

export interface ShopifyStorefrontClient {
  endpoint: string;
  request<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

export class ShopifyStorefrontError extends Error {
  status?: number;
  errors?: unknown;
}

export function createShopifyStorefrontClient(
  options?: ShopifyStorefrontClientOptions,
): ShopifyStorefrontClient;

export function createShopifyStorefrontClientFromEnv(
  env?: Record<string, string | undefined>,
  options?: Partial<ShopifyStorefrontClientOptions>,
): ShopifyStorefrontClient;

export function getProductSummaryByHandle(
  client: ShopifyStorefrontClient,
  input: {
    handle: string;
    country?: string;
    language?: string;
  },
): Promise<ShopifyProductSummary | null>;
