import { schemaTypes } from 'gcss-schemas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getSchema(name) {
  const schema = schemaTypes.find((schemaType) => schemaType.name === name);

  assert(schema, `Missing schema: ${name}.`);

  return schema;
}

function getField(schema, name) {
  const field = schema.fields.find((entry) => entry.name === name);

  assert(field, `Missing field ${name} on ${schema.name}.`);

  return field;
}

function hasField(schema, name) {
  return schema.fields.some((entry) => entry.name === name);
}

function getFieldset(schema, name) {
  const fieldset = schema.fieldsets.find((entry) => entry.name === name);

  assert(fieldset, `Missing fieldset ${name} on ${schema.name}.`);

  return fieldset;
}

function fieldHasGroup(field, groupName) {
  return Array.isArray(field.group) ? field.group.includes(groupName) : field.group === groupName;
}

function visibleFieldsInGroup(schema, groupName) {
  return schema.fields
    .filter((field) => !field.hidden && fieldHasGroup(field, groupName))
    .map((field) => field.name)
    .sort();
}

const productPage = getSchema('productPage');
const productLocalePage = getSchema('productLocalePage');
const productDetailHero = getSchema('productDetailHero');
const productStoryPage = getSchema('productStoryPage');
const systemGroup = productLocalePage.groups.find((group) => group.name === 'system');

assert(
  !schemaTypes.some((schemaType) => schemaType.name === 'productPageLocale'),
  'Legacy productPageLocale object must be removed from Studio schema.',
);
assert(!hasField(productPage, 'defaultLocale'), 'productPage.defaultLocale must be removed after local model reshape.');
assert(!hasField(productPage, 'locales'), 'productPage.locales[] must be removed after local model reshape.');

const expectedVisibleGroupNames = ['launch', 'shopify', 'card', 'detail', 'story', 'seo'];
const visibleGroupNames = productLocalePage.groups
  .filter((group) => group.hidden !== true)
  .map((group) => group.name);

assert(
  JSON.stringify(visibleGroupNames) === JSON.stringify(expectedVisibleGroupNames),
  `Product locale page visible tabs must keep customer-facing order: ${visibleGroupNames.join(', ')}.`,
);
assert(systemGroup?.hidden === true, 'Product locale page system group must be hidden from customer-facing tabs.');

const expectedFieldsets = [
  ['launch', false],
  ['shopify', false],
  ['card', false],
  ['detail', false],
  ['story', false],
  ['seo', false],
  ['system', true],
];

const fieldsetNames = productLocalePage.fieldsets.map((fieldset) => fieldset.name);
assert(
  JSON.stringify(fieldsetNames) === JSON.stringify(expectedFieldsets.map(([name]) => name)),
  `Product locale page fieldsets must keep workbench order: ${fieldsetNames.join(', ')}.`,
);

for (const [fieldsetName, shouldCollapse] of expectedFieldsets) {
  const fieldset = getFieldset(productLocalePage, fieldsetName);

  assert(fieldset.options?.collapsible === true, `${fieldsetName} fieldset must be collapsible.`);
  assert(fieldset.options?.collapsed === shouldCollapse, `${fieldsetName} collapsed state must be ${shouldCollapse}.`);
}

const expectedFieldGroups = {
  locale: 'launch',
  launchStatus: 'launch',
  slug: 'launch',
  roadmapOrder: 'launch',
  shopifyHandle: 'shopify',
  shopifyStatus: 'shopify',
  shopifyTitle: 'shopify',
  shopifyAdminUrl: 'shopify',
  name: 'card',
  tagline: 'card',
  productCardMediaSourceNote: 'card',
  roadmapLinkLabel: 'card',
  collection: 'detail',
  detailHero: 'detail',
  storyPages: 'story',
  seo: 'seo',
};

for (const [fieldName, groupName] of Object.entries(expectedFieldGroups)) {
  const field = getField(productLocalePage, fieldName);

  assert(fieldHasGroup(field, groupName), `${fieldName} must be in the ${groupName} editor tab.`);
  assert(field.fieldset === groupName, `${fieldName} must belong to the ${groupName} All fields section.`);
}

for (const fieldName of ['locale', 'shopifyHandle', 'name', 'collection', 'storyPages', 'seo']) {
  const guide = getField(productLocalePage, fieldName).options?.moduleGuide;

  assert(guide?.title && guide?.description, `${fieldName} must render an editor-facing module guide.`);
}

const launchTabFields = visibleFieldsInGroup(productLocalePage, 'launch');
assert(
  JSON.stringify(launchTabFields) === JSON.stringify(['launchStatus', 'locale', 'roadmapOrder', 'slug']),
  `Launch tab must contain only publishing/path controls: ${launchTabFields.join(', ')}.`,
);

const cardTabFields = visibleFieldsInGroup(productLocalePage, 'card');
assert(
  JSON.stringify(cardTabFields) === JSON.stringify(['name', 'productCardMediaSourceNote', 'roadmapLinkLabel', 'tagline']),
  `Product card tab must not expose Sanity product image overrides: ${cardTabFields.join(', ')}.`,
);

const detailTabFields = visibleFieldsInGroup(productLocalePage, 'detail');
assert(
  JSON.stringify(detailTabFields) === JSON.stringify(['collection', 'detailHero']),
  `PDP header tab must not show ProductCard fieldsets: ${detailTabFields.join(', ')}.`,
);

const removedLegacyContentFields = [
  'status',
  'shortDescription',
  'longDescription',
  'gallery',
  'benefits',
  'science',
  'ritual',
  'roadmapEyebrow',
  'roadmapPill',
  'roadmapDescription',
  'roadmapFooterPrimary',
  'roadmapFooterSecondary',
  'roadmapHref',
];

for (const fieldName of ['productPage', 'primaryImage', 'shopifyProductGid']) {
  const field = getField(productLocalePage, fieldName);

  assert(field.group === 'system', `${fieldName} must stay out of customer-facing content tabs.`);
  assert(field.fieldset === 'system', `${fieldName} must stay in the system fieldset.`);
  assert(field.hidden === true, `${fieldName} must be hidden as a system/fallback field.`);
}

for (const fieldName of removedLegacyContentFields) {
  assert(!hasField(productLocalePage, fieldName), `productLocalePage.${fieldName} must be removed after legacy cleanup.`);
}

const cardMediaGuide = getField(productLocalePage, 'productCardMediaSourceNote');
assert(cardMediaGuide.readOnly === true, 'Product card media source note must be read-only.');
assert(
  String(cardMediaGuide.options?.moduleGuide?.description ?? '').includes('Shopify'),
  'Product card media source note must tell editors that the image comes from Shopify.',
);

const detailHeroFields = productDetailHero.fields.map((field) => field.name).sort();
assert(
  JSON.stringify(detailHeroFields) === JSON.stringify(['gallery', 'shopifyMediaSourceNote', 'summary']),
  `PDP header schema must expose summary, Shopify media note, and hidden fallback gallery: ${detailHeroFields.join(', ')}.`,
);
assert(getField(productDetailHero, 'gallery').hidden === true, 'PDP header local gallery must be hidden as administrator fallback.');
assert(getField(productDetailHero, 'shopifyMediaSourceNote').readOnly === true, 'PDP header must show Shopify media source guidance.');

assert(getField(productStoryPage, 'id').hidden === true, 'Story section id must be a hidden system field.');
assert(getField(productStoryPage, 'imageSource'), 'Story image must expose a source selector.');
assert(getField(productStoryPage, 'sanityImage'), 'Story image must expose a Sanity image field.');
assert(
  getField(productStoryPage, 'image').title.includes('管理员 fallback'),
  'Story local image path must be labeled as administrator fallback.',
);
assert(!hasField(productStoryPage, 'align'), 'Unused story align compatibility field must be removed.');

const legacyDetailHeroFields = [
  'backLabel',
  'carouselLabel',
  'eyebrow',
  'mosaicLabel',
  'nextLabel',
  'previousLabel',
  'surface',
];
const localProductPage = JSON.parse(
  readFileSync(
    join(process.cwd(), 'apps', 'storefront', 'src', 'content', 'product-pages', 'example-product.json'),
    'utf8',
  ),
);

assert(!('defaultLocale' in localProductPage), 'Local productPage fallback must not keep defaultLocale.');
assert(!('locales' in localProductPage), 'Local productPage fallback must not keep locales[].');

for (const locale of ['en', 'fr', 'zh-cn']) {
  const localized = JSON.parse(
    readFileSync(
      join(process.cwd(), 'apps', 'storefront', 'src', 'content', 'product-locale-pages', locale, 'example-product.json'),
      'utf8',
    ),
  );

  for (const fieldName of legacyDetailHeroFields) {
    assert(
      !(fieldName in localized.detailHero),
      `Local fallback detailHero must not keep legacy/system field ${fieldName} for ${localized.locale}.`,
    );
  }

  for (const fieldName of removedLegacyContentFields) {
    assert(
      !(fieldName in localized),
      `Local fallback product locale must not keep legacy field ${fieldName} for ${localized.locale}.`,
    );
  }

  for (const storyPage of localized.storyPages ?? []) {
    assert(!('align' in storyPage), `Local fallback story page must not keep align for ${localized.locale}.`);
  }
}

console.log('Product locale page editor OK: Shopify media source and hidden fallback boundaries validated.');
