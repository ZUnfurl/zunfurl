import {
  commerceNestedSchemaTypeNames,
  commerceDocumentSchemaTypeNames,
  contentDocumentSchemaTypeNames,
  createSchemaTypesForFeatures,
  schemaTypes,
} from '../../packages/schemas/src/index.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function typeNames(types) {
  return new Set(types.map((schemaType) => schemaType.name));
}

function documentTypeNames(types) {
  return new Set(
    types
      .filter((schemaType) => schemaType.type === 'document')
      .map((schemaType) => schemaType.name),
  );
}

const fullSchemaTypeNames = typeNames(schemaTypes);
const fullDocumentTypeNames = documentTypeNames(schemaTypes);
const retailDocumentTypeNames = documentTypeNames(
  createSchemaTypesForFeatures({ contentCms: true, productCms: true }),
);
const cmsBrandDocumentTypeNames = documentTypeNames(
  createSchemaTypesForFeatures({ contentCms: true, productCms: false }),
);
const cmsBrandSchemaTypes = createSchemaTypesForFeatures({ contentCms: true, productCms: false });
const cmsBrandSchemaTypeNames = typeNames(cmsBrandSchemaTypes);
const cmsBrandPageSchema = cmsBrandSchemaTypes.find((schemaType) => schemaType.name === 'page');
const staticBrandSchemaTypes = createSchemaTypesForFeatures({ contentCms: false, productCms: false });
const staticBrandDocumentTypeNames = documentTypeNames(staticBrandSchemaTypes);

for (const typeName of [...contentDocumentSchemaTypeNames, ...commerceDocumentSchemaTypeNames]) {
  assert(fullDocumentTypeNames.has(typeName), `Full schema must include document type ${typeName}.`);
  assert(retailDocumentTypeNames.has(typeName), `Retail Studio schema must include ${typeName}.`);
}

for (const typeName of contentDocumentSchemaTypeNames) {
  assert(cmsBrandDocumentTypeNames.has(typeName), `CMS brand Studio schema must include ${typeName}.`);
  assert(!staticBrandDocumentTypeNames.has(typeName), `Static brand Studio schema must hide ${typeName}.`);
}

for (const typeName of commerceDocumentSchemaTypeNames) {
  assert(!cmsBrandDocumentTypeNames.has(typeName), `CMS brand Studio schema must hide ${typeName}.`);
  assert(!staticBrandDocumentTypeNames.has(typeName), `Static brand Studio schema must hide ${typeName}.`);
}

for (const typeName of commerceNestedSchemaTypeNames) {
  assert(
    !cmsBrandSchemaTypeNames.has(typeName),
    `CMS brand Studio schema must remove nested commerce type ${typeName}.`,
  );
}

const cmsBrandPageFieldNames = new Set(cmsBrandPageSchema.fields.map((field) => field.name));
const cmsBrandPageFieldsetNames = new Set(cmsBrandPageSchema.fieldsets.map((fieldset) => fieldset.name));
const cmsBrandPageKindValues = new Set(
  cmsBrandPageSchema.fields
    .find((field) => field.name === 'kind')
    .options.list.map((option) => option.value),
);

assert(!cmsBrandPageKindValues.has('products'), 'B page kind selector must not expose Products.');
assert(
  !cmsBrandPageFieldNames.has('homeProductSpotlight') &&
    !cmsBrandPageFieldNames.has('productSpotlight'),
  'B page schema must remove product-only nested fields.',
);
assert(
  !cmsBrandPageFieldsetNames.has('homeProductSpotlight') &&
    !cmsBrandPageFieldsetNames.has('productSpotlight'),
  'B page schema must remove product-only fieldsets.',
);

assert(
  cmsBrandDocumentTypeNames.size === contentDocumentSchemaTypeNames.length,
  'CMS brand Studio schema must only expose content document types.',
);
assert(
  staticBrandDocumentTypeNames.size === 0 && staticBrandSchemaTypes.length === 0,
  'Static brand Studio schema must not expose any schema types.',
);
assert(!fullSchemaTypeNames.has('productPageLocale'), 'Schema must not reintroduce legacy productPageLocale.');

console.log('Studio schema profiles OK: document types are filtered by A/B/C feature boundaries.');
