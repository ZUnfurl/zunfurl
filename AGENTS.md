# AGENTS.md

## 默认沟通

- 用户是中文用户，也是 Python 开发者。沟通、说明和文档优先中文；第三方 API、环境变量和协议字段保持英文。
- 默认 Windows 命令使用 `npm.cmd`。
- 默认静态优先、动态最小化。

## 项目边界

- 项目名保持 `gcss-v3-site-framework`，客户项目可从模板复制后改为自己的机器名。
- 机器名使用小写 kebab-case，不使用大写、点号、空格或下划线。
- 不做全站 SSR。
- 不引入常驻服务器。
- 不建设自定义 DAM、ERP、PIM、自建订单后台或自建 Checkout。
- C 零售目录与内容运营基础框架不提供 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存。
- 不把 R2 当日常图片库、公开 Bucket 或内容编辑入口。
- 不把价格、库存、SKU、订单、支付、履约状态写进 Sanity 或静态内容。
- 不让 Sanity 双向编辑 Shopify 主数据。
- 不让 Worker 代理全部 Shopify API、全部图片或承担长期业务存储。
- 不为库存、订单、购物车或普通价格变化触发整站重建。

## A/B/C Profile

- `static-brand`：A1/A2 静态品牌官网。不启用 Sanity、Shopify 或 Studio；A1 关闭真实表单 API，A2 显式启用最小 Contact Worker。
- `cms-brand`：B 方案，可自维护品牌官网。启用 Sanity 页面 CMS，不启用 Shopify 和商品 CMS；Contact 显式选择。
- `retail`：C 零售目录与内容运营基础框架（C Retail Catalog & Content Foundation）。启用 Sanity 页面与商品内容 CMS、Shopify 只读目录映射、商品工作台和商品上线向导；Contact 显式选择。

新项目默认 profile 是 `cms-brand`。只有明确需要商品目录、商品故事与多语言内容运营时才切换到 `retail`；不得把 `retail` 解释为已包含线上交易闭环。

## 项目契约

- `gcss.project.json` 是项目名、品牌名、域名、profile、语言、内容源、Contact 开关和部署名称的唯一提交态来源。
- 不要在 Studio、Worker、Actions 或前台再次硬编码上述信息；运行时从 `gcss-config` 读取，生成文件从项目契约同步。
- 模板仓库保持 `templateMode=true`；客户项目初始化后必须改为 `false`，并在部署前通过 `npm.cmd run project:scan`。
- 新项目写入必须先运行 dry-run，并只允许初始化器列出的文件发生自动修改。
- A1/A2/B/C 的外部服务、secret 和 UI 入口必须按 profile 裁剪，禁用模块不能因为缺少对应 secret 而失败。

## 统一启动与完全交付

- A1、A2、B、C 都必须从公开框架 Template repository 的默认分支创建客户独立 Private repository。
- 正式客户仓库从第一天起属于客户专属 GitHub Organization；不要默认在维护方个人 namespace 中开发后再转移。
- 不使用 Fork、下载 ZIP、复制工作目录或保留框架完整 Git 历史来启动正式客户项目。
- clone 客户仓库后，必须将客户仓库根目录作为新的 Codex 本地项目；不要在框架仓库或其他客户任务中初始化。
- 所有方案统一执行：确认客户边界 -> `Use this template` -> clone -> Codex 新项目 -> 选择 profile -> dry-run -> 受控初始化 -> 验证 -> 授权部署 -> 完全交付。
- 方案差异只决定启用的平台和模块，不改变客户对 GitHub、Cloudflare、域名及适用 Sanity、Shopify、Resend 资产的所有权。
- 完全交付必须覆盖客户 Owner、账户恢复方式、MFA、账单、部署、凭据轮换、平台资产登记表和按方案裁剪的日常操作手册；不得据此宣称已具备生产数据 Backup / Restore。
- 统一规则见 `docs/project-startup-and-handoff.md`。

## 不要提交

- `node_modules/`
- `dist/`
- `.astro/`
- `.sanity/`
- `.wrangler/`
- `.env*`，但 `.env.example` 可以提交
- `.dev.vars*`
- 日志、缓存、本地编辑器配置和 agent 元数据
- token、secret、私钥、客户隐私、真实订单敏感信息

## 必须先确认

- 真实 Cloudflare 部署。
- 域名、DNS、路由或生产 Worker 修改。
- Shopify 支付、Checkout、税务、配送、库存、订单或真实商品数据修改。
- Sanity 生产 dataset 写入、导入、删除或 schema 破坏性迁移。
- R2 删除、公开访问、生命周期策略或生产备份改动。
- 远程删除数据。
- 写入、轮换或提交生产 secret。
- commit、push、创建 PR、打 tag 或发布 release。

## 文档和日志

- 框架、Profile、Studio、内容模型、Sanity / Shopify / Cloudflare 集成、部署流程或重要运营决策变更，应记录到项目日志。
- 纯错别字、一行样式微调、无代码变更的解释性讨论可以不单独记录。
- 日志使用中文，服务于回溯决策，不写流水账；重点记录为什么这样做、验证了什么、接下来还欠什么。
- 日内日志写入 `docs/project-log/daily/YYYY-MM-DD.md`，同一天只追加同一个文件。
