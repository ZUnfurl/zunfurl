import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { activeLocales, brandName } from 'gcss-config';

const defaultLocales = [...activeLocales];
const defaultLaunchStatus = 'draft';
const defaultRoadmapOrder = 999;

const localeCopy = {
  en: {
    availableLabel: 'Draft product',
    bodyPrefix: 'Editorial draft for',
    collection: brandName,
    footerPrimary: 'Draft',
    footerSecondary: 'Content pending',
    intro: 'This Sanity draft was generated from the new product template. Replace this copy before publishing.',
    linkLabel: 'View product detail',
    storyEyebrow: 'Product Introduction',
    storyTitle: 'Replace this story section before publishing.',
    tagline: 'Replace with a concise product promise.',
  },
  fr: {
    availableLabel: 'Produit brouillon',
    bodyPrefix: 'Brouillon éditorial pour',
    collection: brandName,
    footerPrimary: 'Brouillon',
    footerSecondary: 'Contenu à compléter',
    intro: 'Ce brouillon Sanity a été généré depuis le modèle nouveau produit. Remplacez ce texte avant publication.',
    linkLabel: 'Voir le détail produit',
    storyEyebrow: 'Introduction produit',
    storyTitle: 'Remplacer cette section avant publication.',
    tagline: 'Remplacer par une promesse produit concise.',
  },
  'zh-cn': {
    availableLabel: '商品草稿',
    bodyPrefix: '商品编辑草稿',
    collection: brandName,
    footerPrimary: '草稿',
    footerSecondary: '内容待完善',
    intro: '这是由新商品模板生成的 Sanity 草稿。发布前请替换为正式文案。',
    linkLabel: '查看商品详情',
    storyEyebrow: '商品介绍',
    storyTitle: '发布前请替换这一段商品故事。',
    tagline: '替换为一句清晰的商品承诺。',
  },
};

function ensureValue(value, name) {
  if (!value) {
    throw new Error(`Missing required option: ${name}.`);
  }

  return value;
}

function normalizeHandle(handle) {
  const value = ensureValue(handle, '--handle').trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid product handle: ${value}. Use lowercase kebab-case, for example: example-launch-product.`);
  }

  return value;
}

function titleFromHandle(handle) {
  return handle
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function parseList(value) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function parseArgs(argv) {
  const options = {
    collection: undefined,
    envFile: '.env',
    handle: undefined,
    json: false,
    launchStatus: defaultLaunchStatus,
    locales: defaultLocales,
    name: undefined,
    outFile: undefined,
    roadmapOrder: defaultRoadmapOrder,
    useCliClient: false,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--collection') {
      options.collection = argv[index + 1];
      index += 1;
    } else if (arg === '--env-file') {
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
    } else if (arg === '--name') {
      options.name = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      options.outFile = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--roadmap-order') {
      options.roadmapOrder = Number(argv[index + 1]);
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

function assertKnownLocales(locales) {
  const unknownLocales = locales.filter((locale) => !defaultLocales.includes(locale));

  if (unknownLocales.length > 0) {
    throw new Error(`Unsupported locales: ${unknownLocales.join(', ')}.`);
  }
}

export function assertDevelopmentDataset(dataset) {
  if (dataset !== 'development') {
    throw new Error(`Refusing to write product drafts to non-development Sanity dataset: ${dataset}.`);
  }
}

function galleryPathsForHandle(handle) {
  return [1, 2, 3, 4].map(
    (index) => `/brand-assets/products/${handle}/${handle}-${String(index).padStart(2, '0')}.webp`,
  );
}

function detailHeroGalleryForHandle(handle, displayName) {
  return galleryPathsForHandle(handle).map((src, index) => ({
    src,
    alt: `[待编辑] ${displayName} image ${index + 1}`,
  }));
}

function productLocalePageContent({ collection, displayName, handle, launchStatus, locale, roadmapOrder }) {
  const copy = localeCopy[locale];
  const gallery = galleryPathsForHandle(handle);

  return {
    _key: locale,
    locale,
    launchStatus,
    slug: {
      _type: 'slug',
      current: handle,
    },
    name: displayName,
    collection: collection || copy.collection,
    roadmapOrder,
    tagline: `[待编辑] ${copy.tagline}`,
    primaryImage: `/brand-assets/products/${handle}/${handle}-main.webp`,
    roadmapLinkLabel: copy.linkLabel,
    detailHero: {
      summary: `[待编辑] ${copy.intro}`,
      gallery: detailHeroGalleryForHandle(handle, displayName),
    },
    storyPages: [
      {
        _key: 'product-introduction',
        id: 'product-introduction',
        eyebrow: copy.storyEyebrow,
        title: `[待编辑] ${copy.storyTitle}`,
        body: `[待编辑] ${copy.bodyPrefix}: ${displayName}.`,
        supporting: `[待编辑] Replace this supporting copy before publishing.`,
        image: `/brand-assets/products/${handle}/${handle}-story-01.webp`,
        imageAlt: `[待编辑] ${displayName} story image`,
      },
    ],
    seo: {
      title: `${displayName} | ${brandName}`,
      description: `[待编辑] SEO description for ${displayName}.`,
    },
  };
}

function productPageDocument({ displayName, handle, roadmapOrder }) {
  return {
    _id: `productPage.${handle}`,
    _type: 'productPage',
    productStatus: 'active',
    roadmapOrder,
    shopifyHandle: handle,
    shopifyStatus: 'pending-shopify-summary',
    shopifyTitle: displayName,
    shopifyImageSummary: [],
    shopifyVariantSummary: [],
  };
}

function productLocalePageDocument({ collection, displayName, handle, launchStatus, locale, roadmapOrder }) {
  const { _key, ...localized } = productLocalePageContent({
    collection,
    displayName,
    handle,
    launchStatus,
    locale,
    roadmapOrder,
  });

  void _key;

  return {
    _id: `productLocalePage.${locale}.${handle}`,
    _type: 'productLocalePage',
    productPage: {
      _type: 'reference',
      _ref: `productPage.${handle}`,
    },
    shopifyHandle: handle,
    shopifyStatus: 'pending-shopify-summary',
    shopifyTitle: displayName,
    ...localized,
  };
}

export function buildProductDraftPlan(rawOptions = {}) {
  const handle = normalizeHandle(rawOptions.handle);
  const locales = rawOptions.locales || defaultLocales;
  const launchStatus = rawOptions.launchStatus || defaultLaunchStatus;
  const roadmapOrder = rawOptions.roadmapOrder ?? defaultRoadmapOrder;

  assertKnownLocales(locales);

  if (!Number.isFinite(roadmapOrder)) {
    throw new Error(`Invalid roadmap order: ${rawOptions.roadmapOrder}.`);
  }

  if (!['draft', 'ready', 'live', 'archived'].includes(launchStatus)) {
    throw new Error(`Invalid launch status: ${launchStatus}. Use draft, ready, live, or archived.`);
  }

  const displayName = rawOptions.name || titleFromHandle(handle);
  const collection = rawOptions.collection;
  const documents = [
    productPageDocument({ displayName, handle, roadmapOrder }),
    ...locales.map((locale) =>
      productLocalePageDocument({
        collection,
        displayName,
        handle,
        launchStatus,
        locale,
        roadmapOrder,
      }),
    ),
  ];

  return {
    mode: rawOptions.write ? 'write' : 'dry-run',
    handle,
    launchStatus,
    locales,
    productPageDocuments: [`productPage.${handle}`],
    productLocalePageDocuments: locales.map((locale) => `productLocalePage.${locale}.${handle}`),
    documents,
  };
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

async function createSanityWriteClient({ env = process.env, useCliClient = false } = {}) {
  const projectId = env.SANITY_PROJECT_ID || env.SANITY_STUDIO_PROJECT_ID;
  const dataset = env.SANITY_DATASET || env.SANITY_STUDIO_DATASET;
  const apiVersion = env.SANITY_API_VERSION || '2026-06-20';

  if (!projectId) {
    throw new Error('Missing SANITY_PROJECT_ID for Sanity write.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for Sanity write.');
  }

  assertDevelopmentDataset(dataset);

  if (useCliClient) {
    const { getCliClient } = await import('sanity/cli');

    return {
      client: getCliClient({ apiVersion }),
      dataset,
    };
  }

  if (!env.SANITY_API_WRITE_TOKEN) {
    throw new Error('Missing SANITY_API_WRITE_TOKEN for Sanity write. Use --use-cli-client from Sanity CLI if you want to write with the current login.');
  }

  return {
    client: createSanityContentClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
      token: env.SANITY_API_WRITE_TOKEN,
    }),
    dataset,
  };
}

export async function writeProductDraftPlan(plan, { useCliClient = false } = {}) {
  const { client, dataset } = await createSanityWriteClient({ useCliClient });
  const ids = plan.documents.map((document) => document._id);
  const existingDocuments = await client.fetch('*[_id in $ids]{_id}', { ids });

  if (existingDocuments.length > 0) {
    throw new Error(`Refusing to overwrite existing Sanity documents: ${existingDocuments.map((document) => document._id).join(', ')}.`);
  }

  const transaction = plan.documents.reduce(
    (currentTransaction, document) => currentTransaction.create(document),
    client.transaction(),
  );

  await transaction.commit({ visibility: 'sync' });

  return {
    dataset,
    createdDocuments: ids,
  };
}

async function maybeWriteNdjson(outFile, documents) {
  if (!outFile) {
    return;
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${documents.map((document) => JSON.stringify(document)).join('\n')}\n`);
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = buildProductDraftPlan(options);

  await maybeWriteNdjson(options.outFile, plan.documents);

  if (options.write) {
    await loadEnvFile(options.envFile);

    const writeResult = await writeProductDraftPlan(plan, {
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({
      ok: true,
      mode: 'write',
      ...writeResult,
      productPageDocuments: plan.productPageDocuments,
      productLocalePageDocuments: plan.productLocalePageDocuments,
    }, null, 2));

    return plan;
  }

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }

  console.log('Product draft dry-run complete.');
  console.log(`Handle: ${plan.handle}`);
  console.log(`Launch status: ${plan.launchStatus}`);
  console.log(`Documents: ${plan.documents.length}`);
  console.log(`Product pages: ${plan.productPageDocuments.join(', ')}`);
  console.log(`Product language pages: ${plan.productLocalePageDocuments.join(', ')}`);

  if (options.outFile) {
    console.log(`NDJSON written: ${options.outFile}`);
  }

  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
