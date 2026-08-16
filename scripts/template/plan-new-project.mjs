import { pathToFileURL } from 'node:url';
import {
  createSiteProfile,
  getRequiredEnvironmentVariables,
} from '../../packages/config/src/index.mjs';
import {
  createProjectConfig,
  getProjectFeatureFlags,
  getProjectVariant,
  loadProjectConfig,
  validateProjectConfig,
} from './project-config.mjs';

const defaultOptions = {
  config: undefined,
  contactForm: undefined,
  contentSource: undefined,
  defaultLocale: undefined,
  domain: undefined,
  githubRepository: undefined,
  json: false,
  legalPages: undefined,
  locales: undefined,
  profile: 'cms-brand',
  projectName: undefined,
  brandName: undefined,
};

const validationByProfile = {
  'static-brand': ['npm.cmd run test:project-config', 'npm.cmd run test:profiles', 'npm.cmd run build'],
  'cms-brand': [
    'npm.cmd run test:project-config',
    'npm.cmd run test:profiles',
    'npm.cmd run test:template',
    'npm.cmd run studio:build',
    'npm.cmd run build',
  ],
  retail: [
    'npm.cmd run test:project-config',
    'npm.cmd run test:profiles',
    'npm.cmd run test:template',
    'npm.cmd run test:commerce',
    'npm.cmd run test:sanity',
    'npm.cmd run test:worker',
    'npm.cmd run studio:build',
    'npm.cmd run build',
  ],
};

function parseBoolean(value, name) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean for ${name}: ${value}. Use true or false.`);
}

function readFlagValue(argv, index, name) {
  const inline = argv[index].match(/^--[^=]+=(.*)$/);
  if (inline) return { value: inline[1], nextIndex: index };
  if (index + 1 >= argv.length) throw new Error(`Missing value for ${name}.`);
  return { value: argv[index + 1], nextIndex: index + 1 };
}

export function parseArgs(argv = []) {
  const options = { ...defaultOptions };
  const valueFlags = new Map([
    ['--config', 'config'],
    ['--profile', 'profile'],
    ['--project-name', 'projectName'],
    ['--brand-name', 'brandName'],
    ['--domain', 'domain'],
    ['--content-source', 'contentSource'],
    ['--default-locale', 'defaultLocale'],
    ['--locales', 'locales'],
    ['--legal-pages', 'legalPages'],
    ['--github-repository', 'githubRepository'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    const flag = [...valueFlags.keys()].find((candidate) => arg === candidate || arg.startsWith(`${candidate}=`));
    if (flag) {
      const parsed = readFlagValue(argv, index, flag);
      options[valueFlags.get(flag)] = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === '--contact-form' || arg.startsWith('--contact-form=')) {
      const parsed = readFlagValue(argv, index, '--contact-form');
      options.contactForm = parseBoolean(parsed.value, '--contact-form');
      index = parsed.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function moduleList(profile, enabled) {
  return Object.entries(profile.features)
    .filter(([, value]) => Boolean(value) === enabled)
    .map(([name]) => name)
    .sort();
}

function docsForProfile(mode) {
  if (mode === 'static-brand') return ['docs/customer-operations-static-brand.md'];
  if (mode === 'cms-brand') {
    return [
      'docs/customer-operations-cms-brand.md',
      'docs/customer-page-operations.md',
      'docs/contact-lightweight-form-design.md',
    ];
  }
  return [
    'docs/customer-operations-retail.md',
    'docs/customer-page-operations.md',
    'docs/customer-product-operations.md',
    'docs/contact-lightweight-form-design.md',
  ];
}

export function buildNewProjectPlan(rawOptions = {}) {
  const contract = rawOptions.projectConfig
    ? validateProjectConfig(rawOptions.projectConfig)
    : createProjectConfig(rawOptions);
  const profile = createSiteProfile({
    mode: contract.delivery.profile,
    features: getProjectFeatureFlags(contract),
  });
  const requiredEnv = getRequiredEnvironmentVariables(profile);
  const deployEnv = getRequiredEnvironmentVariables(profile, { includeCloudflareDeploy: true })
    .filter((name) => !requiredEnv.includes(name));

  return {
    ok: true,
    mode: 'dry-run',
    variant: getProjectVariant(contract),
    profile: profile.mode,
    contract,
    identity: {
      ...contract.identity,
      siteUrl: `https://${contract.identity.domain}`,
      studioHost: contract.deployment.studioHost,
      workerName: contract.deployment.workerName,
    },
    enabledModules: moduleList(profile, true),
    disabledModules: moduleList(profile, false),
    requiredEnv,
    deployEnv,
    customerDocs: docsForProfile(profile.mode),
    nextActions: [
      'run npm.cmd run init:project -- --config <file> --write in a clean template checkout',
      'replace legal placeholders, brand copy, and visual assets',
      'provision only the services required by the selected profile',
      'run npm.cmd run project:scan before deployment',
    ],
    validation: validationByProfile[profile.mode],
  };
}

function printTextPlan(plan) {
  console.log(`New project dry-run: ${plan.identity.projectName}`);
  console.log(`Delivery: ${plan.variant} / ${plan.profile}`);
  console.log(`Brand: ${plan.identity.brandName}`);
  console.log(`Domain: ${plan.identity.domain}`);
  console.log(`Content source: ${plan.contract.delivery.contentSource}`);
  console.log(`Locales: ${plan.contract.delivery.locales.join(', ')}`);
  console.log(`Contact form: ${plan.contract.features.contactForm ? 'enabled' : 'disabled'}`);
  console.log(`Legal pages: ${plan.contract.features.legalPages.join(', ') || '(none)'}`);
  console.log(`Studio host: ${plan.identity.studioHost}`);
  console.log(`Worker name: ${plan.identity.workerName}`);
  console.log(`Required env: ${plan.requiredEnv.join(', ') || '(none)'}`);
  console.log('Validation:');
  for (const command of plan.validation) console.log(`- ${command}`);
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const projectConfig = options.config ? await loadProjectConfig(options.config) : undefined;
  const plan = buildNewProjectPlan({ ...options, projectConfig });

  if (options.json) console.log(JSON.stringify(plan, null, 2));
  else printTextPlan(plan);
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
