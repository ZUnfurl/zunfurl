import type { StructureResolver } from 'sanity/structure';
import { activeLocales, type SupportedLocale } from 'gcss-config';
import {
  getStudioPageKinds,
  isStudioContentCmsEnabled,
  isStudioProductCmsEnabled,
} from './studioProfile';

const localeCatalog: Array<{ id: SupportedLocale; title: string }> = [
  { id: 'en', title: 'English' },
  { id: 'fr', title: 'Français' },
  { id: 'zh-cn', title: '简体中文' },
];
const locales = localeCatalog.filter((locale) => activeLocales.includes(locale.id));

const pageKinds = getStudioPageKinds();

const launchStatuses = [
  { id: 'draft', title: '草稿' },
  { id: 'ready', title: '就绪' },
  { id: 'live', title: '上线' },
  { id: 'archived', title: '归档' },
];

const apiVersion = '2026-06-20';

export const structure: StructureResolver = (S) => {
  const contentCmsEnabled = isStudioContentCmsEnabled();
  const productCmsEnabled = isStudioProductCmsEnabled();

  if (!contentCmsEnabled && !productCmsEnabled) {
    return S.list()
      .title('GCSS 内容管理')
      .items([
        S.listItem()
          .id('profile-disabled')
          .title('当前 profile 未启用 Studio 内容管理'),
      ]);
  }

  return S.list()
    .title('GCSS 内容管理')
    .items([
      ...(contentCmsEnabled
        ? [
            S.listItem()
              .id('site')
              .title('站点设置')
              .child(
                S.list()
                  .id('site-list')
                  .title('站点设置')
                  .items([
                    S.documentTypeListItem('siteSettings').title('基础设置'),
                    S.documentTypeListItem('navigation').title('导航'),
                    S.documentTypeListItem('redirect').title('跳转规则'),
                  ]),
              ),
            S.divider(),
            S.listItem()
              .id('pages')
              .title('页面内容')
              .child(
                S.list()
                  .id('pages-list')
                  .title('页面内容')
                  .items(
                    locales.map((locale) =>
                      S.listItem()
                        .id(`pages-${locale.id}`)
                        .title(locale.title)
                        .child(
                          S.list()
                            .id(`pages-${locale.id}-list`)
                            .title(`${locale.title} 页面`)
                            .items(
                              pageKinds.map((page) =>
                                S.listItem()
                                  .id(`page-${locale.id}-${page.id}`)
                                  .title(page.title)
                                  .schemaType('page')
                                  .child(
                                    S.document()
                                      .schemaType('page')
                                      .documentId(`page.${locale.id}.${page.id}`)
                                      .title(`${locale.title} / ${page.title}`),
                                  ),
                              ),
                            ),
                        ),
                    ),
                  ),
              ),
          ]
        : []),
      ...(productCmsEnabled
        ? [
            S.listItem()
              .id('product-pages')
              .title('商品工作台')
              .child(
                S.list()
                  .id('product-pages-list')
                  .title('商品工作台')
                  .items([
                    S.documentTypeListItem('productPage').title('商品总览'),
                    S.documentTypeListItem('productLocalePage').title('全部语言页面'),
                    S.documentTypeListItem('productRecycleBinEntry').title('商品回收站记录'),
                    S.divider(),
                    ...launchStatuses.map((status) =>
                      S.listItem()
                        .id(`product-pages-${status.id}`)
                        .title(status.title)
                        .child(
                          S.documentList()
                            .id(`product-pages-${status.id}-list`)
                            .title(`${status.title}语言页面`)
                            .schemaType('productLocalePage')
                            .apiVersion(apiVersion)
                            .filter('_type == "productLocalePage" && launchStatus == $status')
                            .params({ status: status.id }),
                        ),
                    ),
                    S.divider(),
                    ...locales.map((locale) =>
                      S.listItem()
                        .id(`product-pages-${locale.id}`)
                        .title(locale.title)
                        .child(
                          S.documentList()
                            .id(`product-pages-${locale.id}-list`)
                            .title(`${locale.title} 商品语言页面`)
                            .schemaType('productLocalePage')
                            .apiVersion(apiVersion)
                            .filter('_type == "productLocalePage" && locale == $locale')
                            .params({ locale: locale.id }),
                        ),
                    ),
                  ]),
              ),
            S.divider(),
          ]
        : []),
      ...(contentCmsEnabled
        ? [S.documentTypeListItem('page').title('全部页面文档')]
        : []),
    ]);
};
