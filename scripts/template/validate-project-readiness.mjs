import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  getProjectFeatureFlags,
  loadProjectConfig,
} from './project-config.mjs';
import {
  renderEnvExample,
  renderReadmeSummary,
  renderRobotsTxt,
  renderWranglerToml,
} from './project-renderers.mjs';

const ignoredDirectories = new Set(['.astro', '.git', '.sanity', '.wrangler', 'dist', 'node_modules']);
const textExtensions = new Set(['.astro', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.toml', '.ts', '.tsx', '.txt', '.yml', '.yaml']);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(absolutePath);
    else if (entry.isFile()) yield absolutePath;
  }
}

function isActiveDeliveryPath(relativePath, features, legalPages) {
  if (relativePath.startsWith('scripts/tests/') || relativePath.startsWith('scripts/template/')) return false;
  if (relativePath.startsWith('.agents/') || relativePath.startsWith('docs/project-log/')) return false;
  if (!features.commerce && /(?:product|shopify)/i.test(relativePath)) return false;
  if (!features.studio && relativePath.startsWith('apps/studio/')) return false;
  if (relativePath.startsWith('docs/legal/')) {
    const legalSlug = path.basename(relativePath, path.extname(relativePath));
    if (!legalPages.has(legalSlug)) return false;
  }
  return (
    relativePath === '.env.example' ||
    relativePath === 'README.md' ||
    relativePath.startsWith('.github/') ||
    relativePath.startsWith('apps/') ||
    relativePath.startsWith('docs/legal/') ||
    relativePath.startsWith('packages/')
  );
}

function lineHits(content, relativePath, label, pattern) {
  return content.split(/\r?\n/).flatMap((line, index) =>
    pattern.test(line) ? [{ label, line: index + 1, path: relativePath }] : [],
  );
}

async function scanClientPlaceholders(root, config) {
  const features = getProjectFeatureFlags(config);
  const legalPages = new Set(config.features.legalPages);
  const rules = [
    ['template brand', /\bExample Brand\b/],
    ['template product', /\bExample Product\b/],
    ['template domain', /\bexample\.com\b/],
    ['template Sanity project', /\bexampleproject\b/],
    ['template Studio host', /\bgcss-demo-studio\b/],
    ['template GitHub owner', /\bowner\/gcss-v3-site-framework\b/],
  ];
  const hits = [];

  for await (const absolutePath of walk(root)) {
    const relativePath = toPosix(path.relative(root, absolutePath));
    const extension = path.extname(relativePath).toLowerCase();
    if (!textExtensions.has(extension) || !isActiveDeliveryPath(relativePath, features, legalPages)) continue;
    const content = await readFile(absolutePath, 'utf8');
    for (const [label, pattern] of rules) hits.push(...lineHits(content, relativePath, label, pattern));
  }
  return hits;
}

function normalizeText(value) {
  return value.replace(/\r\n/g, '\n').trimEnd();
}

export async function validateProjectReadiness({ configPath = 'gcss.project.json', root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const config = await loadProjectConfig(path.resolve(resolvedRoot, configPath));
  const features = getProjectFeatureFlags(config);
  const errors = [];
  const warnings = [];

  const packageJson = JSON.parse(await readFile(path.join(resolvedRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== config.identity.projectName) {
    errors.push(`package.json name (${packageJson.name}) does not match identity.projectName (${config.identity.projectName}).`);
  }

  const wrangler = await readFile(path.join(resolvedRoot, 'apps/worker/wrangler.toml'), 'utf8');
  if (normalizeText(wrangler) !== normalizeText(renderWranglerToml(config))) {
    errors.push('apps/worker/wrangler.toml is not synchronized with gcss.project.json.');
  }

  const robots = await readFile(path.join(resolvedRoot, 'apps/storefront/public/robots.txt'), 'utf8');
  if (normalizeText(robots) !== normalizeText(renderRobotsTxt(config))) {
    errors.push('apps/storefront/public/robots.txt is not synchronized with gcss.project.json.');
  }

  const envExample = await readFile(path.join(resolvedRoot, '.env.example'), 'utf8');
  if (normalizeText(envExample) !== normalizeText(renderEnvExample(config))) {
    errors.push('.env.example is not synchronized with gcss.project.json.');
  }

  if (!config.templateMode && config.deployment.githubRepository.startsWith('owner/')) {
    errors.push('deployment.githubRepository still uses the template owner placeholder.');
  }
  if (!config.templateMode) {
    const readme = await readFile(path.join(resolvedRoot, 'README.md'), 'utf8');
    if (!readme.includes(renderReadmeSummary(config))) {
      errors.push('README.md project summary is missing or not synchronized with gcss.project.json.');
    }
    const placeholderHits = await scanClientPlaceholders(resolvedRoot, config);
    for (const hit of placeholderHits) errors.push(`${hit.path}:${hit.line} ${hit.label}`);
  } else {
    warnings.push('Template mode is enabled: client identity, legal text, assets, and service provisioning remain intentionally unresolved.');
  }

  warnings.push('Confirm legal text, brand assets, accessibility copy, and customer acceptance manually before launch.');
  return { config, errors, warnings };
}

function parseArgs(argv) {
  const options = { configPath: 'gcss.project.json', json: false, root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--config' || arg === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      options[arg === '--config' ? 'configPath' : 'root'] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await validateProjectReadiness(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Project readiness: ${result.config.identity.projectName}`);
    for (const warning of result.warnings) console.log(`WARN: ${warning}`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
  }
  if (result.errors.length > 0) process.exitCode = 1;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
