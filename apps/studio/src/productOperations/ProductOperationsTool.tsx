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
  useToast,
} from '@sanity/ui';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useClient } from 'sanity';
import {
  createProductPageShopifySummary,
  supportedLocales,
  type LocaleId,
  type ShopifySummaryFields,
} from '../productLaunch/logic';
import { fetchShopifyProductByGidOrHandle, getShopifyStorefrontConfig } from '../productLaunch/shopify';

const apiVersion = '2026-06-20';

type ProductStatus = 'active' | 'archived';
type LaunchStatus = 'draft' | 'ready' | 'live' | 'archived';
type ProductFilter =
  | 'active'
  | 'live'
  | 'needs-work'
  | 'drafts'
  | 'shopify-issue'
  | 'archived'
  | 'recycle-bin'
  | 'all';

interface LanguagePageSummary {
  _id: string;
  _updatedAt?: string;
  launchStatus?: LaunchStatus;
  locale: LocaleId;
  name?: string;
  slug?: string;
}

interface ProductSummary {
  _id: string;
  _updatedAt?: string;
  languagePages?: LanguagePageSummary[];
  productStatus?: ProductStatus;
  shopifyAdminUrl?: string;
  shopifyHandle?: string;
  shopifyImageSummary?: string[];
  shopifyProductGid?: string;
  shopifyStatus?: string;
  shopifyTitle?: string;
  shopifyVariantSummary?: string[];
}

interface ProductSnapshotSummary {
  documentId?: string;
  launchStatus?: LaunchStatus;
  locale?: LocaleId;
  name?: string;
  slug?: string;
  snapshotJson?: string;
}

interface ProductRecycleBinEntry {
  _id: string;
  deletedAt?: string;
  localeSnapshots?: ProductSnapshotSummary[];
  productHandle?: string;
  productPageId?: string;
  productSnapshots?: ProductSnapshotSummary[];
  productTitle?: string;
  restoreStatus?: 'deleted' | 'restored';
  restoredAt?: string;
}

type DeletableDocument = Record<string, unknown> & {
  _createdAt?: string;
  _id: string;
  _rev?: string;
  _type: string;
  _updatedAt?: string;
  launchStatus?: LaunchStatus;
  locale?: LocaleId;
  name?: string;
  slug?: { current?: string };
};

interface ShopifySummarySnapshot {
  shopifyAdminUrl?: string;
  shopifyHandle?: string;
  shopifyImageSummary?: string[];
  shopifyProductGid?: string;
  shopifyStatus?: string;
  shopifyTitle?: string;
  shopifyVariantSummary?: string[];
}

type MappingCheckStatus = 'checking' | 'current' | 'error' | 'stale' | 'unavailable';

interface ShopifyMappingCheck {
  checkedAt?: string;
  mismatches?: string[];
  status: MappingCheckStatus;
  title: string;
}

interface ProductStats {
  archivedLanguages: number;
  draftLanguages: number;
  existingLanguages: number;
  liveLanguages: number;
  missingLanguages: number;
  readyLanguages: number;
}

const launchStatusTitle: Record<LaunchStatus, string> = {
  archived: '归档',
  draft: '草稿',
  live: '上线',
  ready: '就绪',
};

const launchStatusTone: Record<LaunchStatus, 'caution' | 'default' | 'positive' | 'primary'> = {
  archived: 'default',
  draft: 'default',
  live: 'positive',
  ready: 'primary',
};

const filterOptions: Array<{ description: string; title: string; value: ProductFilter }> = [
  { description: '隐藏已归档商品，适合日常维护。', title: '运营中', value: 'active' },
  { description: '至少有一个语言正在前台展示。', title: '上线中', value: 'live' },
  { description: '存在未创建、草稿或就绪语言。', title: '待处理', value: 'needs-work' },
  { description: '存在草稿或就绪语言。', title: '有草稿', value: 'drafts' },
  { description: 'Shopify 只读映射缺失或不可读。', title: 'Shopify 异常', value: 'shopify-issue' },
  { description: '已从前台整体移除，可恢复。', title: '已归档', value: 'archived' },
  { description: '管理员危险区：查看已整档删除、但仍可从快照恢复的商品。', title: '回收站', value: 'recycle-bin' },
  { description: '显示所有商品。', title: '全部', value: 'all' },
];

function getLanguagePage(product: ProductSummary, locale: LocaleId) {
  return product.languagePages?.find((page) => page.locale === locale);
}

function getLanguagePageHref(locale: LocaleId, pageId: string) {
  return `/structure/product-pages;product-pages-${locale};${pageId}`;
}

function getProductPageHref(pageId: string) {
  return `/structure/product-pages;productPage;${pageId}`;
}

function isShopifyReady(product: ProductSummary) {
  return Boolean(product.shopifyProductGid && product.shopifyHandle);
}

function getMappingCheckTone(status?: MappingCheckStatus): 'caution' | 'critical' | 'default' | 'positive' {
  switch (status) {
    case 'current':
      return 'positive';
    case 'stale':
      return 'critical';
    case 'unavailable':
    case 'error':
      return 'critical';
    case 'checking':
    default:
      return 'default';
  }
}

function isMappingIssue(check?: ShopifyMappingCheck) {
  return check?.status === 'error' || check?.status === 'stale' || check?.status === 'unavailable';
}

function normalizeStringArray(value?: string[]) {
  return Array.isArray(value) ? value : [];
}

function stringArraysEqual(left?: string[], right?: string[]) {
  const normalizedLeft = normalizeStringArray(left);
  const normalizedRight = normalizeStringArray(right);

  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

function getShopifySummaryMismatches(
  current: ShopifySummarySnapshot,
  latest: ShopifySummaryFields,
  label: string,
) {
  const mismatches: string[] = [];

  if (current.shopifyProductGid !== latest.shopifyProductGid) mismatches.push(`${label} GID`);
  if (current.shopifyHandle !== latest.shopifyHandle) mismatches.push(`${label} handle`);
  if (current.shopifyStatus !== latest.shopifyStatus) mismatches.push(`${label} 可售快照`);
  if (current.shopifyTitle !== latest.shopifyTitle) mismatches.push(`${label} 商品名`);
  if (current.shopifyAdminUrl !== latest.shopifyAdminUrl) mismatches.push(`${label} Admin 链接`);
  if (!stringArraysEqual(current.shopifyImageSummary, latest.shopifyImageSummary)) {
    mismatches.push(`${label} 图片摘要`);
  }
  if (!stringArraysEqual(current.shopifyVariantSummary, latest.shopifyVariantSummary)) {
    mismatches.push(`${label} 变体摘要`);
  }

  return mismatches;
}

function getProductMappingMismatches(product: ProductSummary, latest: ShopifySummaryFields) {
  return getShopifySummaryMismatches(product, latest, '商品主档');
}

function getProductStats(product: ProductSummary): ProductStats {
  const pages = product.languagePages ?? [];

  return {
    archivedLanguages: pages.filter((page) => page.launchStatus === 'archived').length,
    draftLanguages: pages.filter((page) => page.launchStatus === 'draft').length,
    existingLanguages: pages.length,
    liveLanguages: pages.filter((page) => page.launchStatus === 'live').length,
    missingLanguages: Math.max(0, supportedLocales.length - pages.length),
    readyLanguages: pages.filter((page) => page.launchStatus === 'ready').length,
  };
}

function getProductTitle(product: ProductSummary) {
  return product.shopifyTitle || product.shopifyHandle || '未命名商品';
}

function getRecycleBinTitle(entry: ProductRecycleBinEntry) {
  return entry.productTitle || entry.productHandle || entry.productPageId || '未命名删除记录';
}

function getSnapshotDocument(snapshot: ProductSnapshotSummary) {
  if (!snapshot.snapshotJson) {
    throw new Error(`回收站记录缺少文档快照：${snapshot.documentId ?? '未知文档'}`);
  }

  return JSON.parse(snapshot.snapshotJson) as DeletableDocument;
}

function stripSystemFields(document: DeletableDocument) {
  const { _createdAt, _rev, _updatedAt, ...restoredDocument } = document;

  return restoredDocument;
}

function createSnapshot(document: DeletableDocument) {
  return {
    documentId: document._id,
    snapshotJson: JSON.stringify(stripSystemFields(document)),
  };
}

function createLocaleSnapshot(document: DeletableDocument) {
  return {
    ...createSnapshot(document),
    launchStatus: document.launchStatus,
    locale: document.locale,
    name: document.name,
    slug: document.slug?.current,
  };
}

function createSnapshotKey(documentId: string) {
  return documentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function productMatchesSearch(product: ProductSummary, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const haystack = [
    product.shopifyTitle,
    product.shopifyHandle,
    product.productStatus,
    product.shopifyStatus,
    ...(product.languagePages ?? []).flatMap((page) => [page.name, page.slug, page.locale, page.launchStatus]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function recycleBinEntryMatchesSearch(entry: ProductRecycleBinEntry, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const haystack = [
    entry.productTitle,
    entry.productHandle,
    entry.productPageId,
    entry.restoreStatus,
    ...(entry.localeSnapshots ?? []).flatMap((snapshot) => [
      snapshot.documentId,
      snapshot.locale,
      snapshot.name,
      snapshot.slug,
      snapshot.launchStatus,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function productMatchesFilter(product: ProductSummary, filter: ProductFilter, mappingCheck?: ShopifyMappingCheck) {
  const stats = getProductStats(product);
  const archived = product.productStatus === 'archived';

  switch (filter) {
    case 'active':
      return !archived;
    case 'live':
      return !archived && stats.liveLanguages > 0;
    case 'needs-work':
      return !archived && (stats.missingLanguages > 0 || stats.draftLanguages > 0 || stats.readyLanguages > 0);
    case 'drafts':
      return !archived && (stats.draftLanguages > 0 || stats.readyLanguages > 0);
    case 'shopify-issue':
      return !isShopifyReady(product) || isMappingIssue(mappingCheck);
    case 'archived':
      return archived;
    case 'recycle-bin':
      return false;
    case 'all':
      return true;
    default:
      return true;
  }
}

function getStatusSummary(product: ProductSummary) {
  const stats = getProductStats(product);
  const parts = [
    `${stats.liveLanguages} 个语言上线`,
    stats.readyLanguages ? `${stats.readyLanguages} 个就绪` : undefined,
    stats.draftLanguages ? `${stats.draftLanguages} 个草稿` : undefined,
    stats.archivedLanguages ? `${stats.archivedLanguages} 个语言归档` : undefined,
    stats.missingLanguages ? `${stats.missingLanguages} 个未创建` : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || '暂无语言页';
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card padding={3} radius={2} tone="transparent">
      <Stack space={2}>
        <Text muted size={1}>{label}</Text>
        <Heading size={2}>{value}</Heading>
      </Stack>
    </Card>
  );
}

function ProductLanguageRow({
  isMutating,
  locale,
  onSetLanguageStatus,
  page,
  productArchived,
}: {
  isMutating: boolean;
  locale: (typeof supportedLocales)[number];
  onSetLanguageStatus: (page: LanguagePageSummary, status: LaunchStatus) => void;
  page?: LanguagePageSummary;
  productArchived: boolean;
}) {
  return (
    <Flex align="center" justify="space-between" gap={3} wrap="wrap">
      <Stack space={1}>
        <Inline space={2}>
          <Text size={1} weight="semibold">{locale.title}</Text>
          {page?.launchStatus ? (
            <Badge tone={productArchived ? 'default' : launchStatusTone[page.launchStatus]}>
              {productArchived && page.launchStatus === 'live' ? '商品已归档' : launchStatusTitle[page.launchStatus]}
            </Badge>
          ) : (
            <Badge tone="caution">未创建</Badge>
          )}
        </Inline>
        <Text muted size={1}>
          {page?.name ? `${page.name} / ${page.slug ?? '未设置 slug'}` : '通过商品上线向导补齐该语言页面'}
        </Text>
      </Stack>
      <Inline space={2}>
        {page ? (
          <Button
            as="a"
            href={getLanguagePageHref(locale.id, page._id)}
            mode="ghost"
            text="编辑"
          />
        ) : null}
        {page?.launchStatus === 'live' ? (
          <Button
            disabled={isMutating}
            mode="ghost"
            onClick={() => onSetLanguageStatus(page, 'archived')}
            text="下线语言"
            tone="caution"
          />
        ) : null}
        {page?.launchStatus === 'archived' ? (
          <Button
            disabled={isMutating}
            mode="ghost"
            onClick={() => onSetLanguageStatus(page, 'draft')}
            text="回到草稿"
            tone="primary"
          />
        ) : null}
      </Inline>
    </Flex>
  );
}

function ProductRow({
  isMutating,
  mappingCheck,
  onDeleteProduct,
  onSetLanguageStatus,
  onSetProductStatus,
  onSyncShopifyMapping,
  product,
}: {
  isMutating: boolean;
  mappingCheck?: ShopifyMappingCheck;
  onDeleteProduct: (product: ProductSummary) => void;
  onSetLanguageStatus: (page: LanguagePageSummary, status: LaunchStatus) => void;
  onSetProductStatus: (product: ProductSummary, status: ProductStatus) => void;
  onSyncShopifyMapping: (product: ProductSummary) => void;
  product: ProductSummary;
}) {
  const archived = product.productStatus === 'archived';
  const shopifyReady = isShopifyReady(product);
  const mappingCheckStatus = mappingCheck?.status ?? 'checking';
  const mappingCheckTitle = mappingCheck?.title ?? '正在检测映射';

  return (
    <Card padding={4} radius={2} shadow={1} tone={archived ? 'transparent' : 'default'}>
      <Stack space={4}>
        <Flex align="flex-start" justify="space-between" gap={4} wrap="wrap">
          <Stack space={2}>
            <Heading size={2}>{getProductTitle(product)}</Heading>
            <Inline space={2}>
              <Text muted size={1}>{product.shopifyHandle || '未关联 Shopify handle'}</Text>
              <Text muted size={1}>{getStatusSummary(product)}</Text>
            </Inline>
          </Stack>
          <Inline space={2}>
            <Badge tone={archived ? 'default' : 'positive'}>
              {archived ? '商品已归档' : '商品运营中'}
            </Badge>
            <Badge tone={shopifyReady ? 'positive' : 'caution'}>
              {shopifyReady ? 'Shopify 可读取' : 'Shopify 不可读取'}
            </Badge>
            <Badge tone={getMappingCheckTone(mappingCheckStatus)}>
              {mappingCheckTitle}
            </Badge>
          </Inline>
        </Flex>

        {mappingCheckStatus === 'stale' ? (
          <Card padding={3} radius={2} tone="critical">
            <Stack space={2}>
              <Text size={1} weight="semibold">Shopify 映射需同步。</Text>
              <Text muted size={1}>
                检测到 {mappingCheck?.mismatches?.slice(0, 4).join('、') || '只读摘要'} 与 Shopify 当前商品不一致。点击“同步 Shopify 映射”即可更新只读摘要。
              </Text>
            </Stack>
          </Card>
        ) : null}

        {mappingCheckStatus === 'unavailable' || mappingCheckStatus === 'error' ? (
          <Card padding={3} radius={2} tone="critical">
            <Text size={1}>
              {mappingCheck?.mismatches?.[0] || '无法读取 Shopify 当前商品。请检查商品是否仍发布到 Headless channel。'}
            </Text>
          </Card>
        ) : null}

        {archived ? (
          <Card padding={3} radius={2} tone="caution">
            <Text size={1}>该商品已从前台整体移除。取消归档后，会沿用各语言页原有的上线、草稿或归档状态。</Text>
          </Card>
        ) : null}

        <Stack space={3}>
          {supportedLocales.map((locale) => (
            <ProductLanguageRow
              key={locale.id}
              isMutating={isMutating}
              locale={locale}
              onSetLanguageStatus={onSetLanguageStatus}
              page={getLanguagePage(product, locale.id)}
              productArchived={archived}
            />
          ))}
        </Stack>

        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Inline space={3}>
            <Button
              as="a"
              href={getProductPageHref(product._id)}
              mode="ghost"
              text="查看商品主档"
            />
            <Button
              disabled={isMutating || (!product.shopifyProductGid && !product.shopifyHandle)}
              mode="ghost"
              onClick={() => onSyncShopifyMapping(product)}
              text="同步 Shopify 映射"
            />
            {product.shopifyAdminUrl ? (
              <Button
                as="a"
                href={product.shopifyAdminUrl}
                mode="ghost"
                target="_blank"
                text="打开 Shopify"
              />
            ) : null}
          </Inline>
          {archived ? (
            <Inline space={2}>
              <Button
                disabled={isMutating}
                onClick={() => onSetProductStatus(product, 'active')}
                text="取消归档"
                tone="primary"
              />
              <Button
                disabled={isMutating}
                mode="ghost"
                onClick={() => onDeleteProduct(product)}
                text="删除整档"
                tone="critical"
              />
            </Inline>
          ) : (
            <Button
              disabled={isMutating}
              mode="ghost"
              onClick={() => onSetProductStatus(product, 'archived')}
              text="归档整个商品"
              tone="caution"
            />
          )}
        </Flex>
      </Stack>
    </Card>
  );
}

function ProductRecycleBinRow({
  entry,
  isMutating,
  onRestoreProduct,
}: {
  entry: ProductRecycleBinEntry;
  isMutating: boolean;
  onRestoreProduct: (entry: ProductRecycleBinEntry) => void;
}) {
  const languageCount = entry.localeSnapshots?.length ?? 0;

  return (
    <Card padding={4} radius={2} shadow={1} tone="caution">
      <Stack space={4}>
        <Flex align="flex-start" justify="space-between" gap={4} wrap="wrap">
          <Stack space={2}>
            <Heading size={2}>{getRecycleBinTitle(entry)}</Heading>
            <Inline space={2}>
              <Text muted size={1}>{entry.productHandle || entry.productPageId || '未记录 handle'}</Text>
              <Text muted size={1}>{languageCount} 个语言页回收站副本</Text>
            </Inline>
          </Stack>
          <Badge tone={entry.restoreStatus === 'restored' ? 'positive' : 'caution'}>
            {entry.restoreStatus === 'restored' ? '已还原' : '回收站'}
          </Badge>
        </Flex>

        <Stack space={2}>
          <Text size={1}>删除时间：{entry.deletedAt ?? '未记录'}</Text>
          {entry.localeSnapshots?.length ? (
            <Text muted size={1}>
              语言页：{entry.localeSnapshots.map((snapshot) => `${snapshot.locale ?? '未知'} / ${snapshot.name ?? snapshot.slug ?? snapshot.documentId}`).join('；')}
            </Text>
          ) : null}
          <Text muted size={1}>
            还原会尝试按回收站副本重建商品主档和语言页；如果同 ID 文档已存在，不会覆盖现有内容。该副本不是 Production Backup 或 Disaster Recovery Restore，也不构成恢复保证。
          </Text>
        </Stack>

        <Flex justify="flex-end">
          <Button
            disabled={isMutating || entry.restoreStatus === 'restored'}
            onClick={() => onRestoreProduct(entry)}
            text={entry.restoreStatus === 'restored' ? '已还原' : '从回收站还原'}
            tone="primary"
          />
        </Flex>
      </Stack>
    </Card>
  );
}

export function ProductOperationsTool() {
  const client = useClient({ apiVersion });
  const toast = useToast();
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<ProductFilter>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [mappingChecks, setMappingChecks] = useState<Record<string, ShopifyMappingCheck>>({});
  const [mutatingId, setMutatingId] = useState<string | undefined>();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [query, setQuery] = useState('');
  const [recycleBinEntries, setRecycleBinEntries] = useState<ProductRecycleBinEntry[]>([]);

  const detectShopifyMappings = useCallback(async (productsToCheck: ProductSummary[]) => {
    if (productsToCheck.length === 0) {
      setMappingChecks({});
      return;
    }

    setMappingChecks(
      Object.fromEntries(
        productsToCheck.map((product) => [
          product._id,
          {
            status: 'checking',
            title: '正在检测映射',
          } satisfies ShopifyMappingCheck,
        ]),
      ),
    );

    let config: ReturnType<typeof getShopifyStorefrontConfig>;

    try {
      config = getShopifyStorefrontConfig();
    } catch (configError) {
      const message = configError instanceof Error ? configError.message : String(configError);

      setMappingChecks(
        Object.fromEntries(
          productsToCheck.map((product) => [
            product._id,
            {
              checkedAt: new Date().toISOString(),
              mismatches: [message],
              status: 'error',
              title: '检测失败',
            } satisfies ShopifyMappingCheck,
          ]),
        ),
      );
      return;
    }

    const checkedAt = new Date().toISOString();
    const entries = await Promise.all(
      productsToCheck.map(async (product): Promise<[string, ShopifyMappingCheck]> => {
        if (!product.shopifyProductGid && !product.shopifyHandle) {
          return [
            product._id,
            {
              checkedAt,
              mismatches: ['缺少 Shopify Product GID 和 handle。请使用商品上线向导补齐映射。'],
              status: 'unavailable',
              title: 'Shopify 不可读取',
            },
          ];
        }

        try {
          const shopifyProduct = await fetchShopifyProductByGidOrHandle({
            handle: product.shopifyHandle,
            productGid: product.shopifyProductGid,
          });

          if (!shopifyProduct) {
            return [
              product._id,
              {
                checkedAt,
                mismatches: ['Shopify 当前商品不可读取。请检查商品是否仍发布到 Headless channel。'],
                status: 'unavailable',
                title: 'Shopify 不可读取',
              },
            ];
          }

          const latestSummary = createProductPageShopifySummary(shopifyProduct, config.storeDomain);
          const mismatches = getProductMappingMismatches(product, latestSummary);

          return [
            product._id,
            {
              checkedAt,
              mismatches,
              status: mismatches.length > 0 ? 'stale' : 'current',
              title: mismatches.length > 0 ? '映射需同步' : '映射最新',
            },
          ];
        } catch (checkError) {
          return [
            product._id,
            {
              checkedAt,
              mismatches: [checkError instanceof Error ? checkError.message : String(checkError)],
              status: 'error',
              title: '检测失败',
            },
          ];
        }
      }),
    );

    setMappingChecks(Object.fromEntries(entries));
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const [result, recycleBinResult] = await Promise.all([
        client.withConfig({ perspective: 'raw' }).fetch<ProductSummary[]>(`
        *[_type == "productPage" && !(_id in path("drafts.**"))] | order(coalesce(roadmapOrder, 999) asc, lower(coalesce(shopifyTitle, shopifyHandle)) asc) {
          _id,
          _updatedAt,
          productStatus,
          shopifyAdminUrl,
          shopifyHandle,
          shopifyImageSummary,
          shopifyProductGid,
          shopifyStatus,
          shopifyTitle,
          shopifyVariantSummary,
          "languagePages": *[_type == "productLocalePage" && !(_id in path("drafts.**")) && productPage._ref == ^._id] | order(locale asc) {
            _id,
            _updatedAt,
            launchStatus,
            locale,
            name,
            "slug": slug.current
          }
        }
        `),
        client.withConfig({ perspective: 'raw' }).fetch<ProductRecycleBinEntry[]>(`
          *[_type == "productRecycleBinEntry"] | order(deletedAt desc) {
            _id,
            deletedAt,
            localeSnapshots[] {
              documentId,
              launchStatus,
              locale,
              name,
              slug,
              snapshotJson
            },
            productHandle,
            productPageId,
            productSnapshots[] {
              documentId,
              snapshotJson
            },
            productTitle,
            restoreStatus,
            restoredAt
          }
        `),
      ]);

      setProducts(result);
      setRecycleBinEntries(recycleBinResult);
      void detectShopifyMappings(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [client, detectShopifyMappings]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const visibleProducts = useMemo(
    () => products.filter((product) =>
      productMatchesFilter(product, filter, mappingChecks[product._id]) && productMatchesSearch(product, query),
    ),
    [filter, mappingChecks, products, query],
  );
  const visibleRecycleBinEntries = useMemo(
    () => recycleBinEntries.filter((entry) =>
      entry.restoreStatus !== 'restored' && recycleBinEntryMatchesSearch(entry, query),
    ),
    [query, recycleBinEntries],
  );
  const activeCount = products.filter((product) => product.productStatus !== 'archived').length;
  const archivedCount = products.filter((product) => product.productStatus === 'archived').length;
  const liveCount = products.filter((product) => product.productStatus !== 'archived' && getProductStats(product).liveLanguages > 0).length;
  const issueCount = products.filter((product) => !isShopifyReady(product) || isMappingIssue(mappingChecks[product._id])).length;
  const recycleBinCount = recycleBinEntries.filter((entry) => entry.restoreStatus !== 'restored').length;
  const currentFilter = filterOptions.find((option) => option.value === filter) ?? filterOptions[0];
  const isMutating = Boolean(mutatingId);
  const currentVisibleCount = filter === 'recycle-bin' ? visibleRecycleBinEntries.length : visibleProducts.length;
  const currentTotalCount = filter === 'recycle-bin' ? recycleBinCount : products.length;

  const showError = useCallback((operationError: unknown) => {
    const message = operationError instanceof Error ? operationError.message : String(operationError);

    setError(message);
    toast.push({
      closable: true,
      description: message,
      status: 'error',
      title: '操作失败',
    });
  }, [toast]);

  const setProductStatus = useCallback(async (product: ProductSummary, nextStatus: ProductStatus) => {
    if (nextStatus === 'archived') {
      const confirmed = window.confirm(
        `确认归档「${getProductTitle(product)}」？\n\n归档后整个商品会从前台构建中移除，但不会删除任何语言内容，也不会修改 Shopify 商品。`,
      );

      if (!confirmed) return;
    }

    setMutatingId(product._id);

    try {
      await client.patch(product._id).set({ productStatus: nextStatus }).commit();
      toast.push({
        status: 'success',
        title: nextStatus === 'archived' ? '商品已归档' : '商品已恢复',
      });
      await loadProducts();
    } catch (operationError) {
      showError(operationError);
    } finally {
      setMutatingId(undefined);
    }
  }, [client, loadProducts, showError, toast]);

  const setLanguageStatus = useCallback(async (page: LanguagePageSummary, nextStatus: LaunchStatus) => {
    if (nextStatus === 'archived') {
      const confirmed = window.confirm(
        `确认下线「${page.name ?? page.slug ?? page.locale}」？\n\n该语言页会从前台构建中移除，但内容会保留，可恢复为草稿后继续编辑。`,
      );

      if (!confirmed) return;
    }

    setMutatingId(page._id);

    try {
      await client.patch(page._id).set({ launchStatus: nextStatus }).commit();
      toast.push({
        status: 'success',
        title: nextStatus === 'archived' ? '语言页已下线' : '语言页已恢复为草稿',
      });
      await loadProducts();
    } catch (operationError) {
      showError(operationError);
    } finally {
      setMutatingId(undefined);
    }
  }, [client, loadProducts, showError, toast]);

  const deleteWholeProduct = useCallback(async (product: ProductSummary) => {
    if (product.productStatus !== 'archived') {
      toast.push({
        description: '为了降低误删风险，请先归档整个商品，再执行整档删除。',
        status: 'warning',
        title: '请先归档商品',
      });
      return;
    }

    const confirmToken = product.shopifyHandle || product._id;
    const input = window.prompt(
      `这是管理员危险操作，会删除「${getProductTitle(product)}」的商品主档和所有语言页。\n\n删除前会创建尽力还原用的回收站副本；它不是生产备份，也不构成恢复保证。\n\n请输入商品 handle 确认：${confirmToken}`,
    );

    if (input !== confirmToken) {
      toast.push({
        description: '确认口令不匹配，未删除任何内容。',
        status: 'warning',
        title: '整档删除已取消',
      });
      return;
    }

    setMutatingId(product._id);

    try {
      const productIds = [product._id, `drafts.${product._id}`];
      const { languagePages, productPages } = await client.withConfig({ perspective: 'raw' }).fetch<{
        languagePages: DeletableDocument[];
        productPages: DeletableDocument[];
      }>(
        `{
          "productPages": *[_id in $productIds],
          "languagePages": *[_type == "productLocalePage" && productPage._ref in $productIds] | order(locale asc, _id asc)
        }`,
        { productIds },
      );

      if (!productPages.length) {
        throw new Error(`没有找到商品主档，无法删除：${product._id}`);
      }

      const now = new Date().toISOString();
      const recycleBinEntry = {
        _id: `productRecycleBinEntry.${confirmToken}.${Date.now()}`,
        _type: 'productRecycleBinEntry',
        confirmToken,
        deletedAt: now,
        deletedBy: 'Sanity Studio 商品工作台',
        localeSnapshots: languagePages.map((document) => ({
          _key: createSnapshotKey(document._id),
          ...createLocaleSnapshot(document),
        })),
        productHandle: product.shopifyHandle,
        productPageId: product._id,
        productSnapshots: productPages.map((document) => ({
          _key: createSnapshotKey(document._id),
          ...createSnapshot(document),
        })),
        productTitle: getProductTitle(product),
        restoreStatus: 'deleted',
      };

      let transaction = client.transaction().create(recycleBinEntry);

      for (const document of languagePages) {
        transaction = transaction.delete(document._id);
      }

      for (const document of productPages) {
        transaction = transaction.delete(document._id);
      }

      await transaction.commit({ visibility: 'sync' });
      toast.push({
        description: '已创建回收站副本，并删除商品主档和关联语言页。该副本不构成恢复保证。',
        status: 'success',
        title: '整档删除完成',
      });
      setFilter('recycle-bin');
      await loadProducts();
    } catch (operationError) {
      showError(operationError);
    } finally {
      setMutatingId(undefined);
    }
  }, [client, loadProducts, showError, toast]);

  const restoreDeletedProduct = useCallback(async (entry: ProductRecycleBinEntry) => {
    const confirmed = window.confirm(
      `确认从回收站还原「${getRecycleBinTitle(entry)}」？\n\n系统会尝试按回收站副本重建商品主档和语言页；如果同 ID 文档已存在，不会覆盖现有内容。`,
    );

    if (!confirmed) return;

    setMutatingId(entry._id);

    try {
      const productDocuments = (entry.productSnapshots ?? []).map(getSnapshotDocument);
      const localeDocuments = (entry.localeSnapshots ?? []).map(getSnapshotDocument);

      if (productDocuments.length === 0) {
        throw new Error('回收站记录缺少商品主档快照，无法恢复。');
      }

      let transaction = client.transaction();

      for (const document of productDocuments) {
        transaction = transaction.createIfNotExists(document);
      }

      for (const document of localeDocuments) {
        transaction = transaction.createIfNotExists(document);
      }

      transaction = transaction.patch(entry._id, (patch) =>
        patch.set({
          restoreStatus: 'restored',
          restoredAt: new Date().toISOString(),
        }),
      );

      await transaction.commit({ visibility: 'sync' });
      toast.push({
        description: '已从回收站副本还原商品主档和语言页。',
        status: 'success',
        title: '整档还原完成',
      });
      setFilter('archived');
      await loadProducts();
    } catch (operationError) {
      showError(operationError);
    } finally {
      setMutatingId(undefined);
    }
  }, [client, loadProducts, showError, toast]);

  const syncShopifyMapping = useCallback(async (product: ProductSummary) => {
    setMutatingId(product._id);

    try {
      const config = getShopifyStorefrontConfig();
      const shopifyProduct = await fetchShopifyProductByGidOrHandle({
        handle: product.shopifyHandle,
        productGid: product.shopifyProductGid,
      });

      if (!shopifyProduct) {
        throw new Error(
          product.shopifyProductGid
            ? `Shopify GID 不可读取：${product.shopifyProductGid}。请确认商品仍发布到 Headless channel。`
            : `Shopify handle 不可读取：${product.shopifyHandle ?? '未设置'}。请先使用商品上线向导修正映射。`,
        );
      }

      const shopifySummary = createProductPageShopifySummary(shopifyProduct, config.storeDomain);
      const existingDocumentIds = await client.withConfig({ perspective: 'raw' }).fetch<string[]>(
        '*[_id in $ids]._id',
        { ids: [product._id] },
      );
      let transaction = client.transaction();

      if (existingDocumentIds.length === 0) {
        throw new Error(`没有找到可同步的 Sanity 商品文档：${product._id}`);
      }

      for (const documentId of existingDocumentIds) {
        transaction = transaction.patch(documentId, (patch) => patch.set(shopifySummary));
      }

      await transaction.commit({ visibility: 'sync' });
      toast.push({
        description: '只更新 Shopify 只读摘要，不会修改语言页名称、slug、SEO 或正文。',
        status: 'success',
        title: 'Shopify 映射已同步',
      });
      await loadProducts();
    } catch (operationError) {
      showError(operationError);
    } finally {
      setMutatingId(undefined);
    }
  }, [client, loadProducts, showError, toast]);

  return (
    <Box padding={4}>
      <Stack space={5}>
        <Flex align="center" justify="space-between" gap={4} wrap="wrap">
          <Stack space={2}>
            <Heading size={3}>商品工作台</Heading>
            <Text muted>客户日常维护入口：搜索商品、检查语言状态、归档或取消归档商品内容。删除不是日常运营动作。</Text>
          </Stack>
          <Button as="a" href="/product-launch" mode="ghost" text="打开商品上线向导" />
        </Flex>

        <Grid columns={[2, 5]} gap={3}>
          <StatCard label="运营中商品" value={activeCount} />
          <StatCard label="上线中商品" value={liveCount} />
          <StatCard label="已归档商品" value={archivedCount} />
          <StatCard label="Shopify 异常" value={issueCount} />
          <StatCard label="回收站" value={recycleBinCount} />
        </Grid>

        <Card padding={4} radius={2} shadow={1}>
          <Grid columns={[1, 1, 3]} gap={4}>
            <Stack space={2}>
              <Label size={1}>搜索</Label>
              <TextInput
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)}
                placeholder="商品名、handle、语言或状态"
                value={query}
              />
            </Stack>
            <Stack space={2}>
              <Label size={1}>视图</Label>
              <Select
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter(event.currentTarget.value as ProductFilter)}
                value={filter}
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.title}</option>
                ))}
              </Select>
            </Stack>
            <Stack space={2}>
              <Label size={1}>当前视图说明</Label>
              <Text muted size={1}>{currentFilter.description}</Text>
              <Text muted size={1}>当前显示 {currentVisibleCount} / {currentTotalCount} 条记录。</Text>
            </Stack>
          </Grid>
        </Card>

        {isLoading ? (
          <Flex align="center" gap={3}>
            <Spinner muted />
            <Text muted>正在读取商品页面...</Text>
          </Flex>
        ) : null}

        {error ? (
          <Card padding={4} radius={2} tone="critical">
            <Text>{error}</Text>
          </Card>
        ) : null}

        {!isLoading && !error && currentVisibleCount === 0 ? (
          <Card padding={4} radius={2} tone="caution">
            <Stack space={2}>
              <Text weight="semibold">没有符合条件的记录。</Text>
              <Text muted size={1}>
                {filter === 'recycle-bin'
                  ? '回收站为空。只有执行整档删除后，这里才会出现尽力还原用的回收站副本。'
                  : '可以切换到“全部”或“已归档”视图，或通过商品上线向导创建新的商品语言页面。'}
              </Text>
            </Stack>
          </Card>
        ) : null}

        {filter === 'recycle-bin' ? (
          <Stack space={4}>
            {visibleRecycleBinEntries.map((entry) => (
              <ProductRecycleBinRow
                key={entry._id}
                entry={entry}
                isMutating={isMutating}
                onRestoreProduct={restoreDeletedProduct}
              />
            ))}
          </Stack>
        ) : (
          <Stack space={4}>
            {visibleProducts.map((product) => (
            <ProductRow
              key={product._id}
              isMutating={isMutating}
              mappingCheck={mappingChecks[product._id]}
              onDeleteProduct={deleteWholeProduct}
              onSetLanguageStatus={setLanguageStatus}
              onSetProductStatus={setProductStatus}
              onSyncShopifyMapping={syncShopifyMapping}
              product={product}
            />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export default ProductOperationsTool;
