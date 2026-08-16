import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { assertDevelopmentDataset } from '../products/create-product-draft.mjs';

const pageUnsetPaths = [
  'hero.highlightLabel',
  'hero.highlightValue',
  'pageHero.motionEyebrow',
  'pageHero.motionBody',
  'sectionCards',
  'productOverview',
  'contactCtaSection',
  'contactSection.privacyNotice',
  'contactSection.fallbackEmailLabel',
  'contactSection.fallbackEmailHref',
  'contactSection.fieldCopy.privacyLabel',
];

const legacyProductLocaleFields = [
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

function parseArgs(argv) {
  const options = {
    envFile: '.env',
    useCliClient: false,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--env-file') {
      options.envFile = argv[index + 1];
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
    throw new Error('Missing SANITY_PROJECT_ID for legacy content cleanup.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for legacy content cleanup.');
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
    throw new Error('Missing Sanity token for legacy content cleanup. Use --use-cli-client from Sanity CLI if needed.');
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

function hasOwnPath(value, path) {
  const parts = path.split('.');
  let current = value;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return false;
    }

    current = current[part];
  }

  return true;
}

function stripTopicHelperText(topics) {
  if (!Array.isArray(topics)) {
    return {
      changed: false,
      value: topics,
    };
  }

  let changed = false;
  const value = topics.map((topic) => {
    if (!topic || typeof topic !== 'object' || !('helperText' in topic)) {
      return topic;
    }

    const { helperText, ...nextTopic } = topic;

    void helperText;
    changed = true;

    return nextTopic;
  });

  return {
    changed,
    value,
  };
}

function stripStoryPageLegacyFields(storyPage) {
  if (!storyPage || typeof storyPage !== 'object' || !('align' in storyPage)) {
    return {
      changed: false,
      value: storyPage,
    };
  }

  const { align, ...nextStoryPage } = storyPage;

  void align;

  return {
    changed: true,
    value: nextStoryPage,
  };
}

function stripStoryPagesLegacyFields(storyPages) {
  if (!Array.isArray(storyPages)) {
    return {
      changed: false,
      value: storyPages,
    };
  }

  let changed = false;
  const value = storyPages.map((storyPage) => {
    const result = stripStoryPageLegacyFields(storyPage);

    if (result.changed) {
      changed = true;
    }

    return result.value;
  });

  return {
    changed,
    value,
  };
}

function stripProductLocaleLegacyFields(localeContent) {
  if (!localeContent || typeof localeContent !== 'object') {
    return {
      changed: false,
      value: localeContent,
      removed: [],
    };
  }

  let changed = false;
  const removed = [];
  const value = { ...localeContent };

  for (const field of legacyProductLocaleFields) {
    if (field in value) {
      delete value[field];
      removed.push(field);
      changed = true;
    }
  }

  const storyPages = stripStoryPagesLegacyFields(value.storyPages);

  if (storyPages.changed) {
    value.storyPages = storyPages.value;
    removed.push('storyPages[].align');
    changed = true;
  }

  return {
    changed,
    value,
    removed,
  };
}

function buildPagePatch(document) {
  const unset = pageUnsetPaths.filter((path) => hasOwnPath(document, path));
  const set = {};
  const removed = [...unset];
  const topics = stripTopicHelperText(document.contactSection?.topics);

  if (topics.changed) {
    set['contactSection.topics'] = topics.value;
    removed.push('contactSection.topics[].helperText');
  }

  if (unset.length === 0 && Object.keys(set).length === 0) {
    return undefined;
  }

  return {
    id: document._id,
    type: document._type,
    removed,
    set,
    unset,
  };
}

function buildProductLocalePagePatch(document) {
  const cleaned = stripProductLocaleLegacyFields(document);

  if (!cleaned.changed) {
    return undefined;
  }

  const unset = cleaned.removed.filter((field) => field !== 'storyPages[].align');
  const set = {};

  if (cleaned.removed.includes('storyPages[].align')) {
    set.storyPages = cleaned.value.storyPages;
  }

  return {
    id: document._id,
    type: document._type,
    removed: cleaned.removed,
    set,
    unset,
  };
}

function buildPatch(document) {
  if (document._type === 'page') {
    return buildPagePatch(document);
  }

  if (document._type === 'productLocalePage') {
    return buildProductLocalePagePatch(document);
  }

  return undefined;
}

export async function buildLegacyContentCleanupPlan({ useCliClient = false, write = false } = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const readClient = client.withConfig({ perspective: 'raw' });
  const documents = await readClient.fetch(
    '*[_type in ["page", "productLocalePage"]] | order(_type asc, _id asc)',
  );
  const patches = documents.map(buildPatch).filter(Boolean);

  return {
    client,
    dataset,
    documentsChecked: documents.length,
    patches,
  };
}

export async function writeLegacyContentCleanup({ useCliClient = false } = {}) {
  const plan = await buildLegacyContentCleanupPlan({
    useCliClient,
    write: true,
  });

  if (plan.patches.length === 0) {
    return {
      dataset: plan.dataset,
      documentsChecked: plan.documentsChecked,
      writtenDocuments: [],
    };
  }

  let transaction = plan.client.transaction();

  for (const patch of plan.patches) {
    transaction = transaction.patch(patch.id, (sanityPatch) => {
      let currentPatch = sanityPatch;

      if (patch.unset.length > 0) {
        currentPatch = currentPatch.unset(patch.unset);
      }

      if (Object.keys(patch.set).length > 0) {
        currentPatch = currentPatch.set(patch.set);
      }

      return currentPatch;
    });
  }

  await transaction.commit({ visibility: 'sync' });

  return {
    dataset: plan.dataset,
    documentsChecked: plan.documentsChecked,
    writtenDocuments: plan.patches.map((patch) => patch.id),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  await loadEnvFile(options.envFile);

  if (options.write) {
    const result = await writeLegacyContentCleanup({
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({ ok: true, mode: 'write', ...result }, null, 2));
    return result;
  }

  const plan = await buildLegacyContentCleanupPlan({
    useCliClient: options.useCliClient,
    write: false,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'dry-run',
        dataset: plan.dataset,
        documentsChecked: plan.documentsChecked,
        patches: plan.patches.map((patch) => ({
          id: patch.id,
          type: patch.type,
          removed: patch.removed,
          removedByLocale: patch.removedByLocale,
        })),
      },
      null,
      2,
    ),
  );

  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
