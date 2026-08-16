export type SupportedLocale = 'en' | 'fr' | 'zh-cn';
export type ActiveLocale = SupportedLocale;
export type PageKind = 'home' | 'about' | 'products' | 'contact';
export type ProductPageStatus = 'active' | 'archived';
export type ProductLaunchStatus = 'draft' | 'ready' | 'live' | 'archived';
export type BlockVariant = 'standard' | 'wide' | 'accent';
export type ContentImageSource = 'sanity' | 'local';

export interface Cta {
  label: string;
  href: string;
}

export interface SeoFields {
  title: string;
  description: string;
}

export interface PageBlock {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  items?: string[];
  variant: BlockVariant;
}

export interface PageHeroSlide {
  src: string;
  imageSource?: ContentImageSource;
  sanityImageUrl?: string;
  sanityImageAssetRef?: string;
  alt: string;
  eyebrow: string;
  caption: string;
}

export interface PageHero {
  eyebrow: string;
  title: string;
  body: string;
  slides: PageHeroSlide[];
}

export interface HomeHero {
  eyebrow: string;
  titleLines: string[];
  intro: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  motionLabel: string;
  videoSrc?: string;
  videoPoster?: string;
  motionQuote: string;
  captionEyebrow: string;
  captionTitle: string;
}

export interface BrandFrameworkSlide {
  image: string;
  imageSource?: ContentImageSource;
  sanityImageUrl?: string;
  sanityImageAssetRef?: string;
  title: string;
  description: string;
}

export interface BrandFramework {
  eyebrow: string;
  ariaLabel: string;
  ctaLabel: string;
  slides: BrandFrameworkSlide[];
}

export interface ProductSpotlightContent {
  eyebrow: string;
  title: string;
  body: string;
  ariaLabel: string;
  previousLabel: string;
  nextLabel: string;
  openProductLabel: string;
}

export type ImagePosition = 'left' | 'right';

export interface AboutSignaturePanel {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  imageSource?: ContentImageSource;
  imagePath: string;
  sanityImageUrl?: string;
  sanityImageAssetRef?: string;
  imageAlt: string;
  imagePosition: ImagePosition;
  cta?: Cta;
}

export interface AboutSignatureContent {
  eyebrow: string;
  title: string;
  body: string;
  panels: AboutSignaturePanel[];
}

export interface ContactMaskSectionContent {
  eyebrow: string;
  title: string;
  body: string;
  imageSource?: ContentImageSource;
  image: string;
  sanityImageUrl?: string;
  sanityImageAssetRef?: string;
  imageAlt: string;
  cta: Cta;
}

export type ContactCtaSectionContent = ContactMaskSectionContent;

export interface ContactBusinessDirection {
  title: string;
  body: string;
}

export interface ContactTopic {
  label: string;
  value: string;
}

export interface ContactFieldCopy {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  topicLabel: string;
  orderNumberLabel: string;
  orderNumberPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  messageLimitLabel?: string;
}

export interface ContactLegalLink {
  label: string;
  href: string;
}

export interface ContactLegalNotice {
  title: string;
  body: string;
  links: ContactLegalLink[];
  acceptance: string;
}

export interface ContactSectionContent {
  enabled: boolean;
  eyebrow: string;
  title: string;
  body: string;
  businessDirections: ContactBusinessDirection[];
  responseTime: string;
  fieldCopy: ContactFieldCopy;
  legalNotice?: ContactLegalNotice;
  topics: ContactTopic[];
  submitLabel: string;
  successTitle: string;
  successBody: string;
  errorTitle: string;
  errorBody: string;
  disabledTitle: string;
  disabledBody: string;
}

export interface PageContent {
  locale: SupportedLocale;
  kind: PageKind;
  title: string;
  seo: SeoFields;
  hero?: HomeHero;
  pageHero?: PageHero;
  aboutSignature?: AboutSignatureContent;
  brandFramework?: BrandFramework;
  homeProductSpotlight?: ProductSpotlightContent;
  productSpotlight?: ProductSpotlightContent;
  contactMaskSection?: ContactMaskSectionContent;
  contactSection?: ContactSectionContent;
  showContentBlocks?: boolean;
  blocks?: PageBlock[];
}

export interface ProductContent {
  locale: SupportedLocale;
  slug: string;
  shopifyHandle?: string;
  name: string;
  collection: string;
  launchStatus: ProductLaunchStatus;
  roadmapOrder: number;
  tagline: string;
  primaryImage: string;
  roadmapLinkLabel?: string;
  roadmapHref?: string;
  seo: SeoFields;
}

export interface ProductDetailHeroImage {
  src: string;
  alt: string;
}

export interface ProductDetailHero {
  summary: string;
  gallery: ProductDetailHeroImage[];
}

export interface ProductStoryPage {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  supporting?: string;
  imageSource?: ContentImageSource;
  image: string;
  sanityImageUrl?: string;
  sanityImageAssetRef?: string;
  imageAlt: string;
}

export interface ProductStoryContent {
  locale: SupportedLocale;
  slug: string;
  productSlug: string;
  shopifyHandle?: string;
  title: string;
  seo: SeoFields;
  detailHero: ProductDetailHero;
  storyPages?: ProductStoryPage[];
}

export interface ShopifyReadOnlySummary {
  shopifyAdminUrl?: string;
  shopifyHandle: string;
  shopifyImageSummary?: string[];
  shopifyProductGid?: string;
  shopifyStatus: 'pending-shopify-summary' | 'storefront-available' | 'storefront-unavailable';
  shopifyTitle?: string;
  shopifyVariantSummary?: string[];
}

export interface ProductLocalePageContent extends ProductContent {
  detailHero: ProductDetailHero;
  storyPages?: ProductStoryPage[];
}

export interface ProductPageContent extends ShopifyReadOnlySummary {
  productStatus: ProductPageStatus;
  roadmapOrder: number;
}

export const supportedLocales: readonly SupportedLocale[];
export const activeLocales: readonly ActiveLocale[];
export const pageKinds: readonly PageKind[];
export const productPageStatuses: readonly ProductPageStatus[];
export const productLaunchStatuses: readonly ProductLaunchStatus[];
export const blockVariants: readonly BlockVariant[];
export const contentImageSources: readonly ContentImageSource[];
