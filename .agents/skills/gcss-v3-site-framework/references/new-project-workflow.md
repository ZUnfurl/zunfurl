# 统一新项目工作流

本流程适用于 A1、A2、B、C。任何 profile 指南都只能补充方案差异，不能替代或修改本流程。

完整中文政策见仓库根目录 `docs/project-startup-and-handoff.md`；平台角色、Secret 和移交细节见 `platform-ownership-and-handoff.md`。

## 启动门槛

开始初始化前必须同时满足：

- 客户专属 GitHub Organization 已确定。
- 客户 Private repository 已通过公开框架 Template repository 的 `Use this template` 从默认分支创建。
- 当前 Codex 本地项目根目录就是 clone 后的客户仓库。
- `git remote -v` 指向客户 Organization，不指向框架仓库、维护方个人 namespace 或其他客户。
- 已选择 A1、A2、B、C 中唯一一种方案。
- 尚未执行写入、远程资源创建、commit、push 或部署。

公开上游不会向客户仓库复制 secrets、environments、Actions 历史、rulesets 或外部平台连接。发现使用 Fork、ZIP、复制工作目录、错误 remote 或框架 checkout 时停止初始化并报告，不要自动修正远程历史。

## 统一执行顺序

1. 读取 `AGENTS.md`、`README.md`、`gcss.project.json`、`package.json`、`.env.example`、工作流和 Git 状态。
2. 核对客户专属 GitHub Organization、仓库机器名、品牌、域名、语言、方案、内容来源和 Contact 决策。
3. 读取 `profiles.md` 和匹配的 profile 指南。
4. 建立平台资产清单，只规划当前 profile 需要的客户专属平台。
5. 生成客户临时项目清单，运行 `npm.cmd run init:project:dry-run -- --config <config-path>`。
6. 审阅计划后才运行 `npm.cmd run init:project -- --config <config-path> --write`。
7. 运行 `npm.cmd run project:scan`，人工替换品牌内容、法律事实和视觉资产。
8. 配置当前 profile 的服务和 secret；禁用模块不得配置占位生产凭据。
9. 运行 `validation.md` 和 `acceptance.md` 中适用的本地、集成和浏览器验收。
10. 获得相应授权后再 commit、push、创建远程资源或部署。
11. 按 `platform-ownership-and-handoff.md` 完成客户 Owner、账号恢复、MFA、账单、部署和凭据轮换验收；账号恢复不代表框架提供生产备份或灾难恢复。
12. 交付匹配方案的日常操作手册，并向授权管理员单独交付平台资产登记表。

## 统一首次提示

```text
使用 $gcss-v3-site-framework 初始化当前客户项目。
方案：<A1 | A2 | B | C> <profile>
项目名：<project-name>
品牌名：<brand-name>
正式域名：<domain>
默认语言：<default-locale>
启用语言：<locales>

先读取 AGENTS.md、README.md、gcss.project.json 和 Git 状态，
确认当前目录是通过公开框架 Template repository 创建并 clone 的客户私有仓库，
确认 origin 指向客户专属 GitHub Organization。
先完成审计并生成 dry-run 初始化计划；
暂不写文件、不 commit、不 push、不部署、不创建远程资源。
```

不要在首次提示里一次性授权写入和生产部署。审计、初始化、内容实施、平台接入、部署和完全交付应保留清晰的验收节点。
