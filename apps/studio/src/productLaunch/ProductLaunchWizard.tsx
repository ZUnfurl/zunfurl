import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
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
  createProductPageDocument,
  createProductLocalePageDocument,
  createProductLocalePageSummaryPatch,
  createProductPageShopifySummary,
  getDraftId,
  getTemplateLocale,
  getProductLocalePageId,
  getProductPageId,
  supportedLocales,
  type LocaleId,
  type SanityProductLocalePageDocument,
  type SanityProductPageDocument,
  type ShopifyProductSummary,
} from './logic';
import { fetchShopifyProducts, getShopifyStorefrontConfig } from './shopify';

const apiVersion = '2026-06-20';
const blankTemplateValue = '__blank__';

interface TemplateOption {
  handle: string;
  locales: LocaleId[];
  title: string;
}

type StudioClient = ReturnType<typeof useClient>;

function getLocaleTitle(locale: LocaleId): string {
  return supportedLocales.find((option) => option.id === locale)?.title ?? locale;
}

function documentMap<TDocument extends { _id: string }>(documents: TDocument[]): Map<string, TDocument> {
  return new Map(documents.map((document) => [document._id, document]));
}

function getDraftAwareLookupIds(ids: string[]): string[] {
  return ids.flatMap((id) => [id, getDraftId(id)]);
}

function getExistingTargetIds<TDocument extends { _id: string }>(
  pageId: string,
  documentsById: Map<string, TDocument>,
): string[] {
  const draftId = getDraftId(pageId);
  const ids = [];

  if (documentsById.has(pageId)) ids.push(pageId);
  if (documentsById.has(draftId)) ids.push(draftId);

  return ids;
}

async function fetchDocuments<TDocument extends { _id: string }>(
  client: StudioClient,
  ids: string[],
): Promise<TDocument[]> {
  if (ids.length === 0) return [];

  return client
    .withConfig({ perspective: 'raw' })
    .fetch('*[_id in $ids] | order(_id asc)', { ids });
}

async function fetchTemplateOptions(client: StudioClient): Promise<TemplateOption[]> {
  const pages = await client.withConfig({ perspective: 'raw' }).fetch<Array<{
    handle?: string;
    locales?: LocaleId[];
    title?: string;
  }>>(
    `*[_type == "productPage" && !(_id in path("drafts.**")) && defined(shopifyHandle)] | order(shopifyTitle asc){
      "handle": shopifyHandle,
      "title": coalesce(shopifyTitle, shopifyHandle),
      "locales": *[_type == "productLocalePage" && !(_id in path("drafts.**")) && productPage._ref == ^._id].locale
    }`,
  );

  return pages
    .filter((page) => page.handle)
    .map((page) => ({
      handle: page.handle as string,
      locales: page.locales ?? [],
      title: page.title || page.handle as string,
    }));
}

function ProductCard({
  isSelected,
  onSelect,
  product,
}: {
  isSelected: boolean;
  onSelect: () => void;
  product: ShopifyProductSummary;
}) {
  return (
    <Card
      as="button"
      padding={3}
      radius={2}
      shadow={isSelected ? 2 : 1}
      tone={isSelected ? 'primary' : 'default'}
      type="button"
      onClick={onSelect}
      style={{
        border: isSelected ? '1px solid var(--card-border-color)' : '1px solid transparent',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <Flex gap={3} align="center">
        <Box
          style={{
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 6,
            flex: '0 0 64px',
            height: 64,
            overflow: 'hidden',
            width: 64,
          }}
        >
          {product.featuredImage?.url ? (
            <img
              alt={product.featuredImage.altText || product.title}
              src={product.featuredImage.url}
              style={{ height: '100%', objectFit: 'cover', width: '100%' }}
            />
          ) : null}
        </Box>
        <Stack space={2} flex={1}>
          <Text weight="semibold">{product.title}</Text>
          <Text muted size={1}>
            {product.handle}
          </Text>
          <Inline space={2}>
            <Badge tone={product.availableForSale ? 'positive' : 'caution'}>
              {product.availableForSale ? '当前可售（仅提示）' : '当前不可售（不阻断内容上线）'}
            </Badge>
            {isSelected ? <Badge tone="primary">已选择</Badge> : null}
          </Inline>
        </Stack>
      </Flex>
    </Card>
  );
}

export function ProductLaunchWizard() {
  const client = useClient({ apiVersion });
  const toast = useToast();
  const [products, setProducts] = useState<ShopifyProductSummary[]>([]);
  const [selectedHandle, setSelectedHandle] = useState('');
  const [selectedLocales, setSelectedLocales] = useState<LocaleId[]>(['en']);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateHandle, setTemplateHandle] = useState(blankTemplateValue);
  const [search, setSearch] = useState('');
  const [statusText, setStatusText] = useState('选择 Shopify 商品、发布语言和内容模板后创建商品语言页面草稿。');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.handle === selectedHandle),
    [products, selectedHandle],
  );
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.handle === templateHandle),
    [templateHandle, templates],
  );
  const canMutate = Boolean(selectedProduct && selectedLocales.length > 0 && !isMutating);

  const showError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    setStatusText(message);
    toast.push({
      closable: true,
      status: 'error',
      title: '操作失败',
      description: message,
    });
  }, [toast]);

  const loadTemplates = useCallback(async () => {
    const options = await fetchTemplateOptions(client);

    setTemplates(options);
  }, [client]);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setStatusText('正在读取 Shopify 商品列表...');

    try {
      getShopifyStorefrontConfig();
      const shopifyProducts = await fetchShopifyProducts({
        first: 30,
        search: search.trim() || undefined,
      });

      setProducts(shopifyProducts);
      setSelectedHandle((current) => {
        if (current && shopifyProducts.some((product) => product.handle === current)) {
          return current;
        }

        return shopifyProducts[0]?.handle ?? '';
      });
      setStatusText(`已读取 ${shopifyProducts.length} 个 Shopify 商品。`);
    } catch (error) {
      showError(error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [search, showError]);

  useEffect(() => {
    loadTemplates().catch(showError);
  }, [loadTemplates, showError]);

  const toggleLocale = useCallback((locale: LocaleId) => {
    setSelectedLocales((current) => {
      if (current.includes(locale)) {
        return current.filter((value) => value !== locale);
      }

      return [...current, locale];
    });
  }, []);

  const createDraftsAndSync = useCallback(async () => {
    if (!selectedProduct) return;

    setIsMutating(true);
    setStatusText('正在创建或补齐商品主档和语言页面，并同步 Shopify 只读映射...');

    try {
      const config = getShopifyStorefrontConfig();
      const shopifySummary = createProductPageShopifySummary(selectedProduct, config.storeDomain);
      const pageId = getProductPageId(selectedProduct.handle);
      const localePageIds = selectedLocales.map((locale) => getProductLocalePageId(locale, selectedProduct.handle));
      const templateId = templateHandle === blankTemplateValue ? undefined : getProductPageId(templateHandle);
      const documents = await fetchDocuments<SanityProductPageDocument>(client, getDraftAwareLookupIds([pageId]));
      const localeDocuments = await fetchDocuments<SanityProductLocalePageDocument>(
        client,
        getDraftAwareLookupIds(localePageIds),
      );
      const templateDocuments = templateId ? await fetchDocuments<SanityProductPageDocument>(client, [templateId]) : [];
      const templateLocaleDocuments = templateHandle === blankTemplateValue
        ? []
        : await fetchDocuments<SanityProductLocalePageDocument>(
            client,
            selectedLocales.map((locale) => getProductLocalePageId(locale, templateHandle)),
          );
      const documentsById = documentMap(documents);
      const localeDocumentsById = documentMap(localeDocuments);
      const templatePage = templateDocuments[0];
      const existingTargetIds = getExistingTargetIds(pageId, documentsById);
      let transaction = client.transaction();
      const created: string[] = [];
      const synced: string[] = [];

      if (existingTargetIds.length === 0) {
        transaction = transaction.create(createProductPageDocument({
          product: selectedProduct,
          shopifySummary,
          templatePage,
        }));
        created.push(pageId);
      } else {
        for (const targetId of existingTargetIds) {
          transaction = transaction.patch(targetId, (patch) => patch.set(shopifySummary));
          synced.push(targetId);
        }
      }

      for (const locale of selectedLocales) {
        const localePageId = getProductLocalePageId(locale, selectedProduct.handle);
        const existingLocalePageIds = getExistingTargetIds(localePageId, localeDocumentsById);

        if (existingLocalePageIds.length === 0) {
          transaction = transaction.create(createProductLocalePageDocument({
            locale,
            product: selectedProduct,
            shopifySummary,
            templateLocale: getTemplateLocale(templateLocaleDocuments, locale),
          }));
          created.push(localePageId);
          continue;
        }

        for (const targetId of existingLocalePageIds) {
          transaction = transaction.patch(targetId, (patch) =>
            patch.set(createProductLocalePageSummaryPatch(shopifySummary)),
          );
          synced.push(targetId);
        }
      }

      await transaction.commit({ visibility: 'sync' });
      await loadTemplates();

      setStatusText(`完成：创建 ${created.length} 个文档，同步 ${synced.length} 个文档。请到“商品工作台”编辑对应语言页面。`);
      toast.push({
        status: 'success',
        title: '商品语言页面已准备好',
        description: '客户可以进入商品工作台，直接编辑所选语言页面。',
      });
    } catch (error) {
      showError(error);
    } finally {
      setIsMutating(false);
    }
  }, [client, loadTemplates, selectedLocales, selectedProduct, showError, templateHandle, toast]);

  const syncShopifySummaryOnly = useCallback(async () => {
    if (!selectedProduct) return;

    setIsMutating(true);
    setStatusText('正在同步 Shopify 只读映射...');

    try {
      const config = getShopifyStorefrontConfig();
      const shopifySummary = createProductPageShopifySummary(selectedProduct, config.storeDomain);
      const pageId = getProductPageId(selectedProduct.handle);
      const localePageIds = selectedLocales.map((locale) => getProductLocalePageId(locale, selectedProduct.handle));
      const documents = await fetchDocuments<SanityProductPageDocument>(client, getDraftAwareLookupIds([pageId]));
      const localeDocuments = await fetchDocuments<SanityProductLocalePageDocument>(
        client,
        getDraftAwareLookupIds(localePageIds),
      );
      const documentsById = documentMap(documents);
      const localeDocumentsById = documentMap(localeDocuments);
      const targetIds = getExistingTargetIds(pageId, documentsById);
      let transaction = client.transaction();
      const synced: string[] = [];

      if (targetIds.length === 0) {
        throw new Error(`请先创建商品主档和语言页面：${pageId}`);
      }

      for (const targetId of targetIds) {
        transaction = transaction.patch(targetId, (patch) => patch.set(shopifySummary));
        synced.push(targetId);
      }

      for (const localePageId of localePageIds) {
        for (const targetId of getExistingTargetIds(localePageId, localeDocumentsById)) {
          transaction = transaction.patch(targetId, (patch) =>
            patch.set(createProductLocalePageSummaryPatch(shopifySummary)),
          );
          synced.push(targetId);
        }
      }

      await transaction.commit({ visibility: 'sync' });
      setStatusText(`完成：同步 ${synced.length} 个商品相关文档。`);
      toast.push({ status: 'success', title: 'Shopify 只读映射已同步' });
    } catch (error) {
      showError(error);
    } finally {
      setIsMutating(false);
    }
  }, [client, selectedProduct, showError, toast]);

  const markLive = useCallback(async () => {
    if (!selectedProduct) return;

    setIsMutating(true);
    setStatusText('正在设置所选语言为“上线”...');

    try {
      const pageId = getProductPageId(selectedProduct.handle);
      const localePageIds = selectedLocales.map((locale) => getProductLocalePageId(locale, selectedProduct.handle));
      const documents = await fetchDocuments<SanityProductPageDocument>(client, getDraftAwareLookupIds([pageId]));
      const localeDocuments = await fetchDocuments<SanityProductLocalePageDocument>(
        client,
        getDraftAwareLookupIds(localePageIds),
      );
      const documentsById = documentMap(documents);
      const localeDocumentsById = documentMap(localeDocuments);
      const targetIds = getExistingTargetIds(pageId, documentsById);
      let transaction = client.transaction();
      const updated: string[] = [];

      if (targetIds.length === 0) {
        throw new Error(`请先创建商品主档和语言页面：${pageId}`);
      }

      for (const targetId of targetIds) {
        const page = documentsById.get(targetId);

        if (!page) continue;

        if (!page.shopifyProductGid || !page.shopifyHandle) {
          throw new Error(`商品缺少 Shopify Product GID 或 handle：${targetId}`);
        }
      }

      for (const locale of selectedLocales) {
        const localePageId = getProductLocalePageId(locale, selectedProduct.handle);
        const existingLocalePageIds = getExistingTargetIds(localePageId, localeDocumentsById);

        if (existingLocalePageIds.length === 0) {
          throw new Error(`请先创建 ${getLocaleTitle(locale)} 商品语言页面。`);
        }

        for (const targetId of existingLocalePageIds) {
          const page = localeDocumentsById.get(targetId);

          if (!page?.shopifyProductGid || !page?.shopifyHandle) {
            throw new Error(`商品语言页面缺少 Shopify Product GID 或 handle：${targetId}`);
          }

          transaction = transaction.patch(targetId, (patch) => patch.set({ launchStatus: 'live' }));
          updated.push(targetId);
        }
      }

      await transaction.commit({ visibility: 'sync' });
      setStatusText(`完成：${updated.length} 个商品相关文档已设置所选语言为“上线”。请检查后点击 Publish。`);
      toast.push({
        status: 'success',
        title: '上线状态已设置',
        description: '请进入商品工作台检查对应语言页面并 Publish。',
      });
    } catch (error) {
      showError(error);
    } finally {
      setIsMutating(false);
    }
  }, [client, selectedLocales, selectedProduct, showError, toast]);

  return (
    <Box padding={4}>
      <Stack space={5}>
        <Stack space={3}>
          <Heading size={3}>商品上线向导</Heading>
          <Text muted>
            客户在这里选择 Shopify 商品、发布语言和内容模板。向导会维护一个商品主档和对应语言页面，并同步 Shopify 只读映射，不会写入价格、SKU、库存、订单或支付数据。
          </Text>
        </Stack>

        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Heading size={2}>1. 选择 Shopify 商品</Heading>
            <Flex gap={3} align="center">
              <Box flex={1}>
                <TextInput
                  aria-label="Shopify 商品搜索"
                  placeholder="按标题或 handle 搜索，留空读取最近商品"
                  value={search}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      loadProducts();
                    }
                  }}
                />
              </Box>
              <Button
                disabled={isLoadingProducts}
                mode="ghost"
                text={isLoadingProducts ? '读取中' : '刷新 Shopify 商品'}
                onClick={loadProducts}
              />
            </Flex>

            {isLoadingProducts ? (
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text muted>正在读取 Shopify Storefront API...</Text>
              </Flex>
            ) : null}

            {products.length > 0 ? (
              <Grid columns={[1, 1, 2, 3]} gap={3}>
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isSelected={product.handle === selectedHandle}
                    onSelect={() => setSelectedHandle(product.handle)}
                  />
                ))}
              </Grid>
            ) : (
              <Text muted>还没有读取商品。请点击“刷新 Shopify 商品”。</Text>
            )}
          </Stack>
        </Card>

        <Grid columns={[1, 1, 2]} gap={4}>
          <Card padding={4} radius={2} shadow={1}>
            <Stack space={4}>
              <Heading size={2}>2. 选择发布语言</Heading>
              <Stack space={3}>
                {supportedLocales.map((locale) => (
                  <Flex key={locale.id} align="center" gap={3}>
                    <Checkbox
                      checked={selectedLocales.includes(locale.id)}
                      id={`product-launch-locale-${locale.id}`}
                      onChange={() => toggleLocale(locale.id)}
                    />
                    <Label as="label" htmlFor={`product-launch-locale-${locale.id}`}>
                      {locale.title}
                    </Label>
                  </Flex>
                ))}
              </Stack>
              <Text muted size={1}>
                只有勾选并设置为“上线”的语言会生成前台商品详情页。
              </Text>
            </Stack>
          </Card>

          <Card padding={4} radius={2} shadow={1}>
            <Stack space={4}>
              <Heading size={2}>3. 选择复制模板</Heading>
              <Select
                value={templateHandle}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setTemplateHandle(event.currentTarget.value)}
              >
                <option value={blankTemplateValue}>空白草稿</option>
                {templates.map((template) => (
                  <option key={template.handle} value={template.handle}>
                    {template.title} ({template.handle})
                  </option>
                ))}
              </Select>
              <Text muted size={1}>
                {selectedTemplate
                  ? `模板包含语言：${selectedTemplate.locales.map(getLocaleTitle).join('、')}。已存在的目标语言内容不会被覆盖。`
                  : '空白草稿会生成待编辑占位文案。'}
              </Text>
            </Stack>
          </Card>
        </Grid>

        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Heading size={2}>执行</Heading>
            <Inline space={3}>
              <Button
                disabled={!canMutate}
                text={isMutating ? '处理中' : '创建/补齐语言页面并同步映射'}
                tone="primary"
                onClick={createDraftsAndSync}
              />
              <Button
                disabled={!canMutate}
                mode="ghost"
                text="仅同步 Shopify 映射"
                onClick={syncShopifySummaryOnly}
              />
              <Button
                disabled={!canMutate}
                mode="ghost"
                text="设置所选语言为上线"
                tone="positive"
                onClick={markLive}
              />
            </Inline>
            <Card padding={3} radius={2} tone="transparent">
              <Text>{statusText}</Text>
            </Card>
            {selectedProduct ? (
              <Stack space={2}>
                <Text size={1} muted>
                  当前商品：{selectedProduct.title} / {selectedProduct.handle}
                </Text>
                <Text size={1} muted>
                  当前语言：{selectedLocales.map(getLocaleTitle).join('、') || '未选择'}
                </Text>
              </Stack>
            ) : null}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

export default ProductLaunchWizard;
