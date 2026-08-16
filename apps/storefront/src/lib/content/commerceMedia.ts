import {
  createShopifyStorefrontClientFromEnv,
  getProductSummaryByHandle,
  type ShopifyImage,
  type ShopifyProductSummary,
  type ShopifyStorefrontClient,
} from "gcss-commerce";
import {
  isFeatureEnabled,
  siteProfile,
} from "gcss-config";
import type {
  ProductContent,
  ProductStoryContent,
} from "gcss-blocks";

type ProductWithShopifyHandle = ProductContent & { shopifyHandle?: string };
type ProductStoryWithShopifyHandle = ProductStoryContent & { shopifyHandle?: string };

const shopifyMediaMode = (
  process.env.SHOPIFY_PRODUCT_MEDIA_SOURCE ?? "shopify"
).toLowerCase();
let shopifyClient: ShopifyStorefrontClient | undefined;
let shopifyClientResolved = false;
let warnedMissingShopifyClient = false;
const shopifyProductSummaryCache = new Map<string, Promise<ShopifyProductSummary | null>>();

function isCommerceMediaEnabled() {
  return (
    isFeatureEnabled(siteProfile, "commerce") &&
    isFeatureEnabled(siteProfile, "productCms")
  );
}

function getShopifyMediaClient() {
  if (
    !isCommerceMediaEnabled() ||
    shopifyMediaMode === "local" ||
    shopifyMediaMode === "disabled"
  ) {
    return undefined;
  }

  if (!shopifyClientResolved) {
    shopifyClientResolved = true;

    try {
      shopifyClient = createShopifyStorefrontClientFromEnv(process.env);
    } catch (error) {
      if (!warnedMissingShopifyClient) {
        warnedMissingShopifyClient = true;
        console.warn(
          `[storefront] Shopify product media fallback active: ${(error as Error).message}`,
        );
      }
    }
  }

  return shopifyClient;
}

function getProductShopifyHandle(
  product: ProductWithShopifyHandle | ProductStoryWithShopifyHandle,
) {
  return product.shopifyHandle ?? ("productSlug" in product ? product.productSlug : product.slug);
}

async function getShopifyProductSummary(handle: string) {
  const client = getShopifyMediaClient();

  if (!client) {
    return null;
  }

  if (!shopifyProductSummaryCache.has(handle)) {
    shopifyProductSummaryCache.set(
      handle,
      getProductSummaryByHandle(client, { handle }).catch((error) => {
        console.warn(
          `[storefront] Shopify product media fallback active for ${handle}: ${(error as Error).message}`,
        );
        return null;
      }),
    );
  }

  return shopifyProductSummaryCache.get(handle)!;
}

function normalizeShopifyImages(product: ShopifyProductSummary | null) {
  if (!product) {
    return [];
  }

  const images = [
    product.featuredImage,
    ...(product.images?.nodes ?? []),
  ].filter(Boolean) as ShopifyImage[];
  const seen = new Set<string>();

  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) {
      return false;
    }

    seen.add(image.url);
    return true;
  });
}

function imageAltText(image: ShopifyImage, productName: string, index: number) {
  return image.altText?.trim() || `${productName} image ${index + 1}`;
}

export async function applyShopifyMediaToProduct(product: ProductContent) {
  const productWithHandle = product as ProductWithShopifyHandle;
  const summary = await getShopifyProductSummary(
    getProductShopifyHandle(productWithHandle),
  );
  const images = normalizeShopifyImages(summary);

  if (images.length === 0) {
    return product;
  }

  return {
    ...product,
    primaryImage: images[0].url,
    gallery: images.map((image) => image.url),
  };
}

export async function applyShopifyMediaToProducts(products: ProductContent[]) {
  return Promise.all(products.map(applyShopifyMediaToProduct));
}

export async function applyShopifyMediaToProductStory(story: ProductStoryContent) {
  const storyWithHandle = story as ProductStoryWithShopifyHandle;
  const summary = await getShopifyProductSummary(
    getProductShopifyHandle(storyWithHandle),
  );
  const images = normalizeShopifyImages(summary);

  if (images.length === 0) {
    return story;
  }

  return {
    ...story,
    detailHero: {
      ...story.detailHero,
      gallery: images.map((image, index) => ({
        src: image.url,
        alt: imageAltText(image, story.title.replace(/ Story$/, ""), index),
      })),
    },
  };
}
