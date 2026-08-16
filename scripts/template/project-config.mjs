import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const projectSchemaVersion = 1;
export const supportedProfiles = ['static-brand', 'cms-brand', 'retail'];
export const supportedLocales = ['en', 'fr', 'zh-cn'];
export const supportedContentSources = ['local', 'sanity'];
export const supportedLegalPages = [
  'privacy-policy',
  'terms-of-use',
  'shipping-returns-policy',
  'customer-service-contact',
];

const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const semverPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPlainObject(value, pathLabel) {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${pathLabel} must be an object.`,
  );
}

function assertExactKeys(value, { optional = [], pathLabel, required }) {
  assertPlainObject(value, pathLabel);
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));

  assert(unknown.length === 0, `${pathLabel} contains unsupported properties: ${unknown.join(', ')}.`);
  assert(missing.length === 0, `${pathLabel} is missing required properties: ${missing.join(', ')}.`);
}

export function normalizeDomain(value) {
  const domain = String(value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

  assert(domain && !domain.includes('/'), `Invalid project domain: ${value || '<empty>'}.`);
  assert(domainPattern.test(domain), `Invalid project domain: ${value}.`);
  return domain.toLowerCase();
}

export function normalizeLocales(locales) {
  const values = Array.isArray(locales)
    ? locales
    : String(locales ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
  const unique = [...new Set(values)];

  assert(unique.length > 0, 'At least one locale is required.');
  for (const locale of unique) {
    assert(supportedLocales.includes(locale), `Unsupported locale: ${locale}.`);
  }

  return unique;
}

export function normalizeLegalPages(legalPages) {
  const values = Array.isArray(legalPages)
    ? legalPages
    : String(legalPages ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
  const unique = [...new Set(values)];

  assert(unique.length === values.length, 'features.legalPages must not contain duplicates.');
  for (const legalPage of unique) {
    assert(supportedLegalPages.includes(legalPage), `Unsupported legal page: ${legalPage}.`);
  }

  return unique;
}

export function validateProjectConfig(rawConfig) {
  assertExactKeys(rawConfig, {
    pathLabel: 'Project config',
    required: [
      'schemaVersion',
      'frameworkVersion',
      'templateMode',
      'identity',
      'delivery',
      'features',
      'deployment',
    ],
    optional: ['$schema'],
  });
  if (rawConfig.$schema !== undefined) {
    assert(typeof rawConfig.$schema === 'string', '$schema must be a string.');
  }
  assert(rawConfig.schemaVersion === projectSchemaVersion, `Unsupported project schemaVersion: ${rawConfig.schemaVersion}.`);
  assert(
    typeof rawConfig.frameworkVersion === 'string' && semverPattern.test(rawConfig.frameworkVersion),
    'frameworkVersion must use complete SemVer 2.0.0 syntax.',
  );
  assert(typeof rawConfig.templateMode === 'boolean', 'templateMode must be a boolean.');

  const identity = rawConfig.identity;
  assertExactKeys(identity, {
    pathLabel: 'identity',
    required: ['projectName', 'brandName', 'domain'],
  });
  assert(typeof identity.projectName === 'string' && kebabCasePattern.test(identity.projectName), 'identity.projectName must use lowercase kebab-case.');
  assert(
    typeof identity.brandName === 'string' &&
      identity.brandName.length >= 2 &&
      identity.brandName === identity.brandName.trim(),
    'identity.brandName must contain at least two characters without surrounding whitespace.',
  );
  assert(
    typeof identity.domain === 'string' && identity.domain === normalizeDomain(identity.domain),
    'identity.domain must be a canonical lowercase hostname without a protocol or path.',
  );

  const delivery = rawConfig.delivery;
  assertExactKeys(delivery, {
    pathLabel: 'delivery',
    required: ['profile', 'contentSource', 'defaultLocale', 'locales'],
  });
  assert(supportedProfiles.includes(delivery.profile), `Unsupported delivery.profile: ${delivery.profile}.`);
  assert(supportedContentSources.includes(delivery.contentSource), `Unsupported delivery.contentSource: ${delivery.contentSource}.`);
  assert(Array.isArray(delivery.locales), 'delivery.locales must be an array.');
  const locales = [...delivery.locales];
  assert(locales.length > 0, 'At least one locale is required.');
  assert(new Set(locales).size === locales.length, 'delivery.locales must not contain duplicates.');
  for (const locale of locales) {
    assert(supportedLocales.includes(locale), `Unsupported locale: ${locale}.`);
  }
  assert(locales.includes(delivery.defaultLocale), 'delivery.defaultLocale must be included in delivery.locales.');
  assert(
    delivery.profile !== 'static-brand' || delivery.contentSource === 'local',
    'static-brand projects must use local content.',
  );

  const features = rawConfig.features;
  assertExactKeys(features, {
    pathLabel: 'features',
    required: ['contactForm', 'legalPages'],
  });
  assert(typeof features.contactForm === 'boolean', 'features.contactForm must be a boolean.');
  assert(Array.isArray(features.legalPages), 'features.legalPages must be an array.');
  const legalPages = normalizeLegalPages(features.legalPages);
  assert(
    !features.contactForm || legalPages.includes('privacy-policy'),
    'Contact-enabled projects must include privacy-policy in features.legalPages.',
  );
  assert(
    delivery.profile === 'retail' || !legalPages.includes('shipping-returns-policy'),
    'shipping-returns-policy is only allowed for the retail profile.',
  );

  const deployment = rawConfig.deployment;
  assertExactKeys(deployment, {
    pathLabel: 'deployment',
    required: ['workerName', 'studioHost', 'githubRepository'],
  });
  assert(typeof deployment.workerName === 'string' && kebabCasePattern.test(deployment.workerName), 'deployment.workerName must use lowercase kebab-case.');
  assert(typeof deployment.studioHost === 'string' && kebabCasePattern.test(deployment.studioHost), 'deployment.studioHost must use lowercase kebab-case.');
  assert(typeof deployment.githubRepository === 'string' && repositoryPattern.test(deployment.githubRepository), 'deployment.githubRepository must use owner/repository.');

  return {
    $schema: rawConfig.$schema ?? './gcss.project.schema.json',
    schemaVersion: projectSchemaVersion,
    frameworkVersion: rawConfig.frameworkVersion,
    templateMode: rawConfig.templateMode,
    identity: {
      projectName: identity.projectName,
      brandName: identity.brandName,
      domain: identity.domain,
    },
    delivery: {
      profile: delivery.profile,
      contentSource: delivery.contentSource,
      defaultLocale: delivery.defaultLocale,
      locales,
    },
    features: {
      contactForm: features.contactForm,
      legalPages,
    },
    deployment: {
      workerName: deployment.workerName,
      studioHost: deployment.studioHost,
      githubRepository: deployment.githubRepository,
    },
  };
}

export function createProjectConfig(options) {
  const projectName = String(options.projectName ?? '').trim();
  const profile = options.profile ?? 'cms-brand';
  const locales = normalizeLocales(options.locales ?? ['en', 'fr', 'zh-cn']);
  const defaultLocale = options.defaultLocale ?? locales[0];
  const contentSource = options.contentSource ?? (profile === 'static-brand' ? 'local' : 'sanity');
  const contactForm = options.contactForm ?? profile !== 'static-brand';
  const legalPages = normalizeLegalPages(
    options.legalPages ?? ['privacy-policy', 'terms-of-use', 'customer-service-contact'],
  );

  return validateProjectConfig({
    $schema: './gcss.project.schema.json',
    schemaVersion: projectSchemaVersion,
    frameworkVersion: options.frameworkVersion ?? '0.3.0-preview.1',
    templateMode: options.templateMode ?? false,
    identity: {
      projectName,
      brandName: String(options.brandName ?? '').trim(),
      domain: normalizeDomain(options.domain),
    },
    delivery: {
      profile,
      contentSource,
      defaultLocale,
      locales,
    },
    features: {
      contactForm,
      legalPages,
    },
    deployment: {
      workerName: options.workerName ?? projectName,
      studioHost: options.studioHost ?? `${projectName}-studio`,
      githubRepository: options.githubRepository ?? `owner/${projectName}`,
    },
  });
}

export async function loadProjectConfig(filePath = 'gcss.project.json') {
  const absolutePath = path.resolve(filePath);
  const content = await readFile(absolutePath, 'utf8');
  return validateProjectConfig(JSON.parse(content));
}

export function getProjectVariant(config) {
  if (config.delivery.profile === 'static-brand') {
    return config.features.contactForm ? 'A2' : 'A1';
  }

  return config.delivery.profile === 'cms-brand' ? 'B' : 'C';
}

export function getProjectFeatureFlags(config) {
  const profileFeatures = {
    'static-brand': {
      contentCms: false,
      commerce: false,
      productCms: false,
      studio: false,
      sanityImageCdn: false,
    },
    'cms-brand': {
      contentCms: true,
      commerce: false,
      productCms: false,
      studio: true,
      sanityImageCdn: true,
    },
    retail: {
      contentCms: true,
      commerce: true,
      productCms: true,
      studio: true,
      sanityImageCdn: true,
    },
  }[config.delivery.profile];

  return {
    ...profileFeatures,
    contactForm: config.features.contactForm,
    localImageFallback: true,
    multilingual: config.delivery.locales.length > 1,
  };
}
