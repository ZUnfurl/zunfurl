import { activeLocales, brandName, type SupportedLocale } from 'gcss-config';

const localeCatalog: Array<{ id: SupportedLocale; title: string }> = [
  { id: 'en', title: 'English' },
  { id: 'fr', title: 'Français' },
  { id: 'zh-cn', title: '简体中文' },
];
export const supportedLocales = localeCatalog.filter((locale) => activeLocales.includes(locale.id));

export type LocaleId = SupportedLocale;
export type ProductLaunchStatus = 'draft' | 'ready' | 'live' | 'archived';

export interface ShopifyImageNode {
  altText?: string | null;
  height?: number | null;
  url?: string | null;
  width?: number | null;
}

export interface ShopifyVariantNode {
  availableForSale?: boolean | null;
  currentlyNotInStock?: boolean | null;
  selectedOptions?: Array<{ name: string; value: string }> | null;
  title?: string | null;
}

export interface ShopifyProductSummary {
  availableForSale: boolean;
  featuredImage?: ShopifyImageNode | null;
  handle: string;
  id: string;
  images?: { nodes?: ShopifyImageNode[] | null } | null;
  title: string;
  variants?: { nodes?: ShopifyVariantNode[] | null } | null;
}

export interface ShopifySummaryFields {
  shopifyAdminUrl?: string;
  shopifyHandle: string;
  shopifyImageSummary: string[];
  shopifyProductGid: string;
  shopifyStatus: 'storefront-available' | 'storefront-unavailable';
  shopifyTitle: string;
  shopifyVariantSummary: string[];
}

export interface ProductPageLocaleDocument {
  _key?: LocaleId;
  locale: LocaleId;
  launchStatus: ProductLaunchStatus;
  slug: { _type: 'slug'; current: string };
  name: string;
  collection: string;
  roadmapOrder: number;
  tagline: string;
  primaryImage: string;
  roadmapLinkLabel: string;
  detailHero: Record<string, unknown>;
  storyPages: Array<Record<string, unknown>>;
  seo: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SanityProductPageDocument {
  _id: string;
  _type: 'productPage';
  productStatus: 'active' | 'archived';
  roadmapOrder: number;
  [key: string]: unknown;
}

export interface SanityProductLocalePageDocument extends ProductPageLocaleDocument {
  _id: string;
  _type: 'productLocalePage';
  productPage: { _type: 'reference'; _ref: string };
  shopifyAdminUrl?: string;
  shopifyHandle: string;
  shopifyProductGid: string;
  shopifyStatus: ShopifySummaryFields['shopifyStatus'];
  shopifyTitle: string;
}

const localeCopy: Record<LocaleId, {
  bodyPrefix: string;
  collection: string;
  footerPrimary: string;
  footerSecondary: string;
  intro: string;
  linkLabel: string;
  storyEyebrow: string;
  storyTitle: string;
  tagline: string;
}> = {
  en: {
    bodyPrefix: 'Editorial draft for',
    collection: brandName,
    footerPrimary: 'Draft',
    footerSecondary: 'Content pending',
    intro: 'This Sanity draft was generated from the product launch wizard. Replace this copy before publishing.',
    linkLabel: 'View product detail',
    storyEyebrow: 'Product Introduction',
    storyTitle: 'Replace this story section before publishing.',
    tagline: 'Replace with a concise product promise.',
  },
  fr: {
    bodyPrefix: 'Brouillon éditorial pour',
    collection: brandName,
    footerPrimary: 'Brouillon',
    footerSecondary: 'Contenu à compléter',
    intro: 'Ce brouillon Sanity a été généré depuis l’assistant de lancement produit. Remplacez ce texte avant publication.',
    linkLabel: 'Voir le détail produit',
    storyEyebrow: 'Introduction produit',
    storyTitle: 'Remplacer cette section avant publication.',
    tagline: 'Remplacer par une promesse produit concise.',
  },
  'zh-cn': {
    bodyPrefix: '商品编辑草稿',
    collection: brandName,
    footerPrimary: '草稿',
    footerSecondary: '内容待完善',
    intro: '这是由商品上线向导生成的 Sanity 草稿。发布前请替换为正式文案。',
    linkLabel: '查看商品详情',
    storyEyebrow: '商品介绍',
    storyTitle: '发布前请替换这一段商品故事。',
    tagline: '替换为一句清晰的商品承诺。',
  },
};

export function normalizeHandle(handle: string): string {
  const value = handle.trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid product handle: ${value}. Use lowercase kebab-case.`);
  }

  return value;
}

export function getProductPageId(handle: string): string {
  return `productPage.${normalizeHandle(handle)}`;
}

export function getProductLocalePageId(locale: LocaleId, handle: string): string {
  return `productLocalePage.${locale}.${normalizeHandle(handle)}`;
}

export function getDraftId(documentId: string): string {
  return `drafts.${documentId}`;
}

export function getShopifyNumericId(gid: string): string | undefined {
  return gid.match(/\/(\d+)$/)?.[1];
}

export function createShopifyAdminProductUrl(storeDomain: string | undefined, productGid: string): string | undefined {
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

function formatImageSummary(image: ShopifyImageNode, index: number): string {
  const label = image.altText || `Shopify image ${index + 1}`;
  const size = image.width && image.height ? `${image.width}x${image.height}` : 'unknown-size';
  const url = image.url ?? 'missing-url';

  return `${index + 1}. ${label} | ${size} | ${url}`;
}

function formatVariantSummary(variant: ShopifyVariantNode): string {
  const optionLabel = (variant.selectedOptions ?? [])
    .map((option) => `${option.name}: ${option.value}`)
    .join(', ');
  const title = variant.title && variant.title !== 'Default Title' ? variant.title : undefined;
  const saleState = variant.availableForSale
    ? 'storefront-available'
    : variant.currentlyNotInStock
      ? 'storefront-currently-not-in-stock'
      : 'storefront-unavailable';

  return [title, optionLabel, saleState].filter(Boolean).join(' | ');
}

export function createProductPageShopifySummary(
  product: ShopifyProductSummary,
  storeDomain?: string,
): ShopifySummaryFields {
  return {
    shopifyProductGid: product.id,
    shopifyHandle: product.handle,
    shopifyStatus: product.availableForSale ? 'storefront-available' : 'storefront-unavailable',
    shopifyTitle: product.title,
    shopifyImageSummary: (product.images?.nodes ?? []).map(formatImageSummary),
    shopifyVariantSummary: (product.variants?.nodes ?? []).map(formatVariantSummary),
    shopifyAdminUrl: createShopifyAdminProductUrl(storeDomain, product.id),
  };
}

function imagePathForHandle(handle: string, suffix: string): string {
  return `/brand-assets/products/${handle}/${handle}-${suffix}.webp`;
}

function galleryForHandle(handle: string): string[] {
  return [1, 2, 3, 4].map((index) => imagePathForHandle(handle, String(index).padStart(2, '0')));
}

const legacyLocaleContentFields = [
  'benefits',
  'gallery',
  'longDescription',
  'roadmapDescription',
  'roadmapEyebrow',
  'roadmapFooterPrimary',
  'roadmapFooterSecondary',
  'roadmapHref',
  'roadmapPill',
  'roadmapSilhouette',
  'ritual',
  'science',
  'shortDescription',
  'status',
] as const;

function stripLocaleContent(document?: ProductPageLocaleDocument): Record<string, unknown> {
  if (!document) return {};

  const content = { ...document } as Record<string, unknown>;

  for (const field of [
    '_key',
    'launchStatus',
    'locale',
    'name',
    'seo',
    'slug',
    ...legacyLocaleContentFields,
  ]) {
    delete content[field];
  }

  return content;
}

function normalizeDetailHeroContent(
  value: unknown,
  fallback: { summary: string; gallery: Array<Record<string, string>> },
): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const source = value as Record<string, unknown>;

  return {
    summary: String(source.summary ?? fallback.summary),
    gallery: Array.isArray(source.gallery) ? source.gallery : fallback.gallery,
  };
}

export function getTemplateLocale(
  templateLocalePages: Array<ProductPageLocaleDocument | SanityProductLocalePageDocument> | undefined,
  locale: LocaleId,
): ProductPageLocaleDocument | undefined {
  return templateLocalePages?.find((entry) => entry.locale === locale);
}

function stripStoryPageLegacyFields(storyPage: Record<string, unknown>): Record<string, unknown> {
  const { align, ...content } = storyPage;

  void align;

  return content;
}

export function createProductPageLocaleDocument({
  locale,
  product,
  templateLocale,
}: {
  locale: LocaleId;
  product: ShopifyProductSummary;
  templateLocale?: ProductPageLocaleDocument;
}): ProductPageLocaleDocument {
  const handle = normalizeHandle(product.handle);
  const copy = localeCopy[locale];
  const templateContent = stripLocaleContent(templateLocale);
  const gallery = galleryForHandle(handle);

  return {
    ...templateContent,
    _key: locale,
    locale,
    launchStatus: 'draft',
    slug: { _type: 'slug', current: handle },
    name: product.title,
    collection: String(templateContent.collection ?? copy.collection),
    roadmapOrder: Number(templateContent.roadmapOrder ?? 999),
    tagline: String(templateContent.tagline ?? `[待编辑] ${copy.tagline}`),
    primaryImage: String(templateContent.primaryImage ?? imagePathForHandle(handle, 'main')),
    roadmapLinkLabel: String(templateContent.roadmapLinkLabel ?? copy.linkLabel),
    detailHero: normalizeDetailHeroContent(templateContent.detailHero, {
      summary: `[待编辑] ${copy.intro}`,
      gallery: gallery.map((src, index) => ({
        src,
        alt: `[待编辑] ${product.title} image ${index + 1}`,
      })),
    }),
    storyPages: Array.isArray(templateContent.storyPages)
      ? (templateContent.storyPages as Array<Record<string, unknown>>).map(stripStoryPageLegacyFields)
      : [
          {
            _key: 'product-introduction',
            id: 'product-introduction',
            eyebrow: copy.storyEyebrow,
            title: `[待编辑] ${copy.storyTitle}`,
            body: `[待编辑] ${copy.bodyPrefix}: ${product.title}.`,
            supporting: '[待编辑] Replace this supporting copy before publishing.',
            image: imagePathForHandle(handle, 'story-01'),
            imageAlt: `[待编辑] ${product.title} story image`,
          },
        ],
    seo: {
      ...(typeof templateLocale?.seo === 'object' && templateLocale.seo ? templateLocale.seo : {}),
      title: `${product.title} | ${brandName}`,
      description: `[待编辑] SEO description for ${product.title}.`,
    },
  };
}

export function createProductPageDocument({
  product,
  shopifySummary,
  templatePage,
}: {
  product: ShopifyProductSummary;
  shopifySummary: ShopifySummaryFields;
  templatePage?: SanityProductPageDocument;
}): SanityProductPageDocument {
  const handle = normalizeHandle(product.handle);

  return {
    _id: getProductPageId(handle),
    _type: 'productPage',
    productStatus: 'active',
    roadmapOrder: Number(templatePage?.roadmapOrder ?? 999),
    ...shopifySummary,
  };
}

export function createProductLocalePageDocument({
  locale,
  product,
  shopifySummary,
  templateLocale,
}: {
  locale: LocaleId;
  product: ShopifyProductSummary;
  shopifySummary: ShopifySummaryFields;
  templateLocale?: ProductPageLocaleDocument;
}): SanityProductLocalePageDocument {
  const handle = normalizeHandle(product.handle);
  const { _key, ...localized } = createProductPageLocaleDocument({
    locale,
    product,
    templateLocale,
  });
  const {
    shopifyImageSummary,
    shopifyVariantSummary,
    ...languageSummary
  } = shopifySummary;

  void _key;
  void shopifyImageSummary;
  void shopifyVariantSummary;

  return {
    _id: getProductLocalePageId(locale, handle),
    _type: 'productLocalePage',
    productPage: {
      _type: 'reference',
      _ref: getProductPageId(handle),
    },
    ...languageSummary,
    ...localized,
  };
}

export function createProductLocalePageSummaryPatch(shopifySummary: ShopifySummaryFields) {
  const {
    shopifyImageSummary,
    shopifyVariantSummary,
    ...languageSummary
  } = shopifySummary;

  void shopifyImageSummary;
  void shopifyVariantSummary;

  return languageSummary;
}
