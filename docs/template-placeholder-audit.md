# 模板占位内容替换清单

本模板保留 `Example Brand` 与 `Example Product` 作为可运行示例。客户项目先通过 `gcss.project.json` 和受控初始化器完成机器配置，再人工完成以下内容替换。

前置条件：客户项目必须已按 [统一项目启动与完全交付规则](project-startup-and-handoff.md)，通过公开框架 Template repository 默认分支的 `Use this template` 创建到客户专属 GitHub Organization，并在 clone 后的客户 Private repository Codex 本地项目中执行。不要在框架 checkout、Fork、ZIP 或复制目录中直接替换客户内容。

## 必须替换

- `gcss.project.json` 中的品牌、域名、profile、语言、内容源、部署名称和可选模块。
- 当前 profile 所需的 Sanity、Shopify、Cloudflare、Resend、Turnstile、Worker 协调对象与 GitHub 平台资源。
- `apps/storefront/src/content/pages/**` 中的页面文案。
- `apps/storefront/src/content/product-pages/**` 和 `apps/storefront/src/content/product-locale-pages/**` 中的示例商品内容。
- `docs/legal/**` 中的法律实体、域名、邮箱和条款口径。
- `apps/storefront/public/brand-assets/**` 中的视觉资产。

## 按方案替换

### A1/A2 方案 `static-brand`

- 删除或忽略 Sanity、Shopify 和商品工作台相关客户手册；A1 关闭 Contact，A2 才配置表单服务。
- 将内容更新流程写成维护方托管。

### B 方案 `cms-brand`

- 保留 Sanity 页面 CMS。
- 删除或隐藏 Shopify、商品工作台、商品上线向导和商品法律销售条款中的交易细节。
- 如果启用 Contact 表单，配置 Resend、Turnstile、业务收件邮箱，并确认 Worker 协调对象 migration。

### C 方案 `retail`

- 配置 Shopify Storefront API。
- 配置商品上线向导和商品工作台。
- 根据客户实际商品、配送、退款、隐私和支付流程重写法律文档。

## 当前已处理

- 项目机器名已改为 `gcss-v3-site-framework`。
- workspace 包名已改为 `gcss-*`。
- 默认 profile 已改为 `cms-brand`。
- 示例品牌已文本替换为 `Example Brand`。
- 示例商品已文本替换为 `Example Product`。
- 迁移日计划和项目日志已从模板目录移除。
- 第二轮已将页面、商品详情和三语言 legal 输出改为中性框架占位内容。
- 第二轮已删除旧行业法律蓝本，只保留 `docs/legal/<lang>/` 下的最小占位 legal 包。
- 第三轮已新增 `init:project:dry-run`，用于在新项目替换前生成 profile、域名、Studio host、Worker name、env 和验证清单。
- 第三轮已新增 `template:scan` / `test:template`，用于扫描旧客户品牌词、旧商品词、旧域名和未归档的兼容字段。
- GitHub Actions 已接入 `test:template`，PR 验证和真实部署前都会检查模板残留。
- v0.2.0 已新增 `gcss.project.json` / schema、受控写入初始化器、`project:scan` 和 A1/A2/B/C 构建矩阵。
- 项目名、Studio、Worker、域名、语言和内容源已由统一配置派生，不再要求手工修改多份源码。
- 部署工作流会拒绝 `templateMode=true` 或 readiness 扫描未通过的客户项目。

## 当前仍保留

- `public/brand-assets` 中是已登记权利链的中性示例视觉资产，但仍必须替换为客户拥有或获准使用的素材。
- 少量历史字段名仍保留在显式兼容路径中，用于验证旧内容迁移和字段清理路径；`template:scan` 会限制它们不能扩散到普通模板内容。
- 法律文档是最小示例，不构成任何客户项目的正式法律意见。
