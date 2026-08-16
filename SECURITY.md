# 安全政策

## 受支持版本

ZUnfurl 是 `0.x Preview`。任何时点只为最新公开发布的 `0.x` Preview 提供安全修复；更早的 Preview 不建立并行维护分支。

| 版本范围 | 安全修复状态 |
| --- | --- |
| 最新公开 `0.x` Preview | 支持，best effort |
| 更早的 `0.x` Preview | 不支持，请先验证最新 Preview |
| 客户 fork、客户私有定制或自行修改的部署 | 不属于上游支持范围 |

首个公开 Preview 发布前不存在“受支持的公开版本”，但仍欢迎私密报告会影响候选版本或默认分支的问题。默认分支上的未发布代码不是稳定版承诺。

## 私密报告漏洞

不要为疑似漏洞创建公开 Issue、Pull Request、Discussion 或社交媒体帖子。优先使用 GitHub [Private Vulnerability Reporting](https://github.com/ZUnfurl/zunfurl/security/advisories/new)（PVR）。公开仓库尚未启用 PVR、入口不可用或无法登录时，请发送邮件至 [mp4102@gmail.com](mailto:mp4102@gmail.com)，主题以 `[ZUnfurl Security]` 开头。

当前只有这一条受监控邮箱；相同地址的重复列出不是独立备用通道。电子邮件不是端到端加密的 secret 传输工具，请勿发送生产 token、私钥、客户数据或真实订单。使用已脱敏的最小复现；如确实需要交换敏感材料，先说明材料类型并等待维护者确认安全传递方式。

报告尽量包含：

- 受影响的 release、commit SHA、文件和代码位置；
- A1、A2、B、C 中受影响的 Profile，以及所需配置；
- 漏洞类型、攻击前置条件、可利用路径和潜在影响；
- 已脱敏的复现步骤或最小 PoC；
- 已知缓解方式和建议修复（如有）；
- 是否计划公开披露及希望的协调时间。

## 处理与协调披露

维护者将按 best effort 完成确认、复现、风险分级、修复和 advisory 准备，不承诺固定响应、修复或发布时间，也不提供免费 SLA、bug bounty 或生产事件处置服务。报告缺少复现信息、只影响过期版本或属于第三方平台时，维护者可能要求补充信息或转交上游。

请在双方商定的披露日期、修复发布或 advisory 发布之前避免公开可利用细节。维护者会尽量说明当前状态和下一次更新点，不要求无限期保密；如果协调受阻，双方应基于用户风险重新讨论合理披露计划。公开致谢必须取得报告者同意。

## 上游安全边界

上游接受框架源代码、默认配置、构建链和内置工作流中的漏洞报告。以下事项不等同于上游漏洞修复承诺：

- 客户账号、DNS、Cloudflare、Sanity、Shopify、Resend 或 GitHub Organization 的日常运维；
- 客户自行加入的代码、依赖、数据、素材、secret 或错误权限配置；
- 第三方服务自身漏洞；
- 对 Backup、Restore、authenticated editorial Preview 等 roadmap 能力的可用性要求；
- 需要真实生产数据才能演示、但没有安全脱敏复现的问题。

若问题实际属于第三方组件，维护者会尽量给出上游报告入口，但不会代替第三方作出响应或修复承诺。普通 Bug 和配置问题请使用 Issue forms；支持边界见 [SUPPORT.md](SUPPORT.md)。
