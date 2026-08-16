# ZUnfurl Release Checklist

> 候选版本：`0.3.0-preview.1`
>
> Release title：`ZUnfurl v0.3.0-preview.1`
>
> 分发类型：source-only GitHub Pre-release；不发布 npm package、构建产物、容器或第三方二进制。

本清单是发布操作门禁，不是当前完成证明。只有证据存在时才可勾选；Public、tag 和 GitHub Release 必须分别获得明确授权。

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
- [ ] `sbom.cdx.json` 可重现，SHA-256 与 Release evidence 一致。
- [ ] GitHub Actions 使用批准的完整 commit SHA，PR 路径不读取 production secrets。

## 4. 社区与安全

- [ ] Contribution、DCO、Code of Conduct、Security、Support、Governance 与 Maintainers 入口可访问。
- [ ] Issue forms、PR template 与 CODEOWNERS 在候选默认分支生效。
- [ ] Private Vulnerability Reporting 已在公共仓库远程启用并完成一次私密测试。
- [ ] `mp4102@gmail.com` 已完成收件测试；当前无独立替代联系人这一限制已披露。
- [ ] 默认分支 ruleset、required checks、CODEOWNERS review 和禁止 force-push 已在远程验收。

## 5. 匿名重现

- [ ] 从净化后的公共候选执行匿名 fresh clone；无私有 remote、submodule、LFS 或隐藏依赖。
- [ ] Windows/Node 22.12、Linux/Node 22.12 与 Linux/Node 24 托管 CI 全绿。
- [ ] `Use this template` 创建的独立 Private 测试仓库可完成 A1/A2/B/C dry-run 与初始化。
- [ ] README 所有本地链接、命令、截图和安全入口均从匿名视角可用。

## 6. 三次授权与发布

- [ ] **Public 授权**：Owner 明确批准将净化后的目标仓库设为 Public。
- [ ] Template repository 标记、描述、topics 与默认分支设置已复核。
- [ ] **Tag 授权**：Owner 明确批准创建签名 annotated tag `v0.3.0-preview.1`。
- [ ] tag 精确指向唯一候选 commit，且没有移动或复用既有 tag。
- [ ] **Release 授权**：Owner 明确批准发布 `ZUnfurl v0.3.0-preview.1`。
- [ ] GitHub Release 标记为 Pre-release，仅附源码、SBOM 与脱敏证据摘要。
- [ ] Release note 包含成熟度、Profile 范围、C 排除项、Known limitations、Roadmap、安全入口和迁移说明。

## 7. 发布后

- [ ] D+1：验证 License、Template 按钮、PVR、匿名 Quick Start 和下载源码。
- [ ] D+7：从 Template 创建独立 Private 仓库，复核四 Profile 与 fork PR 边界。
- [ ] D+30：复盘依赖、许可证、资产、Issues 与维护负担，并决定下一 Preview。
- [ ] 若发现 secret 或权利问题，执行轮换/下架/公告；不把改回 Private 当作撤回已公开副本。

参见 [Release Policy](release-policy.md)、[Release Status](release-status.md) 与 [开源执行计划](open-source-preview-release-plan.md)。
