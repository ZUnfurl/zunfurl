import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, 'utf8');
}

const guides = {
  index: read('docs/customer-operations.md'),
  staticBrand: read('docs/customer-operations-static-brand.md'),
  cmsBrand: read('docs/customer-operations-cms-brand.md'),
  retail: read('docs/customer-operations-retail.md'),
  page: read('docs/customer-page-operations.md'),
  product: read('docs/customer-product-operations.md'),
  readme: read('README.md'),
};

for (const fileName of [
  'customer-operations.md',
  'customer-operations-static-brand.md',
  'customer-operations-cms-brand.md',
  'customer-operations-retail.md',
  'customer-page-operations.md',
  'customer-product-operations.md',
]) {
  assert(guides.readme.includes(`docs/${fileName}`), `README must link docs/${fileName}.`);
}

for (const expected of ['A1/A2 静态品牌官网', 'B 可自维护品牌官网', 'C 零售目录与内容运营基础框架']) {
  assert(guides.index.includes(expected), `Customer operations index must include ${expected}.`);
}

assert(
  guides.index.includes('project-startup-and-handoff.md') && guides.index.includes('客户专属 GitHub Organization'),
  'Customer operations index must separate daily operations from the shared client-owned handoff policy.',
);

for (const [profile, guide] of Object.entries({
  A: guides.staticBrand,
  B: guides.cmsBrand,
  C: guides.retail,
})) {
  assert(guide.includes('归客户所有'), `${profile} guide must preserve the shared client-ownership rule.`);
  assert(guide.includes('平台资产登记表'), `${profile} guide must separate the administrator handoff pack.`);
}

assert(
  guides.staticBrand.includes('不需要操作') &&
    guides.staticBrand.includes('Sanity Studio') &&
    guides.staticBrand.includes('Shopify 后台'),
  'A guide must explicitly tell customers they do not operate Sanity or Shopify.',
);
assert(!guides.staticBrand.includes('进入商品工作台'), 'A guide must not include product workbench operation steps.');
assert(!guides.staticBrand.includes('商品上线向导'), 'A guide must not include product launch wizard.');
assert(!guides.staticBrand.includes('同步 Shopify 映射'), 'A guide must not include Shopify mapping sync workflow.');

assert(guides.cmsBrand.includes('页面工作台'), 'B guide must include page workbench.');
assert(guides.cmsBrand.includes('不会显示'), 'B guide must explain hidden retail entries.');
assert(!guides.cmsBrand.includes('上线一个新商品'), 'B guide must not include new product launch workflow.');
assert(!guides.cmsBrand.includes('同步 Shopify 映射'), 'B guide must not include Shopify mapping sync workflow.');
assert(
  guides.cmsBrand.includes('Products 和商品详情页默认不启用'),
  'B guide must document the current non-commerce Products boundary.',
);

for (const expected of [
  'C Retail Catalog & Content Foundation',
  '页面工作台',
  '商品上线向导',
  '商品工作台',
  'Shopify',
  '同步 Shopify 映射',
  '取消归档',
]) {
  assert(guides.retail.includes(expected), `C guide must include ${expected}.`);
}

assert(
  guides.retail.includes('不包含 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存') &&
    guides.product.includes('不覆盖 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存'),
  'C guides must explicitly exclude transaction and real-time price/inventory capabilities.',
);

assert(
  guides.retail.includes('归档和取消归档只改变 Sanity 商品内容') &&
    guides.retail.includes('不是 Backup 或 Restore'),
  'C guide must define archive/unarchive as a content lifecycle, not recovery.',
);

assert(
  guides.page.includes('适用于 B 方案') &&
    guides.page.includes('B 方案当前默认只显示 Home、About、Contact') &&
    guides.page.includes('C 零售目录与内容运营基础框架的商品目录页'),
  'Page operations guide must describe B/C page boundaries.',
);
assert(guides.product.includes('商品上线向导'), 'Product operations module guide must keep retail product workflow.');
assert(
  guides.product.includes('归档和取消归档不是 Backup 或 Restore') &&
    guides.product.includes('Studio 会在同一 Sanity 项目中创建回收站副本') &&
    guides.product.includes('不属于 Production Backup 或 Disaster Recovery Restore'),
  'Product operations guide must not promise recoverability for archive or delete.',
);

console.log('Customer operations guides OK: A/B/C customer-facing scopes are separated.');
