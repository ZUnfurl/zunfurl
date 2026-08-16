# 原始私有历史安全扫描摘要

本摘要记录 Phase 6 对原始私有 Git 历史和旧 GitHub Actions 日志的只读检查。它不包含远程 URL、Actions run ID、命中值、内部证据路径或可还原 secret 的内容。规范化数据见 `original-private-history-security-scan.json`。

## 结论

原始历史和旧 Actions 日志均为 **blocked**，不得直接进入 Public。当前 GitHub repository identity 仍可复用，但公开前必须用批准的单一净化根历史替换全部公共可达 refs，并清除旧 Actions runs 及其可下载日志。

两个独立专用 secret scanner 均未报告命中：

- Gitleaks `8.30.1`：对本地历史、origin mirror、本地额外 ref 快照和 3 份旧日志归档均为 0。
- TruffleHog `3.97.0`：相同范围均为 0；为避免把疑似 credential 发送给第三方验证端点，本次使用 `no-verification`，任何 unverified 命中也会阻断。

两种二进制均来自官方 GitHub Release archive，下载后先按官方 checksum 验证，再固定二进制 SHA-256；二进制和下载包均未进入仓库。

这不等于原始历史可公开。脱敏 PII/IP 规则仍在本地与 origin 历史各发现 39 项，分类为邮箱、真实域名、Shopify/store 标识和订单形数据。3 份旧 Actions 日志归档共扫描 9 个文件，发现 70 项内部绝对路径、电话号码候选和真实域名。摘要只保留分类计数，未保留命中值。

人工与规则分类复核还确认：客户名称候选、电话号码候选和内部绝对路径在原始 Git 历史中均为 0；真实域名/生产 URL 候选为 33，订单形数据为 2，store 标识为 3。大对象已按对象大小和路径在私有证据包中逐项复核，公开摘要只保留数量和最大尺寸。

## 覆盖范围

- 本地 4 个 refs，包括 1 个非 commit ref；额外 ref 已导出到仓库外临时快照并由两种 scanner 复查。
- origin 广告出的 1 个 ref，临时 mirror 覆盖完整；mirror 已在扫描结束后删除。
- 原始历史共 6 个 commits；本地可达 569 个 blobs，origin 可达 359 个 blobs。
- 本地历史存在 2 个至少 1 MiB 的对象，最大 2,413,237 bytes；origin 存在 1 个，最大 2,352,509 bytes。公开摘要不列对象路径。
- 旧 Actions 日志通过只读 API 下载到仓库外私有证据包；没有修改、删除或重新运行远程 workflow。

## 安全边界

- Gitleaks 使用 100% redaction；落盘前再次删除 `Secret`、`Match`、作者和邮箱字段。
- TruffleHog 原始 JSON 只在进程内存中解析；落盘前删除 `Raw`、`RawV2`、远程 URL 和邮箱字段。
- 原始 scanner report、日志归档和逐项命中路径只保留在仓库外私有证据包。
- 本次没有 fetch、commit、push、force-push、删除 Actions run 或修改远程设置。

## Phase 6 后续条件

1. 冻结批准的当前 source tree，并建立单一净化根历史。
2. 在仍为 Private 的当前仓库中替换所有计划公开的 refs；不得合并回旧历史。
3. 获得单独远程授权后删除旧 Actions runs/logs，并复核 GitHub 侧残留对象。
4. 对精确净化历史、远程 refs 和新 Actions 证据再次运行相同 scanner。
5. 只有净化历史与托管仓库均通过，才可进入 Public 授权判断。
