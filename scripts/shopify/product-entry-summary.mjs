export const productPageShopifySummaryFields = [
  'shopifyProductGid',
  'shopifyHandle',
  'shopifyStatus',
  'shopifyTitle',
  'shopifyImageSummary',
  'shopifyVariantSummary',
  'shopifyAdminUrl',
];

export function getShopifyNumericId(gid) {
  const value = String(gid ?? '');
  const match = value.match(/\/(\d+)$/);

  return match?.[1] ?? null;
}

export function createShopifyAdminProductUrl({ storeDomain, productGid }) {
  const numericId = getShopifyNumericId(productGid);
  const storeHandle = String(storeDomain ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\.myshopify\.com\/?$/, '')
    .replace(/\/+$/, '');

  if (!storeHandle || !numericId) {
    return undefined;
  }

  return `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`;
}

function formatImageSummary(image, index) {
  const label = image?.altText || `Shopify image ${index + 1}`;
  const size = image?.width && image?.height ? `${image.width}x${image.height}` : 'unknown-size';
  const url = image?.url ?? 'missing-url';

  return `${index + 1}. ${label} | ${size} | ${url}`;
}

function formatVariantSummary(variant) {
  const optionLabel = (variant?.selectedOptions ?? [])
    .map((option) => `${option.name}: ${option.value}`)
    .join(', ');
  const title = variant?.title && variant.title !== 'Default Title' ? variant.title : undefined;
  const saleState = variant?.availableForSale
    ? 'storefront-available'
    : variant?.currentlyNotInStock
      ? 'storefront-currently-not-in-stock'
      : 'storefront-unavailable';

  return [title, optionLabel, saleState].filter(Boolean).join(' | ');
}

export function createProductPageShopifySummary(product, { storeDomain } = {}) {
  if (!product) {
    throw new Error('Shopify product summary is required.');
  }

  const images = product.images?.nodes ?? [];
  const variants = product.variants?.nodes ?? [];

  return {
    shopifyProductGid: product.id,
    shopifyHandle: product.handle,
    shopifyStatus: product.availableForSale ? 'storefront-available' : 'storefront-unavailable',
    shopifyTitle: product.title,
    shopifyImageSummary: images.map(formatImageSummary),
    shopifyVariantSummary: variants.map(formatVariantSummary),
    shopifyAdminUrl: createShopifyAdminProductUrl({
      storeDomain,
      productGid: product.id,
    }),
  };
}
