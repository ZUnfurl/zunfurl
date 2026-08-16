import projectContract from '../../../gcss.project.json' with { type: 'json' };

export const projectConfig = projectContract;
export const frameworkVersion = projectContract.frameworkVersion;
export const templateMode = projectContract.templateMode;
export const projectName = projectContract.identity.projectName;
export const brandName = projectContract.identity.brandName;
export const siteUrl = `https://${projectContract.identity.domain}`;
export const supportedLocales = ['en', 'fr', 'zh-cn'];
export const activeLocales = [...projectContract.delivery.locales];
export const defaultLocale = projectContract.delivery.defaultLocale;
export const defaultContentSource = projectContract.delivery.contentSource;
export const enabledLegalPages = [...projectContract.features.legalPages];
export const workerName = projectContract.deployment.workerName;
export const studioHost = projectContract.deployment.studioHost;
export const githubRepository = projectContract.deployment.githubRepository;

export const siteModes = ['static-brand', 'cms-brand', 'retail'];
export const defaultSiteMode = projectContract.delivery.profile;

export const featureNames = [
  'contentCms',
  'commerce',
  'productCms',
  'contactForm',
  'studio',
  'sanityImageCdn',
  'localImageFallback',
  'multilingual',
];

export const featureProfiles = {
  'static-brand': {
    contentCms: false,
    commerce: false,
    productCms: false,
    contactForm: false,
    studio: false,
    sanityImageCdn: false,
    localImageFallback: true,
    multilingual: true,
  },
  'cms-brand': {
    contentCms: true,
    commerce: false,
    productCms: false,
    contactForm: true,
    studio: true,
    sanityImageCdn: true,
    localImageFallback: true,
    multilingual: true,
  },
  retail: {
    contentCms: true,
    commerce: true,
    productCms: true,
    contactForm: true,
    studio: true,
    sanityImageCdn: true,
    localImageFallback: true,
    multilingual: true,
  },
};

export const featureEnvironmentRequirements = {
  contentCms: ['SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_API_READ_TOKEN'],
  studio: ['SANITY_STUDIO_PROJECT_ID', 'SANITY_STUDIO_DATASET', 'SANITY_STUDIO_HOST'],
  commerce: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STOREFRONT_ACCESS_TOKEN'],
  productCms: [
    'SANITY_STUDIO_SHOPIFY_STORE_DOMAIN',
    'SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  ],
  contactForm: [
    'RESEND_API_KEY',
    'PUBLIC_TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
    'CONTACT_RECIPIENT_EMAIL',
    'RESEND_FROM_EMAIL',
    'CONTACT_HMAC_SECRET',
  ],
  cloudflareDeploy: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
};

function getRuntimeEnv() {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

export function normalizeSiteMode(value = defaultSiteMode) {
  const mode = String(value || defaultSiteMode).trim().toLowerCase();

  if (!siteModes.includes(mode)) {
    throw new Error(`Unsupported site profile mode: ${value}`);
  }

  return mode;
}

export function parseFeatureFlag(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function createSiteProfile({ mode = 'retail', features = {} } = {}) {
  const normalizedMode = normalizeSiteMode(mode);
  const baseFeatures = featureProfiles[normalizedMode];
  const unknownFeatures = Object.keys(features).filter((name) => !featureNames.includes(name));

  if (unknownFeatures.length > 0) {
    throw new Error(`Unsupported site feature override: ${unknownFeatures.join(', ')}.`);
  }

  for (const [featureName, value] of Object.entries(features)) {
    if (typeof value !== 'boolean') {
      throw new Error(`Site feature ${featureName} must be a boolean.`);
    }

    if (
      !['contactForm', 'multilingual'].includes(featureName) &&
      value !== baseFeatures[featureName]
    ) {
      throw new Error(
        `Site feature ${featureName} is fixed by profile ${normalizedMode} and cannot be overridden.`,
      );
    }
  }

  const normalizedFeatures = { ...baseFeatures, ...features };

  return {
    mode: normalizedMode,
    features: normalizedFeatures,
  };
}

/**
 * 校验部署环境中的镜像字段与提交态项目契约一致。
 *
 * 这些变量用于把契约传给 Worker / Hosted Studio，不是第二套生产配置；任何漂移都应失败，
 * 而不是在构建时临时改写 profile 或能力开关。
 */
export function createSiteProfileFromEnv(env = getRuntimeEnv()) {
  const forbiddenOverrideNames = [
    'SITE_MODE',
    'SANITY_STUDIO_SITE_MODE',
    ...Object.keys(env).filter(
      (name) =>
        (name.startsWith('SITE_FEATURE_') || name.startsWith('SANITY_STUDIO_FEATURE_')) &&
        !['SITE_FEATURE_CONTACT_FORM', 'SANITY_STUDIO_FEATURE_CONTACT_FORM'].includes(name),
    ),
  ].filter((name) => env[name] !== undefined && env[name] !== '');

  if (forbiddenOverrideNames.length > 0) {
    throw new Error(
      `Production profile overrides are not supported: ${[...new Set(forbiddenOverrideNames)].join(', ')}.`,
    );
  }

  const configuredModes = [
    ['SITE_PROFILE', env.SITE_PROFILE],
    ['SANITY_STUDIO_SITE_PROFILE', env.SANITY_STUDIO_SITE_PROFILE],
  ].filter(([, value]) => value !== undefined && value !== '');

  for (const [name, value] of configuredModes) {
    const mode = normalizeSiteMode(value);
    if (mode !== defaultSiteMode) {
      throw new Error(`${name}=${value} does not match gcss.project.json profile ${defaultSiteMode}.`);
    }
  }

  const configuredContactFlags = [
    ['SITE_FEATURE_CONTACT_FORM', env.SITE_FEATURE_CONTACT_FORM],
    ['SANITY_STUDIO_FEATURE_CONTACT_FORM', env.SANITY_STUDIO_FEATURE_CONTACT_FORM],
  ].filter(([, value]) => value !== undefined && value !== '');

  for (const [name, value] of configuredContactFlags) {
    const enabled = parseFeatureFlag(value);
    if (enabled === undefined) {
      throw new Error(`${name} must be an explicit boolean.`);
    }
    if (enabled !== projectContract.features.contactForm) {
      throw new Error(
        `${name}=${value} does not match gcss.project.json contactForm=${projectContract.features.contactForm}.`,
      );
    }
  }

  return createSiteProfile({
    mode: defaultSiteMode,
    features: {
      contactForm: projectContract.features.contactForm,
      multilingual: activeLocales.length > 1,
    },
  });
}

/**
 * 仅供单元测试构造不同 profile。生产代码不得读取这些 test-only 字段。
 */
export function createTestSiteProfileFromEnv(env = {}) {
  const mode = normalizeSiteMode(env.GCSS_TEST_SITE_PROFILE ?? defaultSiteMode);
  const contactForm = parseFeatureFlag(env.GCSS_TEST_FEATURE_CONTACT_FORM);
  const multilingual = parseFeatureFlag(env.GCSS_TEST_FEATURE_MULTILINGUAL);

  return createSiteProfile({
    mode,
    features: {
      ...(contactForm === undefined ? {} : { contactForm }),
      ...(multilingual === undefined ? {} : { multilingual }),
    },
  });
}

export const siteProfile = createSiteProfile({
  mode: defaultSiteMode,
  features: {
    contactForm: projectContract.features.contactForm,
    multilingual: activeLocales.length > 1,
  },
});

export function isFeatureEnabled(profile, featureName) {
  return Boolean(profile?.features?.[featureName]);
}

export function getRequiredEnvironmentVariables(profile, { includeCloudflareDeploy = false } = {}) {
  const required = new Set();

  for (const [featureName, variables] of Object.entries(featureEnvironmentRequirements)) {
    if (featureName === 'cloudflareDeploy') {
      if (includeCloudflareDeploy) {
        for (const variable of variables) {
          required.add(variable);
        }
      }

      continue;
    }

    if (isFeatureEnabled(profile, featureName)) {
      for (const variable of variables) {
        required.add(variable);
      }
    }
  }

  return [...required];
}
