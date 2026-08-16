import {
  isFeatureEnabled,
  siteProfile,
  type SiteProfile,
} from 'gcss-config';

export type StudioPageKind = 'home' | 'about' | 'products' | 'contact';

export const studioSiteProfile = siteProfile;

export function isStudioEnabled(profile: SiteProfile = studioSiteProfile) {
  return isFeatureEnabled(profile, 'studio');
}

export function isStudioContentCmsEnabled(profile: SiteProfile = studioSiteProfile) {
  return isStudioEnabled(profile) && isFeatureEnabled(profile, 'contentCms');
}

export function isStudioProductCmsEnabled(profile: SiteProfile = studioSiteProfile) {
  return (
    isStudioEnabled(profile) &&
    isFeatureEnabled(profile, 'commerce') &&
    isFeatureEnabled(profile, 'productCms')
  );
}

export function isStudioContactFormEnabled(profile: SiteProfile = studioSiteProfile) {
  return isStudioEnabled(profile) && isFeatureEnabled(profile, 'contactForm');
}

export function getStudioPageKinds(profile: SiteProfile = studioSiteProfile) {
  const pageKinds: Array<{ id: StudioPageKind; title: string }> = [
    { id: 'home', title: 'Home' },
    { id: 'about', title: 'About' },
  ];

  if (isStudioProductCmsEnabled(profile)) {
    pageKinds.push({ id: 'products', title: 'Products' });
  }

  pageKinds.push({ id: 'contact', title: 'Contact' });

  return pageKinds;
}
