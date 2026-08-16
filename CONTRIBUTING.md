# 为 ZUnfurl 贡献

感谢你改进 ZUnfurl。当前项目以 `0.x Preview` 发布：接口、Schema 和迁移规则仍可能发生 breaking change，提交必须清楚说明影响范围，不能把 roadmap 功能描述为已交付能力。

参与项目前请阅读 [行为准则](CODE_OF_CONDUCT.md)、[支持范围](SUPPORT.md)、[安全政策](SECURITY.md) 和 [许可政策](docs/compliance/licensing-policy.md)。安全漏洞不要进入公开 Issue 或 Pull Request。

## 先确认贡献属于项目边界

ZUnfurl 是静态优先的品牌站点框架。Profile 合约如下：

| 交付层级 | 项目契约 | 当前边界 |
| --- | --- | --- |
| A1 | `static-brand` + `contactForm=false` | 完全静态，不启用真实表单 API |
| A2 | `static-brand` + `contactForm=true` | 静态站点加最小 Contact Worker |
| B | `cms-brand` | Sanity 页面 CMS；不启用 Shopify 或商品 CMS |
| C | `retail` | Retail Catalog & Content Foundation；Sanity 商品内容加 Shopify 只读目录映射 |

C 不提供 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存。Backup、Restore 和 authenticated editorial Preview 仍是 roadmap。提出功能或修改时，请逐项说明 A1、A2、B、C 是受影响、不受影响还是不适用，并解释禁用模块能否继续完全裁剪。

以下方向不属于当前公开 Preview：全站 SSR、常驻应用服务器、自定义 DAM/ERP/PIM、交易后台、自建 Checkout、把 Shopify 交易主数据写入 Sanity，或让 Worker 代理全部上游 API。

## 开始之前

1. 搜索现有 Issue 和 Pull Request，避免重复工作。
2. Bug、文档改进和较小功能建议使用相应 Issue form。纯错别字可直接提交小型 PR。
3. 大型功能、Profile 合约变更、公开 API 变更或 breaking change 应先建立 Issue，确认边界后再实现。
4. 漏洞、凭据泄露或可被利用的供应链问题按 [SECURITY.md](SECURITY.md) 私密报告。

公开 Issue 只放可公开、已脱敏的最小信息。不得上传客户仓库、客户名称、真实域名、生产 dataset/project ID、订单、联系人、日志中的个人数据、token、secret、私钥或未经授权的品牌素材。

## 本地开发

仓库以 `.node-version` 和根 `package.json` 的 `engines`、`packageManager` 为运行时依据。Windows PowerShell 使用 `npm.cmd`：

```powershell
npm.cmd ci
npm.cmd run test:phase5
git diff --check
```

开发或排查单一 Profile 时可运行对应门禁：

```powershell
npm.cmd run test:profile:static-brand
npm.cmd run test:profile:cms-brand
npm.cmd run test:profile:retail
```

默认 fixtures 不需要生产 secret。不要为了让测试通过而加入真实 Cloudflare、Sanity、Shopify 或 Resend 凭据；需要真实外部读写的集成验证必须在独立、获授权的私有边界完成。

实现时请遵守以下契约：

- `gcss.project.json` 是身份、Profile、语言、内容源、Contact 和法律页面的唯一提交态来源；
- 保持内部 `gcss-*` workspace package 名称稳定；
- 禁用服务不能因缺少对应 secret 而失败，且必须从 UI、route、schema、env、workflow 和手册中裁剪；
- 新项目初始化先 dry-run，再执行受控写入；
- 中文文档和实质修改的 Python 模块遵守仓库 `AGENTS.md`；
- 不提交 `node_modules/`、`dist/`、缓存、日志、`.env*`、`.dev.vars*` 或本地 agent 元数据。

## DCO 1.1 与贡献许可

本项目使用 [Developer Certificate of Origin 1.1](https://developercertificate.org/)（DCO），不要求 Contributor License Agreement（CLA）。每个人类贡献者的每个 commit 都必须包含本人添加的 `Signed-off-by` trailer：

```text
Signed-off-by: Contributor Name <contributor@example.com>
```

Git 可以自动添加：

```powershell
git commit -s -m "fix(scope): 简短说明"
```

遗漏时可在尚未发布且不会覆盖他人工作的前提下为自己的 commit 补签；一个 PR 中的每个人类贡献 commit 都必须分别满足 DCO。不得替他人签署，也不得复制无法代表本人确认的身份。签署使用你有权用于这一确认的姓名或稳定公开身份及有效邮箱；DCO 记录会随公开 Git 历史长期保存并可能再分发。首个 Preview 不接受 `Co-authored-by` 多作者 commit；请把不同作者的工作拆成各自签署的 commit。

唯一自动化例外是 GitHub REST metadata 同时证明为 GitHub 官方 `dependabot[bot]` 身份、固定 bot ID、固定 noreply 身份且 GitHub signature verification 为 `verified/valid` 的 Dependabot 依赖更新。它被视为仓库配置触发的机器更新，不冒充自然人的 DCO 声明；合并前仍必须通过依赖许可、SBOM、漏洞和完整 required checks。显示名称、邮箱或提交内容相似的其他 bot 不得使用该例外。除这一精确例外外，所有 commit 都按前述 DCO 规则处理。

所有被接受的代码、文档、Skill、示例和法律文本示例均按 [Apache License 2.0](LICENSE) inbound=outbound。PR 描述中的单方附加条款不能改变该规则。媒体资产必须进入逐文件 [资产许可清单](docs/compliance/ASSET_LICENSES.yml)；第三方材料必须保留上游许可和来源，并通过依赖、SBOM 与 notices 门禁。无法证明有权贡献的材料不要提交。

## Pull Request 要求

一个 PR 应聚焦一个可审查目标，并包含：

- 问题、动机和方案摘要；
- framework version 或候选版本；
- A1/A2/B/C 影响与静态优先边界；
- 最小复现或验证命令及实际结果；
- Schema、迁移、兼容性、文档、Skill、客户手册和 roadmap 影响；
- 新增媒体或第三方材料的公开权利证据；
- 所有人类贡献 commit 的 DCO sign-off；若使用唯一 Dependabot 自动化例外，PR 必须确实来自 GitHub 已认证 bot，且仍通过完整供应链门禁。

不要在 PR 中粘贴真实 secret、完整环境变量、客户数据或未脱敏日志。测试失败、未运行或依赖外部权限时要如实说明；不要用“应该通过”替代证据。

普通 `pull_request` 的 GitHub Actions required check 使用 PR 中的 workflow 定义；GitHub Actions App source 绑定不证明 workflow、validator 或供应链策略未被 PR 改写。因此，修改 `.github/workflows/**`、`package.json`、lockfile、`scripts/tests/**`、`scripts/compliance/**` 或安全/许可策略时必须在 PR 摘要中单列，并由维护者人工审阅；绿色状态不能替代该人工审阅。当前单维护者阶段不启用自动合并或自动发布。

维护者可要求缩小范围、补充 fixture、更新迁移说明或拆分 PR。合并、版本、release 和安全披露由 [治理政策](GOVERNANCE.md) 规定；提交 PR 不保证合并、发布时间或免费支持响应时限。
