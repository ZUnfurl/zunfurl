import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { assertDevelopmentDataset } from '../products/create-product-draft.mjs';

const fallbackCaptionsByLocale = {
  en: {
    captionEyebrow: 'Example Collection',
    captionTitle: 'Reusable content, strict profile boundaries.',
  },
  fr: {
    captionEyebrow: 'Example Collection',
    captionTitle: 'Contenu reutilisable, profils stricts.',
  },
  'zh-cn': {
    captionEyebrow: 'Example Collection',
    captionTitle: '可复用内容，清晰的 profile 边界。',
  },
};

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
    throw new Error('Missing SANITY_PROJECT_ID for Home Hero caption migration.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for Home Hero caption migration.');
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
    throw new Error('Missing Sanity token for Home Hero caption migration.');
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

function captionForLocale(document, productCaptions) {
  return productCaptions.get(document.locale) ?? fallbackCaptionsByLocale[document.locale];
}

function buildPatch(document, productCaptions) {
  const caption = captionForLocale(document, productCaptions);

  if (!caption) {
    throw new Error(`Unsupported Home locale for caption migration: ${document.locale}`);
  }

  const set = {};
  const reasons = [];

  if (!document.hero?.captionEyebrow) {
    set['hero.captionEyebrow'] = caption.captionEyebrow;
    reasons.push('captionEyebrow');
  }

  if (!document.hero?.captionTitle) {
    set['hero.captionTitle'] = caption.captionTitle;
    reasons.push('captionTitle');
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    id: document._id,
    locale: document.locale,
    reasons,
    set,
  };
}

export async function buildHomeHeroCaptionPlan({
  useCliClient = false,
  write = false,
} = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const [documents, productPages] = await Promise.all([
    client.withConfig({ perspective: 'raw' }).fetch(`
      *[_type == "page" && kind == "home"] | order(locale asc, _id asc) {
        _id,
        locale,
        hero {
          captionEyebrow,
          captionTitle
        }
      }
    `),
    client.withConfig({ perspective: 'raw' }).fetch(`
      *[_type == "productLocalePage" && slug.current == "example-product"] {
        locale,
        collection,
        tagline
      }
    `),
  ]);
  const productCaptions = new Map(
    productPages
      .filter((productPage) => productPage.locale && productPage.collection && productPage.tagline)
      .map((productPage) => [
        productPage.locale,
        {
          captionEyebrow: productPage.collection,
          captionTitle: productPage.tagline,
        },
      ]),
  );
  const patches = documents.map((document) => buildPatch(document, productCaptions)).filter(Boolean);

  return {
    dataset,
    documentsChecked: documents.length,
    mode: 'dry-run',
    patches,
  };
}

export async function writeHomeHeroCaption({ useCliClient = false } = {}) {
  const plan = await buildHomeHeroCaptionPlan({
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
    const result = await writeHomeHeroCaption({
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({ ok: true, mode: 'write', ...result }, null, 2));
    return result;
  }

  const plan = await buildHomeHeroCaptionPlan({
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
