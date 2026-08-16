import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const workbenchSource = readFileSync('apps/studio/src/productOperations/ProductOperationsTool.tsx', 'utf8');
const schemaSource = readFileSync('packages/schemas/src/index.mjs', 'utf8');
const structureSource = readFileSync('apps/studio/src/structure.ts', 'utf8');

assert(
  workbenchSource.includes("'recycle-bin'"),
  'Product workbench must keep explicit customer-facing filters.',
);
assert(
  workbenchSource.includes("useState<ProductFilter>('active')"),
  'Product workbench must hide archived products by default.',
);
assert(
  workbenchSource.includes('删除不是日常运营动作'),
  'Product workbench must explain that delete is not a daily operation.',
);
assert(
  workbenchSource.includes('归档整个商品') && workbenchSource.includes('取消归档'),
  'Product workbench must expose product archive and unarchive actions.',
);
assert(
  workbenchSource.includes('同步 Shopify 映射') &&
    workbenchSource.includes('fetchShopifyProductByGidOrHandle') &&
    workbenchSource.includes('不会修改语言页名称、slug、SEO 或正文'),
  'Product workbench must expose safe Shopify summary sync without overwriting editorial content.',
);
assert(
  workbenchSource.includes('detectShopifyMappings') &&
    workbenchSource.includes('映射最新') &&
    workbenchSource.includes('映射需同步') &&
    workbenchSource.includes('Shopify 可读取') &&
    workbenchSource.includes('Shopify 不可读取'),
  'Product workbench must detect Shopify readability and mapping freshness separately.',
);
assert(
  workbenchSource.includes('getProductMappingMismatches') &&
    workbenchSource.includes('shopifyImageSummary') &&
    workbenchSource.includes('shopifyVariantSummary'),
  'Product workbench must compare product-master Shopify title, handle, image, and variant summaries.',
);
assert(
  workbenchSource.includes('{ ids: [product._id] }') &&
    !workbenchSource.includes('createProductLocalePageSummaryPatch'),
  'Product workbench Shopify mapping sync must patch only the product master to avoid language-page webhook fan-out.',
);
assert(
  workbenchSource.includes('下线语言') && workbenchSource.includes('回到草稿'),
  'Product workbench must expose language unpublish and return-to-draft actions.',
);
assert(
  workbenchSource.includes('client.patch(product._id).set({ productStatus: nextStatus }).commit()'),
  'Product archive/unarchive must only patch the product master status.',
);
assert(
  workbenchSource.includes('client.patch(page._id).set({ launchStatus: nextStatus }).commit()'),
  'Language unpublish/return-to-draft must only patch the language launch status.',
);
assert(
  workbenchSource.includes('*[_type == "productPage" && !(_id in path("drafts.**"))]'),
  'Product workbench must read published product master records only.',
);
assert(
  workbenchSource.includes('*[_type == "productLocalePage" && !(_id in path("drafts.**")) && productPage._ref == ^._id]'),
  'Product workbench must read published language pages linked to the product master.',
);
assert(
  workbenchSource.includes('ProductRecycleBinEntry') &&
    workbenchSource.includes('productRecycleBinEntry') &&
    workbenchSource.includes('productSnapshots') &&
    workbenchSource.includes('localeSnapshots'),
  'Product workbench must use a custom recycle bin before whole-product deletion.',
);
assert(
  schemaSource.includes("name: 'productRecycleBinEntry'") &&
    schemaSource.includes("name: 'productSnapshots'") &&
    schemaSource.includes("name: 'localeSnapshots'"),
  'Sanity schema must include product recycle-bin snapshot records.',
);
assert(
  workbenchSource.includes('window.prompt') &&
    workbenchSource.includes('confirmToken') &&
    workbenchSource.includes('client.transaction().create(recycleBinEntry)') &&
    workbenchSource.includes('transaction.delete(document._id)'),
  'Whole-product deletion must require handle confirmation and create a recycle-bin snapshot before deleting documents.',
);
assert(
  workbenchSource.includes('restoreDeletedProduct') &&
    workbenchSource.includes('createIfNotExists') &&
    workbenchSource.includes("restoreStatus: 'restored'"),
  'Product recycle bin must support best-effort re-creation without overwriting existing documents.',
);
assert(
  workbenchSource.includes('不是 Production Backup 或 Disaster Recovery Restore') &&
    workbenchSource.includes('不构成恢复保证'),
  'Product recycle-bin UI must not present its local content copy as production recovery.',
);
assert(
  !workbenchSource.includes('deleteLanguage') && !workbenchSource.includes('deleteLocale'),
  'Product workbench must not expose single-language delete actions.',
);
assert(
  structureSource.includes("const apiVersion = '2026-06-20'") &&
    structureSource.includes('.apiVersion(apiVersion)') &&
    structureSource.includes('launchStatus == $status') &&
    structureSource.includes('locale == $locale'),
  'Product workbench structure lists with custom filters must pin a Sanity API version.',
);

console.log('Product workbench OK: archive/unarchive and explicitly limited recycle-bin semantics validated.');
