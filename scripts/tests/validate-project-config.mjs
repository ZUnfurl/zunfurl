import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  activeLocales,
  brandName,
  defaultContentSource,
  defaultLocale,
  defaultSiteMode,
  frameworkVersion,
  projectConfig,
  projectName,
  siteUrl,
} from '../../packages/config/src/index.mjs';
import {
  createProjectConfig,
  getProjectFeatureFlags,
  getProjectVariant,
  loadProjectConfig,
  semverPattern,
  validateProjectConfig,
} from '../template/project-config.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const loaded = await loadProjectConfig();
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const projectSchema = JSON.parse(await readFile('gcss.project.schema.json', 'utf8'));
const validateAgainstJsonSchema = new Ajv2020({ allErrors: true, strict: true }).compile(projectSchema);

assert(JSON.stringify(loaded) === JSON.stringify(projectConfig), 'Runtime config must match gcss.project.json.');
assert(packageJson.version === frameworkVersion, 'Root package version must match frameworkVersion.');
assert(projectName === loaded.identity.projectName, 'projectName must come from the project contract.');
assert(brandName === loaded.identity.brandName, 'brandName must come from the project contract.');
assert(siteUrl === `https://${loaded.identity.domain}`, 'siteUrl must come from the project domain.');
assert(defaultSiteMode === loaded.delivery.profile, 'default profile must come from the project contract.');
assert(defaultContentSource === loaded.delivery.contentSource, 'content source must come from the project contract.');
assert(defaultLocale === loaded.delivery.defaultLocale, 'default locale must come from the project contract.');
assert(JSON.stringify(activeLocales) === JSON.stringify(loaded.delivery.locales), 'active locales must come from the project contract.');
assert(
  JSON.stringify(loaded.features.legalPages) === JSON.stringify(projectConfig.features.legalPages),
  'Enabled legal routes must come from the project contract.',
);
assert(validateAgainstJsonSchema(loaded), 'Committed project config must pass gcss.project.schema.json.');

const a1 = createProjectConfig({
  brandName: 'Static Example',
  contactForm: false,
  domain: 'static.example.test',
  frameworkVersion,
  githubRepository: 'example/static-site',
  locales: ['en'],
  profile: 'static-brand',
  projectName: 'static-site',
});
assert(getProjectVariant(a1) === 'A1', 'static-brand without Contact must map to A1.');
assert(getProjectFeatureFlags(a1).studio === false, 'A1 must not enable Studio.');

const a2 = validateProjectConfig({
  ...a1,
  features: { ...a1.features, contactForm: true },
});
assert(getProjectVariant(a2) === 'A2', 'static-brand with Contact must map to A2.');

const b = createProjectConfig({
  brandName: 'CMS Example',
  domain: 'cms.example.test',
  frameworkVersion,
  githubRepository: 'example/cms-site',
  profile: 'cms-brand',
  projectName: 'cms-site',
});
assert(getProjectVariant(b) === 'B' && getProjectFeatureFlags(b).commerce === false, 'cms-brand must map to B without commerce.');
assert(b.delivery.contentSource === 'sanity', 'The default B initializer contract must use Sanity content.');

const c = createProjectConfig({
  brandName: 'Retail Example',
  domain: 'shop.example.test',
  frameworkVersion,
  githubRepository: 'example/retail-site',
  profile: 'retail',
  projectName: 'retail-site',
  legalPages: [
    'privacy-policy',
    'terms-of-use',
    'shipping-returns-policy',
    'customer-service-contact',
  ],
});
assert(getProjectVariant(c) === 'C' && getProjectFeatureFlags(c).commerce === true, 'retail must map to C with commerce.');
assert(c.delivery.contentSource === 'sanity', 'The default C initializer contract must use Sanity content.');
assert(validateAgainstJsonSchema(c), 'A valid C contract with an explicitly selected shipping policy must pass JSON Schema.');

for (const candidate of [
  '0.3.0-preview.1',
  '1.0.0',
  '1.0.0-alpha',
  '1.0.0-0.3.7',
  '1.0.0-preview.1+build.20260815',
]) {
  assert(semverPattern.test(candidate), `JS SemVer validator must accept ${candidate}.`);
  const contract = { ...a1, frameworkVersion: candidate };
  assert(validateAgainstJsonSchema(contract), `JSON Schema SemVer validator must accept ${candidate}.`);
  assert(validateProjectConfig(contract).frameworkVersion === candidate, `Project validator must preserve ${candidate}.`);
}

for (const candidate of [
  '0.3',
  '01.0.0',
  '1.0.0-preview.01',
  '1.0.0-',
  '1.0.0+build..1',
  'v1.0.0',
]) {
  assert(!semverPattern.test(candidate), `JS SemVer validator must reject ${candidate}.`);
  const contract = { ...a1, frameworkVersion: candidate };
  assert(!validateAgainstJsonSchema(contract), `JSON Schema SemVer validator must reject ${candidate}.`);
  try {
    validateProjectConfig(contract);
    throw new Error(`Expected project validator to reject ${candidate}.`);
  } catch (error) {
    assert(
      error.message.includes('SemVer 2.0.0'),
      `Project validator must fail ${candidate} with an explicit SemVer message.`,
    );
  }
}

try {
  createProjectConfig({
    brandName: 'Invalid',
    contentSource: 'sanity',
    domain: 'invalid.example.test',
    githubRepository: 'example/invalid',
    profile: 'static-brand',
    projectName: 'invalid-site',
  });
  throw new Error('Expected static Sanity source validation to fail.');
} catch (error) {
  assert(error.message.includes('must use local content'), 'A profile must reject Sanity content source.');
}

function mutated(config, mutate) {
  const copy = structuredClone(config);
  mutate(copy);
  return copy;
}

const invalidContracts = [
  ['unknown top-level property', mutated(a1, (config) => { config.unexpected = true; })],
  ['unknown nested feature', mutated(a1, (config) => { config.features.commerce = true; })],
  ['unknown deployment property', mutated(a1, (config) => { config.deployment.legacyKvId = ''; })],
  ['static profile with Sanity source', mutated(a1, (config) => { config.delivery.contentSource = 'sanity'; })],
  [
    'B profile with retail shipping policy',
    mutated(b, (config) => { config.features.legalPages.push('shipping-returns-policy'); }),
  ],
  [
    'Contact without privacy policy',
    mutated(a2, (config) => { config.features.legalPages = ['terms-of-use']; }),
  ],
  [
    'default locale outside active locales',
    mutated(b, (config) => { config.delivery.defaultLocale = 'fr'; config.delivery.locales = ['en']; }),
  ],
  [
    'duplicate legal page',
    mutated(a1, (config) => { config.features.legalPages.push(config.features.legalPages[0]); }),
  ],
  ['missing legalPages', mutated(a1, (config) => { delete config.features.legalPages; })],
];

for (const [label, contract] of invalidContracts) {
  const schemaAccepted = validateAgainstJsonSchema(contract);
  let jsAccepted = true;

  try {
    validateProjectConfig(contract);
  } catch {
    jsAccepted = false;
  }

  assert(schemaAccepted === false, `JSON Schema must reject ${label}.`);
  assert(jsAccepted === false, `JS validator must reject ${label}.`);
}

console.log('Project contract OK: JS and JSON Schema fail closed on unknown fields and invalid profile/content/legal combinations.');
