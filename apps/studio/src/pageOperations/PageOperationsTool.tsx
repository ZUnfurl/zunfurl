import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Inline,
  Label,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useClient } from 'sanity';
import {
  activeLocales as configuredActiveLocales,
  siteUrl,
  type SupportedLocale,
} from 'gcss-config';
import {
  getStudioPageKinds,
  isStudioContactFormEnabled,
  isStudioProductCmsEnabled,
  type StudioPageKind,
} from '../studioProfile';

const apiVersion = '2026-06-20';
const defaultStorefrontOrigin = siteUrl;

type LocaleId = SupportedLocale;
type PageKind = StudioPageKind;
type PageFilter = 'all' | 'needs-review' | 'drafts' | 'missing';
type ModuleStatus = 'done' | 'missing' | 'off' | 'warning';

interface PageDocumentSummary {
  _id: string;
  _updatedAt?: string;
  aboutSignature?: { panels?: unknown[] };
  blocks?: unknown[];
  brandFramework?: { slides?: unknown[] };
  contactMaskSection?: Record<string, unknown>;
  contactSection?: { enabled?: boolean; legalNotice?: Record<string, unknown> };
  hero?: Record<string, unknown>;
  homeProductSpotlight?: Record<string, unknown>;
  kind?: PageKind;
  locale?: LocaleId;
  pageHero?: { body?: string; slides?: unknown[]; title?: string };
  productSpotlight?: Record<string, unknown>;
  seo?: { description?: string; title?: string };
  showContentBlocks?: boolean;
  title?: string;
}

interface PageSlot {
  draft?: PageDocumentSummary;
  kind: PageKind;
  locale: LocaleId;
  published?: PageDocumentSummary;
}

interface PageGroup {
  kind: PageKind;
  slots: PageSlot[];
}

interface ModuleCheck {
  description: string;
  status: ModuleStatus;
  title: string;
}

const localeCatalog: Array<{ id: LocaleId; title: string }> = [
  { id: 'en', title: 'English' },
  { id: 'fr', title: 'Français' },
  { id: 'zh-cn', title: '简体中文' },
];
const locales = localeCatalog.filter((locale) => configuredActiveLocales.includes(locale.id));

const pageKinds: Array<{ id: PageKind; title: string }> = getStudioPageKinds();
const productCmsEnabled = isStudioProductCmsEnabled();
const contactFormEnabled = isStudioContactFormEnabled();
const productPageProjection = productCmsEnabled
  ? `
            homeProductSpotlight,
            productSpotlight,
    `
  : '';

const filterOptions: Array<{ description: string; title: string; value: PageFilter }> = [
  { description: '显示所有固定页面。', title: '全部', value: 'all' },
  { description: '模块缺失、SEO 不完整或内容区块需要检查。', title: '待检查', value: 'needs-review' },
  { description: '存在未发布草稿的页面。', title: '有草稿', value: 'drafts' },
  { description: '固定页面文档尚未创建。', title: '缺文档', value: 'missing' },
];

const moduleTone: Record<ModuleStatus, 'caution' | 'critical' | 'default' | 'positive'> = {
  done: 'positive',
  missing: 'critical',
  off: 'default',
  warning: 'caution',
};

function getStorefrontOrigin() {
  const configuredOrigin = process.env.SANITY_STUDIO_STOREFRONT_ORIGIN?.trim();

  return (configuredOrigin || defaultStorefrontOrigin).replace(/\/+$/, '');
}

function getBaseDocumentId(locale: LocaleId, kind: PageKind) {
  return `page.${locale}.${kind}`;
}

function getBaseId(documentId: string) {
  return documentId.replace(/^drafts\./, '');
}

function getPageEditorHref(locale: LocaleId, kind: PageKind) {
  return `/structure/pages;pages-${locale};page-${locale}-${kind}`;
}

function getPublishedPageHref(locale: LocaleId, kind: PageKind) {
  const prefix = `/${locale}/`;

  if (kind === 'home') {
    return `${getStorefrontOrigin()}${prefix}`;
  }

  return `${getStorefrontOrigin()}${prefix}${kind}/`;
}

function getSlotDocument(slot: PageSlot) {
  return slot.draft ?? slot.published;
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasObjectValue(value: unknown) {
  return Boolean(value && typeof value === 'object');
}

function hasArrayValue(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function hasSeo(page?: PageDocumentSummary) {
  return hasText(page?.seo?.title) && hasText(page?.seo?.description);
}

function hasPageHero(page?: PageDocumentSummary) {
  return hasText(page?.pageHero?.title) && hasText(page?.pageHero?.body) && hasArrayValue(page?.pageHero?.slides);
}

function getBlocksCheck(page?: PageDocumentSummary): ModuleCheck {
  if (!page) {
    return {
      description: '页面文档缺失，暂时无法判断内容区块。',
      status: 'missing',
      title: '3 内容区块',
    };
  }

  if (page.showContentBlocks === false) {
    return {
      description: '前台已关闭该模块；已填写内容仍会保留。',
      status: 'off',
      title: '3 内容区块',
    };
  }

  if (hasArrayValue(page.blocks)) {
    return {
      description: 'BrandContentBlocks 已配置。',
      status: 'done',
      title: '3 内容区块',
    };
  }

  return {
    description: '内容区块已开启，但还没有可渲染条目。',
    status: 'warning',
    title: '3 内容区块',
  };
}

function createCheck(title: string, isReady: boolean, readyText: string, missingText: string): ModuleCheck {
  return {
    description: isReady ? readyText : missingText,
    status: isReady ? 'done' : 'missing',
    title,
  };
}

function getModuleChecks(slot: PageSlot): ModuleCheck[] {
  const page = getSlotDocument(slot);
  const seoCheck = createCheck('9 SEO 设置', hasSeo(page), 'SEO 标题和描述已配置。', '缺少 SEO 标题或描述。');

  if (slot.kind === 'home') {
    return [
      createCheck('1 首页首屏 Hero', hasObjectValue(page?.hero), '首页首屏 Hero 已配置。', '缺少首页首屏 Hero。'),
      createCheck('2 品牌框架轮播', hasArrayValue(page?.brandFramework?.slides), '品牌框架轮播已配置。', '缺少品牌框架轮播图片卡。'),
      ...(productCmsEnabled
        ? [createCheck('3 首页商品聚焦', hasObjectValue(page?.homeProductSpotlight), '首页商品聚焦已配置。', '缺少首页商品聚焦内容。')]
        : []),
      createCheck('4 首页联系入口', hasObjectValue(page?.contactMaskSection), '首页联系入口已配置。', '缺少首页联系入口内容。'),
      seoCheck,
    ];
  }

  if (slot.kind === 'about') {
    return [
      createCheck('1 内页 Hero', hasPageHero(page), 'BrandPageHero 已配置。', '缺少内页 Hero 文案或图片序列。'),
      createCheck('2 关于页图文介绍', hasArrayValue(page?.aboutSignature?.panels), 'AboutSignatureSection 已配置。', '缺少关于页图文介绍面板。'),
      getBlocksCheck(page),
      seoCheck,
    ];
  }

  if (slot.kind === 'products') {
    return [
      createCheck('1 内页 Hero', hasPageHero(page), 'BrandPageHero 已配置。', '缺少内页 Hero 文案或图片序列。'),
      createCheck('2 商品聚焦模块', hasObjectValue(page?.productSpotlight), 'ProductCard 来源说明已配置。', '缺少 Products 页商品聚焦模块。'),
      getBlocksCheck(page),
      seoCheck,
    ];
  }

  return [
    createCheck('1 内页 Hero', hasPageHero(page), 'BrandPageHero 已配置。', '缺少内页 Hero 文案或图片序列。'),
    ...(contactFormEnabled
      ? [
          createCheck(
            '2 联系与轻量表单',
            page?.contactSection?.enabled !== false && hasObjectValue(page?.contactSection),
            'ContactSection 表单模块已启用。',
            '联系表单模块未启用或缺失。',
          ),
        ]
      : [
          {
            description: '当前 profile 未启用真实 Contact 表单；页面可只保留 Hero 和内容区块。',
            status: 'off' as const,
            title: '2 联系与轻量表单',
          },
        ]),
    getBlocksCheck(page),
    seoCheck,
  ];
}

function slotHasIssues(slot: PageSlot) {
  if (!slot.published && !slot.draft) {
    return true;
  }

  return getModuleChecks(slot).some((check) => check.status === 'missing' || check.status === 'warning');
}

function slotMatchesSearch(slot: PageSlot, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const page = getSlotDocument(slot);
  const values = [
    slot.locale,
    slot.kind,
    locales.find((locale) => locale.id === slot.locale)?.title,
    pageKinds.find((kind) => kind.id === slot.kind)?.title,
    page?.title,
  ];

  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function groupMatchesSearch(group: PageGroup, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const pageKindTitle = pageKinds.find((kind) => kind.id === group.kind)?.title ?? group.kind;

  return pageKindTitle.toLowerCase().includes(normalizedQuery) ||
    group.slots.some((slot) => slotMatchesSearch(slot, query));
}

function groupMatchesFilter(group: PageGroup, filter: PageFilter) {
  switch (filter) {
    case 'drafts':
      return group.slots.some((slot) => Boolean(slot.draft));
    case 'missing':
      return group.slots.some((slot) => !slot.published && !slot.draft);
    case 'needs-review':
      return group.slots.some(slotHasIssues);
    case 'all':
    default:
      return true;
  }
}

function getStatusBadge(slot: PageSlot) {
  if (slot.published && slot.draft) {
    return { text: '有草稿', tone: 'caution' as const };
  }

  if (slot.published) {
    return { text: '已发布', tone: 'positive' as const };
  }

  if (slot.draft) {
    return { text: '仅草稿', tone: 'caution' as const };
  }

  return { text: '缺文档', tone: 'critical' as const };
}

function formatUpdatedAt(page?: PageDocumentSummary) {
  if (!page?._updatedAt) return '未记录更新时间';

  return formatDate(page._updatedAt);
}

function formatDate(value?: string) {
  if (!value) return '未记录更新时间';

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function getPageKindTitle(kind: PageKind) {
  return pageKinds.find((pageKind) => pageKind.id === kind)?.title ?? kind;
}

function getPageRouteSummary(kind: PageKind) {
  return kind === 'home' ? '/en/ · /fr/ · /zh-cn/' : `/en/${kind}/ · /fr/${kind}/ · /zh-cn/${kind}/`;
}

function getGroupStats(group: PageGroup) {
  const issueCount = group.slots.filter(slotHasIssues).length;
  const draftCount = group.slots.filter((slot) => Boolean(slot.draft)).length;
  const missingCount = group.slots.filter((slot) => !slot.published && !slot.draft).length;
  const publishedCount = group.slots.filter((slot) => Boolean(slot.published)).length;
  const latestUpdatedAt = group.slots
    .map((slot) => getSlotDocument(slot)?._updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    draftCount,
    issueCount,
    latestUpdatedAt,
    missingCount,
    publishedCount,
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card padding={3} radius={2} tone="transparent">
      <Stack space={2}>
        <Text muted size={1}>{label}</Text>
        <Heading size={3}>{value}</Heading>
      </Stack>
    </Card>
  );
}

function PageGroupCard({
  group,
  isSelected,
  onSelect,
}: {
  group: PageGroup;
  isSelected: boolean;
  onSelect: (kind: PageKind) => void;
}) {
  const stats = getGroupStats(group);
  const tone = stats.missingCount > 0 || stats.issueCount > 0 ? 'caution' : 'default';

  return (
    <Card padding={4} radius={2} shadow={isSelected ? 2 : 1} tone={isSelected ? 'primary' : tone}>
      <Stack space={4}>
        <Flex align="flex-start" justify="space-between" gap={3} wrap="wrap">
          <Stack space={2}>
            <Heading size={2}>{getPageKindTitle(group.kind)}</Heading>
            <Text muted size={1}>{getPageRouteSummary(group.kind)}</Text>
          </Stack>
          <Badge tone={stats.issueCount > 0 || stats.missingCount > 0 ? 'caution' : 'positive'}>
            {stats.issueCount > 0 || stats.missingCount > 0 ? '待检查' : '结构完整'}
          </Badge>
        </Flex>

        <Grid columns={3} gap={2}>
          {group.slots.map((slot) => {
            const badge = getStatusBadge(slot);

            return (
              <Card key={slot.locale} padding={2} radius={2} tone={badge.tone}>
                <Stack space={2}>
                  <Text weight="semibold" size={1}>
                    {locales.find((locale) => locale.id === slot.locale)?.title ?? slot.locale}
                  </Text>
                  <Badge tone={badge.tone}>{badge.text}</Badge>
                </Stack>
              </Card>
            );
          })}
        </Grid>

        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Text muted size={1}>最近更新：{formatDate(stats.latestUpdatedAt)}</Text>
          <Button
            mode={isSelected ? 'default' : 'ghost'}
            onClick={() => onSelect(group.kind)}
            text={isSelected ? '当前页面' : '查看详情'}
          />
        </Flex>
      </Stack>
    </Card>
  );
}

function LanguageDetailCard({ slot }: { slot: PageSlot }) {
  const page = getSlotDocument(slot);
  const checks = getModuleChecks(slot);
  const badge = getStatusBadge(slot);
  const issueCount = checks.filter((check) => check.status === 'missing' || check.status === 'warning').length;

  return (
    <Card padding={4} radius={2} shadow={1} tone={issueCount > 0 || !page ? 'caution' : 'default'}>
      <Stack space={4}>
        <Flex align="flex-start" justify="space-between" gap={3} wrap="wrap">
          <Stack space={2}>
            <Heading size={2}>{locales.find((locale) => locale.id === slot.locale)?.title ?? slot.locale}</Heading>
            <Text muted size={1}>{page?.title ?? '固定页面文档尚未创建'}</Text>
          </Stack>
          <Inline space={2}>
            <Badge tone={badge.tone}>{badge.text}</Badge>
            <Badge tone={issueCount > 0 ? 'caution' : 'positive'}>
              {issueCount > 0 ? `${issueCount} 项待检查` : '结构完整'}
            </Badge>
          </Inline>
        </Flex>

        <Grid columns={[1, 2]} gap={2}>
          {checks.map((check) => (
            <Card key={check.title} padding={3} radius={2} tone={moduleTone[check.status]}>
              <Stack space={2}>
                <Inline space={2}>
                  <Badge tone={moduleTone[check.status]}>
                    {check.status === 'done' ? '已配置' : check.status === 'off' ? '已关闭' : '需处理'}
                  </Badge>
                  <Text weight="semibold" size={1}>{check.title}</Text>
                </Inline>
                <Text muted size={1}>{check.description}</Text>
              </Stack>
            </Card>
          ))}
        </Grid>

        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Text muted size={1}>最近更新：{formatUpdatedAt(page)}</Text>
          <Inline space={2}>
            <Button as="a" href={getPageEditorHref(slot.locale, slot.kind)} mode="ghost" text="编辑页面" />
            <Button
              as="a"
              href={getPublishedPageHref(slot.locale, slot.kind)}
              mode="ghost"
              rel="noreferrer"
              target="_blank"
              text="查看已发布页面"
            />
          </Inline>
        </Flex>
      </Stack>
    </Card>
  );
}

function PageDetailPanel({ group }: { group: PageGroup }) {
  const stats = getGroupStats(group);

  return (
    <Card padding={4} radius={2} shadow={1}>
      <Stack space={4}>
        <Flex align="flex-start" justify="space-between" gap={3} wrap="wrap">
          <Stack space={2}>
            <Heading size={3}>{getPageKindTitle(group.kind)} 页面详情</Heading>
            <Text muted size={1}>
              虚拟主档视图：这里不新增 Sanity 主档，只把同一个固定页面的三种语言聚合到一起。
            </Text>
          </Stack>
          <Inline space={2}>
            <Badge tone={stats.issueCount > 0 || stats.missingCount > 0 ? 'caution' : 'positive'}>
              {stats.issueCount > 0 || stats.missingCount > 0 ? `${stats.issueCount} 个语言待检查` : '全部语言结构完整'}
            </Badge>
            {stats.draftCount > 0 ? <Badge tone="caution">{stats.draftCount} 个草稿</Badge> : null}
          </Inline>
        </Flex>

        <Grid columns={[1, 1, 3]} gap={4}>
          {group.slots.map((slot) => (
            <LanguageDetailCard key={slot.locale} slot={slot} />
          ))}
        </Grid>
      </Stack>
    </Card>
  );
}

function buildSlots(documents: PageDocumentSummary[]): PageSlot[] {
  const byBaseId = new Map<string, { draft?: PageDocumentSummary; published?: PageDocumentSummary }>();

  for (const document of documents) {
    if (!document._id || !document.locale || !document.kind) continue;

    const baseId = getBaseId(document._id);
    const entry = byBaseId.get(baseId) ?? {};

    if (document._id.startsWith('drafts.')) {
      entry.draft = document;
    } else {
      entry.published = document;
    }

    byBaseId.set(baseId, entry);
  }

  return locales.flatMap((locale) =>
    pageKinds.map((kind) => {
      const entry = byBaseId.get(getBaseDocumentId(locale.id, kind.id)) ?? {};

      return {
        draft: entry.draft,
        kind: kind.id,
        locale: locale.id,
        published: entry.published,
      };
    }),
  );
}

function buildGroups(slots: PageSlot[]): PageGroup[] {
  return pageKinds.map((kind) => ({
    kind: kind.id,
    slots: locales.map((locale) =>
      slots.find((slot) => slot.kind === kind.id && slot.locale === locale.id) ?? {
        kind: kind.id,
        locale: locale.id,
      },
    ),
  }));
}

export function PageOperationsTool() {
  const client = useClient({ apiVersion });
  const [activeKind, setActiveKind] = useState<PageKind>('home');
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<PageFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [slots, setSlots] = useState<PageSlot[]>([]);

  const loadPages = useCallback(async () => {
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await client.withConfig({ perspective: 'raw' }).fetch<PageDocumentSummary[]>(
        `
          *[_type == "page" && locale in $locales && kind in $kinds] | order(locale asc, kind asc, _id asc) {
            _id,
            _updatedAt,
            aboutSignature { panels[] },
            blocks[],
            brandFramework { slides[] },
            contactMaskSection,
            contactSection {
              enabled,
              legalNotice
            },
            hero,
            ${productPageProjection}
            kind,
            locale,
            pageHero {
              body,
              slides[],
              title
            },
            seo {
              description,
              title
            },
            showContentBlocks,
            title
          }
        `,
        {
          kinds: pageKinds.map((kind) => kind.id),
          locales: locales.map((locale) => locale.id),
        },
      );

      setSlots(buildSlots(result));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const groups = useMemo(() => buildGroups(slots), [slots]);
  const visibleGroups = useMemo(
    () => groups.filter((group) => groupMatchesFilter(group, filter) && groupMatchesSearch(group, query)),
    [filter, groups, query],
  );
  const activeGroup = visibleGroups.find((group) => group.kind === activeKind) ?? visibleGroups[0];

  useEffect(() => {
    if (activeGroup && activeGroup.kind !== activeKind) {
      setActiveKind(activeGroup.kind);
    }
  }, [activeGroup, activeKind]);

  const currentFilter = filterOptions.find((option) => option.value === filter) ?? filterOptions[0];
  const issueGroupCount = groups.filter((group) => group.slots.some(slotHasIssues)).length;
  const issueLanguageCount = slots.filter(slotHasIssues).length;
  const draftCount = slots.filter((slot) => Boolean(slot.draft)).length;
  const missingCount = slots.filter((slot) => !slot.published && !slot.draft).length;
  const completeGroupCount = groups.length - issueGroupCount;
  const totalLanguageCount = groups.length * locales.length;

  const selectedPageTitle = activeGroup ? getPageKindTitle(activeGroup.kind) : '无匹配页面';

  return (
    <Box padding={4}>
      <Stack space={5}>
        <Flex align="flex-start" justify="space-between" gap={4} wrap="wrap">
          <Stack space={3}>
            <Heading size={4}>页面工作台</Heading>
            <Text muted size={2}>
              页面总览按 {pageKinds.map((pageKind) => pageKind.title).join('、')} 聚合显示。先选择页面虚拟主档，再查看三种语言的模块状态和编辑入口。
            </Text>
          </Stack>
          <Button disabled={isLoading} mode="ghost" onClick={() => void loadPages()} text="刷新页面状态" />
        </Flex>

        <Grid columns={[2, 4]} gap={3}>
          <StatCard label="页面组" value={groups.length} />
          <StatCard label="结构完整页面" value={completeGroupCount} />
          <StatCard label="待检查语言" value={issueLanguageCount} />
          <StatCard label="有草稿语言" value={draftCount} />
        </Grid>

        <Card padding={4} radius={2} shadow={1}>
          <Grid columns={[1, 1, 3]} gap={4}>
            <Stack space={2}>
              <Label size={1}>筛选</Label>
              <Select
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter(event.currentTarget.value as PageFilter)}
                value={filter}
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.title}</option>
                ))}
              </Select>
              <Text muted size={1}>{currentFilter.description}</Text>
            </Stack>
            <Stack space={2}>
              <Label size={1}>搜索</Label>
              <TextInput onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)} placeholder="输入页面名、语言或后台标题" value={query} />
              <Text muted size={1}>当前显示 {visibleGroups.length} / {groups.length} 个页面组，合计 {totalLanguageCount} 个语言页。</Text>
            </Stack>
            <Card padding={3} radius={2} tone={missingCount > 0 ? 'caution' : 'transparent'}>
              <Stack space={2}>
                <Text weight="semibold" size={1}>当前详情</Text>
                <Text muted size={1}>
                  {selectedPageTitle}：详情区只显示当前页面的三种语言，避免一次性平铺全部页面。
                </Text>
              </Stack>
            </Card>
          </Grid>
        </Card>

        {error ? (
          <Card padding={4} radius={2} tone="critical">
            <Text>{error}</Text>
          </Card>
        ) : null}

        {isLoading ? (
          <Flex align="center" gap={3}>
            <Spinner muted />
            <Text muted>正在读取页面内容...</Text>
          </Flex>
        ) : null}

        {!isLoading && visibleGroups.length === 0 ? (
          <Card padding={4} radius={2} tone="caution">
            <Text>当前筛选没有匹配页面。</Text>
          </Card>
        ) : null}

        {!isLoading && visibleGroups.length > 0 ? (
          <>
            <Stack space={3}>
              <Inline space={2}>
                <Badge tone="primary">页面总览</Badge>
                <Text muted size={1}>4 个固定页面以虚拟主档形式聚合三语言状态。</Text>
              </Inline>
              <Grid columns={[1, 2, 4]} gap={4}>
                {visibleGroups.map((group) => (
                  <PageGroupCard
                    group={group}
                    isSelected={group.kind === activeKind}
                    key={group.kind}
                    onSelect={setActiveKind}
                  />
                ))}
              </Grid>
            </Stack>

            {activeGroup ? <PageDetailPanel group={activeGroup} /> : null}
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

export default PageOperationsTool;
