import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { assertDevelopmentDataset } from '../products/create-product-draft.mjs';

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

async function createSanityClient({ useCliClient = false, write = false } = {}) {
  const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET;
  const apiVersion = process.env.SANITY_API_VERSION || '2026-06-20';

  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID for Home product spotlight split.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for Home product spotlight split.');
  }

  assertDevelopmentDataset(dataset);

  if (useCliClient) {
    const { getCliClient } = await import('sanity/cli');

    return {
      client: getCliClient({ apiVersion }),
      dataset,
    };
  }

  const token = write
    ? process.env.SANITY_API_WRITE_TOKEN
    : process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN;

  if (!token) {
    throw new Error('Missing Sanity token for Home product spotlight split.');
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

function buildPatch(document) {
  if (!document.productSpotlight || document.homeProductSpotlight) {
    return null;
  }

  return {
    id: document._id,
    locale: document.locale,
    set: {
      homeProductSpotlight: document.productSpotlight,
    },
  };
}

export async function buildHomeProductSpotlightPlan({
  useCliClient = false,
  write = false,
} = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const documents = await client.withConfig({ perspective: 'raw' }).fetch(`
    *[_type == "page" && kind == "home"] | order(locale asc, _id asc) {
      _id,
      locale,
      homeProductSpotlight,
      productSpotlight
    }
  `);
  const patches = documents.map(buildPatch).filter(Boolean);

  return {
    dataset,
    documentsChecked: documents.length,
    mode: 'dry-run',
    patches,
  };
}

export async function writeHomeProductSpotlight({ useCliClient = false } = {}) {
  const plan = await buildHomeProductSpotlightPlan({
    useCliClient,
    write: true,
  });

  if (plan.patches.length === 0) {
    return {
      dataset: plan.dataset,
      writtenDocuments: [],
    };
  }

  const { client } = await createSanityClient({ useCliClient, write: true });
  let transaction = client.transaction();

  for (const patch of plan.patches) {
    transaction = transaction.patch(patch.id, (sanityPatch) => sanityPatch.set(patch.set));
  }

  await transaction.commit({ visibility: 'sync' });

  return {
    dataset: plan.dataset,
    writtenDocuments: plan.patches.map((patch) => patch.id),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  await loadEnvFile(options.envFile);

  if (options.write) {
    const result = await writeHomeProductSpotlight({
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({ ok: true, mode: 'write', ...result }, null, 2));
    return result;
  }

  const plan = await buildHomeProductSpotlightPlan({
    useCliClient: options.useCliClient,
    write: false,
  });

  console.log(JSON.stringify({ ok: true, ...plan }, null, 2));
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
