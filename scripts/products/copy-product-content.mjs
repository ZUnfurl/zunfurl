import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { activeLocales, brandName } from 'gcss-config';
import { assertDevelopmentDataset } from './create-product-draft.mjs';

const defaultLocales = [...activeLocales];

export function getDraftDocumentId(documentId) {
  return `drafts.${documentId}`;
}

function ensureValue(value, name) {
  if (!value) {
    throw new Error(`Missing required option: ${name}.`);
  }

  return value;
}

function normalizeHandle(handle, name) {
  const value = ensureValue(handle, name).trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid product handle for ${name}: ${value}. Use lowercase kebab-case.`);
  }

  return value;
}

function parseList(value) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function parseArgs(argv) {
  const options = {
    envFile: '.env',
    json: false,
    locales: defaultLocales,
    sourceHandle: undefined,
    targetHandle: undefined,
    targetName: undefined,
    useCliClient: false,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--env-file') {
      options.envFile = argv[index + 1];
      index += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--locales') {
      options.locales = parseList(argv[index + 1]);
      index += 1;
    } else if (arg === '--source-handle') {
      options.sourceHandle = argv[index + 1];
      index += 1;
    } else if (arg === '--target-handle') {
      options.targetHandle = argv[index + 1];
      index += 1;
    } else if (arg === '--target-name') {
      options.targetName = argv[index + 1];
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

export function buildCopyProductContentPlan(rawOptions = {}) {
  const sourceHandle = normalizeHandle(rawOptions.sourceHandle, '--source-handle');
  const targetHandle = normalizeHandle(rawOptions.targetHandle, '--target-handle');
  const targetName = ensureValue(rawOptions.targetName, '--target-name').trim();
  const locales = rawOptions.locales || defaultLocales;

  if (sourceHandle === targetHandle) {
    throw new Error('Source and target handles must be different.');
  }

  const unknownLocales = locales.filter((locale) => !defaultLocales.includes(locale));

  if (unknownLocales.length > 0) {
    throw new Error(`Unsupported locales: ${unknownLocales.join(', ')}.`);
  }

  return {
    locales,
    sourceHandle,
    targetHandle,
    targetName,
    documentIds: [`productPage.${targetHandle}`],
    localeDocumentIds: locales.map((locale) => `productLocalePage.${locale}.${targetHandle}`),
  };
}

export function getDraftAwareTargetIds(documentId, documentsById) {
  const draftId = getDraftDocumentId(documentId);
  const ids = [];

  if (documentsById.has(documentId)) ids.push(documentId);
  if (documentsById.has(draftId)) ids.push(draftId);

  return ids;
}

function normalizeDetailHeroContent(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  return {
    summary: value.summary,
    gallery: value.gallery,
  };
}

const legacyLocaleContentFields = [
  'benefits',
  'gallery',
  'longDescription',
  'roadmapDescription',
  'roadmapEyebrow',
  'roadmapFooterPrimary',
  'roadmapFooterSecondary',
  'roadmapHref',
  'roadmapPill',
  'roadmapSilhouette',
  'ritual',
  'science',
  'shortDescription',
  'status',
];

function stripLegacyLocaleFields(content) {
  const value = { ...content };

  for (const field of legacyLocaleContentFields) {
    delete value[field];
  }

  return value;
}

function stripStoryPageLegacyFields(storyPage) {
  const { align, ...content } = storyPage;

  void align;

  return content;
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
    throw new Error('Missing SANITY_PROJECT_ID for product content copy.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for product content copy.');
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
    throw new Error('Missing Sanity token for product content copy. Use --use-cli-client from Sanity CLI if needed.');
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

function copyLocalePayload({ sourceLocale, targetLocale, targetHandle, targetName, locale }) {
  const {
    _key,
    launchStatus,
    locale: _sourceLocale,
    name,
    seo,
    slug,
    ...sourceContent
  } = sourceLocale;

  void _key;
  void launchStatus;
  void _sourceLocale;
  void name;
  void seo;
  void slug;
  const cleanedContent = stripLegacyLocaleFields(sourceContent);

  return {
    ...cleanedContent,
    detailHero: normalizeDetailHeroContent(cleanedContent.detailHero),
    storyPages: Array.isArray(cleanedContent.storyPages)
      ? cleanedContent.storyPages.map(stripStoryPageLegacyFields)
      : cleanedContent.storyPages,
    _key: targetLocale._key || locale,
    locale,
    launchStatus: targetLocale.launchStatus,
    slug: { _type: 'slug', current: targetHandle },
    name: targetName,
    seo: {
      ...sourceLocale.seo,
      title: `${targetName} | ${brandName}`,
    },
  };
}

function getDocument(byId, id, label) {
  const document = byId.get(id);

  if (!document) {
    throw new Error(`Missing ${label} document: ${id}`);
  }

  return document;
}

function copyProductLocalePagePayload({ sourcePage, targetLocalePage, targetHandle, targetName, locale }) {
  const { _key, ...payload } = copyLocalePayload({
    sourceLocale: sourcePage,
    targetLocale: targetLocalePage,
    targetHandle,
    targetName,
    locale,
  });

  void _key;

  return payload;
}

export async function copyProductContent(plan, { useCliClient = false, write = false } = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const sourceId = `productPage.${plan.sourceHandle}`;
  const targetId = `productPage.${plan.targetHandle}`;
  const baseIds = [sourceId, targetId];
  const sourceLocaleIds = plan.locales.map((locale) => `productLocalePage.${locale}.${plan.sourceHandle}`);
  const targetLocaleIds = plan.locales.map((locale) => `productLocalePage.${locale}.${plan.targetHandle}`);
  const draftTargetIds = [targetId, ...targetLocaleIds].map(getDraftDocumentId);
  const lookupIds = [...baseIds, ...sourceLocaleIds, ...draftTargetIds];
  const readClient = client.withConfig({ perspective: 'raw' });
  const documents = await readClient.fetch('*[_id in $ids] | order(_id asc)', {
    ids: [...lookupIds, ...targetLocaleIds],
  });
  const byId = new Map(documents.map((document) => [document._id, document]));
  const missingIds = baseIds.filter((id) => !byId.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Missing source or target documents: ${missingIds.join(', ')}`);
  }

  const patches = [];

  for (const locale of plan.locales) {
    const sourceLocaleId = `productLocalePage.${locale}.${plan.sourceHandle}`;
    const targetLocaleId = `productLocalePage.${locale}.${plan.targetHandle}`;
    const sourceLocalePage = getDocument(byId, sourceLocaleId, 'source product language page');
    const targetLocaleIdsForPatch = getDraftAwareTargetIds(targetLocaleId, byId);

    if (targetLocaleIdsForPatch.length === 0) {
      throw new Error(`Missing target product language page: ${targetLocaleId}`);
    }

    for (const id of targetLocaleIdsForPatch) {
      const targetLocalePage = byId.get(id);

      patches.push({
        id,
        payload: copyProductLocalePagePayload({
          sourcePage: sourceLocalePage,
          targetLocalePage,
          targetHandle: plan.targetHandle,
          targetName: plan.targetName,
          locale,
        }),
      });
    }
  }

  if (!write) {
    return {
      dataset,
      mode: 'dry-run',
      patches: patches.map((patch) => patch.id),
    };
  }

  const transaction = patches.reduce(
    (currentTransaction, patch) =>
      currentTransaction.patch(patch.id, (sanityPatch) => sanityPatch.set(patch.payload)),
    client.transaction(),
  );

  await transaction.commit({ visibility: 'sync' });

  return {
    dataset,
    mode: 'write',
    updatedDocuments: patches.map((patch) => patch.id),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = buildCopyProductContentPlan(options);

  await loadEnvFile(options.envFile);

  const result = await copyProductContent(plan, {
    useCliClient: options.useCliClient,
    write: options.write,
  });

  const output = {
    ok: true,
    sourceHandle: plan.sourceHandle,
    targetHandle: plan.targetHandle,
    targetName: plan.targetName,
    ...result,
  };

  if (options.json || options.write) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log('Product content copy dry-run complete.');
  console.log(`Source handle: ${plan.sourceHandle}`);
  console.log(`Target handle: ${plan.targetHandle}`);
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
