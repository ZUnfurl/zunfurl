import { getCollection } from "astro:content";
import type {
  ActiveLocale,
  PageContent,
  PageKind,
  ProductContent,
  ProductLocalePageContent,
  ProductPageContent,
  ProductStoryContent,
} from "gcss-blocks";
import {
  createSanityContentClient,
  getPageByLocaleAndKind as fetchSanityPageByLocaleAndKind,
  getPagesByLocalesAndKinds as fetchSanityPagesByLocalesAndKinds,
  getProductPageByLocaleAndSlug as fetchSanityProductByLocaleAndSlug,
  getProductPagePathsByLocales as fetchSanityProductPagePathsByLocales,
  getProductPageStoryByLocaleAndSlug as fetchSanityProductStoryByLocaleAndProductSlug,
  getProductPagesByLocale as fetchSanityProductEntriesByLocale,
} from "gcss-sanity-queries";
import { defaultContentSource, isFeatureEnabled, siteProfile } from "gcss-config";
import { activeLocales } from "../../i18n/config";
import { getLegalEntries, type LegalSlug } from "../legal/legalContent";
import {
  applyShopifyMediaToProduct,
  applyShopifyMediaToProducts,
  applyShopifyMediaToProductStory,
} from "./commerceMedia";

type StaticPageKind = Exclude<PageKind, "home">;

export interface ProductStoryPath {
  locale: ActiveLocale;
  productSlug: string;
}

export interface SitemapEntry {
  locale: ActiveLocale;
  kind?: PageKind;
  legalSlug?: LegalSlug;
  productSlug?: string;
}

const configuredContentSource = process.env.CONTENT_SOURCE?.trim().toLowerCase();

if (configuredContentSource && configuredContentSource !== defaultContentSource) {
  throw new Error(
    `CONTENT_SOURCE=${configuredContentSource} does not match gcss.project.json contentSource=${defaultContentSource}.`,
  );
}

const contentSourceMode = defaultContentSource;
const commerceContentEnabled =
  isFeatureEnabled(siteProfile, "commerce") &&
  isFeatureEnabled(siteProfile, "productCms");

function isSanityMode(): boolean {
  return contentSourceMode === "sanity";
}

function getSanityClient() {
  return createSanityContentClient({
    projectId: process.env.SANITY_PROJECT_ID ?? process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_DATASET ?? process.env.SANITY_STUDIO_DATASET,
    apiVersion: process.env.SANITY_API_VERSION,
    useCdn: process.env.SANITY_USE_CDN !== "false",
    token: process.env.SANITY_API_READ_TOKEN,
  });
}

function assertContentSourceMode() {
  if (contentSourceMode !== "local" && contentSourceMode !== "sanity") {
    throw new Error(`Unsupported CONTENT_SOURCE: ${contentSourceMode}`);
  }
}

function sortProducts(products: ProductContent[]) {
  return products
    .slice()
    .sort((left, right) => left.roadmapOrder - right.roadmapOrder);
}

function assertCommerceContentEnabled(context: string) {
  if (!commerceContentEnabled) {
    throw new Error(`${context} is disabled for SITE_PROFILE=${siteProfile.mode}.`);
  }
}

function isPublicProductPage(page: ProductPageContent) {
	return page.productStatus === "active" && Boolean(page.shopifyProductGid && page.shopifyHandle);
}

function productLocalePageToProduct(
  page: ProductPageContent,
  localized: ProductLocalePageContent,
): ProductContent {
  return {
    ...localized,
    shopifyHandle: page.shopifyHandle,
    roadmapOrder: localized.roadmapOrder ?? page.roadmapOrder ?? 0,
    roadmapHref: localized.roadmapHref ?? `/${localized.locale}/products/${localized.slug}/`,
  };
}

function productLocalePageToStory(
  page: ProductPageContent,
  localized: ProductLocalePageContent,
): ProductStoryContent {
  return {
    locale: localized.locale,
    slug: `${localized.slug}-story`,
    productSlug: localized.slug,
    shopifyHandle: page.shopifyHandle,
    title: `${localized.name} Story`,
    seo: localized.seo,
    detailHero: localized.detailHero,
    storyPages: localized.storyPages,
  };
}

async function getLocalProductPagesByHandle() {
  const productPages = await getCollection("productPages");

  return new Map(
    productPages
      .map((entry) => entry.data as ProductPageContent)
      .map((page) => [page.shopifyHandle, page]),
  );
}

function isPublicProductLocalePage(
  localized: ProductLocalePageContent,
  page: ProductPageContent | undefined,
  locale: ActiveLocale,
  slug?: string,
) {
  return Boolean(
    page &&
      isPublicProductPage(page) &&
      localized.locale === locale &&
      localized.launchStatus === "live" &&
      (!slug || localized.slug === slug),
  );
}

async function getLocalPage(locale: ActiveLocale, kind: PageKind) {
  const pages = await getCollection(
    "pages",
    ({ data }) => data.locale === locale && data.kind === kind,
  );

  const page = pages[0]?.data as PageContent | undefined;

  if (!page) {
    throw new Error(`Missing local page content: ${locale}/${kind}`);
  }

  return page;
}

async function getLocalPagesByKinds(kinds: StaticPageKind[]) {
  const pages = await getCollection("pages", ({ data }) =>
    activeLocales.includes(data.locale as ActiveLocale) &&
    kinds.includes(data.kind as StaticPageKind),
  );

  return pages.map((entry) => entry.data as PageContent);
}

async function getLocalProducts(locale: ActiveLocale) {
  const productPagesByHandle = await getLocalProductPagesByHandle();
  const productLocalePages = await getCollection(
    "productLocalePages",
    ({ data }) => {
      const localized = data as ProductLocalePageContent;
      return isPublicProductLocalePage(
        localized,
        localized.shopifyHandle ? productPagesByHandle.get(localized.shopifyHandle) : undefined,
        locale,
      );
    },
  );

  return sortProducts(
    productLocalePages.map((entry) => {
      const localized = entry.data as ProductLocalePageContent;
      const page = productPagesByHandle.get(String(localized.shopifyHandle));

      return productLocalePageToProduct(page as ProductPageContent, localized);
    }),
  );
}

async function getLocalProduct(locale: ActiveLocale, slug: string) {
  const productPagesByHandle = await getLocalProductPagesByHandle();
  const productLocalePages = await getCollection(
    "productLocalePages",
    ({ data }) => {
      const localized = data as ProductLocalePageContent;
      return isPublicProductLocalePage(
        localized,
        localized.shopifyHandle ? productPagesByHandle.get(localized.shopifyHandle) : undefined,
        locale,
        slug,
      );
    },
  );

  const localized = productLocalePages[0]?.data as ProductLocalePageContent | undefined;
  const page = localized?.shopifyHandle ? productPagesByHandle.get(localized.shopifyHandle) : undefined;
  const product = localized && page ? productLocalePageToProduct(page, localized) : undefined;

  if (!product) {
    throw new Error(`Missing local product content: ${locale}/${slug}`);
  }

  return product;
}

async function getLocalProductStory(locale: ActiveLocale, productSlug: string) {
  const productPagesByHandle = await getLocalProductPagesByHandle();
  const productLocalePages = await getCollection(
    "productLocalePages",
    ({ data }) => {
      const localized = data as ProductLocalePageContent;
      return isPublicProductLocalePage(
        localized,
        localized.shopifyHandle ? productPagesByHandle.get(localized.shopifyHandle) : undefined,
        locale,
        productSlug,
      );
    },
  );

  const localized = productLocalePages[0]?.data as ProductLocalePageContent | undefined;
  const page = localized?.shopifyHandle ? productPagesByHandle.get(localized.shopifyHandle) : undefined;
  const story = localized && page ? productLocalePageToStory(page, localized) : undefined;

  if (!story) {
    throw new Error(`Missing local product story content: ${locale}/${productSlug}`);
  }

  return story;
}

export async function getHomePage(locale: ActiveLocale) {
  return getPageByKind(locale, "home");
}

export async function getPageByKind(locale: ActiveLocale, kind: PageKind) {
  assertContentSourceMode();

  if (isSanityMode()) {
    return fetchSanityPageByLocaleAndKind<PageContent>(getSanityClient(), locale, kind);
  }

  return getLocalPage(locale, kind);
}

export async function getPagesByKinds(kinds: StaticPageKind[]) {
  assertContentSourceMode();

  if (isSanityMode()) {
    return fetchSanityPagesByLocalesAndKinds<PageContent>(
      getSanityClient(),
      [...activeLocales],
      kinds,
    );
  }

  return getLocalPagesByKinds(kinds);
}

export async function getProducts(locale: ActiveLocale) {
  assertContentSourceMode();

  if (!commerceContentEnabled) {
    return [];
  }

  if (isSanityMode()) {
    const products = await fetchSanityProductEntriesByLocale<ProductContent>(
      getSanityClient(),
      locale,
    );
    return applyShopifyMediaToProducts(sortProducts(products));
  }

  return applyShopifyMediaToProducts(await getLocalProducts(locale));
}

export async function getProduct(locale: ActiveLocale, slug: string) {
  assertContentSourceMode();
  assertCommerceContentEnabled(`Product content ${locale}/${slug}`);

  if (isSanityMode()) {
    return applyShopifyMediaToProduct(
      await fetchSanityProductByLocaleAndSlug<ProductContent>(
        getSanityClient(),
        locale,
        slug,
      ),
    );
  }

  return applyShopifyMediaToProduct(await getLocalProduct(locale, slug));
}

export async function getProductStory(locale: ActiveLocale, productSlug: string) {
  assertContentSourceMode();
  assertCommerceContentEnabled(`Product story ${locale}/${productSlug}`);

  if (isSanityMode()) {
    return applyShopifyMediaToProductStory(
      await fetchSanityProductStoryByLocaleAndProductSlug<ProductStoryContent>(
        getSanityClient(),
        locale,
        productSlug,
      ),
    );
  }

  return applyShopifyMediaToProductStory(await getLocalProductStory(locale, productSlug));
}

export async function getProductStoryPaths() {
  assertContentSourceMode();

  if (!commerceContentEnabled) {
    return [];
  }

  if (isSanityMode()) {
    const paths = await fetchSanityProductPagePathsByLocales<ProductStoryPath>(
      getSanityClient(),
      [...activeLocales],
    );
    return paths.map((path) => ({
      locale: path.locale as ActiveLocale,
      productSlug: path.productSlug,
    }));
  }

  const productPagesByHandle = await getLocalProductPagesByHandle();
  const productLocalePages = await getCollection("productLocalePages", ({ data }) => {
    const localized = data as ProductLocalePageContent;
    const page = localized.shopifyHandle ? productPagesByHandle.get(localized.shopifyHandle) : undefined;

    return Boolean(
      page &&
        isPublicProductPage(page) &&
        activeLocales.includes(localized.locale as ActiveLocale) &&
        localized.launchStatus === "live",
    );
  });

  return productLocalePages.map((entry) => {
    const localized = entry.data as ProductLocalePageContent;

    return {
      locale: localized.locale as ActiveLocale,
      productSlug: localized.slug,
    };
  });
}

export async function getSitemapEntries() {
  const pageKinds: StaticPageKind[] = commerceContentEnabled
    ? ["about", "products", "contact"]
    : ["about", "contact"];
  const pages = await getPagesByKinds(pageKinds);
  const legalPages = getLegalEntries();
  const storyPaths = commerceContentEnabled ? await getProductStoryPaths() : [];

  const entries: SitemapEntry[] = activeLocales.map((locale) => ({ locale }));

  for (const page of pages) {
    entries.push({
      locale: page.locale as ActiveLocale,
      kind: page.kind,
    });
  }

  for (const storyPath of storyPaths) {
    entries.push(storyPath);
  }

  for (const legalPage of legalPages) {
    entries.push({
      locale: legalPage.locale,
      legalSlug: legalPage.slug,
    });
  }

  return entries;
}
