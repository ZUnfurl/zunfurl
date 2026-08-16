## 变更摘要

说明问题、方案和为什么属于 ZUnfurl 当前边界。关联 Issue（如有）：

## Profile 影响

- [ ] A1 — `static-brand` / `contactForm=false`
- [ ] A2 — `static-brand` / `contactForm=true`
- [ ] B — `cms-brand`
- [ ] C — Retail Catalog & Content Foundation
- [ ] Framework-wide
- [ ] 不适用，仅文档或治理

逐项说明受影响、不受影响或不适用的原因，以及禁用模块是否仍从 UI、route、schema、env、workflow 和手册中裁剪：

## 兼容与边界

- Framework version / base commit：
- [ ] 已说明 Schema、迁移、弃用或 breaking-change 影响
- [ ] 保持静态优先、动态最小化和客户平台所有权
- [ ] 未把 C 描述为 Cart、Checkout、支付、订单、税务、配送、履约、实时价格或实时库存
- [ ] 未把 Preview、Backup 或 Restore roadmap 描述为已交付能力

## 验证证据

最小复现或中性 fixture：

脱敏配置差异（如适用，不得包含域名、平台 ID 或 secret）：

- OS：
- Node：
- npm：

列出实际运行的命令与结果；未运行或失败的门禁必须明确说明：

```powershell
npm.cmd run test:phase5
git diff --check
```

## 权利、安全与隐私

- [ ] 所有人类贡献 commit 都包含本人有效的 DCO `Signed-off-by` trailer；未使用 `Co-authored-by`，或本 PR 仅为 GitHub 精确认证的 Dependabot 自动更新
- [ ] 未提交客户数据、真实生产标识、token、secret、私钥或未脱敏日志
- [ ] 新增代码和文档可按 Apache-2.0 inbound=outbound
- [ ] 新增媒体已进入逐文件资产许可清单并有公开权利证据，或本 PR 未新增媒体
- [ ] 第三方材料已记录来源、上游许可、版本和必要 notices，或本 PR 未新增第三方材料
- [ ] 这不是应通过 `SECURITY.md` 私密报告的未披露漏洞

## 文档与发布影响

- [ ] 已同步相关 README、Skill、客户手册、迁移或 release 文档
- [ ] 已按项目规则更新必要的项目日志，或说明无需更新的原因
- [ ] Known limitations 和 Roadmap 表述与实现一致

其他审查说明：
