import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validatePageContent,
  validateProductLocalePageContent,
  validateProductPageContent,
} from 'gcss-validation';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultContentRoot = path.join(repoRoot, 'apps/storefront/src/content');

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefined(entryValue)]),
  );
}

function keyFromObject(value, index) {
  const basis =
    value.id ||
    value.slug ||
    value.productSlug ||
    value.title ||
    value.eyebrow ||
    `item-${index + 1}`;

  return String(basis)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `item-${index + 1}`;
}

function withSanityArrayKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return {
        _key: item._key || keyFromObject(item, index),
        ...withSanityArrayKeys(item),
      };
    });
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      withSanityArrayKeys(entryValue),
    ]),
  );
}

async function listJsonFiles(baseDir) {
  const files = [];

  async function visit(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(absolutePath);
      }
    }
  }

  await visit(baseDir);
  return files;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function toDocumentPayload(value) {
  return withSanityArrayKeys(stripUndefined(value));
}

function pageToDocument(page) {
  return {
    _id: `page.${page.locale}.${page.kind}`,
    _type: 'page',
    ...toDocumentPayload(page),
  };
}

function getProductPageSlugCurrent(value) {
  return isPlainObject(value) ? value.current ?? value.slug ?? '' : value;
}

function productPageToDocument(productPage) {
  const payload = toDocumentPayload(productPage);

  return {
    _id: `productPage.${productPage.shopifyHandle}`,
    _type: 'productPage',
    ...payload,
  };
}

function productLocalePageToDocument(localized, productPagesByHandle) {
  const productPage = productPagesByHandle.get(localized.shopifyHandle);

  if (!productPage) {
    throw new Error(`Missing local productPage for productLocalePage: ${localized.locale}/${localized.shopifyHandle}`);
  }

  const payload = toDocumentPayload(localized);
  const slug = getProductPageSlugCurrent(localized.slug);
  const { shopifyHandle, ...contentPayload } = payload;

  void shopifyHandle;

  return {
    _id: `productLocalePage.${localized.locale}.${productPage.shopifyHandle}`,
    _type: 'productLocalePage',
    productPage: {
      _type: 'reference',
      _ref: `productPage.${productPage.shopifyHandle}`,
    },
    shopifyProductGid: productPage.shopifyProductGid,
    shopifyHandle: productPage.shopifyHandle,
    shopifyStatus: productPage.shopifyStatus,
    shopifyTitle: productPage.shopifyTitle,
    shopifyAdminUrl: productPage.shopifyAdminUrl,
    ...contentPayload,
    slug: {
      _type: 'slug',
      current: slug,
    },
  };
}

async function readCollection(collectionName, validator, mapper, contentRoot) {
  const collectionRoot = path.join(contentRoot, collectionName);
  const files = await listJsonFiles(collectionRoot);
  const documents = [];

  for (const filePath of files) {
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const json = await readJsonFile(filePath);
    const value = validator(json, relativePath);
    documents.push(...[mapper(value)].flat());
  }

  return documents;
}

async function readCollectionValues(collectionName, validator, contentRoot) {
  const collectionRoot = path.join(contentRoot, collectionName);
  const files = await listJsonFiles(collectionRoot);
  const values = [];

  for (const filePath of files) {
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const json = await readJsonFile(filePath);
    values.push(validator(json, relativePath));
  }

  return values;
}

function countDocuments(documents) {
  return documents.reduce(
    (counts, document) => ({
      ...counts,
      [document._type]: (counts[document._type] ?? 0) + 1,
    }),
    {},
  );
}

export async function buildSanitySeed({ contentRoot = defaultContentRoot } = {}) {
  const [pages, productPageValues, productLocalePageValues] = await Promise.all([
    readCollection('pages', validatePageContent, pageToDocument, contentRoot),
    readCollectionValues('product-pages', validateProductPageContent, contentRoot),
    readCollectionValues('product-locale-pages', validateProductLocalePageContent, contentRoot),
  ]);
  const productPagesByHandle = new Map(
    productPageValues.map((productPage) => [productPage.shopifyHandle, productPage]),
  );
  const productPages = productPageValues.map(productPageToDocument);
  const productLocalePages = productLocalePageValues.map((localized) =>
    productLocalePageToDocument(localized, productPagesByHandle),
  );

  const documents = [...pages, ...productPages, ...productLocalePages].sort((left, right) =>
    left._id.localeCompare(right._id),
  );

  return {
    mode: 'dry-run',
    contentRoot,
    counts: countDocuments(documents),
    documents,
  };
}

function parseArgs(argv) {
  const options = {
    contentRoot: defaultContentRoot,
    json: false,
    outFile: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--content-root') {
      options.contentRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--out') {
      options.outFile = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function maybeWriteNdjson(outFile, documents) {
  if (!outFile) {
    return;
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${documents.map((document) => JSON.stringify(document)).join('\n')}\n`);
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const seed = await buildSanitySeed({ contentRoot: options.contentRoot });
  await maybeWriteNdjson(options.outFile, seed.documents);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ...seed,
          outFile: options.outFile,
        },
        null,
        2,
      ),
    );
    return seed;
  }

  console.log('Sanity migration dry-run complete.');
  console.log(`Content root: ${seed.contentRoot}`);
  console.log(`Documents: ${seed.documents.length}`);
  console.log(`Counts: ${JSON.stringify(seed.counts)}`);

  if (options.outFile) {
    console.log(`NDJSON written: ${options.outFile}`);
  }

  return seed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
