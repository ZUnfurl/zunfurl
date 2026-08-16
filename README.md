# ZUnfurl

[![Version](https://img.shields.io/badge/version-0.3.0--preview.1-orange)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

> **0.x Preview：**公共契约仍可能发生 breaking change。当前仓库提供可验证的源码基础，不承诺生产 SLA，也不把 Roadmap 能力描述成已交付。

ZUnfurl 是一套静态优先的品牌站点基础框架：帮助品牌建立更清晰、可维护的数字呈现，并按 A1/A2/B/C 四种交付形态启动品牌官网或 **C 零售目录与内容运营基础框架（C Retail Catalog & Content Foundation）**。

仓库机器名与内部 package 暂时保留 `gcss-v3-site-framework` / `gcss-*`，避免在首个 Preview 引入没有迁移价值的破坏性改名。

![ZUnfurl 中性示例首页](apps/storefront/public/brand-assets/screenshots/zunfurl-preview-home.webp)

核心组合：

- Astro：前台页面与静态构建。
- Sanity Studio：可选内容 CMS 和商品内容工作台。
- Shopify Storefront API：仅 C 方案启用，提供商品目录和媒体事实的只读映射。
- Cloudflare Worker：承载静态资源、健康检查、轻量 Contact 表单和 webhook 入口。
- A2/B/C Worker 使用 SQLite-backed Durable Object 协调原子 Contact 额度或短期 webhook 事件 claim；它抑制同一事件 ID 的重复 dispatch attempt，但不宣称跨 GitHub 外部系统 exactly-once。
- GitHub Actions：自动执行验证和构建检查；生产部署只允许从 `main` 人工触发，并受 `production` Environment 与显式 arming 边界约束。

## A/B/C 交付方案

| 方案 | Profile | 内容 CMS | 商品 CMS | Shopify | 适用场景 |
| --- | --- | --- | --- | --- | --- |
| A1 纯静态品牌官网 | `static-brand` | 否 | 否 | 否 | 无后台、无真实表单 API，内容由维护方更新 |
| A2 静态官网 + 表单 | `static-brand` | 否 | 否 | 否 | 静态页面 + 最小 Contact Worker |
| B 可自维护品牌官网 | `cms-brand` | 是 | 否 | 否 | 客户通过 Sanity 维护页面内容和表单文案 |
| C 零售目录与内容运营基础框架 | `retail` | 是 | 是 | 只读目录映射 | 客户通过 Sanity 维护商品内容，并从 Shopify 映射目录和媒体事实 |

模板默认 profile 是 `cms-brand`。这是更安全的新项目默认值：不会无意要求 Shopify、商品工作台、webhook 或目录权限。需要商品目录、商品故事和多语言内容运营时，再显式切换到 `retail`。

C 不包含 Cart、Checkout、支付、订单、税务、配送、履约，也不提供实时价格或实时库存。`retail` 是为兼容现有项目契约而保留的机器值，不代表本仓库已经实现线上交易闭环。

Authenticated Editorial/Draft Preview、生产 Backup 和灾难 Restore 尚未交付，统一列入 [Roadmap](docs/roadmap.md)。本地 `astro preview` 与 PR CI 构建检查都不是 draft-aware 内容预览。

## 外部账户边界

| Profile | GitHub / Cloudflare | Sanity | Shopify | Resend / Turnstile |
| --- | --- | --- | --- | --- |
| A1 | 客户自有 | 不创建 | 不创建 | 不创建 |
| A2 | 客户自有 | 不创建 | 不创建 | 启用 Contact 时由客户自有 |
| B | 客户自有 | 客户自有 | 不创建 | Contact 显式开启时由客户自有 |
| C | 客户自有 | 客户自有 | 客户自有，只读目录映射 | Contact 显式开启时由客户自有 |

框架的公共 upstream 只提供源码、初始化器、验证和操作基线。每个正式客户项目都必须通过 Template 创建到客户专属 GitHub Organization 的独立 Private downstream；不会继承 upstream Git 历史，也不会把客户凭据或内容回传到公共仓库。

## 完全交付原则

- 代理注册是实施服务，不改变客户对 GitHub、Cloudflare、域名、Sanity、Shopify、Resend 等生产资产的所有权。
- 正式客户仓库从第一天起创建在客户专属 GitHub Organization，不先放在维护方个人 namespace 中开发后再搬迁。
- 只创建当前方案需要的平台；例如 A2 不创建 Sanity 或 Shopify。
- 维护方使用独立成员账号参与开发，交付后按支持合同降权或移除。
- 日常操作手册与平台资产登记表分开交付，任何文档都不记录 secret 明文。

统一政策见 [docs/project-startup-and-handoff.md](docs/project-startup-and-handoff.md)，客户仓库创建后的安全设置按 [docs/customer-repository-settings.md](docs/customer-repository-settings.md) 执行，平台细节见 [.agents/skills/gcss-v3-site-framework/references/platform-ownership-and-handoff.md](.agents/skills/gcss-v3-site-framework/references/platform-ownership-and-handoff.md)。

## 新项目启动

四种方案使用完全相同的仓库和初始化入口：

1. 在客户专属 GitHub Organization 中，通过公开框架 Template repository 的 `Use this template` 创建客户 Private repository。
2. 只使用默认分支，不选择 `Include all branches`，不使用 Fork、ZIP 或本地目录复制。
3. clone 客户仓库，在 Codex 中把该目录添加为新的本地项目。
4. 确认 `origin` 指向客户专属 GitHub Organization，再调用仓库内 Skill。
5. 先审计和 dry-run，审阅后才允许写入；之后再分别处理内容、平台、部署和完全交付。

Skill 入口：[.agents/skills/gcss-v3-site-framework/SKILL.md](.agents/skills/gcss-v3-site-framework/SKILL.md)。

### 快速评估公共源码

维护者或贡献者可以直接 clone 公共 upstream；客户交付仍应使用下一节的 Template 流程。

```powershell
git clone https://github.com/ZUnfurl/zunfurl.git
Set-Location zunfurl
npm.cmd ci
npm.cmd run test:phase5
npm.cmd run dev
```

要求 Node `22.12.0` 或 Node `24`，并使用仓库固定的 npm `11.9.0`。`test:phase5` 包含四 Profile 隔离 fixture，运行时间明显长于日常单元门禁。

[Use this template](https://github.com/ZUnfurl/zunfurl/generate) 创建客户仓库后，先完成 dry-run；不要在公共 upstream 中写入客户配置。

统一首次提示：

```text
使用 $gcss-v3-site-framework 初始化当前客户项目。
方案：<A1 | A2 | B | C> <profile>
项目名：<project-name>
品牌名：<brand-name>
正式域名：<domain>
默认语言：<default-locale>
启用语言：<locales>

先读取 AGENTS.md、README.md、gcss.project.json 和 Git 状态，
确认当前目录是从 Template repository 创建并 clone 的客户私有仓库，
确认 origin 指向客户专属 GitHub Organization。
先完成审计并生成 dry-run 初始化计划；
暂不写文件、不 commit、不 push、不部署、不创建远程资源。
```

Profile 参数：

| 方案 | Profile | 内容来源 | Contact | 额外平台 |
| --- | --- | --- | --- | --- |
| A1 | `static-brand` | `local` | 关闭 | 无 Sanity、Shopify、Resend、Turnstile、协调对象 |
| A2 | `static-brand` | `local` | 开启 | 客户 Resend、Turnstile；Worker 内置协调对象 |
| B | `cms-brand` | `sanity` | 显式选择 | 客户 Sanity；不创建 Shopify |
| C 零售目录与内容运营基础框架 | `retail` | `sanity` | 显式选择 | 客户 Sanity、Shopify 只读目录映射 |

项目名、品牌、域名、profile、语言、内容源和部署名称统一写入 `gcss.project.json`。准备客户清单后生成 dry-run：

```powershell
npm.cmd run init:project:dry-run -- --config path/to/client.gcss.project.json
npm.cmd run init:project -- --config path/to/client.gcss.project.json
```

审阅文件清单后执行受控写入：

```powershell
npm.cmd run init:project -- --config path/to/client.gcss.project.json --write
npm.cmd run project:scan
```

## 本地开发

按 lockfile 安装依赖：

```powershell
npm.cmd ci
```

前台开发：

```powershell
npm.cmd run dev
```

Astro 本地 preview（先完成构建，再在本机检查生成结果）：

```powershell
npm.cmd run build
npm.cmd run preview
```

这里的 preview 仅指 Astro 对本地构建产物的预览，不是需要身份认证的 Sanity Draft Preview。

Studio 开发：

```powershell
npm.cmd run studio:dev
```

Cloudflare Worker 本地调试：

```powershell
npm.cmd run cf:dev
```

## 验证

基础 profile 验证：

```powershell
npm.cmd run test:profiles
npm.cmd run test:template
npm.cmd run test:fixtures
```

常用完整验证：

```powershell
npm.cmd run test:profiles
npm.cmd run test:template
npm.cmd run test:fixtures
npm.cmd run test:sanity
npm.cmd run test:commerce
npm.cmd run test:worker
npm.cmd run typecheck
npm.cmd run build
```

开源维护者在依赖或工作流变化后还应运行供应链门禁；`test:phase4` 会进一步在临时目录完整初始化并验证 A1/A2/B/C，耗时明显更长：

```powershell
npm.cmd run test:supply-chain
npm.cmd run test:phase4
npm.cmd run test:phase5
```

B 方案重点验证：

```powershell
npm.cmd run project:scan
npm.cmd run framework:audit
npm.cmd run test:profiles
npm.cmd run studio:build
npm.cmd run build
```

C 方案重点验证：

```powershell
npm.cmd run project:scan
npm.cmd run framework:audit
npm.cmd run test:profiles
npm.cmd run test:commerce
npm.cmd run test:worker
npm.cmd run studio:build
npm.cmd run build
```

## GitHub Actions

模板仓库默认不会在 `main` push 时自动部署 Cloudflare Worker。

- `preview.yml`：PR 和手动 CI 验证；不读取生产 secret，以独立 local fixture 验证 A1/A2/B/C，并对当前项目执行契约、供应链、类型、Worker dry-run 和可在无外部凭据条件下完成的构建。它不会覆盖提交态内容源，也不是内容草稿预览服务。
- `rebuild-request.yml`：只接收已通过 Worker 签名、结构过滤和短期去重后的 `repository_dispatch`，输出通用收件提示；不 checkout、不读取 secret、不构建也不部署。
- `deploy.yml`：只允许维护者从 `main` 手动运行；必须在 `production` Environment 中显式设置 `PRODUCTION_DEPLOYMENT_ARMED=true`，拒绝 `templateMode=true`，并按 profile 使用外部服务。独立 reviewer 和 deployment branch policy 仍须按 GitHub 计划在远程仓库配置并验收。
- Backup / Restore 当前仅保留在 `docs/roadmap/workflows/` 的不可执行设计样例，不是已交付的生产备份或恢复能力。

新客户项目正式启用部署前，必须完成受控初始化、平台 secret 配置和 readiness 扫描：

```powershell
npm.cmd run template:scan
npm.cmd run project:scan
npm.cmd run framework:audit
```

## 环境变量

从 `.env.example` 复制本地 `.env`：

```powershell
Copy-Item .env.example .env
```

只填写当前 profile 启用模块需要的变量：

- A1：不需要 Sanity、Shopify、Resend、Turnstile 或协调对象；A2 需要客户专属 Resend、Turnstile 和 Worker 协调对象，但仍不需要 Sanity 或 Shopify。
- B 方案：需要 Sanity 和 webhook 幂等协调对象；启用表单时另需 Resend 和 Turnstile。
- C 方案：需要 Sanity 和 Shopify Storefront API，以只读方式映射商品目录与媒体事实；启用结构性 webhook 时再配置对应的 server-side secret。

不要把 `.env`、`.dev.vars`、真实 token、secret、客户隐私或订单数据提交到仓库。

## 文档入口

- [docs/project-startup-and-handoff.md](docs/project-startup-and-handoff.md)：A1/A2/B/C 统一启动与完全交付规则。
- [docs/customer-repository-settings.md](docs/customer-repository-settings.md)：客户 Private repository 的所有权、Actions、分支、Environment、secret 和部署安全 bootstrap 清单。
- [docs/gcss-v3-site-framework-template-plan.md](docs/gcss-v3-site-framework-template-plan.md)：模板仓库计划。
- [docs/customer-operations.md](docs/customer-operations.md)：客户手册总入口。
- [docs/customer-operations-static-brand.md](docs/customer-operations-static-brand.md)：A 方案客户手册。
- [docs/customer-operations-cms-brand.md](docs/customer-operations-cms-brand.md)：B 方案客户手册。
- [docs/customer-operations-retail.md](docs/customer-operations-retail.md)：C 零售目录与内容运营基础框架客户手册。
- [docs/customer-page-operations.md](docs/customer-page-operations.md)：页面工作台操作手册。
- [docs/customer-product-operations.md](docs/customer-product-operations.md)：商品工作台操作手册。
- [docs/contact-lightweight-form-design.md](docs/contact-lightweight-form-design.md)：轻量 Contact 表单设计。
- [docs/template-placeholder-audit.md](docs/template-placeholder-audit.md)：模板占位内容和新项目替换清单。
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献流程、DCO 和 Profile 影响说明。
- [SECURITY.md](SECURITY.md)：私密漏洞报告与受支持版本。
- [SUPPORT.md](SUPPORT.md)：公共支持范围与禁止公开提交的信息。
- [docs/release-policy.md](docs/release-policy.md)：版本、兼容和发布证据规则。
- [docs/release-checklist.md](docs/release-checklist.md)：Public、tag 与 Release 的独立操作门禁。
- [CHANGELOG.md](CHANGELOG.md)：公开版本变化与 Known limitations。

## 当前模板状态

`0.3.0-preview.1` 候选保留 `Example Brand` 和 `Example Product` 作为中性、可运行示例内容。客户项目必须将 `templateMode` 改为 `false`，按 [模板占位审计](docs/template-placeholder-audit.md) 完成品牌、法律、资产和平台配置，并通过 `npm.cmd run project:scan` 后再部署。

源码许可见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)；媒体权利、第三方依赖和项目标识分别受 [资产清单](docs/compliance/ASSET_LICENSES.yml)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [TRADEMARKS.md](TRADEMARKS.md) 约束。Copyright 2026 Noodle Freeman。

<!-- DCO metadata publisher canary; deliberately unmerged. -->
