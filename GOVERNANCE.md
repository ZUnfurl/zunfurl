# 项目治理

## 治理模型

ZUnfurl 初期采用 maintainer-led 模型。当前没有技术委员会、基金会、投票成员或虚构的多人治理结构；维护者名册以 [MAINTAINERS.md](MAINTAINERS.md) 为准。

任何人都可以通过 Issue 和 Pull Request 提出事实、替代方案与实现。维护者负责整合反馈，并对以下事项作最终决定：

- 产品范围、A1/A2/B/C Profile 合约和静态优先边界；
- 公共 API、Schema、兼容、弃用、迁移和 breaking change；
- 依赖、供应链、许可、资产与公开内容风险；
- PR 合并、release candidate、tag、Release 和支持窗口；
- 安全 embargo、修复协调、advisory 与披露；
- 维护者任命、权限、回避、移除和继任。

维护者应说明重要决定的理由，并尽量在 Issue、PR、release 文档或项目日志中留下可回溯记录。Maintainer-led 不等于所有建议都会被接受，也不建立响应、路线图或发布时间 SLA。

## 决策原则

决策按以下优先级权衡：

1. 用户安全、隐私、权利链和供应链完整性；
2. 已冻结的 Profile 合约及禁用模块 fail-closed；
3. 静态优先、动态最小化与客户平台所有权；
4. 跨 A1/A2/B/C 的可验证兼容和迁移成本；
5. 维护复杂度、贡献者体验和文档清晰度。

普通实现可在 PR review 中决定。新的产品能力、Profile 边界变化、许可证/治理变化和 breaking change 应先有公开提案，列出受影响 Profile、迁移路径、测试证据和被拒替代方案。紧急安全修复可在私密 advisory 中先处理，公开记录在披露后补齐。

## Release 与兼容权限

只有列入名册并具有相应仓库权限的 release maintainer 可以批准版本、创建 tag 或发布 GitHub Release。已发布 tag 不移动、不复用。`v3` 表示产品代际，公开成熟度由 `0.x` SemVer 表示；每个 release 必须通过当期 Gate，并保持 README、Skill、Schema、manifests、CHANGELOG 和 release notes 的声明一致。

Template 上游保持公开；正式客户项目从模板创建到客户专属 GitHub Organization，并默认 Private。上游维护权限不自动授予客户资产、平台账号、DNS、生产数据或 secret 的访问权。

## Security 与利益冲突

安全报告在 [SECURITY.md](SECURITY.md) 指定的私密边界处理。维护者负责限制访问、协调修复和决定披露；不得把 embargo 中的信息移入公开 Issue。如果维护者与某项决定存在直接利益冲突，应公开说明并在有其他合格维护者时回避。

当前只有一位维护者，因此不存在独立内部 security/CoC 复核或继任冗余。不能用同一邮箱的重复列出掩盖这一限制。新增维护者后，应为敏感报告建立至少两个独立可恢复身份，并更新名册、CODEOWNERS、仓库权限和私密联系流程。

## 成为或不再担任维护者

新增维护者不是按提交数量自动获得。候选人应持续展示：

- 对 Profile、许可、安全和客户所有权边界的准确判断；
- 高质量 review、测试和迁移说明；
- 对社区行为准则和私密信息处理的可靠执行；
- 启用 MFA、保护恢复方式并接受最小权限配置。

现任维护者记录任命理由并更新 [MAINTAINERS.md](MAINTAINERS.md) 与 `.github/CODEOWNERS`。维护者可主动退出；长期无法履职、违反行为准则、滥用权限或无法保护账号时可被移除。移除或交接必须同步撤销权限、轮换受影响凭据、转交 release/security 资料，并留下不含 secret 的公开记录。

## 政策变更

本治理文件可通过普通 PR 提议修改，但必须明确动机、权力变化、过渡方案和安全影响，并由当前维护者批准。许可证、DCO inbound=outbound 或商标边界的变化还必须同步许可政策与贡献文档。
