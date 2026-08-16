import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ignoredDirectories = new Set([
  '.astro',
  '.cache',
  '.git',
  '.sanity',
  '.vite',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);

const ignoredFiles = new Set([
  'package-lock.json',
]);

const ignoredRelativePaths = new Set([
  'scripts/template/validate-template-placeholders.mjs',
]);

const binaryExtensions = new Set([
  '.avif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.mp4',
  '.pdf',
  '.png',
  '.webp',
]);

const forbiddenClientTerms = [
  ['legacy brand display name', /Premi[eè]re\s+Dame/i],
  ['legacy brand machine name', /premieredame/i],
  ['legacy Black Swan product', /black[\s-]+swan/i],
  ['legacy Luminous product', /luminous[\s-]+veil/i],
  ['legacy temporary domain', /trwten33/i],
  ['legacy project namespace', /premieredame-web/i],
];

const compatibilityTerms = [
  {
    label: 'legacy product field ritual',
    pattern: /\britual\b/i,
    allowedPaths: new Set([
      'apps/studio/src/productLaunch/logic.ts',
      'docs/template-placeholder-audit.md',
      'scripts/migrations/cleanup-legacy-content-fields.mjs',
      'scripts/products/copy-product-content.mjs',
      'scripts/tests/validate-product-draft.mjs',
      'scripts/tests/validate-product-locale-page-editor-structure.mjs',
    ]),
  },
];

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function* walkFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath);
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

function shouldRead(relativePath) {
  const baseName = path.basename(relativePath);
  const extension = path.extname(relativePath).toLowerCase();

  return !ignoredFiles.has(baseName) &&
    !ignoredRelativePaths.has(relativePath) &&
    !binaryExtensions.has(extension);
}

function collectLineHits({ content, relativePath, rule }) {
  const lines = content.split(/\r?\n/);
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (rule.pattern.test(lines[index])) {
      hits.push({
        label: rule.label,
        line: index + 1,
        path: relativePath,
      });
    }
  }

  return hits;
}

export async function scanTemplatePlaceholders({ root = process.cwd() } = {}) {
  const resolvedRoot = (await stat(root)).isDirectory() ? root : process.cwd();
  const forbiddenHits = [];
  const compatibilityHits = [];

  for await (const absolutePath of walkFiles(resolvedRoot)) {
    const relativePath = toPosixPath(path.relative(resolvedRoot, absolutePath));

    if (!shouldRead(relativePath)) {
      continue;
    }

    const content = await readFile(absolutePath, 'utf8');

    for (const [label, pattern] of forbiddenClientTerms) {
      forbiddenHits.push(
        ...collectLineHits({
          content,
          relativePath,
          rule: { label, pattern },
        }),
      );
    }

    for (const rule of compatibilityTerms) {
      const hits = collectLineHits({ content, relativePath, rule });

      if (hits.length === 0) {
        continue;
      }

      if (!rule.allowedPaths.has(relativePath)) {
        forbiddenHits.push(...hits);
      } else {
        compatibilityHits.push(...hits);
      }
    }
  }

  return {
    forbiddenHits,
    compatibilityHits,
  };
}

export async function runCli() {
  const result = await scanTemplatePlaceholders();

  if (result.forbiddenHits.length > 0) {
    console.error('Template placeholder scan failed.');
    for (const hit of result.forbiddenHits) {
      console.error(`- ${hit.path}:${hit.line} ${hit.label}`);
    }
    process.exitCode = 1;
    return result;
  }

  console.log(
    `Template placeholder scan OK: no legacy client terms; ${result.compatibilityHits.length} legacy compatibility references allowed.`,
  );

  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
