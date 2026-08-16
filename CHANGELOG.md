# Changelog

本文件记录 ZUnfurl 的公开版本变化。版本遵循 [Semantic Versioning 2.0.0](https://semver.org/)，但 `0.x` 仍可能发生不兼容调整。

## [Unreleased]

- 尚无已排期变更。

## [0.3.0-preview.1] - Preview candidate

这是首个公开源码候选；在 tag 和 GitHub Release 获得单独授权前，它仍只是候选状态。

### Added

- A1/A2/B/C 四种可初始化、可独立验证的 Profile fixture。
- Apache-2.0 源码许可、逐文件媒体权利清单、第三方许可证复核和 CycloneDX 1.6 SBOM。
- Contact 与 webhook 的 SQLite-backed Durable Object 原子协调测试。
- fork-safe PR CI、CodeQL、Dependency Review、Dependabot 和历史密钥扫描工作流。
- 社区贡献、安全报告、支持、治理和 Release Gate 文档。

### Changed

- Phase 8 采用 Lite 发布路线：detached Release evidence、same-maintainer fork canary、专用 release Team/tag-creation ruleset和重复全量 Actions 日志扫描降为非阻断；首个 Preview 保留签名 tag、SBOM、校验和、匿名 clone、Template smoke 与必要 GitHub 安全设置。
- 公开产品名采用 ZUnfurl；内部 `gcss-*` package、配置文件和 Skill 标识暂时保留，以避免无必要的破坏性迁移。
- C 的公开定位收窄为 **Retail Catalog & Content Foundation**：只读映射 Shopify 目录与媒体事实，不提供交易闭环。
- `frameworkVersion` 和所有私有 workspace 统一为完整 SemVer prerelease `0.3.0-preview.1`。
- 生产 Deploy 改为仅 `main` 人工触发，并要求远程 `production` Environment 与显式 arming。
- Sanity/Shopify webhook 只产生去重后的 rebuild-request receipt，不自动 build 或 deploy。
- Git checkout 统一为 LF，确保 Windows 默认 `core.autocrlf` 不改变受哈希门禁管理的资产和供应链文件。
- CodeQL 与 Dependency Review 在不受 GitHub Free 支持的 Private 阶段显式跳过，并在 Public 后自动启用；Private clean-room Gate 仍由本地供应链门禁与 Secret Scan 覆盖。

### Removed

- 未实现的 Authenticated Editorial/Draft Preview 能力声明；`/preview` 与 `/preview/*` 现在 fail-closed 返回 `404`。
- 默认 Actions 中仅为设计草案的 Backup/Restore 工作流；不可执行样例移入 Roadmap。

### Known limitations

- 不包含 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存。
- Authenticated Editorial/Draft Preview、生产 Backup 和灾难 Restore 仍是 Roadmap。
- 只支持最新公开的 `0.x` Preview；社区支持为 best effort，不提供免费 SLA。
- 净化根历史已替换 Private 远端，目标仓库已迁移至 `ZUnfurl/zunfurl`；正式发布仍需最终精确 SHA 的托管 CI、Public 后匿名 clone 和远程仓库保护 Gate。tag 与 GitHub Release 已获授权，但只能在全部 Gate 通过后执行。

### Security

- 当前依赖审计为 `0 critical / 0 high / 7 moderate / 0 low`；剩余项已进入后续升级跟踪，不表示零风险。
- Gitleaks 的唯一误报例外同时绑定 `generic-api-key` 规则、Release evidence schema 唯一路径与完整 `operatorAttestation` 枚举行，并在每次真实历史/Actions 日志扫描前运行正确行、错误路径和错误行语义探针；不存在目录级或规则级 blanket allowlist。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私密报告，不要创建公开 Issue。
