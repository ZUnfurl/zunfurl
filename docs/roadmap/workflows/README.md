# Backup / Restore 工作流设计草案

> **Roadmap only — no export, no import, no restore.**

本目录保存未来生产备份与灾难恢复工作流的非执行设计样例。它们不在
`.github/workflows/` 中，未绑定任何 GitHub 事件，并显式使用 `on: []` 和
`if: ${{ false }}`。GitHub Actions 不会发现或执行这些文件。

## 当前真实能力

| 项目 | 当前状态 |
| --- | --- |
| Sanity 导出 | 未实现 |
| Shopify 导出 | 未实现 |
| 写入私有 R2 | 未实现 |
| 校验和、加密和保留期 | 未实现 |
| 隔离 dataset 导入 | 未实现 |
| 灾难恢复 | 未实现 |
| 覆盖生产 | 禁止 |

`scripts/backup-sanity/plan.mjs`、`scripts/backup-shopify/plan.mjs` 和
`scripts/restore-check/plan.mjs` 只根据本地示例内容生成 roadmap manifest。它们不连接
Sanity、Shopify 或 R2，不导出、导入或恢复任何远程数据。

只能通过以下显式 roadmap 命令运行这些本地计划器：

```powershell
npm.cmd run roadmap:backup:sanity:plan
npm.cmd run roadmap:backup:shopify:plan
npm.cmd run roadmap:restore:check:plan
npm.cmd run test:roadmap-recovery
```

## 未来启用条件

生产 Backup 至少需要真实导出、私有存储、SHA-256、加密、保留期、最小权限、恢复点记录和失败告警。生产 Restore 必须先恢复到隔离环境，验证 manifest、校验和、版本和数据完整性，再经过人工批准；不得提供一键覆盖生产。

在这些能力取得真实演练证据前，不得把本目录文件移回 `.github/workflows/`，也不得在默认 CI 或 deploy 中宣称已验证生产备份或恢复。
