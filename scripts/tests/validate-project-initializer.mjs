import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProjectConfig } from '../template/project-config.mjs';
import { initializeProject } from '../template/init-new-project.mjs';
import { validateProjectReadiness } from '../template/validate-project-readiness.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = await mkdtemp(path.join(os.tmpdir(), 'gcss-init-'));
try {
  await mkdir(path.join(root, 'apps/worker'), { recursive: true });
  await mkdir(path.join(root, 'apps/storefront/public'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'gcss-v3-site-framework' }), 'utf8');
  await writeFile(path.join(root, 'README.md'), '# gcss-v3-site-framework\n\nTemplate.\n', 'utf8');
  await writeFile(path.join(root, '.env.example'), 'OLD=true\n', 'utf8');
  await writeFile(path.join(root, 'apps/worker/wrangler.toml'), 'name = "old"\n', 'utf8');
  await writeFile(path.join(root, 'apps/storefront/public/robots.txt'), 'old\n', 'utf8');

  const config = createProjectConfig({
    brandName: 'Atelier Test',
    contactForm: true,
    domain: 'atelier.example.test',
    frameworkVersion: '0.3.0-preview.1',
    githubRepository: 'atelier/site',
    locales: ['en', 'fr'],
    profile: 'static-brand',
    projectName: 'atelier-site',
  });
  const configPath = path.join(root, 'input.json');
  await writeFile(configPath, JSON.stringify(config), 'utf8');

  const dryRun = await initializeProject({ configPath, root, write: false });
  assert(dryRun.files.includes('gcss.project.json'), 'Dry-run must list the project contract write.');
  assert((await readFile(path.join(root, 'package.json'), 'utf8')).includes('gcss-v3-site-framework'), 'Dry-run must not mutate files.');

  await initializeProject({ allowDirty: true, configPath, root, write: true });
  const initializedPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const envExample = await readFile(path.join(root, '.env.example'), 'utf8');
  const wrangler = await readFile(path.join(root, 'apps/worker/wrangler.toml'), 'utf8');
  const robots = await readFile(path.join(root, 'apps/storefront/public/robots.txt'), 'utf8');
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');

  assert(initializedPackage.name === 'atelier-site', 'Initializer must update the root package name.');
  assert(envExample.includes('SITE_PROFILE=static-brand'), 'Initializer must export the selected profile.');
  assert(!envExample.includes('SANITY_PROJECT_ID'), 'A2 env example must not require Sanity.');
  assert(!envExample.includes('SHOPIFY_STORE_DOMAIN'), 'A2 env example must not require Shopify.');
  assert(envExample.includes('RESEND_API_KEY'), 'A2 env example must include Contact services.');
  assert(wrangler.includes('SITE_FEATURE_CONTACT_FORM = "true"'), 'A2 Worker config must enable Contact.');
  assert(
    dryRun.config.features.legalPages.includes('privacy-policy') &&
      !dryRun.config.features.legalPages.includes('shipping-returns-policy'),
    'A2 initializer must select privacy without generating a retail shipping policy route.',
  );
  assert(robots.includes('https://atelier.example.test/sitemap.xml'), 'Robots sitemap must use the project domain.');
  assert(readme.includes('Atelier Test') && readme.includes('A 静态品牌官网'), 'README must include the generated project summary.');

  const readiness = await validateProjectReadiness({ root });
  assert(readiness.errors.length === 0, `Initialized fixture must be ready: ${readiness.errors.join('; ')}`);
} finally {
  await rm(root, { force: true, recursive: true });
}

console.log('Project initializer OK: dry-run, controlled writes, A2 service boundaries, and readiness scan validated.');
