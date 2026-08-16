import { readFileSync } from 'node:fs';
import { schemaTypes } from 'gcss-schemas';
import { queries } from 'gcss-sanity-queries';

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

function getObjectFields(arrayField) {
  return arrayField.of?.[0]?.fields ?? [];
}

function getNestedField(fields, name) {
  const field = fields.find((entry) => entry.name === name);

  assert(field, `Missing nested field: ${name}.`);

  return field;
}

const pageHero = getSchema('pageHero');
const brandFramework = getSchema('brandFramework');
const aboutSignature = getSchema('aboutSignature');
const contactMaskSection = getSchema('contactMaskSection');
const productStoryPage = getSchema('productStoryPage');
const productLocalePage = getSchema('productLocalePage');

for (const field of getObjectFields(getField(pageHero, 'slides'))) {
  if (['imageSource', 'image', 'src'].includes(field.name)) {
    assert(field.title, `pageHero slide ${field.name} must have an editor-facing title.`);
  }
}

const pageHeroSlideFields = getObjectFields(getField(pageHero, 'slides'));
assert(getNestedField(pageHeroSlideFields, 'imageSource').options?.list?.length === 2, 'Page hero slides must expose Sanity/local source selection.');
assert(getNestedField(pageHeroSlideFields, 'src').title.includes('管理员 fallback'), 'Page hero local src must be labeled as administrator fallback.');

const brandFrameworkSlideFields = getObjectFields(getField(brandFramework, 'slides'));
assert(getNestedField(brandFrameworkSlideFields, 'sanityImage').type === 'image', 'Brand framework slides must expose a Sanity image field.');
assert(getNestedField(brandFrameworkSlideFields, 'image').title.includes('管理员 fallback'), 'Brand framework local image must be labeled as administrator fallback.');

const aboutPanelFields = getObjectFields(getField(aboutSignature, 'panels'));
assert(getNestedField(aboutPanelFields, 'imageSource').options?.list?.length === 2, 'About panels must expose Sanity/local source selection.');
assert(getNestedField(aboutPanelFields, 'imagePath').title.includes('管理员 fallback'), 'About local imagePath must be labeled as administrator fallback.');

assert(getField(contactMaskSection, 'sanityImage').type === 'image', 'Home contact CTA must expose a Sanity image field.');
assert(getField(contactMaskSection, 'image').title.includes('管理员 fallback'), 'Home contact local image must be labeled as administrator fallback.');

assert(getField(productStoryPage, 'sanityImage').type === 'image', 'Product story pages must expose a Sanity image field.');
assert(getField(productStoryPage, 'image').title.includes('管理员 fallback'), 'Product story local image must be labeled as administrator fallback.');

const primaryImage = getField(productLocalePage, 'primaryImage');
assert(primaryImage.hidden === true, 'Product card local primaryImage must be hidden as administrator fallback.');
assert(primaryImage.group === 'system', 'Product card local primaryImage must not be in the customer-facing card tab.');

const queryBundle = [
  queries.pageByLocaleAndKind,
  queries.pagesByLocalesAndKinds,
  queries.productPagesByLocale,
  queries.productPageByLocaleAndSlug,
].join('\n');

for (const token of [
  '"sanityImageUrl": image.asset->url',
  '"sanityImageUrl": sanityImage.asset->url',
  'brandFramework',
  'contactMaskSection',
  'storyPages[]',
]) {
  assert(queryBundle.includes(token), `Sanity queries must project image source token: ${token}.`);
}

const helperSource = readFileSync('apps/storefront/src/lib/images/imageSources.ts', 'utf8');
assert(helperSource.includes('resolveContentImage'), 'Storefront must centralize content image source resolution.');
assert(helperSource.includes('preferredSource === "local"'), 'Content image helper must support administrator local fallback.');

const imageSourceMigration = readFileSync('scripts/migrations/set-image-source-defaults.mjs', 'utf8');
assert(
  !imageSourceMigration.includes('image { ... }') && !imageSourceMigration.includes('sanityImage { ... }'),
  'Image source migration must read raw documents instead of GROQ image projections that can write null image fields back to Sanity.',
);
assert(
  imageSourceMigration.includes('delete value[sanityField]'),
  'Image source migration must strip null image values before setting array fields.',
);

console.log('Site image source boundaries OK: Sanity content images, Shopify product media, and administrator fallback validated.');
