# Roadmap

> 项目阶段：`0.x preview`
>
> 本文不承诺发布日期。优先级取决于权利、安全、Profile 正确性和真实采用证据。

Roadmap 只记录尚未交付的未来能力。首次公开的 P0 问题，例如许可证、客户素材、乱码、依赖漏洞和初始化后 Profile 失败，不得降级成 Roadmap 来绕过发布门槛。

## 1. 首个 Preview 之前

以下仍是 Release blockers，不是未来功能：

- 由 Owner 保管真实自然人与 `Noodle Freeman` 的私有身份映射及权利链证据，并在候选远程验证安全邮箱、Private Vulnerability Reporting、CODEOWNERS 与 Community Profile。
- 建立净化 Git 历史、托管公共治理证据和匿名复现证据。
- 在净化后的唯一候选 commit 上取得托管 CI 全绿，并验收真实远程 `production` Environment、deployment branch policy 与 arming 设置；独立 required reviewer 仅在 GitHub 计划支持时成立。

已完成但不因此解除上述门禁：Phase 1 已替换来源不明素材、建立资产 manifest、重写损坏中文并增加 UTF-8 门禁；Phase 2 已收口 C 定位、Preview/Recovery 边界和公开上游流程；Phase 3 已完成四份初始化后 fixture、Profile 隔离、C 示例商品解耦、Contact/Webhook 边界与静态检查；Phase 4 已将完整树和 production tree 的 critical/high 清零，建立可重现 SBOM、依赖许可证政策、固定 SHA Actions、无生产 secret 的 PR CI 与手动生产部署边界；Phase 5 已建立 Apache-2.0 仓库许可覆盖、DCO 与社区治理、README/Release 契约和完整 SemVer 对齐；稳定 URN Schema namespace已实施。

完整顺序见[开源执行计划](open-source-preview-release-plan.md)。

## 2. PREVIEW-01：Authenticated Editorial/Draft Preview

### 当前状态

Roadmap。GitHub PR 构建验证和 Astro 本地 `preview` 不等于编辑内容预览。

当前 Worker 不提供 Draft Preview handler，`/preview` 和 `/preview/*` 以 `404` fail-closed，也不是已认证的公开 API。不得通过恢复 `PREVIEW_SECRET`、共享 URL 或 `?token=` 参数绕过本条 Roadmap。

### 进入实现前的契约

- 读取真实 Sanity draft，不使用伪造 JSON 路径冒充内容预览。
- 输出可审阅的 HTML 页面。
- 使用身份认证和短期会话；任何 query-string token 都必须被拒绝，不在 URL、浏览器历史或访问日志中放置 secret。
- 页面强制 `noindex`，缓存和分享边界清晰。
- A1/A2/B/C 按 Profile 裁剪，不暴露禁用数据源或工具。
- 有可审计的访问、撤销和失败语义。

### 完成定义

必须在独立预览环境中通过认证、权限、draft freshness、泄漏防护和浏览器验收，才可从 `Roadmap` 改为 `Preview`；完成跨 Profile 的稳定性、运维和迁移证据后，才可再评估 `Supported`。

## 3. BACKUP-01：Production Backup

### 当前状态

Roadmap。现有 manifest/dry-run 计划器不执行真实导出，也不向 R2 或其他备份目标写入对象。

### 进入实现前的契约

- 对启用平台执行真实导出，并明确 Sanity、Shopify 和静态资产的不同所有权。
- 使用客户专属私有存储；R2 Bucket 不公开，不作为日常 DAM。
- 提供加密、SHA-256、对象清单、保留期、轮换和删除策略。
- 使用最小权限凭据，不在日志或 artifact 中包含 secret、订单或客户隐私。
- 记录恢复点、成功时间、失败原因和责任人。

### 完成定义

必须有可重复的导出、校验、保留和访问控制证据，不能只生成计划文件。Shopify 订单、支付和交易记录仍由 Shopify 及客户既定策略负责，不因本框架备份静态配置或目录数据而获得灾难恢复保证。

## 4. RESTORE-01：Disaster Recovery Restore

### 当前状态

Roadmap。当前脚本不执行导入或恢复。商品内容 archive/unarchive 是内容生命周期，不等于灾难恢复。

### 进入实现前的契约

- 默认恢复到隔离 dataset、store sandbox 或隔离资源。
- 恢复前验证 manifest、校验和、版本和目标身份。
- 完成数据完整性、引用、语言状态和页面构建检查。
- 覆盖生产前需要人工批准、维护窗口和可验证回滚点。
- 不提供无确认的一键生产覆盖。

### 完成定义

必须基于 `BACKUP-01` 生成且验证通过的恢复点，先完成一次隔离环境恢复演练、失败注入和人工批准流程，才可从 `Roadmap` 改为 `Preview`。在多个版本和至少一个真实客户边界中积累稳定证据后，才可评估 `Supported`。

## 5. 可选交易扩展

Cart、Checkout handoff、客户账户和其他购买能力不是当前 C 的缺失补丁，而是未来独立产品扩展。

若未来立项，必须先建立独立能力契约，至少覆盖：

- Shopify Cart/Checkout 所有权和 API 版本；
- 价格、库存和市场实时性；
- 税务、配送、支付和订单责任边界；
- 隐私、同意、分析和错误恢复；
- 不触发整站重建的动态读取策略；
- A/B/C 升降级和禁用模块清理。

没有上述契约前，不在 README、演示站或客户手册暗示可以购买。

## 6. 进入 1.0 的候选门槛

以下是讨论基线，不构成日期承诺：

- 至少一个 `0.x` Preview 被匿名用户从模板成功初始化。
- A1/A2/B/C 独立 fixture 和公共 CI 稳定运行。
- Profile、Schema、Worker 和初始化器兼容策略经过至少一次真实迁移验证。
- Security、依赖、SBOM、资产 provenance 和发布证据成为持续门禁。
- 支持范围、弃用窗口、维护者继任和安全响应流程可持续。
- Roadmap 能力只有在满足各自验收契约后才进入稳定范围。

## 7. Roadmap 变更规则

- 每项功能必须有 owner、验收契约和目标版本，才可进入 Active。
- 状态只允许按证据从 `Roadmap` → `Preview` → `Supported` 推进；实现代码存在本身不构成升级依据。
- Roadmap 不等于承诺；Release note 必须再次披露当时状态。
- 实现代码、README、Skill、客户手册、测试和工作流必须在同一变更中同步。
- 涉及生产数据写入、删除、恢复或第三方平台配置时，继续要求明确授权。
