import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { assertDevelopmentDataset } from './create-product-draft.mjs';

const defaultLocales = ['en', 'fr', 'zh-cn'];
const launchStatuses = ['draft', 'ready', 'live', 'archived'];

export function getDraftDocumentId(documentId) {
  return `drafts.${documentId}`;
}

function ensureValue(value, name) {
  if (!value) {
    throw new Error(`Missing required option: ${name}.`);
  }

  return value;
}

function normalizeHandle(handle) {
  const value = ensureValue(handle, '--handle').trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid product handle: ${value}. Use lowercase kebab-case.`);
  }

  return value;
}

function parseList(value) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function parseArgs(argv) {
  const options = {
    envFile: '.env',
    handle: undefined,
    json: false,
    launchStatus: undefined,
    locales: defaultLocales,
    useCliClient: false,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--env-file') {
      options.envFile = argv[index + 1];
      index += 1;
    } else if (arg === '--handle') {
      options.handle = argv[index + 1];
      index += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--launch-status') {
      options.launchStatus = argv[index + 1];
      index += 1;
    } else if (arg === '--locales') {
      options.locales = parseList(argv[index + 1]);
      index += 1;
    } else if (arg === '--use-cli-client') {
      options.useCliClient = true;
    } else if (arg === '--write') {
      options.write = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function buildLaunchStatusPlan(rawOptions = {}) {
  const handle = normalizeHandle(rawOptions.handle);
  const launchStatus = ensureValue(rawOptions.launchStatus, '--launch-status');
  const locales = rawOptions.locales || defaultLocales;

  if (!launchStatuses.includes(launchStatus)) {
    throw new Error(`Invalid launch status: ${launchStatus}. Use ${launchStatuses.join(', ')}.`);
  }

  const unknownLocales = locales.filter((locale) => !defaultLocales.includes(locale));

  if (unknownLocales.length > 0) {
    throw new Error(`Unsupported locales: ${unknownLocales.join(', ')}.`);
  }

  return {
    handle,
    launchStatus,
    locales,
    documentIds: [`productPage.${handle}`],
    localeDocumentIds: locales.map((locale) => `productLocalePage.${locale}.${handle}`),
  };
}

export function buildDraftAwareLaunchStatusTargets(documentIds, documents) {
  const existingIds = new Set(documents.map((document) => document._id));
  const missingIds = documentIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Missing documents: ${missingIds.join(', ')}`);
  }

  return documentIds.flatMap((id) => {
    const draftId = getDraftDocumentId(id);

    return existingIds.has(draftId) ? [id, draftId] : [id];
  });
}

async function loadEnvFile(filePath) {
  try {
    const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/);

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
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function createSanityClient({ env = process.env, useCliClient = false, write = false } = {}) {
  const projectId = env.SANITY_PROJECT_ID || env.SANITY_STUDIO_PROJECT_ID;
  const dataset = env.SANITY_DATASET || env.SANITY_STUDIO_DATASET;
  const apiVersion = env.SANITY_API_VERSION || '2026-06-20';

  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID for launch status update.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for launch status update.');
  }

  assertDevelopmentDataset(dataset);

  if (useCliClient) {
    const { getCliClient } = await import('sanity/cli');

    return {
      client: getCliClient({ apiVersion }),
      dataset,
    };
  }

  const token = write ? env.SANITY_API_WRITE_TOKEN : env.SANITY_API_READ_TOKEN || env.SANITY_API_WRITE_TOKEN;

  if (!token) {
    throw new Error('Missing Sanity token for launch status update. Use --use-cli-client from Sanity CLI if needed.');
  }

  return {
    client: createSanityContentClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
      token,
    }),
    dataset,
  };
}

export async function setProductLaunchStatus(plan, { useCliClient = false, write = false } = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const lookupIds = [...plan.documentIds, ...plan.localeDocumentIds]
    .flatMap((id) => [id, getDraftDocumentId(id)]);
  const readClient = client.withConfig({ perspective: 'raw' });
  const documents = await readClient.fetch(
    '*[_id in $ids] | order(_id asc){_id,_type,locale,shopifyProductGid,shopifyHandle,shopifyStatus}',
    { ids: lookupIds },
  );
  const productTargetIds = buildDraftAwareLaunchStatusTargets(plan.documentIds, documents);
  const localeTargetIds = buildDraftAwareLaunchStatusTargets(plan.localeDocumentIds, documents);
  const targetIds = localeTargetIds;
  const productDocuments = documents.filter((document) => productTargetIds.includes(document._id));
  const localeDocuments = documents.filter((document) => localeTargetIds.includes(document._id));
  const targetDocuments = [...productDocuments, ...localeDocuments];

  if (plan.launchStatus === 'live') {
    const blockedDocuments = targetDocuments.filter(
      (document) => !document.shopifyProductGid || !document.shopifyHandle,
    );

    if (blockedDocuments.length > 0) {
      throw new Error(
        `Refusing to mark live before Shopify Product GID and handle are mapped: ${blockedDocuments
          .map((document) => document._id)
          .join(', ')}`,
      );
    }
  }

  if (!write) {
    return {
      dataset,
      mode: 'dry-run',
      documents: targetDocuments,
    };
  }

  const transaction = localeTargetIds.reduce(
    (currentTransaction, id) =>
      currentTransaction.patch(id, (patch) => patch.set({ launchStatus: plan.launchStatus })),
    client.transaction(),
  );

  await transaction.commit({ visibility: 'sync' });

  return {
    dataset,
    mode: 'write',
    updatedDocuments: targetIds,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = buildLaunchStatusPlan(options);

  await loadEnvFile(options.envFile);

  const result = await setProductLaunchStatus(plan, {
    useCliClient: options.useCliClient,
    write: options.write,
  });

  const output = {
    ok: true,
    handle: plan.handle,
    launchStatus: plan.launchStatus,
    ...result,
  };

  if (options.json || options.write) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log('Product launch status dry-run complete.');
  console.log(`Handle: ${plan.handle}`);
  console.log(`Launch status: ${plan.launchStatus}`);
  console.log(`Product check documents: ${plan.documentIds.join(', ')}`);
  console.log(`Language page documents: ${plan.localeDocumentIds.join(', ')}`);

  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
