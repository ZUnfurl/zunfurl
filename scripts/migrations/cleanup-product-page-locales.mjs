import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';

const removableFields = ['defaultLocale', 'locales'];

export function parseArgs(argv) {
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

function assertDevelopmentDataset(dataset) {
  if (dataset !== 'development') {
    throw new Error(`Refusing to cleanup productPage locales on non-development Sanity dataset: ${dataset}.`);
  }
}

function getSanityClient({ useCliClient = false, write = false } = {}) {
  const projectId = process.env.SANITY_PROJECT_ID ?? process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET ?? process.env.SANITY_STUDIO_DATASET;
  const token = write
    ? process.env.SANITY_API_WRITE_TOKEN
    : process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN;

  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET.');
  }

  if (write) {
    assertDevelopmentDataset(dataset);
  }

  if (useCliClient) {
    return { client: undefined, dataset };
  }

  if (!token) {
    throw new Error('Missing Sanity token. Use --use-cli-client from Sanity CLI if needed.');
  }

  return {
    client: createSanityContentClient({
      projectId,
      dataset,
      useCdn: false,
      token,
    }),
    dataset,
  };
}

function buildPatch(document) {
  const unset = removableFields.filter((fieldName) => fieldName in document);

  if (unset.length === 0) {
    return undefined;
  }

  return {
    id: document._id,
    unset,
  };
}

export async function cleanupProductPageLocales({ client: providedClient, dataset, write = false } = {}) {
  const client = providedClient;

  if (!client) {
    throw new Error('Missing Sanity client.');
  }

  if (write) {
    assertDevelopmentDataset(dataset);
  }

  const documents = await client.withConfig({ perspective: 'raw' }).fetch(
    `*[_type == "productPage" && (defined(defaultLocale) || defined(locales))] | order(_id asc) {
      _id,
      defaultLocale,
      locales
    }`,
  );
  const patches = documents.map(buildPatch).filter(Boolean);

  if (!write || patches.length === 0) {
    return {
      ok: true,
      dataset,
      mode: write ? 'write' : 'dry-run',
      documentsChecked: documents.length,
      patches,
    };
  }

  const transaction = patches.reduce(
    (currentTransaction, patch) =>
      currentTransaction.patch(patch.id, (sanityPatch) => sanityPatch.unset(patch.unset)),
    client.transaction(),
  );

  await transaction.commit({ visibility: 'sync' });

  return {
    ok: true,
    dataset,
    mode: 'write',
    documentsChecked: documents.length,
    patches,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  await loadEnvFile(options.envFile);

  if (options.useCliClient) {
    const { getCliClient } = await import('sanity/cli');
    const { dataset } = getSanityClient({ useCliClient: true, write: options.write });
    const client = getCliClient({ apiVersion: '2026-06-20' });
    const result = await cleanupProductPageLocales({ client, dataset, write: options.write });
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const { client, dataset } = getSanityClient({ write: options.write });
  const result = await cleanupProductPageLocales({ client, dataset, write: options.write });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
