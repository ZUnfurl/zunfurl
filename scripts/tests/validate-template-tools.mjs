import { buildNewProjectPlan, parseArgs } from '../template/plan-new-project.mjs';
import {
  renderEnvExample,
  renderReadmeSummary,
  renderWranglerToml,
} from '../template/project-renderers.mjs';
import { scanTemplatePlaceholders } from '../template/validate-template-placeholders.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const parsed = parseArgs([
  '--profile',
  'cms-brand',
  '--project-name',
  'atelier-example',
  '--brand-name',
  'Atelier Example',
  '--domain',
  'https://example.com',
  '--contact-form',
  'false',
  '--legal-pages',
  'privacy-policy,terms-of-use,customer-service-contact',
  '--json',
]);

assert(parsed.profile === 'cms-brand', 'Project init parser must accept --profile.');
assert(parsed.projectName === 'atelier-example', 'Project init parser must accept --project-name.');
assert(parsed.brandName === 'Atelier Example', 'Project init parser must accept --brand-name.');
assert(parsed.domain === 'https://example.com', 'Project init parser must accept --domain.');
assert(parsed.contactForm === false, 'Project init parser must parse --contact-form.');
assert(
  parsed.legalPages === 'privacy-policy,terms-of-use,customer-service-contact',
  'Project init parser must accept an explicit legal page selection.',
);
assert(parsed.json === true, 'Project init parser must accept --json.');

const cmsPlan = buildNewProjectPlan(parsed);

assert(cmsPlan.profile === 'cms-brand', 'B project dry-run must use cms-brand.');
assert(cmsPlan.identity.domain === 'example.com', 'Project init must normalize domains.');
assert(cmsPlan.identity.studioHost === 'atelier-example-studio', 'Project init must derive Studio host.');
assert(cmsPlan.enabledModules.includes('contentCms'), 'B project must enable content CMS.');
assert(cmsPlan.enabledModules.includes('studio'), 'B project must enable Studio.');
assert(!cmsPlan.enabledModules.includes('commerce'), 'B project must not enable commerce.');
assert(!cmsPlan.requiredEnv.includes('SHOPIFY_STORE_DOMAIN'), 'B project must not require Shopify env.');
assert(!cmsPlan.requiredEnv.includes('RESEND_API_KEY'), 'B project with disabled contact form must not require Resend.');
assert(cmsPlan.validation.includes('npm.cmd run test:template'), 'B validation must include template checks.');
assert(
  !cmsPlan.contract.features.legalPages.includes('shipping-returns-policy'),
  'B project must not generate the retail shipping and returns legal route.',
);

const retailPlan = buildNewProjectPlan({
  profile: 'retail',
  projectName: 'retail-example',
  brandName: 'Retail Example',
  domain: 'shop.example.com',
  legalPages: [
    'privacy-policy',
    'terms-of-use',
    'shipping-returns-policy',
    'customer-service-contact',
  ],
});

assert(retailPlan.enabledModules.includes('commerce'), 'C project must retain the internal commerce feature key for compatibility.');
assert(retailPlan.enabledModules.includes('productCms'), 'C project must enable product CMS.');
assert(retailPlan.requiredEnv.includes('SHOPIFY_STORE_DOMAIN'), 'C project must require Shopify Storefront env.');
assert(
  retailPlan.requiredEnv.includes('SANITY_STUDIO_SHOPIFY_STORE_DOMAIN'),
  'C project must require Studio Shopify env.',
);
assert(retailPlan.requiredEnv.includes('RESEND_API_KEY'), 'C project must require Contact env by default.');
assert(retailPlan.requiredEnv.includes('PUBLIC_TURNSTILE_SITE_KEY'), 'C project must require Turnstile site key.');
assert(retailPlan.requiredEnv.includes('RESEND_FROM_EMAIL'), 'C project must require Resend sender.');
assert(
  retailPlan.contract.features.legalPages.includes('shipping-returns-policy'),
  'C project must generate the shipping policy only when the contract selects it explicitly.',
);

const retailReadmeSummary = renderReadmeSummary(retailPlan.contract);
const retailEnvExample = renderEnvExample(retailPlan.contract);
assert(
  retailReadmeSummary.includes('C 零售目录与内容运营基础框架 / C Retail Catalog & Content Foundation'),
  'C generated README summary must use the approved public positioning.',
);
assert(
  retailReadmeSummary.includes('Shopify 只读目录映射：启用'),
  'C generated README summary must describe Shopify as read-only catalog mapping.',
);
assert(!retailReadmeSummary.includes('品牌零售独立站'), 'C generated README summary must not imply a full retail store.');
assert(
  retailEnvExample.includes('Shopify Storefront API 只读目录映射；不包含交易能力'),
  'C generated env guidance must preserve the catalog-only Shopify boundary.',
);

const staticPlan = buildNewProjectPlan({
  profile: 'static-brand',
  projectName: 'static-example',
  brandName: 'Static Example',
  contactForm: true,
  domain: 'static.example.com',
});

assert(staticPlan.profile === 'static-brand', 'A project dry-run must use static-brand.');
assert(staticPlan.enabledModules.includes('contactForm'), 'A project can explicitly enable contact form.');
assert(staticPlan.requiredEnv.includes('RESEND_API_KEY'), 'A project with contact form must require Resend.');
assert(!staticPlan.requiredEnv.some((name) => name.startsWith('SANITY_')), 'A project must not require Sanity env.');

const staticNoContactPlan = buildNewProjectPlan({
  profile: 'static-brand',
  projectName: 'static-no-contact',
  brandName: 'Static No Contact',
  contactForm: false,
  domain: 'static-no-contact.example.com',
});
const a1Wrangler = renderWranglerToml(staticNoContactPlan.contract);
const a2Wrangler = renderWranglerToml(staticPlan.contract);
const bWrangler = renderWranglerToml(cmsPlan.contract);
const cWrangler = renderWranglerToml(retailPlan.contract);

assert(!a1Wrangler.includes('GCSS_COORDINATOR'), 'A1 must omit the coordinator binding and migration.');
for (const [variant, wrangler] of [['A2', a2Wrangler], ['B', bWrangler], ['C', cWrangler]]) {
  assert(wrangler.includes('name = "GCSS_COORDINATOR"'), `${variant} must render the coordinator binding.`);
  assert(wrangler.includes('class_name = "GcssCoordinator"'), `${variant} must bind GcssCoordinator.`);
  assert(
    wrangler.includes('new_sqlite_classes = ["GcssCoordinator"]'),
    `${variant} must render the SQLite Durable Object migration.`,
  );
  assert(!wrangler.includes('CONTACT_RATE_LIMIT_KV'), `${variant} must not use eventually consistent KV counters.`);
}

try {
  buildNewProjectPlan({
    profile: 'cms-brand',
    projectName: 'Bad_Name',
    brandName: 'Bad Name',
    domain: 'example.com',
  });
  throw new Error('Expected invalid project name guard to throw.');
} catch (error) {
  assert(error.message.includes('lowercase kebab-case'), 'Project name guard must require kebab-case.');
}

const placeholderScan = await scanTemplatePlaceholders();

assert(placeholderScan.forbiddenHits.length === 0, 'Template must not contain forbidden legacy client terms.');

console.log('Template tools OK: new project dry-run and placeholder scanning validated.');
