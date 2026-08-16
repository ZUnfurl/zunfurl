import {
  ShopifyStorefrontError,
  createShopifyStorefrontClientFromEnv,
  getProductSummaryByHandle,
} from 'gcss-commerce';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { pathToFileURL } from 'node:url';
import { createProductPageShopifySummary } from './product-entry-summary.mjs';

const defaultLocales = ['en', 'fr', 'zh-cn'];

export function getDraftDocumentId(documentId) {
  return `drafts.${documentId}`;
}

export function parseArgs(argv) {
  const options = {
    envFile: '.env',
    handle: undefined,
    locales: defaultLocales,
    useCliClient: false,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--env-file') {
      options.envFile = argv[index + 1];
      index += 1;
    } else if (value === '--handle') {
      options.handle = argv[index + 1];
      index += 1;
    } else if (value === '--locales') {
      options.locales = argv[index + 1].split(',').map((locale) => locale.trim()).filter(Boolean);
      index += 1;
    } else if (value === '--write') {
      options.write = true;
    } else if (value === '--use-cli-client') {
      options.useCliClient = true;
    }
  }

  if (!options.handle) {
    throw new Error('Missing required --handle <shopify-handle>. Live Shopify summary checks never select an example product implicitly.');
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.handle)) {
    throw new Error(`Invalid Shopify handle: ${options.handle}. Use lowercase kebab-case.`);
  }

  return options;
}

async function loadEnvFile(filePath) {
  const { existsSync, readFileSync } = await import('node:fs');

  if (!existsSync(filePath)) {
    return;
  }

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
}

function getSafeTokenKind(token) {
  if (!token) return 'missing';
  if (token.startsWith('shpat_')) return 'admin-token-like';
  if (token.startsWith('shpca_')) return 'storefront-token-like';
  if (token.startsWith('shpss_')) return 'secret-token-like';
  if (token.startsWith('shppa_')) return 'app-token-like';

  return 'unknown-or-raw-token';
}

function printStorefrontAuthHelp(error) {
  const tokenKind = getSafeTokenKind(process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN);

  console.error('Shopify Storefront API 读取失败。');
  console.error(`HTTP status: ${error.status ?? 'unknown'}`);
  console.error(`SHOPIFY_STORE_DOMAIN: ${process.env.SHOPIFY_STORE_DOMAIN ?? 'missing'}`);
  console.error(`SHOPIFY_STOREFRONT_ACCESS_TOKEN kind: ${tokenKind}`);
  console.error('请确认这里使用的是 Storefront API access token，不是 Admin API token。');
}

async function createSanityWriteClientFromEnv({ env = process.env, useCliClient = false } = {}) {
  const projectId = env.SANITY_PROJECT_ID || env.SANITY_STUDIO_PROJECT_ID;
  const dataset = env.SANITY_DATASET || env.SANITY_STUDIO_DATASET;
  const apiVersion = env.SANITY_API_VERSION || '2026-06-20';
  const token = env.SANITY_API_WRITE_TOKEN || env.SANITY_API_READ_TOKEN;

  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID for Sanity write.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for Sanity write.');
  }

  if (dataset !== 'development') {
    throw new Error(`Refusing to write Shopify summary to non-development Sanity dataset: ${dataset}.`);
  }

  if (useCliClient) {
    const { getCliClient } = await import('sanity/cli');

    return {
      dataset,
      client: getCliClient({ apiVersion }),
    };
  }

  if (!token) {
    throw new Error('Missing SANITY_API_WRITE_TOKEN for Sanity write.');
  }

  return {
    dataset,
    client: createSanityContentClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
      token,
    }),
  };
}

export function buildDraftAwareProductPageSummaryTargets(documentIds, documents) {
  const existingIds = new Set(documents.map((document) => document._id));
  const missingIds = documentIds.filter((documentId) => !existingIds.has(documentId));

  if (missingIds.length > 0) {
    throw new Error(`Missing Sanity productPage documents: ${missingIds.join(', ')}`);
  }

  return documentIds.flatMap((documentId) => {
    const draftId = getDraftDocumentId(documentId);

    return existingIds.has(draftId) ? [documentId, draftId] : [documentId];
  });
}

export const buildDraftAwareProductEntrySummaryTargets = buildDraftAwareProductPageSummaryTargets;

function getSummaryPatchForDocument(documentId, summary) {
  if (!documentId.startsWith('productLocalePage.')) {
    return summary;
  }

  const {
    shopifyImageSummary,
    shopifyVariantSummary,
    ...languageSummary
  } = summary;

  void shopifyImageSummary;
  void shopifyVariantSummary;

  return languageSummary;
}

async function writeProductPageSummaries({ summary, documentIds, useCliClient }) {
  const { client, dataset } = await createSanityWriteClientFromEnv({
    env: process.env,
    useCliClient,
  });
  const lookupIds = documentIds.flatMap((documentId) => [documentId, getDraftDocumentId(documentId)]);
  const readClient = client.withConfig({ perspective: 'raw' });
  const existingDocuments = await readClient.fetch('*[_id in $ids]{_id}', { ids: lookupIds });
  const targetIds = buildDraftAwareProductPageSummaryTargets(documentIds, existingDocuments);

  const updatedDocuments = [];

  for (const documentId of targetIds) {
    const updated = await client
      .patch(documentId)
      .set(getSummaryPatchForDocument(documentId, summary))
      .commit({ returnDocuments: true, visibility: 'sync' });

    updatedDocuments.push({
      _id: updated._id,
      shopifyHandle: updated.shopifyHandle,
      shopifyStatus: updated.shopifyStatus,
      shopifyTitle: updated.shopifyTitle,
      shopifyImageSummaryCount: updated.shopifyImageSummary?.length ?? 0,
      shopifyVariantSummaryCount: updated.shopifyVariantSummary?.length ?? 0,
      hasShopifyAdminUrl: Boolean(updated.shopifyAdminUrl),
    });
  }

  return {
    dataset,
    updatedDocuments,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await loadEnvFile(options.envFile);

  const client = createShopifyStorefrontClientFromEnv(process.env);
  const product = await getProductSummaryByHandle(client, {
    handle: options.handle,
  });

  if (!product) {
    throw new Error(`Storefront API returned no product for handle: ${options.handle}`);
  }

  const summary = createProductPageShopifySummary(product, {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
  });
  void options.locales;

  const targetDocuments = [
    `productPage.${options.handle}`,
    ...options.locales.map((locale) => `productLocalePage.${locale}.${options.handle}`),
  ];

  if (options.write) {
    const writeResult = await writeProductPageSummaries({
      summary,
      documentIds: targetDocuments,
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({
      ok: true,
      mode: 'write',
      dataset: writeResult.dataset,
      updatedDocuments: writeResult.updatedDocuments,
      summary,
    }, null, 2));

    return;
  }

  console.log(JSON.stringify({
    ok: true,
    mode: 'dry-run',
    targetDocuments,
    summary,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    if (error instanceof ShopifyStorefrontError && error.status === 401) {
      printStorefrontAuthHelp(error);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
