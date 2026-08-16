import { spawn } from 'node:child_process';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import {
  createSiteProfileFromEnv,
  isFeatureEnabled,
} from '../../packages/config/src/index.mjs';
import { loadProjectConfig } from '../template/project-config.mjs';

const [scriptName, ...scriptArgs] = process.argv.slice(2);
const allowedScripts = new Set(['dev', 'build', 'deploy']);

if (!allowedScripts.has(scriptName)) {
  console.error('Usage: node ./scripts/studio/run-with-env.mjs <dev|build|deploy> [...args]');
  process.exit(1);
}

loadEnv({ path: '.env', override: false });
await loadProjectConfig();

function aliasEnv(targetName, sourceName) {
  if (!process.env[targetName] && process.env[sourceName]) {
    process.env[targetName] = process.env[sourceName];
  }
}

// SITE_PROFILE / Contact 变量只是项目契约的部署镜像；漂移时直接失败，不作为 Studio override。
const siteProfile = createSiteProfileFromEnv(process.env);
const productCmsEnabled = isFeatureEnabled(siteProfile, 'productCms');

if (productCmsEnabled) {
  aliasEnv('SANITY_STUDIO_SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STORE_DOMAIN');
  aliasEnv('SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'SHOPIFY_STOREFRONT_ACCESS_TOKEN');
  aliasEnv('SANITY_STUDIO_SHOPIFY_STOREFRONT_API_VERSION', 'SHOPIFY_STOREFRONT_API_VERSION');
}

const npmArgs = [
  '--workspace',
  'gcss-studio',
  'run',
  scriptName,
  ...(scriptArgs.length ? ['--', ...scriptArgs] : []),
];
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name, value]) =>
      value !== undefined &&
      !name.includes('=') &&
      (productCmsEnabled || !name.startsWith('SANITY_STUDIO_SHOPIFY_')),
  ),
);

function quoteCmdArg(value) {
  if (/^[a-zA-Z0-9._:/=@-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

const child =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', ['npm', ...npmArgs].map(quoteCmdArg).join(' ')], {
        env: childEnv,
        stdio: 'inherit',
      })
    : spawn('npm', npmArgs, {
        env: childEnv,
        stdio: 'inherit',
      });

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Sanity Studio ${scriptName} stopped by signal ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
