# GCSS v3 Site Framework 模板与 Skill 方案

`gcss-v3-site-framework` 由两个互补部分组成：

1. **公开代码模板仓库**：提供 Astro + Sanity + Cloudflare Worker 与可选 Shopify 只读目录映射的实际骨架。
2. **仓库级 Codex Skill**：负责按 A1/A2/B/C 初始化、裁剪、验证、部署准备和客户交付。

Skill 的唯一入口是：

- `.agents/skills/gcss-v3-site-framework/SKILL.md`

## 交付目标

| 方案 | Profile | 内容 CMS | Contact | Shopify / 商品 CMS |
| --- | --- | :---: | :---: | :---: |
| A1 纯静态品牌站 | `static-brand` | 否 | 否 | 否 |
| A2 静态站 + 轻量表单 | `static-brand` | 否 | 是 | 否 |
| B 可自维护品牌站 | `cms-brand` | 是 | 可选 | 否 |
| C 零售目录与内容运营基础框架 | `retail` | 是 | 可选 | Shopify 只读目录映射 |

C 的英文公开名称是 **C Retail Catalog & Content Foundation**。`retail` 只作为兼容现有项目契约的机器值；C 不包含 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存。

框架必须支持模块化升级和降级。profile 不只是文档标签，还必须同步控制前台路由、Studio 工具、schema、Worker 路由、外部服务、Actions 和客户手册。

## 唯一项目契约

`gcss.project.json` 是提交到 Git 的唯一项目事实来源，记录：

- schema 与来源框架版本；
- 模板模式或客户项目模式；
- 项目机器名、品牌名和正式域名；
- profile、内容源、默认语言和启用语言；
- Contact 表单开关；
- Worker、Studio、GitHub repository 标识；A2/B/C 的协调对象由 Wrangler migration 声明。

`gcss.project.schema.json` 定义可机读边界。运行时代码通过 `gcss-config` 读取清单；`.env.example`、`wrangler.toml`、`robots.txt` 等派生文件由初始化器生成，不能单独成为第二套配置。

真实 token、secret、私钥、订单和客户隐私永远不进入项目契约。

## 新项目初始化

所有 A1/A2/B/C 项目统一按 [统一项目启动与完全交付规则](project-startup-and-handoff.md) 开始：

1. 在客户专属 GitHub Organization 中，通过公开框架 Template repository 的 `Use this template` 从默认分支创建客户 Private repository。
2. 不使用 Fork、ZIP、复制工作目录或保留框架完整 Git 历史。
3. clone 客户仓库，并将该目录作为新的 Codex 本地项目；确认 `origin` 指向客户 Organization。
4. 复制并填写客户项目清单，将 `templateMode` 设为 `false`，先预览计划：

```powershell
npm.cmd run init:project:dry-run -- --config path/to/client.gcss.project.json
npm.cmd run init:project -- --config path/to/client.gcss.project.json
```

5. 审阅允许改写的文件后执行：

```powershell
npm.cmd run init:project -- --config path/to/client.gcss.project.json --write
```

初始化器只修改：

- `gcss.project.json`
- `package.json`
- `.env.example`
- `apps/worker/wrangler.toml`
- `apps/storefront/public/robots.txt`
- `README.md` 项目摘要

品牌文案、法律文本和视觉资产必须人工确认，不做危险的全仓字符串替换。

## 防呆与验收

```powershell
npm.cmd run project:scan
npm.cmd run framework:audit
npm.cmd run test:fixtures
npm.cmd run typecheck
```

- `project:scan`：客户模式下阻断示例品牌、示例域名、错误仓库名和派生配置漂移，并验证 profile 对应的协调对象配置。
- `framework:audit`：验证 Skill、项目契约、初始化器、profile 和 Actions 边界。
- `test:fixtures`：分别初始化 A1、A2、B、C 临时客户项目，执行合规、类型、前台、B/C Studio、Worker runtime 与 Wrangler dry-run 门禁，并在结束后删除临时目录。
- Wrangler `--dry-run`：确认 Worker 资源、变量和静态资产包可解析。

模板模式允许中性示例内容，但 `deploy.yml` 会主动拒绝 `templateMode=true`，防止模板被误当客户站部署。

## Actions 边界

- PR 验证 workflow 不需要生产凭据，按清单决定是否测试 Studio 和 Shopify 目录映射；模板仓库额外运行四方案构建矩阵。
- `rebuild-request.yml` 只确认结构性 `repository_dispatch` 已收到，不 checkout、不读取 secret、不构建也不部署。
- `deploy.yml` 只允许维护者从 `main` 手动运行；生产 Environment 未显式 arming 时 fail closed，不因 push 或 webhook 自动部署。
- B/C 才构建 Studio；只有 C 才运行 Shopify 校验。
- Actions 从 `gcss.project.json` 导出非敏感环境变量，secret 仍由 GitHub、Cloudflare、Sanity 和 Shopify 各自管理。

## 完全交付边界

- 四种方案使用相同的客户仓库所有权、平台资产登记、Owner、账户恢复方式、MFA、账单、凭据轮换和客户验收标准。
- 方案差异只决定创建哪些平台：A1 不创建 CMS/表单服务，A2 增加表单服务，B 增加 Sanity，C 增加 Sanity 与 Shopify 只读目录映射。
- C 的商品归档和取消归档是内容可见性生命周期，不是 Backup 或 Restore；当前公开版本不承诺生产数据恢复能力。
- 维护方代理注册和配置不改变客户资产所有权；交付后按支持合同降权或移除。
- 日常操作手册只包含客户购买方案的运营入口，平台资产登记表单独交给客户授权管理员。
- 统一门槛见 [统一项目启动与完全交付规则](project-startup-and-handoff.md)。

## 已完成状态

- [x] A1/A2/B/C profile 与功能边界。
- [x] 页面工作台、商品工作台和客户手册按 profile 裁剪。
- [x] 仓库级 Skill、统一启动基线与专题参考。
- [x] `gcss.project.json` / schema 契约。
- [x] dry-run、受控写入初始化器和 readiness 扫描。
- [x] Studio、Worker、前台与 Actions 读取统一配置。
- [x] Skill、初始化器、profile、workflow 和四方案构建矩阵测试。

## 后续版本原则

- 框架发布使用 tag 和 release note；客户项目在 `frameworkVersion` 中保留来源版本。
- 升级时先对比 schemaVersion 和 framework major，再执行显式迁移。
- 不把客户内容、视觉资产或真实 secret 回灌模板。
- 新功能必须同时说明适用 profile、所需服务、验证命令和客户运营边界。
