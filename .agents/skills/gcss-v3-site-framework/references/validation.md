# Validation

Run checks from the repository root. Disabled modules must be absent from customer UI, routes, schema creation, env requirements, workflows, and manuals.

## Common

在任何自动测试前，人工确认当前目录是通过公开框架 Template repository 创建并 clone 的客户独立 Private repository，`origin` 指向客户 GitHub Organization。模板框架自身执行审计时除外。

```powershell
npm.cmd run test:skill
npm.cmd run test:project-config
npm.cmd run test:init
npm.cmd run test:profiles
npm.cmd run test:template
npm.cmd run test:workflows
npm.cmd run typecheck
git diff --check
```

`test:project-config` must exercise both the JS validator and `gcss.project.schema.json`, including unknown properties and invalid cross-field combinations. Never use production environment overrides to simulate another profile; use the isolated A1/A2/B/C fixtures.

## A1/A2

```powershell
npm.cmd run test:profile:static-brand
npm.cmd run test:worker
npm.cmd run build
```

## B

```powershell
npm.cmd run test:profile:cms-brand
npm.cmd run studio:build
npm.cmd run build
```

## C

```powershell
npm.cmd run test:profile:retail
npm.cmd run test:commerce
npm.cmd run test:sanity
npm.cmd run test:worker
npm.cmd run studio:build
npm.cmd run build
```

Use separate committed fixture contracts with `contentSource=local` for credential-free matrix checks. Run Sanity and Shopify live reads only as separate authorized integration tests. For A/B artifacts, also assert that `shipping-returns-policy` is absent; for B Studio, assert that Products page kind, product nested fields, product documents, and product tools are absent.
