/**
 * 冻结、物化并验证 Phase 6 公共候选树。
 *
 * 候选决定以 Phase 1 文件清单为基础，并只接受 policy 中逐项批准的 rewrite、
 * 后续新增与额外排除。冻结 manifest 后，源树新增、删除或内容变化都会失败；
 * 物化目标必须位于源仓库之外，且不得预先存在。工具不会 commit、push、删除
 * 目录或覆盖已有候选。
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  constants as fsConstants,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateRepositoryLicenseCoverage } from './validate-repository-license-coverage.mjs';

const TOOL_VERSION = 1;
const DEFAULT_POLICY_PATH = 'docs/compliance/public-candidate-policy.json';
const allowedPolicyKeys = new Set([
  'additionalExclusions',
  'approvedAdditionPaths',
  'approvedRewritePaths',
  'candidateVersion',
  'schemaVersion',
  'sourceInventory',
  'sourceInventorySha256',
]);
const allowedManifestKeys = new Set([
  'candidateTreeSha256',
  'candidateVersion',
  'entries',
  'policySha256',
  'schemaVersion',
  'sourceHead',
  'sourceInventorySha256',
  'sourceRepository',
  'sourceTreeSha256',
  'summary',
  'toolVersion',
]);
const allowedManifestEntryKeys = new Set([
  'decision',
  'license',
  'licenseClassification',
  'licenseEvidence',
  'path',
  'reasonCode',
  'sha256',
  'sizeBytes',
]);
const allowedManifestSummaryKeys = new Set([
  'excludedFiles',
  'includedBytes',
  'includedFiles',
  'sourceFiles',
]);
const forbiddenSegments = new Set([
  '.astro',
  '.cache',
  '.codex',
  '.codex-runtime',
  '.git',
  '.idea',
  '.sanity',
  '.vite',
  '.vscode',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);
const forbiddenSecretExtensions = new Set([
  '.jks',
  '.key',
  '.keystore',
  '.p12',
  '.pem',
  '.pfx',
]);

function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeFilesystemPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithin(parentPath, childPath) {
  const parent = normalizeFilesystemPath(parentPath);
  const child = normalizeFilesystemPath(childPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertDisjointPaths(sourceRoot, externalPath, label) {
  if (isWithin(sourceRoot, externalPath) || isWithin(externalPath, sourceRoot)) {
    throw new Error(`${label} must be outside and must not contain the source repository.`);
  }
}

async function resolveProspectiveRealPath(targetPath) {
  let cursor = path.resolve(targetPath);
  const suffix = [];
  while (true) {
    try {
      await lstat(cursor);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new Error(`Cannot resolve an existing parent for ${targetPath}.`);
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
  const realExistingPath = await realpath(cursor);
  return path.join(realExistingPath, ...suffix);
}

function assertCanonicalRepositoryPath(repositoryPath, label = 'repository path') {
  if (!isNonEmptyString(repositoryPath) ||
      /[\u0000-\u001f\u007f]/.test(repositoryPath) ||
      repositoryPath.includes('\\') ||
      repositoryPath.startsWith('/') ||
      path.posix.normalize(repositoryPath) !== repositoryPath ||
      repositoryPath === '.' ||
      repositoryPath.startsWith('../')) {
    throw new Error(`${label} is not a canonical repository-relative path: ${repositoryPath}`);
  }
}

export function assertPublicCandidatePath(repositoryPath) {
  assertCanonicalRepositoryPath(repositoryPath);
  const segments = repositoryPath.toLowerCase().split('/');
  for (const segment of segments) {
    if (forbiddenSegments.has(segment)) {
      throw new Error(`Public candidate path contains forbidden segment "${segment}": ${repositoryPath}`);
    }
  }

  const basename = path.posix.basename(repositoryPath).toLowerCase();
  const extension = path.posix.extname(basename);
  if (basename === '.env' ||
      (basename.startsWith('.env.') && !basename.endsWith('.example')) ||
      basename.startsWith('.dev.vars') ||
      basename === '.ds_store' ||
      basename.endsWith('.log') ||
      forbiddenSecretExtensions.has(basename) ||
      forbiddenSecretExtensions.has(extension)) {
    throw new Error(`Public candidate path is an environment, cache, log, or key file: ${repositoryPath}`);
  }
}

function runGit(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
}

async function assertRepositoryRoot(root) {
  const resolvedRoot = path.resolve(root);
  const actualRoot = path.resolve(runGit(resolvedRoot, ['rev-parse', '--show-toplevel']).trim());
  if (normalizeFilesystemPath(actualRoot) !== normalizeFilesystemPath(resolvedRoot)) {
    throw new Error(`--root must be the Git repository root: ${actualRoot}`);
  }
  return resolvedRoot;
}

function parseNullPaths(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(toPosixPath)
    .sort(codePointCompare);
}

async function listCurrentRepositoryFiles(root) {
  const realRoot = await realpath(root);
  const paths = parseNullPaths(runGit(
    root,
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'buffer' },
  ));
  const caseFolded = new Map();
  const files = [];

  for (const repositoryPath of paths) {
    assertPublicCandidatePath(repositoryPath);
    const folded = repositoryPath.toLowerCase();
    if (caseFolded.has(folded) && caseFolded.get(folded) !== repositoryPath) {
      throw new Error(
        `Repository paths collide case-insensitively: ${caseFolded.get(folded)}, ${repositoryPath}`,
      );
    }
    caseFolded.set(folded, repositoryPath);

    const absolutePath = path.join(root, ...repositoryPath.split('/'));
    let entry;
    try {
      entry = await lstat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in the public candidate: ${repositoryPath}`);
    }
    if (!entry.isFile()) {
      throw new Error(`Git candidate is not a regular file: ${repositoryPath}`);
    }
    const actualPath = await realpath(absolutePath);
    if (!isWithin(realRoot, actualPath)) {
      throw new Error(`Repository path escapes through a linked ancestor: ${repositoryPath}`);
    }
    files.push(repositoryPath);
  }

  return files;
}

async function readJsonDocument(absolutePath, label) {
  let source;
  try {
    source = await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
  try {
    return { document: JSON.parse(source.replace(/^\uFEFF/, '')), source };
  } catch (error) {
    throw new Error(`Cannot parse ${label} as JSON: ${error.message}`);
  }
}

function validateSortedPathArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const seen = new Set();
  for (const entry of value) {
    assertCanonicalRepositoryPath(entry, label);
    if (seen.has(entry)) throw new Error(`${label} contains duplicate path: ${entry}`);
    seen.add(entry);
  }
  const sorted = [...value].sort(codePointCompare);
  if (JSON.stringify(sorted) !== JSON.stringify(value)) {
    throw new Error(`${label} must use deterministic code-point order.`);
  }
  return new Set(value);
}

function validatePolicy(policy) {
  if (!isPlainObject(policy)) throw new Error('Public candidate policy must be an object.');
  for (const key of Object.keys(policy)) {
    if (!allowedPolicyKeys.has(key)) throw new Error(`Public candidate policy has unknown key: ${key}`);
  }
  if (policy.schemaVersion !== 1) throw new Error('Public candidate policy schemaVersion must equal 1.');
  if (!isNonEmptyString(policy.candidateVersion)) {
    throw new Error('Public candidate policy candidateVersion is required.');
  }
  assertCanonicalRepositoryPath(policy.sourceInventory, 'sourceInventory');
  if (!/^[0-9a-f]{64}$/.test(policy.sourceInventorySha256 ?? '')) {
    throw new Error('Public candidate policy sourceInventorySha256 must be lowercase SHA-256.');
  }

  const approvedRewritePaths = validateSortedPathArray(
    policy.approvedRewritePaths,
    'approvedRewritePaths',
  );
  const approvedAdditionPaths = validateSortedPathArray(
    policy.approvedAdditionPaths,
    'approvedAdditionPaths',
  );
  if (!Array.isArray(policy.additionalExclusions)) {
    throw new Error('additionalExclusions must be an array.');
  }
  const additionalExclusions = new Map();
  for (const [index, exclusion] of policy.additionalExclusions.entries()) {
    if (!isPlainObject(exclusion) ||
        Object.keys(exclusion).some((key) => !['path', 'reasonCode'].includes(key))) {
      throw new Error(`additionalExclusions[${index}] must contain only path and reasonCode.`);
    }
    assertCanonicalRepositoryPath(exclusion.path, `additionalExclusions[${index}].path`);
    if (!isNonEmptyString(exclusion.reasonCode)) {
      throw new Error(`additionalExclusions[${index}].reasonCode is required.`);
    }
    if (additionalExclusions.has(exclusion.path)) {
      throw new Error(`additionalExclusions contains duplicate path: ${exclusion.path}`);
    }
    additionalExclusions.set(exclusion.path, exclusion.reasonCode);
  }
  const sortedExclusions = [...additionalExclusions.keys()].sort(codePointCompare);
  if (JSON.stringify(sortedExclusions) !== JSON.stringify([...additionalExclusions.keys()])) {
    throw new Error('additionalExclusions must use deterministic code-point order.');
  }

  for (const repositoryPath of approvedRewritePaths) {
    if (approvedAdditionPaths.has(repositoryPath) || additionalExclusions.has(repositoryPath)) {
      throw new Error(`Public candidate policy gives conflicting decisions for ${repositoryPath}.`);
    }
  }
  for (const repositoryPath of approvedAdditionPaths) {
    if (additionalExclusions.has(repositoryPath)) {
      throw new Error(`Public candidate policy gives conflicting decisions for ${repositoryPath}.`);
    }
  }

  return { additionalExclusions, approvedAdditionPaths, approvedRewritePaths };
}

function inventoryDecisionIndex(inventory) {
  if (!isPlainObject(inventory) || !Array.isArray(inventory.sourceFiles) ||
      !Array.isArray(inventory.worktreeOverlay)) {
    throw new Error('Source inventory must contain sourceFiles and worktreeOverlay arrays.');
  }
  const index = new Map();
  for (const [collectionName, entries] of [
    ['sourceFiles', inventory.sourceFiles],
    ['worktreeOverlay', inventory.worktreeOverlay],
  ]) {
    for (const [entryIndex, entry] of entries.entries()) {
      if (!isPlainObject(entry)) {
        throw new Error(`Source inventory ${collectionName}[${entryIndex}] must be an object.`);
      }
      assertCanonicalRepositoryPath(entry.path, `${collectionName}[${entryIndex}].path`);
      if (!['exclude', 'include', 'rewrite'].includes(entry.decision) ||
          !isNonEmptyString(entry.reasonCode)) {
        throw new Error(`Source inventory has an incomplete decision for ${entry.path}.`);
      }
      if (collectionName === 'sourceFiles' && index.has(entry.path)) {
        throw new Error(`Source inventory contains duplicate source path: ${entry.path}`);
      }
      index.set(entry.path, { decision: entry.decision, reasonCode: entry.reasonCode });
    }
  }
  return index;
}

function decidePath({ inventoryDecision, policyDecision, repositoryPath }) {
  if (inventoryDecision) {
    if (policyDecision.additionalExclusions.has(repositoryPath) ||
        policyDecision.approvedAdditionPaths.has(repositoryPath)) {
      throw new Error(`Policy treats inventory path as a later addition/exclusion: ${repositoryPath}`);
    }
    if (inventoryDecision.decision === 'rewrite') {
      if (!policyDecision.approvedRewritePaths.has(repositoryPath)) {
        throw new Error(`Inventory rewrite has no explicit Phase 6 approval: ${repositoryPath}`);
      }
      return {
        decision: 'include',
        reasonCode: 'APPROVED_REWRITE_AFTER_PHASE5_GATES',
      };
    }
    if (policyDecision.approvedRewritePaths.has(repositoryPath)) {
      throw new Error(`approvedRewritePaths does not resolve to an inventory rewrite: ${repositoryPath}`);
    }
    return inventoryDecision;
  }

  if (policyDecision.approvedRewritePaths.has(repositoryPath)) {
    throw new Error(`approvedRewritePaths is absent from the source inventory: ${repositoryPath}`);
  }
  if (policyDecision.approvedAdditionPaths.has(repositoryPath)) {
    return {
      decision: 'include',
      reasonCode: 'APPROVED_POST_INVENTORY_ADDITION',
    };
  }
  if (policyDecision.additionalExclusions.has(repositoryPath)) {
    return {
      decision: 'exclude',
      reasonCode: policyDecision.additionalExclusions.get(repositoryPath),
    };
  }
  throw new Error(`Current repository path has no explicit public candidate decision: ${repositoryPath}`);
}

function digestEntries(entries, fields) {
  const rows = entries.map((entry) => fields.map((field) => entry[field]).join('\0'));
  return sha256(Buffer.from(`${rows.join('\n')}\n`, 'utf8'));
}

async function buildEntry(root, repositoryPath, decision, mapping) {
  const absolutePath = path.join(root, ...repositoryPath.split('/'));
  const fileStat = await stat(absolutePath);
  const buffer = await readFile(absolutePath);
  if (fileStat.size !== buffer.length) {
    throw new Error(`File changed while hashing: ${repositoryPath}`);
  }
  return {
    path: repositoryPath,
    sizeBytes: buffer.length,
    sha256: sha256(buffer),
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    license: mapping.license,
    licenseClassification: mapping.classification,
    licenseEvidence: mapping.evidence,
  };
}

export async function buildCandidateManifest({
  root = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
} = {}) {
  const resolvedRoot = await assertRepositoryRoot(root);
  assertCanonicalRepositoryPath(policyPath, 'policyPath');
  const absolutePolicyPath = path.join(resolvedRoot, ...policyPath.split('/'));
  const { document: policy, source: policySource } = await readJsonDocument(
    absolutePolicyPath,
    policyPath,
  );
  const policyDecision = validatePolicy(policy);
  const packageDocument = JSON.parse(await readFile(path.join(resolvedRoot, 'package.json'), 'utf8'));
  if (packageDocument.version !== policy.candidateVersion) {
    throw new Error(
      `Candidate policy version ${policy.candidateVersion} does not match package.json ${packageDocument.version}.`,
    );
  }

  const absoluteInventoryPath = path.join(resolvedRoot, ...policy.sourceInventory.split('/'));
  const inventoryBuffer = await readFile(absoluteInventoryPath);
  const actualInventorySha = sha256(inventoryBuffer);
  if (actualInventorySha !== policy.sourceInventorySha256) {
    throw new Error(
      `Source inventory SHA-256 changed: expected ${policy.sourceInventorySha256}; actual ${actualInventorySha}.`,
    );
  }
  const inventory = JSON.parse(inventoryBuffer.toString('utf8').replace(/^\uFEFF/, ''));
  const inventoryIndex = inventoryDecisionIndex(inventory);
  const repositoryPaths = await listCurrentRepositoryFiles(resolvedRoot);

  const coverage = await validateRepositoryLicenseCoverage({
    root: resolvedRoot,
    candidatePaths: repositoryPaths,
  });
  if (coverage.errors.length > 0) {
    throw new Error(`License coverage failed:\n- ${coverage.errors.join('\n- ')}`);
  }
  if (coverage.candidateCount !== repositoryPaths.length ||
      coverage.mappings.length !== repositoryPaths.length) {
    throw new Error(
      `License coverage count mismatch: paths=${repositoryPaths.length}; ` +
      `candidates=${coverage.candidateCount}; mappings=${coverage.mappings.length}.`,
    );
  }
  const licenseByPath = new Map(coverage.mappings.map((mapping) => [mapping.path, mapping]));
  const entries = [];
  for (const repositoryPath of repositoryPaths) {
    const mapping = licenseByPath.get(repositoryPath);
    if (!mapping) throw new Error(`Missing license mapping for ${repositoryPath}.`);
    const decision = decidePath({
      inventoryDecision: inventoryIndex.get(repositoryPath),
      policyDecision,
      repositoryPath,
    });
    entries.push(await buildEntry(resolvedRoot, repositoryPath, decision, mapping));
  }

  const existingPaths = new Set(repositoryPaths);
  for (const [label, paths] of [
    ['approvedRewritePaths', policyDecision.approvedRewritePaths],
    ['approvedAdditionPaths', policyDecision.approvedAdditionPaths],
  ]) {
    for (const repositoryPath of paths) {
      if (!existingPaths.has(repositoryPath)) {
        throw new Error(`${label} contains a path absent from the current tree: ${repositoryPath}`);
      }
    }
  }

  const included = entries.filter((entry) => entry.decision === 'include');
  const excluded = entries.filter((entry) => entry.decision === 'exclude');
  return {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    candidateVersion: policy.candidateVersion,
    sourceRepository: path.basename(resolvedRoot),
    sourceHead: runGit(resolvedRoot, ['rev-parse', 'HEAD']).trim(),
    sourceInventorySha256: actualInventorySha,
    policySha256: sha256(Buffer.from(policySource, 'utf8')),
    sourceTreeSha256: digestEntries(entries, [
      'path',
      'sizeBytes',
      'sha256',
      'decision',
      'reasonCode',
      'license',
      'licenseClassification',
      'licenseEvidence',
    ]),
    candidateTreeSha256: digestEntries(included, ['path', 'sizeBytes', 'sha256']),
    summary: {
      sourceFiles: entries.length,
      includedFiles: included.length,
      excludedFiles: excluded.length,
      includedBytes: included.reduce((total, entry) => total + entry.sizeBytes, 0),
    },
    entries,
  };
}

function validateManifestShape(manifest) {
  if (!isPlainObject(manifest)) throw new Error('Candidate manifest must be an object.');
  for (const key of Object.keys(manifest)) {
    if (!allowedManifestKeys.has(key)) throw new Error(`Candidate manifest has unknown key: ${key}`);
  }
  if (manifest.schemaVersion !== 1 || manifest.toolVersion !== TOOL_VERSION) {
    throw new Error(`Unsupported candidate manifest schema/tool version.`);
  }
  if (!isNonEmptyString(manifest.candidateVersion) ||
      !isNonEmptyString(manifest.sourceRepository) ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.sourceHead ?? '')) {
    throw new Error('Candidate manifest identity fields are incomplete.');
  }
  for (const field of [
    'candidateTreeSha256',
    'policySha256',
    'sourceInventorySha256',
    'sourceTreeSha256',
  ]) {
    if (!/^[0-9a-f]{64}$/.test(manifest[field] ?? '')) {
      throw new Error(`Candidate manifest ${field} must be lowercase SHA-256.`);
    }
  }
  if (!Array.isArray(manifest.entries) || !isPlainObject(manifest.summary)) {
    throw new Error('Candidate manifest entries and summary are required.');
  }
  for (const key of Object.keys(manifest.summary)) {
    if (!allowedManifestSummaryKeys.has(key)) {
      throw new Error(`Candidate manifest summary has unknown key: ${key}`);
    }
  }
  let previousPath = null;
  const caseFolded = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    if (!isPlainObject(entry)) throw new Error(`Candidate manifest entries[${index}] must be an object.`);
    for (const key of Object.keys(entry)) {
      if (!allowedManifestEntryKeys.has(key)) {
        throw new Error(`Candidate manifest entry has unknown key: ${entry.path ?? index}.${key}`);
      }
    }
    assertPublicCandidatePath(entry.path);
    if (previousPath !== null && codePointCompare(previousPath, entry.path) >= 0) {
      throw new Error('Candidate manifest entries must use unique deterministic path order.');
    }
    previousPath = entry.path;
    const folded = entry.path.toLowerCase();
    if (caseFolded.has(folded)) throw new Error(`Candidate manifest has case collision: ${entry.path}`);
    caseFolded.add(folded);
    if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0 ||
        !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '') ||
        !['exclude', 'include'].includes(entry.decision) ||
        !isNonEmptyString(entry.reasonCode) ||
        !isNonEmptyString(entry.license) ||
        !isNonEmptyString(entry.licenseClassification) ||
        !isNonEmptyString(entry.licenseEvidence)) {
      throw new Error(`Candidate manifest entry is incomplete: ${entry.path}`);
    }
  }
  const included = manifest.entries.filter((entry) => entry.decision === 'include');
  const excluded = manifest.entries.filter((entry) => entry.decision === 'exclude');
  const expectedSummary = {
    sourceFiles: manifest.entries.length,
    includedFiles: included.length,
    excludedFiles: excluded.length,
    includedBytes: included.reduce((total, entry) => total + entry.sizeBytes, 0),
  };
  if (JSON.stringify(manifest.summary) !== JSON.stringify(expectedSummary)) {
    throw new Error('Candidate manifest summary does not match its entries.');
  }
  const expectedSourceTreeSha = digestEntries(manifest.entries, [
    'path',
    'sizeBytes',
    'sha256',
    'decision',
    'reasonCode',
    'license',
    'licenseClassification',
    'licenseEvidence',
  ]);
  const expectedCandidateTreeSha = digestEntries(included, ['path', 'sizeBytes', 'sha256']);
  if (manifest.sourceTreeSha256 !== expectedSourceTreeSha ||
      manifest.candidateTreeSha256 !== expectedCandidateTreeSha) {
    throw new Error('Candidate manifest tree digest does not match its entries.');
  }
}

async function readCandidateManifest(manifestPath) {
  const { document } = await readJsonDocument(path.resolve(manifestPath), 'candidate manifest');
  validateManifestShape(document);
  return document;
}

function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function freezeCandidateManifest({
  root = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
  manifestPath,
} = {}) {
  if (!manifestPath) throw new Error('--manifest is required.');
  const resolvedRoot = await assertRepositoryRoot(root);
  const absoluteManifestPath = await resolveProspectiveRealPath(manifestPath);
  assertDisjointPaths(resolvedRoot, absoluteManifestPath, 'Manifest path');
  await mkdir(path.dirname(absoluteManifestPath), { recursive: true });
  const manifest = await buildCandidateManifest({ root: resolvedRoot, policyPath });
  await writeFile(absoluteManifestPath, serializeManifest(manifest), { encoding: 'utf8', flag: 'wx' });
  return manifest;
}

export async function verifySourceAgainstManifest({
  root = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
  manifest,
} = {}) {
  validateManifestShape(manifest);
  const current = await buildCandidateManifest({ root, policyPath });
  if (serializeManifest(current) !== serializeManifest(manifest)) {
    throw new Error(
      `Source tree no longer matches the frozen manifest: ` +
      `expected=${manifest.sourceTreeSha256}; actual=${current.sourceTreeSha256}.`,
    );
  }
  return current;
}

async function listCandidateFiles(candidateRoot) {
  const files = [];
  async function visit(absoluteDirectory, relativeDirectory = '') {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => codePointCompare(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const metadata = await lstat(absolutePath);
      if (relativePath === '.git') {
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new Error('Candidate .git must be a real directory when present.');
        }
        continue;
      }
      if (metadata.isSymbolicLink()) {
        throw new Error(`Candidate contains symbolic link: ${relativePath}`);
      }
      if (metadata.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (metadata.isFile()) {
        assertPublicCandidatePath(relativePath);
        files.push(relativePath);
      } else {
        throw new Error(`Candidate contains unsupported filesystem entry: ${relativePath}`);
      }
    }
  }
  await visit(candidateRoot);
  return files.sort(codePointCompare);
}

export async function verifyCandidateAgainstManifest({ candidateRoot, manifest } = {}) {
  if (!candidateRoot) throw new Error('--candidate is required.');
  validateManifestShape(manifest);
  const resolvedCandidate = path.resolve(candidateRoot);
  const metadata = await lstat(resolvedCandidate);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('Candidate root must be a real directory.');
  }
  const expectedEntries = manifest.entries.filter((entry) => entry.decision === 'include');
  const expectedPaths = expectedEntries.map((entry) => entry.path);
  const actualPaths = await listCandidateFiles(resolvedCandidate);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const expected = new Set(expectedPaths);
    const actual = new Set(actualPaths);
    const missing = expectedPaths.filter((entry) => !actual.has(entry));
    const extra = actualPaths.filter((entry) => !expected.has(entry));
    throw new Error(
      `Candidate path set differs from manifest: missing=${missing.join(',') || '(none)'}; ` +
      `extra=${extra.join(',') || '(none)'}.`,
    );
  }

  const actualEntries = [];
  for (const expected of expectedEntries) {
    const buffer = await readFile(path.join(resolvedCandidate, ...expected.path.split('/')));
    const actual = { path: expected.path, sizeBytes: buffer.length, sha256: sha256(buffer) };
    if (actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256) {
      throw new Error(`Candidate content differs from manifest: ${expected.path}`);
    }
    actualEntries.push(actual);
  }
  const actualTreeSha = digestEntries(actualEntries, ['path', 'sizeBytes', 'sha256']);
  if (actualTreeSha !== manifest.candidateTreeSha256) {
    throw new Error(
      `Candidate tree digest differs: expected=${manifest.candidateTreeSha256}; actual=${actualTreeSha}.`,
    );
  }
  try {
    const gitMetadata = await lstat(path.join(resolvedCandidate, '.git'));
    if (!gitMetadata.isDirectory() || gitMetadata.isSymbolicLink()) {
      throw new Error('Candidate .git must be a real directory when present.');
    }
    assertCandidateGitMetadata(resolvedCandidate, { allowSingleRootCommit: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { candidateTreeSha256: actualTreeSha, fileCount: actualEntries.length };
}

function assertCandidateGitMetadata(candidateRoot, { allowSingleRootCommit }) {
  const refs = runGit(candidateRoot, ['for-each-ref', '--format=%(refname)'])
    .split(/\r?\n/)
    .filter(Boolean);
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: candidateRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  const remotes = runGit(candidateRoot, ['remote'])
    .split(/\r?\n/)
    .filter(Boolean);
  if (remotes.length > 0) {
    throw new Error(`Candidate Git repository unexpectedly has remotes: ${remotes.join(', ')}`);
  }

  if (head.status === 0) {
    if (!allowSingleRootCommit) {
      throw new Error('Fresh candidate Git repository unexpectedly has a commit.');
    }
    if (refs.length !== 1 || refs[0] !== 'refs/heads/main') {
      throw new Error(`Committed candidate must have only refs/heads/main: ${refs.join(', ')}`);
    }
    const commits = runGit(candidateRoot, ['rev-list', '--all', '--parents'])
      .split(/\r?\n/)
      .filter(Boolean);
    if (commits.length !== 1 || commits[0].trim().split(/\s+/).length !== 1) {
      throw new Error('Committed candidate must contain exactly one parentless root commit.');
    }
    const status = runGit(candidateRoot, ['status', '--porcelain=v1']);
    if (status.trim()) {
      throw new Error('Committed candidate working tree must exactly match its single root commit.');
    }
    const fsck = spawnSync('git', ['fsck', '--full', '--unreachable', '--no-reflogs'], {
      cwd: candidateRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (fsck.status !== 0 || String(fsck.stdout ?? '').trim()) {
      throw new Error('Committed candidate contains invalid or unreachable Git objects.');
    }
    return;
  }

  if (refs.length > 0) {
    throw new Error(`Fresh candidate Git repository unexpectedly has refs: ${refs.join(', ')}`);
  }
  const objectCounts = Object.fromEntries(
    runGit(candidateRoot, ['count-objects', '-v'])
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(':').map((part) => part.trim())),
  );
  if (Number(objectCounts.count ?? 0) !== 0 || Number(objectCounts['in-pack'] ?? 0) !== 0) {
    throw new Error(
      `Fresh candidate Git repository unexpectedly contains objects: ` +
      `loose=${objectCounts.count ?? '(unknown)'}; packed=${objectCounts['in-pack'] ?? '(unknown)'}.`,
    );
  }
}

export async function materializeCandidate({
  root = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
  manifestPath,
  candidateRoot,
  initializeGit = false,
} = {}) {
  if (!manifestPath) throw new Error('--manifest is required.');
  if (!candidateRoot) throw new Error('--candidate is required.');
  const resolvedRoot = await assertRepositoryRoot(root);
  const absoluteManifestPath = await resolveProspectiveRealPath(manifestPath);
  const resolvedCandidate = await resolveProspectiveRealPath(candidateRoot);
  assertDisjointPaths(resolvedRoot, absoluteManifestPath, 'Manifest path');
  assertDisjointPaths(resolvedRoot, resolvedCandidate, 'Candidate root');
  if (isWithin(resolvedCandidate, absoluteManifestPath)) {
    throw new Error('Manifest must remain outside the candidate tree.');
  }
  try {
    await lstat(resolvedCandidate);
    throw new Error(`Candidate root already exists; refusing to overwrite it: ${resolvedCandidate}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const manifest = await readCandidateManifest(absoluteManifestPath);
  await verifySourceAgainstManifest({ root: resolvedRoot, policyPath, manifest });
  await mkdir(resolvedCandidate, { recursive: false });
  const realCandidate = await realpath(resolvedCandidate);
  assertDisjointPaths(resolvedRoot, realCandidate, 'Candidate root');

  for (const entry of manifest.entries) {
    if (entry.decision !== 'include') continue;
    const sourcePath = path.join(resolvedRoot, ...entry.path.split('/'));
    const destinationPath = path.join(realCandidate, ...entry.path.split('/'));
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
  }

  await verifySourceAgainstManifest({ root: resolvedRoot, policyPath, manifest });
  const verification = await verifyCandidateAgainstManifest({
    candidateRoot: realCandidate,
    manifest,
  });
  if (initializeGit) {
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
      cwd: realCandidate,
      encoding: 'utf8',
      windowsHide: true,
    });
    assertCandidateGitMetadata(realCandidate, { allowSingleRootCommit: false });
    await verifyCandidateAgainstManifest({ candidateRoot: realCandidate, manifest });
  }
  return { ...verification, gitInitialized: initializeGit, manifest };
}

export async function verifyMaterializedCandidate({
  root = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
  manifestPath,
  candidateRoot,
} = {}) {
  if (!manifestPath) throw new Error('--manifest is required.');
  if (!candidateRoot) throw new Error('--candidate is required.');
  const resolvedRoot = await assertRepositoryRoot(root);
  const absoluteManifestPath = await resolveProspectiveRealPath(manifestPath);
  const resolvedCandidate = await resolveProspectiveRealPath(candidateRoot);
  assertDisjointPaths(resolvedRoot, absoluteManifestPath, 'Manifest path');
  assertDisjointPaths(resolvedRoot, resolvedCandidate, 'Candidate root');
  const manifest = await readCandidateManifest(absoluteManifestPath);
  await verifySourceAgainstManifest({ root: resolvedRoot, policyPath, manifest });
  return verifyCandidateAgainstManifest({ candidateRoot: resolvedCandidate, manifest });
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!['freeze', 'materialize', 'verify'].includes(command)) {
    throw new Error('Usage: prepare-public-candidate.mjs <freeze|materialize|verify> [options]');
  }
  const options = {
    candidateRoot: null,
    command,
    initializeGit: false,
    manifestPath: null,
    policyPath: DEFAULT_POLICY_PATH,
    root: process.cwd(),
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const nextValue = () => {
      const value = rest[index + 1];
      if (!isNonEmptyString(value) || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      return value;
    };
    if (argument === '--root') {
      options.root = path.resolve(nextValue());
    } else if (argument === '--policy') {
      options.policyPath = nextValue();
    } else if (argument === '--manifest') {
      options.manifestPath = path.resolve(nextValue());
    } else if (argument === '--candidate') {
      options.candidateRoot = path.resolve(nextValue());
    } else if (argument === '--git-init') {
      options.initializeGit = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.command === 'freeze' && (options.candidateRoot || options.initializeGit)) {
    throw new Error('freeze accepts --manifest but not --candidate or --git-init.');
  }
  if (options.command === 'verify' && options.initializeGit) {
    throw new Error('verify does not accept --git-init.');
  }
  return options;
}

export async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === 'freeze') {
    const manifest = await freezeCandidateManifest(options);
    console.log(
      `Public candidate manifest frozen: source=${manifest.summary.sourceFiles}; ` +
      `include=${manifest.summary.includedFiles}; exclude=${manifest.summary.excludedFiles}; ` +
      `tree=${manifest.candidateTreeSha256}.`,
    );
    return manifest;
  }
  if (options.command === 'materialize') {
    const result = await materializeCandidate(options);
    console.log(
      `Public candidate materialized: files=${result.fileCount}; tree=${result.candidateTreeSha256}; ` +
      `gitInitialized=${result.gitInitialized}.`,
    );
    return result;
  }
  const result = await verifyMaterializedCandidate(options);
  console.log(
    `Public candidate verified: files=${result.fileCount}; tree=${result.candidateTreeSha256}.`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`Public candidate preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
