import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { createSiteProfileFromEnv } from '../../packages/config/src/index.mjs';
import { loadProjectConfig } from '../template/project-config.mjs';

const [scriptName, ...scriptArgs] = process.argv.slice(2);
const allowedScripts = new Set(['dev', 'build', 'preview', 'astro']);

if (!allowedScripts.has(scriptName)) {
  console.error('Usage: node ./scripts/storefront/run-with-env.mjs <dev|build|preview|astro> [...args]');
  process.exit(1);
}

function loadEnvFile(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        continue;
      }

      const [name, ...valueParts] = trimmed.split('=');
      const key = name.trim();
      let value = valueParts.join('=').trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] ??= value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function quoteCmdArg(value) {
  if (/^[a-zA-Z0-9._:/=@-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

loadEnvFile('.env');
await loadProjectConfig();
createSiteProfileFromEnv(process.env);

const npmArgs = [
  '--workspace',
  'gcss-storefront',
  'run',
  scriptName,
  ...(scriptArgs.length ? ['--', ...scriptArgs] : []),
];
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name, value]) => value !== undefined && !name.includes('=')),
);

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
    console.error(`Storefront ${scriptName} stopped by signal ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
