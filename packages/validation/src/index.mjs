import { z } from 'zod';

export const localeSchema = z.enum(['en', 'fr', 'zh-cn']);
export const pageKindSchema = z.enum(['home', 'about', 'products', 'contact']);
export const productPageStatusSchema = z.enum(['active', 'archived']);
export const productLaunchStatusSchema = z.enum(['draft', 'ready', 'live', 'archived']);
export const contentImageSourceSchema = z.enum(['sanity', 'local']);
export const shopifySummaryStatusSchema = z.enum([
  'pending-shopify-summary',
  'storefront-available',
  'storefront-unavailable',
]);

export const ctaSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});

export const seoSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export const pageBlockSchema = z.object({
  id: z.string().min(1),
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  items: z.array(z.string().min(1)).optional(),
  variant: z.enum(['standard', 'wide', 'accent']).default('standard'),
});

export const pageHeroSlideSchema = z.object({
  imageSource: contentImageSourceSchema.optional(),
  src: z.string().min(1),
  sanityImageUrl: z.string().min(1).optional(),
  sanityImageAssetRef: z.string().min(1).optional(),
  alt: z.string().min(1),
  eyebrow: z.string().min(1),
  caption: z.string().min(1),
});

export const pageHeroSchema = z.object({
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  slides: z.array(pageHeroSlideSchema).min(1),
});

export const homeHeroSchema = z.object({
  eyebrow: z.string().min(1),
  titleLines: z.array(z.string().min(1)).min(1),
  intro: z.string().min(1),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
  motionLabel: z.string().min(1),
  videoSrc: z.string().min(1).optional(),
  videoPoster: z.string().min(1).optional(),
  motionQuote: z.string().min(1),
  captionEyebrow: z.string().min(1),
  captionTitle: z.string().min(1),
});

export const brandFrameworkSchema = z.object({
  eyebrow: z.string().min(1),
  ariaLabel: z.string().min(1),
  ctaLabel: z.string().min(1),
  slides: z
    .array(
      z.object({
        imageSource: contentImageSourceSchema.optional(),
        image: z.string().min(1),
        sanityImageUrl: z.string().min(1).optional(),
        sanityImageAssetRef: z.string().min(1).optional(),
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
});

export const productSpotlightSchema = z.object({
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  ariaLabel: z.string().min(1),
  previousLabel: z.string().min(1),
  nextLabel: z.string().min(1),
  openProductLabel: z.string().min(1),
});

export const aboutSignatureSchema = z.object({
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  panels: z
    .array(
      z.object({
        id: z.string().min(1),
        eyebrow: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
        imageSource: contentImageSourceSchema.optional(),
        imagePath: z.string().min(1),
        sanityImageUrl: z.string().min(1).optional(),
        sanityImageAssetRef: z.string().min(1).optional(),
        imageAlt: z.string().min(1),
        imagePosition: z.enum(['left', 'right']).default('left'),
        cta: ctaSchema.optional(),
      }),
    )
    .min(1),
});

export const contactMaskSectionSchema = z.object({
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  imageSource: contentImageSourceSchema.optional(),
  image: z.string().min(1),
  sanityImageUrl: z.string().min(1).optional(),
  sanityImageAssetRef: z.string().min(1).optional(),
  imageAlt: z.string().min(1),
  cta: ctaSchema,
});

export const contactSectionSchema = z.object({
  enabled: z.boolean().default(true),
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  businessDirections: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
      }),
    )
    .min(1),
  responseTime: z.string().min(1),
  fieldCopy: z.object({
    nameLabel: z.string().min(1),
    namePlaceholder: z.string().min(1),
    emailLabel: z.string().min(1),
    emailPlaceholder: z.string().min(1),
    topicLabel: z.string().min(1),
    orderNumberLabel: z.string().min(1),
    orderNumberPlaceholder: z.string().min(1),
    messageLabel: z.string().min(1),
    messagePlaceholder: z.string().min(1),
    messageLimitLabel: z.string().min(1).optional(),
  }),
  legalNotice: z
    .object({
      title: z.string().min(1),
      body: z.string().min(1),
      links: z.array(ctaSchema).min(1),
      acceptance: z.string().min(1),
    })
    .optional(),
  topics: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
      }),
    )
    .min(1),
  submitLabel: z.string().min(1),
  successTitle: z.string().min(1),
  successBody: z.string().min(1),
  errorTitle: z.string().min(1),
  errorBody: z.string().min(1),
  disabledTitle: z.string().min(1),
  disabledBody: z.string().min(1),
});

export const pageContentSchema = z.object({
  locale: localeSchema,
  kind: pageKindSchema,
  title: z.string().min(1),
  seo: seoSchema,
  hero: homeHeroSchema.optional(),
  pageHero: pageHeroSchema.optional(),
  aboutSignature: aboutSignatureSchema.optional(),
  brandFramework: brandFrameworkSchema.optional(),
  homeProductSpotlight: productSpotlightSchema.optional(),
  productSpotlight: productSpotlightSchema.optional(),
  contactMaskSection: contactMaskSectionSchema.optional(),
  contactSection: contactSectionSchema.optional(),
  showContentBlocks: z.boolean().optional().default(true),
  blocks: z.array(pageBlockSchema).optional(),
});

export const productContentSchema = z.object({
  locale: localeSchema,
  slug: z.string().min(1),
  shopifyHandle: z.string().min(1).optional(),
  name: z.string().min(1),
  collection: z.string().min(1),
  launchStatus: productLaunchStatusSchema.default('live'),
  roadmapOrder: z.number().default(0),
  tagline: z.string().min(1),
  primaryImage: z.string().min(1),
  roadmapLinkLabel: z.string().min(1).optional(),
  roadmapHref: z.string().min(1).optional(),
  seo: seoSchema,
});

export const productDetailHeroSchema = z.object({
  summary: z.string().min(1),
  gallery: z
    .array(
      z.object({
        src: z.string().min(1),
        alt: z.string().min(1),
      }),
    )
    .min(1),
});

export const productStorySchema = z.object({
  locale: localeSchema,
  slug: z.string().min(1),
  productSlug: z.string().min(1),
  shopifyHandle: z.string().min(1).optional(),
  title: z.string().min(1),
  seo: seoSchema,
  detailHero: productDetailHeroSchema,
  storyPages: z
    .array(
      z.object({
        id: z.string().min(1),
        eyebrow: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
        supporting: z.string().min(1).optional(),
        imageSource: contentImageSourceSchema.optional(),
        image: z.string().min(1),
        sanityImageUrl: z.string().min(1).optional(),
        sanityImageAssetRef: z.string().min(1).optional(),
        imageAlt: z.string().min(1),
      }),
    )
    .min(1)
    .optional(),
});

export const productLocalePageSchema = productContentSchema.extend({
  shopifyHandle: z.string().min(1),
  detailHero: productDetailHeroSchema,
  storyPages: productStorySchema.shape.storyPages,
});

export const productPageSchema = z.object({
  productStatus: productPageStatusSchema.default('active'),
  roadmapOrder: z.number().default(0),
  shopifyProductGid: z.string().min(1).optional(),
  shopifyHandle: z.string().min(1),
  shopifyStatus: shopifySummaryStatusSchema.default('pending-shopify-summary'),
  shopifyTitle: z.string().min(1).optional(),
  shopifyImageSummary: z.array(z.string().min(1)).optional(),
  shopifyVariantSummary: z.array(z.string().min(1)).optional(),
  shopifyAdminUrl: z.string().min(1).optional(),
});

function formatIssue(issue) {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `${path}: ${issue.message}`;
}

function parseContent(schema, value, context) {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map(formatIssue).join('; ');
  throw new Error(`${context} content validation failed: ${details}`);
}

export function validatePageContent(value, context = 'page') {
  return parseContent(pageContentSchema, value, context);
}

export function validateProductContent(value, context = 'product') {
  return parseContent(productContentSchema, value, context);
}

export function validateProductStoryContent(value, context = 'productStory') {
  return parseContent(productStorySchema, value, context);
}

export function validateProductPageContent(value, context = 'productPage') {
  return parseContent(productPageSchema, value, context);
}

export function validateProductLocalePageContent(value, context = 'productLocalePage') {
  return parseContent(productLocalePageSchema, value, context);
}
