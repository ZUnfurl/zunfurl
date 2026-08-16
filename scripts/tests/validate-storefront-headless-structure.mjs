import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const mustExist = [
  "apps/storefront/src/layouts/SiteDocument.astro",
  "apps/storefront/src/components/shell/SiteHeader.astro",
  "apps/storefront/src/components/shell/SiteFooter.astro",
  "apps/storefront/src/components/shell/LocaleSwitcher.astro",
  "apps/storefront/src/components/shell/ThemeToggle.astro",
  "apps/storefront/src/components/shared/SiteFrame.astro",
  "apps/storefront/src/components/home/HomePageTemplate.astro",
  "apps/storefront/src/components/home/HomeHero.astro",
  "apps/storefront/src/components/home/BrandFrameworkSection.astro",
  "apps/storefront/src/components/home/HomeContactCtaSection.astro",
  "apps/storefront/src/components/brand/BrandPageTemplate.astro",
  "apps/storefront/src/components/brand/BrandPageHero.astro",
  "apps/storefront/src/components/brand/BrandContentBlocks.astro",
  "apps/storefront/src/components/brand/AboutSignatureSection.astro",
  "apps/storefront/src/components/brand/ContactSection.astro",
  "apps/storefront/src/components/legal/LegalPageTemplate.astro",
  "apps/storefront/src/components/product/ProductCard.astro",
  "apps/storefront/src/components/product/ProductSpotlightSection.astro",
  "apps/storefront/src/components/product-detail/ProductDetailTemplate.astro",
  "apps/storefront/src/components/product-detail/ProductDetailHero.astro",
  "apps/storefront/src/components/product-detail/ProductStorySections.astro",
];

const mustNotExist = [
  "apps/storefront/src/components/ProductOverview.astro",
  "apps/storefront/src/components/ProductDetail.astro",
  "apps/storefront/src/components/HeroSection.astro",
  "apps/storefront/src/components/PageHero.astro",
  "apps/storefront/src/components/ContentBlocks.astro",
  "apps/storefront/src/components/SiteHeader.astro",
  "apps/storefront/src/components/cms/PageHero.astro",
  "apps/storefront/src/components/cms/ContentBlocks.astro",
  "apps/storefront/src/components/home/BrandFrameworkCarousel.astro",
  "apps/storefront/src/components/about/AboutBrandSections.astro",
  "apps/storefront/src/components/brand/ContactCtaSection.astro",
  "apps/storefront/src/components/contact/ContactMaskSection.astro",
  "apps/storefront/src/components/product/ProductSpotlight.astro",
  "apps/storefront/src/components/product/ProductHero.astro",
  "apps/storefront/src/components/product/ProductStory.astro",
  "apps/storefront/src/layouts/Layout.astro",
];

for (const relativePath of mustExist) {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`Missing Headless CMS storefront component: ${relativePath}`);
  }
}

for (const relativePath of mustNotExist) {
  if (existsSync(join(root, relativePath))) {
    throw new Error(`Legacy storefront component must be removed: ${relativePath}`);
  }
}

const routeFiles = [
  "apps/storefront/src/pages/[locale]/index.astro",
  "apps/storefront/src/pages/[locale]/[slug].astro",
  "apps/storefront/src/pages/[locale]/products/[productSlug].astro",
  "apps/storefront/src/layouts/SiteDocument.astro",
  "apps/storefront/src/components/home/HomePageTemplate.astro",
  "apps/storefront/src/components/brand/BrandPageTemplate.astro",
  "apps/storefront/src/components/product-detail/ProductDetailTemplate.astro",
];

const forbiddenImports = [
  "components/ProductOverview.astro",
  "components/ProductDetail.astro",
  "components/HeroSection.astro",
  "components/PageHero.astro",
  "components/ContentBlocks.astro",
  "components/SiteHeader.astro",
  "components/SiteFooter.astro",
  "layouts/Layout.astro",
  "BrandFrameworkCarousel",
  "AboutBrandSections",
  "ContactMaskSection",
  "ProductSpotlight.astro",
  "ProductHero.astro",
  "ProductStory.astro",
];

for (const relativePath of routeFiles) {
  const source = readFileSync(join(root, relativePath), "utf8");

  for (const token of forbiddenImports) {
    if (source.includes(token)) {
      throw new Error(`${relativePath} still imports legacy path: ${token}`);
    }
  }
}

const brandTemplate = readFileSync(
  join(root, "apps/storefront/src/components/brand/BrandPageTemplate.astro"),
  "utf8",
);
const brandHeroSource = readFileSync(
  join(root, "apps/storefront/src/components/brand/BrandPageHero.astro"),
  "utf8",
);
const contactSectionSource = readFileSync(
  join(root, "apps/storefront/src/components/brand/ContactSection.astro"),
  "utf8",
);
const legalContentSource = readFileSync(
  join(root, "apps/storefront/src/lib/legal/legalContent.ts"),
  "utf8",
);
const sanityQueriesSource = readFileSync(
  join(root, "packages/sanity-queries/src/index.mjs"),
  "utf8",
);

if (
  !brandTemplate.includes("AboutSignatureSection") ||
  !brandTemplate.includes("aboutSignature")
) {
  throw new Error("Brand page template must render aboutSignature through AboutSignatureSection.");
}

if (brandTemplate.includes("blocks![0]") || brandTemplate.includes("slice(1)")) {
  throw new Error("Brand page template must not derive BrandPageHero from content blocks.");
}

if (
  !brandTemplate.includes("ContactSection") ||
  !brandTemplate.includes("contactSection")
) {
  throw new Error("Brand page template must render contactSection through ContactSection.");
}

if (
  !brandHeroSource.includes("page-hero__caption-copy") ||
  brandHeroSource.includes("<h3>{slide.caption}</h3>")
) {
  throw new Error("BrandPageHero slide captions must render as body copy, not secondary hero headings.");
}

if (
  brandHeroSource.includes("page-hero__motion-note") ||
  brandHeroSource.includes("motionEyebrow") ||
  brandHeroSource.includes("motionBody")
) {
  throw new Error("BrandPageHero must not render legacy motion eyebrow/body fields.");
}

if (
  !/\.page-hero__meta-row\s*\{[\s\S]*?width:\s*100%[\s\S]*?justify-content:\s*flex-start/.test(
    brandHeroSource,
  )
) {
  throw new Error("BrandPageHero image caption rail must align to the same left axis as the hero copy.");
}

if (
  !brandTemplate.includes("showContentBlocks") ||
  !brandTemplate.includes("visibleContentBlocks")
) {
  throw new Error("Brand page template must allow hiding BrandContentBlocks with showContentBlocks.");
}

if (
  !sanityQueriesSource.includes('"showContentBlocks": coalesce(showContentBlocks, kind != "contact")')
) {
  throw new Error("Sanity page queries must project showContentBlocks with a contact-safe fallback.");
}

if (
  contactSectionSource.includes("contact-section__fallback") ||
  contactSectionSource.includes("mailto:")
) {
  throw new Error("ContactSection must not expose a direct fallback email link.");
}

if (
  !contactSectionSource.includes("contact-form__legal") ||
  !contactSectionSource.includes("data-message-counter")
) {
  throw new Error("ContactSection must expose legal notice and message character count UI.");
}

for (const legalSlug of [
  "privacy-policy",
  "terms-of-use",
  "shipping-returns-policy",
  "customer-service-contact",
]) {
  if (!legalContentSource.includes(legalSlug)) {
    throw new Error(`Legal content source must expose ${legalSlug}.`);
  }
}

const homeRoute = readFileSync(
  join(root, "apps/storefront/src/pages/[locale]/index.astro"),
  "utf8",
);

if (!homeRoute.includes("HomePageTemplate")) {
  throw new Error("Home route must delegate rendering to HomePageTemplate.");
}

const homeTemplate = readFileSync(
  join(root, "apps/storefront/src/components/home/HomePageTemplate.astro"),
  "utf8",
);
const homeHeroSource = readFileSync(
  join(root, "apps/storefront/src/components/home/HomeHero.astro"),
  "utf8",
);

if (
  !homeTemplate.includes("HomeContactCtaSection") ||
  homeTemplate.includes("../brand/ContactCtaSection.astro")
) {
  throw new Error("Home page template must render the home contact entry through HomeContactCtaSection.");
}

if (!homeTemplate.includes("homeProductSpotlight")) {
  throw new Error("Home page template must prefer homeProductSpotlight for the Home product module.");
}

if (homeTemplate.includes("heroProduct")) {
  throw new Error("Home page template must not pass product workbench content into HomeHero.");
}

if (homeHeroSource.includes("product.") || homeHeroSource.includes("ProductData")) {
  throw new Error("HomeHero must render only Home page hero content, not product workbench fields.");
}

const homePage = JSON.parse(
  readFileSync(join(root, "apps/storefront/src/content/pages/en/home.json"), "utf8"),
);

if (!homePage.homeProductSpotlight) {
  throw new Error("Home page content must expose homeProductSpotlight.");
}

if (homePage.productSpotlight) {
  throw new Error("Home page content must not keep productSpotlight as its primary product module.");
}

if (!homePage.hero?.captionEyebrow || !homePage.hero?.captionTitle) {
  throw new Error("Home page hero content must expose its own bottom-right caption copy.");
}

const brandRoute = readFileSync(
  join(root, "apps/storefront/src/pages/[locale]/[slug].astro"),
  "utf8",
);

if (!brandRoute.includes("BrandPageTemplate")) {
  throw new Error("Brand route must delegate rendering to BrandPageTemplate.");
}

const productDetailRoute = readFileSync(
  join(root, "apps/storefront/src/pages/[locale]/products/[productSlug].astro"),
  "utf8",
);

if (!productDetailRoute.includes("ProductDetailTemplate")) {
  throw new Error("Product detail route must delegate rendering to ProductDetailTemplate.");
}

const blocksTypes = readFileSync(join(root, "packages/blocks/src/index.d.ts"), "utf8");

if (!blocksTypes.includes("AboutSignatureContent")) {
  throw new Error("Shared block types must expose AboutSignatureContent.");
}

if (!blocksTypes.includes("showContentBlocks?: boolean")) {
  throw new Error("Shared page types must expose showContentBlocks.");
}

if (blocksTypes.includes("ProductOverviewContent")) {
  throw new Error("ProductOverviewContent must be removed from shared block types.");
}

const aboutPage = JSON.parse(
  readFileSync(join(root, "apps/storefront/src/content/pages/en/about.json"), "utf8"),
);

if (!aboutPage.aboutSignature) {
  throw new Error("About page content must expose aboutSignature.");
}

if (!aboutPage.pageHero?.eyebrow || !aboutPage.pageHero?.title || !aboutPage.pageHero?.body) {
  throw new Error("About pageHero must include explicit eyebrow, title, and body copy.");
}

if (
  !Array.isArray(aboutPage.aboutSignature.panels) ||
  aboutPage.aboutSignature.panels.length < 1
) {
  throw new Error("About page aboutSignature must include at least one image-text panel.");
}

const contactPage = JSON.parse(
  readFileSync(join(root, "apps/storefront/src/content/pages/en/contact.json"), "utf8"),
);

if (!contactPage.contactSection) {
  throw new Error("Contact page content must expose contactSection.");
}

if (
  /test phase|测试阶段|configured recipient|配置的业务收件邮箱|phase de test/i.test(
    contactPage.contactSection.responseTime ?? "",
  ) ||
  !/service experience|service|服务|assistance/i.test(contactPage.contactSection.responseTime ?? "")
) {
  throw new Error("Contact page responseTime must use the customer-facing service delay copy.");
}

if (contactPage.contactCtaSection) {
  throw new Error("Contact page fallback content must not keep legacy contactCtaSection.");
}

if (!Array.isArray(contactPage.contactSection.topics) || contactPage.contactSection.topics.length < 1) {
  throw new Error("Contact page contactSection must include contact topics.");
}

if (!contactPage.contactSection.legalNotice?.links || contactPage.contactSection.legalNotice.links.length !== 4) {
  throw new Error("Contact page contactSection must include four legal notice links.");
}

if (contactPage.contactSection.fallbackEmailLabel || contactPage.contactSection.fallbackEmailHref) {
  throw new Error("Contact page content must not expose a direct fallback email link.");
}

if (!contactPage.pageHero?.eyebrow || !contactPage.pageHero?.title || !contactPage.pageHero?.body) {
  throw new Error("Contact pageHero must include explicit eyebrow, title, and body copy.");
}

if (contactPage.showContentBlocks !== false) {
  throw new Error("Contact page must hide BrandContentBlocks by default.");
}

if (!Array.isArray(contactPage.blocks) || contactPage.blocks.length < 1) {
  throw new Error("Contact page must keep hidden BrandContentBlocks copy for future re-enable.");
}

console.log("Storefront Headless CMS component structure OK.");
