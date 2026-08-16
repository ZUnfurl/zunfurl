import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProjectConfig } from './project-config.mjs';
import {
  renderEnvExample,
  renderRobotsTxt,
  renderWranglerToml,
  upsertReadmeSummary,
} from './project-renderers.mjs';

function parseArgs(argv) {
  const options = { allowDirty: false, root: process.cwd(), write: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') options.write = true;
    else if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--config' || arg === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg.startsWith('--config=')) options.config = arg.slice('--config='.length);
    else if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.config) throw new Error('Missing required --config <path>.');
  return options;
}

function assertCleanGit(root, configPath) {
  try {
    const allowedConfigPath = path.relative(root, path.resolve(configPath)).split(path.sep).join('/');
    const entries = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => line.slice(3).split(path.sep).join('/') !== allowedConfigPath);
    if (entries.length > 0) {
      throw new Error('Target repository has changes beyond the input project contract. Commit or stash them, or use --allow-dirty deliberately.');
    }
  } catch (error) {
    if (error.message?.includes('Target repository has changes')) throw error;
    throw new Error(`Unable to verify Git status: ${error.message}`);
  }
}

async function buildWrites(root, config) {
  const packagePath = path.join(root, 'package.json');
  const readmePath = path.join(root, 'README.md');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  const readme = await readFile(readmePath, 'utf8');

  packageJson.name = config.identity.projectName;
  packageJson.description = `${config.identity.brandName} website built with gcss-v3-site-framework.`;

  return new Map([
    ['gcss.project.json', `${JSON.stringify(config, null, 2)}\n`],
    ['package.json', `${JSON.stringify(packageJson, null, 2)}\n`],
    ['.env.example', renderEnvExample(config)],
    ['apps/worker/wrangler.toml', renderWranglerToml(config)],
    ['apps/storefront/public/robots.txt', renderRobotsTxt(config)],
    ['README.md', upsertReadmeSummary(readme, config)],
  ]);
}

export async function initializeProject({ allowDirty = false, configPath, root = process.cwd(), write = false }) {
  const resolvedRoot = path.resolve(root);
  const config = await loadProjectConfig(configPath);
  if (write && !allowDirty) assertCleanGit(resolvedRoot, configPath);
  const writes = await buildWrites(resolvedRoot, config);

  if (write) {
    for (const [relativePath, content] of writes) {
      await writeFile(path.join(resolvedRoot, relativePath), content, 'utf8');
    }
  }

  return {
    config,
    mode: write ? 'write' : 'dry-run',
    files: [...writes.keys()],
    manualActions: [
      'replace Example Brand and Example Product editorial copy',
      'replace docs/legal placeholder entities and contact details',
      'replace template visual assets and favicon',
      'provision required platform resources, bindings, and secrets',
      'run npm.cmd run project:scan before deployment',
    ],
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await initializeProject({
    allowDirty: options.allowDirty,
    configPath: options.config,
    root: options.root,
    write: options.write,
  });
  console.log(`${result.mode === 'write' ? 'Initialized' : 'Would initialize'} ${result.config.identity.projectName}.`);
  for (const file of result.files) console.log(`- ${file}`);
  if (!options.write) console.log('Dry-run only. Re-run with --write after reviewing this file list.');
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
