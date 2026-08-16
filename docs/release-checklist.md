# ZUnfurl Release Checklist

> 候选版本：`0.3.0-preview.1`
>
> Release title：`ZUnfurl v0.3.0-preview.1`
>
> 分发类型：source-only GitHub Pre-release；不发布 npm package、构建产物、容器或第三方二进制。

本清单是发布操作门禁，不是当前完成证明。只有证据存在时才可勾选。Owner 已授权完成 Phase 9 前所需的 tag 与 GitHub Release，并以“完成 Phase 8 后暂停”的明确指令单独批准 Phase 8 Public 窗口；授权不替代技术 Gate，Phase 9 仍需新的进入指令。

当前事实（不构成最终 Gate 通过）：目标为 `ZUnfurl/zunfurl` Private Template repository，默认分支 `main`；Organization 创建、仓库转移和改名已获单独确认并完成。GitHub sudo-protected UI 显示仓库和 Organization 均无已安装 App；Codespaces secrets UI 显示仓库无 secrets。Codespaces REST API 因当前 token scope 返回 `404`，零 secret 结论仅以精确人工 UI 证据补足。

截至 2026-08-16、源候选 `2b7aa20...` 的转移后审计快照为 4 个只读 closed-PR head refs、23 个只使用净化历史的 Actions runs、4 个 caches、2 个精确 GitHub-managed dynamic workflows 和 1 个空 `copilot` Environment。该快照不是冻结计数；本轮修复 PR/CI 会继续增加净化对象，最终只以合并后审计为准。快照中的 4 个及随后生成的全部 caches 必须在最终 G6a 后清空并复审为 0；这些对象不得与已清除的旧历史对象混称。

PR #5 由当前唯一维护者 `@mp4102` 提交并合并；合并前所有实际执行的自动门禁均为 `SUCCESS`，合格独立维护者批准为 `0`。Private 计划下 `SKIPPED` 的 CodeQL/Dependency Review 与合并后的 Copilot `COMMENTED` review 均不计作独立批准。

## 1. 候选冻结

- [ ] 候选树只包含拟公开文件，`git status` 与变更审阅已归档。
- [ ] 根目录、全部 workspace、`gcss.project.json`、fixtures、lockfile 和 Changelog 均为 `0.3.0-preview.1`。
- [ ] 所有 package 保持 `private: true`、`license: Apache-2.0`，不存在 `npm publish` 路径或发布凭据。
- [ ] `npm.cmd ci` 在 Node `22.12.0` 与 Node `24` 的全新环境可重复完成。
- [ ] 唯一候选 commit SHA 已记录；后续验证不再修改该 commit。

## 2. Scope 与 Rights

- [ ] README、Skill、能力矩阵、Known limitations 与 Roadmap 无矛盾。
- [ ] C 明确为 Retail Catalog & Content Foundation，且不声称交易能力。
- [ ] Authenticated Editorial/Draft Preview、生产 Backup 与灾难 Restore 明确标为 Roadmap。
- [ ] `LICENSE`、`NOTICE`、`TRADEMARKS.md`、逐文件资产清单和第三方 notices 全部通过门禁。
- [ ] 公共候选只含获授权或可再许可内容；私有权利证据不进入仓库。

## 3. Engineering 与供应链

- [ ] `npm.cmd run test:phase5` 全绿。
- [ ] A1/A2/B/C 四个初始化 fixture 在隔离临时目录通过完整 Gate。
- [ ] Storefront 与 Studio 构建、Worker runtime 测试和 Wrangler dry-run 全绿。
- [ ] full 与 production `npm audit` 均为 `0 critical / 0 high`；其余风险已记录。
- [ ] `sbom.cdx.json` 可重现，SHA-256 已写入 `SHA256SUMS` 并与 Release asset 一致。
- [ ] GitHub Actions 使用批准的完整 commit SHA，PR 路径不读取 production secrets。

## 4. 社区与安全

- [ ] Contribution、DCO、Code of Conduct、Security、Support、Governance 与 Maintainers 入口可访问。
- [ ] Issue forms、PR template 与 CODEOWNERS 在候选默认分支生效。
- [ ] Private Vulnerability Reporting 已在公共仓库远程启用并完成一次私密测试。
- [ ] `mp4102@gmail.com` 已完成收件测试；当前无独立替代联系人这一限制已披露。
- [x] 单维护者治理契约已冻结：`required_approving_reviews = 0`、`require_code_owner_review = false`；CODEOWNERS 只做责任与 review request 路由，不声称独立批准。
- [ ] 默认分支已按 `docs/compliance/github-public-security-policy.json` 远程验收：唯一 `main` ruleset 强制 PR、required checks、conversation resolution 与 linear history，禁止 force push 和 branch deletion，并保持单维护者 0 review；Immutable Releases 已启用。`npm.cmd run audit:phase8:github:security` 从干净 `main` 返回通过，且 Actions allowlist、PVR 与安全扫描证据完整。
- [x] 第二名维护者升级触发规则已冻结；当前名册仍只有一名合格 `write` maintainer，尚未触发。触发后必须在后续合并前改为 `required_approving_reviews >= 1`、`require_code_owner_review = true`，其余保护不得弱化。

## 5. G6a Private clean-room 重现

- [ ] 从 Private 候选执行经授权的全新隔离 checkout；只允许临时仓库读取凭据，不含 production secret、私有 registry、submodule、LFS 或隐藏依赖。
- [ ] Windows/Node 22.12、Linux/Node 22.12 与 Linux/Node 24 托管 CI 全绿。
- [ ] A1/A2/B/C fixture、Storefront/Studio build 与 Worker dry-run 在精确候选 SHA 上通过。
- [ ] `.gitattributes` 保证默认 Windows Git checkout 不改变受哈希门禁管理的文本字节。
- [ ] 最终 G6a 完成后，Actions caches 已按单独确认清空；远程 `--require-clean` 以精确仓库/根历史及 Apps、Codespaces 人工 attestation 返回 `go`。

前序证据仅供追溯：`2b7aa20efdc57564bbc36c720d208b64d1a2f3f5` 的 `main` run `31925593834` 有 7 个 job 全绿；`53c5f6d1fa650c168d434ec9c668fca1c0704ba9` 的 `main` run `31928082328` 也有 7 个 job 全绿，同 SHA 的 push Secret Scan run `31928060750` 成功。后者仍早于单维护者治理与客户仓库设置手册的最终提交，因此本节保持未完成，必须在最终精确 SHA 上重跑。

## 6. G6b Public 后、tag 前匿名重现

- [ ] 清空 GitHub token、credential helper 和私有 Git 配置后，从 Public HTTPS URL 执行真正匿名 fresh clone。
- [ ] 匿名 clone 的 HEAD 与候选 SHA 一致，Quick Start、完整门禁和全部公开链接可用。
- [ ] 真正无目标仓库写权限的外部 fork PR 路径标为 0.x 已知限制，并在首个真实外部贡献者 PR 后补验；它不是首个 Preview 的阻断项。
- [ ] `Use this template` 创建的独立 Private 测试仓库可完成 A1/A2/B/C dry-run 与初始化。

## 7. 三次授权与发布

- [x] **Public 授权**：Owner 已以“完成 Phase 8 后暂停”的明确指令批准将净化后的目标仓库设为 Public。
- [ ] Template repository 标记、描述、topics 与默认分支设置已复核。
- [x] **Tag 授权**：Owner 已明确批准在全部 Gate 通过后创建签名 annotated tag `v0.3.0-preview.1`。
- [ ] 已建立、保护并验证可用于该 tag 的签名 key；当前尚无可用签名 key。
- [ ] tag 精确指向唯一候选 commit，且没有移动或复用既有 tag。
- [x] **Release 授权**：Owner 已明确批准在全部 Gate 通过后发布 `ZUnfurl v0.3.0-preview.1`。
- [ ] 启用并审计 Immutable Releases；创建 draft Pre-release，上传 `sbom.cdx.json` 与 `SHA256SUMS` 并逐项核对摘要和 content type。
- [ ] GitHub Release 标记为 Pre-release，仅附源码、SBOM 与 `SHA256SUMS`；发布后复核 `immutable=true`、tag target 和资产摘要。
- [ ] Release note 包含成熟度、Profile 范围、C 排除项、Known limitations、Roadmap、安全入口和迁移说明。

## 8. 发布后

- [ ] D+1：验证 License、Template 按钮、PVR、匿名 Quick Start 和下载源码。
- [ ] D+7：从 Template 创建独立 Private 仓库，复核四 Profile 与 fork PR 边界。
- [ ] D+30：复盘依赖、许可证、资产、Issues 与维护负担，并决定下一 Preview。
- [ ] 若发现 secret 或权利问题，执行轮换/下架/公告；不把改回 Private 当作撤回已公开副本。

参见 [Release Policy](release-policy.md)、[Release Status](release-status.md) 与 [开源执行计划](open-source-preview-release-plan.md)。
