export type SupportedLocale = 'en' | 'fr' | 'zh-cn';
export type ContentSource = 'local' | 'sanity';
export type LegalPageSlug =
  | 'privacy-policy'
  | 'terms-of-use'
  | 'shipping-returns-policy'
  | 'customer-service-contact';

export interface ProjectContract {
  schemaVersion: 1;
  frameworkVersion: string;
  templateMode: boolean;
  identity: {
    projectName: string;
    brandName: string;
    domain: string;
  };
  delivery: {
    profile: SiteMode;
    contentSource: ContentSource;
    defaultLocale: SupportedLocale;
    locales: SupportedLocale[];
  };
  features: {
    contactForm: boolean;
    legalPages: LegalPageSlug[];
  };
  deployment: {
    workerName: string;
    studioHost: string;
    githubRepository: string;
  };
}

export const projectConfig: ProjectContract;
export const frameworkVersion: string;
export const templateMode: boolean;
export const projectName: string;
export const brandName: string;
export const siteUrl: string;
export const defaultLocale: SupportedLocale;
export const supportedLocales: readonly SupportedLocale[];
export const activeLocales: readonly SupportedLocale[];
export const defaultContentSource: ContentSource;
export const enabledLegalPages: readonly LegalPageSlug[];
export const workerName: string;
export const studioHost: string;
export const githubRepository: string;

export type SiteMode = 'static-brand' | 'cms-brand' | 'retail';
export type FeatureFlagValue = boolean | undefined;

export interface SiteFeatures {
  contentCms: boolean;
  commerce: boolean;
  productCms: boolean;
  contactForm: boolean;
  studio: boolean;
  sanityImageCdn: boolean;
  localImageFallback: boolean;
  multilingual: boolean;
}

export interface SiteProfile {
  mode: SiteMode;
  features: SiteFeatures;
}

export const siteModes: readonly SiteMode[];
export const defaultSiteMode: SiteMode;
export const featureNames: readonly (keyof SiteFeatures)[];
export const featureProfiles: Record<SiteMode, SiteFeatures>;
export const featureEnvironmentRequirements: Record<string, readonly string[]>;
export function normalizeSiteMode(value?: string): SiteMode;

export function parseFeatureFlag(value: unknown): FeatureFlagValue;

export function createSiteProfile(options?: {
  mode?: SiteMode;
  features?: Partial<SiteFeatures>;
}): SiteProfile;

export function createSiteProfileFromEnv(env?: Record<string, string | undefined>): SiteProfile;

export function createTestSiteProfileFromEnv(env?: Record<string, string | undefined>): SiteProfile;

export const siteProfile: SiteProfile;

export function isFeatureEnabled(profile: SiteProfile, featureName: keyof SiteFeatures): boolean;

export function getRequiredEnvironmentVariables(
  profile: SiteProfile,
  options?: { includeCloudflareDeploy?: boolean },
): string[];
