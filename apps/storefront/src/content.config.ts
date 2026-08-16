import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ctaSchema = z.object({
	label: z.string(),
	href: z.string(),
});

const pageBlockSchema = z.object({
	id: z.string(),
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	items: z.array(z.string()).optional(),
	variant: z.enum(['standard', 'wide', 'accent']).default('standard'),
});

const pageHeroSlideSchema = z.object({
	imageSource: z.enum(['sanity', 'local']).optional(),
	src: z.string(),
	sanityImageUrl: z.string().optional(),
	sanityImageAssetRef: z.string().optional(),
	alt: z.string(),
	eyebrow: z.string(),
	caption: z.string(),
});

const pageHeroSchema = z.object({
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	slides: z.array(pageHeroSlideSchema).min(1),
});

const brandFrameworkSlideSchema = z.object({
	imageSource: z.enum(['sanity', 'local']).optional(),
	image: z.string(),
	sanityImageUrl: z.string().optional(),
	sanityImageAssetRef: z.string().optional(),
	title: z.string(),
	description: z.string(),
});

const brandFrameworkSchema = z.object({
	eyebrow: z.string(),
	ariaLabel: z.string(),
	ctaLabel: z.string(),
	slides: z.array(brandFrameworkSlideSchema).min(1),
});

const productSpotlightSchema = z.object({
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	ariaLabel: z.string(),
	previousLabel: z.string(),
	nextLabel: z.string(),
	openProductLabel: z.string(),
});

const aboutSignatureSchema = z.object({
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	panels: z
		.array(
			z.object({
				id: z.string(),
				eyebrow: z.string(),
				title: z.string(),
				body: z.string(),
				imageSource: z.enum(['sanity', 'local']).optional(),
				imagePath: z.string(),
				sanityImageUrl: z.string().optional(),
				sanityImageAssetRef: z.string().optional(),
				imageAlt: z.string(),
				imagePosition: z.enum(['left', 'right']).default('left'),
				cta: ctaSchema.optional(),
			}),
		)
		.min(1),
});

const contactMaskSectionSchema = z.object({
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	imageSource: z.enum(['sanity', 'local']).optional(),
	image: z.string(),
	sanityImageUrl: z.string().optional(),
	sanityImageAssetRef: z.string().optional(),
	imageAlt: z.string(),
	cta: ctaSchema,
});

const contactSectionSchema = z.object({
	enabled: z.boolean().default(true),
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	businessDirections: z
		.array(
			z.object({
				title: z.string(),
				body: z.string(),
			}),
		)
		.min(1),
	responseTime: z.string(),
	fieldCopy: z.object({
		nameLabel: z.string(),
		namePlaceholder: z.string(),
		emailLabel: z.string(),
		emailPlaceholder: z.string(),
		topicLabel: z.string(),
		orderNumberLabel: z.string(),
		orderNumberPlaceholder: z.string(),
		messageLabel: z.string(),
		messagePlaceholder: z.string(),
		messageLimitLabel: z.string().optional(),
	}),
	legalNotice: z
		.object({
			title: z.string(),
			body: z.string(),
			links: z.array(ctaSchema).min(1),
			acceptance: z.string(),
		})
		.optional(),
	topics: z
		.array(
			z.object({
				label: z.string(),
				value: z.string(),
			}),
		)
		.min(1),
	submitLabel: z.string(),
	successTitle: z.string(),
	successBody: z.string(),
	errorTitle: z.string(),
	errorBody: z.string(),
	disabledTitle: z.string(),
	disabledBody: z.string(),
});

const productDetailHeroImageSchema = z.object({
	src: z.string(),
	alt: z.string(),
});

const productDetailHeroSchema = z.object({
	summary: z.string(),
	gallery: z.array(productDetailHeroImageSchema).min(1),
});

const productStoryPageSchema = z.object({
	id: z.string(),
	eyebrow: z.string(),
	title: z.string(),
	body: z.string(),
	supporting: z.string().optional(),
	imageSource: z.enum(['sanity', 'local']).optional(),
	image: z.string(),
	sanityImageUrl: z.string().optional(),
	sanityImageAssetRef: z.string().optional(),
	imageAlt: z.string(),
});

const pages = defineCollection({
	loader: glob({
		pattern: '**/*.json',
		base: './src/content/pages',
	}),
	schema: z.object({
		locale: z.enum(['en', 'fr', 'zh-cn']),
		kind: z.enum(['home', 'about', 'products', 'contact']),
		title: z.string(),
		seo: z.object({
			title: z.string(),
			description: z.string(),
		}),
		hero: z
			.object({
				eyebrow: z.string(),
				titleLines: z.array(z.string()).min(1),
				intro: z.string(),
				primaryCta: ctaSchema,
				secondaryCta: ctaSchema,
				motionLabel: z.string(),
				videoSrc: z.string().optional(),
				videoPoster: z.string().optional(),
				motionQuote: z.string(),
				captionEyebrow: z.string(),
				captionTitle: z.string(),
			})
			.optional(),
		pageHero: pageHeroSchema.optional(),
		aboutSignature: aboutSignatureSchema.optional(),
		brandFramework: brandFrameworkSchema.optional(),
		homeProductSpotlight: productSpotlightSchema.optional(),
		productSpotlight: productSpotlightSchema.optional(),
		contactMaskSection: contactMaskSectionSchema.optional(),
		contactSection: contactSectionSchema.optional(),
		showContentBlocks: z.boolean().optional().default(true),
		blocks: z.array(pageBlockSchema).optional(),
	}),
});

const productLocalePageSchema = z.object({
	locale: z.enum(['en', 'fr', 'zh-cn']),
	slug: z.string(),
	shopifyHandle: z.string().optional(),
	name: z.string(),
	collection: z.string(),
	launchStatus: z.enum(['draft', 'ready', 'live', 'archived']).default('live'),
	roadmapOrder: z.number().default(0),
	tagline: z.string(),
	primaryImage: z.string(),
	roadmapLinkLabel: z.string().optional(),
	roadmapHref: z.string().optional(),
	detailHero: productDetailHeroSchema,
	storyPages: z.array(productStoryPageSchema).min(1).optional(),
	seo: z.object({
		title: z.string(),
		description: z.string(),
	}),
});

const productPages = defineCollection({
	loader: glob({
		pattern: '**/*.json',
		base: './src/content/product-pages',
		generateId: ({ data }) => String(data.shopifyHandle),
	}),
	schema: z.object({
		productStatus: z.enum(['active', 'archived']).default('active'),
		roadmapOrder: z.number().default(0),
		shopifyProductGid: z.string().optional(),
		shopifyHandle: z.string(),
		shopifyStatus: z.enum([
			'pending-shopify-summary',
			'storefront-available',
			'storefront-unavailable',
		]).default('pending-shopify-summary'),
		shopifyTitle: z.string().optional(),
		shopifyImageSummary: z.array(z.string()).optional(),
		shopifyVariantSummary: z.array(z.string()).optional(),
		shopifyAdminUrl: z.string().optional(),
	}),
});

const productLocalePages = defineCollection({
	loader: glob({
		pattern: '**/*.json',
		base: './src/content/product-locale-pages',
		generateId: ({ data }) => `${data.locale}/${data.shopifyHandle}`,
	}),
	schema: productLocalePageSchema.extend({
		shopifyHandle: z.string(),
	}),
});

export const collections = { pages, productPages, productLocalePages };
