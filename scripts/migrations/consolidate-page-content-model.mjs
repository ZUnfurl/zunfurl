import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSanityContentClient } from 'gcss-sanity-queries';
import { validatePageContent } from 'gcss-validation';
import { assertDevelopmentDataset } from '../products/create-product-draft.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const localPageKinds = ['about', 'contact', 'products'];
const localLocales = ['en', 'fr', 'zh-cn'];

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
    throw new Error('Missing SANITY_PROJECT_ID for page content model consolidation.');
  }

  if (!dataset) {
    throw new Error('Missing SANITY_DATASET for page content model consolidation.');
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
    throw new Error('Missing Sanity token for page content model consolidation.');
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

function keyFromObject(value, index) {
  const basis = value.id || value.title || value.eyebrow || `item-${index + 1}`;

  return String(basis)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `item-${index + 1}`;
}

function withSanityArrayKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return item;
      }

      return {
        _key: item._key || keyFromObject(item, index),
        ...withSanityArrayKeys(item),
      };
    });
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, withSanityArrayKeys(entryValue)]),
  );
}

async function loadLocalPages() {
  const pages = new Map();

  for (const locale of localLocales) {
    for (const kind of localPageKinds) {
      const filePath = path.join(
        repoRoot,
        'apps/storefront/src/content/pages',
        locale,
        `${kind}.json`,
      );
      const page = validatePageContent(
        JSON.parse(await readFile(filePath, 'utf8')),
        path.relative(repoRoot, filePath).replace(/\\/g, '/'),
      );

      pages.set(`${locale}.${kind}`, withSanityArrayKeys(page));
    }
  }

  return pages;
}

function hasPageHeroCopy(pageHero) {
  return Boolean(pageHero?.eyebrow && pageHero?.title && pageHero?.body);
}

function hasCompleteLegalNotice(legalNotice) {
  return Boolean(
    legalNotice?.title &&
      legalNotice?.body &&
      legalNotice?.acceptance &&
      Array.isArray(legalNotice.links) &&
      legalNotice.links.length >= 4,
  );
}

function getHeroCopyFromDocument(document, localPage) {
  if (hasPageHeroCopy(document.pageHero)) {
    return {
      eyebrow: document.pageHero.eyebrow,
      title: document.pageHero.title,
      body: document.pageHero.body,
    };
  }

  const firstBlock = Array.isArray(document.blocks) ? document.blocks[0] : undefined;

  if (firstBlock?.eyebrow && firstBlock?.title && firstBlock?.body) {
    return {
      eyebrow: firstBlock.eyebrow,
      title: firstBlock.title,
      body: firstBlock.body,
    };
  }

  return {
    eyebrow: localPage.pageHero.eyebrow,
    title: localPage.pageHero.title,
    body: localPage.pageHero.body,
  };
}

function getConsolidatedBlocks(document, localPage) {
  const blocks = Array.isArray(document.blocks) ? document.blocks : [];

  if (hasPageHeroCopy(document.pageHero)) {
    return blocks.length > 0 ? blocks : localPage.blocks;
  }

  const remainingBlocks = blocks.slice(1);
  return remainingBlocks.length > 0 ? remainingBlocks : localPage.blocks;
}

function buildPatch(document, localPage) {
  const heroCopy = getHeroCopyFromDocument(document, localPage);
  const pageHero = {
    ...withSanityArrayKeys(localPage.pageHero),
    ...withSanityArrayKeys(document.pageHero ?? {}),
    ...heroCopy,
  };
  const blocks = getConsolidatedBlocks(document, localPage);
  const set = {};
  const reasons = [];

  if (!hasPageHeroCopy(document.pageHero)) {
    set.pageHero = pageHero;
    reasons.push('move-first-block-to-pageHero');
  }

  if (!Array.isArray(document.blocks) || document.blocks.length !== blocks.length) {
    set.blocks = withSanityArrayKeys(blocks);
    reasons.push('normalize-blocks');
  }

  if (document.showContentBlocks !== localPage.showContentBlocks) {
    set.showContentBlocks = localPage.showContentBlocks;
    reasons.push('set-content-block-visibility');
  }

  if (document.kind === 'about' && !document.aboutSignature?.panels?.length) {
    set.aboutSignature = localPage.aboutSignature;
    reasons.push('set-aboutSignature');
  }

  if (document.kind === 'contact') {
    if (!document.contactSection) {
      set.contactSection = localPage.contactSection;
      reasons.push('set-contactSection');
    } else if (
      document.contactSection.responseTime !== localPage.contactSection?.responseTime
    ) {
      set['contactSection.responseTime'] = localPage.contactSection.responseTime;
      reasons.push('set-contact-response-time');
    }

    if (
      document.contactSection &&
      !hasCompleteLegalNotice(document.contactSection.legalNotice) &&
      hasCompleteLegalNotice(localPage.contactSection?.legalNotice)
    ) {
      set['contactSection.legalNotice'] = withSanityArrayKeys(localPage.contactSection.legalNotice);
      reasons.push('set-contact-legal-notice');
    }
  }

  return {
    id: document._id,
    locale: document.locale,
    kind: document.kind,
    reasons,
    set,
  };
}

export async function buildPageContentModelConsolidationPlan({
  useCliClient = false,
  write = false,
} = {}) {
  const [localPages, { client, dataset }] = await Promise.all([
    loadLocalPages(),
    createSanityClient({ useCliClient, write }),
  ]);
  const documents = await client.withConfig({ perspective: 'raw' }).fetch(`
    *[_type == "page" && kind in ["about", "contact", "products"]] | order(_id asc) {
      ...,
      pageHero { ..., slides[] { ... } },
      showContentBlocks,
      blocks[] { ... },
      aboutSignature { ..., panels[] { ... } },
      contactSection { ... },
      contactCtaSection { ... }
    }
  `);
  const patches = documents
    .map((document) => {
      const localPage = localPages.get(`${document.locale}.${document.kind}`);

      if (!localPage) {
        throw new Error(`Missing local fallback page for ${document.locale}/${document.kind}.`);
      }

      return buildPatch(document, localPage);
    })
    .filter((patch) => patch.reasons.length > 0);

  return {
    dataset,
    documentsChecked: documents.length,
    mode: 'dry-run',
    patches,
  };
}

export async function writePageContentModelConsolidation({ useCliClient = false } = {}) {
  const plan = await buildPageContentModelConsolidationPlan({
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
    const result = await writePageContentModelConsolidation({
      useCliClient: options.useCliClient,
    });

    console.log(JSON.stringify({ ok: true, mode: 'write', ...result }, null, 2));
    return result;
  }

  const plan = await buildPageContentModelConsolidationPlan({
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
