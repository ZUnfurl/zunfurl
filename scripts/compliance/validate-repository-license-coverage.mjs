/**
 * 验证公开源码候选树中的每个文件都有唯一、明确的许可分类。
 *
 * 门禁故意不使用兜底通配符：未知目录、未知扩展名、未登记媒体、vendor
 * 路径和符号链接都失败，避免新增文件在无复核的情况下继承错误许可。
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const policyPath = 'docs/compliance/license-coverage.json';
const canonicalApacheLicenseSha256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';
const requiredCopyrightNotice = 'Copyright 2026 Noodle Freeman';
const requiredFirstPartyLicense = 'Apache-2.0';
const requiredMediaRoot = 'apps/storefront/public';
const requiredAssetManifest = 'docs/compliance/ASSET_LICENSES.yml';
const placeholderPattern = /(?:^|\b)(?:noassertion|pending|tbd|todo|unknown)(?:\b|$)|<[^>]+>/i;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCanonicalRelativePath(value) {
  return isNonEmptyString(value) &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    path.posix.normalize(value) === value &&
    value !== '.' &&
    !value.startsWith('../');
}

function normalizeText(value) {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function pathIsFile(root, repositoryPath) {
  try {
    return (await stat(path.join(root, ...repositoryPath.split('/')))).isFile();
  } catch {
    return false;
  }
}

async function readJsonFile(root, repositoryPath, errors) {
  try {
    const source = await readFile(path.join(root, ...repositoryPath.split('/')), 'utf8');
    return JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    errors.push(`Cannot read valid JSON from ${repositoryPath}: ${error.message}`);
    return null;
  }
}

function validateStringArray(errors, value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !isNonEmptyString(entry))) {
    errors.push(`${label} must be a non-empty string array.`);
    return [];
  }

  if (new Set(value).size !== value.length) {
    errors.push(`${label} must not contain duplicates.`);
  }

  return value;
}

async function validatePolicy({ root, policy, errors }) {
  if (!isPlainObject(policy)) {
    errors.push(`${policyPath} root must be an object.`);
    return;
  }

  const allowedKeys = new Set([
    'schemaVersion',
    'copyrightNotice',
    'exactExceptions',
    'firstPartyExactFiles',
    'firstPartyExtensions',
    'firstPartyLicense',
    'firstPartyRoots',
    'forbiddenPathSegments',
    'manifestGovernedMedia',
  ]);

  for (const key of Object.keys(policy)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${policyPath} has unknown property: ${key}`);
    }
  }

  if (policy.schemaVersion !== 1) {
    errors.push(`${policyPath}.schemaVersion must equal 1.`);
  }
  if (policy.copyrightNotice !== requiredCopyrightNotice) {
    errors.push(`${policyPath}.copyrightNotice must equal ${requiredCopyrightNotice}.`);
  }
  if (policy.firstPartyLicense !== requiredFirstPartyLicense) {
    errors.push(`${policyPath}.firstPartyLicense must equal ${requiredFirstPartyLicense}.`);
  }

  for (const [label, values] of [
    ['firstPartyExactFiles', policy.firstPartyExactFiles],
    ['firstPartyRoots', policy.firstPartyRoots],
  ]) {
    for (const value of validateStringArray(errors, values, `${policyPath}.${label}`)) {
      if (!isCanonicalRelativePath(value)) {
        errors.push(`${policyPath}.${label} contains a non-canonical path: ${value}`);
      }
    }
  }

  for (const extension of validateStringArray(
    errors,
    policy.firstPartyExtensions,
    `${policyPath}.firstPartyExtensions`,
  )) {
    if (!/^\.[a-z0-9.]+$/.test(extension)) {
      errors.push(`${policyPath}.firstPartyExtensions contains an invalid extension: ${extension}`);
    }
  }

  for (const segment of validateStringArray(
    errors,
    policy.forbiddenPathSegments,
    `${policyPath}.forbiddenPathSegments`,
  )) {
    if (segment.includes('/') || segment.includes('\\') || segment === '.' || segment === '..') {
      errors.push(`${policyPath}.forbiddenPathSegments contains an invalid segment: ${segment}`);
    }
  }

  const media = policy.manifestGovernedMedia;
  if (!isPlainObject(media)) {
    errors.push(`${policyPath}.manifestGovernedMedia must be an object.`);
  } else {
    const mediaKeys = new Set(['allowedLicenses', 'extensions', 'manifest', 'root']);
    for (const key of Object.keys(media)) {
      if (!mediaKeys.has(key)) {
        errors.push(`${policyPath}.manifestGovernedMedia has unknown property: ${key}`);
      }
    }
    if (media.root !== requiredMediaRoot) {
      errors.push(`${policyPath}.manifestGovernedMedia.root must equal ${requiredMediaRoot}.`);
    }
    if (media.manifest !== requiredAssetManifest) {
      errors.push(`${policyPath}.manifestGovernedMedia.manifest must equal ${requiredAssetManifest}.`);
    }
    const licenses = validateStringArray(
      errors,
      media.allowedLicenses,
      `${policyPath}.manifestGovernedMedia.allowedLicenses`,
    );
    if (licenses.length !== 1 || licenses[0] !== 'CC0-1.0') {
      errors.push(`${policyPath}.manifestGovernedMedia.allowedLicenses must contain only CC0-1.0.`);
    }
    for (const extension of validateStringArray(
      errors,
      media.extensions,
      `${policyPath}.manifestGovernedMedia.extensions`,
    )) {
      if (!/^\.[a-z0-9.]+$/.test(extension)) {
        errors.push(`${policyPath}.manifestGovernedMedia.extensions contains an invalid extension: ${extension}`);
      }
    }
  }

  if (!Array.isArray(policy.exactExceptions) || policy.exactExceptions.length === 0) {
    errors.push(`${policyPath}.exactExceptions must be a non-empty array.`);
  } else {
    const paths = new Set();
    for (const [index, exception] of policy.exactExceptions.entries()) {
      const label = `${policyPath}.exactExceptions[${index}]`;
      if (!isPlainObject(exception)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      const keys = new Set(['classification', 'evidence', 'license', 'path']);
      for (const key of Object.keys(exception)) {
        if (!keys.has(key)) {
          errors.push(`${label} has unknown property: ${key}`);
        }
      }
      if (!isCanonicalRelativePath(exception.path)) {
        errors.push(`${label}.path must be a canonical repository-relative path.`);
      } else if (paths.has(exception.path.toLowerCase())) {
        errors.push(`${label}.path duplicates another exception: ${exception.path}`);
      } else {
        paths.add(exception.path.toLowerCase());
      }
      for (const key of ['classification', 'license', 'evidence']) {
        if (!isNonEmptyString(exception[key]) || placeholderPattern.test(exception[key])) {
          errors.push(`${label}.${key} must be a non-placeholder string.`);
        }
      }
      if (isNonEmptyString(exception.evidence) && !/^https:\/\//i.test(exception.evidence)) {
        if (!isCanonicalRelativePath(exception.evidence) ||
            !await pathIsFile(root, exception.evidence)) {
          errors.push(`${label}.evidence must resolve to an HTTPS URL or repository file: ${exception.evidence}`);
        }
      }
    }

    for (const required of ['LICENSE', 'package-lock.json', 'sbom.cdx.json']) {
      if (!paths.has(required.toLowerCase())) {
        errors.push(`${policyPath}.exactExceptions must classify ${required}.`);
      }
    }
  }
}

function buildAssetLicenseIndex({ manifest, policy, errors }) {
  const index = new Map();
  const mediaPolicy = isPlainObject(policy.manifestGovernedMedia)
    ? policy.manifestGovernedMedia
    : {};
  if (!isPlainObject(manifest) || !Array.isArray(manifest.provenanceRecords) ||
      !Array.isArray(manifest.assets)) {
    errors.push(`${requiredAssetManifest} must contain provenanceRecords and assets arrays.`);
    return index;
  }
  if (manifest.publicRoot !== mediaPolicy.root) {
    errors.push(`${requiredAssetManifest}.publicRoot must match the license coverage media root.`);
  }

  const provenance = new Map();
  for (const [indexNumber, record] of manifest.provenanceRecords.entries()) {
    if (!isPlainObject(record) || !isNonEmptyString(record.id) || !isPlainObject(record.rights)) {
      errors.push(`${requiredAssetManifest}.provenanceRecords[${indexNumber}] is incomplete.`);
      continue;
    }
    if (provenance.has(record.id.toLowerCase())) {
      errors.push(`${requiredAssetManifest} has duplicate provenance id: ${record.id}`);
      continue;
    }
    provenance.set(record.id.toLowerCase(), record);
  }

  for (const [indexNumber, asset] of manifest.assets.entries()) {
    const label = `${requiredAssetManifest}.assets[${indexNumber}]`;
    if (!isPlainObject(asset) || !isCanonicalRelativePath(asset.path) ||
        !isNonEmptyString(asset.provenanceId)) {
      errors.push(`${label} must include canonical path and provenanceId values.`);
      continue;
    }
    const repositoryPath = `${mediaPolicy.root ?? '(invalid-media-root)'}/${asset.path}`;
    const key = repositoryPath.toLowerCase();
    if (index.has(key)) {
      errors.push(`${requiredAssetManifest} has duplicate asset path: ${asset.path}`);
      continue;
    }
    const record = provenance.get(asset.provenanceId.toLowerCase());
    if (!record) {
      errors.push(`${label}.provenanceId does not resolve: ${asset.provenanceId}`);
      continue;
    }
    const license = record.rights.license;
    if (!(mediaPolicy.allowedLicenses ?? []).includes(license)) {
      errors.push(`${label} uses a license not allowed for public media: ${license ?? '(missing)'}`);
    }
    if (asset.review?.status !== 'approved') {
      errors.push(`${label} must have review.status=approved.`);
    }
    index.set(key, {
      classification: 'manifest-governed-media',
      evidence: requiredAssetManifest,
      license,
    });
  }

  return index;
}

function pathUsesExtension(repositoryPath, extensions) {
  const lowerPath = repositoryPath.toLowerCase();
  return [...extensions]
    .filter(isNonEmptyString)
    .sort((left, right) => right.length - left.length)
    .some((extension) => lowerPath.endsWith(extension));
}

/**
 * 对单一路径执行确定性分类。返回 null 表示未覆盖；调用方必须把它视为失败。
 */
export function classifyRepositoryFile({ repositoryPath, policy, assetLicenseIndex = new Map() }) {
  const normalizedPath = repositoryPath.replaceAll('\\', '/');
  const pathSegments = normalizedPath.toLowerCase().split('/');

  for (const forbidden of (policy.forbiddenPathSegments ?? []).filter(isNonEmptyString)) {
    if (pathSegments.includes(forbidden.toLowerCase())) {
      return {
        error: `forbidden path segment "${forbidden}"`,
      };
    }
  }

  const exactException = (policy.exactExceptions ?? [])
    .find((entry) => isNonEmptyString(entry?.path) &&
      entry.path.toLowerCase() === normalizedPath.toLowerCase());
  if (exactException) {
    return {
      classification: exactException.classification,
      evidence: exactException.evidence,
      license: exactException.license,
    };
  }

  const media = policy.manifestGovernedMedia ?? { extensions: [], root: '' };
  if (pathUsesExtension(normalizedPath, media.extensions ?? [])) {
    if (!normalizedPath.toLowerCase().startsWith(`${media.root.toLowerCase()}/`)) {
      return { error: 'media outside the manifest-governed root' };
    }
    return assetLicenseIndex.get(normalizedPath.toLowerCase()) ?? {
      error: `media is missing from ${media.manifest}`,
    };
  }

  const exactFirstParty = new Set(
    (policy.firstPartyExactFiles ?? [])
      .filter(isNonEmptyString)
      .map((entry) => entry.toLowerCase()),
  );
  if (exactFirstParty.has(normalizedPath.toLowerCase())) {
    return {
      classification: 'first-party',
      evidence: 'LICENSE',
      license: policy.firstPartyLicense,
    };
  }

  const firstSegment = normalizedPath.split('/', 1)[0].toLowerCase();
  const allowedRoot = (policy.firstPartyRoots ?? [])
    .filter(isNonEmptyString)
    .some((entry) => entry.toLowerCase() === firstSegment);
  if (allowedRoot && pathUsesExtension(normalizedPath, policy.firstPartyExtensions ?? [])) {
    return {
      classification: 'first-party',
      evidence: 'LICENSE',
      license: policy.firstPartyLicense,
    };
  }

  return null;
}

function listGitCandidatePaths(root) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(`Cannot enumerate Git release candidates: ${error.message}`);
  }

  return sortedUnique(
    output
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.replaceAll('\\', '/')),
  );
}

async function validateCanonicalFiles({ root, errors }) {
  try {
    const license = normalizeText(await readFile(path.join(root, 'LICENSE'), 'utf8'));
    if (sha256(license) !== canonicalApacheLicenseSha256) {
      errors.push(
        'LICENSE must match the canonical Apache License 2.0 text from ' +
        'https://www.apache.org/licenses/LICENSE-2.0.txt.',
      );
    }
  } catch (error) {
    errors.push(`Cannot read LICENSE: ${error.message}`);
  }

  try {
    const notice = normalizeText(await readFile(path.join(root, 'NOTICE'), 'utf8'));
    if (!notice.includes('ZUnfurl') || !notice.includes(requiredCopyrightNotice)) {
      errors.push(`NOTICE must include ZUnfurl and ${requiredCopyrightNotice}.`);
    }
    if (placeholderPattern.test(notice)) {
      errors.push('NOTICE contains an unresolved placeholder.');
    }
  } catch (error) {
    errors.push(`Cannot read NOTICE: ${error.message}`);
  }
}

async function validatePackageLicenses({ root, candidatePaths, errors }) {
  const packagePaths = candidatePaths.filter(
    (entry) => entry === 'package.json' || entry.endsWith('/package.json'),
  );
  const packageDirectories = [];

  for (const packagePath of packagePaths) {
    const manifest = await readJsonFile(root, packagePath, errors);
    if (!manifest) {
      continue;
    }
    if (manifest.license !== requiredFirstPartyLicense) {
      errors.push(`${packagePath}.license must equal ${requiredFirstPartyLicense}.`);
    }
    if (manifest.private !== true) {
      errors.push(`${packagePath}.private must equal true for the source-only Preview.`);
    }
    packageDirectories.push(packagePath === 'package.json' ? '' : path.posix.dirname(packagePath));
  }

  const lockfile = await readJsonFile(root, 'package-lock.json', errors);
  if (!lockfile || !isPlainObject(lockfile.packages)) {
    errors.push('package-lock.json.packages must be an object.');
    return;
  }
  for (const directory of packageDirectories) {
    const lockEntry = lockfile.packages[directory];
    const label = directory || '(root)';
    if (!isPlainObject(lockEntry)) {
      errors.push(`package-lock.json is missing the package entry for ${label}.`);
      continue;
    }
    if (lockEntry.license !== requiredFirstPartyLicense) {
      errors.push(`package-lock.json package entry ${label} must declare ${requiredFirstPartyLicense}.`);
    }
  }
}

/**
 * 验证候选仓库。candidatePaths 只供确定性测试注入；CLI 始终从 Git 枚举，
 * 同时包括已跟踪和未忽略的新文件，防止发布前的新文件逃逸许可检查。
 */
export async function validateRepositoryLicenseCoverage({
  root = process.cwd(),
  candidatePaths,
  validatePackages = true,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const errors = [];
  const warnings = [];
  const policy = await readJsonFile(resolvedRoot, policyPath, errors);
  if (!policy) {
    return { candidateCount: 0, errors: sortedUnique(errors), mappings: [], warnings };
  }

  await validatePolicy({ root: resolvedRoot, policy, errors });
  const assetManifest = await readJsonFile(
    resolvedRoot,
    policy.manifestGovernedMedia?.manifest ?? requiredAssetManifest,
    errors,
  );
  const assetLicenseIndex = buildAssetLicenseIndex({
    manifest: assetManifest,
    policy,
    errors,
  });

  const requestedPaths = candidatePaths ?? listGitCandidatePaths(resolvedRoot);
  const normalizedPaths = requestedPaths.map((entry) => entry.replaceAll('\\', '/'));
  const caseFolded = new Map();
  const existingCandidates = [];

  for (const repositoryPath of normalizedPaths) {
    if (!isCanonicalRelativePath(repositoryPath)) {
      errors.push(`Git candidate path is not canonical: ${repositoryPath}`);
      continue;
    }
    const lowerPath = repositoryPath.toLowerCase();
    if (caseFolded.has(lowerPath) && caseFolded.get(lowerPath) !== repositoryPath) {
      errors.push(
        `Repository paths collide case-insensitively: ${caseFolded.get(lowerPath)}, ${repositoryPath}`,
      );
      continue;
    }
    caseFolded.set(lowerPath, repositoryPath);

    const absolutePath = path.join(resolvedRoot, ...repositoryPath.split('/'));
    let entry;
    try {
      entry = await lstat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // A tracked deletion does not enter the next release tree.
        continue;
      }
      errors.push(`Cannot inspect ${repositoryPath}: ${error.message}`);
      continue;
    }
    if (entry.isSymbolicLink()) {
      errors.push(`Symbolic links require an explicit policy and are not allowed: ${repositoryPath}`);
      continue;
    }
    if (!entry.isFile()) {
      errors.push(`Git candidate is not a regular file: ${repositoryPath}`);
      continue;
    }
    existingCandidates.push(repositoryPath);
  }

  const mappings = [];
  for (const repositoryPath of sortedUnique(existingCandidates)) {
    const mapping = classifyRepositoryFile({ repositoryPath, policy, assetLicenseIndex });
    if (!mapping) {
      errors.push(`Unmapped repository file: ${repositoryPath}`);
      continue;
    }
    if (mapping.error) {
      errors.push(`Rejected repository file ${repositoryPath}: ${mapping.error}.`);
      continue;
    }
    if (!isNonEmptyString(mapping.license) || !isNonEmptyString(mapping.evidence)) {
      errors.push(`Incomplete license mapping for ${repositoryPath}.`);
      continue;
    }
    mappings.push({ path: repositoryPath, ...mapping });
  }

  await validateCanonicalFiles({ root: resolvedRoot, errors });
  if (validatePackages) {
    await validatePackageLicenses({ root: resolvedRoot, candidatePaths: existingCandidates, errors });
  }

  return {
    candidateCount: existingCandidates.length,
    errors: sortedUnique(errors),
    mappings,
    warnings: sortedUnique(warnings),
  };
}

export async function runCli() {
  const result = await validateRepositoryLicenseCoverage();
  for (const warning of result.warnings) {
    console.warn(`WARNING: ${warning}`);
  }
  if (result.errors.length > 0) {
    console.error(`Repository license coverage FAILED: ${result.errors.length} issue(s).`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return result;
  }

  const counts = new Map();
  for (const mapping of result.mappings) {
    const key = `${mapping.classification}:${mapping.license}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
  console.log(
    `Repository license coverage OK: ${result.candidateCount} files mapped (${summary}).`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
