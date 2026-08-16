import { buildSanitySeed } from '../migrations/local-content-to-sanity.mjs';

const expectedLocales = ['en', 'fr', 'zh-cn'];
const expectedPageKinds = ['home', 'about', 'products', 'contact'];
const expectedProductSlug = 'example-product';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findDocument(seed, type, id) {
  return seed.documents.find((document) => document._type === type && document._id === id);
}

function scanForbiddenCommerceFields(value, path = []) {
  const forbiddenKeys = new Set([
    'price',
    'compareAtPrice',
    'inventory',
    'inventoryQuantity',
    'availableForSale',
    'sku',
    'variants',
    'order',
    'orders',
    'payment',
    'fulfillment',
  ]);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanForbiddenCommerceFields(item, [...path, index]));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const hits = [];

  for (const [key, entryValue] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      hits.push([...path, key].join('.'));
    }

    hits.push(...scanForbiddenCommerceFields(entryValue, [...path, key]));
  }

  return hits;
}

const seed = await buildSanitySeed();

assert(seed.mode === 'dry-run', 'Migration script must remain dry-run by default.');
assert(seed.documents.length === 16, `Expected 16 documents, received ${seed.documents.length}.`);
assert(seed.counts.page === 12, `Expected 12 page documents, received ${seed.counts.page}.`);
assert(
  seed.counts.productPage === 1,
  `Expected 1 productPage document, received ${seed.counts.productPage}.`,
);
assert(
  seed.counts.productLocalePage === 3,
  `Expected 3 productLocalePage documents, received ${seed.counts.productLocalePage}.`,
);

for (const locale of expectedLocales) {
  for (const kind of expectedPageKinds) {
    assert(
      findDocument(seed, 'page', `page.${locale}.${kind}`),
      `Missing page document: ${locale}/${kind}.`,
    );
  }

  const aboutPage = findDocument(seed, 'page', `page.${locale}.about`);
  assert(
    aboutPage.pageHero?.eyebrow && aboutPage.pageHero?.title && aboutPage.pageHero?.body,
    `About pageHero must include explicit copy for ${locale}/about.`,
  );
  assert(aboutPage.aboutSignature, `Missing aboutSignature for ${locale}/about.`);
  assert(
    aboutPage.showContentBlocks === true,
    `About page must explicitly show BrandContentBlocks for ${locale}/about.`,
  );
  assert(
    Array.isArray(aboutPage.aboutSignature.panels) && aboutPage.aboutSignature.panels.length >= 1,
    `About page must include aboutSignature image-text panels for ${locale}/about.`,
  );

  const contactPage = findDocument(seed, 'page', `page.${locale}.contact`);
  assert(
    contactPage.pageHero?.eyebrow && contactPage.pageHero?.title && contactPage.pageHero?.body,
    `Contact pageHero must include explicit copy for ${locale}/contact.`,
  );
  assert(contactPage.contactSection, `Missing contactSection for ${locale}/contact.`);
  assert(
    Array.isArray(contactPage.contactSection.topics) && contactPage.contactSection.topics.length >= 1,
    `Contact page must include contact topics for ${locale}/contact.`,
  );
  assert(
    contactPage.contactSection.responseTime &&
      !/test phase|测试阶段|configured recipient|配置的业务收件邮箱|phase de test/i.test(
        contactPage.contactSection.responseTime,
      ),
    `Contact page responseTime must use service-delay copy for ${locale}/contact.`,
  );
  assert(
    contactPage.showContentBlocks === false,
    `Contact page must explicitly hide BrandContentBlocks for ${locale}/contact.`,
  );
  assert(
    Array.isArray(contactPage.blocks) && contactPage.blocks.length >= 1,
    `Contact page must include BrandContentBlocks content for ${locale}/contact.`,
  );

  const productsPage = findDocument(seed, 'page', `page.${locale}.products`);
  assert(
    productsPage.pageHero?.eyebrow && productsPage.pageHero?.title && productsPage.pageHero?.body,
    `Products pageHero must include explicit copy for ${locale}/products.`,
  );
  assert(
    productsPage.showContentBlocks === true,
    `Products page must explicitly show BrandContentBlocks for ${locale}/products.`,
  );

  const productPage = findDocument(seed, 'productPage', `productPage.${expectedProductSlug}`);
  const productLocalePage = findDocument(seed, 'productLocalePage', `productLocalePage.${locale}.${expectedProductSlug}`);

  assert(productPage, `Missing productPage document: ${expectedProductSlug}.`);
  assert(!('defaultLocale' in productPage), `productPage must not include defaultLocale for ${locale}.`);
  assert(!('locales' in productPage), `productPage must not include locales[] for ${locale}.`);
  assert(productLocalePage, `Missing productLocalePage document: ${locale}/${expectedProductSlug}.`);
  assert(productLocalePage.slug.current === expectedProductSlug, `Invalid productLocalePage slug for ${locale}.`);
  assert(productLocalePage.launchStatus === 'live', `Migrated productLocalePage must stay live for ${locale}.`);
  assert(productLocalePage.detailHero, `Missing productLocalePage detail hero for ${locale}.`);
}

const unexpectedIds = seed.documents
  .map((document) => document._id)
  .filter((id) => id.includes('coming-soon'));
assert(unexpectedIds.length === 0, `Unexpected placeholder documents: ${unexpectedIds.join(', ')}.`);

for (const document of seed.documents) {
  const forbiddenHits = scanForbiddenCommerceFields(document);
  assert(
    forbiddenHits.length === 0,
    `Document ${document._id} contains commerce runtime fields: ${forbiddenHits.join(', ')}.`,
  );
}

console.log('Sanity migration dry-run OK: 16 docs (12 pages, 1 productPage, 3 productLocalePage).');
