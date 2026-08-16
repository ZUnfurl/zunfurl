import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8'));
}

async function readRepo(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const [rootPackage, storefrontPackage, workerPackage, workerTsconfig, workerVitestConfig, workerTestWrangler, previewWorkflow, deployWorkflow] =
  await Promise.all([
    readJson('package.json'),
    readJson('apps/storefront/package.json'),
    readJson('apps/worker/package.json'),
    readJson('apps/worker/tsconfig.json'),
    readRepo('apps/worker/vitest.config.mjs'),
    readRepo('apps/worker/wrangler.test.toml'),
    readRepo('.github/workflows/preview.yml'),
    readRepo('.github/workflows/deploy.yml'),
  ]);

assert(
  rootPackage.scripts.typecheck === 'npm --workspaces --if-present run typecheck',
  'Root typecheck must execute every workspace check.',
);
assert(
  rootPackage.scripts['test:worker'].includes('npm --workspace gcss-worker run test:runtime'),
  'Root Worker gate must include runtime-native Durable Object tests.',
);
assert(storefrontPackage.scripts.typecheck === 'astro check', 'Storefront must run astro check.');
assert(storefrontPackage.devDependencies['@astrojs/check'], 'Storefront must declare @astrojs/check.');
assert(storefrontPackage.devDependencies.typescript, 'Storefront must declare TypeScript.');

assert(
  workerPackage.scripts['generate:types'] ===
    'wrangler types worker-configuration.generated.d.ts',
  'Worker must expose deterministic Wrangler type generation.',
);
assert(
  workerPackage.scripts.typecheck.includes('npm run generate:types') &&
    workerPackage.scripts.typecheck.includes('tsc --noEmit --project tsconfig.json'),
  'Worker typecheck must regenerate current bindings and check the implementation.',
);
assert(workerPackage.devDependencies.typescript, 'Worker must declare TypeScript.');
assert(
  workerPackage.scripts['test:runtime'] === 'vitest run --config vitest.config.mjs',
  'Worker must execute its runtime-native Durable Object tests.',
);
assert(
  workerPackage.devDependencies['@cloudflare/vitest-pool-workers'] &&
    workerPackage.devDependencies.vitest,
  'Worker runtime tests must declare the Cloudflare Vitest pool and Vitest.',
);
assert(
  workerVitestConfig.includes("configPath: './wrangler.test.toml'") &&
    !workerVitestConfig.includes("configPath: './wrangler.toml'"),
  'Coordinator runtime tests must use an explicit test-only binding config.',
);
assert(
  workerTestWrangler.includes('Test-only runtime') &&
    workerTestWrangler.includes('name = "GCSS_COORDINATOR"'),
  'The test-only Worker config must declare its isolated coordinator binding.',
);
assert(workerTsconfig.compilerOptions.allowJs === true, 'Worker check must include the JavaScript implementation.');
assert(workerTsconfig.compilerOptions.checkJs === true, 'Worker JavaScript must be type-checked.');
assert(workerTsconfig.compilerOptions.strict === true, 'Worker typecheck must use strict mode.');
assert(workerTsconfig.include.includes('index.mjs'), 'Worker typecheck must include index.mjs.');
assert(workerTsconfig.include.includes('entry.mjs'), 'Worker typecheck must include the runtime entrypoint.');
assert(workerTsconfig.include.includes('coordinator.mjs'), 'Worker typecheck must include the Durable Object coordinator.');
assert(
  workerTsconfig.include.includes('worker-configuration.generated.d.ts'),
  'Worker typecheck must include Wrangler-generated bindings.',
);

for (const [name, workflow] of [
  ['preview.yml', previewWorkflow],
  ['deploy.yml', deployWorkflow],
]) {
  assert(workflow.includes('run: npm run typecheck'), `${name} must run the cross-workspace typecheck.`);
}

console.log('Static check contract OK: Astro, Studio, and Worker checks are required and binding-aware.');
