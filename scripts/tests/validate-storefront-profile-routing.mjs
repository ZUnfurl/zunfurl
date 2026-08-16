import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function assertIncludes(source, snippet, message) {
  if (!source.includes(snippet)) {
    throw new Error(message);
  }
}

function assertNotIncludes(source, snippet, message) {
  if (source.includes(snippet)) {
    throw new Error(message);
  }
}

const profileHelper = read('apps/storefront/src/lib/site/profile.ts');
const homeRoute = read('apps/storefront/src/pages/[locale]/index.astro');
const brandRoute = read('apps/storefront/src/pages/[locale]/[slug].astro');
const productRoute = read('apps/storefront/src/pages/[locale]/products/[productSlug].astro');
const brandTemplate = read('apps/storefront/src/components/brand/BrandPageTemplate.astro');
const homeTemplate = read('apps/storefront/src/components/home/HomePageTemplate.astro');
const contentSource = read('apps/storefront/src/lib/content/contentSource.ts');
const commerceMedia = read('apps/storefront/src/lib/content/commerceMedia.ts');
const sitemap = read('apps/storefront/src/pages/sitemap.xml.ts');
const legalContent = read('apps/storefront/src/lib/legal/legalContent.ts');
const contactSection = read('apps/storefront/src/components/brand/ContactSection.astro');

assertIncludes(
  profileHelper,
  'export function getEnabledBrandPageKinds',
  'Storefront must expose enabled brand page kinds from the profile helper.',
);
assertIncludes(
  profileHelper,
  'export function getSiteNavigation',
  'Storefront navigation must be assembled from the profile helper.',
);
assertIncludes(
  profileHelper,
  'isFeatureEnabled(profile, "commerce")',
  'Commerce visibility must depend on the configured profile.',
);

assertIncludes(
  homeRoute,
  'commerceEnabled ? getProducts(locale) : Promise.resolve([])',
  'Home route must not fetch products when commerce is disabled.',
);
assertIncludes(
  homeRoute,
  'getSiteNavigation(locale, dictionary)',
  'Home route must use profile-aware navigation.',
);
assertIncludes(
  homeTemplate,
  'commerceEnabled && productSpotlightContent && products.length > 0',
  'Home product spotlight must be hidden when commerce is disabled.',
);
assertIncludes(
  homeTemplate,
  'href: homePage.hero!.primaryCta.href.includes("/products/")',
  'Home hero product CTA must avoid disabled product routes.',
);

assertIncludes(
  brandRoute,
  'getPagesByKinds(getEnabledBrandPageKinds())',
  'Brand route generation must use profile-aware page kinds.',
);
assertNotIncludes(
  brandRoute,
  'const brandPageKinds: BrandPageKind[] = ["about", "products", "contact"]',
  'Brand route must not hard-code Products as always enabled.',
);
assertIncludes(
  brandRoute,
  'commerceEnabled && slug === "products" ? getProducts(locale) : Promise.resolve([])',
  'Brand route must only fetch products for the enabled Products page.',
);
assertIncludes(
  brandRoute,
  'contactFormEnabled && !pageEntry.contactSection',
  'Contact page content requirement must depend on contactForm.',
);
assertIncludes(
  brandTemplate,
  'pageKind === "contact" && contactFormEnabled && contactSectionContent',
  'Contact form section must be profile-aware.',
);
assertIncludes(
  brandTemplate,
  'pageKind === "products" && commerceEnabled && products.length > 0',
  'Products spotlight section must be profile-aware.',
);

assertIncludes(
  productRoute,
  'if (!isCommerceEnabled())',
  'Product detail route must return no static paths when commerce is disabled.',
);
assertIncludes(
  productRoute,
  'assertCommerceEnabled',
  'Product detail route must protect direct product rendering.',
);

assertIncludes(
  contentSource,
  'if (!commerceContentEnabled) {\n    return [];\n  }',
  'Product listing and path fetchers must return empty arrays when commerce is disabled.',
);
assertIncludes(
  contentSource,
  'assertCommerceContentEnabled(`Product content ${locale}/${slug}`)',
  'Direct product content reads must fail clearly when commerce is disabled.',
);
assertIncludes(
  contentSource,
  '? ["about", "products", "contact"]\n    : ["about", "contact"]',
  'Sitemap content source must omit Products when commerce is disabled.',
);
assertIncludes(
  commerceMedia,
  '!isCommerceMediaEnabled()',
  'Shopify media enrichment must not resolve a Shopify client outside commerce profiles.',
);
assertIncludes(
  sitemap,
  'getSitemapEntries()',
  'Sitemap must continue using the centralized content source entries.',
);

assertIncludes(
  legalContent,
  'enabledLegalPages',
  'Legal route generation must read the explicit project-contract selection.',
);
assertIncludes(
  legalContent,
  '.filter((config) => enabledLegalSlugSet.has(config.slug))',
  'Disabled legal documents must not become static routes or sitemap entries.',
);
assertIncludes(
  brandRoute,
  'isEnabledLegalSlug(slug)',
  'Direct legal-page rendering must fail closed for a disabled legal slug.',
);
assertIncludes(
  contactSection,
  '!isLegalSlug(slug) || isEnabledLegalSlug(slug)',
  'Contact legal notices must not link to disabled internal legal routes.',
);

console.log('Storefront profile routing boundaries OK: product and legal routes follow the committed contract.');
