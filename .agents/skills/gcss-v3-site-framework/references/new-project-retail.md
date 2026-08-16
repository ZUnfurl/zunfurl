# C 零售目录与内容运营基础框架（C Retail Catalog & Content Foundation）

C 使用 `retail` 机器 profile，由 Sanity 负责品牌与商品内容运营，并从 Shopify 只读映射商品目录和媒体事实。它不是线上交易系统。

开始前必须完整执行 `new-project-workflow.md`。C 与 A1/A2/B 使用同一个公开框架 Template repository、客户专属 GitHub Organization、独立 Private repository、Codex 本地项目、dry-run 和完全交付流程。

## 启动前确认

- 确认品牌、项目机器名、正式域名、默认语言、启用语言和首发目录范围。
- 明确 Contact 开关、品牌声明和目录内容责任范围。
- 确认客户 Sanity Organization、Project、dataset、Studio host 和编辑角色。
- 确认客户 Shopify Store Owner、Headless publication、Storefront API 只读权限和结构性 Webhook 范围。
- 确认首发语言、首个商品模板和 Sanity/Shopify 数据责任边界。

## 项目契约

```json
{
  "profile": "retail",
  "contentSource": "sanity",
  "features": {
    "contactForm": true,
    "legalPages": ["privacy-policy", "terms-of-use", "customer-service-contact"]
  }
}
```

必须设置 `templateMode=false`，并让 `deployment.githubRepository` 指向客户 Organization 中的当前仓库。只有真实外部交易业务需要对应政策时，才在 `legalPages` 显式加入 `shipping-returns-policy`；这不会让本框架获得交易能力。

## 平台边界

- 客户专属 GitHub Organization / Private repository、域名和 Cloudflare：必须。
- 客户 Sanity Organization / Project / dataset：必须。
- 客户 Shopify Store、Headless、只读应用和结构性 Webhook：必须，仅作为目录事实来源。
- Resend、Turnstile：只在 `contactForm=true` 时创建客户专属资源；C Worker 始终包含用于 webhook 幂等的协调对象。
- 价格、库存、SKU、订单、支付和履约不写入 Sanity 或静态内容，也不属于本框架交付的前台能力。
- C 不包含 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存。

## Studio

- 页面工作台
- 商品工作台
- 商品上线向导
- 全部内容
- Vision
- Releases

Studio 商品选择器可以使用公开 Storefront token；绝不能在浏览器代码中暴露 Admin API token。

## 验证

先运行 `validation.md` 的 Common，再运行：

```powershell
npm.cmd run test:profile:retail
npm.cmd run test:commerce
npm.cmd run test:sanity
npm.cmd run test:worker
npm.cmd run studio:build
npm.cmd run build
```

`test:commerce` 是为兼容现有脚本保留的内部名称；它验证目录映射边界，不代表交易能力。

随后执行获得授权的 Sanity 和 Shopify 只读集成冒烟测试。验证 Shopify 结构性目录变化只产生一次 rebuild-request receipt 且不会自动部署，交易事件不产生请求；人工 Deploy 单独授权。商品内容上线、下线、归档和取消归档均按客户 UI 流程完成。继续阅读 `retail-operations.md` 和 `deployment.md`。

## 完全交付差异

除统一仓库、域名、Cloudflare、部署和账户恢复方式外，C 必须让客户独立控制 Sanity 和 Shopify 的 Owner、账单、成员、只读应用、API token、Webhook 和商品目录入口。启用 Contact 时同时交付 Resend 和 Turnstile；Worker 协调对象随部署创建。按 `platform-ownership-and-handoff.md` 完成验收。
