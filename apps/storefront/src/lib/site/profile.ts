import {
  isFeatureEnabled,
  siteProfile,
  type SiteProfile,
} from "gcss-config";
import type { ActiveLocale } from "../../i18n/config";

export type BrandPageKind = "about" | "products" | "contact";

interface NavigationDictionary {
  navigation: {
    home: string;
    about: string;
    products: string;
    contact: string;
  };
}

export const currentSiteProfile = siteProfile;

export function isCommerceEnabled(profile: SiteProfile = currentSiteProfile) {
  return (
    isFeatureEnabled(profile, "commerce") &&
    isFeatureEnabled(profile, "productCms")
  );
}

export function isContactFormEnabled(profile: SiteProfile = currentSiteProfile) {
  return isFeatureEnabled(profile, "contactForm");
}

export function getEnabledBrandPageKinds(
  profile: SiteProfile = currentSiteProfile,
): BrandPageKind[] {
  const pageKinds: BrandPageKind[] = ["about"];

  if (isCommerceEnabled(profile)) {
    pageKinds.push("products");
  }

  pageKinds.push("contact");

  return pageKinds;
}

export function isEnabledBrandPageKind(
  value: string | undefined,
  profile: SiteProfile = currentSiteProfile,
): value is BrandPageKind {
  return Boolean(value && getEnabledBrandPageKinds(profile).includes(value as BrandPageKind));
}

export function getSiteNavigation(
  locale: ActiveLocale,
  dictionary: NavigationDictionary,
  profile: SiteProfile = currentSiteProfile,
) {
  const navItems = [
    { label: dictionary.navigation.home, href: `/${locale}/` },
    { label: dictionary.navigation.about, href: `/${locale}/about/` },
  ];

  if (isCommerceEnabled(profile)) {
    navItems.push({
      label: dictionary.navigation.products,
      href: `/${locale}/products/`,
    });
  }

  navItems.push({
    label: dictionary.navigation.contact,
    href: `/${locale}/contact/`,
  });

  return navItems;
}

export function assertCommerceEnabled(context: string) {
  if (!isCommerceEnabled()) {
    throw new Error(
      `${context} is disabled for SITE_PROFILE=${currentSiteProfile.mode}.`,
    );
  }
}
