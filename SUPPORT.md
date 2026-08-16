# 支持政策

## 公共社区支持

ZUnfurl `0.x Preview` 提供 best-effort 社区支持，不提供免费响应、解决、升级或可用性 SLA。维护者会根据安全性、影响范围、可复现性、Profile 合约和维护容量安排处理；Issue 被接受不代表承诺合并、发布时间或向旧 Preview 回移修复。

使用 GitHub Issue forms 选择最接近的入口：

- Bug：可复现的框架、初始化、构建、Profile 或默认 workflow 问题；
- Docs：文档错误、链接失效或说明缺口；
- Feature：符合静态优先和 A1/A2/B/C 边界的能力建议。

提交前请在最新 Preview 上验证，并提供 framework version、Profile、Node/npm、最小复现、脱敏配置和实际测试结果。信息不完整、无法复现或超出产品边界的 Issue 可能被关闭、转为讨论记录或要求重新提交。

## 不要公开提交

以下内容不得放入公开 Issue、PR、日志或截图：

- token、secret、私钥、完整 `.env` 或生产凭据；
- 客户身份、真实域名、联系人、订单、表单内容或其他个人/业务数据；
- 私有仓库链接、生产 dataset/project ID、内部日志或未公开基础设施拓扑；
- 未获公开再分发权的客户 logo、图片、字体、视频或文档；
- 尚未协调披露的漏洞细节。

安全问题按 [SECURITY.md](SECURITY.md) 私密报告；行为事件按 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 私密报告。安全/行为邮箱不是普通技术支持或免费咨询渠道。

## 上游与客户边界

公共支持面向可在中性 fixture 或最小开源复现中证明的上游框架问题。以下工作保留在客户自己的 Private repository 和平台所有权边界内：

- 账号创建、MFA、账单、域名、DNS、生产 route 和 secret rotation；
- 真实 Sanity dataset、Shopify catalog、Resend 收件流程或 Cloudflare 部署写入；
- 客户内容、视觉资产、法律事实、隐私请求、营销运营和日常商品维护；
- 定制开发、迁移执行、生产值班、事故响应或合规意见。

Template 创建的客户仓库不会自动继承上游仓库设置。上游文档可提供操作基线，但不代表维护者接管客户资产或承担客户生产运维责任。

## 功能状态不是支持承诺

`Supported` 表示当前 Profile 合约中有实现和验证证据，不等于托管服务或 SLA；`Preview` 表示实验性能力；`Roadmap` 只是计划；`Not provided` 表示明确不提供。C 是 Retail Catalog & Content Foundation，不是交易闭环。Backup、Restore 与 authenticated editorial Preview 尚未交付，不能据此提出生产恢复保证。

版本、安全修复和 release 规则见 [SECURITY.md](SECURITY.md) 与 [Release Policy](docs/release-policy.md)。
