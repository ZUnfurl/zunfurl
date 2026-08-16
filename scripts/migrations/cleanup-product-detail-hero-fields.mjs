import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { assertDevelopmentDataset } from '../products/create-product-draft.mjs';

const legacyDetailHeroFields = [
  'backLabel',
  'carouselLabel',
  'eyebrow',
  'mosaicLabel',
  'nextLabel',
  'previousLabel',
  'surface',
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
    throw new Error('Missing SANITY_PROJECT_ID for product detail hero cleanup.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for product detail hero cleanup.');
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
    throw new Error('Missing Sanity token for product detail hero cleanup. Use --use-cli-client from Sanity CLI if needed.');
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

function stripLegacyDetailHeroFields(detailHero) {
  if (!detailHero || typeof detailHero !== 'object') {
    return {
      changed: false,
      value: detailHero,
      removed: [],
    };
  }

  const nextDetailHero = { ...detailHero };
  const removed = [];

  for (const field of legacyDetailHeroFields) {
    if (field in nextDetailHero) {
      delete nextDetailHero[field];
      removed.push(field);
    }
  }

  return {
    changed: removed.length > 0,
    value: nextDetailHero,
    removed,
  };
}

function buildPatchPlan(document) {
  if (document._type === 'productLocalePage') {
    const cleaned = stripLegacyDetailHeroFields(document.detailHero);

    if (!cleaned.changed) {
      return undefined;
    }

    return {
      id: document._id,
      kind: 'unset-detail-hero-fields',
      removed: cleaned.removed,
      paths: cleaned.removed.map((field) => `detailHero.${field}`),
    };
  }

  return undefined;
}

export async function buildProductDetailHeroCleanupPlan({ useCliClient = false, write = false } = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const readClient = client.withConfig({ perspective: 'raw' });
  const documents = await readClient.fetch(
    '*[_type == "productLocalePage"] | order(_id asc) {_id, _type, detailHero}',
  );
  const patches = documents.map(buildPatchPlan).filter(Boolean);

  return {
    client,
    dataset,
    documentsChecked: documents.length,
    patches,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadEnvFile(options.envFile);

  const plan = await buildProductDetailHeroCleanupPlan({
    useCliClient: options.useCliClient,
    write: options.write,
  });

  console.log(`Dataset: ${plan.dataset}`);
  console.log(`Documents checked: ${plan.documentsChecked}`);
  console.log(`Documents to clean: ${plan.patches.length}`);

  for (const patch of plan.patches) {
    console.log(JSON.stringify({
      id: patch.id,
      kind: patch.kind,
      removed: patch.removed,
      removedByLocale: patch.removedByLocale,
    }));
  }

  if (!options.write) {
    console.log('Dry-run only. Re-run with --write to clean Sanity documents.');
    return;
  }

  if (plan.patches.length === 0) {
    console.log('No Sanity documents needed cleanup.');
    return;
  }

  let transaction = plan.client.transaction();

  for (const patch of plan.patches) {
    if (patch.kind === 'unset-detail-hero-fields') {
      transaction = transaction.patch(patch.id, (sanityPatch) => sanityPatch.unset(patch.paths));
    }
  }

  await transaction.commit();
  console.log(`Cleaned ${plan.patches.length} Sanity documents.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
