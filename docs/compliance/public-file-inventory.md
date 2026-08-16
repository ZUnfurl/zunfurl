# 公开文件清单与处置决定

> 清单日期：2026-08-15
>
> 候选源 commit：`b0e5a0986e1b2f6e4a4ed52085208515dc741516`
>
> 机器清单：`docs/compliance/public-file-inventory.json`

本清单固定 Phase 1 的来源树，并把工作树中的净化替换作为 overlay 单独记录。来源 commit 的 237 个 tracked path 均记录 Git blob SHA、字节数、类别和 `include / rewrite / exclude` 决定。清单文件本身不递归登记；Phase 6 必须在冻结候选 commit 后重新生成最终 tree manifest。

## 决定语义

- `include`：属于公共候选范围，但仍需通过对应 Content、Rights、Security 或 Engineering Gate。
- `rewrite`：不得发布来源 blob；只有通过 Gate 的工作树替换才能进入候选。
- `exclude`：不进入公共候选树，也不通过修改旧历史来隐藏；新公共历史从批准树重新建立。

来源树决定汇总：`{"exclude":8,"include":185,"rewrite":44}`。Phase 1 记录时的工作树 overlay 汇总：`{"exclude":16,"include":152,"rewrite":6}`。

## 项目日志逐项决定

| 路径 | 类别 | 决定 | 原因 |
| --- | --- | --- | --- |
| `docs/project-log/daily/2026-07-07.md` | internal-log | exclude | 私有工程日志含仓库状态、阶段证据或内部判断，从公共候选排除。 |
| `docs/project-log/daily/2026-07-10.md` | internal-log | exclude | 私有工程日志含仓库状态、阶段证据或内部判断，从公共候选排除。 |
| `docs/project-log/daily/2026-08-15.md` | internal-log | exclude | 私有工程日志含仓库状态、阶段证据或内部判断，从公共候选排除。 |

项目日志只留在私有档案。面向公共使用者的稳定信息必须进入 README、Release Status、Roadmap、Security 或版本化迁移说明，而不是复制内部时间线。

## 商业交付材料逐项决定

| 路径 | 类别 | 决定 | 原因 |
| --- | --- | --- | --- |
| `docs/client-v3-architecture-advantages.md` | commercial-delivery-doc | exclude | 工作树已移除来源文件；公共候选不得继续携带该 blob。 |
| `docs/framework-productization-plan.md` | architecture-doc | exclude | 工作树已移除来源文件；公共候选不得继续携带该 blob。 |
| `docs/customer-operations.md` | commercial-delivery-doc | rewrite | C 必须改称 Retail Catalog & Content Foundation，并删除框架提供购买流程的暗示。 |
| `docs/customer-operations-static-brand.md` | commercial-delivery-doc | include | 当前实现或公共说明属于候选范围，可保留并继续接受后续 Gate。 |
| `docs/customer-operations-cms-brand.md` | commercial-delivery-doc | include | 当前实现或公共说明属于候选范围，可保留并继续接受后续 Gate。 |
| `docs/customer-operations-retail.md` | commercial-delivery-doc | rewrite | C 必须改称 Retail Catalog & Content Foundation，并删除框架提供购买流程的暗示。 |
| `docs/customer-page-operations.md` | commercial-delivery-doc | include | 当前实现或公共说明属于候选范围，可保留并继续接受后续 Gate。 |
| `docs/customer-product-operations.md` | commercial-delivery-doc | rewrite | C 必须改称 Retail Catalog & Content Foundation，并删除框架提供购买流程的暗示。 |
| `docs/project-startup-and-handoff.md` | commercial-delivery-doc | rewrite | 原文假定私有框架模板，公开仓库发布前必须改写启动口径。 |

静态站、CMS 品牌站和页面运营手册可以保留；涉及 C 的文档必须统一改称 Retail Catalog & Content Foundation，不得暗示框架提供 Cart、Checkout、支付、订单或履约。

## 旧架构与迁移文档逐项决定

| 路径 | 类别 | 决定 | 原因 |
| --- | --- | --- | --- |
| `docs/astro-sanity-shopify-cloudflare-retail-framework-v2.1.md` | architecture-doc | exclude | 工作树已移除来源文件；公共候选不得继续携带该 blob。 |
| `docs/contact-lightweight-form-design.md` | architecture-doc | rewrite | Contact 设计保留技术价值，但需删除时效价格、内部状态和未验证表述。 |
| `docs/framework-module-audit.md` | architecture-doc | exclude | 工作树已移除来源文件；公共候选不得继续携带该 blob。 |
| `docs/gcss-v3-site-framework-template-plan.md` | architecture-doc | rewrite | 保留主题，但必须改写为 ZUnfurl 公开架构和当前能力矩阵。 |
| `docs/site-image-source-migration-plan.md` | architecture-doc | exclude | 工作树已移除来源文件；公共候选不得继续携带该 blob。 |
| `docs/storefront-page-layering.md` | architecture-doc | exclude | 工作树已移除来源文件；公共候选不得继续携带该 blob。 |

旧 C v2.1 文档含来源站点流量指标，并把动态购买、Preview、Backup 和 Restore 写成现有架构，因此直接排除。需要保留的主题应从当前实现和 Release Status 重新写，而不是修补旧结论。

## Fixture 净化

- Shopify 测试店铺统一改成明确虚构的 `example-store.myshopify.com` 或 `example-brand-test.myshopify.com`。
- 13 位拟真 Product ID 已移除；后续最小合约测试使用明确的非数字 test fixture，不再伪装真实 Product ID。
- 文档邮箱统一使用 `example.com`；D-10 Security/CoC 邮箱只在批准的治理文档中按摘要哈希放行。
- Schema `$id` 已从未控制的 HTTPS 域名改为已批准的稳定 URN。

## 文本与历史扫描

- Phase 1 当时的工作树：扫描 236 个文本文件，未批准命中 0；当前候选树由持续门禁重新生成独立报告。
- 可达历史：扫描 426 个文本 blob，发现 39 个未批准命中（`REAL_DOMAIN` 33、`EMAIL_ADDRESS` 1、`ORDER_SHAPED_DATA` 2、`STORE_IDENTIFIER` 3）。
- 报告只保存路径、行号、规则和摘要哈希；不保存或回显疑似值。
- 历史报告是生成净化新历史的输入，不能据此改写现有私有仓库历史。

执行命令：

```powershell
node scripts/tests/validate-public-text.mjs --current --report docs/compliance/public-text-scan-current.json
node scripts/tests/validate-public-text.mjs --history --report docs/compliance/public-text-scan-history.json
node scripts/compliance/generate-public-file-inventory.mjs
```
