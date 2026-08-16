# A1/A2 `static-brand` 新项目

A1/A2 都是代码级内容维护的静态品牌官网，不部署 Sanity Studio，也不接入 Shopify。A2 在 A1 基础上增加最小 Contact Worker、Turnstile、Resend 和 Durable Object 原子短期限流。

开始前必须完整执行 `new-project-workflow.md`。A1/A2 与 B/C 使用同一个公开框架 Template repository，并在客户专属 GitHub Organization 中创建独立 Private repository；Codex 本地项目、dry-run 和完全交付流程保持一致。

## 启动前确认

- 明确选择 A1 或 A2；需要表单发信时必须选择 A2。
- 确认品牌、项目机器名、正式/预览域名、默认语言、启用语言、页面清单、视觉资产和法律文本。
- 确认由维护方提供代码级内容更新服务的范围、响应时间和验收方式。
- A2 还需确认发信域名、发件地址、业务收件地址和允许的 Origin。

## 项目契约

A1：

```json
{
  "profile": "static-brand",
  "contentSource": "local",
  "features": {
    "contactForm": false,
    "legalPages": ["privacy-policy", "terms-of-use", "customer-service-contact"]
  }
}
```

A2 只把 `contactForm` 改为 `true`，且必须保留 `privacy-policy`。A1/A2 都不能选择 `shipping-returns-policy`。两者都必须设置 `templateMode=false`，并让 `deployment.githubRepository` 指向客户 Organization 中的当前仓库。

## 平台边界

| 平台 | A1 | A2 |
| --- | --- | --- |
| 客户专属 GitHub Organization / Private repository | 必须 | 必须 |
| 客户域名与 Cloudflare | 必须 | 必须 |
| Resend、Turnstile、Contact Worker secret | 不创建 | 客户专属资源；Worker 内启用协调对象 |
| Sanity | 不创建 | 不创建 |
| Shopify | 不创建 | 不创建 |

## 内容与界面

- 前台包含合同约定的 Home、About、Contact 和法律页面。
- 页面内容和 `public/brand-assets/` 由维护方通过代码维护。
- 不部署 Studio，不出现商品路由、商品工作台或 Shopify 配置。
- A1 不暴露真实 Contact API；A2 才启用 `/api/contact`。

## 验证

先运行 `validation.md` 的 Common，再运行：

```powershell
npm.cmd run test:profile:static-brand
npm.cmd run test:worker
npm.cmd run build
npm.cmd --workspace gcss-worker run deploy -- --dry-run
```

A2 还需验证 Turnstile、honeypot、字段长度、Origin、原子短期限流、协调对象不保存正文，以及一封授权测试邮件到达业务邮箱。A1 应验证禁用 Contact 后不要求任何表单 secret 或协调对象绑定。

## 完全交付差异

- A1 交付客户专属 GitHub Organization、代码仓库、域名、Cloudflare、部署与账号恢复入口；当前框架不提供 Production Backup 或 Disaster Recovery Restore。
- A2 在 A1 基础上交付 Resend、Turnstile、Worker 协调对象、发信域名和表单紧急关闭/轮换说明。
- 两者都按 `platform-ownership-and-handoff.md` 验收，不因为没有 CMS 而降低客户所有权标准。
