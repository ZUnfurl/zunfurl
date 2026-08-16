# Release Policy

> 状态：Phase 5 候选契约；发布实施仍待后续 Gate 与三次明确授权
>
> 首个候选：`v0.3.0-preview.1`

本文定义 `ZUnfurl` 的公共版本、支持、兼容和发布证据规则。现有内部 `gcss-*` 技术标识为兼容性暂时保留。许可证、版权主体和版本对齐方式已在 Phase 0 确认；本政策不表示发布 Gate 已通过。

## 1. 版本语义

- `v3` 是项目产品代际，不自动等于 SemVer major。
- Git tag 和 `package.json.version` 使用 SemVer。
- `0.x` 表示公共契约仍可能发生 breaking change。
- `-preview.N` 表示公开预览通道；GitHub Release 必须标记 Pre-release。
- 首个候选版本确定为 `v0.3.0-preview.1`。

`schemaVersion: 1` 是项目契约 Schema 的独立整数版本，不是框架 SemVer，不随每次 Preview 自动递增。

根版本、`gcss.project.json.frameworkVersion`、全部私有 workspace、fixtures 与 lockfile 已统一为 `0.3.0-preview.1`。`gcss.project.schema.json` 和 JavaScript validator 使用同一套完整 SemVer 2.0.0 语义，并以合法/非法 prerelease 反向用例防止漂移。该对齐仅建立候选版本，不代表 tag 或 Release 已获授权。

## 2. 发布类型

| 类型 | 示例 | 用途 |
| --- | --- | --- |
| Preview prerelease | `v0.3.0-preview.1` | 首次公开、迁移或大范围兼容验证 |
| Preview patch | `v0.3.0-preview.2` | 同一候选线的修复和文档改进 |
| 0.x release | `v0.3.0` | 仅在 Preview 证据充分后评估，不代表 1.0 稳定性 |
| Stable | `v1.0.0` | 只有达到 Roadmap 中的 1.0 门槛后才允许 |

不使用 SemVer 上低于现有发布基线的 tag，也不移动、覆盖或复用已发布 tag。

同一候选线只增加 prerelease 序号，例如 `preview.1` → `preview.2`。兼容的新功能进入下一 minor 候选线；候选公开契约的 breaking change 至少进入下一 minor 候选线，并在 `0.x` Release note 中醒目标记。安全或权利修复可以直接进入下一 prerelease，但不得复用旧 tag。

## 3. 版本权威

正式 Release 前必须保持一致：

- 根 `package.json.version`；
- `gcss.project.json.frameworkVersion`；
- 按 D-14 批准策略处理的 workspace 版本；
- `CHANGELOG.md`；
- Git tag；
- GitHub Release title 和说明；
- 发布证据文件名和 commit SHA。

客户项目继续在 `frameworkVersion` 记录来源版本。框架更新不会自动覆盖客户仓库，升级必须通过显式迁移说明和 Profile 验证。

首个 GitHub Release title 使用 `ZUnfurl v0.3.0-preview.1`。旧项目日志、内部 package 和历史证据保留其当时名称，不为追求表面一致而机械改写。

## 4. Package 发布边界

- 所有 root/workspace package 继续保持 `private: true`。
- 首个 Preview 只发布 GitHub 源码，不执行 `npm publish`。
- npm package 发布需要未来独立设计 `files` allowlist、`exports`、scope、provenance 和许可证审计。
- Release 不附带 `node_modules`、构建缓存、FFmpeg、libvips 或未经审核的第三方二进制。

### 4.1 许可、署名与法域

- 代码、项目文档和 Skill 使用 Apache-2.0；标准 `LICENSE` 原文不得加入项目自定义限制。
- 公开版权声明使用 `Copyright 2026 Noodle Freeman`。该名称是自然人的公开笔名，不是 GitHub Organization 或独立法人。
- 项目不另行指定 governing law 或专属法院。不得将其表述成“不受任何法律约束”；权属、保护和救济仍按具体事实由有管辖权的法律确定。
- 真实身份与笔名映射、权利链声明和授权证据只保存在私有证据包，不进入公共仓库。
- 部署 Contact、Analytics 或 Hosted Service 的运营者仍必须按所在地、处理地点和目标市场补齐真实法律身份及隐私信息。

## 5. 支持政策

- `0.x preview` 默认只支持最新公开 Preview。
- 社区支持为 best effort，不承诺免费 SLA。
- 普通 bug 通过公开 Issue；安全问题通过 Private Vulnerability Reporting 或 `SECURITY.md` 指定的私密渠道。
- 客户生产账号、secret、部署、订单和运营问题留在客户私有仓库或商业支持边界。
- 是否为旧 Preview 回补安全修复由漏洞严重性、可利用性和维护能力决定，并在 Security Advisory 中说明。

## 6. Breaking change 与弃用

- `0.x` 可以包含 breaking change，但必须在 CHANGELOG、迁移说明和 Release note 中标记。
- Profile key、`gcss.project.json` schema、内容文档类型、Worker 路由和初始化器写入清单属于高影响契约。
- 可以通过公开名称收口 C 的定位，但机器 profile `retail` 不因营销命名变化而改名。
- 弃用项必须给出替代方案和删除目标版本；安全或权利问题可以立即移除，但需要发布说明。
- API、Astro、Node、Sanity、Shopify 和 Wrangler 版本升级只有在四 Profile fixture 通过后才能进入 Release。
- `0.3.0-preview.1` 支持 Node `22.12.0` 与 Node `24`；根 `engines` 在未完成 Node 25 验证前保持 `<25`。

## 7. Release Gate

每个公开版本必须通过：

1. Scope Gate：公开能力矩阵、Known limitations 和 Roadmap 一致。
2. Rights Gate：许可证、版权、素材 provenance、NOTICE 和第三方许可证完整。
3. Engineering Gate：A1/A2/B/C 初始化后 fixture、构建和 Worker dry-run 全绿。
4. Security Gate：原始及公共历史扫描完成，npm critical/high 为 0，Actions 固定 SHA。
5. Community Gate：Security、Support、Contributing、Governance 和 Issue/PR 入口可用。
6. Reproducibility Gate：匿名全新 clone 在受支持 Node 环境可 `npm ci` 并通过 required checks。
7. Authorization Gate：Public、tag、GitHub Release 分别获得明确授权。

详细停止条件见[开源执行计划](open-source-preview-release-plan.md)。

## 8. Tag 与 GitHub Release

- tag 必须是签名 annotated tag，并指向通过全部 Gate 的唯一 commit。
- 只有明确的 Release maintainer 可以创建 `v*` tag。
- Preview 的 GitHub Release 必须标记 Pre-release。
- Release note 必须包含：成熟度、Profile 范围、C 排除项、Known limitations、Roadmap、安全报告入口、支持的 Node/npm 和迁移说明。
- Release 附加脱敏证据摘要、SBOM 和 SHA-256；不附加 secret scanner 原始命中或私有授权材料。
- tag、Release 和 Public 切换是三个独立授权操作。

## 9. 发布证据

证据至少记录：

- release commit 和 source commit SHA；
- lockfile、资产 manifest 和 SBOM SHA-256；
- Node、npm、OS 和 scanner 版本；
- A1/A2/B/C fixture 结果；
- npm audit 统计；
- Windows/Linux CI URL；
- Known limitations 和 Roadmap；
- 执行时间、责任人和例外到期日。

公共仓库只保留脱敏摘要。合同、授权书、credential rotation、原始扫描命中和内部平台标识保留在私有证据包。

## 10. 发布后响应

- D+1：验证 License、模板按钮、公开链接、安全功能和匿名 Quick Start。
- D+7：用 `Use this template` 创建独立 Private 测试项目，复核四 Profile 和 fork PR 边界。
- D+30：发布维护复盘，更新依赖/许可证/资产审计，并决定下一 Preview。
- 如发现 secret，先吊销/轮换；如发现权利问题，立即下架资产并发布说明。把仓库改回 Private 不能撤回已有副本。

## 11. 相关文档

- [Release Status](release-status.md)
- [Roadmap](roadmap.md)
- [Phase 0 开源决策记录](open-source-decisions.md)
- [开源执行计划](open-source-preview-release-plan.md)
- [兼容性 Skill 参考](../.agents/skills/gcss-v3-site-framework/references/compatibility.md)
