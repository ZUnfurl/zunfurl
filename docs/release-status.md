# Release Status

> 当前仓库状态：首次开源准备中，尚未公开发布
>
> 目标发布通道：`0.x preview`
>
> 候选版本：`v0.3.0-preview.1`
>
> 公共项目名：`ZUnfurl`

本文是面向公开使用者的能力状态权威草案。下表描述候选版本在通过全部开源 Gate 后的目标状态，不表示当前私有提交已经可以公开发布。

项目有三个机器 profile：`static-brand`、`cms-brand`、`retail`；`static-brand` 根据 Contact 开关形成 A1/A2，因此共有四个交付变体。

## 状态定义

| 状态 | 含义 |
| --- | --- |
| Supported | 属于候选版本公开范围，并通过对应 fixture、构建和边界测试；在 `0.x` 中仍可能发生有说明的 breaking change，不等于 production-ready 或 LTS |
| Preview | 已有可试用实现，但稳定性、集成证据或运维边界仍不完整；必须披露限制 |
| Roadmap | 尚未形成可交付能力，不承诺发布日期 |
| Not provided | 当前产品范围明确不提供；不得作为隐含能力宣传 |

`CI / Pull Request Validation`、Astro 本地 `preview` 和 `Authenticated Editorial/Draft Preview` 是三个不同概念。`Product archive/unarchive` 也不等于 Production Backup 或 Disaster Recovery Restore。

## Profile 状态

| 交付变体 | 机器 profile | 公开名称 | 候选版本范围 | 目标状态 |
| --- | --- | --- | --- | --- |
| A1 | `static-brand` + Contact off | Static Brand Site | Astro 静态品牌站、本地版本化内容、无真实 Contact API、无 Sanity/Shopify | Supported |
| A2 | `static-brand` + Contact on | Static Brand Site + Contact | A1 + 最小 Contact Worker、Turnstile、Resend、短期限流 | Supported |
| B | `cms-brand` | CMS Brand Site | Astro + Sanity 页面 CMS；无商品 CMS、无 Shopify | Supported |
| C | `retail` | C 零售目录与内容运营基础框架 / C Retail Catalog & Content Foundation | Astro 静态商品目录、Sanity 页面/商品内容、Shopify 只读目录映射 | Supported |

所有交付变体必须通过“独立客户契约 → dry-run → 受控初始化 → 完整验证”的临时 fixture。只切换模板环境变量的构建不能单独证明 Profile 可交付。

## 能力矩阵

| ID | 能力 | 适用范围 | 目标状态 | 边界或发布 Gate |
| --- | --- | --- | --- | --- |
| CORE-01 | 项目契约、dry-run、受控初始化和 Profile 裁剪 | A1/A2/B/C | Supported | 四份初始化后 fixture 已通过；禁用模块不能泄漏到路由、Schema、UI 或部署依赖 |
| CORE-02 | Astro 静态构建、本地内容和多语言路由 | A1/A2/B/C | Supported | 由无凭据 fixture 和构建验证；不代表生产部署完成 |
| A1-01 | 无真实表单 API 的静态品牌站 | A1 | Supported | 不需要 Contact、Sanity 或 Shopify secret |
| A2-01 | 最小 Contact Worker | A2 | Supported | `CONTACT_FORM_ENABLED=false` 优先紧急关闭；SQLite Durable Object 原子处理多桶限流 |
| B-01 | Sanity 页面 CMS | B | Supported | 商品类型、商品字段、商品路由和 shipping/returns 法律页已按 Profile 裁剪 |
| C-01 | 静态商品目录和商品详情 | C | Supported | 内容目录能力，不包含实时交易状态 |
| C-02 | Sanity 商品内容、工作台、上线与语言状态 | C | Supported | Sanity 不拥有价格、库存、SKU、订单、支付或履约主数据 |
| C-03 | Shopify Storefront 商品与媒体只读目录映射 | C | Supported | 不把 Shopify 主数据双向写入 Sanity；live summary 必须显式提供 handle，普通部署不读取示例商品 |
| C-04 | Product archive/unarchive | C | Supported | 内容生命周期操作，不是备份或灾难恢复 |
| CI-01 | CI / Pull Request Validation | A1/A2/B/C | Supported | PR 不读取生产 secret；四个 local fixture 覆盖 Profile，外部 Sanity/Shopify 内容构建留给获得授权的集成或生产 Gate；不覆盖提交态内容源，也不部署 Preview URL |
| DEPLOY-01 | Profile-aware Cloudflare deployment workflow | A1/A2/B/C | Preview | 仅 `main` 上的手动 `workflow_dispatch` 可进入 `production` Environment；未 arming 时失败。远程 Environment、计划能力和生产证据仍须验收；源码 CI 通过不等于生产部署成功 |
| WEBHOOK-01 | 结构性事件的 rebuild-request receipt | B/C | Preview | 签名、事件 ID、短期 claim 与 Shopify 结构指纹已验证；`repository_dispatch` 只产生通用收件提示，窗口内最多一次 dispatch attempt，不自动 build/deploy，也不承诺外部 exactly-once |
| PREVIEW-01 | Authenticated Editorial/Draft Preview | B/C | Roadmap | 当前 Worker 不提供该 handler；`/preview` 和 `/preview/*` 固定返回 `404`，不读取 Sanity draft，也不渲染 HTML |
| BACKUP-01 | Production Backup | 启用外部平台的变体 | Roadmap | 当前只有位于 `docs/roadmap/` 的不可执行设计与 manifest 计划；Actions 不执行导出或写入备份对象 |
| RESTORE-01 | Disaster Recovery Restore | 启用外部平台的变体 | Roadmap | 当前只有不可执行设计，不执行导入、隔离恢复或生产恢复演练 |
| TX-01 | 实时价格、库存、变体和购买面板 | C | Not provided | 当前不提供交易实时性 |
| TX-02 | Cart / Checkout handoff | C | Not provided | 首个 Preview 不支持购买流程 |
| TX-03 | 支付、订单、税务、配送、履约和客户账户 | C | Not provided | 继续由交易平台拥有，不由本框架实现 |
| B-CATALOG-01 | B 的非交易商品目录 | B | Not provided | B 只提供页面 CMS；商品 UI、Schema 和路由应消失 |
| PLATFORM-01 | 自建 DAM、PIM、ERP、订单后台、Checkout、全站 SSR 或常驻服务器 | 全部 | Not provided | 超出项目边界 |
| PUBLISH-01 | npm package 发布 | 全部 | Not provided | 所有 package 保持 `private: true`；首版只发布源码 |

`Supported` 只说明候选版本在公开声明范围内有相应验证，不替代客户对 Cloudflare、Sanity、Shopify、Resend、DNS、MFA、账单、备份和生产验收的责任。

## 首个 Preview 的发布阻断项

- Phase 1 当前发布树门禁已通过：旧媒体已替换或删除，当前 26 项媒体和 77 个源码引用完成 provenance 登记，9 个中文文件已重写，当前树文本扫描为 0 个未批准命中。旧私有历史仍不符合公开条件，不得据此直接转 Public。
- Phase 2 能力声明门禁已通过：C 定位、三类 Preview、Production Backup/Disaster Recovery Restore、商品 archive/unarchive 和公开上游工作流已分离。
- Phase 3 工程门禁已通过：A1/A2/B/C 四份初始化后独立 fixture、Profile/Schema/法律路由隔离、Contact 原子限流、Webhook 短期幂等、显式 Shopify handle、全 workspace typecheck、构建与 Worker dry-run 均通过；临时目录已删除且源工作树状态未被夹具改变。
- Phase 0 已确认公共 owner、版权署名、许可证和权利链声明；Phase 5 已建立 `LICENSE`、`NOTICE`、商标政策和 fail-closed 许可覆盖门禁。Phase 6 当前未提交公共候选包含 303 个逐项获批并完成许可映射的文件；真实自然人与笔名映射及权利链证据必须继续保存在私有权属记录中，不进入公共仓库。
- Phase 4 本地供应链门禁已通过：完整树与 production tree 均为 0 critical、0 high、7 moderate、0 low；1600-component CycloneDX SBOM、依赖许可证政策、固定 SHA Actions 和无生产 secret 的 PR CI 已建立。Phase 5 版本元数据对齐后当前 SBOM SHA-256 为 `6c122c2713fbe378f1a889f8acc89913ae33f7765379b21b823ebcec81d7f738`。最终候选 commit 的托管 CI 与真实远程 `production` Environment/branch policy/arming 仍未验收。
- Phase 5 本地 Gate 已通过：Apache-2.0、DCO、社区治理、安全与支持政策、README、CHANGELOG、Release 契约和完整 SemVer 已实施；12 个社区文件、3 个 Issue Forms、候选中 65 个 Markdown 文件的 145 个链接和 10 个私有 manifest 已通过专用门禁。安全邮箱实际收件、GitHub Private Vulnerability Reporting、CODEOWNERS 权限和 Community Profile 仍需在公共候选远程验证。
- 当前 Private Template repository identity 将被复用。原始历史与 3 份旧 Actions 日志已由 Gitleaks `8.30.1`、TruffleHog `3.97.0` 和脱敏 PII/IP 规则覆盖：两类专用 secret scanner 均为 0，但旧历史仍有 39 项、旧日志仍有 70 项规则命中，二者保持 `blocked`。仓库外候选树已完成 manifest 对照、Phase 5 全门禁、A1/A2/B/C fixtures、typecheck、Worker/Wrangler、当前文本和历史摘要验证；授权前快照已证明其 Git 元数据为 unborn、无 ref、无 remote、无 object。现已单独授权在该候选中创建一个 DCO 单一根提交，但只有身份、无父历史、相同 tree、重新扫描和工作树门禁全部通过后才接受；该授权不替代远程历史替换、旧 Actions 清场和匿名 clone 验证。当前 GitHub Free 计划不能在 Private 状态提前验证目标 ruleset/branch protection，PVR 也需在 Public 后启用；若不升级计划，这些控制必须在 Public 切换后、任何 tag/Release 前立即完成。
- Public、tag 和 GitHub Release 仍需三次独立明确授权。

任一阻断项存在时，不允许把仓库切为 Public。

## 权威文档

- [开源执行计划](open-source-preview-release-plan.md)
- [Phase 0 决策记录](open-source-decisions.md)
- [Roadmap](roadmap.md)
- [Release Policy](release-policy.md)
- [统一客户启动与完全交付](project-startup-and-handoff.md)
