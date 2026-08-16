# 仓库许可与分发政策

## 1. 目的与发布边界

本政策定义 ZUnfurl `0.x Preview` 源码发布中第一方材料、媒体资产、第三方依赖、项目标识和贡献的许可边界。它服务于可重复的发布门禁，不替代适用于具体使用者的法律意见。

当前发行物是源码归档，不包含 `node_modules/`、下载的 FFmpeg 可执行文件、Sharp/libvips 预编译包、容器镜像、客户资料、私有审计底稿或生产凭据。若未来发行物形态改变，必须重新执行制品级许可审查。

## 2. 第一方代码、文档与 Skill

除本政策明确列出的例外外，下列第一方材料统一依据 [Apache License 2.0](../../LICENSE) 分发：

- 应用、Workspace package、脚本、配置及测试代码；
- 项目文档、Skill、示例配置、示例内容及法律文本示例；
- GitHub workflow、Issue/PR 模板和项目治理文件；
- 由项目作者编写的清单、元数据和构建定义。

公共版权署名为 `Copyright 2026 Noodle Freeman`。`Noodle Freeman` 是公开使用的版权署名；它不构成关于自然人真实姓名、法律身份、注册主体或组织形式的陈述。本仓库不另设 governing-law 条款。

仓库根目录的 [`LICENSE`](../../LICENSE) 必须保持 Apache Software Foundation 发布的 Apache License 2.0 英文原文；[`NOTICE`](../../NOTICE) 保存随派生发行物传递的第一方归属信息。

## 3. 媒体资产

图片、视频、字体、音频、图标等媒体不能仅凭所在目录推定为 Apache-2.0。`apps/storefront/public` 下的每个媒体文件必须逐文件登记在 [`ASSET_LICENSES.yml`](ASSET_LICENSES.yml)，并通过来源、权利、哈希、引用和人工复核门禁。

当前已批准的演示媒体采用 CC0-1.0；这一结论只适用于清单中路径与 SHA-256 完全匹配的文件。新增、替换或移动媒体时，必须先更新逐文件清单并重新验证。客户资产、品牌照片、字体和其他真实业务素材不得作为演示素材进入公共模板，除非已经取得明确、可再分发的许可并留下公开证据。

CC0-1.0 不授予商标权，也不改变 [`TRADEMARKS.md`](../../TRADEMARKS.md) 所述项目标识边界。

## 4. 第三方软件与数据

第三方软件、数据和工具保留各自上游许可，不会因出现在依赖图、锁文件或 SBOM 中而被重新许可为 Apache-2.0：

- [`sbom.cdx.json`](../../sbom.cdx.json) 是版本完整的依赖清单和第三方元数据快照；
- [`package-lock.json`](../../package-lock.json) 固定安装图，其中的第三方包名、版本和完整性元数据继续服从各自上游权利；
- [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) 记录需要突出保留的归属及源码发布边界；
- [`dependency-license-policy.json`](dependency-license-policy.json) 记录机器可验证的 allowlist、逐版本审查规则与复审触发条件；
- `node_modules/` 及下载的二进制依赖不属于源码发行物。

任何 vendoring、二进制打包、容器发布、桌面封装或 server image 发布都会改变合规边界，必须在发布前重新生成 SBOM、保存适用许可文本并完成制品级审查。

## 5. 项目名称与标识

Apache-2.0 和 CC0-1.0 都不授予对 `ZUnfurl` 名称、项目 logo、商号、服务标志或其他来源标识的商标许可。合理指称、来源说明和 `NOTICE` 归属不受影响；派生项目不得暗示官方背书。完整规则见 [`TRADEMARKS.md`](../../TRADEMARKS.md)。

## 6. 外部贡献

项目采用 DCO 1.1 sign-off，不要求 CLA。人类贡献者通过逐 commit 的 `Signed-off-by` 确认其有权依据仓库相同的 Apache-2.0 条款提交贡献；所有被接受的贡献均遵循 inbound=outbound，PR 中的单方附加条款不会改变该规则。首个 Preview 不接受 `Co-authored-by` 多作者 commit。唯一免签对象是 GitHub REST metadata 精确认证、固定 bot ID 与 noreply 身份且 GitHub signature verification 为 `verified/valid` 的 `dependabot[bot]` 自动依赖更新；它被视为仓库配置触发的机器更新而非自然人的权利声明，并且仍须通过依赖许可、SBOM、漏洞和 required checks。具体流程由 [`CONTRIBUTING.md`](../../CONTRIBUTING.md) 定义。

不得提交客户数据、真实凭据、未获再许可的代码或资产。维护者可要求补充权利来源，或在来源无法确认时拒绝合并。

## 7. 机器可验证的文件覆盖

[`license-coverage.json`](license-coverage.json) 和 [`validate-repository-license-coverage.mjs`](../../scripts/compliance/validate-repository-license-coverage.mjs) 共同定义 fail-closed 门禁：

1. 扫描 Git 已跟踪和未忽略的候选文件，并排除工作区中已删除的路径；
2. 第一方文件只有在路径与扩展名同时进入 allowlist 时才映射为 Apache-2.0；
3. 媒体只有在受治理目录中、逐文件清单存在有效许可记录时才通过；
4. `LICENSE`、锁文件与 SBOM 等特殊文件必须命中明确例外；
5. 未知扩展名、未知顶层目录、vendor 目录、符号链接或没有清单记录的媒体一律失败。

覆盖门禁只能证明“每个候选路径具有一个明确分类”，不能自动证明文件作者身份或权利链。发布负责人仍须完成来源审查、依赖许可审查和公开文本/秘密扫描。

## 8. 变更与复审触发条件

出现以下任一情况时必须重新审查本政策和相关门禁：

- 许可证、版权署名、贡献模型或项目标识政策变化；
- 新增媒体格式、vendor 目录、外部代码、字体、数据集或生成文件；
- 从源码归档扩大到 npm package、容器、可执行文件或托管服务制品；
- SBOM、依赖树、第三方许可结论或发行内容发生变化；
- 发布扫描发现无法映射的文件、权利不明材料或互相矛盾的许可声明。

门禁失败时不得以人工口头确认绕过；应补全许可记录、移除材料，或在 `license-coverage.json` 中增加带理由和证据链接的精确例外，再重新运行完整 Phase 5 验证。
