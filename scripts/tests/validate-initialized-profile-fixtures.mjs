import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allowedInitializationFiles,
  applyTestOnlyOverlay,
  assertAllowedInitializationFileSet,
  assertSafeRelativePath,
  fixtureDefinitions,
  normalizeVariant,
  parseRunnerArgs,
} from './run-initialized-project-fixture.mjs';
import {
  getProjectVariant,
  validateProjectConfig,
} from '../template/project-config.mjs';
import { runPublicTextScan } from './validate-public-text.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesRoot = path.join(repositoryRoot, 'scripts/fixtures/projects');
const runnerPath = path.join(repositoryRoot, 'scripts/tests/run-initialized-project-fixture.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(callback, expectedMessage) {
  try {
    callback();
  } catch (error) {
    assert(
      String(error.message).includes(expectedMessage),
      `Expected error containing "${expectedMessage}", received "${error.message}".`,
    );
    return;
  }
  throw new Error(`Expected fail-closed error containing "${expectedMessage}".`);
}

function parseArgs(argv = []) {
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
      throw new Error(`Unknown fixture validation argument: ${arg}`);
    }
  }
  return options;
}

async function runNode(args, label) {
  const child = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (result.signal || result.code !== 0) {
    throw new Error(`${label} failed (${result.signal ?? `exit ${result.code}`}).`);
  }
}

async function validateFixtureContracts() {
  const expectedFiles = Object.values(fixtureDefinitions)
    .map(({ configPath }) => path.basename(configPath))
    .sort();
  const actualFiles = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.project.json'))
    .map((entry) => entry.name)
    .sort();
  assert(
    JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
    `Fixture contract inventory changed. Expected ${expectedFiles.join(', ')}; received ${actualFiles.join(', ')}.`,
  );

  const identities = new Set();
  for (const [variant, definition] of Object.entries(fixtureDefinitions)) {
    const raw = JSON.parse(await readFile(path.join(repositoryRoot, definition.configPath), 'utf8'));
    const contract = validateProjectConfig(raw);
    assert(contract.templateMode === false, `${variant} must represent an initialized client, not the template.`);
    assert(contract.delivery.contentSource === 'local', `${variant} must remain credential-free for local validation.`);
    assert(contract.delivery.profile === definition.profile, `${variant} has an unexpected profile.`);
    assert(contract.features.contactForm === definition.contactForm, `${variant} has an unexpected Contact choice.`);
    assert(getProjectVariant(contract) === variant, `${variant} does not map back to its expected delivery variant.`);
    assert(contract.deployment.githubRepository.startsWith('ZUnfurl/'), `${variant} must use the public owner decision.`);
    assert(!identities.has(contract.identity.projectName), `${variant} reuses another fixture project name.`);
    identities.add(contract.identity.projectName);

    const legalPages = contract.features.legalPages;
    assert(Array.isArray(legalPages) && legalPages.length > 0, `${variant} must explicitly select legal pages.`);
    assert(
      legalPages.includes('shipping-returns-policy') === (variant === 'C'),
      `${variant} shipping/returns legal-page boundary is incorrect.`,
    );

    const serialized = JSON.stringify(contract);
    assert(!serialized.includes('example.com'), `${variant} must not retain the template domain.`);
    assert(!serialized.includes('owner/'), `${variant} must not retain the template repository owner.`);
    assert(!serialized.includes('sk_live_'), `${variant} must not contain a live secret.`);
  }
}

async function validateHarnessFailClosedBoundaries() {
  assert(normalizeVariant('a1') === 'A1', 'Variant normalization must accept the documented lowercase spelling.');
  assert(parseRunnerArgs(['--variant', 'C']).variant === 'C', 'Runner must parse the documented variant flag.');
  assertThrows(() => normalizeVariant('D'), 'Unsupported fixture variant');
  assertThrows(() => parseRunnerArgs([]), 'requires --variant');
  assertThrows(() => parseRunnerArgs(['--variant', 'A1', '--write-source']), 'Unknown fixture runner argument');
  assertThrows(() => assertSafeRelativePath('../package.json'), 'stay inside');
  assertThrows(() => assertSafeRelativePath('.git/config'), 'excluded directory');
  assertThrows(() => assertSafeRelativePath('apps/storefront/node_modules/a.js'), 'excluded directory');
  assertThrows(() => assertSafeRelativePath('.env'), 'secret or runtime artifact');
  assertThrows(() => assertSafeRelativePath('fixture.log'), 'secret or runtime artifact');
  assertAllowedInitializationFileSet(allowedInitializationFiles);
  assertThrows(
    () => assertAllowedInitializationFileSet([...allowedInitializationFiles, 'apps/worker/index.mjs']),
    'Initializer file boundary changed',
  );
  assertThrows(
    () => assertAllowedInitializationFileSet(allowedInitializationFiles.slice(1)),
    'Initializer file boundary changed',
  );

  const overlayRoot = await mkdtemp(path.join(os.tmpdir(), 'gcss-overlay-contract-'));
  const missingRoot = await mkdtemp(path.join(os.tmpdir(), 'gcss-overlay-missing-'));
  const unbornRoot = await mkdtemp(path.join(os.tmpdir(), 'gcss-public-text-unborn-'));
  try {
    await writeFile(
      path.join(overlayRoot, 'README.md'),
      [
        'Example Brand',
        'Example Product',
        'https://example.com',
        'exampleproject',
      ].join('\n'),
      'utf8',
    );
    const contract = {
      identity: { brandName: 'Fixture Brand', domain: 'fixture.test' },
      deployment: { githubRepository: 'ZUnfurl/fixture', studioHost: 'fixture-studio' },
    };
    const result = await applyTestOnlyOverlay(overlayRoot, contract);
    assert(result.modifiedFiles.join(',') === 'README.md', 'Overlay must only report the explicitly modified test file.');
    const overlaid = await readFile(path.join(overlayRoot, 'README.md'), 'utf8');
    assert(!overlaid.includes('Example Brand') && overlaid.includes('Fixture Brand'), 'Overlay substitution failed.');
    await mkdir(path.join(missingRoot, 'docs/legal'), { recursive: true });
    await writeFile(path.join(missingRoot, 'README.md'), 'No template markers.\n', 'utf8');
    await assert(
      await applyTestOnlyOverlay(missingRoot, contract).then(
        () => false,
        (error) => String(error.message).includes('marker was not found'),
      ),
      'Overlay must fail closed when its explicit markers disappear.',
    );

    await mkdir(path.join(unbornRoot, 'docs/compliance'), { recursive: true });
    await writeFile(path.join(unbornRoot, 'README.md'), '# Unborn worktree fixture\n', 'utf8');
    await writeFile(
      path.join(unbornRoot, 'docs/compliance/public-text-allowlist.json'),
      `${JSON.stringify({ schemaVersion: 1 }, null, 2)}\n`,
      'utf8',
    );
    for (const args of [['init', '--quiet'], ['add', '--all']]) {
      const git = spawnSync('git', args, { cwd: unbornRoot, encoding: 'utf8', windowsHide: true });
      assert(git.status === 0, `Unable to prepare unborn Git regression fixture: ${git.stderr}`);
    }
    const currentReport = await runPublicTextScan({ mode: 'current', root: unbornRoot });
    assert(
      currentReport.sourceCommit === 'WORKTREE-UNBORN' && currentReport.findings.length === 0,
      'Current-tree public text scan must support an unborn HEAD without weakening findings.',
    );
    const historyRejected = await runPublicTextScan({ mode: 'history', root: unbornRoot }).then(
      () => false,
      (error) => String(error.message).includes('requires a reachable HEAD'),
    );
    assert(historyRejected, 'History public text scan must fail closed when HEAD is unborn.');
  } finally {
    await rm(overlayRoot, { force: true, recursive: true });
    await rm(missingRoot, { force: true, recursive: true });
    await rm(unbornRoot, { force: true, recursive: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await validateFixtureContracts();
  await validateHarnessFailClosedBoundaries();
  console.log('Fixture contracts and fail-closed harness boundaries OK.');

  const variants = options.variant ? [options.variant] : Object.keys(fixtureDefinitions);
  for (const variant of variants) {
    await runNode([runnerPath, '--variant', variant], `${variant} initialized-project fixture`);
  }
  console.log(`Initialized profile fixtures OK: ${variants.join(', ')}.`);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
