import type { z } from 'zod';

export const localeSchema: z.ZodEnum<{ en: 'en'; fr: 'fr'; 'zh-cn': 'zh-cn' }>;
export const pageKindSchema: z.ZodEnum<{
  home: 'home';
  about: 'about';
  products: 'products';
  contact: 'contact';
}>;
export const productLaunchStatusSchema: z.ZodEnum<{
  draft: 'draft';
  ready: 'ready';
  live: 'live';
  archived: 'archived';
}>;
export const productPageStatusSchema: z.ZodEnum<{
  active: 'active';
  archived: 'archived';
}>;
export const shopifySummaryStatusSchema: z.ZodEnum<{
  'pending-shopify-summary': 'pending-shopify-summary';
  'storefront-available': 'storefront-available';
  'storefront-unavailable': 'storefront-unavailable';
}>;
export const contactSectionSchema: z.ZodTypeAny;
export const pageContentSchema: z.ZodTypeAny;
export const productContentSchema: z.ZodTypeAny;
export const productStorySchema: z.ZodTypeAny;
export const productLocalePageSchema: z.ZodTypeAny;
export const productPageSchema: z.ZodTypeAny;

export function validatePageContent<T = unknown>(value: unknown, context?: string): T;
export function validateProductContent<T = unknown>(value: unknown, context?: string): T;
export function validateProductStoryContent<T = unknown>(value: unknown, context?: string): T;
export function validateProductPageContent<T = unknown>(value: unknown, context?: string): T;
export function validateProductLocalePageContent<T = unknown>(value: unknown, context?: string): T;
