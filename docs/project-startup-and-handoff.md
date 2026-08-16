# 统一项目启动与完全交付规则

本文是 `ZUnfurl` 所有客户项目的统一启动与交付基线，适用于 A1、A2、B、C。方案差异只决定启用哪些模块和平台，不改变仓库创建、项目初始化、资产所有权、验收和移交方式。内部 `gcss-*` 机器名为兼容标识，不改变公共项目身份。

## 1. 不变原则

1. `ZUnfurl` 上游是公开 GitHub Template repository，只负责框架版本演进和源码分发。
2. 每个正式客户项目都通过公开模板默认分支的 `Use this template` 创建一个独立 Private repository。
3. 客户仓库从第一天起属于客户专属 GitHub Organization，不先在维护方个人 namespace 中开发后再搬迁。
4. 不使用 Fork、下载 ZIP、复制工作目录、保留框架完整 Git 历史或在框架 checkout 内直接初始化客户。
5. clone 客户仓库后，必须把该仓库根目录作为新的 Codex 本地项目；所有初始化和后续开发都在客户仓库任务中进行。
6. 先选择 A1/A2/B/C，再生成 dry-run，审阅通过后才允许写入。
7. 只创建当前方案需要的外部平台和 secret；禁用模块不能成为部署依赖。
8. GitHub、Cloudflare、域名、Sanity、Shopify、Resend 等生产资产按方案归客户所有；代理注册只是实施服务。
9. 完全交付不仅是网站上线，还包括客户能独立控制代码、平台 Owner、账号恢复、MFA、账单、部署和凭据轮换。账号恢复不等于框架提供 Production Backup 或 Disaster Recovery Restore。

## 2. 统一启动流程

### 2.1 确认合同与客户边界

- 明确方案、页面范围、语言、域名、内容维护方式、Contact、零售能力和支持边界。
- 建立客户平台资产登记表，确定客户管理员、恢复邮箱、MFA 和账单主体。
- 建立客户专属 GitHub Organization；正式项目推荐至少两名客户 Owner。

### 2.2 从模板创建客户仓库

1. 打开 `ZUnfurl` 公开框架 Template repository。
2. 选择 `Use this template` -> `Create a new repository`。
3. Owner 选择客户专属 GitHub Organization。
4. 仓库名使用客户小写 kebab-case 机器名。
5. Visibility 选择 `Private`。
6. 不选择 `Include all branches`，只从默认分支建立客户基线。
7. 创建后邀请维护方自己的 GitHub 成员账号；不共享客户密码。

模板生成的是独立仓库和新的初始提交，不是 Fork。公开模板不会把 upstream secrets、environments、Actions 历史、rulesets 或外部平台连接复制给客户仓库；这些边界必须在客户 Organization 内独立配置。客户项目也不会自动继承框架后续更新，升级必须按 `frameworkVersion` 和迁移说明显式执行。

### 2.3 clone 并切换 Codex 工作区

```powershell
git clone https://github.com/<client-org>/<project-name>.git
Set-Location <project-name>
npm.cmd install
git remote -v
git status --short
```

然后在 Codex 中添加该目录为本地项目，并新建客户项目任务。开始前必须确认：

- 当前工作目录是客户仓库根目录；
- `origin` 指向 `<client-org>/<project-name>`；
- 不是框架仓库，也不是其他客户仓库；
- `.agents/skills/gcss-v3-site-framework/SKILL.md` 可以被发现。

### 2.4 选择方案并生成初始化计划

四种方案都使用相同入口：

```text
使用 $gcss-v3-site-framework 初始化当前客户项目。
方案：<A1 | A2 | B | C> <profile>
项目名：<project-name>
品牌名：<brand-name>
正式域名：<domain>
默认语言：<default-locale>
启用语言：<locales>

先读取 AGENTS.md、README.md、gcss.project.json 和 Git 状态，
确认 origin 指向客户专属 GitHub Organization。
先完成审计并生成 dry-run 初始化计划；
暂不写文件、不 commit、不 push、不部署、不创建远程资源。
```

审阅项目清单后依次执行：

```powershell
npm.cmd run init:project:dry-run -- --config tmp/client.gcss.project.json
npm.cmd run init:project -- --config tmp/client.gcss.project.json
npm.cmd run init:project -- --config tmp/client.gcss.project.json --write
npm.cmd run project:scan
```

初始化后 `templateMode` 必须为 `false`，`deployment.githubRepository` 必须与当前 `origin` 一致。

### 2.5 实施、验证和部署

1. 替换品牌事实、页面内容、法律文本和视觉资产。
2. 只创建 profile 启用的平台、API、Webhook、Worker 协调对象和 secret。
3. 先完成无凭据的本地测试，再执行获得授权的远程集成测试。
4. 完成本地构建和浏览器验收；如客户另行建立经授权的 staging environment，再对该独立环境执行桌面端、移动端、SEO、404、表单或目录流程验收。CI / Pull Request Validation 不等于已部署的预览环境。
5. 真实部署、DNS、生产数据、secret、commit 和 push 仍按项目授权边界执行。

## 3. 方案差异

| 方案 | Profile | 客户仓库 | 生产平台 |
| --- | --- | --- | --- |
| A1 | `static-brand` | 客户专属 GitHub Organization 私有仓库 | 客户域名、Cloudflare 静态部署；不创建 Sanity、Shopify、Resend、Turnstile 或协调对象 |
| A2 | `static-brand` | 同一规则 | A1 + 客户 Resend、Turnstile、最小 Contact Worker 和协调对象 |
| B | `cms-brand` | 同一规则 | 客户 Cloudflare、Sanity 和 webhook 幂等协调对象；Contact 启用时增加 Resend、Turnstile |
| C | `retail` | 同一规则 | 客户 Cloudflare、Sanity、Shopify 和 webhook 幂等协调对象；Contact 启用时增加 Resend、Turnstile |

方案不能改变仓库所有权和完全交付标准。A1 没有 CMS，不代表代码、域名或 Cloudflare 可以长期属于维护方；C 平台更多，也不代表客户需要共享密码给维护方。

## 4. 完全交付门槛

所有方案必须满足：

1. 客户可独立登录 GitHub Organization、域名和 Cloudflare，并控制 Owner、恢复、MFA 和账单。
2. 当前方案启用的 Sanity、Shopify、Resend 等平台均是客户专属资产。
3. 生产仓库、域名、Worker、Studio、dataset、store、Webhook 和发信域名已登记，但不记录 secret 明文。
4. GitHub Actions 使用客户凭据完成至少一次成功部署。
5. 生产环境完成当前方案的冒烟测试；如另有客户自建 staging environment，也单独记录其结果。这里的账号恢复入口检查不代表框架提供 Production Backup 或 Disaster Recovery Restore。
6. 代理搭建期间的临时凭据已删除或轮换，维护方权限已按支持合同降级或移除。
7. 客户授权管理员收到平台资产登记表；日常内容编辑收到裁剪后的方案操作手册。

日常操作手册和平台交付包是两份材料。前者服务内容编辑，后者只交给客户授权管理员。

## 5. 禁止的启动方式

- 从模板 Fork 正式客户项目。
- 下载 ZIP 后手工创建仓库。
- 复制框架或其他客户的本地目录，并保留原 `.git`。
- 在维护方个人 GitHub namespace 中完成正式项目后再默认转移。
- 在框架仓库的 Codex 任务里修改客户配置或创建客户内容。
- 多个客户共享生产 Token、Sanity Project、Shopify app、Resend API key 或 Cloudflare 全局凭据。
- 因 A1/A2/B 平台较少而降低客户所有权、恢复和交付标准。
