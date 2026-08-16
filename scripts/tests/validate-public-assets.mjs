import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const manifestPath = 'docs/compliance/ASSET_LICENSES.yml';
const requiredPublicRoot = 'apps/storefront/public';
const requiredLicenseReferences = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
};

const mediaTypes = new Map([
  ['.avif', 'image/avif'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.m4v', 'video/x-m4v'],
  ['.mov', 'video/quicktime'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.otf', 'font/otf'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const allowedSourceTypes = new Set([
  'ai-generated',
  'commissioned',
  'derived',
  'legacy-unverified',
  'original',
  'third-party',
]);

const allowedReviewStatuses = new Set([
  'approved',
  'legacy-replace-required',
]);

const referenceRoots = [
  'apps/storefront/src',
  'apps/studio/src',
  'scripts/tests',
];

const exactReferenceFiles = [
  'README.md',
];

const referenceExtensions = new Set([
  '.astro',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.scss',
  '.ts',
  '.tsx',
]);

const ignoredReferencePaths = new Set([
  'scripts/tests/validate-public-assets.mjs',
]);

const placeholderPattern = /(?:^|\b)(?:noassertion|pending|tbd|todo|unavailable|unknown)(?:\b|$)|<[^>]+>/i;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isCanonicalRelativePath(value) {
  return isNonEmptyString(value) &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    path.posix.normalize(value) === value &&
    value !== '.' &&
    !value.startsWith('../');
}

function addMissingStringError(errors, value, label) {
  if (!isNonEmptyString(value)) {
    errors.push(`${label} must be a non-empty string.`);
    return false;
  }

  return true;
}

function assertNoPlaceholder(errors, value, label) {
  if (isNonEmptyString(value) && placeholderPattern.test(value)) {
    errors.push(`${label} contains an unresolved placeholder: ${value}`);
  }
}

async function pathIsFile(absolutePath) {
  try {
    return (await stat(absolutePath)).isFile();
  } catch {
    return false;
  }
}

async function walkFiles(directory, { onSymlink, relativeBase = directory } = {}) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      onSymlink?.(toPosixPath(path.relative(relativeBase, absolutePath)));
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await walkFiles(absolutePath, { onSymlink, relativeBase }));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function compareStringSets(left, right) {
  const normalizedLeft = sortedUnique(left);
  const normalizedRight = sortedUnique(right);

  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizeLocalMediaUrl(rawUrl) {
  const withoutQuery = rawUrl.split(/[?#]/, 1)[0];
  const publicPrefix = `${requiredPublicRoot}/`;

  if (withoutQuery.startsWith(publicPrefix)) {
    return withoutQuery.slice(publicPrefix.length);
  }

  try {
    return decodeURIComponent(withoutQuery).slice(1);
  } catch {
    return withoutQuery.slice(1);
  }
}

function collectLocalMediaUrls(content) {
  const extensions = [...mediaTypes.keys()]
    .map((extension) => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(
    `\\/[^\\s\"'\\x60)<>{}]+\\.(?:${extensions})(?:[?#][^\\s\"'\\x60)<>{}]*)?`,
    'gi',
  );
  const repositoryRelativePattern = new RegExp(
    `${requiredPublicRoot.replaceAll('/', '\\/')}\\/[^\\s"'\\x60)<>{}]+\\.(?:${extensions})(?:[?#][^\\s"'\\x60)<>{}]*)?`,
    'gi',
  );
  const urls = [];

  for (const match of content.matchAll(pattern)) {
    const rawUrl = match[0];
    const precedingCharacter = match.index > 0 ? content[match.index - 1] : '';

    if (
      rawUrl.startsWith('//') ||
      precedingCharacter === ':' ||
      precedingCharacter === '/' ||
      /[A-Za-z0-9._-]/.test(precedingCharacter)
    ) {
      continue;
    }

    urls.push(rawUrl);
  }

  for (const match of content.matchAll(repositoryRelativePattern)) {
    urls.push(match[0]);
  }

  return sortedUnique(urls);
}

/**
 * 对 SVG 做保守的静态风险扫描。任何可执行内容、外部加载或可见文本都拒绝，
 * 避免把脚本、跟踪资源、第三方字体或未审计文案藏进可公开分发的矢量文件。
 */
export function inspectSvgSource(source) {
  const risks = [];

  const staticRules = [
    ['missing svg root element', !/<\s*svg(?:\s|>)/i.test(source)],
    ['script element', /<\s*script(?:\s|>)/i.test(source)],
    ['inline event handler', /\son[a-z][\w:.-]*\s*=/i.test(source)],
    ['event handler attribute target', /attributeName\s*=\s*["']on[a-z]/i.test(source)],
    ['foreign or embedded active content', /<\s*(?:embed|foreignObject|iframe|object)(?:\s|>)/i.test(source)],
    ['document type or entity declaration', /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)],
    ['external stylesheet instruction', /<\?xml-stylesheet\b|@import\b/i.test(source)],
    ['script protocol', /\b(?:javascript|vbscript)\s*:/i.test(source)],
    ['XML base override', /\bxml:base\s*=/i.test(source)],
    ['visible SVG text element', /<\s*(?:text|textPath|tspan)(?:\s|>)/i.test(source)],
    ['embedded font or glyph', /<\s*(?:font|font-face|glyph)(?:\s|>)|\bfont(?:-family|-face)?\s*[:=]/i.test(source)],
  ];

  for (const [label, matched] of staticRules) {
    if (matched) {
      risks.push(label);
    }
  }

  for (const match of source.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gis)) {
    if (!match[2].trim().startsWith('#')) {
      risks.push(`non-fragment href: ${match[2].trim() || '(empty)'}`);
    }
  }

  for (const match of source.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gis)) {
    if (!match[2].trim().startsWith('#')) {
      risks.push(`non-fragment CSS url: ${match[2].trim() || '(empty)'}`);
    }
  }

  return sortedUnique(risks);
}

async function readManifest(root, errors) {
  const absoluteManifestPath = path.join(root, ...manifestPath.split('/'));
  let source;

  try {
    source = await readFile(absoluteManifestPath, 'utf8');
  } catch (error) {
    errors.push(`Cannot read ${manifestPath}: ${error.message}`);
    return null;
  }

  try {
    // JSON is a strict subset of YAML 1.2. Keeping this manifest JSON-compatible
    // avoids a transitive YAML-parser dependency in the release gate.
    return JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    errors.push(`${manifestPath} must use JSON-compatible YAML 1.2 syntax: ${error.message}`);
    return null;
  }
}

async function validateProvenanceRecords({ manifest, root, errors }) {
  if (!Array.isArray(manifest.provenanceRecords)) {
    errors.push('manifest.provenanceRecords must be an array.');
    return new Map();
  }

  const records = new Map();

  for (const [index, record] of manifest.provenanceRecords.entries()) {
    const label = `provenanceRecords[${index}]`;

    if (!isPlainObject(record)) {
      errors.push(`${label} must be an object.`);
      continue;
    }

    if (!addMissingStringError(errors, record.id, `${label}.id`)) {
      continue;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(record.id)) {
      errors.push(`${label}.id must use lowercase kebab-case.`);
    }

    if (records.has(record.id.toLowerCase())) {
      errors.push(`Duplicate provenance record id: ${record.id}`);
      continue;
    }

    if (!isPlainObject(record.source)) {
      errors.push(`${label}.source must be an object.`);
    } else {
      if (!allowedSourceTypes.has(record.source.type)) {
        errors.push(`${label}.source.type must be one of: ${[...allowedSourceTypes].join(', ')}.`);
      }
      addMissingStringError(errors, record.source.creator, `${label}.source.creator`);
      addMissingStringError(errors, record.source.origin, `${label}.source.origin`);
      addMissingStringError(errors, record.source.createdAt, `${label}.source.createdAt`);

      if (record.source.type === 'ai-generated') {
        addMissingStringError(errors, record.source.tool, `${label}.source.tool`);
        addMissingStringError(errors, record.source.promptRef, `${label}.source.promptRef`);
        if (!isNonEmptyString(record.source.sourceSha256) ||
            !/^[a-f0-9]{64}$/.test(record.source.sourceSha256)) {
          errors.push(`${label}.source.sourceSha256 must be a lowercase SHA-256 digest.`);
        }
      }

      if (record.source.type === 'derived') {
        addMissingStringError(errors, record.source.tool, `${label}.source.tool`);
        addMissingStringError(errors, record.source.transformation, `${label}.source.transformation`);
        if (!Array.isArray(record.source.parentProvenanceIds) ||
            record.source.parentProvenanceIds.length === 0 ||
            record.source.parentProvenanceIds.some((value) => !isNonEmptyString(value))) {
          errors.push(`${label}.source.parentProvenanceIds must be a non-empty string array.`);
        }
      }
    }

    if (!isPlainObject(record.rights)) {
      errors.push(`${label}.rights must be an object.`);
    } else {
      addMissingStringError(errors, record.rights.copyrightHolder, `${label}.rights.copyrightHolder`);
      addMissingStringError(errors, record.rights.license, `${label}.rights.license`);
      addMissingStringError(errors, record.rights.evidence, `${label}.rights.evidence`);
      addMissingStringError(errors, record.rights.attribution, `${label}.rights.attribution`);

      if (record.source?.type === 'ai-generated') {
        if (record.rights.syntheticContent !== true) {
          errors.push(`${label}.rights.syntheticContent must be true for AI-generated media.`);
        }
        addMissingStringError(errors, record.rights.modelRelease, `${label}.rights.modelRelease`);
        addMissingStringError(errors, record.rights.propertyRelease, `${label}.rights.propertyRelease`);
        addMissingStringError(errors, record.rights.trademarkStatus, `${label}.rights.trademarkStatus`);
      }

      if (isNonEmptyString(record.rights.evidence) &&
          !placeholderPattern.test(record.rights.evidence) &&
          !/^https:\/\//i.test(record.rights.evidence)) {
        if (!isCanonicalRelativePath(record.rights.evidence)) {
          errors.push(`${label}.rights.evidence must be an https URL or canonical repository-relative path.`);
        } else if (!await pathIsFile(path.join(root, ...record.rights.evidence.split('/')))) {
          errors.push(`${label}.rights.evidence does not exist: ${record.rights.evidence}`);
        }
      }
    }

    records.set(record.id.toLowerCase(), record);
  }

  for (const [recordId, record] of records) {
    if (record.source?.type !== 'derived' || !Array.isArray(record.source.parentProvenanceIds)) {
      continue;
    }

    for (const parentId of record.source.parentProvenanceIds) {
      if (!records.has(parentId.toLowerCase())) {
        errors.push(`Provenance record ${recordId} has a missing parent: ${parentId}`);
      } else if (parentId.toLowerCase() === recordId) {
        errors.push(`Provenance record ${recordId} cannot derive from itself.`);
      }
    }
  }

  return records;
}

async function collectReferenceFiles(root) {
  const files = [];

  for (const referenceRoot of referenceRoots) {
    const absoluteRoot = path.join(root, ...referenceRoot.split('/'));

    try {
      const candidates = await walkFiles(absoluteRoot);
      files.push(...candidates.filter((absolutePath) => {
        const relativePath = toPosixPath(path.relative(root, absolutePath));
        return referenceExtensions.has(path.extname(absolutePath).toLowerCase()) &&
          !ignoredReferencePaths.has(relativePath);
      }));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  for (const relativePath of exactReferenceFiles) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    if (await pathIsFile(absolutePath)) files.push(absolutePath);
  }

  return sortedUnique(files).map((absolutePath) => ({
    absolutePath,
    relativePath: toPosixPath(path.relative(root, absolutePath)),
  }));
}

/**
 * 验证 public 媒体清单、权利来源、内容哈希、源码引用及 SVG 静态安全边界。
 * 门禁只接受 review.status=approved；未知权利或待替换状态始终失败。
 */
export async function validatePublicAssets({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const errors = [];
  const warnings = [];
  const manifest = await readManifest(resolvedRoot, errors);

  if (!manifest || !isPlainObject(manifest)) {
    if (manifest !== null) {
      errors.push('Asset manifest root must be an object.');
    }
    return { assetCount: 0, errors, referenceCount: 0, warnings };
  }

  if (manifest.schemaVersion !== 1) {
    errors.push('manifest.schemaVersion must equal 1.');
  }

  if (manifest.publicRoot !== requiredPublicRoot) {
    errors.push(`manifest.publicRoot must equal ${requiredPublicRoot}.`);
  }

  if (!isPlainObject(manifest.licenseReferences)) {
    errors.push('manifest.licenseReferences must be an object.');
  } else {
    const actualKeys = Object.keys(manifest.licenseReferences).sort();
    const requiredKeys = Object.keys(requiredLicenseReferences).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(requiredKeys)) {
      errors.push(`manifest.licenseReferences must contain exactly: ${requiredKeys.join(', ')}.`);
    }
    for (const [license, canonicalUrl] of Object.entries(requiredLicenseReferences)) {
      if (manifest.licenseReferences[license] !== canonicalUrl) {
        errors.push(`manifest.licenseReferences.${license} must equal ${canonicalUrl}.`);
      }
    }
  }

  const publicRoot = path.join(resolvedRoot, ...requiredPublicRoot.split('/'));
  let publicFiles = [];

  try {
    publicFiles = await walkFiles(publicRoot, {
      onSymlink(relativePath) {
        errors.push(`Symbolic links are not allowed under ${requiredPublicRoot}: ${relativePath}`);
      },
    });
  } catch (error) {
    errors.push(`Cannot scan ${requiredPublicRoot}: ${error.message}`);
  }

  const actualMedia = publicFiles
    .filter((absolutePath) => mediaTypes.has(path.extname(absolutePath).toLowerCase()))
    .map((absolutePath) => ({
      absolutePath,
      path: toPosixPath(path.relative(publicRoot, absolutePath)),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const actualByLowerPath = new Map();
  for (const media of actualMedia) {
    const key = media.path.toLowerCase();
    if (actualByLowerPath.has(key)) {
      errors.push(`Public media paths collide case-insensitively: ${actualByLowerPath.get(key).path}, ${media.path}`);
    } else {
      actualByLowerPath.set(key, media);
    }
  }

  const provenanceRecords = await validateProvenanceRecords({ manifest, root: resolvedRoot, errors });
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (!Array.isArray(manifest.assets)) {
    errors.push('manifest.assets must be an array.');
  }

  const manifestByLowerPath = new Map();
  const expectedReferenceMap = new Map();
  const usedProvenanceRecords = new Set();

  for (const [index, asset] of assets.entries()) {
    const label = `assets[${index}]`;

    if (!isPlainObject(asset)) {
      errors.push(`${label} must be an object.`);
      continue;
    }

    if (!addMissingStringError(errors, asset.path, `${label}.path`)) {
      continue;
    }

    if (!isCanonicalRelativePath(asset.path)) {
      errors.push(`${label}.path must be a canonical public-root-relative POSIX path: ${asset.path}`);
    }

    const lowerPath = asset.path.toLowerCase();
    if (manifestByLowerPath.has(lowerPath)) {
      errors.push(`Duplicate manifest asset path: ${asset.path}`);
      continue;
    }
    manifestByLowerPath.set(lowerPath, asset);

    const extension = path.posix.extname(asset.path).toLowerCase();
    const expectedMediaType = mediaTypes.get(extension);
    if (!expectedMediaType) {
      errors.push(`${label}.path does not use a governed media extension: ${asset.path}`);
    }
    if (asset.mediaType !== expectedMediaType) {
      errors.push(`${label}.mediaType must equal ${expectedMediaType ?? '(unsupported extension)'}.`);
    }

    if (!isNonEmptyString(asset.sha256) || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      errors.push(`${label}.sha256 must be a lowercase 64-character SHA-256 digest.`);
    }
    addMissingStringError(errors, asset.purpose, `${label}.purpose`);

    if (!Array.isArray(asset.references) || asset.references.some((value) => !isCanonicalRelativePath(value))) {
      errors.push(`${label}.references must contain only canonical repository-relative POSIX paths.`);
    }

    const declaredReferences = Array.isArray(asset.references) ? asset.references : [];
    if (sortedUnique(declaredReferences).length !== declaredReferences.length) {
      errors.push(`${label}.references must not contain duplicates.`);
    }
    if (typeof asset.bundledUnused !== 'boolean') {
      errors.push(`${label}.bundledUnused must be boolean.`);
    } else if (asset.bundledUnused !== (declaredReferences.length === 0)) {
      errors.push(`${label}.bundledUnused must be true exactly when references is empty.`);
    }
    expectedReferenceMap.set(lowerPath, sortedUnique(declaredReferences));

    for (const referencePath of declaredReferences) {
      if (isCanonicalRelativePath(referencePath) &&
          !await pathIsFile(path.join(resolvedRoot, ...referencePath.split('/')))) {
        errors.push(`${label}.references path does not exist: ${referencePath}`);
      }
    }

    if (!addMissingStringError(errors, asset.provenanceId, `${label}.provenanceId`)) {
      continue;
    }
    const provenance = provenanceRecords.get(asset.provenanceId.toLowerCase());
    if (!provenance) {
      errors.push(`${label}.provenanceId does not resolve: ${asset.provenanceId}`);
    } else {
      usedProvenanceRecords.add(asset.provenanceId.toLowerCase());
    }

    if (!isPlainObject(asset.review)) {
      errors.push(`${label}.review must be an object.`);
    } else {
      if (!allowedReviewStatuses.has(asset.review.status)) {
        errors.push(`${label}.review.status must be one of: ${[...allowedReviewStatuses].join(', ')}.`);
      } else if (asset.review.status !== 'approved') {
        errors.push(`${asset.path} is not approved for open-source distribution (${asset.review.status}).`);
      }
      addMissingStringError(errors, asset.review.reviewedBy, `${label}.review.reviewedBy`);
      if (!isIsoDate(asset.review.reviewedAt)) {
        errors.push(`${label}.review.reviewedAt must use YYYY-MM-DD.`);
      }
      addMissingStringError(errors, asset.review.notes, `${label}.review.notes`);

      if (asset.review.status === 'approved' && provenance) {
        if (provenance.source?.type === 'legacy-unverified') {
          errors.push(`${asset.path} cannot be approved with legacy-unverified provenance.`);
        }
        for (const [field, value] of Object.entries(provenance.source ?? {})) {
          assertNoPlaceholder(errors, value, `${asset.path} provenance.source.${field}`);
        }
        for (const [field, value] of Object.entries(provenance.rights ?? {})) {
          assertNoPlaceholder(errors, value, `${asset.path} provenance.rights.${field}`);
        }
        if (!isIsoDate(provenance.source?.createdAt)) {
          errors.push(`${asset.path} provenance.source.createdAt must use YYYY-MM-DD when approved.`);
        }
      }
    }

    const actual = actualByLowerPath.get(lowerPath);
    if (actual) {
      if (isNonEmptyString(asset.sha256) && /^[a-f0-9]{64}$/.test(asset.sha256)) {
        const actualDigest = await sha256(actual.absolutePath);
        if (actualDigest !== asset.sha256) {
          errors.push(`${asset.path} SHA-256 mismatch: manifest=${asset.sha256}, actual=${actualDigest}`);
        }
      }

      if (extension === '.svg') {
        const svgRisks = inspectSvgSource(await readFile(actual.absolutePath, 'utf8'));
        for (const risk of svgRisks) {
          errors.push(`${asset.path} contains forbidden SVG content: ${risk}`);
        }
      }
    }
  }

  const provenanceQueue = [...usedProvenanceRecords];
  while (provenanceQueue.length > 0) {
    const recordId = provenanceQueue.pop();
    const record = provenanceRecords.get(recordId);

    for (const parentId of record?.source?.parentProvenanceIds ?? []) {
      const normalizedParentId = parentId.toLowerCase();
      if (!usedProvenanceRecords.has(normalizedParentId)) {
        usedProvenanceRecords.add(normalizedParentId);
        provenanceQueue.push(normalizedParentId);
      }
    }
  }

  for (const recordId of provenanceRecords.keys()) {
    if (!usedProvenanceRecords.has(recordId)) {
      errors.push(`Unused provenance record: ${recordId}`);
    }
  }

  for (const media of actualMedia) {
    if (!manifestByLowerPath.has(media.path.toLowerCase())) {
      errors.push(`Unregistered public media: ${requiredPublicRoot}/${media.path}`);
    }
  }

  for (const asset of assets) {
    if (isPlainObject(asset) && isNonEmptyString(asset.path) &&
        !actualByLowerPath.has(asset.path.toLowerCase())) {
      errors.push(`Manifest asset is missing from public root: ${requiredPublicRoot}/${asset.path}`);
    }
  }

  const referenceFiles = await collectReferenceFiles(resolvedRoot);
  const actualReferenceMap = new Map(actualMedia.map((media) => [media.path.toLowerCase(), []]));
  let referenceCount = 0;

  for (const referenceFile of referenceFiles) {
    const content = await readFile(referenceFile.absolutePath, 'utf8');
    for (const rawUrl of collectLocalMediaUrls(content)) {
      const assetPath = normalizeLocalMediaUrl(rawUrl);
      const lowerPath = assetPath.toLowerCase();
      const actual = actualByLowerPath.get(lowerPath);

      if (!actual) {
        errors.push(`${referenceFile.relativePath} references missing local media: ${rawUrl}`);
        continue;
      }

      actualReferenceMap.get(lowerPath).push(referenceFile.relativePath);
      referenceCount += 1;
    }
  }

  for (const [lowerPath, actualReferences] of actualReferenceMap) {
    const declaredReferences = expectedReferenceMap.get(lowerPath) ?? [];
    const normalizedActualReferences = sortedUnique(actualReferences);

    if (!compareStringSets(declaredReferences, normalizedActualReferences)) {
      const displayPath = actualByLowerPath.get(lowerPath).path;
      errors.push(
        `${displayPath} reference map mismatch: declared=[${declaredReferences.join(', ')}], ` +
        `actual=[${normalizedActualReferences.join(', ')}]`,
      );
    }
  }

  const digestGroups = new Map();
  for (const asset of assets) {
    if (!isPlainObject(asset) || !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '')) {
      continue;
    }
    const paths = digestGroups.get(asset.sha256) ?? [];
    paths.push(asset.path);
    digestGroups.set(asset.sha256, paths);
  }
  for (const paths of digestGroups.values()) {
    if (paths.length > 1) {
      warnings.push(`Duplicate media bytes: ${paths.join(', ')}`);
    }
  }

  return {
    assetCount: actualMedia.length,
    errors: sortedUnique(errors),
    referenceCount,
    warnings: sortedUnique(warnings),
  };
}

export async function runCli() {
  const result = await validatePublicAssets();

  for (const warning of result.warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  if (result.errors.length > 0) {
    console.error(`Public asset compliance gate FAILED: ${result.errors.length} issue(s).`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return result;
  }

  console.log(
    `Public asset compliance gate OK: ${result.assetCount} media files and ` +
    `${result.referenceCount} source references validated.`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
