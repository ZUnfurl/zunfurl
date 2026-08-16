import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const fixtureDefinitions = Object.freeze({
  A1: {
    configPath: 'scripts/fixtures/projects/a1.project.json',
    profile: 'static-brand',
    contactForm: false,
    studio: false,
  },
  A2: {
    configPath: 'scripts/fixtures/projects/a2.project.json',
    profile: 'static-brand',
    contactForm: true,
    studio: false,
  },
  B: {
    configPath: 'scripts/fixtures/projects/b.project.json',
    profile: 'cms-brand',
    contactForm: false,
    studio: true,
  },
  C: {
    configPath: 'scripts/fixtures/projects/c.project.json',
    profile: 'retail',
    contactForm: true,
    studio: true,
  },
});

export const allowedInitializationFiles = Object.freeze([
  '.env.example',
  'README.md',
  'apps/storefront/public/robots.txt',
  'apps/worker/wrangler.toml',
  'gcss.project.json',
  'package.json',
]);

const forbiddenPathSegments = new Set([
  '.astro',
  '.cache',
  '.codex',
  '.codex-runtime',
  '.git',
  '.sanity',
  '.vite',
  '.wrangler',
  '.idea',
  '.vscode',
  'coverage',
  'cache',
  'dist',
  'node_modules',
  'tmp',
]);
const overlayTextExtensions = new Set([
  '.astro',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);
const overlayPathPrefixes = Object.freeze([
  '.env.example',
  '.github/',
  'README.md',
  'apps/',
  'docs/legal/',
  'packages/',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function normalizeVariant(value) {
  const variant = String(value ?? '').trim().toUpperCase();
  assert(Object.hasOwn(fixtureDefinitions, variant), `Unsupported fixture variant: ${value || '<empty>'}.`);
  return variant;
}

export function assertSafeRelativePath(relativePath) {
  const normalized = toPosix(String(relativePath ?? ''));
  const segments = normalized.split('/');
  const basename = segments.at(-1);
  assert(normalized.length > 0, 'Fixture copy path must not be empty.');
  assert(!path.isAbsolute(relativePath), `Fixture copy path must be relative: ${relativePath}`);
  assert(!segments.includes('..'), `Fixture copy path must stay inside the temporary root: ${relativePath}`);
  assert(
    !segments.some((segment) => forbiddenPathSegments.has(segment)),
    `Fixture copy path belongs to an excluded directory: ${relativePath}`,
  );
  assert(
    !(
      basename === '.env' ||
      (basename.startsWith('.env.') && !basename.endsWith('.example')) ||
      basename === '.dev.vars' ||
      basename.startsWith('.dev.vars.') ||
      basename.endsWith('.log')
    ),
    `Fixture copy path is a secret or runtime artifact: ${relativePath}`,
  );
  return normalized;
}

export function assertAllowedInitializationFileSet(files) {
  const actual = [...new Set(files.map(toPosix))].sort();
  const expected = [...allowedInitializationFiles].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Initializer file boundary changed. Expected ${expected.join(', ')}; received ${actual.join(', ') || '(none)'}.`,
  );
}

function quoteWindowsArg(value) {
  const stringValue = String(value);
  if (/^[a-zA-Z0-9:._@/\\=-]+$/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

async function runProcess(command, args, { cwd, env, label, quiet = false } = {}) {
  const startedAt = performance.now();
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (!quiet) process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (!quiet) process.stderr.write(chunk);
  });

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const durationMs = Math.round(performance.now() - startedAt);

  if (result.signal || result.code !== 0) {
    if (quiet) {
      if (stdout) process.stderr.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
    throw new Error(`${label ?? command} failed (${result.signal ?? `exit ${result.code}`}).`);
  }

  return { durationMs, stderr, stdout };
}

async function runNpm(args, options) {
  if (process.platform !== 'win32') return runProcess('npm', args, options);
  const command = process.env.ComSpec ?? 'cmd.exe';
  const commandLine = ['npm', ...args].map(quoteWindowsArg).join(' ');
  return runProcess(command, ['/d', '/s', '/c', commandLine], options);
}

function createFixtureEnvironment() {
  const env = { ...process.env };
  const exactNames = new Set(['CONTENT_SOURCE', 'SITE_MODE', 'SITE_PROFILE']);
  const prefixes = [
    'CONTACT_',
    'GCSS_TEST_',
    'PUBLIC_TURNSTILE_',
    'RESEND_',
    'SANITY_',
    'SHOPIFY_',
    'SITE_FEATURE_',
    'TURNSTILE_',
  ];

  for (const name of Object.keys(env)) {
    if (exactNames.has(name) || prefixes.some((prefix) => name.startsWith(prefix))) delete env[name];
  }

  env.ASTRO_TELEMETRY_DISABLED = '1';
  env.CI = 'true';
  env.NO_COLOR = '1';
  env.SANITY_TELEMETRY_DISABLED = '1';
  if (process.env.GCSS_FIXTURE_NPM_CACHE) env.npm_config_cache = process.env.GCSS_FIXTURE_NPM_CACHE;
  return env;
}

async function listGitCandidateFiles(root) {
  const topLevel = await runProcess('git', ['rev-parse', '--show-toplevel'], {
    cwd: root,
    env: process.env,
    label: 'git repository-root verification',
    quiet: true,
  });
  assert(
    path.resolve(topLevel.stdout.trim()).toLowerCase() === path.resolve(root).toLowerCase(),
    `Fixture source must be the repository root: ${topLevel.stdout.trim()}.`,
  );
  const tracked = await runProcess('git', ['ls-files', '-z', '--cached'], {
    cwd: root,
    env: process.env,
    label: 'git tracked-file inventory',
    quiet: true,
  });
  const additions = await runProcess('git', ['ls-files', '-z', '--others', '--exclude-standard'], {
    cwd: root,
    env: process.env,
    label: 'git candidate-addition inventory',
    quiet: true,
  });
  const trackedFiles = tracked.stdout.split('\0').filter(Boolean);
  const addedFiles = additions.stdout.split('\0').filter(Boolean);
  const files = [...new Set([...trackedFiles, ...addedFiles])].sort();
  return { addedCount: addedFiles.length, files, trackedCount: trackedFiles.length };
}

async function copyCandidateTree(fromRoot, toRoot) {
  const inventory = await listGitCandidateFiles(fromRoot);
  let copied = 0;
  let deleted = 0;

  for (const candidate of inventory.files) {
    const relativePath = assertSafeRelativePath(candidate);
    const sourcePath = path.resolve(fromRoot, relativePath);
    const targetPath = path.resolve(toRoot, relativePath);
    assert(sourcePath.startsWith(`${path.resolve(fromRoot)}${path.sep}`), `Source path escaped repository: ${relativePath}`);
    assert(targetPath.startsWith(`${path.resolve(toRoot)}${path.sep}`), `Target path escaped temporary root: ${relativePath}`);

    let sourceStat;
    try {
      sourceStat = await lstat(sourcePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        deleted += 1;
        continue;
      }
      throw error;
    }
    assert(sourceStat.isFile(), `Fixture source must be a regular file: ${relativePath}`);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    copied += 1;
  }

  return { ...inventory, copied, deleted };
}

async function initializeFixtureGitIndex(root, env) {
  const initialized = await runProcess('git', ['init', '--quiet'], {
    cwd: root,
    env,
    label: 'temporary Git index initialization',
    quiet: true,
  });
  const indexed = await runProcess('git', ['add', '--all'], {
    cwd: root,
    env,
    label: 'temporary Git candidate indexing',
    quiet: true,
  });
  return { durationMs: initialized.durationMs + indexed.durationMs };
}

async function* walkFiles(root, directory = root) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPosix(path.relative(root, absolutePath));
    if (entry.isDirectory()) {
      if (forbiddenPathSegments.has(entry.name)) continue;
      yield* walkFiles(root, absolutePath);
    } else if (entry.isFile()) {
      yield { absolutePath, relativePath };
    }
  }
}

async function snapshotFiles(root) {
  const snapshot = new Map();
  for await (const file of walkFiles(root)) {
    const content = await readFile(file.absolutePath);
    snapshot.set(file.relativePath, createHash('sha256').update(content).digest('hex'));
  }
  return snapshot;
}

function changedFiles(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((relativePath) => before.get(relativePath) !== after.get(relativePath))
    .sort();
}

function assertNoChanges(before, after, label) {
  const changed = changedFiles(before, after);
  assert(changed.length === 0, `${label} modified files: ${changed.join(', ')}.`);
}

function isOverlayPath(relativePath) {
  return (
    overlayTextExtensions.has(path.extname(relativePath).toLowerCase()) &&
    overlayPathPrefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix))
  );
}

export async function applyTestOnlyOverlay(root, contract) {
  const replacements = [
    ['Example Brand', contract.identity.brandName],
    ['Example Product', `${contract.identity.brandName} Sample`],
    ['example.com', contract.identity.domain],
    ['exampleproject', 'fixtureproject'],
  ];
  const counts = new Map(replacements.map(([source]) => [source, 0]));
  const modifiedFiles = [];

  for await (const file of walkFiles(root)) {
    if (!isOverlayPath(file.relativePath)) continue;
    let content = await readFile(file.absolutePath, 'utf8');
    const original = content;

    for (const [source, replacement] of replacements) {
      const occurrences = content.split(source).length - 1;
      if (occurrences > 0) {
        counts.set(source, counts.get(source) + occurrences);
        content = content.split(source).join(replacement);
      }
    }

    if (content !== original) {
      await writeFile(file.absolutePath, content, 'utf8');
      modifiedFiles.push(file.relativePath);
    }
  }

  for (const [source, count] of counts) {
    assert(count > 0, `Test-only overlay marker was not found: ${source}`);
  }
  assert(modifiedFiles.length > 0, 'Test-only overlay did not modify any files.');
  return { counts: Object.fromEntries(counts), modifiedFiles: modifiedFiles.sort() };
}

function parseInitializerDryRunFiles(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

async function readFixtureContract(root, definition) {
  return JSON.parse(await readFile(path.join(root, definition.configPath), 'utf8'));
}

async function assertGeneratedServiceBoundary(root, variant, contract) {
  const envExample = await readFile(path.join(root, '.env.example'), 'utf8');
  const wrangler = await readFile(path.join(root, 'apps/worker/wrangler.toml'), 'utf8');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const has = (source, value) => source.includes(value);

  assert(packageJson.name === contract.identity.projectName, `${variant} package name was not initialized.`);
  assert(has(envExample, `SITE_PROFILE=${contract.delivery.profile}`), `${variant} env example has the wrong profile.`);
  assert(has(wrangler, `SITE_PROFILE = "${contract.delivery.profile}"`), `${variant} Worker has the wrong profile.`);
  assert(
    has(wrangler, `SITE_FEATURE_CONTACT_FORM = "${contract.features.contactForm}"`),
    `${variant} Worker has the wrong Contact feature flag.`,
  );

  const sanityNames = ['SANITY_PROJECT_ID', 'SANITY_STUDIO_PROJECT_ID'];
  const shopifyNames = ['SHOPIFY_STORE_DOMAIN', 'SANITY_STUDIO_SHOPIFY_STORE_DOMAIN'];
  const contactNames = ['RESEND_API_KEY', 'PUBLIC_TURNSTILE_SITE_KEY', 'CONTACT_HMAC_SECRET'];
  const assertPresence = (names, expected, label) => {
    for (const name of names) {
      assert(has(envExample, name) === expected, `${variant} ${label} boundary is wrong for ${name}.`);
    }
  };

  assertPresence(sanityNames, ['B', 'C'].includes(variant), 'Sanity');
  assertPresence(shopifyNames, variant === 'C', 'Shopify');
  assertPresence(contactNames, ['A2', 'C'].includes(variant), 'Contact');
  assert(!has(envExample, 'SHOPIFY_ADMIN_ACCESS_TOKEN'), `${variant} must not expose a Shopify Admin token.`);
  assert(!has(envExample, 'CHECKOUT'), `${variant} must not expose Checkout configuration.`);

  if (variant === 'A1') {
    assert(has(wrangler, 'CONTACT_FORM_ENABLED = "false"'), 'A1 must keep the real Contact API disabled.');
    assert(!has(wrangler, 'GCSS_COORDINATOR'), 'A1 must not bind the Durable Object coordinator.');
    assert(!has(wrangler, '[[migrations]]'), 'A1 must not declare a Durable Object migration.');
  }
  if (variant !== 'A1') {
    assert(has(wrangler, 'name = "GCSS_COORDINATOR"'), `${variant} must bind GCSS_COORDINATOR.`);
    assert(has(wrangler, 'class_name = "GcssCoordinator"'), `${variant} must bind GcssCoordinator.`);
    assert(has(wrangler, '[[migrations]]'), `${variant} must declare the Durable Object migration.`);
    assert(
      has(wrangler, 'new_sqlite_classes = ["GcssCoordinator"]'),
      `${variant} must provision the SQLite Durable Object class.`,
    );
  }
}

async function assertBuiltRouteBoundary(root, variant, contract) {
  const storefrontDist = path.join(root, 'apps/storefront/dist');
  const firstLocale = contract.delivery.locales[0];
  const productsIndex = path.join(storefrontDist, firstLocale, 'products', 'index.html');
  let productsRouteExists = false;
  try {
    productsRouteExists = (await stat(productsIndex)).isFile();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  assert(productsRouteExists === (variant === 'C'), `${variant} generated an unexpected Products route boundary.`);

  if (variant === 'B' || variant === 'C') {
    const studioIndex = path.join(root, 'apps/studio/dist/index.html');
    assert((await stat(studioIndex)).isFile(), `${variant} Studio build output is missing.`);
  }
}

function validationCommandsFor(variant) {
  if (variant === 'A1' || variant === 'A2') {
    return [
      ['run', 'test:profile:static-brand'],
      ['run', 'build'],
    ];
  }
  if (variant === 'B') {
    return [
      ['run', 'test:profile:cms-brand'],
      ['run', 'studio:build'],
      ['run', 'build'],
    ];
  }
  return [
    ['run', 'test:profile:retail'],
    ['run', 'test:commerce'],
    ['run', 'test:sanity'],
    ['run', 'test:shopify-summary'],
    ['run', 'studio:build'],
    ['run', 'build'],
  ];
}

export function parseRunnerArgs(argv = []) {
  const options = { variant: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--variant') {
      assert(argv[index + 1], 'Missing value for --variant.');
      options.variant = normalizeVariant(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--variant=')) {
      options.variant = normalizeVariant(arg.slice('--variant='.length));
    } else {
      throw new Error(`Unknown fixture runner argument: ${arg}`);
    }
  }
  assert(options.variant, 'Fixture runner requires --variant <A1|A2|B|C>.');
  return options;
}

export async function runInitializedProjectFixture({ variant: rawVariant }) {
  const variant = normalizeVariant(rawVariant);
  const definition = fixtureDefinitions[variant];
  const fixtureStartedAt = performance.now();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `gcss-${variant.toLowerCase()}-`));
  const fixtureEnv = createFixtureEnvironment();
  const timings = {};
  let passed = false;

  console.log(`[${variant}] Temporary project: ${tempRoot}`);
  try {
    const copyStartedAt = performance.now();
    const inventory = await copyCandidateTree(sourceRoot, tempRoot);
    timings.copy = Math.round(performance.now() - copyStartedAt);
    console.log(
      `[${variant}] Copied ${inventory.copied} Git candidate files (${inventory.trackedCount} tracked, ${inventory.addedCount} non-ignored additions, ${inventory.deleted} deleted paths skipped).`,
    );

    const contract = await readFixtureContract(tempRoot, definition);
    assert(contract.delivery.profile === definition.profile, `${variant} fixture profile does not match its runner definition.`);
    assert(contract.features.contactForm === definition.contactForm, `${variant} fixture Contact choice does not match its runner definition.`);
    const beforeDryRun = await snapshotFiles(tempRoot);

    const plan = await runNpm(
      ['run', '--silent', 'init:project:dry-run', '--', '--config', definition.configPath, '--json'],
      { cwd: tempRoot, env: fixtureEnv, label: `${variant} init:project:dry-run`, quiet: true },
    );
    timings.plan = plan.durationMs;
    const parsedPlan = JSON.parse(plan.stdout);
    assert(parsedPlan.ok === true && parsedPlan.mode === 'dry-run', `${variant} initializer plan was not a dry-run.`);
    assert(parsedPlan.variant === variant, `${variant} initializer plan selected ${parsedPlan.variant}.`);
    assert(parsedPlan.profile === definition.profile, `${variant} initializer plan selected the wrong profile.`);
    assertNoChanges(beforeDryRun, await snapshotFiles(tempRoot), `${variant} init:project:dry-run`);

    const initializerDryRun = await runNpm(
      ['run', '--silent', 'init:project', '--', '--config', definition.configPath],
      { cwd: tempRoot, env: fixtureEnv, label: `${variant} initializer file dry-run`, quiet: true },
    );
    timings.initializerDryRun = initializerDryRun.durationMs;
    assertAllowedInitializationFileSet(parseInitializerDryRunFiles(initializerDryRun.stdout));
    assertNoChanges(beforeDryRun, await snapshotFiles(tempRoot), `${variant} initializer file dry-run`);

    const writeResult = await runNpm(
      ['run', '--silent', 'init:project', '--', '--config', definition.configPath, '--write', '--allow-dirty'],
      { cwd: tempRoot, env: fixtureEnv, label: `${variant} controlled initialization`, quiet: true },
    );
    timings.initialize = writeResult.durationMs;
    const afterInitialization = await snapshotFiles(tempRoot);
    assertAllowedInitializationFileSet(changedFiles(beforeDryRun, afterInitialization));
    await assertGeneratedServiceBoundary(tempRoot, variant, contract);

    const overlayStartedAt = performance.now();
    const overlay = await applyTestOnlyOverlay(tempRoot, contract);
    timings.overlay = Math.round(performance.now() - overlayStartedAt);
    console.log(`[${variant}] Applied explicit test-only overlay to ${overlay.modifiedFiles.length} files.`);

    const gitIndex = await initializeFixtureGitIndex(tempRoot, fixtureEnv);
    timings.gitIndex = gitIndex.durationMs;
    console.log(`[${variant}] Created an isolated unborn Git index without source history or remotes.`);

    const install = await runNpm(
      ['ci', '--prefer-offline', '--no-audit', '--no-fund'],
      { cwd: tempRoot, env: fixtureEnv, label: `${variant} npm ci` },
    );
    timings.install = install.durationMs;

    const preBuildCommands = [
      ['run', 'project:scan'],
      ['run', 'framework:audit'],
    ];
    const postBuildCommands = [
      ['run', 'test:phase1'],
      ['run', 'typecheck'],
      ['run', 'test:worker'],
      ['--workspace', 'gcss-worker', 'run', 'deploy', '--', '--dry-run'],
    ];
    for (const args of [...preBuildCommands, ...validationCommandsFor(variant), ...postBuildCommands]) {
      const label = `npm ${args.join(' ')}`;
      console.log(`[${variant}] ${label}`);
      const result = await runNpm(args, { cwd: tempRoot, env: fixtureEnv, label: `${variant} ${label}` });
      timings[label] = result.durationMs;
    }

    await assertBuiltRouteBoundary(tempRoot, variant, contract);
    passed = true;
    const totalMs = Object.values(timings).reduce((sum, value) => sum + value, 0);
    const wallMs = Math.round(performance.now() - fixtureStartedAt);
    const slowest = Object.entries(timings)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label, durationMs]) => `${label}=${Math.round(durationMs / 1000)}s`)
      .join(', ');
    console.log(
      `[${variant}] Initialized-project fixture OK (${Math.round(wallMs / 1000)}s wall; ${Math.round(totalMs / 1000)}s measured commands; slowest: ${slowest}).`,
    );
    return { inventory, overlay, passed, timings, variant };
  } finally {
    if (process.env.GCSS_FIXTURE_KEEP_TEMP === '1') {
      console.log(`[${variant}] GCSS_FIXTURE_KEEP_TEMP=1; preserved ${tempRoot} for diagnosis.`);
    } else {
      await rm(tempRoot, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
      console.log(`[${variant}] Temporary project removed${passed ? '' : ' after failure'}.`);
    }
  }
}

async function runCli(argv = process.argv.slice(2)) {
  const options = parseRunnerArgs(argv);
  await runInitializedProjectFixture(options);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}
