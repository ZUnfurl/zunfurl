import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultProductPagesRoot = path.join(repoRoot, 'apps/storefront/src/content/product-pages');
const defaultProductLocalePagesRoot = path.join(repoRoot, 'apps/storefront/src/content/product-locale-pages');

function parseArgs(argv) {
  const options = {
    outFile: undefined,
    productLocalePagesRoot: defaultProductLocalePagesRoot,
    productPagesRoot: defaultProductPagesRoot,
    runId: createDefaultRunId(),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--out') {
      options.outFile = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--products-root') {
      options.productPagesRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--product-pages-root') {
      options.productPagesRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--product-locale-pages-root') {
      options.productLocalePagesRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--run-id') {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function createDefaultRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
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

async function readLocalProductHandles(productPagesRoot, productLocalePagesRoot = defaultProductLocalePagesRoot) {
  const [files, localeFiles] = await Promise.all([
    listJsonFiles(productPagesRoot),
    listJsonFiles(productLocalePagesRoot),
  ]);
  const localesByHandle = new Map();

  for (const filePath of localeFiles) {
    const raw = await readFile(filePath, 'utf8');
    const productLocalePage = JSON.parse(raw);
    const handle = productLocalePage.shopifyHandle;
    const locale = productLocalePage.locale;

    if (!handle || !locale) {
      throw new Error(`Missing shopifyHandle or locale in local productLocalePage: ${filePath}`);
    }

    const locales = localesByHandle.get(handle) ?? [];
    locales.push(locale);
    localesByHandle.set(handle, locales);
  }

  const products = [];

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf8');
    const productPage = JSON.parse(raw);
    const handle = productPage.shopifyHandle;

    if (!handle) {
      throw new Error(`Missing shopifyHandle in local productPage: ${filePath}`);
    }

    products.push({
      handle,
      title: productPage.shopifyTitle ?? handle,
      locales: [...new Set(localesByHandle.get(handle) ?? [])].sort(),
    });
  }

  const handles = [...new Set(products.map((product) => product.handle))].sort();

  return {
    products,
    handles,
  };
}

function createShopifyBackupManifest({ productHandles, products, runId }) {
  const prefix = `backup/shopify-originals/${runId}/`;

  return {
    version: 1,
    status: 'roadmap-design',
    mode: 'dry-run',
    source: 'shopify-admin-export-plan',
    createdAt: new Date().toISOString(),
    capabilities: {
      export: false,
      import: false,
      restore: false,
    },
    r2: {
      bucketEnv: 'R2_BACKUP_BUCKET',
      prefix,
      publicBucket: false,
      writesToR2: false,
      deletesFromR2: false,
    },
    scope: {
      productHandles,
      localProductCount: products.length,
    },
    artifacts: [
      {
        kind: 'shopify-products-export',
        source: 'future-shopify-admin-export',
        r2Key: `${prefix}products.jsonl`,
        plannedOnly: true,
      },
      {
        kind: 'shopify-media-mapping',
        source: 'future-shopify-admin-export',
        r2Key: `${prefix}media-manifest.json`,
        plannedOnly: true,
      },
      ...productHandles.map((handle) => ({
        kind: 'shopify-original-media-prefix',
        source: 'future-shopify-media-download',
        handle,
        r2Key: `${prefix}original-media/${handle}/`,
        plannedOnly: true,
      })),
    ],
    safety: {
      dryRunOnly: true,
      shopifyMutation: false,
      shopifyAdminTokenRequired: false,
      r2PublicAccessChange: false,
      r2Delete: false,
    },
  };
}

async function maybeWriteJson(outFile, manifest) {
  if (!outFile) {
    return;
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function buildShopifyBackupPlan({
  productLocalePagesRoot = defaultProductLocalePagesRoot,
  productPagesRoot = defaultProductPagesRoot,
  productsRoot,
  runId = createDefaultRunId(),
} = {}) {
  const { handles, products } = await readLocalProductHandles(
    productsRoot ?? productPagesRoot,
    productLocalePagesRoot,
  );

  return createShopifyBackupManifest({
    productHandles: handles,
    products,
    runId,
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = await buildShopifyBackupPlan({
    productLocalePagesRoot: options.productLocalePagesRoot,
    productPagesRoot: options.productPagesRoot,
    runId: options.runId,
  });

  await maybeWriteJson(options.outFile, manifest);

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return manifest;
  }

  console.log('Roadmap-only Shopify backup design manifest generated.');
  console.log('No export, import, restore, or remote write was performed.');
  console.log(`R2 prefix: ${manifest.r2.prefix}`);
  console.log(`Product handles: ${manifest.scope.productHandles.join(', ')}`);

  if (options.outFile) {
    console.log(`Manifest written: ${options.outFile}`);
  }

  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
