# Example Brand 客户运营手册总入口

本文用于把客户日常操作按交付方案分流。客户只需要阅读自己购买或正在使用的方案手册，不需要理解完整技术架构。

## 先确认你的方案

| 方案 | 适合客户 | 客户日常入口 | 是否需要 Shopify |
| :--- | :--- | :--- | :---: |
| A1/A2 静态品牌官网 | 只展示品牌、发布基础信息；A2 增加轻量表单 | 不登录后台，向维护方提交修改需求 | 否 |
| B 可自维护品牌官网 | 需要自己维护 Home、About、Contact 等页面内容 | Sanity Studio 页面工作台 | 否 |
| C 零售目录与内容运营基础框架 | 需要维护页面内容、商品目录、商品故事和多语言发布状态 | Sanity Studio + Shopify 只读目录映射 | 是，仅作目录来源 |

## 选择对应手册

- [A 方案客户手册：静态品牌官网](customer-operations-static-brand.md)
- [B 方案客户手册：可自维护品牌官网](customer-operations-cms-brand.md)
- [C 零售目录与内容运营基础框架客户手册](customer-operations-retail.md)

## 模块手册

以下手册是模块说明，通常作为 B/C 方案的补充材料：

- [页面运营手册](customer-page-operations.md)
- [商品运营手册](customer-product-operations.md)

## 维护边界

- 客户日常只处理内容、图片、页面发布、商品内容上下线、归档和取消归档等运营动作。
- GitHub、Cloudflare、命令行、构建脚本、token、Webhook 和 schema 由技术维护人员处理。
- 价格、库存、SKU、订单、支付和履约不写入 Sanity 或静态内容。
- C 不包含 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存；Shopify 只提供商品目录和媒体事实的只读映射。
- 商品归档和取消归档是内容可见性生命周期，不是 Backup 或 Restore。

## 资产与完全交付

A1、A2、B、C 都使用同一条交付规则：通过公开框架 Template repository 创建独立 Private repository，正式代码仓库从第一天起就属于客户专属 GitHub Organization；域名、Cloudflare 及当前方案启用的 Sanity、Shopify、Resend 等生产平台也属于客户。客户授权管理员会另行收到平台资产登记表、账户恢复方式和账单入口；本手册只说明日常运营，不记录 secret 或要求内容编辑操作基础设施。

完整规则见 [统一项目启动与完全交付规则](project-startup-and-handoff.md)。
