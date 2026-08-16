import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { assertDevelopmentDataset } from '../products/create-product-draft.mjs';

const validImageSources = new Set(['sanity', 'local']);

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
    throw new Error('Missing SANITY_PROJECT_ID for image source migration.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for image source migration.');
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
    ? env.SANITY_API_WRITE_TOKEN
    : env.SANITY_API_READ_TOKEN || env.SANITY_API_WRITE_TOKEN;

  if (!token) {
    throw new Error(
      'Missing Sanity token for image source migration. Use --use-cli-client from Sanity CLI if needed.',
    );
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

function hasSanityAsset(image) {
  return Boolean(image?.asset?._ref);
}

function hasLocalPath(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveDefaultImageSource({ current, localPath, sanityImage }) {
  if (validImageSources.has(current)) {
    return current;
  }

  if (hasSanityAsset(sanityImage)) {
    return 'sanity';
  }

  if (hasLocalPath(localPath)) {
    return 'local';
  }

  return 'sanity';
}

function setItemImageSource(item, { localField, sanityField }) {
  if (!item || typeof item !== 'object') {
    return {
      changed: false,
      value: item,
    };
  }

  const value = { ...item };
  let changed = false;

  if (value[sanityField] === null) {
    delete value[sanityField];
    changed = true;
  }

  const imageSource = resolveDefaultImageSource({
    current: value.imageSource,
    localPath: value[localField],
    sanityImage: value[sanityField],
  });

  if (value.imageSource === imageSource) {
    return {
      changed,
      value,
    };
  }

  return {
    changed: true,
    value: {
      ...value,
      imageSource,
    },
  };
}

function setArrayImageSources(items, options) {
  if (!Array.isArray(items)) {
    return {
      changed: false,
      value: items,
      changedItems: 0,
    };
  }

  let changedItems = 0;
  const value = items.map((item) => {
    const result = setItemImageSource(item, options);

    if (result.changed) {
      changedItems += 1;
    }

    return result.value;
  });

  return {
    changed: changedItems > 0,
    value,
    changedItems,
  };
}

function buildPagePatch(document) {
  const set = {};
  const changes = [];

  const heroSlides = setArrayImageSources(document.pageHero?.slides, {
    localField: 'src',
    sanityField: 'image',
  });

  if (heroSlides.changed) {
    set['pageHero.slides'] = heroSlides.value;
    changes.push(`pageHero.slides:${heroSlides.changedItems}`);
  }

  const brandFrameworkSlides = setArrayImageSources(document.brandFramework?.slides, {
    localField: 'image',
    sanityField: 'sanityImage',
  });

  if (brandFrameworkSlides.changed) {
    set['brandFramework.slides'] = brandFrameworkSlides.value;
    changes.push(`brandFramework.slides:${brandFrameworkSlides.changedItems}`);
  }

  const aboutPanels = setArrayImageSources(document.aboutSignature?.panels, {
    localField: 'imagePath',
    sanityField: 'image',
  });

  if (aboutPanels.changed) {
    set['aboutSignature.panels'] = aboutPanels.value;
    changes.push(`aboutSignature.panels:${aboutPanels.changedItems}`);
  }

  if (document.contactMaskSection && typeof document.contactMaskSection === 'object') {
    if (document.contactMaskSection.sanityImage === null) {
      const sanitizedContactMaskSection = { ...document.contactMaskSection };
      delete sanitizedContactMaskSection.sanityImage;
      set.contactMaskSection = sanitizedContactMaskSection;
      changes.push('contactMaskSection.sanityImage:null');
    }

    const imageSource = resolveDefaultImageSource({
      current: document.contactMaskSection.imageSource,
      localPath: document.contactMaskSection.image,
      sanityImage: document.contactMaskSection.sanityImage,
    });

    if (document.contactMaskSection.imageSource !== imageSource) {
      if (set.contactMaskSection) {
        set.contactMaskSection.imageSource = imageSource;
      } else {
        set['contactMaskSection.imageSource'] = imageSource;
      }
      changes.push('contactMaskSection:1');
    }
  }

  if (changes.length === 0) {
    return undefined;
  }

  return {
    id: document._id,
    type: document._type,
    changes,
    set,
  };
}

function buildProductLocalePagePatch(document) {
  const storyPages = setArrayImageSources(document.storyPages, {
    localField: 'image',
    sanityField: 'sanityImage',
  });

  if (!storyPages.changed) {
    return undefined;
  }

  return {
    id: document._id,
    type: document._type,
    changes: [`storyPages:${storyPages.changedItems}`],
    set: {
      storyPages: storyPages.value,
    },
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

export async function buildImageSourceDefaultsPlan({ useCliClient = false, write = false } = {}) {
  const { client, dataset } = await createSanityClient({ useCliClient, write });
  const readClient = client.withConfig({ perspective: 'raw' });
  const documents = await readClient.fetch(`
    *[_type in ["page", "productLocalePage"]] | order(_type asc, _id asc) {
      _id,
      _type,
      pageHero,
      brandFramework,
      aboutSignature,
      contactMaskSection,
      storyPages,
    }
  `);
  const patches = documents.map(buildPatch).filter(Boolean);

  return {
    client,
    dataset,
    documentsChecked: documents.length,
    patches,
  };
}

export async function writeImageSourceDefaults({ useCliClient = false } = {}) {
  const plan = await buildImageSourceDefaultsPlan({
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
    transaction = transaction.patch(patch.id, (sanityPatch) => sanityPatch.set(patch.set));
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
    const result = await writeImageSourceDefaults({
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({ ok: true, mode: 'write', ...result }, null, 2));
    return result;
  }

  const plan = await buildImageSourceDefaultsPlan({
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
          changes: patch.changes,
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
