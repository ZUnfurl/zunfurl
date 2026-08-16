import {
  createSiteProfile,
  createSiteProfileFromEnv,
  createTestSiteProfileFromEnv,
  defaultSiteMode,
  featureEnvironmentRequirements,
  featureNames,
  featureProfiles,
  getRequiredEnvironmentVariables,
  normalizeSiteMode,
  parseFeatureFlag,
  siteModes,
  siteProfile,
} from '../../packages/config/src/index.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseModeArg(argv) {
  const modeArg = argv.find((value) => value.startsWith('--mode='));

  if (modeArg) {
    return modeArg.slice('--mode='.length);
  }

  const modeFlagIndex = argv.indexOf('--mode');

  if (modeFlagIndex >= 0) {
    return argv[modeFlagIndex + 1];
  }

  return undefined;
}

const selectedMode = parseModeArg(process.argv.slice(2));
const modesToValidate = selectedMode ? [selectedMode] : [...siteModes];
assert(
  createSiteProfileFromEnv({}).mode === defaultSiteMode,
  'Empty production env must use the committed project profile.',
);
assert(
  siteProfile.mode === defaultSiteMode,
  'Runtime siteProfile must come from gcss.project.json instead of an environment override.',
);
assert(
  parseFeatureFlag('true') === true && parseFeatureFlag('0') === false,
  'Feature flag parser must support common boolean env values.',
);
assert(
  createSiteProfileFromEnv({ SITE_PROFILE: defaultSiteMode }).mode === defaultSiteMode,
  'A matching SITE_PROFILE deployment mirror must validate.',
);
assert(
  createTestSiteProfileFromEnv({ GCSS_TEST_SITE_PROFILE: 'static-brand' }).mode === 'static-brand',
  'Tests must use the explicit GCSS_TEST_* profile constructor.',
);
assert(
  createTestSiteProfileFromEnv({
    GCSS_TEST_SITE_PROFILE: 'static-brand',
    GCSS_TEST_FEATURE_CONTACT_FORM: 'true',
  }).features.contactForm === true,
  'The test-only constructor must support the A2 Contact variant.',
);

for (const [env, message] of [
  [{ SITE_MODE: 'static-brand' }, 'legacy SITE_MODE'],
  [{ SITE_FEATURE_COMMERCE: 'true' }, 'arbitrary production feature override'],
  [
    { SITE_PROFILE: defaultSiteMode === 'retail' ? 'cms-brand' : 'retail' },
    'profile mirror drift',
  ],
]) {
  try {
    createSiteProfileFromEnv(env);
    throw new Error(`Expected ${message} to fail.`);
  } catch (error) {
    assert(
      /not supported|does not match/.test(error.message),
      `${message} must fail closed instead of changing the production profile.`,
    );
  }
}

try {
  createSiteProfile({ mode: 'cms-brand', features: { commerce: true } });
  throw new Error('Expected fixed profile feature override to fail.');
} catch (error) {
  assert(
    error.message.includes('fixed by profile cms-brand'),
    'Profile-defined capabilities must not be enabled through a feature override.',
  );
}

for (const featureName of featureNames) {
  assert(
    Object.prototype.hasOwnProperty.call(siteProfile.features, featureName),
    `siteProfile.features must include ${featureName}.`,
  );
}

for (const mode of modesToValidate) {
  assert(siteModes.includes(mode), `Unsupported test profile mode: ${mode}`);

  const profile = createSiteProfile({ mode });
  const requiredEnv = getRequiredEnvironmentVariables(profile);
  const deployEnv = getRequiredEnvironmentVariables(profile, { includeCloudflareDeploy: true });

  for (const featureName of featureNames) {
    assert(
      typeof profile.features[featureName] === 'boolean',
      `${mode}.${featureName} must be a boolean feature flag.`,
    );
  }

  assert(
    profile.features.localImageFallback === true,
    `${mode} must keep local image fallback available as an administrator fallback.`,
  );

  assert(
    deployEnv.includes('CLOUDFLARE_ACCOUNT_ID') && deployEnv.includes('CLOUDFLARE_API_TOKEN'),
    `${mode} deploy checks must require Cloudflare deploy credentials when deployment validation is requested.`,
  );

  if (mode === 'static-brand') {
    assert(profile.features.contentCms === false, 'static-brand must not enable content CMS by default.');
    assert(profile.features.studio === false, 'static-brand must not deploy Studio by default.');
    assert(profile.features.commerce === false, 'static-brand must not enable commerce.');
    assert(profile.features.productCms === false, 'static-brand must not enable product CMS.');
    assert(profile.features.contactForm === false, 'static-brand must model A1 by default without real form API.');
    assert(!requiredEnv.some((name) => name.startsWith('SANITY_')), 'static-brand must not require Sanity env.');
    assert(!requiredEnv.some((name) => name.startsWith('SHOPIFY_')), 'static-brand must not require Shopify env.');
    assert(!requiredEnv.includes('RESEND_API_KEY'), 'static-brand A1 must not require Resend.');

    const staticWithForm = createSiteProfile({
      mode: 'static-brand',
      features: { contactForm: true },
    });
    const staticWithFormEnv = getRequiredEnvironmentVariables(staticWithForm);

    assert(
      staticWithFormEnv.includes('RESEND_API_KEY') &&
        staticWithFormEnv.includes('PUBLIC_TURNSTILE_SITE_KEY') &&
        staticWithFormEnv.includes('TURNSTILE_SECRET_KEY') &&
        staticWithFormEnv.includes('RESEND_FROM_EMAIL') &&
        staticWithFormEnv.includes('CONTACT_HMAC_SECRET'),
      'static-brand with contactForm override must require lightweight form env.',
    );
  }

  if (mode === 'cms-brand') {
    assert(profile.features.contentCms === true, 'cms-brand must enable content CMS.');
    assert(profile.features.studio === true, 'cms-brand must enable Studio.');
    assert(profile.features.sanityImageCdn === true, 'cms-brand must enable Sanity Image CDN.');
    assert(profile.features.commerce === false, 'cms-brand must not enable commerce.');
    assert(profile.features.productCms === false, 'cms-brand must not enable product CMS.');
    assert(requiredEnv.includes('SANITY_PROJECT_ID'), 'cms-brand must require Sanity build env.');
    assert(requiredEnv.includes('SANITY_STUDIO_PROJECT_ID'), 'cms-brand must require Studio env.');
    assert(!requiredEnv.includes('SHOPIFY_STORE_DOMAIN'), 'cms-brand must not require Shopify Storefront env.');
    assert(
      !requiredEnv.includes('SANITY_STUDIO_SHOPIFY_STORE_DOMAIN'),
      'cms-brand must not require Studio Shopify env.',
    );

    const cmsWithoutForm = createSiteProfile({
      mode: 'cms-brand',
      features: { contactForm: false },
    });
    const cmsWithoutFormEnv = getRequiredEnvironmentVariables(cmsWithoutForm);

    assert(!cmsWithoutFormEnv.includes('RESEND_API_KEY'), 'cms-brand can disable contact form env requirements.');
  }

  if (mode === 'retail') {
    assert(profile.features.contentCms === true, 'retail must enable content CMS.');
    assert(profile.features.studio === true, 'retail must enable Studio.');
    assert(profile.features.commerce === true, 'retail must enable commerce.');
    assert(profile.features.productCms === true, 'retail must enable product CMS.');
    assert(profile.features.contactForm === true, 'retail must enable contact form by default.');
    assert(requiredEnv.includes('SANITY_PROJECT_ID'), 'retail must require Sanity build env.');
    assert(requiredEnv.includes('SANITY_STUDIO_PROJECT_ID'), 'retail must require Studio env.');
    assert(requiredEnv.includes('SHOPIFY_STORE_DOMAIN'), 'retail must require Shopify Storefront env.');
    assert(
      requiredEnv.includes('SANITY_STUDIO_SHOPIFY_STORE_DOMAIN'),
      'retail must require Studio Shopify env for product launch.',
    );
    assert(requiredEnv.includes('RESEND_API_KEY'), 'retail must require contact form env by default.');
  }
}

for (const featureName of ['contentCms', 'studio', 'commerce', 'productCms', 'contactForm', 'cloudflareDeploy']) {
  assert(
    Array.isArray(featureEnvironmentRequirements[featureName]),
    `featureEnvironmentRequirements must define ${featureName}.`,
  );
}

assert(
  featureProfiles.retail.commerce === true && featureProfiles['cms-brand'].commerce === false,
  'Feature profiles must keep commerce exclusive to retail by default.',
);

console.log(`Site profile boundaries OK: ${modesToValidate.join(', ')}.`);
