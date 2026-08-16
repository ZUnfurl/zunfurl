# ZUnfurl 0.x Preview 开源执行计划

> 状态：已转移至 `ZUnfurl/zunfurl` Private Template repository（默认分支 `main`）；旧历史、目标身份、GitHub Apps 与 Codespaces secrets 人工复核已完成，最终候选仍须重新完成 G6a，并在 Public 前清空候选 CI cache 后通过精确远程复审
>
> 计划基线：2026-08-15；执行状态更新：2026-08-16
>
> 选定路线：快速开源，以 `0.x preview` 发布
>
> 候选版本：`v0.3.0-preview.1`
>
> 仓库策略：复用现有 Private Template repository identity；原始历史先做私有离线归档，再以批准快照形成的单一净化根历史完全替换远程旧历史

Phase 0 工作文件：

- [开源决策记录](open-source-decisions.md)
- [Release Status](release-status.md)
- [Roadmap](roadmap.md)
- [Release Policy](release-policy.md)

本文是 `ZUnfurl` 首次开源的执行权威文档。现有内部 `gcss-*` package、profile key 和迁移协议为兼容性暂不机械改名。计划把“快速开源”定义为收窄并准确描述当前能力，而不是降低版权、安全、可复现性或 Profile 正确性门槛。

本计划本身不自动授权历史重写、远程仓库创建、push、Public 切换、tag、GitHub Release、生产部署或任何 Cloudflare、Sanity、Shopify、DNS 写入。Owner 已于 2026-08-16 持续授权完成 Phase 9 前所需的 commit、push、PR、tag 与 GitHub Release，并已单独确认创建 `ZUnfurl`、转移及改名为 `ZUnfurl/zunfurl`；随后又明确要求完成 Phase 8 后暂停，因此 Phase 8 所需的候选 cache 清场、仓库安全设置、Public 窗口、G6b、签名 tag 与 Pre-release 已获得操作授权。该授权不包含生产平台写入，也不替代任何技术 Gate；Phase 9 仍需新的进入指令。

## 1. 已冻结的发布决策

### 1.1 发布成熟度

- 首个公共版本为 `0.x preview`，不宣称 production-ready、stable 或 long-term support。
- 候选版本确定为 `v0.3.0-preview.1`。根、全部私有 workspace、项目契约、fixtures、lockfile 和发布文档已完成对齐。
- GitHub Release 必须标记为 Pre-release。
- `0.x preview` 表示框架发布成熟度，不等于内容预览功能。

### 1.2 C 方案定位

保留机器契约 `delivery.profile="retail"`、`SITE_PROFILE=retail` 和现有 schema 枚举，避免为了公开命名而引入破坏性配置迁移。

所有面向用户的显示名称统一为：

- 中文：`C 零售目录与内容运营基础框架`
- 英文：`C Retail Catalog & Content Foundation`

| 能力 | 首个 Preview 状态 |
| --- | --- |
| Astro 静态商品目录与商品详情展示 | Supported |
| Sanity 页面和商品内容运营 | Supported |
| 商品语言上线状态 | Supported |
| Shopify 商品与媒体只读映射 | Supported |
| Sanity/Shopify 结构性事件的 rebuild-request receipt | Preview，签名、事件 ID 短期 claim 与结构字段判断已实现；receipt 不自动 build/deploy |
| Cart、Checkout handoff | Not provided |
| 支付、订单、税务、配送、履约 | Not provided |
| 实时库存同步或交易后台 | Not provided |
| 客户账户与会员系统 | Not provided |

内部 `commerce` feature 在本轮可保留，但文档必须明确：它只表示 Shopify 只读目录集成和商品内容工作流，不代表完整交易能力。

### 1.3 Preview、Backup、Restore 术语

| 术语 | 当前状态 | 公开表述 |
| --- | --- | --- |
| GitHub Actions `Preview Build` | 已实现的 PR/手动构建验证 | 改名为 `CI / Pull Request Validation`，避免与内容预览混淆 |
| Astro 本地 `preview` | 已实现的本地构建预览命令 | 保留 |
| Authenticated Editorial/Draft Preview | 未实现真实 draft-aware HTML | Roadmap |
| 商品文档 archive/unarchive | 已有内容生命周期操作 | 保留，不称为灾难恢复 |
| Production Backup | 当前只有 manifest/dry-run 草案 | Roadmap |
| Disaster Recovery Restore | 当前没有真实隔离恢复演练 | Roadmap |

原先位于 `.github/workflows/` 的 `backup.yml`、`restore-test.yml` 已移出默认 Actions；不可执行的 roadmap 设计样例现在只保存在 `docs/roadmap/workflows/`，并明确不提供真实导出、导入或恢复能力。

### 1.4 上游与客户仓库边界

- 框架上游：公开的 GitHub Template repository。
- 正式客户项目：继续从模板创建在客户专属 GitHub Organization 中，默认保持 Private。
- 客户仓库不使用 Fork、ZIP 或复制框架工作目录启动。
- Template repository 不复制 secrets、environments、Actions 历史、rulesets 或外部平台所有权；客户仓库仍需独立配置这些边界。

## 2. 发布目标与非目标

### 2.1 本轮目标

1. 公开一个无客户身份、无来源不明素材、无确认 secret 的净化代码快照。
2. 让匿名用户只使用公开仓库和无凭据本地 fixture，就能完成安装、初始化和 A1/A2/B/C 验证。
3. 让 README、AGENTS、项目 Skill、测试和实际实现使用同一能力边界。
4. 消除全部 critical/high npm 漏洞，建立依赖、许可证、SBOM 和 Actions 供应链门禁。
5. 建立最小但完整的许可证、安全报告、贡献、支持、治理和发布制度。
6. 保留客户平台所有权、静态优先、动态最小化和禁用模块不泄漏的既有契约。

### 2.2 本轮非目标

- 不实现 Cart、Checkout、支付、订单、税务、配送、履约或会员系统。
- 不实现真实 Draft Preview、Production Backup 或 Disaster Recovery Restore。
- 不发布任何 npm package；所有 package 继续保持 `private: true`。
- 不把真实 Cloudflare、Sanity、Shopify、Resend 或 DNS 写入作为本地框架可用性的证明。
- 不把当前私有仓库原历史直接公开。
- 不承诺免费支持 SLA、稳定 API 或 `1.0` 兼容性。

## 3. 执行原则与授权矩阵

### 3.1 不可妥协原则

- Public 切换必须是最后一步，不能“先公开再清理”。
- 任一 P0 失败即 No-Go，不以 roadmap issue 豁免。
- 删除历史中的 secret 不能替代吊销和轮换。
- 自动 OCR、文件名或文本扫描不能替代二进制素材的人工权利审核。
- 绿色模板测试不能替代初始化后客户 fixture 的完整验证。
- 公开后普通缺陷通过补丁和 revert 修复，不移动已发布 tag，不重写公共历史。

### 3.2 必须单独授权的操作

| 操作 | 授权要求 |
| --- | --- |
| 确定版权主体、许可证和版权声明 | 版权主体明确确认 |
| 删除或替换可能属于客户的素材 | 用户确认素材处理边界；保留私有证据 |
| 历史重写、orphan history、仓库改名 | 用户明确确认 |
| 创建新 GitHub 仓库或 push 候选提交 | 用户明确确认 |
| 删除远程 Actions runs、artifacts、branch 或 tag | 用户明确确认 |
| 将候选仓库切换为 Public | 单独、明确确认 |
| 创建或 push tag | 单独、明确确认 |
| 创建 GitHub Release | 单独、明确确认 |
| 真实 Cloudflare、Sanity、Shopify、Resend、DNS 操作 | 独立生产授权 |
| npm publish | 不属于本轮，未来另行授权 |

仓库一旦公开，即使随后改回 Private，也无法撤回已经产生的 clone、缓存、搜索索引和第三方副本。

## 4. Go/No-Go 总门禁

| Gate | 必须满足 | 主要证据 | 失败处理 |
| --- | --- | --- | --- |
| G0 Scope | Public Scope Matrix、C 名称、Roadmap 和版本策略已批准 | 决策记录、能力矩阵、版本政策 | 停止全仓文案替换 |
| G1 Rights | 许可证、版权、商标、素材 provenance 和第三方 notices 完整 | `LICENSE`、资产 manifest、私有授权证据、license report | 不生成公共历史 |
| G2 Content | 客户标识、个人信息和中文乱码清零 | 文本扫描、资产人工审查、编码测试 | 不冻结候选树 |
| G3 Engineering | 四个初始化后客户 fixture、构建和 Worker dry-run 全绿 | 命令、环境、commit SHA、结果摘要 | 不创建候选远程 |
| G4 Security | 原始及净化历史扫描通过；critical/high 为 0；Actions 固定 SHA | secret scan、`npm audit`、SBOM、workflow 检查 | 不公开 |
| G5 Community | License、Security、Support、Contributing、Governance 和模板可用 | Community Profile、链接检查、联系人验证 | 不创建 tag |
| G6a Private Release Candidate | 经授权的全新隔离 checkout 在无生产 secret 环境可复现；声明与实现一致 | Windows/Linux CI、tree manifest、校验和 | 保持候选仓库 Private |
| G6b Public Anonymous Reproduction | Public 后、tag 前的真正匿名 clone 与 Quick Start 可复现 | 匿名 HTTPS clone、Quick Start、Public 安全检查 | 停止 tag/Release |
| G7 Public Release | Public 已单独授权，tag/Release 已获持续授权，且发布时仍满足全部 Gate | 授权记录、仓库设置快照、Release 检查表 | 不执行或停止远程发布 |

## 5. 分阶段执行计划

## Phase 0：冻结范围、身份和许可证决策

### 目标

在修改全仓公共文案之前，建立唯一 Public Scope Matrix，并补齐会改变后续所有文件的所有权决策。

### 任务

#### OSS-0001：确认公共项目身份

- [x] 确认目标公共 GitHub Organization/owner 为 `ZUnfurl`；目标仓库映射为 `ZUnfurl/zunfurl`。
- [x] 确认公共品牌为 `ZUnfurl`；首个 Preview 只使用文字名称，不发布独立 Logo，不依赖候选域名。
- [x] 确认公开版权署名为 `Noodle Freeman`，版权起始年份为 `2026`。
- [x] 确认 `gcss.project.schema.json` 使用稳定 URN；当前没有项目控制 `gcss.dev` 的证据。
- [x] 确认新公共历史使用批准的组织身份或 GitHub noreply 邮箱，不复制当前真实 author 历史。
- [x] 复用当前 Private Template repository identity；原始历史保存为私有离线归档，公共版本只使用单一净化根历史，不保留或合并旧提交。

已确认：公共品牌和目标 Organization 使用 `ZUnfurl`，目标仓库 slug 为 `zunfurl`；首版不设独立 Logo；Schema `$id` 使用 `urn:gcss-v3-site-framework:schema:project:v1`；公共提交使用批准的组织或 noreply 身份。D-02 已于 2026-08-16 修订为复用当前仓库 identity；创建 Organization、仓库转移和改名随后已获单独确认并完成。Public 切换不是“进入 Phase 6”的隐含授权，但 Owner 后续以“完成 Phase 8 后暂停”的明确指令单独批准了 Phase 8 公共窗口。

#### OSS-0002：确定许可政策

- [x] 代码许可证确定为 Apache-2.0。
- [x] 首个 Preview 的文档和项目 Skill 与代码同为 Apache-2.0；独立出版物未来再评估 CC BY 4.0。
- [x] 演示素材只允许项目自有或 CC0，且必须逐文件登记。
- [x] 项目名称与未来 Logo 的商标权不由 Apache-2.0 授予；首版不发布独立 Logo。
- [x] 贡献许可采用 DCO 1.1 + inbound=outbound，首个 Preview 不引入 CLA。
- [x] Release 只发布源码；`ffmpeg-static` 仅作为不随 Release 分发的 dev 工具并披露。
- [x] 权利主体确认现有代码、Skill、文档和法律示例全部拥有或已获再许可，且无例外。
- [x] 许可证不另行指定 governing law；Apache-2.0 保持原文。实际合同、维权或目标市场合规在出现对应事实时由相关法域专业人士复核。

#### OSS-0003：建立发布状态权威文件

已新增草案：

- [x] `docs/release-status.md`
- [x] `docs/roadmap.md`
- [x] `docs/release-policy.md`

`docs/release-status.md` 必须包含 `Supported / Preview / Roadmap / Not provided` 四态能力表。README、Skill、客户手册和测试引用同一术语，不各自创造产品定位。

#### OSS-0004：消除版本与 Schema 身份歧义

- [x] 核验 `schemaVersion: 1` 与框架 SemVer 是两个独立版本维度。
- [x] 发现当前 Schema 和运行时只接受 `x.y.z`，会拒绝候选 `0.3.0-preview.1`。
- [x] 批准先增加完整 SemVer prerelease 支持，再同步初始化器、fixtures、manifests 和 lockfile；代码实施安排在 Phase 5 写入版本之前。
- [x] 批准 Schema `$id` 使用 `urn:gcss-v3-site-framework:schema:project:v1`；代码实施安排在后续工程阶段。

### 验收与停止条件

通过条件：OSS-0001 至 OSS-0004 的所有决策都有责任人和明确结论。当前已通过。

停止条件已解除：版权主体、许可证、项目名称和目标公共仓库归属均已确定；C 与 Roadmap 术语已冻结。Phase 1 仍须遵守 Rights、Security 和 Public Gate，不得直接公开。

## Phase 1：净化素材、文本和当前发布树

### 依赖

G0 Scope 通过。

### 任务

#### OSS-0101：建立完整公开文件清单

- [x] 记录候选源 commit SHA、tracked paths、blob SHA 和文件大小。
- [x] 分类代码、文档、Skill、示例内容、法律模板、图片、Logo、视频、favicon、生成文件和内部日志。
- [x] 对 `docs/project-log/`、商业交付材料和旧架构文档逐项决定公开、重写或排除。
- [x] 检查测试 fixture 中的店铺名、商品 ID、Admin URL、域名和邮箱，全部改为明显虚构值。

建议命令：

```powershell
git status --short --branch
git rev-parse HEAD
git ls-files
git rev-list --objects --all
```

#### OSS-0102：替换全部客户和来源不明素材

重点范围：

- `apps/storefront/public/brand-assets/`
- `apps/storefront/public/favicon.ico`
- `apps/storefront/public/favicon.svg`
- 任何演示截图、视频、字体、PDF、音频和社交预览图

执行步骤：

1. 为当前 29 个媒体资产逐项登记路径、SHA-256、作者、来源、许可证、是否涉及人物、物业、产品包装或商标。
2. 删除或替换全部旧客户品牌、人物、原客户产品和无法证明再分发权的素材。
3. 新素材统一采用中性虚构品牌，不含真实地址、联系方式、功效声明或法律主体。
4. 清理 EXIF/XMP 等元数据。
5. 对所有新素材执行人工视觉复核，确认图像内文字、SVG path、包装和背景不含客户标识。

已新增或更新：

- `docs/compliance/ASSET_LICENSES.yml`
- `docs/compliance/assets-provenance.md`
- `scripts/tests/validate-public-assets.mjs`
- 根命令 `test:assets`

资产 manifest 至少包含以下信息；允许由 asset entry 与其 `provenanceId` 指向的来源记录规范化组合，避免逐项重复：

`path`、`sha256`、`title`、`author`、`source`、`license`、`copyrightHolder`、`redistributionAllowed`、`commercialUseAllowed`、`modelRelease`、`propertyRelease`、`trademarkStatus`、`evidenceRef`、`reviewedAt`。

`test:assets` 必须做到：

- 媒体文件与 manifest 一一对应；
- 验证 SHA-256；
- 拒绝未登记的图片、视频、字体、PDF、favicon 和音频；
- 扫描 SVG 文本、脚本和外链；
- 将二进制交给资产门禁，不再由 `template:scan` 静默跳过。

#### OSS-0103：重写损坏的中文示例

不得从来源不明的旧客户内容恢复。应重新编写中性、可公开的 UTF-8 示例文本。

必须处理：

- `apps/storefront/src/content/pages/zh-cn/home.json`
- `apps/storefront/src/content/pages/zh-cn/about.json`
- `apps/storefront/src/content/pages/zh-cn/contact.json`
- `apps/storefront/src/content/pages/zh-cn/products.json`
- `apps/storefront/src/content/product-locale-pages/zh-cn/example-product.json`
- `docs/legal/zh/privacy-policy.md`
- `docs/legal/zh/terms-of-use.md`
- `docs/legal/zh/shipping-returns-policy.md`
- `docs/legal/zh/customer-service-contact.md`

计划新增 `scripts/tests/validate-content-encoding.mjs` 和根命令 `test:content-encoding`。测试至少需要：

- 使用 `TextDecoder("utf-8", { fatal: true })` 校验跟踪的文本文件；
- 拒绝 `U+FFFD`；
- 在中文内容和中文法律目录拒绝连续三个以上 `?`；
- 解析全部 JSON；
- 检查构建后的 `dist/zh-cn/` 无乱码标记；
- 明确法律内容是示例模板，不是法律意见，也不包含真实主体或司法管辖承诺。

建议验证：

```powershell
rg -n "\?{3,}|\x{FFFD}" apps/storefront/src/content docs/legal/zh
npm.cmd run test:content-encoding
npm.cmd run build
```

#### OSS-0104：扩展占位和隐私扫描

- [x] `template:scan` 继续负责文本客户词、域名和占位符。
- [x] `test:assets` 负责二进制登记和哈希。
- [x] 新增 PII 检查，覆盖邮箱、电话号码、真实域名、店铺标识、订单形态数据和内部路径。
- [x] 扫描所有 tracked files、所有可达历史文本 blob 和大对象清单。
- [x] 扫描结果只输出路径、行号、规则和哈希，不在 CI 日志回显疑似 secret 值。

### Phase 1 Gate

通过条件：全部公开文件有处置决定；素材 manifest 覆盖率 100%；客户品牌和来源不明素材清零；9 个中文文件恢复；编码、文本和资产门禁通过。

停止条件：任一素材授权不明确；真实客户事实仍存在；只能通过删除中文语言绕开损坏；只清理当前树而忽略未来公共历史。

### Phase 1 执行结果（2026-08-15）

- [x] 来源 commit `b0e5a0986e1b2f6e4a4ed52085208515dc741516` 的 237 个 tracked path 已逐项记录 blob SHA、大小、类别和处置决定；工作树净化内容以 overlay 记录。
- [x] 旧 29 项媒体均按 `unknown-not-published` 处置；Phase 1 当时的 25 项媒体全部进入 manifest，资产门禁验证 25 个文件和 76 个源码引用。Phase 5 新增中性 README 截图后，当前总数为 26 个文件和 77 个引用。
- [x] 9 个中文文件已用中性 UTF-8 示例重写；中文法律页明确是示例模板，不是法律意见。
- [x] 当前候选树文本扫描为 0 个未批准命中；旧私有可达历史仍有 39 个未批准命中，已经作为“禁止直接公开旧历史”的证据登记。
- [x] `test:phase1`、`template:scan`、默认 `cms-brand` 构建和 `retail + local` 三语言构建通过。

Phase 1 Gate 通过，可以进入 Phase 2。此结论只批准当前净化树作为后续输入，不批准公开现有 Git 历史；Phase 6 必须从批准快照建立并再次扫描新的净化历史。

## Phase 2：收口产品声明和 Roadmap

### 依赖

G0 Scope 通过；Phase 1 已确认哪些公共文件保留。

### 任务

#### OSS-0201：全仓同步 C 方案定位

至少检查并同步：

- `README.md`
- `AGENTS.md`
- `docs/framework-productization-plan.md`
- `docs/gcss-v3-site-framework-template-plan.md`
- `docs/framework-module-audit.md`
- `docs/astro-sanity-shopify-cloudflare-retail-framework-v2.1.md`
- `docs/customer-operations.md`
- `docs/customer-operations-retail.md`
- `docs/customer-page-operations.md`
- `docs/customer-product-operations.md`
- `.agents/skills/gcss-v3-site-framework/SKILL.md`
- `.agents/skills/gcss-v3-site-framework/references/profiles.md`
- `.agents/skills/gcss-v3-site-framework/references/new-project-retail.md`
- `.agents/skills/gcss-v3-site-framework/references/retail-operations.md`
- `.agents/skills/gcss-v3-site-framework/references/deployment.md`
- 相关测试断言和 fixture

必须保留：

- `profile: retail` 机器值；
- Shopify 只读商品映射和媒体事实来源；
- Sanity 商品内容、SEO、故事和语言状态；
- 禁止把价格、库存、SKU、订单、支付和履约写入 Sanity。

必须移除或降级：

- “完整线上销售”“品牌零售独立站”等超出实现的公开描述；
- Cart、Checkout、支付、订单和交易后台暗示；
- “可恢复快照”一类尚无真实恢复证据的承诺。

#### OSS-0202：区分三类 Preview

- [x] `.github/workflows/preview.yml` 展示名改为 `CI / Pull Request Validation`。
- [x] README 保留 Astro 本地 preview 用法。
- [x] Authenticated Editorial/Draft Preview 进入 `docs/roadmap.md`，不得称已实现。
- [x] 当前 Worker `/preview/*` 从公开能力移除或默认关闭。
- [x] 删除 `?token=` 鉴权方式；未来内容预览不得把 secret 放在 URL、访问日志或浏览器历史中。

Draft Preview 的未来验收标准至少包括：真实 draft-aware HTML、身份认证、短期会话、`noindex`、无 query token、按 profile 裁剪和审计日志。

#### OSS-0203：降级生产 Backup/Restore

首选方案：

1. 将 `backup.yml`、`restore-test.yml` 移出 `.github/workflows/`。
2. 保存到 `docs/roadmap/workflows/` 作为不可执行设计样例。
3. 将相关命令改成显式 roadmap 名称，例如 `roadmap:backup:sanity:plan` 和 `roadmap:restore:check:plan`。
4. 将现有测试改为验证“设计草案不得被误认为生产恢复能力”。

未来 Backup 验收标准：真实导出、私有 R2、校验和、加密、保留期、最小权限、恢复点记录和无公开 Bucket。

未来 Restore 验收标准：仅先恢复到隔离 dataset、完整性检查、人工批准、演练记录和禁止一键覆盖生产。

#### OSS-0204：更新公开上游工作流

把所有“私有框架 Template repository”统一为：

`公开框架 Template repository → 客户专属 GitHub Organization 内独立 Private repository`

同步 README、AGENTS、项目 Skill、Profile 指南、客户启动文档和验证脚本。客户所有权、MFA、账单、恢复、凭据轮换和完全交付标准不降低。

### Phase 2 Gate

建议检查：

```powershell
rg -n "品牌零售独立站|完整零售|完整 commerce|Cart|Checkout|Backup|Restore|/preview|私有框架" README.md AGENTS.md docs .agents scripts apps
npm.cmd run test:phase2
```

通过条件：README、AGENTS、Skill、参考文档、测试和工作流使用同一能力矩阵；机器 profile 未被误改名；三类 Preview 和两类 Restore 不再混淆。

停止条件：文档仍暗示用户可以完成购买；roadmap workflow 仍可能被普通用户误触发；测试反向要求虚假能力存在。

### Phase 2 执行结果（2026-08-15）

- OSS-0201 完成：公开名称统一为 `C 零售目录与内容运营基础框架 / C Retail Catalog & Content Foundation`，保留机器值 `retail`、Sanity 商品内容和 Shopify 只读目录映射；Cart、Checkout、支付、订单、税务、配送、履约、客户账户以及实时价格/库存明确标为不提供。
- Phase 1 已决定排除的六份旧架构/产品化文档已从候选树删除；能力门禁断言这些旧声明不得回归。
- OSS-0202 完成：PR workflow 只表达 CI 验证，Astro 本地 `preview` 保持为本地命令；真实 Editorial/Draft Preview 留在 Roadmap。Worker 对 `/preview` 和 `/preview/*` 固定返回 `404`，不再接受共享 secret 或 URL query token。
- OSS-0203 完成：可执行的 `backup.yml`、`restore-test.yml` 已移出 Actions；不可执行样例仅保存在 `docs/roadmap/workflows/`，使用 `on: []`、`if: false`，并明确不执行 export、import 或 restore。命令统一增加 `roadmap:` 前缀。
- OSS-0204 完成：公开上游工作流统一为“公开框架 Template repository → 客户专属 GitHub Organization 内独立 Private repository”；上游公开不复制 secret、环境、Actions 历史、ruleset 或外部平台连接。
- 商品 archive/unarchive 明确为内容生命周期；仅在删除流程中提供同一 Sanity project 内的 best-effort 回收站副本，不承诺独立备份、保留期或灾难恢复。
- `npm.cmd run test:phase2`、`npm.cmd run framework:audit`、`npm.cmd run test:sanity`、`npm.cmd run test:phase1` 和 `npm.cmd run typecheck` 均通过。Phase 2 当时的 legacy 环境矩阵也曾通过，但已在 Phase 3 退役；当前 `test:matrix` 只是 `test:fixtures` 的兼容别名。

Phase 2 Gate 通过，可以进入 Phase 3。此结论只冻结公开定位、Preview/Recovery 边界和公共上游流程；不解除 Phase 3 的 Profile、初始化、Worker 与部署阻断，也不授权提交、推送、公开仓库、部署、tag 或 Release。

## Phase 3：修复 Profile、初始化和 Worker 阻断

### 依赖

Phase 2 的术语和能力矩阵已冻结。

### 任务

#### OSS-0301：修复 Profile 默认值断言

- 修改 `scripts/tests/validate-site-profiles.mjs`，不再永久断言空环境必须是 `cms-brand`。
- 测试应断言当前项目契约派生的 `defaultSiteMode`。
- 模板自身仍验证默认 `cms-brand`；初始化后的客户 fixture 分别验证自身 profile。

#### OSS-0302：移除 C 对 `example-product` 的部署依赖

- `scripts/shopify/preview-product-entry-summary.mjs` 不再默认使用 `example-product`。
- `.github/workflows/deploy.yml` 不在每次 C 部署中无参数运行真实商品摘要。
- 将 live Shopify 检查拆成独立、手动、需要显式 `--handle` 的授权集成测试，或从项目契约的明确 smoke fixture 读取。
- 客户替换示例商品后，正常构建和 dry-run 不得失败。

#### OSS-0303：建立四个初始化后客户 fixture

已新增：

- `scripts/fixtures/projects/a1.project.json`
- `scripts/fixtures/projects/a2.project.json`
- `scripts/fixtures/projects/b.project.json`
- `scripts/fixtures/projects/c.project.json`
- `scripts/tests/run-initialized-project-fixture.mjs`
- `scripts/tests/validate-initialized-profile-fixtures.mjs`
- 根命令 `test:fixtures`

Runner 应在临时目录执行：

1. 从当前 Git candidate tree 建立副本：读取 tracked files 与未忽略新增文件、跳过已删除路径，不复制 `.git`、`node_modules`、缓存和构建目录。
2. 运行 `init:project:dry-run`，断言只计划修改初始化器允许的文件。
3. 运行受控写入。
4. 使用明确列出的测试 overlay 模拟人工替换品牌、法律和示例内容。
5. 在临时目录建立没有 commit、remote 或历史的 unborn Git index，供 current-tree 合规扫描读取候选文件。
6. 执行 `npm ci`。
7. 执行 `project:scan`、`framework:audit` 和当前 profile 的完整验证。
8. 删除临时目录，不污染真实工作树。

| Fixture | 必须证明 |
| --- | --- |
| A1 | 无 Studio、Sanity、Shopify、Contact secret；真实 Contact API fail-closed |
| A2 | 只增加 Contact、Turnstile、Resend 和 SQLite Durable Object 原子限流；无 Sanity、Shopify |
| B | Studio/Page CMS 可构建；无产品 schema、商品入口和 Shopify secret |
| C | 静态商品目录、Studio 商品内容运营、Shopify 只读边界可构建；无 Cart/Checkout mutation |

单个变体应支持：

```powershell
npm.cmd run test:fixtures -- --variant A1
npm.cmd run test:fixtures -- --variant A2
npm.cmd run test:fixtures -- --variant B
npm.cmd run test:fixtures -- --variant C
```

#### OSS-0304：收紧项目契约和禁用模块隔离

- 为 `profile`、`contentSource` 和 features 建立跨字段不变量。
- 测试专用 override 与生产配置分离。
- JS 验证器与 JSON Schema 对额外字段和非法组合保持同样的 fail-closed 行为。
- B Studio 删除 Products page kind、商品嵌套字段和商品工具入口。
- A/B 不生成不适用的零售法律路由；法律页按业务范围显式选择。
- 禁用 Worker 模块时，对应路由应不存在或明确 fail-closed，不以 `202 skipped` 冒充启用能力。

#### OSS-0305：修复 Contact 和 Webhook 运行边界

- `CONTACT_FORM_ENABLED=false` 必须在所有 profile 下成为最高优先级紧急关闭开关。
- 为 enabled profile + emergency false 增加回归测试。
- 用 SQLite Durable Object 替换 KV `get → put` 并发限流，并以真实 runtime test 验证原子多桶计数。
- Shopify/Sanity webhook 使用事件 ID 建立持久化短期幂等；同一事件在窗口内最多发起一次 rebuild-request dispatch attempt，不宣称跨外部系统 exactly-once。
- Shopify `products/update` 只有结构性字段变化才产生 rebuild request；价格、库存、订单等普通交易变化不产生请求。Phase 4 将 receipt 与生产 Deploy 分离，首个 Preview 不提供 webhook 自动 build/deploy。
- 不把 `availableForSale` 快照当作 Sanity 内容上线资格。

#### OSS-0306：补齐静态检查

- 为 Storefront 增加 `@astrojs/check` 和 `astro check`。
- 为 Worker 增加适当的 lint 或类型检查。
- 将 Storefront、Studio、Worker 检查全部纳入根 `typecheck` 或独立 required checks。

### Phase 3 Gate

每个临时项目至少运行：

```powershell
npm.cmd run project:scan
npm.cmd run framework:audit
npm.cmd run test:content-encoding
npm.cmd run test:assets
npm.cmd run typecheck
npm.cmd run build
npm.cmd --workspace gcss-worker run deploy -- --dry-run
```

B/C 额外运行 `studio:build`；C 额外运行 `test:commerce`、`test:sanity`、`test:shopify-summary`。

通过条件：四个 fixture 全绿；不需要禁用模块的 secret；初始化器不越过允许写入清单；C 不依赖 `example-product`。

停止条件：fixture 测试会污染真实工作树；任何 profile 需要不属于自己的服务；测试通过依赖当前私有文件或真实平台凭据。

### Phase 3 执行结果

- OSS-0301/0304 完成：生产 profile 只来自 `gcss.project.json`，部署环境变量只能作为一致性镜像；跨 profile 测试改用独立 `GCSS_TEST_*` helper。JSON Schema 与 JS validator 对未知字段、缺失字段和非法 profile/content/legal 组合均 fail-closed。
- B 的 Studio 已移除 Products page kind、商品嵌套类型、商品字段与商品工具；`features.legalPages` 成为法律路由、sitemap 与 Contact 链接的显式来源，A/B 不允许 shipping/returns。
- OSS-0302 完成：Shopify live summary CLI 必须显式传 `--handle`；普通 C build、deploy 与 dry-run 不调用真实示例商品，结构单元测试中的中性 fixture 不构成部署依赖。
- OSS-0305 完成：Contact 紧急关闭优先于已启用 profile；SQLite Durable Object 原子处理多桶限流、Webhook claim 和 Shopify 商品结构指纹。Sanity 使用 `idempotency-key`，Shopify 使用 `X-Shopify-Webhook-Id`；网络副作用不确定时保留短期 claim，不承诺外部 exactly-once。
- Shopify `products/update` 仅在目录结构投影变化时触发；价格、库存、SKU 和 `availableForSale` 变化不触发。`availableForSale` 只作运营提示，内容上线资格使用 Product GID、handle 与 Sanity 生命周期状态。
- OSS-0306 完成：Storefront 使用 `astro check`，Studio 使用 `tsc --noEmit`，Worker 使用 Wrangler 生成绑定类型后执行 TypeScript 检查；真实 SQLite Durable Object 并发测试通过 test-only Wrangler 配置运行，不向 A1 生产配置泄漏绑定。
- Phase 3 曾让初始化后的 B/C PR 按 Profile 注入最小只读构建环境；Phase 4 为保证外部 fork 零生产 secret，已将 PR 收口为无凭据契约、local fixture、类型和 dry-run 门禁。它仍不覆盖提交态 `contentSource`，获得授权的 Sanity/Shopify 内容构建改由集成或手动生产 Gate 承担。
- 当前候选树的 A1、A2、B、C 四个初始化后 fixture 分别通过，最终完整复跑 wall time 约为 117、104、141、148 秒。每个 fixture 均验证 dry-run、精确六文件写入边界、test-only overlay、`npm ci`、`project:scan`、`framework:audit`、Phase 1 合规、全 workspace typecheck、按 profile 构建、Worker runtime tests 与 Wrangler deploy dry-run。
- A1 不生成 `GCSS_COORDINATOR`；A2/B/C 仅按自身 Contact/Webhook 需要生成 `GcssCoordinator` SQLite migration。四个临时目录均已删除，运行前后源仓库 Git status 一致；没有 commit、remote、生产凭据、生产 API 调用或部署。

Phase 3 Gate 通过，可以进入 Phase 4。该结论证明当前候选树的工程与初始化边界，不解除许可证文件、依赖漏洞、Actions 固定 SHA、净化历史、公共治理和匿名 clone 等后续 Release blockers。

## Phase 4：依赖、许可证和供应链加固

### 依赖

Phase 3 fixture 可用于升级回归。

### 任务

#### OSS-0401：分批消除 npm critical/high

实测基线：2026-08-15 的完整依赖树和排除 devDependencies 后的 production tree 均为 1 critical、11 high、9 moderate、1 low。此前计划中的 13/12 high 是 Phase 3 锁文件更新前的旧快照，不能作为本轮升级成效的分母。

升级分批建议：

1. Wrangler/Miniflare。
2. Sanity、Vision、Sanity UI 和 Sanity client 同一兼容批次。
3. Astro/Sharp 及其适配变化。
4. 剩余 transitive 漏洞；仅在证明兼容后使用精确 `overrides`。

每批执行：

```powershell
npm.cmd explain tar
npm.cmd explain sharp
npm.cmd explain undici
npm.cmd audit --json
npm.cmd run framework:audit
npm.cmd run test:fixtures
git diff --check
```

禁止使用未经审阅的 `npm audit fix --force`、宽泛 override 或通过降级主要框架规避漏洞报告。

最终门禁：

```powershell
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
npm.cmd run test:fixtures
```

#### OSS-0402：建立第三方许可证和 SBOM

- 从干净 `npm ci` 环境生成 CycloneDX SBOM。
- 区分 production、development、optional 依赖和实际 Release 分发物。
- 人工复核 `ffmpeg-static` GPL、Sharp/libvips LGPL、MPL、CC-BY 和缺失 license metadata 的依赖。
- 不把 npm 安装时取得的工具自动等同于随 Release 重新分发的二进制。
- 不发布 `node_modules`、FFmpeg、libvips 或未经审核的第三方二进制。

计划新增：

- `THIRD_PARTY_NOTICES.md`
- `docs/compliance/dependency-license-review.md`
- 许可证 allowlist/exception 文件
- Release artifact：`sbom.cdx.json`

#### OSS-0403：加固 GitHub Actions

- 所有 `uses:` 固定到完整 commit SHA，并保留版本注释。
- Checkout 设置 `persist-credentials: false`。
- 所有 job 设置合理 `timeout-minutes`。
- PR CI 的设计边界是不读取 production secret，并支持 fork 触发；真正无目标写权限的独立外部贡献者路径尚未实测，作为 0.x 已知限制在首个此类 PR 后补验，不再作为首个 Preview 的发布阻断项。
- Deploy 只允许从 `main` 手动触发，使用 GitHub `production` Environment，并在 checkout 前要求 `PRODUCTION_DEPLOYMENT_ARMED=true`。
- `repository_dispatch` 只进入无 checkout、无 secret、无 build/deploy 的 `rebuild-request` receipt；Webhook 不自动调用生产 Deploy。
- 当前单维护者阶段不把生产 Environment 或默认分支描述为已有独立 reviewer；任何 deployment branch policy 都必须在远程按 GitHub 计划配置并验收。新增第二名合格 `write` maintainer 后，再启用至少一名独立 required reviewer；workflow YAML 不把尚未建立的审批能力冒充为现状。
- Node `22.12` 为主门禁，Node 24 为兼容性门禁。
- A1/A2/B/C fixture 使用独立 matrix job。
- 上传的结果摘要不得包含 `.env`、平台配置或完整敏感日志。
- 增加 Dependabot、dependency review、CodeQL、secret scanning 和许可证检查。
- 更新 `validate-github-workflows.mjs`，验证 SHA allowlist，而不是要求可移动 tag 字符串。

### Phase 4 Gate

本地通过条件：完整树和 production tree 的 critical/high 均为 0；SBOM 可重现；所有依赖许可证已处置；所有 Action 引用为批准的 SHA；PR 不读取生产 secret；生产 Deploy 只能从 `main` 手动进入显式 arming 的 `production` Environment。

最终 G4/G6a 仍要求：净化后的唯一候选 commit 在托管 CI 中全绿，并对真实远程仓库的 Environment、deployment branch policy、arming 设置以及 GitHub 计划支持的审批能力留存证据。本地静态检查不能替代这项远程验收。

停止条件：仍有 critical/high；需要不受控 `--force`；fork PR 可接触生产 secret；Deploy 可绕过 `main`、人工触发或 arming 边界；文档把未配置的远程审批写成现有能力；Roadmap workflow 仍会误导或可误触发。

### Phase 4 执行结果

- OSS-0401 完成：Wrangler、Sanity/Vision、Sanity client、Astro、Sharp、React 与相关工具链按兼容批次升级；没有使用 `npm audit fix --force`。完整树和 production tree 的最终结果均为 0 critical、0 high、7 moderate、0 low。7 个受影响 package 汇聚为 Sanity CLI 路径中的 `smol-toml` DoS（`GHSA-v3rj-xjv7-4jmq`）和 `typeid-js -> uuid` buffer 边界检查缺失/完整性影响（`GHSA-w5hq-g745-h8pq`）两项上游 advisory；当前自动修复建议要求不兼容的 Sanity 回退，因此作为 Dependabot 与后续兼容升级的已知风险持续复核，不用于豁免 critical/high 门禁。
- 两项上游仍精确依赖旧版子包的路径使用 parent-scoped exact override：`@module-federation/dts-plugin@2.8.1 -> undici@7.29.0` 与 `@vercel/frameworks@3.29.0 -> js-yaml@3.15.1`。依赖树门禁核对声明、lock、实际安装路径和版本，并始终审核 `npm ls` 的结构化 `problems`，不把退出码 0 当作 clean tree 的替代证据；报告 override `invalid` 时只接受这两条精确形态。平台可选 orphan 必须从不兼容 OS/CPU 根和 lock 闭包算法证明，其他 `missing`、`extraneous` 或 `invalid` 一律失败。
- OSS-0402 完成：可重现 CycloneDX 1.6 SBOM 共 1600 个 components，其中 production 1209、development 119、optional-production 105、optional-development 158；Phase 4 当时提交副本的 SHA-256 为 `e1e029451fa1e4b09135e8312854288e406dce3ee37c45237c7525bf9f16c2c0`。许可证政策、Dependency Review 配置、精确 metadata override、`THIRD_PARTY_NOTICES.md` 和源码-only 分发边界已建立并由统一门禁读取；Phase 5 版本元数据变更后的当前 hash 见后文执行结果。
- OSS-0403 完成：PR CI 使用 Node 22.12 主门禁、Node 24 兼容门禁和 A1/A2/B/C 独立 fixture，不读取生产 secret；所有 workflow-like YAML 的 `uses:` 固定到批准的完整 SHA。`repository_dispatch` 与生产部署已经隔离，生产 Deploy 仅接受 `main` 的手动触发，并在 checkout 前检查显式 arming。
- 防御纵深残余：TruffleHog composite Action 本身已固定批准的 commit SHA，但其内部仍引用版本 tag 而非 digest 固定的容器镜像；首个 Preview 将其作为 P2 供应链增强持续跟踪，不把它误称为完整传递闭包固定。
- 本地已通过 fresh `npm ci`、完整树/production tree audit 和最终 `npm.cmd run test:phase4`。总门禁串联物理依赖树、SBOM、许可证、Phase 1 合规、framework audit、全 workspace typecheck 与四个初始化后 fixture；A1、A2、B、C 分别约 100、99、133、144 秒，均完成 Profile 构建、Worker runtime tests 与 Wrangler deploy dry-run并删除临时目录。Storefront/Studio 独立 build 与 `git diff --check` 也通过。
- 本阶段未创建候选 commit、push 或修改远程仓库，也未配置 GitHub Environment、执行真实部署或生产 API。因而 Phase 4 本地 Gate 通过并可进入 Phase 5，但托管候选 CI 与远程部署保护证据继续阻断 Public Release。

## Phase 5：建立公共文档、社区治理和版本制度

### 依赖

版权主体、支持联系人、治理负责人和版本规则已确定。

### 任务

#### OSS-0501：许可证和合规文件

计划新增：

- `LICENSE`
- `NOTICE`
- `TRADEMARKS.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/compliance/licensing-policy.md`
- `docs/compliance/ASSET_LICENSES.yml`

每个 tracked file 必须能映射到许可证或明确例外。合同、授权书、模特/物权 release 和 credential rotation register 只保存在私有证据包，不进入公共仓库。

#### OSS-0502：社区健康文件

计划新增：

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `GOVERNANCE.md`
- `MAINTAINERS.md`
- `.github/CODEOWNERS`
- `.github/ISSUE_TEMPLATE/bug.yml`
- `.github/ISSUE_TEMPLATE/docs.yml`
- `.github/ISSUE_TEMPLATE/feature.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

关键要求：

- `SECURITY.md`：0.x 只支持最新 Preview；使用 GitHub Private Vulnerability Reporting 和专用安全邮箱；安全问题不得进入公开 Issue。
- `SUPPORT.md`：社区支持 best effort、无免费 SLA；客户账号、凭据、部署和运营问题留在客户私有边界。
- `CONTRIBUTING.md`：Windows 使用 `npm.cmd`；PR 标注 A1/A2/B/C 影响；禁止客户数据、secret 和无权素材；说明 DCO。
- `CODE_OF_CONDUCT.md`：采用 GitHub 可识别模板，提供可工作的私密执行联系人。
- `GOVERNANCE.md`：初期采用 maintainer-led，不虚构委员会；明确 release、security embargo、Profile 合约和继任责任。
- Issue/PR 模板收集 framework version、profile、Node/npm、最小复现、脱敏配置和测试证据。

#### OSS-0503：公开 README 和版本元数据

README 至少包含：

- `0.x preview` 醒目标识；
- A1/A2/B/C Public Scope Matrix；
- C 不包含 Cart/Checkout 和交易后台；
- 无凭据、CLI-first Quick Start；
- 公开上游和客户私有下游关系；
- 外部账号和可能付费的服务；
- Known limitations、Roadmap、Security、Support、Contributing 和 License 链接；
- 全中性且权利清晰的截图。

已新增或更新：

- `CHANGELOG.md`
- `docs/release-policy.md`
- `docs/release-checklist.md`
- `.github/release.yml`
- 根及 workspace `package.json` 的 `license` 字段
- 根 `package.json` 的 `repository`、`homepage`、`bugs`、`keywords`、`packageManager`
- `.node-version` 或等价 Node pin

所有 package 继续保留 `private: true`。如果未来要发布 npm package，应另建 package 边界、`files` allowlist、`exports` 和独立审计，不属于本轮。

#### OSS-0504：版本对齐

- 明确 `v3` 是产品代际，`0.x` 是公开 SemVer 成熟度；或选择另一套无歧义规则。
- 先让 `gcss.project.schema.json` 和 `scripts/template/project-config.mjs` 接受完整 SemVer prerelease；同步 initializer 默认值和测试。
- 根版本、`gcss.project.json.frameworkVersion`、workspace 版本、CHANGELOG 和 Release title 必须遵循同一政策。
- 使用已确认的候选版本 `v0.3.0-preview.1`。
- 建立支持、弃用、迁移和 breaking-change 规则。

### Phase 5 Gate

本地通过条件：标准位置存在规范 LICENSE 和社区文件；README、Skill、Release note 和测试的能力声明一致；版本字段无冲突；全部本地 Markdown 链接、联系人精确值和文件覆盖门禁通过。

远程收口条件：净化候选默认分支上的 GitHub Community Profile 能识别这些文件；CODEOWNERS 实际解析；Private Vulnerability Reporting 可用；安全邮箱完成收件测试。它们在 Phase 6/7 形成 Release Gate 证据，不以本地文件存在代替。

停止条件：许可证仍含占位版权人；Security/CoC 联系方式不可用；公共文档引用私有资源；版本和支持承诺相互冲突。

### Phase 5 执行结果

- OSS-0501 完成：仓库采用原文 Apache License 2.0；`NOTICE` 使用 `Copyright 2026 Noodle Freeman`，项目标识由 `TRADEMARKS.md` 单列。fail-closed 许可覆盖门禁把 299 个候选文件逐一映射为 Apache-2.0、逐文件 CC0 媒体、规范许可证正文或第三方元数据例外；媒体清单当前覆盖 26 个文件和 77 个源码引用。
- OSS-0502 完成：贡献、行为准则、安全、支持、治理、维护者、CODEOWNERS、3 个 Issue Forms、chooser 配置和 PR 模板已建立。贡献采用 DCO 1.1、inbound=outbound、无 CLA；治理为 maintainer-led，社区支持为 best effort、无免费 SLA。当前单维护者默认分支政策明确为 `required_approving_reviews = 0`、`require_code_owner_review = false`，同时强制 PR、required checks、conversation resolution、linear history，并禁止 force push 与删除；CODEOWNERS 只负责路由。新增第二名合格 `write` maintainer 后必须升级为至少一次批准并启用 CODEOWNERS review。社区门禁验证 12 个文件、3 个 Issue Forms、3 份治理状态披露和 29 个负例；当前 Markdown 门禁验证 66 个文件中的 159 个链接。
- OSS-0503 完成：README 已使用 `ZUnfurl` 公共名称、0.x Preview 警示、四 Profile 矩阵、无凭据 Quick Start、账户边界、已知限制和公共治理入口。新增的中性首页截图已通过浏览器视觉复核并登记到资产 provenance；CHANGELOG、Release Policy、Release Checklist 和 GitHub Release category 配置已建立。
- OSS-0504 完成：Schema 与 JavaScript validator 共享完整 SemVer prerelease 语义；根和 9 个 workspace 共 10 个 manifest 均为 `0.3.0-preview.1`、`private: true`、`license: Apache-2.0`，并与项目契约、四份 fixture、lockfile 和公开文档一致。源码-only 发布边界不提供任何 `npm publish` 路径。
- 版本与元数据变化后重新生成的 CycloneDX 1.6 SBOM 仍为 1600 个 components，当前 SHA-256 为 `6c122c2713fbe378f1a889f8acc89913ae33f7765379b21b823ebcec81d7f738`；完整树和 production tree 继续保持 0 critical、0 high、7 moderate、0 low。
- fresh `npm ci` 与 `npm.cmd run test:phase5` 通过。总门禁覆盖许可证映射、社区文件、Markdown 链接、版本一致性、物理依赖树、SBOM、依赖许可证、UTF-8、资产、公开文本、framework audit、全 workspace typecheck，以及 A1/A2/B/C 初始化后 fixture；四个 fixture 分别约 96、99、133、144 秒，均完成对应 Profile 构建、Worker runtime tests 和 Wrangler deploy dry-run并清理临时目录。
- Node 22.12 主 CI 已接入 `test:phase5:metadata`。本地只能验证已批准安全邮箱在全部公共入口中一致，不能证明实际收件、GitHub Private Vulnerability Reporting 或 Organization 权限；这些远程证据继续阻断 Public Release。
- 本阶段未 commit、push、创建候选远程、修改 Git 历史、发送测试邮件、配置 GitHub、部署、tag 或 Release。Phase 5 本地 Gate 通过并可进入 Phase 6，但不授权任何远程写入。

## Phase 6：生成净化根历史并复用 Private 公共候选仓库

### 依赖

G1 至 G5 全部通过。所有远程写入仍需用户明确授权。

### 任务

#### OSS-0601：扫描原始私有历史

- [x] 使用 Gitleaks `8.30.1` 与 TruffleHog `3.97.0` 两类独立专用 scanner 检查本地全部 refs、origin 和额外非 commit ref 快照。
- [x] 使用脱敏 PII/IP 规则人工复核客户名、邮箱、电话、域名、订单形数据、生产 URL、内部路径和大对象。
- [x] 盘点并扫描旧 Actions runs/logs，同时核对 artifacts、release、tag、branch、Pages 及其他仓库侧对象。
- [x] 两类专用 scanner 均为 0 finding，未发现需要轮换的 credential；若后续扫描发现暴露则仍须先轮换并验证失效。
- [x] 生成不回显 secret 值的仓库外私有证据包及仓库内脱敏摘要。

扫描结论：原始历史本地与 origin 的 PII/IP 规则各命中 39 项；3 份旧 Actions 日志归档共 9 个文件、规则命中 70 项。专用 secret scanner 为 0 不解除这些阻断，旧历史和旧日志均保持 `blocked`。

#### OSS-0602：归档旧历史并准备单一净化根历史

推荐流程：

1. 冻结批准的 source tree，记录当前 HEAD、worktree 精确 manifest、门禁版本和结果。
2. 对当前仓库全部 refs 生成可验证的私有离线 `git bundle`，归档不得进入公共候选树。
3. 按批准的文件清单在新的本地目录物化净化树，不复制旧 `.git`、构建产物、缓存或环境文件。
4. 在新目录初始化独立 Git 元数据；创建根提交前再次核对作者身份和单一根历史约束。
5. 对净化树和随后获批的根提交再次执行 secret、PII、资产、许可证和文件清单扫描。
6. 比较 source tree 与候选 tree；差异只能是 manifest 明确记录的批准排除。
7. 保存私有映射：原 HEAD、原历史 bundle hash、候选 commit、tree manifest、扫描器版本和结果。
8. 只有取得独立 commit 授权后，才使用批准的组织或 noreply 身份创建单一根提交。当前拟定的根提交身份为 `Noodle Freeman` 加 GitHub ID-based noreply 邮箱，并使用 DCO `Signed-off-by`；把该身份写入计划不构成 commit 授权，授权时仍须连同精确作者、邮箱和提交消息一并确认。

执行结果：原全部 refs 的私有离线 bundle 已生成并通过完整性验证；唯一净化根提交为 `e50b0cec829cee08397bbc87b7ed483e8ee7afda`，无父提交，Author/Committer 与 DCO 均为批准的 `Noodle Freeman` GitHub noreply 身份。根提交的 303 个 blob 与冻结 manifest 逐字节一致，Gitleaks `8.30.1`、TruffleHog `3.97.0` 和脱敏 PII/IP 规则对本地根历史与实际 GitHub origin 均为 0 finding。后续 Release evidence schema 的固定 `operatorAttestation` 枚举行被 Gitleaks `generic-api-key` 规则误判；Phase 8 采用逐字节冻结的 `.gitleaks.toml`，只在精确规则、唯一 schema 路径和整条固定枚举行三者同时匹配时排除，并让本地历史、origin、额外 refs 与 Actions 日志扫描统一使用该策略。任何扩大路径、规则、条件或整行内容的改动都会 fail-closed；每次真实扫描还会以正确行、错误路径和错误行三组探针验证 Gitleaks `8.30.1` 的实际行为。

不得把含旧历史的当前仓库直接设置为 Public。净化根提交替换远程前，当前仓库必须保持 Private；旧提交不得重新合并进候选历史。

#### OSS-0603：在当前 Private 仓库容器中替换为净化历史

执行状态：

- [x] 删除并核验 3 个旧 Actions runs/logs；旧日志端点均返回 `404`，旧 artifacts/caches 为 0。
- [x] 以 `--force-with-lease` 将远程 `main` 替换为单一净化根历史；实际 origin 已重新扫描为 0 secret/PII/IP finding。
- [x] 复核 branches、tags、Release、Issues、Discussions、wiki、Pages、deployments、environments、hooks、secrets、variables、deploy keys、LFS、packages 和 forks；未发现旧历史对象残留。后续候选 CI 产生的平台对象单独按结构审计，不与旧对象混称。
- [x] GitHub 自动生成的 3 个 Dependabot 大版本 PR 已关闭；截至 2026-08-16、源候选 `2b7aa20...` 的审计快照连同已合并候选 PR #4 共保留 4 个只读 `refs/pull/*/head`。四者均只使用批准的净化根、无 merge ref，并纳入可达历史审计；后续修复 PR 产生的 head 只以最终审计为准。
- [x] 保持 `isTemplate=true`；Private/Free 下不可用的 ruleset、branch protection、CodeQL 上传和 PVR 已作为平台限制记录，不伪装成已启用。
- [x] 已在单独确认后创建 `ZUnfurl` Organization，并将仓库转移、改名为 `ZUnfurl/zunfurl`；复核结果为 Private、Template、默认分支 `main`。
- [x] 已通过 sudo-protected GitHub UI 人工复核 GitHub Apps：仓库和 Organization 均显示无已安装 App。
- [x] 未配置任何客户或生产 secret。
- [x] 已通过 GitHub UI 精确复核 Codespaces secrets：仓库显示无 secrets。REST API 因当前 token 未授予 Codespaces scope 返回 `404`，不将该响应误作空结果；零 secret 结论仅以该人工页面证据补足。
- [x] 提交态 6 个 workflow 与候选完全一致；运行时另有 2 个精确 GitHub-managed dynamic workflow。唯一 `copilot` Environment 为平台生成的空结构，已验证为 0 secrets、0 variables、0 deployments、0 protection rules 且无 branch policy。
- [x] PR #5 由当前唯一维护者 `@mp4102` 提交并合并；合并前所有实际执行的自动门禁均为 `SUCCESS`，合格独立维护者批准为 `0`。Private 计划下 `SKIPPED` 的 CodeQL/Dependency Review 与合并后的 Copilot `COMMENTED` review 均不计作独立批准。
- [ ] 最终 G6a 结束后清空候选 CI 产生的 Actions caches，并以精确仓库身份、净化根和两项人工 attestation 重新运行 `--require-clean`；cache 非零时保持 fail-closed。

完成 cache 清场且操作员已经在当前 repository ID 上重新查看两处 UI 后，使用以下精确命令；两个 attestation 参数是本次人工事实声明，不是 API 自动证明，也不得复制到其他仓库：

```powershell
npm.cmd run audit:phase6:github:clean -- --attest-codespaces-secrets-empty --attest-github-apps-reviewed
```

上述每一项都是远程写入或破坏性历史操作，不因进入 Phase 6 自动获批。若 Organization 创建、仓库转移或目标 slug 发生冲突，立即停止；不得临场新建第二个公共候选仓库或移动 remote。

### Phase 6 Gate

通过条件：当前仓库容器只保留获批净化 refs；旧 Actions 历史和仓库侧残留已清场；公共 tree 与批准 source tree 可证明对应；原始历史 bundle 可验证且保持私有；源工作区未受破坏。

停止条件：任何客户素材、个人邮箱、secret 或内部文档进入候选；tree 差异无法解释；候选仓库被提前切为 Public。

执行结果：OSS-0601、OSS-0602 和 OSS-0603 的历史替换、旧对象清场、目标身份迁移与人工访问复核均已完成；远端为 `ZUnfurl/zunfurl` Private Template repository，默认分支 `main`。截至 2026-08-16、源候选 `2b7aa20...` 的转移后审计快照为 23 个 Actions runs、4 个 caches、4 个只读 closed-PR head refs、2 个 GitHub-managed dynamic workflows 和 1 个空 `copilot` Environment；runs 与 refs 均只使用净化历史。该快照不是冻结计数：本轮修复 PR/CI 会继续增加净化对象，最终只以合并后的精确审计为准。cache API 不提供对应 commit/run，因此快照中的 4 个及随后产生的全部 caches 都必须在 Public Gate 前删除并复审为 0。GitHub 不允许删除 closed PR 的只读 hidden refs，因此 Gate 以“无开放 PR、无普通 PR branch、无 merge ref、保留 head ref 全部同一净化根”为准。单维护者治理已如实冻结：`required_approving_reviews = 0`、`require_code_owner_review = false`，但仍强制 PR、required checks、conversation resolution、linear history，并禁止 force push 和删除；CODEOWNERS 只做路由。PR #5 由唯一维护者在所有实际执行的自动门禁为 `SUCCESS` 后合并，合格独立维护者批准为 `0`。Phase 6 当前为 `blocked-by-final-cache-purge-and-reaudit`；最终 G6a、G6b 与远程安全 Gate 仍未完成，独立审核不再被虚构为单维护者阶段的当前 Gate。

## Phase 7：全新环境发布候选验证

### 依赖

复用后的 Private 公共候选仓库已替换为单一净化根历史，并完成当前 GitHub 计划在 Private 状态下可用的安全配置。

当前 GitHub Free 计划的只读实测与官方产品边界表明：Private repository 不能提前启用目标 ruleset/branch protection，Private Vulnerability Reporting 也只能在仓库 Public 后启用。若发布前不升级计划，这些项目不伪装成 Phase 6/7 已完成项，而是 Phase 8 切换 Public 后、任何 tag/Release 前的立即加固 Gate。

### 任务

#### OSS-0701：Private clean-room 依赖验证

从全新隔离环境经最小临时仓库读取权限 checkout 候选仓库；环境不得含生产 secret、私有 registry、全局内部包或本地路径依赖。Private checkout 使用的临时 `GITHUB_TOKEN` 只证明仓库读取，不得称为匿名或完全无凭据。

至少验证：

- Windows + Node 22.12；
- Linux GitHub Actions + Node 22.12；
- Node 24 兼容性；
- lockfile 可执行 `npm ci`；
- 无私有 registry、私有路径和本地隐藏依赖。

#### OSS-0702：完整本地门禁

```powershell
npm.cmd ci
npm.cmd run template:scan
npm.cmd run test:assets
npm.cmd run test:content-encoding
npm.cmd run framework:audit
npm.cmd run test:template
npm.cmd run test:fixtures
npm.cmd run test:sanity
npm.cmd run test:commerce
npm.cmd run test:shopify-summary
npm.cmd run test:worker
npm.cmd run typecheck
npm.cmd run build
npm.cmd run studio:build
npm.cmd --workspace gcss-worker run deploy -- --dry-run
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
npm.cmd audit signatures
git diff --check
git fsck --full --strict
```

如果 Production Backup/Restore 已移出实现，验证命令只能检查 roadmap 边界，不得暗示真实备份或恢复成功。

#### OSS-0703：生成发布证据摘要

Phase 7 只生成仓库外的私有 pre-tag 证据，不向候选树写入会改变候选 SHA 的证据文件。私有完整证据至少记录：

- 净化 candidate commit/tree SHA；
- 原始私有 source commit SHA（不得进入公共摘要）；
- lockfile SHA-256；
- 资产 manifest SHA-256；
- Node/npm/OS 版本；
- 四个 fixture 结果；
- npm audit 统计；
- SBOM SHA-256；
- Linux CI URL；
- secret/PII/IP 扫描器名称和版本；
- Known limitations 和 Roadmap 边界；
- 检查时间和责任人。

`docs/compliance/release-evidence.schema.json` 与 `scripts/compliance/validate-release-evidence.mjs` 保留为 Experimental 研究工具，不再作为 `v0.3.0-preview.1` 的发布阻断项，也不上传 detached evidence asset。首个 Preview 的公共证据收敛为签名 annotated tag、GitHub Actions 结果、可重现 `sbom.cdx.json`、`SHA256SUMS` 与 Release Notes；原始扫描日志、操作者身份映射和完整执行记录继续留在仓库外私有证据包。若未来要把 detached evidence 升格为强制 Gate，必须单独评审其维护成本和威胁模型。

### Phase 7 Gate

通过条件（G6a）：精确候选 commit 在经授权的全新隔离 checkout 可复现；Windows/Linux required checks 全绿；工作树干净；证据摘要无 secret。真正无仓库权限的匿名 clone 属于 Public 后、tag 前的 G6b，不得在 Private 状态伪造完成。

已完成的前序证据：`2b7aa20efdc57564bbc36c720d208b64d1a2f3f5` 的 `main` run `31925593834` 有 7 个 job 全绿；`53c5f6d1fa650c168d434ec9c668fca1c0704ba9` 的 `main` run `31928082328` 也有 7 个 job 全绿，同 SHA 的 push Secret Scan run `31928060750` 成功。后者仍早于单维护者治理与客户仓库设置手册的最终提交；任何新提交均必须拥有自己的 G6a 运行和脱敏证据，不能复用这些前序结果宣称最终 Gate 通过。

停止条件：候选提交没有自己的 CI；任何步骤依赖生产 secret；安装或构建依赖本机缓存；声明与实现不一致。

## Phase 8：配置 GitHub 并执行公开发布窗口

### 依赖

G0 至 G6a 全部通过；Public 获得独立授权。tag 与 GitHub Release 已获得持续授权，但仍只能在匿名 G6b 和必要远程安全 Gate 通过后执行。

### 任务

#### OSS-0801：配置公共仓库元数据

推荐元数据：

- Description：`Static-first Astro framework for brand sites, Sanity CMS, and read-only Shopify retail catalogs. 0.x preview.`
- Topics：`astro`、`brand-site`、`cloudflare-workers`、`headless-cms`、`product-catalog`、`sanity`、`shopify`、`site-framework`、`static-site`、`typescript`、`website-template`
- 保持 `isTemplate=true`。
- Homepage 只在有正式文档或中性 demo 后填写。
- 使用权利清晰的中性 social preview image。
- Issues 开启；Wiki 关闭；Discussions 按维护能力决定。
- 推荐只保留 squash merge，并开启合并后自动删除分支。

#### OSS-0802：配置公开前后 GitHub 安全和规则

- Default workflow permission 保持 `contents: read`。
- 不允许 Actions 创建或批准 PR。
- `allowed_actions` 限制为 GitHub 官方和逐项批准的 Action。
- 禁止 checkout、fetch、解析 artifact 或执行 PR head 的高风险 `pull_request_target`；唯一例外是冻结的 metadata-only DCO publisher，它只执行受信任默认分支代码、分页读取 PR commit metadata，并以最窄 `statuses: write` 向精确 PR head 发布 DCO 状态。fork PR 不取得 secrets。
- 启用 dependency graph、Dependabot alerts/updates、dependency review、CodeQL、secret scanning、push protection 和 Private Vulnerability Reporting。
- `main` 在当前单维护者阶段必须通过 PR、required checks、解决全部 conversation，并要求 linear history；`required_approving_reviews = 0`、`require_code_owner_review = false`，禁止 force push 和删除。CODEOWNERS 只用于责任与 review request 路由，不构成独立批准。
- `v*` tag 必须使用已登记的专用 signing key 创建签名 annotated tag；已发布 tag 不移动、不复用。
- 未来生产 Deploy 必须使用 Environment 和最小权限 token；独立人工审批只在 GitHub 计划支持并经远程验收后声明，否则继续依赖人工 dispatch，并另行设计真正受保护的发布边界。

公开前先完成当前计划允许的 Actions 权限、允许列表、仓库元数据和安全开关。ruleset、branch protection、Private Vulnerability Reporting 及其他 Public-only 控制必须在切换 Public 后立即启用并验证；在验证成功前不得创建 tag、Release 或宣传安全入口已可用。若希望这些控制在公开前已生效，必须先升级到支持 Private repository 规则的 GitHub 计划并重新验收。当前单维护者规则必须按上一条原样落地；新增第二名身份独立、列入名册且具有 `write` 权限的合格维护者后，必须在后续合并前升级为 `required_approving_reviews >= 1` 与 `require_code_owner_review = true`，其余保护不得弱化。

Template 创建的客户仓库不会自动继承上游全部安全设置。`docs/customer-repository-settings.md` 已为客户 Organization 提供独立 bootstrap 清单，并由客户文档与公共能力门禁持续校验。

Phase 8 Lite 的远程设置以 `docs/compliance/github-public-security-policy.json` 为机器契约；`scripts/tests/validate-phase8-github-security.mjs` 在 Private 候选阶段只运行 fail-closed self-test。仓库切为 Public 并完成设置后，必须从干净的 `main` checkout 运行 `npm.cmd run audit:phase8:github:security`，核对 repository ID、唯一 `main` ruleset、11 个既有 GitHub Actions contexts、Actions allowlist、PVR、Immutable Releases、安全扫描配置以及公开 alerts 边界。首个 Preview 不创建专用 release Team、tag-creation ruleset 或 detached evidence Gate。

#### OSS-0803：最终 Go/No-Go

发布负责人逐项核对本文 Definition of Done，记录最终 commit SHA、仓库设置快照、required checks 和授权记录。任何一项 P0 未完成即 No-Go。

#### OSS-0804：执行公开窗口

严格顺序：

1. 导出并保存 Private 候选仓库设置、当前计划可用的安全功能和明确不可用项快照。
2. 对最终 refs 执行一次 secret/PII/IP 扫描，并确认无 Actions artifacts、Release assets 或 cache；不再重复下载并重扫全部历史 Actions 日志。
3. 依据 2026-08-16 “完成 Phase 8 后暂停”的明确授权，将净化候选仓库切为 Public。
4. 立即启用并验证 Public 状态下的 ruleset/branch protection、Private Vulnerability Reporting、Dependabot/CodeQL/secret scanning，以及计划支持的其他安全控制。
5. 复核 Public、Template、默认分支、LICENSE、Community Profile、Security 和规则状态；任何关键控制不可用时停止 tag/Release，并记录仓库已经发生过公开暴露，不得把恢复 Private 表述为从未公开。
6. 清空本地 GitHub 凭据后通过公开 HTTPS URL 执行真正匿名 fresh clone，验证精确 SHA、Quick Start 和公开门禁。真正无目标写权限的外部 fork PR 留作 0.x 已知限制，在首个真实外部贡献者 PR 后补验。
7. 依据 2026-08-16 已授予且仍有效的持续授权，创建并 push 签名 annotated tag `v0.3.0-preview.1`。
8. 依据同一持续授权创建 GitHub Pre-release。
9. 附加 `sbom.cdx.json` 与 `SHA256SUMS`，在 Release Notes 记录候选 SHA、CI、Known limitations 和 Roadmap；不附带 detached evidence、`node_modules` 或未经审核的二进制。
10. 验证 `Use this template` 创建独立 Private 测试项目的路径。

### Phase 8 Gate

发布成功的定义不是“仓库已经 Public”，而是：净化后的精确 commit 已公开、可由匿名环境复现、功能声明与实现一致、漏洞报告入口可用，并且维护者具备持续响应能力。

## Phase 9：发布后观察与收口

Owner 已决定：完成 Phase 8 并记录执行情况后暂停。D+1、D+7 与 D+30 任务不自动启动，只有收到新的明确指令才进入 Phase 9。

### D+1

- [ ] 检查 License 识别、Community Profile、模板按钮、Release 和全部公开链接。
- [ ] 监控失败 Actions、Dependabot、CodeQL、secret scanning 和安全报告入口。
- [ ] 从未登录环境再次 clone，执行最短 Quick Start。
- [ ] 如发现 secret，立即吊销/轮换；不要先依赖删除历史。

### D+7

- [ ] 用 `Use this template` 创建一次独立 Private 测试项目，并重新初始化 A1/A2/B/C。
- [ ] 核查 branch rules、environment 审批、push protection 和 fork PR 边界。
- [ ] 对 Issue、文档误解、CI 失败和安全报告每日完成 P0/P1 分诊。
- [ ] 检查公共链接是否引用私有文档、占位域名或不存在的平台资源。
- [ ] 发布首个文档或兼容性补丁，不等待大版本。

### D+30

- [ ] 发布首次维护复盘：模板使用、CI 失败、Issue 类型、修复时效和未解决风险。
- [ ] 关闭首批 P1，发布一个 `0.x` patch 或 prerelease。
- [ ] 复查 dependency、license、SBOM 和资产 provenance。
- [ ] 根据真实采用情况排序 Draft Preview、Production Backup 和 Disaster Recovery Restore；不自动承诺日期。
- [ ] 为每个 roadmap 能力建立独立验收契约、数据写入授权和恢复回滚方案。
- [ ] 定义进入 `1.0` 的量化门槛；在门槛达成前始终保留 Preview 标识。

## 6. P0、P1 与公开 Backlog

### 6.1 P0：不允许带入 Public

- 许可证、版权主体、素材和商标权利不明。
- 客户品牌、人物、产品、个人信息或内部标识仍在公开树或历史中。
- 中文内容损坏或法律模板含真实未确认事实。
- A1/A2/B/C 初始化后无法通过自己的门禁。
- C 仍暗示 Cart/Checkout 或完整交易能力。
- Draft Preview、Production Backup、Disaster Recovery Restore 被描述为已实现。
- npm critical/high 未清零。
- 原始和净化历史未经过专用 secret/PII/IP 扫描。
- Actions 未固定 SHA、fork PR 可接触 secret，或生产 Deploy 可绕过审批。
- 缺少 `LICENSE`、`SECURITY.md` 或可工作的私密漏洞报告入口。
- 全新匿名 clone 无法复现。
- Phase 8 Public 授权或 tag/Release 的既有授权被撤回。

### 6.2 P1：可进入公开 Backlog，但必须有负责人和目标版本

- 英文完整文档或 `README.en.md`。
- Discussions、公开 Q&A 和贡献者体验优化。
- 更完整的 Astro/Worker 静态检查、覆盖率和浏览器端到端测试。
- 自动 OpenSSF Scorecard 和更丰富的 provenance attestation。
- 完整 demo 站、教程和迁移样例。
- 真实 Draft Preview、Production Backup、Disaster Recovery Restore。
- Cart/Checkout；这是独立产品扩展，不作为当前 C 的缺陷偷偷补入。

低成本社区文件、CHANGELOG、Issue/PR 模板和版本政策虽然可归类 P1，但本计划仍要求在首个 Preview tag 前完成，以降低首次公开后的维护噪音。

## 7. 发布证据规范

每个 Gate 的证据至少记录：

- Gate 和任务编号；
- 精确 commit SHA；
- 命令和参数；
- Node、npm、OS 和 scanner 版本；
- 开始/结束时间；
- exit code 和摘要；
- 责任人或执行代理；
- 失败、例外、到期日和复查人；
- 相关 CI URL 或本地证据路径。

公共证据只保留脱敏摘要。以下内容只能留在私有证据包：

- 原始 secret scanner 命中值；
- 客户合同、授权书、模特/物权 release；
- credential rotation register；
- 私有平台 ID、内部路径和完整 Actions 日志；
- 可能帮助绕过安全控制的细节。

## 8. 版本与 Release 规则

- `v3` 作为产品代际时，必须在版本政策中说明它不等于当前 SemVer major。
- 首个公共版本确定为 `v0.3.0-preview.1`。
- 根 `package.json.version`、`gcss.project.json.frameworkVersion`、workspace 版本、CHANGELOG、tag 和 Release title 按批准的同一政策更新。
- 所有 package 继续 `private: true`。
- Release tag 必须指向已经通过 G6a 与 G6b 的唯一 commit，并使用签名 annotated tag。
- 已发布 tag 不移动、不重用。
- Preview 阶段只支持最新发布版本，是否回补安全修复由 `SECURITY.md` 明确。

## 9. 回滚与事故处理

### Public 前

- 候选仓库保持 Private；任何 Gate 失败即暂停。
- 原始私有历史 bundle 与权利链证据保持离线、私有且不可被候选历史覆盖；本地候选失败时只重建未提交候选，不修改远程。
- 当前 Private 仓库容器只有在单一净化根提交复核通过并取得独立授权后，才允许清场旧 Actions 对象和替换远程历史；force-push、转移/改名和 Public 切换分别授权，任一步失败即停止。

### Public 后

- 普通代码缺陷：revert 或发布补丁，不重写公共历史。
- Secret 泄露：先吊销/轮换，再清理历史、发布安全说明并检查下游。
- 权利问题：立即下架对应素材、撤回受影响 Release、发布说明并联系权利人。
- 功能声明错误：同步修正文档、Skill、测试和 Release note，不只修改 README。
- 把仓库改回 Private 不等于重新获得保密性，不作为事故恢复方案。

## 10. 角色与待决事项

| 编号 | 决策 | 已确认结果 | 状态/实施阶段 |
| --- | --- | --- | --- |
| D-01 | 公共仓库所有者 | `ZUnfurl` Organization；目标仓库 `ZUnfurl/zunfurl` | 已确认并实施；Phase 6 |
| D-02 | 历史策略 | 复用当前 Private 仓库 identity；旧历史私有离线归档；单一净化根历史替换远程旧历史 | 2026-08-16 修订；Phase 6 实施 |
| D-03 | 代码许可证 | Apache-2.0 | 已确认；Phase 0 |
| D-04 | 文档许可证 | 首个 Preview 与代码同为 Apache-2.0 | 已确认；Phase 0 |
| D-05 | 演示素材政策 | 自有/CC0，逐项 manifest | 已确认；Phase 0 |
| D-06 | 版权主体和年份 | `Noodle Freeman`；`2026`；不另设 governing-law 条款 | 已确认；Phase 0 |
| D-07 | 项目名和 Logo | `ZUnfurl`；首个 Preview 无独立 Logo | 已确认；Phase 0 |
| D-08 | 贡献许可 | DCO 1.1 + inbound=outbound | 已确认；Phase 0 |
| D-09 | 治理模型 | Maintainer-led | 已确认；Phase 5 实施 |
| D-10 | Security/CoC 私密联系人 | `mp4102@gmail.com`；独立替代联系人暂无 | 已确认；Phase 0 |
| D-11 | 社区支持 | Best effort，无 SLA | 已确认；Phase 0 |
| D-12 | Discussions | 有维护能力后启用 | 已确认；Phase 8 实施 |
| D-13 | 首个公共版本 | `v0.3.0-preview.1` | 已确认；Phase 0 |
| D-14 | 版本对齐方式 | 先支持完整 SemVer prerelease，再让根、契约、workspace 和 lockfile 对齐 | 已确认；Phase 0 |
| D-19 | Release 产物与 FFmpeg | source-only；`ffmpeg-static` 仅 dev 使用并披露 | 已确认；Phase 0 |
| D-20 | Schema namespace | `urn:gcss-v3-site-framework:schema:project:v1`；不声称控制 `gcss.dev` | 已确认；Phase 0 |
| D-21 | 既有成果权利链 | 权利主体确认全部拥有或已获再许可，且无例外 | 已确认；Phase 0 |

执行角色建议：

- 决策与发布授权人：版权主体/仓库 Owner。
- 实施负责人：维护者或 Codex，在每个阶段按任务编号提交变更。
- 权利复核人：版权主体，必要时外部律师。
- Security 联系人：至少一名主联系人；如条件允许，增加独立替代联系人。
- Release maintainer：负责 Go/No-Go、tag、Release 和证据摘要。
- Review / Code Owner：当前只有一名合格 `write` maintainer，按单维护者政策不要求也不声称独立批准；CODEOWNERS 只做责任路由。新增第二名合格 `write` maintainer 后，升级为至少一次批准和 CODEOWNERS review。

## 11. Definition of Done

只有以下全部勾选，才允许执行 Public 窗口：

- [x] Public Scope Matrix 已批准，C 和 Roadmap 语义在所有公共表面一致。
- [x] 版权主体、许可证、NOTICE、商标和贡献许可已确认。
- [x] 每个候选 tracked/unignored file 和素材都有许可证或明确例外。
- [x] 29 个旧媒体资产已全部处置，新资产 100% 进入 manifest。
- [x] 客户品牌、人物、产品、真实域名、未批准个人邮箱和内部标识已清除；安全联系邮箱按精确路径和内容批准。
- [x] 9 个中文文件已重写，编码测试和三语言构建通过。
- [x] 四个初始化后客户 fixture 在干净临时目录全绿。
- [x] C 不依赖 `example-product`，Contact 紧急关闭有效。
- [x] critical/high npm 漏洞为 0，依赖许可证和 SBOM 已复核。
- [x] 所有 Actions 固定完整 SHA，fork PR 不接触 secret。
- [x] `LICENSE`、`SECURITY.md`、社区治理和 Issue/PR 模板已建立并通过本地门禁。
- [x] 单维护者治理已明确为 0 required approval、关闭 CODEOWNERS review，同时保留 PR、required checks、conversation resolution、linear history、禁止 force push 与禁止删除；第二名合格 `write` maintainer 的升级触发条件已冻结。
- [x] 根、契约、workspace、fixtures、lockfile、CHANGELOG 和 Release 版本一致。
- [x] 专项扫描结论已记录：原始私有历史的 PII/IP 规则命中 39 项、旧 Actions 日志命中 70 项，均为 `blocked` 私有归档；净化历史与实际候选远端的 secret/PII/IP 扫描为 0 finding。
- [ ] Private 公共候选仓库在 Windows/Linux、Node 22.12/24 全绿。
- [ ] 匿名全新 clone 可执行 Quick Start 和完整门禁。
- [ ] 发布证据摘要包含精确 commit、校验和、环境和已知限制。
- [ ] 当前仓库在历史替换和全部远程 Gate 通过前保持 Private；旧提交、Actions 日志和仓库侧残留未进入公开状态。
- [x] Public 已通过 Owner“完成 Phase 8 后暂停”的指令获得独立明确授权；tag 与 GitHub Release 的持续授权仍有效。

## 12. 官方参考

- [GitHub：Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
- [GitHub：Community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [GitHub：Setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [GitHub：Quickstart for securing a repository](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository)
- [GitHub：Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub：Creating a repository from a template](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)
- [GitHub：Dependency review](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action)
