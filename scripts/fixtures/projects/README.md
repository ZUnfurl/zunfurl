# 初始化后项目 Fixture

本目录的四份 `*.project.json` 是 Phase 3 本地验收输入，不是客户示例、生产配置或可部署凭据。它们用真实项目契约分别初始化 A1、A2、B、C 临时客户项目，以证明模板默认值没有掩盖初始化后的 profile 边界。

## 运行

```powershell
npm.cmd run test:fixtures
npm.cmd run test:fixtures -- --variant A1
npm.cmd run test:fixtures -- --variant A2
npm.cmd run test:fixtures -- --variant B
npm.cmd run test:fixtures -- --variant C
```

默认流程会为每个变体创建独立系统临时目录，并执行：

1. 通过 `git ls-files --cached --others --exclude-standard` 取得当前发布候选文件；读取当前工作树内容，因此已跟踪修改与尚未提交、但未被忽略的新候选文件都会进入副本。
2. 明确拒绝 `.git`、`node_modules`、`dist`、`.astro`、`.sanity`、`.wrangler`、cache、日志、真实 `.env*` 和 `.dev.vars*`。
3. 运行 `init:project:dry-run`，再运行初始化器文件 dry-run；两次均须保持副本字节不变，且初始化器只能声明六个允许写入的文件。
4. 使用 `--write --allow-dirty` 写入无 `.git` 的隔离副本，并再次验证实际变化没有越过六文件边界。
5. 只在临时副本的明确范围应用测试 overlay：`README.md`、`.github/`、`apps/`、`docs/legal/`、`packages/` 和生成的 `.env.example`。替换项仅为 `Example Brand`、`Example Product`、`example.com`、`exampleproject`；缺少任何预期 marker 都会 fail closed。
6. overlay 后在临时目录执行新的 `git init` 与 `git add --all`，只建立 unborn Git index；不创建 commit，不复制源 `.git`、历史或 remote。当前树扫描会把 revision 明确记为 `WORKTREE-UNBORN`，临时 index 随目录删除，绝不修改真实工作树的 index 或历史。
7. 执行 `npm ci --prefer-offline --no-audit --no-fund`、`project:scan`、`framework:audit` 和匹配 profile 的完整本地验证与构建；C 额外运行 Shopify summary 边界测试。构建后再执行 `test:phase1`、根 `typecheck`、Worker 测试与 Wrangler `deploy --dry-run`，使内容编码门禁也能检查生成页面，且 Worker dry-run 使用本次 fixture 的真实静态产物。
8. 默认删除整个临时目录；失败路径同样清理。

`GCSS_FIXTURE_NPM_CACHE` 可指定四个临时项目共享的 npm 下载缓存。只有诊断失败时才应临时设置 `GCSS_FIXTURE_KEEP_TEMP=1` 保留隔离副本；它不会改变源工作树，但使用后需由操作者删除该系统临时目录。

## 边界

- 四个 fixture 都使用 `contentSource=local`，不会读取真实 Sanity dataset、Shopify 商店或生产 secret。
- A1 不生成 Contact secret 或 `GCSS_COORDINATOR` binding，并验证 Contact API 的关闭边界；A2 只增加 Contact、Turnstile、Resend 与框架内置 Durable Object coordinator。
- B 构建 Page CMS Studio，但 `.env.example` 不得出现 Shopify 配置。
- C 构建静态商品目录、商品内容 Studio 和 Shopify 只读目录边界；测试会拒绝 Shopify Admin token 与 Checkout 配置。
- C 显式选择 `shipping-returns-policy` 只用于证明法律页按业务范围选择，不表示框架提供 Cart、Checkout、支付、订单、配送或履约。
- Fixture 域名和仓库名均为不可用于生产的测试值。该流程只证明无凭据本地初始化和构建，不替代授权 live integration、法律审查、可访问性人工验收或客户平台移交。
