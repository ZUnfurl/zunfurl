import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { buildSanitySeed } from './local-content-to-sanity.mjs';

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

async function createSanityWriteClient({ useCliClient = false } = {}) {
  const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET;
  const apiVersion = process.env.SANITY_API_VERSION || '2026-06-20';

  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID for productPage migration.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for productPage migration.');
  }

  if (dataset !== 'development') {
    throw new Error(`Refusing to write productPage migration to non-development Sanity dataset: ${dataset}.`);
  }

  if (useCliClient) {
    const { getCliClient } = await import('sanity/cli');

    return {
      client: getCliClient({ apiVersion }),
      dataset,
    };
  }

  if (!process.env.SANITY_API_WRITE_TOKEN) {
    throw new Error('Missing SANITY_API_WRITE_TOKEN for productPage migration. Use --use-cli-client from Sanity CLI if needed.');
  }

  return {
    client: createSanityContentClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
      token: process.env.SANITY_API_WRITE_TOKEN,
    }),
    dataset,
  };
}

export async function buildProductPageMigrationPlan() {
  const seed = await buildSanitySeed();
  const productPages = seed.documents.filter((document) =>
    ['productPage', 'productLocalePage'].includes(document._type),
  );

  return {
    mode: 'dry-run',
    documents: productPages,
    documentIds: productPages.map((document) => document._id),
  };
}

export async function writeProductPages({ useCliClient = false } = {}) {
  const plan = await buildProductPageMigrationPlan();
  const { client, dataset } = await createSanityWriteClient({ useCliClient });

  for (const document of plan.documents) {
    await client.createOrReplace(document, { visibility: 'sync' });
  }

  return {
    dataset,
    writtenDocuments: plan.documentIds,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  await loadEnvFile(options.envFile);

  if (options.write) {
    const result = await writeProductPages({ useCliClient: options.useCliClient });

    console.log(JSON.stringify({ ok: true, mode: 'write', ...result }, null, 2));
    return result;
  }

  const plan = await buildProductPageMigrationPlan();

  console.log(JSON.stringify({ ok: true, ...plan }, null, 2));
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
