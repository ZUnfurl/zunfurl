import { createClient } from '@sanity/client';

export const defaultApiVersion = '2026-06-20';

const publicProductLocalePageFilter = `_type == "productLocalePage" && !(_id in path("drafts.**")) && launchStatus == "live" && defined(slug.current) && productPage->productStatus == "active" && defined(productPage->shopifyProductGid) && defined(productPage->shopifyHandle)`;

const pageHeroProjection = `pageHero {
    ...,
    slides[] {
      ...,
      "sanityImageUrl": image.asset->url,
      "sanityImageAssetRef": image.asset._ref
    }
  }`;

const aboutSignatureProjection = `aboutSignature {
    ...,
    panels[] {
      ...,
      "sanityImageUrl": image.asset->url,
      "sanityImageAssetRef": image.asset._ref
    }
  }`;

const brandFrameworkProjection = `brandFramework {
    ...,
    slides[] {
      ...,
      "sanityImageUrl": sanityImage.asset->url,
      "sanityImageAssetRef": sanityImage.asset._ref
    }
  }`;

const contactMaskSectionProjection = `contactMaskSection {
    ...,
    "sanityImageUrl": sanityImage.asset->url,
    "sanityImageAssetRef": sanityImage.asset._ref
  }`;

const productStoryPagesProjection = `storyPages[] {
    ...,
    "sanityImageUrl": sanityImage.asset->url,
    "sanityImageAssetRef": sanityImage.asset._ref
  }`;

const pageVisibilityProjection = `"showContentBlocks": coalesce(showContentBlocks, kind != "contact")`;

export const queries = {
  siteSettings: `*[_type == "siteSettings"][0]`,
  pageByLocaleAndKind: `*[_type == "page" && locale == $locale && kind == $kind][0] {
    ...,
    ${pageVisibilityProjection},
    ${pageHeroProjection},
    ${aboutSignatureProjection},
    ${brandFrameworkProjection},
    ${contactMaskSectionProjection}
  }`,
  pagesByLocalesAndKinds: `*[_type == "page" && locale in $locales && kind in $kinds] | order(locale asc, kind asc) {
    ...,
    ${pageVisibilityProjection},
    ${pageHeroProjection},
    ${aboutSignatureProjection},
    ${brandFrameworkProjection},
    ${contactMaskSectionProjection}
  }`,
  productPagesByLocale: `*[${publicProductLocalePageFilter} && locale == $locale] | order(coalesce(roadmapOrder, productPage->roadmapOrder, 999) asc) {
    ...,
    ${productStoryPagesProjection},
    "slug": slug.current,
    "shopifyHandle": productPage->shopifyHandle,
    "shopifyStatus": productPage->shopifyStatus,
    "shopifyTitle": productPage->shopifyTitle,
    "productStatus": productPage->productStatus
  }`,
  productPageByLocaleAndSlug: `*[${publicProductLocalePageFilter} && locale == $locale && slug.current == $slug][0] {
    ...,
    ${productStoryPagesProjection},
    "slug": slug.current,
    "shopifyHandle": productPage->shopifyHandle,
    "shopifyStatus": productPage->shopifyStatus,
    "shopifyTitle": productPage->shopifyTitle,
    "productStatus": productPage->productStatus
  }`,
  productPagePathsByLocales: `*[${publicProductLocalePageFilter} && locale in $locales] | order(locale asc, coalesce(roadmapOrder, productPage->roadmapOrder, 999) asc) {
    "locale": locale,
    "productSlug": slug.current
  }`,
  redirects: `*[_type == "redirect"] | order(from asc)`,
};

export function createSanityContentClient({
  projectId,
  dataset,
  apiVersion = defaultApiVersion,
  useCdn = true,
  token,
} = {}) {
  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID for Sanity content source.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for Sanity content source.');
  }

  return createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn,
    token,
  });
}

function resolveImageSource({ preferredSource, sanitySrc, localSrc }) {
  if (preferredSource === 'local') {
    return localSrc || sanitySrc;
  }

  return sanitySrc || localSrc;
}

function resolvePageHeroImages(page) {
  if (!Array.isArray(page?.pageHero?.slides)) {
    return page;
  }

  return {
    ...page,
    pageHero: {
      ...page.pageHero,
      slides: page.pageHero.slides.map((slide) => ({
        ...slide,
        src: resolveImageSource({
          preferredSource: slide.imageSource,
          sanitySrc: slide.sanityImageUrl,
          localSrc: slide.src,
        }),
      })),
    },
  };
}

function resolveBrandFrameworkImages(page) {
  if (!Array.isArray(page?.brandFramework?.slides)) {
    return page;
  }

  return {
    ...page,
    brandFramework: {
      ...page.brandFramework,
      slides: page.brandFramework.slides.map((slide) => ({
        ...slide,
        image: resolveImageSource({
          preferredSource: slide.imageSource,
          sanitySrc: slide.sanityImageUrl,
          localSrc: slide.image,
        }),
      })),
    },
  };
}

function resolveContactMaskImage(page) {
  if (!page?.contactMaskSection) {
    return page;
  }

  return {
    ...page,
    contactMaskSection: {
      ...page.contactMaskSection,
      image: resolveImageSource({
        preferredSource: page.contactMaskSection.imageSource,
        sanitySrc: page.contactMaskSection.sanityImageUrl,
        localSrc: page.contactMaskSection.image,
      }),
    },
  };
}

export function resolveContactPageHeroImages(page) {
  return resolveContactMaskImage(resolveBrandFrameworkImages(resolvePageHeroImages(page)));
}

export async function getSiteSettings(client) {
  return client.fetch(queries.siteSettings);
}

export async function getPageByLocaleAndKind(client, locale, kind) {
  const page = resolveContactPageHeroImages(
    await client.fetch(queries.pageByLocaleAndKind, { locale, kind }),
  );

  if (!page) {
    throw new Error(`Missing Sanity page content: ${locale}/${kind}`);
  }

  return page;
}

export async function getPagesByLocalesAndKinds(client, locales, kinds) {
  const pages = await client.fetch(queries.pagesByLocalesAndKinds, { locales, kinds });

  return pages.map(resolveContactPageHeroImages);
}

function getSlugValue(value) {
  return typeof value === 'string' ? value : value?.current;
}

function getLocalizedProductPage(page) {
  const slug = getSlugValue(page?.slug);

  if (!page || !slug) {
    return undefined;
  }

  return {
    ...page,
    slug,
    roadmapOrder: page.roadmapOrder ?? 0,
    roadmapHref: page.roadmapHref ?? `/${page.locale}/products/${slug}/`,
  };
}

function getLocalizedProductStory(page) {
  const product = getLocalizedProductPage(page);

  if (!product) {
    return undefined;
  }

  return {
    locale: product.locale,
    slug: `${product.slug}-story`,
    productSlug: product.slug,
    title: `${product.name} Story`,
    seo: product.seo,
    detailHero: product.detailHero,
    storyPages: product.storyPages,
  };
}

export async function getProductPagesByLocale(client, locale) {
  const pages = await client.fetch(queries.productPagesByLocale, { locale });

  return pages.map(getLocalizedProductPage).filter(Boolean);
}

export async function getProductPageByLocaleAndSlug(client, locale, slug) {
  const page = await client.fetch(queries.productPageByLocaleAndSlug, { locale, slug });
  const product = getLocalizedProductPage(page);

  if (!product) {
    throw new Error(`Missing Sanity product content: ${locale}/${slug}`);
  }

  return product;
}

export async function getProductPageStoryByLocaleAndSlug(client, locale, productSlug) {
  const page = await client.fetch(queries.productPageByLocaleAndSlug, {
    locale,
    slug: productSlug,
  });
  const story = getLocalizedProductStory(page);

  if (!story) {
    throw new Error(`Missing Sanity product story content: ${locale}/${productSlug}`);
  }

  return story;
}

export async function getProductPagePathsByLocales(client, locales) {
  const pages = await client.fetch(queries.productPagePathsByLocales, { locales });

  return pages;
}

export async function getRedirects(client) {
  return client.fetch(queries.redirects);
}
