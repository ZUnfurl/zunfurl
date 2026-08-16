import { createElement } from 'react';
import { defineField, defineType } from 'sanity';
import { activeLocales } from 'gcss-config';

const localeCatalog = [
  { title: 'English', value: 'en' },
  { title: 'Français', value: 'fr' },
  { title: '简体中文', value: 'zh-cn' },
];
const localeOptions = localeCatalog.filter((option) => activeLocales.includes(option.value));

const pageKindOptions = [
  { title: 'Home', value: 'home' },
  { title: 'About', value: 'about' },
  { title: 'Products', value: 'products' },
  { title: 'Contact', value: 'contact' },
];

const productLaunchStatusOptions = [
  { title: '草稿 - 不进入前台构建', value: 'draft' },
  { title: '就绪 - 不进入前台构建', value: 'ready' },
  { title: '上线 - 进入前台构建', value: 'live' },
  { title: '归档 - 不进入前台构建', value: 'archived' },
];

const productPageStatusOptions = [
  { title: '启用 - 可按语言进入前台构建', value: 'active' },
  { title: '归档 - 整个商品不进入前台构建', value: 'archived' },
];

const apiVersion = '2026-06-20';

const localeTitleMap = Object.fromEntries(localeOptions.map((option) => [option.value, option.title]));
const pageKindTitleMap = Object.fromEntries(pageKindOptions.map((option) => [option.value, option.title]));
const administratorImageFallbackDescription =
  '管理员 fallback。仅在 Sanity 图片或 Shopify 商品媒体不可用时由技术维护人员使用，日常内容编辑优先使用 Sanity 图片或 Shopify 商品媒体。';
const contentImageSourceOptions = [
  { title: 'Sanity Image CDN（推荐）', value: 'sanity' },
  { title: '本地图片路径（管理员 fallback）', value: 'local' },
];

const editorSectionFieldsetOptions = {
  collapsible: true,
  collapsed: false,
};

const moduleGuideStyles = {
  stack: {
    display: 'grid',
    gap: '0.875rem',
  },
  card: {
    background: 'var(--card-bg-color)',
    border: '1px solid var(--card-border-color)',
    borderRadius: '8px',
    boxSizing: 'border-box',
    padding: '0.875rem 1rem',
  },
  title: {
    color: 'var(--card-fg-color)',
    fontSize: '1rem',
    fontWeight: 700,
    lineHeight: 1.35,
    margin: 0,
  },
  description: {
    color: 'var(--card-muted-fg-color)',
    fontSize: '0.875rem',
    lineHeight: 1.55,
    margin: '0.375rem 0 0',
  },
};

function StudioModuleGuideInput(props) {
  const guide = props.schemaType?.options?.moduleGuide;
  const defaultInput = typeof props.renderDefault === 'function' ? props.renderDefault(props) : null;

  if (!guide) {
    return defaultInput;
  }

  const cardStyle = {
    ...moduleGuideStyles.card,
    borderLeft: `4px solid ${guide.accentColor ?? 'var(--focus-ring-color)'}`,
  };

  return createElement(
    'div',
    { style: moduleGuideStyles.stack },
    createElement(
      'section',
      { 'aria-label': guide.title, style: cardStyle },
      createElement('p', { style: moduleGuideStyles.title }, guide.title),
      guide.description
        ? createElement('p', { style: moduleGuideStyles.description }, guide.description)
        : null,
    ),
    defaultInput,
  );
}

function StudioModuleGuideOnlyInput(props) {
  const guide = props.schemaType?.options?.moduleGuide;

  if (!guide) {
    return null;
  }

  const cardStyle = {
    ...moduleGuideStyles.card,
    borderLeft: `4px solid ${guide.accentColor ?? 'var(--focus-ring-color)'}`,
  };

  return createElement(
    'section',
    { 'aria-label': guide.title, style: cardStyle },
    createElement('p', { style: moduleGuideStyles.title }, guide.title),
    guide.description ? createElement('p', { style: moduleGuideStyles.description }, guide.description) : null,
  );
}

const pageModuleGuide = (guide) => ({
  options: {
    moduleGuide: guide,
  },
  components: {
    input: StudioModuleGuideInput,
  },
});

const guideOnlyField = (guide) => ({
  readOnly: true,
  options: {
    moduleGuide: guide,
  },
  components: {
    input: StudioModuleGuideOnlyInput,
  },
});

const getBaseDocumentId = (id = '') => id.replace(/^drafts\./, '');

const stringListField = (name, title, options = {}) =>
  defineField({
    name,
    title,
    type: 'array',
    of: [{ type: 'string' }],
    ...options,
  });

const isHomePage = ({ document }) => document?.kind !== 'home';
const isNotStandardPage = ({ document }) => document?.kind === 'home';
const isNotAboutPage = ({ document }) => document?.kind !== 'about';
const isNotContactPage = ({ document }) => document?.kind !== 'contact';
const isNotProductsPage = ({ document }) => document?.kind !== 'products';

async function isUniqueDocument(context, type, selectors, message) {
  const documentId = getBaseDocumentId(context.document?._id);

  if (!documentId || selectors.some((selector) => !selector.value)) {
    return true;
  }

  if (typeof context.getClient !== 'function') {
    return true;
  }

  const filters = selectors
    .map((selector, index) => `${selector.path} == $value${index}`)
    .join(' && ');
  const params = selectors.reduce(
    (values, selector, index) => ({
      ...values,
      [`value${index}`]: selector.value,
    }),
    {
      type,
      ids: [documentId, `drafts.${documentId}`],
    },
  );

  const client = context.getClient({ apiVersion });
  const count = await client.fetch(`count(*[_type == $type && ${filters} && !(_id in $ids)])`, params);

  return count > 0 ? message : true;
}

const uniquePageLocaleKind = async (_value, context) =>
  isUniqueDocument(
    context,
    'page',
    [
      { path: 'locale', value: context.document?.locale },
      { path: 'kind', value: context.document?.kind },
    ],
    '同一语言下每种页面只能有一个文档。',
  );

const validateProductPageLocaleLaunchStatus = (value, context) => {
  if (value !== 'live') {
    return true;
  }

  if (!context.document?.shopifyProductGid || !context.document?.shopifyHandle) {
    return '需要先同步 Shopify 只读映射并确认 Product GID 与 handle，才能把该语言设置为“上线”；可售状态快照不作为内容上线资格。';
  }

  return true;
};

const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),
  ],
});

const cta = defineType({
  name: 'cta',
  title: 'CTA',
  type: 'object',
  fields: [
    defineField({ name: 'label', title: 'Label', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'href', title: 'Href', type: 'string', validation: (Rule) => Rule.required() }),
  ],
});

const pageBlock = defineType({
  name: 'pageBlock',
  title: 'Page Block',
  type: 'object',
  fields: [
    defineField({ name: 'id', title: 'ID', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'eyebrow', title: 'Eyebrow', type: 'string' }),
    defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'body', title: 'Body', type: 'text', rows: 4, validation: (Rule) => Rule.required() }),
    stringListField('items', 'Items'),
    defineField({
      name: 'variant',
      title: 'Variant',
      type: 'string',
      initialValue: 'standard',
      options: {
        list: [
          { title: 'Standard', value: 'standard' },
          { title: 'Wide', value: 'wide' },
          { title: 'Accent', value: 'accent' },
        ],
      },
    }),
  ],
});

const homeHero = defineType({
  name: 'homeHero',
  title: '首页首屏 Hero',
  type: 'object',
  fieldsets: [
    { name: 'copy', title: '1.0 首屏文案', options: editorSectionFieldsetOptions },
    { name: 'actions', title: '1.1 首屏按钮', options: editorSectionFieldsetOptions },
    { name: 'media', title: '1.2 首屏媒体', options: editorSectionFieldsetOptions },
    { name: 'motion', title: '1.3 底部动态说明', options: editorSectionFieldsetOptions },
    { name: 'caption', title: '1.4 底部右侧注释', options: editorSectionFieldsetOptions },
  ],
  fields: [
    defineField({
      name: 'eyebrow',
      title: '眉标',
      type: 'string',
      fieldset: 'copy',
      description: '对应首页首屏主标题上方的小标签。',
    }),
    defineField({
      name: 'titleLines',
      title: '标题分行',
      type: 'array',
      of: [{ type: 'string' }],
      fieldset: 'copy',
      description: '对应首页首屏大标题，每一项单独成行。',
    }),
    defineField({
      name: 'intro',
      title: '介绍正文',
      type: 'text',
      rows: 4,
      fieldset: 'copy',
      description: '对应首页首屏标题下方的简短品牌介绍。',
    }),
    defineField({
      name: 'primaryCta',
      title: '主按钮',
      type: 'cta',
      fieldset: 'actions',
      description: '对应首页首屏的主要行动按钮。',
    }),
    defineField({
      name: 'secondaryCta',
      title: '次按钮',
      type: 'cta',
      fieldset: 'actions',
      description: '对应首页首屏的次要行动按钮。',
    }),
    defineField({
      name: 'videoSrc',
      title: '视频路径',
      type: 'string',
      fieldset: 'media',
      description: '对应首页首屏背景视频路径；留空时使用海报图 fallback。',
    }),
    defineField({
      name: 'videoPoster',
      title: '视频海报路径',
      type: 'string',
      fieldset: 'media',
      description: '对应首页首屏视频加载前或受限环境下显示的海报图。',
    }),
    defineField({
      name: 'motionLabel',
      title: '动态说明眉标',
      type: 'string',
      fieldset: 'motion',
      description: '对应首页首屏底部动态说明的小标签。',
    }),
    defineField({
      name: 'motionQuote',
      title: '动态说明正文',
      type: 'text',
      rows: 3,
      fieldset: 'motion',
      description: '对应首页首屏底部动态说明正文。',
    }),
    defineField({
      name: 'captionEyebrow',
      title: '注释眉标',
      type: 'string',
      fieldset: 'caption',
      description: '对应首页首屏底部右侧注释的小标签。',
    }),
    defineField({
      name: 'captionTitle',
      title: '注释标题',
      type: 'string',
      fieldset: 'caption',
      description: '对应首页首屏底部右侧注释的主标题。',
    }),
  ],
});

const pageHero = defineType({
  name: 'pageHero',
  title: '内页 Hero',
  type: 'object',
  fields: [
    defineField({ name: 'eyebrow', title: '眉标', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'title', title: '标题', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'body', title: '正文', type: 'text', rows: 4, validation: (Rule) => Rule.required() }),
    defineField({
      name: 'slides',
      title: '图片序列',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'imageSource',
              title: '图片来源',
              type: 'string',
              initialValue: 'sanity',
              options: { list: contentImageSourceOptions, layout: 'radio' },
              description: '默认使用 Sanity Image CDN；本地路径只作为管理员 fallback。',
            }),
            defineField({
              name: 'image',
              title: 'Sanity 图片',
              type: 'image',
              options: { hotspot: true },
              description: '内容编辑优先上传这里。选择 Sanity 来源时，此图片会作为前台首屏图片。',
            }),
            defineField({
              name: 'src',
              title: '本地图片路径（管理员 fallback）',
              type: 'string',
              description: administratorImageFallbackDescription,
            }),
            defineField({
              name: 'alt',
              title: '图片替代文本（兼容字段）',
              type: 'string',
              hidden: true,
              description: '内页 Hero 图片当前作为装饰性品牌背景，不作为日常内容编辑项。',
            }),
            defineField({ name: 'eyebrow', title: '图片眉标', type: 'string' }),
            defineField({ name: 'caption', title: '图片说明', type: 'text', rows: 2 }),
          ],
        },
      ],
    }),
  ],
});

const brandFramework = defineType({
  name: 'brandFramework',
  title: '品牌框架轮播',
  type: 'object',
  fieldsets: [
    { name: 'intro', title: '2.0 轮播通用设置', options: editorSectionFieldsetOptions },
    { name: 'slides', title: '2.1 轮播图片卡', options: editorSectionFieldsetOptions },
    {
      name: 'system',
      title: '2.8 系统无障碍字段',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'eyebrow',
      title: '眉标',
      type: 'string',
      fieldset: 'intro',
      description: '对应品牌框架轮播上方的小标签。',
    }),
    defineField({
      name: 'ctaLabel',
      title: '按钮文案',
      type: 'string',
      fieldset: 'intro',
      description: '对应轮播右侧进入产品页的按钮文案。',
    }),
    defineField({
      name: 'slides',
      title: '轮播图片卡',
      type: 'array',
      fieldset: 'slides',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'imageSource',
              title: '图片来源',
              type: 'string',
              initialValue: 'sanity',
              options: { list: contentImageSourceOptions, layout: 'radio' },
              description: '默认使用 Sanity Image CDN；本地路径只作为管理员 fallback。',
            }),
            defineField({
              name: 'sanityImage',
              title: 'Sanity 图片',
              type: 'image',
              options: { hotspot: true },
              description: '内容编辑优先上传这里。对应首页品牌框架轮播的背景图片。',
            }),
            defineField({
              name: 'image',
              title: '本地图片路径（管理员 fallback）',
              type: 'string',
              description: administratorImageFallbackDescription,
            }),
            defineField({ name: 'title', title: '标题', type: 'string' }),
            defineField({ name: 'description', title: '说明', type: 'text', rows: 3 }),
          ],
        },
      ],
    }),
    defineField({
      name: 'ariaLabel',
      title: '轮播区域无障碍标题',
      type: 'string',
      fieldset: 'system',
      hidden: true,
      description: '系统固定文案。前台只作为轮播区域 aria-label 使用，不作为可见内容显示。',
    }),
  ],
});

const productSpotlight = defineType({
  name: 'productSpotlight',
  title: '商品聚焦模块',
  type: 'object',
  fieldsets: [
    { name: 'intro', title: '2.0 顶部标题区', options: editorSectionFieldsetOptions },
    { name: 'cardSource', title: '2.1 商品卡片来源', options: editorSectionFieldsetOptions },
    {
      name: 'controls',
      title: '2.8 系统兜底与轮播控制',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'eyebrow',
      title: '眉标',
      type: 'string',
      fieldset: 'intro',
      description: '对应商品聚焦模块顶部的小标签。',
    }),
    defineField({
      name: 'title',
      title: '标题',
      type: 'string',
      fieldset: 'intro',
      description: '对应商品卡片列表上方的主标题。',
    }),
    defineField({
      name: 'body',
      title: '说明正文',
      type: 'text',
      rows: 3,
      fieldset: 'intro',
      description: '对应商品聚焦模块标题下方的简短说明。',
    }),
    defineField({
      name: 'productCardSourceNote',
      title: '商品卡片来源说明',
      type: 'string',
      fieldset: 'cardSource',
      ...guideOnlyField({
        title: '商品卡片内容来自商品工作台',
        description: '单张商品卡片的主图、标题、简述和链接文案，请在「商品工作台 / 商品卡片」中维护；这里仅维护商品聚焦模块的顶部标题与说明。',
        accentColor: '#f5c26b',
      }),
    }),
    defineField({
      name: 'openProductLabel',
      title: '商品卡片链接兜底文案（系统固定）',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '仅当单个商品卡片没有填写链接文案时才作为兜底。日常内容编辑请在商品工作台维护商品卡片链接文案。',
    }),
    defineField({
      name: 'ariaLabel',
      title: '轮播区域无障碍标题',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '系统固定文案。日常内容编辑不修改，避免影响轮播无障碍标签。',
    }),
    defineField({
      name: 'previousLabel',
      title: '上一张按钮无障碍文案',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '系统固定文案。前台只作为按钮 aria-label 使用，不作为可见内容显示。',
    }),
    defineField({
      name: 'nextLabel',
      title: '下一张按钮无障碍文案',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '系统固定文案。前台只作为按钮 aria-label 使用，不作为可见内容显示。',
    }),
  ],
});

const homeProductSpotlight = defineType({
  name: 'homeProductSpotlight',
  title: '首页商品聚焦',
  type: 'object',
  fieldsets: [
    { name: 'intro', title: '3.0 顶部标题区', options: editorSectionFieldsetOptions },
    { name: 'cardSource', title: '3.1 商品卡片来源', options: editorSectionFieldsetOptions },
    {
      name: 'controls',
      title: '3.8 系统兜底与轮播控制',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'eyebrow',
      title: '眉标',
      type: 'string',
      fieldset: 'intro',
      description: '对应首页商品聚焦模块顶部的小标签。',
    }),
    defineField({
      name: 'title',
      title: '标题',
      type: 'string',
      fieldset: 'intro',
      description: '对应首页商品卡片列表上方的主标题。',
    }),
    defineField({
      name: 'body',
      title: '说明正文',
      type: 'text',
      rows: 3,
      fieldset: 'intro',
      description: '对应首页商品聚焦模块标题下方的简短说明。',
    }),
    defineField({
      name: 'productCardSourceNote',
      title: '商品卡片来源说明',
      type: 'string',
      fieldset: 'cardSource',
      ...guideOnlyField({
        title: '商品卡片内容来自商品工作台',
        description: '单张商品卡片的主图、标题、简述和链接文案，请在「商品工作台 / 商品卡片」中维护；这里仅维护首页商品聚焦模块的顶部标题与说明。',
        accentColor: '#f5c26b',
      }),
    }),
    defineField({
      name: 'openProductLabel',
      title: '商品卡片链接兜底文案（系统固定）',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '仅当单个商品卡片没有填写链接文案时才作为兜底。日常内容编辑请在商品工作台维护商品卡片链接文案。',
    }),
    defineField({
      name: 'ariaLabel',
      title: '轮播区域无障碍标题',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '系统固定文案。日常内容编辑不修改，避免影响轮播无障碍标签。',
    }),
    defineField({
      name: 'previousLabel',
      title: '上一张按钮无障碍文案',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '系统固定文案。前台只作为按钮 aria-label 使用，不作为可见内容显示。',
    }),
    defineField({
      name: 'nextLabel',
      title: '下一张按钮无障碍文案',
      type: 'string',
      fieldset: 'controls',
      hidden: true,
      description: '系统固定文案。前台只作为按钮 aria-label 使用，不作为可见内容显示。',
    }),
  ],
});

const aboutSignature = defineType({
  name: 'aboutSignature',
  title: '关于页品牌图文介绍',
  type: 'object',
  fields: [
    defineField({ name: 'eyebrow', title: '眉标', type: 'string' }),
    defineField({ name: 'title', title: '标题', type: 'string' }),
    defineField({ name: 'body', title: '简介', type: 'text', rows: 3 }),
    defineField({
      name: 'panels',
      title: '图文面板',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'id', title: 'ID', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'eyebrow', title: '小标题', type: 'string' }),
            defineField({ name: 'title', title: '标题', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'body', title: '正文', type: 'text', rows: 5, validation: (Rule) => Rule.required() }),
            defineField({
              name: 'imageSource',
              title: '图片来源',
              type: 'string',
              initialValue: 'sanity',
              options: { list: contentImageSourceOptions, layout: 'radio' },
              description: '默认使用 Sanity Image CDN；本地路径只作为管理员 fallback。',
            }),
            defineField({
              name: 'image',
              title: 'Sanity 图片',
              type: 'image',
              options: { hotspot: true },
              description: '内容编辑优先上传这里。对应 About 页图文介绍的图片。',
            }),
            defineField({
              name: 'imagePath',
              title: '本地图片路径（管理员 fallback）',
              type: 'string',
              validation: (Rule) => Rule.required(),
              description: administratorImageFallbackDescription,
            }),
            defineField({
              name: 'imageAlt',
              title: '图片替代文本',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'imagePosition',
              title: '图片位置',
              type: 'string',
              options: {
                list: [
                  { title: '左图右文', value: 'left' },
                  { title: '右图左文', value: 'right' },
                ],
                layout: 'radio',
              },
              initialValue: 'left',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'cta',
              title: '可选按钮',
              type: 'cta',
            }),
          ],
          preview: {
            select: {
              title: 'title',
              subtitle: 'eyebrow',
              media: 'image',
            },
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
  ],
});

const contactMaskSection = defineType({
  name: 'contactMaskSection',
  title: '首页联系入口',
  type: 'object',
  fieldsets: [
    { name: 'copy', title: '4.0 联系入口文案', options: editorSectionFieldsetOptions },
    { name: 'media', title: '4.1 背景图片', options: editorSectionFieldsetOptions },
    {
      name: 'system',
      title: '4.8 系统字段',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'eyebrow',
      title: '眉标',
      type: 'string',
      fieldset: 'copy',
      description: '对应首页联系入口上方的小标签。',
    }),
    defineField({
      name: 'title',
      title: '标题',
      type: 'string',
      fieldset: 'copy',
      description: '对应首页联系入口的主标题。',
    }),
    defineField({
      name: 'body',
      title: '正文',
      type: 'text',
      rows: 3,
      fieldset: 'copy',
      description: '对应首页联系入口标题下方的说明文案。',
    }),
    defineField({
      name: 'cta',
      title: '按钮',
      type: 'cta',
      fieldset: 'copy',
      description: '对应首页联系入口跳转 Contact 页的按钮。',
    }),
    defineField({
      name: 'imageSource',
      title: '图片来源',
      type: 'string',
      fieldset: 'media',
      initialValue: 'sanity',
      options: { list: contentImageSourceOptions, layout: 'radio' },
      description: '默认使用 Sanity Image CDN；本地路径只作为管理员 fallback。',
    }),
    defineField({
      name: 'sanityImage',
      title: 'Sanity 图片',
      type: 'image',
      fieldset: 'media',
      options: { hotspot: true },
      description: '内容编辑优先上传这里。对应首页联系入口右侧的品牌氛围图片。',
    }),
    defineField({
      name: 'image',
      title: '背景图片路径（管理员 fallback）',
      type: 'string',
      fieldset: 'media',
      description: administratorImageFallbackDescription,
    }),
    defineField({
      name: 'imageAlt',
      title: '图片替代文本（兼容字段）',
      type: 'string',
      fieldset: 'system',
      hidden: true,
      description: '当前首页联系入口图片作为装饰性品牌背景处理，日常编辑不需要维护。',
    }),
  ],
});

const contactSection = defineType({
  name: 'contactSection',
  title: '联系与轻量表单',
  type: 'object',
  fieldsets: [
    { name: 'operation', title: '2.0 表单开关', options: editorSectionFieldsetOptions },
    { name: 'intro', title: '2.1 左侧联系说明', options: editorSectionFieldsetOptions },
    { name: 'legal', title: '2.2 提交前法律提示', options: editorSectionFieldsetOptions },
    {
      name: 'formFields',
      title: '2.8 右侧表单字段（系统固定）',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
    {
      name: 'topics',
      title: '2.9 咨询类型选项（系统固定）',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
    {
      name: 'status',
      title: '2.10 提交状态反馈（系统固定）',
      options: { ...editorSectionFieldsetOptions, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'enabled',
      title: '在线表单开关',
      type: 'boolean',
      fieldset: 'operation',
      initialValue: true,
      description: '关闭后前台不再提交 /api/contact，也不展示公开邮箱入口。',
    }),
    defineField({ name: 'eyebrow', title: '眉标', type: 'string', fieldset: 'intro' }),
    defineField({ name: 'title', title: '标题', type: 'string', fieldset: 'intro', validation: (Rule) => Rule.required() }),
    defineField({ name: 'body', title: '说明正文', type: 'text', rows: 3, fieldset: 'intro', validation: (Rule) => Rule.required() }),
    defineField({
      name: 'businessDirections',
      title: '业务方向说明',
      type: 'array',
      fieldset: 'intro',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'title', title: '方向标题', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'body', title: '方向说明', type: 'text', rows: 2, validation: (Rule) => Rule.required() }),
          ],
          preview: {
            select: { title: 'title', subtitle: 'body' },
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'responseTime',
      title: '自定义说明',
      type: 'text',
      rows: 3,
      fieldset: 'intro',
      description: '渲染在左侧联系说明底部，可用于临时公告、服务延迟、合作说明或其他补充提示。',
    }),
    defineField({
      name: 'fieldCopy',
      title: '表单字段文案',
      type: 'object',
      fieldset: 'formFields',
      hidden: true,
      description: '系统固定文案。日常内容编辑不修改，避免破坏表单可用性和多语言一致性。',
      fields: [
        defineField({ name: 'nameLabel', title: '姓名标签', type: 'string', validation: (Rule) => Rule.required() }),
        defineField({ name: 'namePlaceholder', title: '姓名占位文案', type: 'string' }),
        defineField({ name: 'emailLabel', title: '邮箱标签', type: 'string', validation: (Rule) => Rule.required() }),
        defineField({ name: 'emailPlaceholder', title: '邮箱占位文案', type: 'string' }),
        defineField({ name: 'topicLabel', title: '咨询类型标签', type: 'string', validation: (Rule) => Rule.required() }),
        defineField({ name: 'orderNumberLabel', title: '订单号标签', type: 'string' }),
        defineField({ name: 'orderNumberPlaceholder', title: '订单号占位文案', type: 'string' }),
        defineField({ name: 'messageLabel', title: '消息内容标签', type: 'string', validation: (Rule) => Rule.required() }),
        defineField({ name: 'messagePlaceholder', title: '消息内容占位文案', type: 'text', rows: 2 }),
        defineField({
          name: 'messageLimitLabel',
          title: '字数限制提示',
          type: 'string',
          description: '显示在消息内容标题右侧，例如“最多 2000 个字符”。',
        }),
      ],
    }),
    defineField({
      name: 'legalNotice',
      title: '提交前法律提示',
      type: 'object',
      fieldset: 'legal',
      description: '对应前台表单中的“提交前请阅读”卡片，显示在提交按钮上方。用户点击提交按钮即表示接受这里列出的条款。',
      fields: [
        defineField({ name: 'title', title: '提示标题', type: 'string', validation: (Rule) => Rule.required() }),
        defineField({ name: 'body', title: '提示正文', type: 'text', rows: 3, validation: (Rule) => Rule.required() }),
        defineField({
          name: 'links',
          title: '条款链接',
          type: 'array',
          of: [{ type: 'cta' }],
          validation: (Rule) => Rule.required().min(1),
        }),
        defineField({ name: 'acceptance', title: '默认接受说明', type: 'text', rows: 2, validation: (Rule) => Rule.required() }),
      ],
    }),
    defineField({
      name: 'topics',
      title: '咨询类型选项',
      type: 'array',
      fieldset: 'topics',
      hidden: true,
      description: '系统固定选项。日常内容编辑不修改，避免影响表单分类和邮件处理规则。',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'label', title: '显示文案', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({
              name: 'value',
              title: '机器值',
              type: 'string',
              validation: (Rule) => Rule.required().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
              description: '仅使用小写字母、数字、短横线或下划线，例如 brand_partnership。',
            }),
          ],
          preview: {
            select: { title: 'label', subtitle: 'value' },
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'submitLabel',
      title: '提交按钮文案',
      type: 'string',
      fieldset: 'formFields',
      hidden: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'successTitle', title: '成功提示标题', type: 'string', fieldset: 'status', hidden: true }),
    defineField({ name: 'successBody', title: '成功提示正文', type: 'text', rows: 2, fieldset: 'status', hidden: true }),
    defineField({ name: 'errorTitle', title: '失败提示标题', type: 'string', fieldset: 'status', hidden: true }),
    defineField({ name: 'errorBody', title: '失败提示正文', type: 'text', rows: 2, fieldset: 'status', hidden: true }),
    defineField({ name: 'disabledTitle', title: '表单关闭标题', type: 'string', fieldset: 'status', hidden: true }),
    defineField({ name: 'disabledBody', title: '表单关闭说明', type: 'text', rows: 2, fieldset: 'status', hidden: true }),
  ],
});

const productDetailHero = defineType({
  name: 'productDetailHero',
  title: '商品详情头部',
  type: 'object',
  fields: [
    defineField({
      name: 'shopifyMediaSourceNote',
      title: 'SKU 图片来源说明',
      type: 'string',
      ...guideOnlyField({
        title: 'SKU 图片来自 Shopify',
        description: '商品详情页头部图集在构建期优先读取 Shopify 商品媒体；这里不上传 SKU 图。本地 SKU 图集仅作为管理员 fallback 保留。',
        accentColor: '#95bf47',
      }),
    }),
    defineField({
      name: 'summary',
      title: '商品描述',
      type: 'text',
      rows: 4,
      description: '显示在商品详情页头部右侧正文区域。',
    }),
    defineField({
      name: 'gallery',
      title: 'SKU 图集路径',
      type: 'array',
      hidden: true,
      description: '管理员 fallback。前台构建期优先读取 Shopify 商品媒体；只有 Shopify 商品媒体不可用时才使用这里的本地 SKU 图路径。',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'src', title: '图片路径', type: 'string' }),
            defineField({ name: 'alt', title: '图片说明', type: 'string' }),
          ],
        },
      ],
    }),
  ],
});

const productStoryPage = defineType({
  name: 'productStoryPage',
  title: '商品故事页章节',
  type: 'object',
  initialValue: () => ({
    id: `story-${Date.now()}`,
  }),
  fields: [
    defineField({
      name: 'id',
      title: '章节 ID',
      type: 'string',
      hidden: true,
      description: '系统生成的稳定标识，用于前台锚点和可访问性关联；日常运营不需要修改。',
    }),
    defineField({
      name: 'eyebrow',
      title: '章节眉标',
      type: 'string',
      description: '显示在故事页左侧大标题上方的小标题。',
    }),
    defineField({
      name: 'title',
      title: '章节大标题',
      type: 'string',
      description: '显示在故事页左侧的大号标题。',
    }),
    defineField({
      name: 'body',
      title: '章节正文',
      type: 'text',
      rows: 4,
      description: '显示在故事页左侧标题下方的第一段正文。',
    }),
    defineField({
      name: 'supporting',
      title: '补充说明',
      type: 'text',
      rows: 3,
      description: '显示在章节正文下方，可留空。',
    }),
    defineField({
      name: 'imageSource',
      title: '图片来源',
      type: 'string',
      initialValue: 'sanity',
      options: { list: contentImageSourceOptions, layout: 'radio' },
      description: '默认使用 Sanity Image CDN；本地路径只作为管理员 fallback。',
    }),
    defineField({
      name: 'sanityImage',
      title: 'Sanity 图片',
      type: 'image',
      options: { hotspot: true },
      description: '内容编辑优先上传这里。对应商品故事页当前章节的大图。',
    }),
    defineField({
      name: 'image',
      title: '故事大图路径（管理员 fallback）',
      type: 'string',
      description: administratorImageFallbackDescription,
    }),
    defineField({ name: 'imageAlt', title: '图片说明', type: 'string' }),
  ],
});

const productLocalePage = defineType({
  name: 'productLocalePage',
  title: '商品语言页面',
  type: 'document',
  groups: [
    { name: 'launch', title: '基础与上线' },
    { name: 'shopify', title: 'Shopify 只读映射' },
    { name: 'card', title: '商品卡片' },
    { name: 'detail', title: '商品详情头部' },
    { name: 'story', title: '商品故事页' },
    { name: 'seo', title: 'SEO 设置' },
    { name: 'system', title: '系统字段', hidden: true },
  ],
  fieldsets: [
    { name: 'launch', title: '0 基础与上线', options: editorSectionFieldsetOptions },
    { name: 'shopify', title: '1 Shopify 只读映射', options: editorSectionFieldsetOptions },
    { name: 'card', title: '2 商品卡片', options: editorSectionFieldsetOptions },
    { name: 'detail', title: '3 商品详情头部', options: editorSectionFieldsetOptions },
    { name: 'story', title: '4 商品故事页', options: editorSectionFieldsetOptions },
    { name: 'seo', title: '9 SEO 设置', options: editorSectionFieldsetOptions },
    { name: 'system', title: '99 系统字段', options: { ...editorSectionFieldsetOptions, collapsed: true } },
  ],
  fields: [
    defineField({
      name: 'locale',
      title: '当前语言',
      type: 'string',
      group: 'launch',
      fieldset: 'launch',
      options: { list: localeOptions },
      readOnly: true,
      description: '当前正在编辑的语言版本，只读。',
      validation: (Rule) => Rule.required(),
      ...pageModuleGuide({
        title: '基础与上线',
        description: '确认当前语言、上线状态、商品详情页 URL 和商品列表排序。',
        accentColor: '#8fb4ff',
      }),
    }),
    defineField({
      name: 'launchStatus',
      title: '上线状态',
      type: 'string',
      group: 'launch',
      fieldset: 'launch',
      initialValue: 'draft',
      options: { list: productLaunchStatusOptions },
      validation: (Rule) => Rule.required().custom(validateProductPageLocaleLaunchStatus),
      description: '只有“上线”的语言页面会进入前台构建；其他状态只用于编辑和运营管理。',
    }),
    defineField({
      name: 'slug',
      title: '商品页面路径 slug',
      type: 'slug',
      group: 'launch',
      fieldset: 'launch',
      options: { source: 'name', isUnique: () => true },
      description: '决定商品详情页 URL，例如 /zh-cn/products/example-product/。',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'roadmapOrder',
      title: '商品列表排序',
      type: 'number',
      group: 'launch',
      fieldset: 'launch',
      description: '控制商品列表页中商品卡片的排序，数字越小越靠前。',
    }),
    defineField({
      name: 'shopifyHandle',
      title: 'Shopify Handle',
      type: 'string',
      readOnly: true,
      group: 'shopify',
      fieldset: 'shopify',
      description: '只读映射字段，用于确认该语言页面关联哪个 Shopify 商品。',
      ...pageModuleGuide({
        title: 'Shopify 只读映射',
        description: '这里用于核对 Shopify 商品关联关系；商品价格、库存、SKU、订单和支付仍由 Shopify 负责。',
        accentColor: '#95bf47',
      }),
    }),
    defineField({ name: 'shopifyStatus', title: 'Shopify 可售快照', type: 'string', readOnly: true, group: 'shopify', fieldset: 'shopify', description: '仅供运营参考，不决定 Sanity 内容能否上线。' }),
    defineField({ name: 'shopifyTitle', title: 'Shopify 商品名', type: 'string', readOnly: true, group: 'shopify', fieldset: 'shopify' }),
    defineField({ name: 'shopifyAdminUrl', title: '在 Shopify 中编辑', type: 'url', readOnly: true, group: 'shopify', fieldset: 'shopify' }),
    defineField({
      name: 'name',
      title: '商品标题',
      type: 'string',
      group: 'card',
      fieldset: 'card',
      description: '显示在商品列表卡片；当前详情页头部标题也复用这个名称。',
      validation: (Rule) => Rule.required(),
      ...pageModuleGuide({
        title: '商品卡片',
        description: '对应首页和 Products 页中的单张商品卡片，维护商品标题、卡片简述和链接文案；主图来自 Shopify 商品媒体。',
        accentColor: '#f5c26b',
      }),
    }),
    defineField({
      name: 'productCardMediaSourceNote',
      title: '商品卡片图片来源说明',
      type: 'string',
      group: 'card',
      fieldset: 'card',
      ...guideOnlyField({
        title: '商品卡片主图来自 Shopify',
        description: '商品卡片只在这里维护标题、简述和链接文案；主图由 Shopify 商品媒体在构建期读取，不允许在 Sanity 上传覆盖图。',
        accentColor: '#95bf47',
      }),
    }),
    defineField({
      name: 'tagline',
      title: '卡片简述',
      type: 'text',
      rows: 2,
      group: 'card',
      fieldset: 'card',
      description: '显示在商品列表卡片标题下方；当前详情页头部的一句话卖点也复用这里。',
    }),
    defineField({
      name: 'primaryImage',
      title: '商品卡片图片路径（管理员 fallback）',
      type: 'string',
      group: 'system',
      fieldset: 'system',
      hidden: true,
      description: '管理员 fallback。前台构建期优先读取 Shopify 商品主图，不允许在 Sanity 覆盖商品主图。',
    }),
    defineField({ name: 'roadmapLinkLabel', title: '商品卡片链接文案', type: 'string', group: 'card', fieldset: 'card' }),
    defineField({
      name: 'collection',
      title: '详情页系列名',
      type: 'string',
      group: 'detail',
      fieldset: 'detail',
      description: '显示在商品详情页头部和故事页的小字系列名，例如 Example Collection。',
      ...pageModuleGuide({
        title: '商品详情头部',
        description: '对应商品详情页顶部区域，维护系列名、商品描述和 SKU 图集；标题和一句话卖点复用“商品卡片”中的商品标题与卡片简述。',
        accentColor: '#b69cff',
      }),
    }),
    defineField({
      name: 'detailHero',
      title: '详情页头部内容',
      type: 'productDetailHero',
      group: 'detail',
      fieldset: 'detail',
      description: '对应商品详情页顶部：SKU 图集、主图轮播、右侧标题与商品描述。',
    }),
    defineField({
      name: 'storyPages',
      title: '故事页章节',
      type: 'array',
      of: [{ type: 'productStoryPage' }],
      group: 'story',
      fieldset: 'story',
      description: '对应商品详情页向下滚动后的全屏图文故事，每一项就是一屏。',
      ...pageModuleGuide({
        title: '商品故事页',
        description: '对应商品详情页下滑后的故事章节，每一项就是一屏图文内容。',
        accentColor: '#7dd3a8',
      }),
    }),
    defineField({
      name: 'seo',
      title: 'SEO 内容',
      type: 'seo',
      group: 'seo',
      fieldset: 'seo',
      ...pageModuleGuide({
        title: 'SEO 设置',
        description: '维护浏览器标题、搜索结果摘要和分享时使用的商品页面描述。',
        accentColor: '#9ca3af',
      }),
    }),
    defineField({
      name: 'productPage',
      title: '商品主档',
      type: 'reference',
      to: [{ type: 'productPage' }],
      group: 'system',
      fieldset: 'system',
      readOnly: true,
      hidden: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'shopifyProductGid', title: 'Shopify Product GID', type: 'string', readOnly: true, group: 'system', fieldset: 'system', hidden: true }),
  ],
  preview: {
    select: {
      handle: 'shopifyHandle',
      launchStatus: 'launchStatus',
      locale: 'locale',
      title: 'name',
      slug: 'slug.current',
      shopifyStatus: 'shopifyStatus',
    },
    prepare({ handle, launchStatus, locale, title, slug, shopifyStatus }) {
      const localeTitle = localeTitleMap[locale] ?? locale ?? '未设置语言';

      return {
        title: `${localeTitle} / ${title ?? handle ?? '未命名商品'}`,
        subtitle: [slug, launchStatus, shopifyStatus].filter(Boolean).join(' · '),
      };
    },
  },
});

const productPage = defineType({
  name: 'productPage',
  title: '商品主档',
  type: 'document',
  groups: [
    { name: 'identity', title: '商品状态' },
    { name: 'shopify', title: 'Shopify 关联' },
    { name: 'system', title: '系统字段' },
  ],
  fields: [
    defineField({
      name: 'productStatus',
      title: '商品页面状态',
      type: 'string',
      group: 'identity',
      initialValue: 'active',
      options: { list: productPageStatusOptions },
      validation: (Rule) => Rule.required(),
      description: '控制整个商品是否允许进入前台构建；具体语言是否上线请在对应“商品语言页面”中设置。',
    }),
    defineField({ name: 'roadmapOrder', title: '默认展示排序', type: 'number', group: 'identity' }),
    defineField({ name: 'shopifyProductGid', title: 'Shopify Product GID', type: 'string', readOnly: true, group: 'system', hidden: true }),
    defineField({ name: 'shopifyHandle', title: 'Shopify Handle', type: 'string', readOnly: true, group: 'shopify' }),
    defineField({ name: 'shopifyStatus', title: 'Shopify 可售快照', type: 'string', readOnly: true, group: 'shopify', description: '仅供运营参考，不决定 Sanity 内容能否上线。' }),
    defineField({ name: 'shopifyTitle', title: 'Shopify 商品名', type: 'string', readOnly: true, group: 'shopify' }),
    defineField({ name: 'shopifyImageSummary', title: 'Shopify 图片摘要', type: 'array', of: [{ type: 'string' }], readOnly: true, group: 'system', hidden: true }),
    defineField({ name: 'shopifyVariantSummary', title: 'Shopify 变体摘要', type: 'array', of: [{ type: 'string' }], readOnly: true, group: 'system', hidden: true }),
    defineField({ name: 'shopifyAdminUrl', title: '在 Shopify 中编辑', type: 'url', readOnly: true, group: 'shopify' }),
  ],
  preview: {
    select: {
      handle: 'shopifyHandle',
      productStatus: 'productStatus',
      shopifyStatus: 'shopifyStatus',
      title: 'shopifyTitle',
    },
    prepare({ handle, productStatus, shopifyStatus, title }) {
      return {
        title: title ?? handle ?? '未关联 Shopify 商品',
        subtitle: [`商品：${productStatus ?? '未设置'}`, `Shopify：${shopifyStatus ?? '未同步'}`].join(' · '),
      };
    },
  },
});

const page = defineType({
  name: 'page',
  title: '页面内容',
  type: 'document',
  groups: [
    { name: 'setup', title: '基础' },
    { name: 'home', title: '首页内容' },
    { name: 'page', title: '内页内容' },
    { name: 'seo', title: 'SEO' },
  ],
  fieldsets: [
    { name: 'setup', title: '0 基础设置', options: editorSectionFieldsetOptions },
    { name: 'homeHero', title: '1 首页首屏 Hero', options: editorSectionFieldsetOptions },
    { name: 'homeFramework', title: '2 品牌框架轮播', options: editorSectionFieldsetOptions },
    { name: 'homeProductSpotlight', title: '3 首页商品聚焦', options: editorSectionFieldsetOptions },
    { name: 'homeContact', title: '4 首页联系入口', options: editorSectionFieldsetOptions },
    { name: 'pageHero', title: '1 内页 Hero', options: editorSectionFieldsetOptions },
    { name: 'productSpotlight', title: '2 商品聚焦模块', options: editorSectionFieldsetOptions },
    { name: 'contactSection', title: '2 联系与轻量表单', options: editorSectionFieldsetOptions },
    { name: 'aboutSignature', title: '2 关于页图文介绍', options: editorSectionFieldsetOptions },
    { name: 'blocks', title: '3 内容区块', options: editorSectionFieldsetOptions },
    { name: 'seo', title: '9 SEO 设置', options: editorSectionFieldsetOptions },
  ],
  fields: [
    defineField({
      name: 'locale',
      title: '语言',
      type: 'string',
      group: 'setup',
      fieldset: 'setup',
      options: { list: localeOptions },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'kind',
      title: '页面类型',
      type: 'string',
      group: 'setup',
      fieldset: 'setup',
      options: { list: pageKindOptions },
      validation: (Rule) => Rule.required().custom(uniquePageLocaleKind),
    }),
    defineField({
      name: 'title',
      title: '后台标题',
      type: 'string',
      group: 'setup',
      fieldset: 'setup',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'hero',
      title: '首页 Hero 内容',
      type: 'homeHero',
      group: 'home',
      fieldset: 'homeHero',
      hidden: isHomePage,
      ...pageModuleGuide({
        title: '首页首屏 Hero',
        description: '控制首页首屏的主标题、介绍文案、按钮、视频、底部动态说明和右侧注释。',
        accentColor: '#8fb4ff',
      }),
    }),
    defineField({
      name: 'brandFramework',
      title: '品牌框架轮播内容',
      type: 'brandFramework',
      group: 'home',
      fieldset: 'homeFramework',
      hidden: isHomePage,
      ...pageModuleGuide({
        title: '品牌框架轮播',
        description: '维护首页品牌框架轮播的图片卡、标题、说明和入口文案。',
        accentColor: '#b69cff',
      }),
    }),
    defineField({
      name: 'homeProductSpotlight',
      title: '首页商品聚焦内容',
      type: 'homeProductSpotlight',
      group: 'home',
      fieldset: 'homeProductSpotlight',
      hidden: isHomePage,
      ...pageModuleGuide({
        title: '首页商品聚焦',
        description: '维护 Home 页商品聚焦区上方标题与说明；单张商品卡片来自商品工作台。',
        accentColor: '#f5c26b',
      }),
    }),
    defineField({
      name: 'contactMaskSection',
      title: '首页联系入口内容',
      type: 'contactMaskSection',
      group: 'home',
      fieldset: 'homeContact',
      hidden: isHomePage,
      ...pageModuleGuide({
        title: '首页联系入口',
        description: '维护首页底部的联系入口，用于引导访客进入联系或合作流程。',
        accentColor: '#5eead4',
      }),
    }),
    defineField({
      name: 'pageHero',
      title: '内页 Hero 内容',
      type: 'pageHero',
      group: 'page',
      fieldset: 'pageHero',
      hidden: isNotStandardPage,
      ...pageModuleGuide({
        title: '内页首屏 Hero',
        description: '控制内页首屏的眉标、标题、正文和图片序列说明。',
        accentColor: '#8fb4ff',
      }),
    }),
    defineField({
      name: 'productSpotlight',
      title: '商品聚焦内容',
      type: 'productSpotlight',
      group: 'page',
      fieldset: 'productSpotlight',
      hidden: isNotProductsPage,
      ...pageModuleGuide({
        title: '商品聚焦模块',
        description: '维护 Products 页商品列表前的标题、说明和展示引导。',
        accentColor: '#f5c26b',
      }),
    }),
    defineField({
      name: 'contactSection',
      title: '联系与轻量表单',
      type: 'contactSection',
      group: 'page',
      fieldset: 'contactSection',
      hidden: isNotContactPage,
      ...pageModuleGuide({
        title: '联系与轻量表单',
        description: '维护 Contact 页的表单开关、左侧说明和提交前法律提示；表单字段、咨询类型和状态反馈由系统固定。',
        accentColor: '#5eead4',
      }),
    }),
    defineField({
      name: 'aboutSignature',
      title: '图文介绍内容',
      type: 'aboutSignature',
      group: 'page',
      fieldset: 'aboutSignature',
      hidden: isNotAboutPage,
      ...pageModuleGuide({
        title: '关于页图文介绍',
        description: '维护 About 页中部的图文介绍面板，可设置图片位置和按钮。',
        accentColor: '#b69cff',
      }),
    }),
    defineField({
      name: 'showContentBlocks',
      title: '显示内容区块',
      type: 'boolean',
      group: 'page',
      fieldset: 'blocks',
      initialValue: true,
      hidden: isNotStandardPage,
      description: '关闭后前台不渲染 3 内容区块；已填写内容仍会保留，之后可重新打开。',
    }),
    defineField({
      name: 'blocks',
      title: '内容区块列表',
      type: 'array',
      group: 'page',
      fieldset: 'blocks',
      of: [{ type: 'pageBlock' }],
      hidden: isNotStandardPage,
      ...pageModuleGuide({
        title: '通用内容区块',
        description: '维护页面下方可复用的正文区块和列表内容。',
        accentColor: '#7dd3a8',
      }),
    }),
    defineField({
      name: 'seo',
      title: 'SEO 内容',
      type: 'seo',
      group: 'seo',
      fieldset: 'seo',
      ...pageModuleGuide({
        title: 'SEO 设置',
        description: '维护浏览器标题、搜索结果摘要和分享时使用的页面描述。',
        accentColor: '#9ca3af',
      }),
    }),
  ],
  preview: {
    select: { title: 'title', locale: 'locale', kind: 'kind' },
    prepare({ title, locale, kind }) {
      const localeTitle = localeTitleMap[locale] ?? locale ?? '未设置语言';
      const pageKindTitle = pageKindTitleMap[kind] ?? kind ?? '未设置页面';

      return {
        title: `${localeTitle} / ${pageKindTitle}`,
        subtitle: title,
      };
    },
  },
});

const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({ name: 'title', title: 'Title', type: 'string' }),
    defineField({ name: 'siteUrl', title: 'Site URL', type: 'url' }),
  ],
});

const navigation = defineType({
  name: 'navigation',
  title: 'Navigation',
  type: 'document',
  fields: [
    defineField({ name: 'locale', title: 'Locale', type: 'string', options: { list: localeOptions } }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'label', title: 'Label', type: 'string' }),
            defineField({ name: 'href', title: 'Href', type: 'string' }),
          ],
        },
      ],
    }),
  ],
});

const redirect = defineType({
  name: 'redirect',
  title: 'Redirect',
  type: 'document',
  fields: [
    defineField({ name: 'from', title: 'From', type: 'string' }),
    defineField({ name: 'to', title: 'To', type: 'string' }),
    defineField({ name: 'statusCode', title: 'Status Code', type: 'number', initialValue: 301 }),
  ],
});

const productRecycleBinEntry = defineType({
  name: 'productRecycleBinEntry',
  title: '商品回收站记录',
  type: 'document',
  fields: [
    defineField({
      name: 'productTitle',
      title: '商品名称',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'productHandle',
      title: 'Shopify Handle',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'productPageId',
      title: '商品主档 ID',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'deletedAt',
      title: '删除时间',
      type: 'datetime',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'deletedBy',
      title: '删除操作人',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'restoreStatus',
      title: '恢复状态',
      type: 'string',
      readOnly: true,
      initialValue: 'deleted',
      options: {
        list: [
          { title: '已删除，等待恢复', value: 'deleted' },
          { title: '已恢复', value: 'restored' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'restoredAt',
      title: '恢复时间',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'confirmToken',
      title: '删除确认口令',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'productSnapshots',
      title: '商品主档快照',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'documentId', title: '文档 ID', type: 'string' }),
            defineField({ name: 'snapshotJson', title: '文档 JSON 快照', type: 'text', rows: 12 }),
          ],
        },
      ],
    }),
    defineField({
      name: 'localeSnapshots',
      title: '语言页快照',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'documentId', title: '文档 ID', type: 'string' }),
            defineField({ name: 'locale', title: '语言', type: 'string', options: { list: localeOptions } }),
            defineField({ name: 'name', title: '语言页名称', type: 'string' }),
            defineField({ name: 'slug', title: 'Slug', type: 'string' }),
            defineField({ name: 'launchStatus', title: '上线状态', type: 'string', options: { list: productLaunchStatusOptions } }),
            defineField({ name: 'snapshotJson', title: '文档 JSON 快照', type: 'text', rows: 12 }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      deletedAt: 'deletedAt',
      handle: 'productHandle',
      restoreStatus: 'restoreStatus',
      title: 'productTitle',
    },
    prepare({ deletedAt, handle, restoreStatus, title }) {
      return {
        title: title ?? handle ?? '未命名删除记录',
        subtitle: [restoreStatus === 'restored' ? '已恢复' : '等待恢复', deletedAt].filter(Boolean).join(' · '),
      };
    },
  },
});

export const schemaTypes = [
  seo,
  cta,
  pageBlock,
  homeHero,
  pageHero,
  brandFramework,
  homeProductSpotlight,
  productSpotlight,
  aboutSignature,
  contactMaskSection,
  contactSection,
  productDetailHero,
  productStoryPage,
  productLocalePage,
  siteSettings,
  navigation,
  page,
  productPage,
  productRecycleBinEntry,
  redirect,
];

export const contentDocumentSchemaTypeNames = [
  'siteSettings',
  'navigation',
  'page',
  'redirect',
];

export const commerceDocumentSchemaTypeNames = [
  'productLocalePage',
  'productPage',
  'productRecycleBinEntry',
];

export const commerceNestedSchemaTypeNames = [
  'homeProductSpotlight',
  'productSpotlight',
  'productDetailHero',
  'productStoryPage',
];

const contentDocumentSchemaTypeNameSet = new Set(contentDocumentSchemaTypeNames);
const commerceDocumentSchemaTypeNameSet = new Set(commerceDocumentSchemaTypeNames);
const commerceNestedSchemaTypeNameSet = new Set(commerceNestedSchemaTypeNames);
const commercePageFieldNames = new Set(['homeProductSpotlight', 'productSpotlight']);
const commercePageFieldsetNames = new Set(['homeProductSpotlight', 'productSpotlight']);

function createPageSchemaType({ productCms }) {
  if (productCms) {
    return page;
  }

  return {
    ...page,
    fieldsets: page.fieldsets.filter((fieldset) => !commercePageFieldsetNames.has(fieldset.name)),
    fields: page.fields
      .filter((field) => !commercePageFieldNames.has(field.name))
      .map((field) =>
        field.name === 'kind'
          ? {
              ...field,
              options: {
                ...field.options,
                list: pageKindOptions.filter((option) => option.value !== 'products'),
              },
            }
          : field,
      ),
  };
}

export function createSchemaTypesForFeatures({
  contentCms = true,
  productCms = true,
} = {}) {
  if (!contentCms && !productCms) {
    return [];
  }

  return schemaTypes.flatMap((schemaType) => {
    if (!productCms && commerceNestedSchemaTypeNameSet.has(schemaType.name)) {
      return [];
    }

    if (schemaType.name === 'page') {
      return contentCms ? [createPageSchemaType({ productCms })] : [];
    }

    if (schemaType.type !== 'document') {
      return [schemaType];
    }

    if (contentDocumentSchemaTypeNameSet.has(schemaType.name)) {
      return contentCms ? [schemaType] : [];
    }

    if (commerceDocumentSchemaTypeNameSet.has(schemaType.name)) {
      return productCms ? [schemaType] : [];
    }

    return contentCms || productCms ? [schemaType] : [];
  });
}
