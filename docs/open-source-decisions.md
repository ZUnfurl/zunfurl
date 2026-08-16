# Phase 0 开源决策记录

> 状态：Phase 0 决策门已完成；D-02 已于 2026-08-16 经用户明确修订；本文同时保留当时的基线事实
>
> 基线日期：2026-08-15
>
> 适用发布：首个 `0.x preview`

本文记录首次开源前会影响全仓实现、授权和公共身份的决策。第 2 节是 Phase 0 当时的只读快照，不作为当前实现状态；当前状态以 [Release Status](release-status.md) 为准。除用户明确授权公开的 Security 联系邮箱外，本文不保存 secret、合同原文、真实身份映射、授权书或未脱敏扫描结果。

决策状态：

- `Confirmed`：用户已明确选择，可进入后续实施。
- `Revised`：用户在后续阶段明确替换了原决策；以修订后的执行边界为准，同时保留变更记录。
- `Verified baseline`：本轮从当前仓库或公开来源核验的事实，不等于法律结论。

## 1. 已确认决策

| 编号 | 状态 | 决策 | 执行影响 |
| --- | --- | --- | --- |
| D-00 | Confirmed | 采用 `0.x preview` 快速开源路线 | 收窄声明，不降低权利、安全和可复现性门槛 |
| D-01 | Confirmed | 目标公共 GitHub Organization/owner 为 `ZUnfurl`；目标仓库映射为 `ZUnfurl/zunfurl` | 仅确认目标身份；不得据此自动创建 Organization、仓库或修改远程 |
| D-02 | Revised 2026-08-16 | 复用当前 Private Template repository identity；从批准快照建立单一净化根历史并完全替换远程旧历史 | 旧历史先保存为私有离线归档；不直接转 Public、不合并旧提交；旧 Actions runs 和仓库侧残留必须清场。commit、force-push、转移、改名和远程设置仍需分别明确授权 |
| D-03 | Confirmed | 代码使用 Apache-2.0 | Phase 5 加入原版 `LICENSE` 和准确版权声明 |
| D-04 | Confirmed | 首个 Preview 的项目文档和 Skill 与代码同为 Apache-2.0 | 独立出版物的 CC BY 许可延后评估 |
| D-05 | Confirmed | 演示素材只使用项目自有或 CC0 素材，并逐项登记 manifest | 根许可证不自动覆盖第三方资产 |
| D-06 | Confirmed | 公开版权署名为 `Noodle Freeman`，起始年份为 `2026`；不另设 governing-law 条款 | 法律权利主体是使用该笔名的自然人；真实身份映射和权利证据保存在私有证据包 |
| D-07 | Confirmed | 公共品牌/项目名为 `ZUnfurl`，首个 Preview 不发布独立 Logo | 内部 `gcss-*` package、profile key 和迁移协议暂不机械改名 |
| D-08 | Confirmed | DCO 1.1 + inbound=outbound，首个 Preview 不采用 CLA | `CONTRIBUTING.md` 必须披露 sign-off 姓名和邮箱会进入公开 Git 历史 |
| D-09 | Confirmed | 采用 Maintainer-led 治理 | Phase 5 建立治理文件；本轮不虚构委员会或额外维护者 |
| D-10 | Confirmed | Security/CoC 联系邮箱为 `mp4102@gmail.com`；用户提供的替代联系人也是同一邮箱 | 当前只有一个实际联系渠道；独立替代联系人记为暂无 |
| D-11 | Confirmed | 社区支持为 Best effort，不提供免费 SLA | 不将客户商业支持义务扩展到公共仓库 |
| D-12 | Confirmed | GitHub Discussions 仅在维护能力具备后启用 | 属 Phase 8 决策，不在本轮自动启用 |
| D-13 | Confirmed | 首个公共候选版本为 `v0.3.0-preview.1` | 不等于已授权创建 tag 或 GitHub Release |
| D-14 | Confirmed | 先支持完整 SemVer prerelease，再统一根项目、契约、workspace 和 lockfile 版本 | `v3` 只保留为产品代际，不作为 SemVer major |
| D-15 | Confirmed | 保留机器 profile `retail` | 不进行配置、Schema、环境变量和迁移协议改名 |
| D-16 | Confirmed | C 对外称为 `C 零售目录与内容运营基础框架` / `C Retail Catalog & Content Foundation` | README、Skill、文档和测试必须同步 |
| D-17 | Confirmed | C 不提供 Cart、Checkout、支付、订单、税务、配送、履约和实时库存同步 | 这些能力必须标为 `Not provided`，不得出现在首个 Preview 的 `Supported` 列表 |
| D-18 | Confirmed | Authenticated Editorial/Draft Preview、Production Backup、Disaster Recovery Restore 属于 Roadmap | CI 构建验证、Astro 本地 preview、商品 archive/unarchive 不与其混称 |
| D-19 | Confirmed | GitHub Release 只发布源码；`ffmpeg-static` 仅作为不随 Release 分发的 dev 工具并披露 | 不附 bundle、容器或未经产物级审计的第三方二进制 |
| D-20 | Confirmed | Schema `$id` 改用稳定 URN，不声称控制 `gcss.dev` | 快速路线保留协议身份 `urn:gcss-v3-site-framework:schema:project:v1` |
| D-21 | Confirmed | 权利主体确认现有代码、Skill、文档和法律示例全部拥有或已获再许可，且无例外 | 属权利主体声明，不替代第三方依赖、素材 provenance 或外部法律审计 |

D-02 原决策是“旧仓库保持 Private，另建净化仓库”。2026-08-16 用户改选复用当前仓库容器。修订只复用 GitHub repository identity 和可重新配置的仓库属性，不授权保留 6 个旧提交，也不授权任何远程写入；历史替换前后必须保持 Private，并以私有离线归档保存原始证据。

## 2. 已核验基线

| 项目 | 结果 | 影响 |
| --- | --- | --- |
| 当前远程 | 个人 namespace 下的 Private Template repository，默认分支 `main` | 若采用专用 Organization，需要新建或迁入组织边界 |
| 当前组织 | 当前登录账号没有可见 GitHub Organization | D-01 不能假设已有组织 |
| GitHub 同名仓库 | 精确名称搜索只发现当前私有仓库 | 没有发现另一个精确同名 GitHub 仓库，但不是名称权利结论 |
| npm 同名 package | registry 未找到 `gcss-v3-site-framework` | 本轮不发布 npm package，名称可用性只作参考 |
| Phase 0 版本快照 | 根版本和 `frameworkVersion` 为 `0.2.0`；私有 workspace 为 `3.0.0` | 首个公共 tag 前必须执行 D-14；Phase 5 已完成 |
| Phase 0 Prerelease 校验 | 项目 Schema 和运行时校验当时只接受 `x.y.z` | 写入 `0.3.0-preview.1` 前必须扩展完整 SemVer prerelease 支持并同步 fixtures/lockfile；Phase 5 已完成 |
| Phase 0 Schema namespace | `$id` 当时引用 `https://gcss.dev/schemas/project-v1.json`，但没有发现项目控制该域名的证据，Registry RDAP 当时返回未注册 | 不得把未控制域名当作公共权威；D-20 已完成 |
| Git 身份 | 当前 6 个提交使用真实、非 noreply author 身份 | 新公共历史使用批准的组织或 noreply 身份 |
| 项目 Logo | 当前视觉资产不能作为公共项目 Logo 的权利依据 | 首个 Preview 默认使用纯文字身份，不发布独立 Logo |

Schema 域名状态参考：[Google Registry RDAP 对 `gcss.dev` 的当前响应](https://pubapi.registry.google/rdap/domain/gcss.dev)。域名状态会变化；公开版本应以项目能够证明控制的 namespace 为准。

## 3. 公共名称与技术身份

公共品牌和仓库目标已确定为 `ZUnfurl` 与 `ZUnfurl/zunfurl`。截至基线日期：

- 快速技术初筛没有发现精确 `ZUnfurl` GitHub handle 或 npm package；这不是保留、商标注册或法律可用结论。
- `GCSS` 缩写在其他领域被长期使用，包括美国陆军的 Global Combat Support System，存在搜索、识别和潜在品牌混淆。
- 初筛不能替代对目标法域、商品/服务类别、近似拼写、Logo 和域名的专业商标检索。

Phase 0 已确认：

1. 公共品牌使用 `ZUnfurl`，目标仓库 slug 使用 `zunfurl`。
2. 现有内部 `gcss-*` package、profile key、配置字段和迁移协议为兼容性暂不机械改名。
3. README 明确项目是独立社区项目，不暗示 OpenAI、Astro、Sanity、Shopify、Cloudflare、美国政府或其他第三方认可。
4. 首个 Preview 只使用文字项目名，不发布独立 Logo。
5. 正式商业化、注册域名或申请商标前，按实际目标市场完成商标 clearance search。

参考：[GCSS-Army 官方网站](https://www.gcss.army.mil/)、[USPTO 商标检索说明](https://www.uspto.gov/trademarks/search)、[WIPO 名称可用性说明](https://www.wipo.int/en/web/madrid-system/check-availability)。

## 4. 法域、笔名与联系人边界

- 许可证适用法：不另行指定；Apache-2.0 保持原文，不增加 choice-of-law 或法院条款。不能把它表述成“没有法律适用”或“免受任何法域约束”。
- Apache-2.0 的授权范围是 worldwide，但版权保护、权属和救济仍由有管辖权的法律按具体事实确定。
- 公开版权声明使用 `Copyright 2026 Noodle Freeman`。`Noodle Freeman` 是自然人的公开笔名，不是独立法人；需要登记、签约、转让或维权时，可能必须证明其与真实自然人的关系。
- 私有证据包应保存带日期的真实身份与笔名映射、作品/提交清单和权利链声明。该映射不得进入公共仓库。
- `ZUnfurl` GitHub Organization 是项目 namespace，不当然成为版权主体；只有未来成立实体并完成书面转让后才能改变版权归属。
- Contact、Analytics 或 Hosted Service 的合规法域不能靠本决策排除。模板必须要求部署者按经营者所在地、处理地点和目标市场填写真实法律身份及隐私信息。
- `mp4102@gmail.com` 同时被指定为主联系人和替代联系人，因此只有一个实际邮箱渠道；首个 Preview 接受这一限制，但不得宣传为冗余联系人。

参考：[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)、[WIPO《伯尔尼公约》](https://www.wipo.int/wipolex/en/text/283698)、[U.S. Copyright Office 笔名说明](https://www.copyright.gov/circs/circ32.pdf)、[欧盟委员会 GDPR 适用范围说明](https://commission.europa.eu/law/law-topic/data-protection/reform/rules-business-and-organisations/application-regulation/who-does-data-protection-law-apply_en)。

## 5. 已确认许可组合

已确认组合：

- 代码、配置、脚本、测试、Schema、项目 Skill、示例内容和一般技术/运营文档：Apache-2.0；既有法律示例只有在 D-21 权利链确认后才纳入。
- 中性演示资产：逐项登记；只采用项目自有或 CC0。第三方资产即使允许使用，也不默认被根许可证覆盖。
- 项目名称与未来 Logo：在 `TRADEMARKS.md` 中明确不由代码许可证授予商标权。
- 外部贡献：Apache-2.0 的 inbound=outbound，加 DCO 1.1 sign-off；初期不引入 CLA。
- 第三方依赖：由 `THIRD_PARTY_NOTICES.md`、SBOM 和依赖许可证报告管理，不把第三方包改称项目自有代码。
- Release：只发布源码快照，不附 `node_modules`、`dist`、Studio/Worker bundle、容器或未经产物级审计的第三方二进制。

选择 Apache-2.0 的主要原因是它属于宽松开源许可证，并明确包含版权、专利和商标边界；相较 MIT，文本更长、NOTICE 和变更声明管理要求也更高。本记录不是法律意见。

DCO sign-off 会把贡献者用于签署的姓名和邮箱保留在公开 Git 历史中；采用 DCO 前必须接受这一长期公开结果。DCO 证明提交者声明有权贡献，但不替代客户合同、素材 provenance、人物/物业许可或第三方代码审查。

参考：[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)、[MIT License](https://opensource.org/license/mit)、[DCO 1.1](https://developercertificate.org/)。

## 6. 已确认版本规则

- `v3`：项目产品代际，不作为 SemVer major。
- `0.x`：公共 API、目录和 Profile 契约仍可能发生 breaking change。
- `-preview.N`：首个公共稳定性通道；GitHub Release 必须标记 Pre-release。
- 首个候选：`v0.3.0-preview.1`。
- 所有 package 继续 `private: true`；本轮没有 npm publish。
- 根 `package.json.version`、`gcss.project.json.frameworkVersion`、私有 workspace 版本、CHANGELOG、tag 和 Release title 在首个 tag 前按批准策略同步。
- `schemaVersion: 1` 保持独立；它只在项目契约 Schema 发生不兼容变化时调整。
- Phase 0 发现的 prerelease 校验阻断已在 Phase 5 修复，并由版本一致性门禁持续防止回归。

## 7. 实施与授权边界

本轮确认决策并同步本地 Phase 0 文档，不自动授权以下外部或发布动作：

- 创建 GitHub Organization、转移或改名当前仓库、域名、商标或社交账号；
- 修改当前仓库名称、remote、Template/Public 可见性或 GitHub 设置；
- push 净化历史，启用 GitHub Discussions，修改 DNS 或执行 Cloudflare 部署；
- 写入生产 secret，创建 PR、tag、GitHub Release 或正式发布；
- commit 或 push 本轮本地文档变更。

## 8. Phase 0 退出条件

- [x] D-01 至 D-21 的 Phase 0 决策已取得明确事实、选择或批准的默认值。
- [x] `release-status.md`、`roadmap.md`、`release-policy.md` 使用同一能力和版本术语。
- [x] 未创建远程仓库、未改可见性、未创建 tag 或 Release。

Phase 0 决策门通过。Phase 1 可以开始净化素材、文本和候选发布树；这不表示 Rights、Security、Engineering 或 Public Release Gate 已通过。
