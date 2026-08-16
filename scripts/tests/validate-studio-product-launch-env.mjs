import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../../apps/studio/src/productLaunch/shopify.ts', import.meta.url);
const deployWorkflowUrl = new URL('../../.github/workflows/deploy.yml', import.meta.url);
const packageJsonUrl = new URL('../../package.json', import.meta.url);
const studioEnvRunnerUrl = new URL('../studio/run-with-env.mjs', import.meta.url);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const source = await readFile(sourceUrl, 'utf8');
const deployWorkflow = await readFile(deployWorkflowUrl, 'utf8');
const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
const studioEnvRunner = await readFile(studioEnvRunnerUrl, 'utf8');

assert(
  !source.includes('process.env['),
  'Studio product launch config must not use dynamic process.env access because production bundles cannot inline it.',
);
assert(
  source.includes('process.env.SANITY_STUDIO_SHOPIFY_STORE_DOMAIN'),
  'Studio product launch config must statically read SANITY_STUDIO_SHOPIFY_STORE_DOMAIN.',
);
assert(
  source.includes('process.env.SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN'),
  'Studio product launch config must statically read SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN.',
);
assert(
  source.includes('process.env.SANITY_STUDIO_SHOPIFY_STOREFRONT_API_VERSION'),
  'Studio product launch config must statically read SANITY_STUDIO_SHOPIFY_STOREFRONT_API_VERSION.',
);
assert(
  source.includes('process.env.SHOPIFY_STORE_DOMAIN'),
  'Studio product launch config must statically fall back to SHOPIFY_STORE_DOMAIN.',
);
assert(
  source.includes('process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN'),
  'Studio product launch config must statically fall back to SHOPIFY_STOREFRONT_ACCESS_TOKEN.',
);
assert(
  deployWorkflow.includes('SANITY_STUDIO_SHOPIFY_STORE_DOMAIN: ${{ secrets.SHOPIFY_STORE_DOMAIN }}'),
  'deploy.yml must expose Shopify store domain to the Studio build via SANITY_STUDIO_SHOPIFY_STORE_DOMAIN.',
);
assert(
  deployWorkflow.includes(
    'SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN: ${{ secrets.SHOPIFY_STOREFRONT_ACCESS_TOKEN }}',
  ),
  'deploy.yml must expose Storefront token to the Studio build via SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN.',
);
assert(
  packageJson.scripts['studio:build'] === 'node ./scripts/studio/run-with-env.mjs build',
  'Root studio:build must run through the env alias wrapper.',
);
assert(
  packageJson.scripts['studio:deploy'] === 'node ./scripts/studio/run-with-env.mjs deploy',
  'Root studio:deploy must run through the env alias wrapper.',
);
assert(
  studioEnvRunner.includes("aliasEnv('SANITY_STUDIO_SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STORE_DOMAIN')"),
  'Studio env wrapper must alias SHOPIFY_STORE_DOMAIN for local Studio builds.',
);
assert(
  studioEnvRunner.includes(
    "aliasEnv('SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'SHOPIFY_STOREFRONT_ACCESS_TOKEN')",
  ),
  'Studio env wrapper must alias SHOPIFY_STOREFRONT_ACCESS_TOKEN for local Studio builds.',
);
assert(
  studioEnvRunner.includes("!name.includes('=')"),
  'Studio env wrapper must filter Windows pseudo environment variables before spawning npm.',
);

console.log('Studio product launch env OK: Storefront config is statically bundled for Hosted Studio.');
