import type { SanityClient } from '@sanity/client';

export const defaultApiVersion: string;

export const queries: {
  siteSettings: string;
  pageByLocaleAndKind: string;
  pagesByLocalesAndKinds: string;
  productPagesByLocale: string;
  productPageByLocaleAndSlug: string;
  productPagePathsByLocales: string;
  redirects: string;
};

export interface SanityContentClientOptions {
  projectId?: string;
  dataset?: string;
  apiVersion?: string;
  useCdn?: boolean;
  token?: string;
}

export function createSanityContentClient(options?: SanityContentClientOptions): SanityClient;
export function resolveContactPageHeroImages<T = unknown>(page: T): T;
export function getSiteSettings<T = unknown>(client: SanityClient): Promise<T>;
export function getPageByLocaleAndKind<T = unknown>(
  client: SanityClient,
  locale: string,
  kind: string,
): Promise<T>;
export function getPagesByLocalesAndKinds<T = unknown>(
  client: SanityClient,
  locales: string[],
  kinds: string[],
): Promise<T[]>;
export function getProductPagesByLocale<T = unknown>(
  client: SanityClient,
  locale: string,
): Promise<T[]>;
export function getProductPageByLocaleAndSlug<T = unknown>(
  client: SanityClient,
  locale: string,
  slug: string,
): Promise<T>;
export function getProductPageStoryByLocaleAndSlug<T = unknown>(
  client: SanityClient,
  locale: string,
  productSlug: string,
): Promise<T>;
export function getProductPagePathsByLocales<T = unknown>(
  client: SanityClient,
  locales: string[],
): Promise<T[]>;
export function getRedirects<T = unknown>(client: SanityClient): Promise<T[]>;
