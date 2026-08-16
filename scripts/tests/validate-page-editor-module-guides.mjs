import { schemaTypes } from 'gcss-schemas';

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

function assertEditorFieldset(schema, name, expectedTitle) {
  const fieldset = getFieldset(schema, name);

  assert(fieldset.title === expectedTitle, `${name} fieldset must use title "${expectedTitle}".`);
  assert(fieldset.options?.collapsible === true, `${name} fieldset must be collapsible.`);
  assert(fieldset.options?.collapsed === false, `${name} fieldset must be expanded by default.`);
}

function assertCollapsedEditorFieldset(schema, name, expectedTitle) {
  const fieldset = getFieldset(schema, name);

  assert(fieldset.title === expectedTitle, `${name} fieldset must use title "${expectedTitle}".`);
  assert(fieldset.options?.collapsible === true, `${name} fieldset must be collapsible.`);
  assert(fieldset.options?.collapsed === true, `${name} fieldset must be collapsed by default.`);
}

function assertModuleGuide(field, expectedFieldset) {
  const guide = field.options?.moduleGuide;

  assert(field.fieldset === expectedFieldset, `${field.name} must belong to fieldset ${expectedFieldset}.`);
  assert(!field.description, `${field.name} must not duplicate the module guide description outside the label.`);
  assert(guide, `${field.name} must include a module guide.`);
  assert(guide.title && guide.description, `${field.name} module guide must include title and description.`);
  assert(guide.accentColor, `${field.name} module guide must include an accent color.`);
  assert(!Array.isArray(guide.chips), `${field.name} module guide must not render chip metadata.`);
  assert(!String(guide.description).includes('.astro'), `${field.name} module guide must use editor-facing language.`);
  assert(field.options?.collapsible !== true, `${field.name} must rely on the numbered top-level fieldset for folding.`);
  assert(typeof field.components?.input === 'function', `${field.name} must render the module guide input.`);
}

const page = getSchema('page');
const pageHero = getSchema('pageHero');
const homeHero = getSchema('homeHero');
const brandFramework = getSchema('brandFramework');
const contactMaskSection = getSchema('contactMaskSection');
const contactSection = getSchema('contactSection');
const homeProductSpotlight = getSchema('homeProductSpotlight');
const productSpotlight = getSchema('productSpotlight');

const expectedFieldsets = [
  ['setup', '0 基础设置', false],
  ['homeHero', '1 首页首屏 Hero', false],
  ['homeFramework', '2 品牌框架轮播', false],
  ['homeProductSpotlight', '3 首页商品聚焦', false],
  ['homeContact', '4 首页联系入口', false],
  ['pageHero', '1 内页 Hero', false],
  ['productSpotlight', '2 商品聚焦模块', false],
  ['contactSection', '2 联系与轻量表单', false],
  ['aboutSignature', '2 关于页图文介绍', false],
  ['blocks', '3 内容区块', false],
  ['seo', '9 SEO 设置', false],
];

const fieldsetTitles = page.fieldsets.map((fieldset) => fieldset.title);

assert(
  JSON.stringify(fieldsetTitles) === JSON.stringify(expectedFieldsets.map(([, title]) => title)),
  `Page editor fieldsets must keep storefront order: ${fieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle, collapsed] of expectedFieldsets) {
  if (collapsed) {
    assertCollapsedEditorFieldset(page, fieldsetName, expectedTitle);
  } else {
    assertEditorFieldset(page, fieldsetName, expectedTitle);
  }
}

for (const fieldName of ['locale', 'kind', 'title']) {
  assert(getField(page, fieldName).fieldset === 'setup', `${fieldName} must belong to 0 基础设置.`);
}

const expectedGuides = {
  hero: 'homeHero',
  brandFramework: 'homeFramework',
  homeProductSpotlight: 'homeProductSpotlight',
  contactMaskSection: 'homeContact',
  pageHero: 'pageHero',
  productSpotlight: 'productSpotlight',
  contactSection: 'contactSection',
  aboutSignature: 'aboutSignature',
  blocks: 'blocks',
  seo: 'seo',
};

for (const [fieldName, expectedFieldset] of Object.entries(expectedGuides)) {
  assertModuleGuide(getField(page, fieldName), expectedFieldset);
}

assert(
  getField(page, 'homeProductSpotlight').type === 'homeProductSpotlight',
  'page.homeProductSpotlight must use the Home-specific product spotlight schema.',
);

assert(
  !getField(page, 'pageHero').options.moduleGuide.description.includes('动效说明'),
  'page.pageHero module guide must not mention legacy motion copy.',
);

for (const fieldName of ['sectionCards', 'productOverview', 'contactCtaSection']) {
  assert(!hasField(page, fieldName), `page.${fieldName} must be removed after legacy cleanup.`);
}

for (const fieldName of ['motionEyebrow', 'motionBody']) {
  assert(!hasField(pageHero, fieldName), `pageHero.${fieldName} must be removed after legacy cleanup.`);
}

const pageHeroSlideFields = getField(pageHero, 'slides').of?.[0]?.fields ?? [];
const pageHeroSlideAlt = pageHeroSlideFields.find((field) => field.name === 'alt');

assert(pageHeroSlideAlt, 'pageHero.slides[].alt must remain defined as a compatibility field.');
assert(pageHeroSlideAlt.hidden === true, 'pageHero.slides[].alt must be hidden from editors.');

const expectedHomeHeroFieldsets = [
  ['copy', '1.0 首屏文案', false],
  ['actions', '1.1 首屏按钮', false],
  ['media', '1.2 首屏媒体', false],
  ['motion', '1.3 底部动态说明', false],
  ['caption', '1.4 底部右侧注释', false],
];

const homeHeroFieldsetTitles = homeHero.fieldsets.map((fieldset) => fieldset.title);
assert(
  JSON.stringify(homeHeroFieldsetTitles) === JSON.stringify(expectedHomeHeroFieldsets.map(([, title]) => title)),
  `HomeHero fieldsets must mirror storefront order: ${homeHeroFieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle, collapsed] of expectedHomeHeroFieldsets) {
  if (collapsed) {
    assertCollapsedEditorFieldset(homeHero, fieldsetName, expectedTitle);
  } else {
    assertEditorFieldset(homeHero, fieldsetName, expectedTitle);
  }
}

const expectedHomeHeroFieldMap = {
  eyebrow: 'copy',
  titleLines: 'copy',
  intro: 'copy',
  primaryCta: 'actions',
  secondaryCta: 'actions',
  videoSrc: 'media',
  videoPoster: 'media',
  motionLabel: 'motion',
  motionQuote: 'motion',
  captionEyebrow: 'caption',
  captionTitle: 'caption',
};

for (const [fieldName, expectedFieldset] of Object.entries(expectedHomeHeroFieldMap)) {
  assert(
    getField(homeHero, fieldName).fieldset === expectedFieldset,
    `homeHero.${fieldName} must belong to ${expectedFieldset}.`,
  );
}

assert(
  !homeHero.fields.some((field) => field.name === 'heroProductSourceNote'),
  'homeHero.heroProductSourceNote must be removed because Home Hero no longer reads product workbench copy.',
);

for (const fieldName of ['highlightLabel', 'highlightValue']) {
  assert(!hasField(homeHero, fieldName), `homeHero.${fieldName} must be removed after legacy cleanup.`);
}

const expectedBrandFrameworkFieldsets = [
  ['intro', '2.0 轮播通用设置', false],
  ['slides', '2.1 轮播图片卡', false],
  ['system', '2.8 系统无障碍字段', true],
];

const brandFrameworkFieldsetTitles = brandFramework.fieldsets.map((fieldset) => fieldset.title);
assert(
  JSON.stringify(brandFrameworkFieldsetTitles) === JSON.stringify(expectedBrandFrameworkFieldsets.map(([, title]) => title)),
  `BrandFramework fieldsets must mirror storefront order: ${brandFrameworkFieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle, collapsed] of expectedBrandFrameworkFieldsets) {
  if (collapsed) {
    assertCollapsedEditorFieldset(brandFramework, fieldsetName, expectedTitle);
  } else {
    assertEditorFieldset(brandFramework, fieldsetName, expectedTitle);
  }
}

const expectedBrandFrameworkFieldMap = {
  eyebrow: 'intro',
  ctaLabel: 'intro',
  slides: 'slides',
  ariaLabel: 'system',
};

for (const [fieldName, expectedFieldset] of Object.entries(expectedBrandFrameworkFieldMap)) {
  assert(
    getField(brandFramework, fieldName).fieldset === expectedFieldset,
    `brandFramework.${fieldName} must belong to ${expectedFieldset}.`,
  );
}

assert(getField(brandFramework, 'ariaLabel').hidden === true, 'brandFramework.ariaLabel must be hidden from editors.');

const expectedContactMaskFieldsets = [
  ['copy', '4.0 联系入口文案', false],
  ['media', '4.1 背景图片', false],
  ['system', '4.8 系统字段', true],
];

const contactMaskFieldsetTitles = contactMaskSection.fieldsets.map((fieldset) => fieldset.title);
assert(
  JSON.stringify(contactMaskFieldsetTitles) === JSON.stringify(expectedContactMaskFieldsets.map(([, title]) => title)),
  `ContactMaskSection fieldsets must mirror storefront order: ${contactMaskFieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle, collapsed] of expectedContactMaskFieldsets) {
  if (collapsed) {
    assertCollapsedEditorFieldset(contactMaskSection, fieldsetName, expectedTitle);
  } else {
    assertEditorFieldset(contactMaskSection, fieldsetName, expectedTitle);
  }
}

const expectedContactMaskFieldMap = {
  eyebrow: 'copy',
  title: 'copy',
  body: 'copy',
  cta: 'copy',
  image: 'media',
  imageAlt: 'system',
};

for (const [fieldName, expectedFieldset] of Object.entries(expectedContactMaskFieldMap)) {
  assert(
    getField(contactMaskSection, fieldName).fieldset === expectedFieldset,
    `contactMaskSection.${fieldName} must belong to ${expectedFieldset}.`,
  );
}

assert(getField(contactMaskSection, 'imageAlt').hidden === true, 'contactMaskSection.imageAlt must be hidden from editors.');

const expectedContactFieldsets = [
  ['operation', '2.0 表单开关'],
  ['intro', '2.1 左侧联系说明'],
  ['legal', '2.2 提交前法律提示'],
  ['formFields', '2.8 右侧表单字段（系统固定）'],
  ['topics', '2.9 咨询类型选项（系统固定）'],
  ['status', '2.10 提交状态反馈（系统固定）'],
];

const contactFieldsetTitles = contactSection.fieldsets.map((fieldset) => fieldset.title);
assert(
  JSON.stringify(contactFieldsetTitles) === JSON.stringify(expectedContactFieldsets.map(([, title]) => title)),
  `ContactSection fieldsets must mirror storefront order: ${contactFieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle] of expectedContactFieldsets) {
  if (['formFields', 'topics', 'status'].includes(fieldsetName)) {
    const fieldset = getFieldset(contactSection, fieldsetName);

    assert(fieldset.title === expectedTitle, `${fieldsetName} fieldset must use title "${expectedTitle}".`);
    assert(fieldset.options?.collapsible === true, `${fieldsetName} fieldset must be collapsible.`);
    assert(fieldset.options?.collapsed === true, `${fieldsetName} fieldset must be collapsed by default.`);
  } else {
    assertEditorFieldset(contactSection, fieldsetName, expectedTitle);
  }
}

assert(getField(contactSection, 'responseTime').title === '自定义说明', 'responseTime must be titled 自定义说明.');

const expectedContactFieldMap = {
  enabled: 'operation',
  eyebrow: 'intro',
  title: 'intro',
  body: 'intro',
  businessDirections: 'intro',
  responseTime: 'intro',
  fieldCopy: 'formFields',
  submitLabel: 'formFields',
  topics: 'topics',
  legalNotice: 'legal',
  successTitle: 'status',
  successBody: 'status',
  errorTitle: 'status',
  errorBody: 'status',
  disabledTitle: 'status',
  disabledBody: 'status',
};

for (const [fieldName, expectedFieldset] of Object.entries(expectedContactFieldMap)) {
  assert(
    getField(contactSection, fieldName).fieldset === expectedFieldset,
    `contactSection.${fieldName} must belong to ${expectedFieldset}.`,
  );
}

for (const fieldName of [
  'fieldCopy',
  'submitLabel',
  'topics',
  'successTitle',
  'successBody',
  'errorTitle',
  'errorBody',
  'disabledTitle',
  'disabledBody',
]) {
  assert(getField(contactSection, fieldName).hidden === true, `contactSection.${fieldName} must be hidden from editors.`);
}

for (const fieldName of ['privacyNotice', 'fallbackEmailLabel', 'fallbackEmailHref']) {
  assert(!hasField(contactSection, fieldName), `contactSection.${fieldName} must be removed after legacy cleanup.`);
}

const expectedHomeProductSpotlightFieldsets = [
  ['intro', '3.0 顶部标题区'],
  ['cardSource', '3.1 商品卡片来源'],
  ['controls', '3.8 系统兜底与轮播控制'],
];

const homeProductSpotlightFieldsetTitles = homeProductSpotlight.fieldsets.map((fieldset) => fieldset.title);
assert(
  JSON.stringify(homeProductSpotlightFieldsetTitles) ===
    JSON.stringify(expectedHomeProductSpotlightFieldsets.map(([, title]) => title)),
  `HomeProductSpotlight fieldsets must mirror storefront order: ${homeProductSpotlightFieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle] of expectedHomeProductSpotlightFieldsets) {
  const fieldset = getFieldset(homeProductSpotlight, fieldsetName);

  assert(fieldset.title === expectedTitle, `${fieldsetName} fieldset must use title "${expectedTitle}".`);
  assert(fieldset.options?.collapsible === true, `${fieldsetName} fieldset must be collapsible.`);

  if (fieldsetName === 'controls') {
    assert(fieldset.options?.collapsed === true, `${fieldsetName} fieldset must be collapsed by default.`);
  } else {
    assert(fieldset.options?.collapsed === false, `${fieldsetName} fieldset must be expanded by default.`);
  }
}

for (const [fieldName, expectedFieldset] of Object.entries({
  eyebrow: 'intro',
  title: 'intro',
  body: 'intro',
  productCardSourceNote: 'cardSource',
  openProductLabel: 'controls',
  ariaLabel: 'controls',
  previousLabel: 'controls',
  nextLabel: 'controls',
})) {
  assert(
    getField(homeProductSpotlight, fieldName).fieldset === expectedFieldset,
    `homeProductSpotlight.${fieldName} must belong to ${expectedFieldset}.`,
  );
}

assert(
  String(getField(homeProductSpotlight, 'productCardSourceNote').options?.moduleGuide?.description ?? '').includes(
    '商品工作台',
  ),
  'homeProductSpotlight.productCardSourceNote must point editors to 商品工作台.',
);

for (const fieldName of ['openProductLabel', 'ariaLabel', 'previousLabel', 'nextLabel']) {
  assert(
    getField(homeProductSpotlight, fieldName).hidden === true,
    `homeProductSpotlight.${fieldName} must be hidden from editors.`,
  );
}

const expectedProductSpotlightFieldsets = [
  ['intro', '2.0 顶部标题区'],
  ['cardSource', '2.1 商品卡片来源'],
  ['controls', '2.8 系统兜底与轮播控制'],
];

const productSpotlightFieldsetTitles = productSpotlight.fieldsets.map((fieldset) => fieldset.title);
assert(
  JSON.stringify(productSpotlightFieldsetTitles) ===
    JSON.stringify(expectedProductSpotlightFieldsets.map(([, title]) => title)),
  `ProductSpotlight fieldsets must mirror storefront order: ${productSpotlightFieldsetTitles.join(', ')}.`,
);

for (const [fieldsetName, expectedTitle] of expectedProductSpotlightFieldsets) {
  const fieldset = getFieldset(productSpotlight, fieldsetName);

  assert(fieldset.title === expectedTitle, `${fieldsetName} fieldset must use title "${expectedTitle}".`);
  assert(fieldset.options?.collapsible === true, `${fieldsetName} fieldset must be collapsible.`);

  if (fieldsetName === 'controls') {
    assert(fieldset.options?.collapsed === true, `${fieldsetName} fieldset must be collapsed by default.`);
  } else {
    assert(fieldset.options?.collapsed === false, `${fieldsetName} fieldset must be expanded by default.`);
  }
}

const expectedProductSpotlightFieldMap = {
  eyebrow: 'intro',
  title: 'intro',
  body: 'intro',
  productCardSourceNote: 'cardSource',
  openProductLabel: 'controls',
  ariaLabel: 'controls',
  previousLabel: 'controls',
  nextLabel: 'controls',
};

for (const [fieldName, expectedFieldset] of Object.entries(expectedProductSpotlightFieldMap)) {
  assert(
    getField(productSpotlight, fieldName).fieldset === expectedFieldset,
    `productSpotlight.${fieldName} must belong to ${expectedFieldset}.`,
  );
}

const productCardSourceNote = getField(productSpotlight, 'productCardSourceNote');
assert(productCardSourceNote.readOnly === true, 'productSpotlight.productCardSourceNote must be read-only.');
assert(
  typeof productCardSourceNote.components?.input === 'function',
  'productSpotlight.productCardSourceNote must render a guide-only input.',
);
assert(
  String(productCardSourceNote.options?.moduleGuide?.description ?? '').includes('商品工作台'),
  'productSpotlight.productCardSourceNote must point editors to 商品工作台.',
);

for (const fieldName of ['openProductLabel', 'ariaLabel', 'previousLabel', 'nextLabel']) {
  assert(
    getField(productSpotlight, fieldName).hidden === true,
    `productSpotlight.${fieldName} must be hidden from editors.`,
  );
}

console.log('Page editor module guides OK: collapsible section labels validated.');
