# 平台所有权与统一交付

本文补充平台角色和移交细节。所有 A1/A2/B/C 项目的完整启动顺序以仓库根目录 `docs/project-startup-and-handoff.md` 为准。

## 核心定义

- “代理注册”是实施职责，不改变资产所有权。
- 正式生产项目需要的平台、资源、域名、数据和账号恢复控制权都属于客户。当前框架不提供 Production Backup 或 Disaster Recovery Restore。
- 维护方可以代为注册、配置和调试，但不得把客户生产资源长期放在维护方个人账户或多个客户共用的账户中。
- 只创建当前 profile 需要的平台。A2 不创建 Sanity 或 Shopify，B 不创建 Shopify。

## 从第一天建立客户边界

1. 为客户建立独立的平台资产清单和管理员身份，不与其他客户混用。
2. GitHub 正式仓库通过公开框架模板的 `Use this template` 直接创建在客户专属 GitHub Organization 中，并保持 Private；不创建在维护方个人 namespace。
3. 维护方使用自己的成员账号获得临时 `Admin` 权限，不共用客户登录密码。
4. Cloudflare、Sanity、Shopify、Resend、域名和其他生产服务使用客户身份、客户专属 tenant 或可明确转移的客户项目。
5. 注册邮箱、恢复邮箱、MFA、恢复码和账单主体应能在交付时由客户独立控制。
6. 平台要求客户本人确认身份、账单、协议或 Store Owner 时，由客户完成该步骤；代理注册不能绕过平台条款。

“客户仓库从第一天开始”表示仓库从第一次提交起就属于客户专属 Organization。客户可以在最终交付时才接管日常管理，但正式代码不先放在维护方个人仓库中再搬迁。

公开模板只提供源码起点，不会复制上游 secrets、environments、Actions 历史、rulesets、部署凭据或外部平台所有权。客户仓库必须按自身 profile 独立建立这些边界。

## 平台资产矩阵

| 平台 | 适用方案 | 客户资产边界 | 维护方开发权限 |
| --- | --- | --- | --- |
| GitHub Organization / repository | A1/A2/B/C | 客户专属 Organization 和私有仓库 | Repository `Admin`，交付后降权或移除 |
| Cloudflare account、Zone、Worker | A1/A2/B/C | 客户账户；A2 另含 Turnstile，A2/B/C Worker 含协调对象 | 临时管理员或最小资源角色 |
| Domain registrar / DNS | A1/A2/B/C | 客户注册人和账单主体 | 委派 DNS 管理权限 |
| Resend / 发信域名 | 启用 Contact | 客户项目和客户域名 | 临时管理员；API key 只限当前项目 |
| Sanity organization / project | B/C | 客户 organization 和独立 project | 项目管理员或开发者 |
| Shopify store / app | C | 客户 legal entity 和 Store Owner | Collaborator、staff 或 app developer |

## Secret 规则

- 生产 secret 必须由客户专属平台资源生成，使用最小权限和最小资源范围。
- 不把维护方个人 PAT、Cloudflare 全局 Token 或跨客户密钥留在客户仓库。
- GitHub repository secrets、Worker secrets 和本地 `.env` 分开管理；任何 secret 都不能提交。
- 维护方用于临时搭建的凭据在交付前删除或轮换；客户接管后重新验证 Actions 和生产部署。
- GitHub Organization 级 secret、GitHub App 和 reusable workflow 权限必须在客户 Organization 中单独确认，不能假设会随仓库复制或转移。

## 统一交付清单

维护平台资产登记表，但不记录 secret 明文。每个平台至少记录：

- 客户资产名称、登录入口和资源 ID。
- Owner、管理员和维护方角色。
- 注册邮箱、恢复邮箱、MFA 持有人和恢复码保管位置。
- 账单主体、续费责任和到期提醒责任人。
- Token 用途、权限范围、存储位置、轮换责任和撤销路径。
- 生产域名、DNS、Webhook、Worker、dataset、store 等关键绑定。
- 最后一次部署、冒烟测试和客户接管确认时间；如客户另行使用平台原生导出或备份，也只记录其责任人与证据，不把它误记为框架恢复能力。

## 交付门槛

完成以下条件后才能标记“完全交付”：

1. 客户至少有一名可独立登录的 Owner；Organization 类平台推荐两名 Owner。
2. 客户能够控制注册邮箱、恢复方式、MFA 和账单。
3. 生产资源不依赖维护方个人账户或跨客户 secret。
4. GitHub Actions 使用客户资源凭据完成一次部署。
5. 生产域名、核心页面和启用的动态能力完成冒烟测试。
6. 临时凭据已轮换，维护方权限已按支持合同降级或移除。
7. 客户收到平台资产登记表、日常操作手册、账号恢复与事故升级入口以及支持边界。

平台资产登记表属于授权管理员交付材料，不与面向普通内容编辑的操作手册混在一起。
