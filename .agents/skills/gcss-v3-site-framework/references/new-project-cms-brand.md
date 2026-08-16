# B `cms-brand` 新项目

B 是由客户通过 Sanity 自主维护页面内容、不接入 Shopify 的品牌官网。

开始前必须完整执行 `new-project-workflow.md`。B 与 A1/A2/C 使用同一个公开框架 Template repository，并在客户专属 GitHub Organization 中创建独立 Private repository；Codex 本地项目、dry-run 和完全交付流程保持一致。

## 启动前确认

- 确认品牌、项目机器名、正式/预览域名、默认语言和启用语言。
- 明确 Contact 开关和需要维护的法律页面。
- 确认客户 Sanity Organization、Project、dataset、Studio host、编辑角色、账号恢复与平台原生数据导出责任；不得把它写成框架已提供生产恢复。
- 明确页面清单、初始内容导入、Sanity Image CDN 和管理员本地图片 fallback 边界。

## 项目契约

```json
{
  "profile": "cms-brand",
  "contentSource": "sanity",
  "features": {
    "contactForm": true,
    "legalPages": ["privacy-policy", "terms-of-use", "customer-service-contact"]
  }
}
```

必须设置 `templateMode=false`，并让 `deployment.githubRepository` 指向客户 Organization 中的当前仓库。不要配置 Shopify 变量，不创建商品文档。

## 平台边界

- 客户专属 GitHub Organization / Private repository、域名和 Cloudflare：必须。
- 客户 Sanity Organization / Project / dataset：必须。
- Resend、Turnstile：只在 `contactForm=true` 时创建客户专属资源；B Worker 始终包含用于 webhook 幂等的协调对象。
- Shopify Store、Headless、Admin API、Storefront API 和商品 Webhook：不创建。

## 初始内容与 Studio

初始化 Home、About、Contact、站点设置、导航和合同选择的法律页面。B 不允许选择 `shipping-returns-policy`，也不启用 Products 与商品详情页；非交易品牌目录属于独立扩展，不复用 C 的商品 CMS。

Studio 可见：

- 页面工作台
- 全部内容
- Vision
- Releases

Studio 隐藏：

- 商品工作台
- 商品上线向导
- 商品文档创建和 Shopify 映射字段

## 验证

先运行 `validation.md` 的 Common，再运行：

```powershell
npm.cmd run test:profile:cms-brand
npm.cmd run test:project-config
npm.cmd run test:sanity
npm.cmd run studio:build
npm.cmd run build
```

无凭据 CI 使用独立的 `contentSource=local` B fixture；不得用环境变量覆盖真实项目契约。获得授权的集成或生产构建才使用契约中的 `contentSource=sanity`。还需验证 Sanity publish 只产生一次 rebuild-request receipt、不会自动部署；人工 Deploy 单独授权。Studio 不出现 Products page kind、商品嵌套字段或商品工具入口，禁用 Contact 时不要求表单 secret。

## 完全交付差异

除统一仓库、域名、Cloudflare、部署和账号恢复入口外，B 必须让客户独立控制 Sanity Owner、dataset、Studio 成员、API token 轮换和内容发布。启用 Contact 时同时交付 Resend 和 Turnstile；Worker 协调对象随部署创建。按 `platform-ownership-and-handoff.md` 完成验收。
