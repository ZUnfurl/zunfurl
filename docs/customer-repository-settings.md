# 客户 Private 仓库安全 Bootstrap 清单

本文供客户授权管理员和实施维护方使用，适用于从 `ZUnfurl` 公开框架 Template repository 创建到客户专属 GitHub Organization 的独立 Private repository。它补充[统一项目启动与完全交付规则](project-startup-and-handoff.md)，不替代客户的安全政策、GitHub 计划条款或平台服务协议。

清单遵循一个默认状态：**刚创建的客户仓库只有源码起点，没有生产授权。** 在 profile、客户资产、权限和验证证据尚未齐备时，保持部署未 arming、生产 secret 缺失、远程写入未授权。

## 1. 先确认边界

开始前记录以下事实，但不要记录 token、恢复码或 secret 明文：

- 客户 GitHub Organization、Private repository 和默认分支名称。
- 客户业务 Owner、两名 GitHub Organization Owner 或单 Owner 的书面风险接受、账单负责人和安全联系人。
- 维护方 GitHub 成员账号、临时角色、权限到期或复核日期。
- 唯一方案：A1、A2、B 或 C，以及 `gcss.project.json` 对应的 profile 和 Contact 决策。
- GitHub 当前计划，以及该计划对 Private repository 的 ruleset、branch protection、Environment、deployment branch 和 required reviewer 的实际可用性。
- 当前 profile 需要的客户自有 Cloudflare、域名、Sanity、Shopify、Resend 和 Turnstile 资产。

遇到以下任一情况时停止，不继续配置生产能力：

- Owner 不是客户专属 Organization；
- 仓库不是 Private，或是 Fork、ZIP/目录复制、维护方个人仓库再转移的结果；
- 无法确认客户 Owner、MFA、账号恢复或账单控制权；
- 当前工作目录、`origin` 或客户身份不明确；
- 要求为禁用模块填写占位生产 secret；
- GitHub UI 不支持计划中的保护规则，却有人要求把它记录成“已启用”；
- 生产平台仍属于维护方个人账户或多个客户共用的 tenant。

## 2. Template 会复制什么，不会复制什么

按 GitHub 的[从 Template 创建仓库说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)，客户仓库从模板文件生成新的独立历史；它不是 Fork。创建时只选择默认分支，不选择 `Include all branches`。

会进入客户仓库的是默认分支中的文件，例如 workflow、`CODEOWNERS`、项目契约、源码和文档。因此，这些文件仍需按客户身份和 profile 审核，不能因为来自公开模板就直接视为客户配置。

以下状态**不会随 Template 自动继承**，必须在客户 Organization 内独立建立和验收：

- repository、organization 或 Environment secrets 和 variables；
- Environments、deployment protection、deployment branch policy 和 arming 状态；
- rulesets、branch protection、bypass 列表和 required checks 绑定；
- Actions 运行历史、日志、artifacts、caches 和 deployment history；
- GitHub Apps、OAuth 授权、webhook、runner、deploy key 或外部 reusable workflow 访问；
- Cloudflare、域名/DNS、Sanity、Shopify、Resend、Turnstile 的账号、tenant、项目、数据、账单和所有权。

客户仓库也不会自动收到 upstream 的后续提交。框架升级必须根据 `frameworkVersion`、CHANGELOG 和迁移说明单独审阅、合并和验证。

## 3. 按 Profile 裁剪平台与 Secret

四种方案使用相同的 GitHub 所有权、安全基线和移交门槛；差异只决定要创建哪些平台和凭据。

| 方案 | 项目契约 | 必需的客户平台 | 必须保持不存在的集成 |
| --- | --- | --- | --- |
| A1 | `static-brand` + `contactForm=false` | GitHub、域名、Cloudflare 静态部署资源 | Sanity、Shopify、Resend、Turnstile、Contact API、`GCSS_COORDINATOR` |
| A2 | `static-brand` + `contactForm=true` | A1 + 客户 Resend、Turnstile、最小 Contact Worker、`GCSS_COORDINATOR` | Sanity、Shopify、商品 CMS 和目录 webhook |
| B | `cms-brand`，Contact 显式选择 | GitHub、域名、Cloudflare、客户 Sanity、`GCSS_COORDINATOR`；Contact 开启时增加 Resend 和 Turnstile | Shopify、商品 schema、商品工作台和 Shopify webhook |
| C 零售目录与内容运营基础框架 | `retail`，Contact 显式选择 | GitHub、域名、Cloudflare、客户 Sanity、客户 Shopify 只读目录映射、`GCSS_COORDINATOR`；Contact 开启时增加 Resend 和 Turnstile | Cart、Checkout、支付、订单、税务、配送、履约、实时价格和实时库存能力 |

执行规则：

1. 先用 `gcss.project.json` 冻结 profile、内容源和 Contact 决策。
2. 只为该 profile 创建客户专属平台资源。
3. 只把当前 `.github/workflows/deploy.yml` 实际引用、且当前 profile 会执行的值放入 `production` Environment。
4. Worker 运行时 secret 放在客户 Cloudflare Worker secret storage；不要为了方便复制到 repository secret。
5. 公共浏览器配置、非敏感 variable 与 secret 分开；即使某值技术上公开，也不得因此把其他凭据打包成一组。
6. Contact 关闭时，不配置 Resend、Turnstile 或 Contact 收件信息；B 不配置 Shopify；A1/A2 不配置 Sanity。

完整用途与存储位置以 [Service And Secret Matrix](../.agents/skills/gcss-v3-site-framework/references/service-and-secret-matrix.md) 为准。

## 4. 创建前：建立客户所有权

### 4.1 Organization Owner、MFA 和恢复

- 推荐至少两名真实、可独立登录的客户 Organization Owner。GitHub 的[组织最佳实践](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/best-practices-for-organizations)同样建议用两个 Owner 保持所有权连续性。
- 每名 Owner 使用自己的账号和强认证，不共享密码、PAT、MFA 设备或浏览器会话。
- 按客户政策要求成员、外部协作者和 billing manager 使用 2FA；启用前先审计会被移除的账号。操作依据见 [GitHub 组织 2FA 文档](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization)。
- 恢复邮箱、MFA 恢复码和账单恢复入口由客户保管在仓库之外；平台资产登记表只记录保管责任人与位置，不记录内容。
- 维护方使用自己的成员账号进入客户 Organization，不使用客户 Owner 身份。能用 team 的场景不用逐人直授权限。
- 维护方初始需要管理设置时可临时获得 `Admin`；配置完成后按支持合同降为 `Maintain`、`Write` 或移除。每次复核都记录日期和批准人。

### 4.2 计划能力预检

在 GitHub UI 中核对客户当前计划，不从 upstream 或另一客户仓库推断。Private repository 的保护能力按计划不同：

- [ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) 和 [protected branch](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) 只在 GitHub 明示支持 Private repository 的计划中配置；不支持时不得宣称已远程强制。
- Private repository 的 Environment、Environment secrets 和 deployment branches 需要 GitHub 明示支持的计划。
- GitHub Free、Pro 和 Team 的 Private repository 不能把 Environment required reviewers 当作可用保护；需要独立 Environment 审批时，必须升级到合资格计划或设计另一套真正受保护的发布系统。以 GitHub 当前的[Deployments and environments 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)和实际 UI 为准。

若当前计划缺少所需能力，选择并记录一种诚实状态：

1. 升级计划后再验收；
2. 保持生产 Deploy 未 arming，暂不部署；
3. 在独立安全设计中提供等效保护。

单人维护不能伪造第二名 reviewer。没有真实独立审阅者时，记录为“单维护者 + 自动检查 + 人工 dispatch”，不要记录为“独立批准”。

## 5. 从公开 Template 创建 Private 仓库

由客户 Owner 或获明确授权的管理员执行：

1. 打开 `ZUnfurl` 公开框架 Template repository。
2. 选择 `Use this template` -> `Create a new repository`。
3. Owner 选择客户专属 GitHub Organization。
4. Repository name 使用已批准的小写 kebab-case 机器名。
5. Visibility 选择 `Private`。
6. 不选择 `Include all branches`。
7. 不在创建页顺手安装未经客户审阅的 GitHub App。
8. 创建后先保持生产 secret、Environment 和 deploy key 为空。

clone 后执行只读身份核对：

```powershell
git remote -v
git branch --show-current
git rev-list --max-parents=0 --all
git status --short
```

必须确认：

- `origin` 只指向客户 Organization 的客户仓库；
- 默认分支是 `main`；
- 只有一个项目根历史，不连接 upstream 私有或完整历史；
- 当前目录不是公共框架 checkout，也不是其他客户目录；
- GitHub UI 显示 Private，并且没有意外的 collaborator、App、deploy key、Environment、secret、webhook 或 Actions 历史。

发现错误时停止。不要用 force push、重写历史或复制 `.git` 来“修复”错误启动；回到客户 Owner 决策重新创建或制定显式迁移方案。

## 6. 立即替换模板身份与权限

### 6.1 更新客户代码所有者

模板中的 `.github/CODEOWNERS` 是 upstream 维护者规则，复制后不代表客户授权。首次客户变更必须：

1. 建立客户 team，例如 `<client-codeowners-team>`；
2. 把 `.github/CODEOWNERS` 的默认 owner 和敏感路径 owner 替换为客户批准的用户或 team；
3. 确认 owner 对仓库有足够权限；
4. 在存在真实 reviewer 且计划支持时，才启用 Code Owner review 要求；
5. 把维护方身份作为临时成员单独授予，不把 upstream 个人 handle 当成客户恢复路径。

### 6.2 收紧仓库访问

- Organization base permission 使用客户允许的最低值；Private 仓库通常不应因 base permission 向所有成员开放写权限。
- 日常开发者通过 team 获得 `Write`；项目维护人员按职责使用 `Maintain`；只有配置安全、删除或转移仓库的少量客户管理员使用 `Admin`。
- 禁止共享个人 PAT。自动化优先使用范围明确的 GitHub App、OIDC 或 fine-grained token，并限制到当前仓库和最小权限。
- deploy key 私钥持有人不会因移出 Organization 自动失去密钥能力；确需 deploy key 时记录持有人、权限、轮换和撤销路径。
- 审核 Organization 和 repository 的 GitHub Apps、OAuth Apps、webhooks、runners、deploy keys 与 Actions reusable workflow access；空白也是需要记录的有效结果。

## 7. GitHub Actions 最小权限

在 `Settings -> Actions -> General` 逐项配置，并确认 Organization 或 Enterprise 上级政策是否更严格。

### 7.1 Actions 与 reusable workflow 允许列表

选择只允许运行客户 Organization 内的 action，以及 GitHub 官方和逐项批准的外部 action。不要打开“允许所有 actions”，也不要用“verified creator”替代逐项审核。

当前模板 workflow 使用：

- GitHub 官方：`actions/checkout`、`actions/setup-node`、`actions/dependency-review-action`、`github/codeql-action`；
- 单个第三方：`trufflesecurity/trufflehog`。

执行要求：

1. 在仓库中运行 `rg -n "uses:" .github/workflows` 生成实际清单。
2. 对照 Action 源码、发布者和用途逐项审批；不需要的 Action 从 workflow 和远程允许列表同时删除。
3. 开启“Require actions to be pinned to a full-length commit SHA”；当前 workflow 已使用 40 位 commit SHA。
4. GitHub 官方 Action 可使用官方类别许可；`trufflesecurity/trufflehog` 只按 workflow 中的精确 commit SHA 放行，不放行整个 verified creator 集合。
5. 新增或升级 Action 时先做供应链审阅，再同时修改 workflow SHA 和远程允许列表。

具体 UI 和允许模式见 [Managing GitHub Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)。

### 7.2 `GITHUB_TOKEN`

- Default workflow permissions 选择只读；每个 workflow 继续显式声明自身最小权限。普通验证和 Deploy 保持 `contents: read`，CodeQL 只额外保留分析所需的 `actions: read`、`packages: read` 和 `security-events: write`。唯一提交态写权限例外是冻结的 DCO metadata publisher：它只用 `statuses: write` 向事件中的精确 PR head SHA 写入 `DCO / Signed-off-by` 状态。
- 关闭 “Allow GitHub Actions to create and approve pull requests”。
- 不因某个 job 方便而把 repository 默认权限提升为 write；确需写权限时必须在单独 workflow/job 中逐项声明、审阅触发器和资源范围。
- checkout 保持 `persist-credentials: false`。
- 默认使用 GitHub-hosted runner。启用 self-hosted runner 前必须另做隔离、持久化状态和 secret 暴露审计。

### 7.3 Fork 和不可信 Pull Request

客户 Private 仓库若不需要 fork 协作，关闭 private forking。确需 fork PR 时：

- 可以允许运行不执行 PR head 的只读验证；除下一条冻结的 DCO 状态发布者外，`GITHUB_TOKEN` 保持 read-only；
- 唯一 write token 例外是 `.github/workflows/dco.yml` 的 metadata-only `pull_request_target`：它执行受信任默认分支代码，只分页读取 GitHub PR commit metadata，再以 `statuses: write` 向精确 event head 发布 DCO 状态；绝不 checkout、fetch 或执行 PR head，也不读取 secrets 或 variables；
- 不发送 secrets 或 variables；
- 对无 write 权限贡献者的 workflow 要求客户维护人员先批准运行；
- PR workflow 不引用 `production` Environment，不调用真实部署；
- 不添加会 checkout、fetch、解析 artifact 或执行 PR head 的高风险 `pull_request_target`；冻结的 metadata-only DCO publisher 是唯一例外，任何结构或权限变化都必须重新威胁建模。任何处理不可信 artifact 的 `workflow_run` 也需要独立威胁建模。

`preview.yml` 和 secret scan 必须在无生产凭据的条件下验证 PR。当前 CodeQL 与 dependency review job 带有 public visibility 条件，在客户 Private repository 中会跳过；只有客户计划支持、workflow 经明确适配并在真实 PR 中执行成功后，才能把它们记录为客户安全检查。即使启用，它们也不得读取生产凭据。`deploy.yml` 只保留 `workflow_dispatch`，`rebuild-request.yml` 只记录无 secret 的 receipt。GitHub 对 Private fork PR 的权限选项见同一份 [Actions settings 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#enabling-workflows-for-forks-of-private-repositories)。

## 8. `main`、Tag 和 Reviewer 策略

在计划支持 Private repository 规则时，为 `main` 创建 active ruleset 或 branch protection：

- 必须通过 Pull Request；禁止直接 push 作为日常路径。
- 要求所有选定 status checks 成功，并在首个 PR 后按 GitHub UI 中的精确 check 名称绑定。
- 要求解决全部 review conversations。
- 禁止 force push 和 branch deletion。
- 限制 bypass；只保留客户批准的应急角色，并记录每次使用。
- 有真实独立审阅者时要求至少一次批准；需要 CODEOWNERS 批准时先完成客户 `CODEOWNERS` 替换。
- 无真实独立审阅者时，不启用无法满足或会诱导自我批准的承诺；记录单维护者策略，并把自动检查、人工 dispatch 和发布证据作为当前边界。
- `v*` release tag 仅允许客户批准的 release maintainer 创建；已发布 tag 不移动、不复用。

当前客户 Private repository 的 PR 基线至少包含 CI / Pull Request Validation 的 Node 22.12、Node 24、Windows、A1/A2/B/C fixture、secret scan，以及在真实 PR head 上成功发布并已验证来源的 `DCO / Signed-off-by` 状态。CodeQL 和 dependency review 当前在 Private repository 中跳过，不能把 skipped 状态当作已完成扫描；只有按上一节真正启用后才纳入 required checks。只绑定首个真实 PR 中实际执行、命名唯一且成功的检查；workflow 重命名后同步更新规则，避免旧 check 永久阻塞。客户若不采用 DCO，必须把贡献政策、workflow、required context 和本地验证器作为一次显式治理变更同步调整，不能只删除其中一项。

GitHub Actions App 的 status source 绑定不证明普通 `pull_request` 中的 workflow 定义未被修改。客户维护者必须人工审阅 `.github/workflows/**`、`package.json`、lockfile、`scripts/tests/**`、`scripts/compliance/**` 及安全/许可策略的变化；单维护者阶段不能把绿色状态当作独立审阅，也不要启用自动合并或自动生产发布。有第二名合格维护者后，再用受保护 review 加强这一控制面。

若当前计划不支持 Private ruleset/branch protection，记录“未远程强制”，不要截图另一仓库的设置作为证据。生产前应升级到合资格计划；若客户明确接受暂不升级，至少保持 Deploy 未 arming，直到另有批准的保护方案。

## 9. `production` Environment 与 Deploy Arming

### 9.1 默认关闭

初始化和普通 PR 阶段：

- 不创建或不填充生产 secret；
- `PRODUCTION_DEPLOYMENT_ARMED` 缺失或值为 `false`；
- 不从 feature branch 运行生产 Deploy；
- 不把 repository secret 当成绕过 Environment 的备用路径。

当前 `deploy.yml` 在 checkout 前同时检查 `refs/heads/main` 和 Environment variable `PRODUCTION_DEPLOYMENT_ARMED=true`。缺任一条件必须失败。

### 9.2 计划支持时建立 Environment

由客户授权管理员创建精确名称 `production`：

1. deployment branches/tags 只允许 `main`；
2. 把 deploy-time secret/variable 放入该 Environment，不放入 PR 可达的 repository 级存储；
3. profile 禁用的 secret 不创建；
4. 计划支持 required reviewers 且存在真实第二人时，配置客户 reviewer 并阻止自我批准；
5. 计划不支持 required reviewers 时，明确记录“人工 `workflow_dispatch` + arming，不是独立 Environment 审批”；
6. Environment 管理权限只给客户批准的管理员。

### 9.3 单次部署窗口

1. 确认要部署的 commit 已在 `main`、required checks 已通过且客户已授权生产写入。
2. 确认 Cloudflare、Sanity、Shopify、Resend/Turnstile 凭据均来自该客户的 profile 专属资产。
3. 把 Environment variable `PRODUCTION_DEPLOYMENT_ARMED` 临时改为字符串 `true`。
4. 从 `main` 手动触发 `Deploy`，一次只运行一个生产 deployment。
5. 验证 workflow run 的 commit SHA、Environment、部署结果和生产冒烟测试。
6. 立即把 `PRODUCTION_DEPLOYMENT_ARMED` 恢复为 `false`，记录操作者、批准人、时间、run URL 和 commit SHA。

不要把长期保持 `true` 当作“自动部署开关”。Sanity/Shopify webhook 的 `repository_dispatch` 只允许产生 rebuild-request receipt，不得联动生产 Deploy。

## 10. Secret 创建、存储与轮换

### 10.1 所有权和存储位置

| 资源 | 客户所有权 | 正常存储位置 | Profile 边界 |
| --- | --- | --- | --- |
| GitHub repository / Environment | 客户 Organization | GitHub Environment secret/variable | A1/A2/B/C；只存当前 workflow 与 profile 所需值 |
| Cloudflare account、Zone、Worker、Turnstile | 客户账户与客户资源 | Cloudflare token / Worker secret storage | A1/A2/B/C；Turnstile 仅 Contact |
| Domain registrar / DNS | 客户注册人和账单主体 | registrar / DNS 平台 | A1/A2/B/C |
| Sanity organization / project / dataset | 客户 organization 和独立 project | Sanity 与受控 deploy-time secret | 仅 B/C |
| Shopify store / app | 客户 legal entity 和 Store Owner | Shopify；server-side webhook secret 放 Worker | 仅 C，只读目录映射 |
| Resend / 发信域名 | 客户项目和客户域名 | Worker secret storage | 仅 Contact 开启 |

代理注册只是一项实施服务，不改变上述所有权。禁止使用维护方个人 Cloudflare 全局 Token、个人 PAT、跨客户 Sanity project、共享 Shopify app 或共享 Resend key 作为客户生产凭据。

### 10.2 轮换步骤

以下时点必须轮换或撤销：首次生产部署前的临时搭建凭据、客户接管、维护人员离开或降权、权限范围变化、疑似泄漏、平台事件，以及客户政策规定的周期。

每次轮换按以下顺序执行：

1. 由客户资产 Owner 在源平台创建最小权限的新凭据。
2. 更新正确的 secret store；不在 Issue、PR、Actions 日志、聊天或资产登记表中粘贴值。
3. 在未撤销旧凭据前完成一次受控验证，避免无计划中断。
4. 撤销旧凭据并确认无法继续使用。
5. 检查 Actions 日志和部署输出没有泄漏；secret redaction 不是泄漏防护的替代品。
6. 只记录资源 ID、用途、权限、存储位置、轮换责任人、撤销证据和时间。

客户接管后，维护方临时凭据必须删除或轮换，维护方权限按支持合同降级或移除。

## 11. 验证、留证与回滚

### 11.1 本地和无凭据 PR 验证

在客户仓库完成受控初始化后运行：

```powershell
npm.cmd ci
npm.cmd run project:scan
npm.cmd run framework:audit
npm.cmd run test:workflows
npm.cmd run test:profiles
git diff --check
```

再按 profile 增加验证：

- A1：静态构建，确认没有 Contact、Sanity、Shopify 依赖。
- A2：静态构建和 Worker 测试，确认仅启用 Contact 所需路径。
- B：Storefront、Studio、Sanity 和 Worker 验证，确认没有 Shopify 路径。
- C：Storefront、Studio、commerce contract、Shopify 只读映射和 Worker 验证；确认没有交易闭环声明。

打开一个不携带生产 secret 的 PR，确认全部 required checks 可在无外部生产凭据时通过。检查 Actions settings、允许列表、workflow permissions、fork policy、分支规则、Environment、Apps、webhooks、deploy keys 和 collaborator；截图或导出时遮蔽客户敏感信息。

### 11.2 Fail-closed 和首次生产验收

- 在 Environment 已建立后，可经授权执行一次未 arming 的手动 Deploy 验证；它必须在 checkout 前失败，且没有外部写入。
- 正式部署只在客户另行授权后执行。记录 `main` commit SHA、workflow run、Environment、平台资源 ID 和冒烟测试结果。
- 验证正式域名、核心页面、404，以及当前 profile 启用的 Contact、Studio、目录和 webhook receipt；禁用模块也要验证其入口不存在或 fail closed。
- 交付前重新检查维护方权限、临时 secret 和恢复责任。

### 11.3 设置或代码回滚

配置错误或疑似凭据事件时：

1. 先把 `PRODUCTION_DEPLOYMENT_ARMED=false`，停止新的 Deploy。
2. 撤销受影响 token，必要时临时禁用相关 workflow、App、webhook 或 runner。
3. 由客户 Owner 根据最后一次已验收的设置快照恢复权限和规则；不要用 force push 或删除历史代替设置回滚。
4. 代码回退使用 Pull Request revert 到已知良好 commit，重新通过检查后再人工部署。
5. 对外部平台数据只执行其已单独设计、授权并验证过的恢复流程；没有此证据时升级事故处理，不宣称可恢复。

## 12. 明确不提供的能力

本清单建立的是客户所有权、账号恢复、仓库安全和部署控制，不是生产数据恢复系统：

- Git history、clone、release、Actions artifact/cache/log 或回退 commit 都不是 Sanity、Shopify、Cloudflare 配置和业务数据的 Production Backup。
- GitHub 账号恢复、MFA 恢复码和第二名 Organization Owner 解决的是控制面访问连续性，不是 Disaster Recovery Restore。
- C 的 Sanity 商品归档、取消归档或回收站副本只属于内容生命周期，不是 Backup 或 Restore。
- `docs/roadmap/workflows/` 中的 backup/restore 文件是不可执行设计样例，不提供导出、导入、恢复点或恢复演练。

客户如需 RPO、RTO、平台原生导出、异地副本或恢复演练，必须另立项目、明确数据权威、保留期、加密、访问控制和可验证恢复证据。在该项目完成前，交付材料只能写“Roadmap / 未提供”。

## 13. 完成判定

只有以下项目都有证据时，才把客户仓库 bootstrap 标记为完成：

- [ ] 客户专属 Organization 和 Private repository 已核验，`origin` 正确，历史独立。
- [ ] 两名客户 Owner 已就位，或单 Owner 风险已由客户书面接受；MFA、恢复和账单责任明确。
- [ ] `.github/CODEOWNERS` 已替换为客户批准身份，维护方不再是默认恢复路径。
- [ ] A1/A2/B/C 和 Contact 决策已冻结，禁用平台与 secret 保持不存在。
- [ ] Actions 允许列表、完整 SHA、只读 `GITHUB_TOKEN`、禁止 Actions 批准 PR 和 fork PR 无 secret 已核验。
- [ ] `main` 规则与 reviewer 状态符合当前 GitHub 计划；不可用能力明确记录为未强制。
- [ ] `production` Environment、deployment branch、secret 和 arming 边界已按计划能力验收；默认 arming 为 `false`。
- [ ] Cloudflare、域名、Sanity、Shopify、Resend/Turnstile 均按 profile 属于客户，未使用跨客户凭据。
- [ ] 临时凭据完成轮换或撤销，维护方权限已复核。
- [ ] 无凭据 PR 验证、fail-closed 验证和经授权的首次部署/冒烟测试各自留证。
- [ ] 回滚责任和事故联系人已记录，同时明确 Production Backup 与 Disaster Recovery Restore 尚未由本框架提供。

平台资产登记表只交给客户授权管理员；客户日常运营手册继续按 A1/A2/B/C 裁剪，不包含 secret、MFA 恢复码或基础设施管理步骤。
