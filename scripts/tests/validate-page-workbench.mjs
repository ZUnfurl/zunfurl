import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pageWorkbenchSource = readFileSync('apps/studio/src/pageOperations/PageOperationsTool.tsx', 'utf8');
const studioConfigSource = readFileSync('apps/studio/sanity.config.ts', 'utf8');
const studioProfileSource = readFileSync('apps/studio/src/studioProfile.ts', 'utf8');

assert(
  studioConfigSource.includes("title: '页面工作台'") &&
    studioConfigSource.includes("name: 'page-operations'") &&
    studioConfigSource.includes('PageOperationsTool'),
  'Studio config must register the customer-facing page workbench.',
);

assert(
  studioConfigSource.includes("structureTool({ structure, title: '全部内容' })"),
  'Structure tool must be renamed to 全部内容 without changing its route.',
);

assert(
  studioConfigSource.includes('...previousTools') &&
    !studioConfigSource.includes("tool.name !== 'vision'") &&
    !studioConfigSource.includes("tool.name !== 'releases'"),
  'Studio config must keep Vision and Releases available instead of filtering previous tools.',
);

for (const expected of [
  '页面工作台',
  '页面总览',
  '页面组',
  '虚拟主档',
  '页面详情',
  '结构完整页面',
  '待检查',
  '有草稿',
  '缺文档',
  '查看详情',
  '编辑页面',
  '查看已发布页面',
  'SANITY_STUDIO_STOREFRONT_ORIGIN',
]) {
  assert(pageWorkbenchSource.includes(expected), `Page workbench must include "${expected}".`);
}

assert(
  pageWorkbenchSource.includes('buildGroups') &&
    pageWorkbenchSource.includes('PageGroupCard') &&
    pageWorkbenchSource.includes('PageDetailPanel') &&
    pageWorkbenchSource.includes('LanguageDetailCard'),
  'Page workbench must use virtual page masters instead of flat language cards.',
);

assert(
  pageWorkbenchSource.includes('visibleGroups') &&
    !pageWorkbenchSource.includes('visibleSlots.map'),
  'Page workbench must render page groups first, not a flat list of all language slots.',
);

for (const expected of ['Home', 'About', 'Products', 'Contact']) {
  assert(studioProfileSource.includes(`title: '${expected}'`), `Studio profile helper must list ${expected}.`);
}

assert(
  pageWorkbenchSource.includes('getStudioPageKinds') &&
    pageWorkbenchSource.includes('productCmsEnabled') &&
    pageWorkbenchSource.includes('contactFormEnabled'),
  'Page workbench must read page kinds and module requirements from the Studio profile helper.',
);

for (const expected of [
  '1 首页首屏 Hero',
  '2 品牌框架轮播',
  '3 首页商品聚焦',
  '4 首页联系入口',
  '1 内页 Hero',
  '2 关于页图文介绍',
  '2 商品聚焦模块',
  '2 联系与轻量表单',
  '3 内容区块',
  '9 SEO 设置',
]) {
  assert(pageWorkbenchSource.includes(expected), `Page workbench must validate module "${expected}".`);
}

console.log('Page workbench OK: customer-facing page operations entry validated.');
