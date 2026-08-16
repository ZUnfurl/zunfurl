# 依赖许可证与 SBOM 复核

## 结论

首个 Preview 采用 `source-only` 分发：只发布受控的 tracked source、发布文档和
CycloneDX SBOM，不附带 `node_modules`、FFmpeg、libvips、容器镜像或未经产物级
审查的 bundle。在此前提下，当前 npm lock 图中的许可证可以由基础 SPDX
allowlist、精确 package/version 人工复核规则和两项 concluded-license override
完整处置。分发模型一旦扩大，本结论立即失效，必须重新进入 Rights / Security Gate。

本记录是工程合规判断，不是法律意见，也不把第三方包改称为项目自有代码。

## 权威文件

| 文件 | 职责 |
| --- | --- |
| `package-lock.json` | 依赖版本、路径、完整性与 declared license 的提交态来源 |
| `sbom.cdx.json` | CycloneDX 1.6 全 lock 图清单；记录 classification 和 concluded license |
| `.github/dependency-review-config.yml` | 唯一基础 SPDX allowlist，以及 GitHub Dependency Review 使用的精确 PURL 例外 |
| `docs/compliance/dependency-license-policy.json` | 人工复核依据、范围、条件、版本与复核触发器；不复制基础 allowlist |
| `THIRD_PARTY_NOTICES.md` | 面向使用者的重点许可证、归属和分发边界说明 |

本地 validator 会把 policy 中实际匹配当前 lock 的人工规则转换为 exact-version
PURL 集合，并与 GitHub config 双向比较。配置中多一个无依据 PURL或少一个已复核
PURL 都会失败，因此 CI 例外不能脱离本地政策静默扩大。

## 可重现生成

SBOM 由根 `devDependency` 中精确固定的 `@cyclonedx/cyclonedx-npm` 生成。生成器只
读取 `package-lock.json`，使用 `--package-lock-only --output-reproducible
--spec-version 1.6 --validate`，从而纳入所有平台的 optional package，而不是只记录
当前 OS 实际安装的二进制。工具本身必须先由干净 `npm ci` 按 lock 安装。

当前 npm 11 会把两项 parent-scoped exact override 的已修复解析结果报告为
`npm ls invalid`，即使 `npm ci`、实际解析版本和 `npm audit` 均一致。CycloneDX 调用
因此使用其官方 `--ignore-npm-errors` 开关继续读取 lock；这不是忽略依赖完整性的
blanket waiver。本地许可证 validator 会对 `package-lock.json` 与 SBOM 的每一个
third-party package path/version 做双向覆盖校验，任一缺项、额外项或版本差异均失败。
此外，正式 `test:supply-chain` 入口必须先运行 dependency-tree validator；SBOM 和
license 检查不能脱离该前置 Gate 单独充当发布证据。

```powershell
npm.cmd ci
npm.cmd run sbom:generate
npm.cmd run test:supply-chain
```

`sbom:check` 在 OS 临时目录连续生成两次，进行逐字节比较，再与 tracked
`sbom.cdx.json` 比较；它不依赖 Git clean 状态，不访问生产平台，也不需要运行时
secret。生成后会保留 exact-pinned CycloneDX generator metadata，但移除随 Node 安装
变化的 ambient npm version，避免 Node 22 / 24 使用不同内置 npm 版本时产生无业务
意义的字节漂移。添加 classification、distribution 和 concluded-license 后的最终 JSON
还会再次接受 CycloneDX library 的 1.6 Schema 验证。许可证 Gate 会输出已检查
component 数、四类 scope 计数和 SBOM SHA-256。

## Security-scoped exact overrides

这两项 override 用于把 Sanity 工具链的已知脆弱传递依赖收敛到已审查版本，均不是
许可证例外，也不是允许任意 `npm ls` 错误：

| parent | 上游当前声明 | exact override | 安全解析结果 |
| --- | --- | --- | --- |
| `@module-federation/dts-plugin@2.8.1` | `undici@7.28.0` | `undici@7.29.0` | parent 解析到已审查修复版 |
| `@vercel/frameworks@3.29.0` | `js-yaml@3.13.1` | `js-yaml@3.15.1` | parent subtree 固定到已审查 backport |

当前 parent package metadata 仍精确声明旧子版本，因此 npm 11 会把 override 后的子版本
写成 `invalid`；专门 validator 只接受上述 parent、child、resolved version 和问题形态。
任何第三条 problem、missing/extraneous package、路径或版本差异均失败。`npm ci`、完整
与 production `npm audit`、dependency-tree、SBOM 双向覆盖和许可证检查必须共同通过，
不能用 `--force`、全局 ignore 或宽泛 override 代替。

退出或重新复核触发器：parent 发布已安全声明后删除对应 override；任一 parent/child
版本或依赖范围变化；安全目标版本、完整性或上游 advisory 变化；npm 不再产生该
expected-invalid；或分发模型扩大。触发后先重建 lock、执行干净 `npm ci` 与完整 Gate，
不得沿用旧例外。

## Scope 与分发分类

每个 SBOM component 都带 `zunfurl:dependency:classification`：

| 值 | 判定 |
| --- | --- |
| `production` | lock 中不是 dev/optional 的依赖 |
| `development` | lock 中为 dev 的依赖 |
| `optional-production` | production 图中的平台或能力可选依赖 |
| `optional-development` | development 图中的平台或能力可选依赖 |
| `workspace` | 本仓 `apps/*` 或 `packages/*` workspace，不作为第三方依赖审查 |

SBOM metadata 另行固定 `source-only`、`bundled-third-party-dependencies=false` 和
`tracked-source-with-sbom`。Scope 表示安装图位置，不表示某个依赖已被打包进 Release；
实际分发边界以 metadata、Release policy 和本记录共同判定。

## 人工复核结果

### `ffmpeg-static` / GPL

- 位置：`apps/storefront` 的 development dependency，仅供本地视频优化脚本使用。
- 上游事实：npm 包与官方仓库声明 GPL-3.0-or-later，并在安装时取得平台 FFmpeg
  二进制。
- 决策：仅在 source-only 且 Release 排除二进制与 `node_modules` 时接受。
- 复核触发：版本、scope 或分发模型变化；尤其是二进制、容器、桌面包或服务镜像。
- 一手依据：[ffmpeg-static 官方仓库](https://github.com/eugeneware/ffmpeg-static)。

这不是把 FFmpeg 认定为“无关”。开发者执行 `npm ci` 后会在本地取得相关产物，
其使用和再分发仍受上游许可证约束。

### Sharp / libvips / LGPL

- `sharp` 自身声明 Apache-2.0。
- optional `@img/sharp-*` / `@img/sharp-libvips-*` 平台包的 npm metadata 包含
  LGPL-3.0-or-later 或与 Apache/MIT 的组合表达式。
- 决策：只接受 policy 中精确版本的 optional package；Release 不包含预编译包或
  libvips 二进制。
- 复核触发：版本、declared license、vendoring 或分发模型变化；Lambda layer、
  executable、container 等均须产物级重审。
- 一手依据：[Sharp](https://github.com/lovell/sharp)、
  [sharp-libvips](https://github.com/lovell/sharp-libvips)。

### MPL-2.0

- `lightningcss` 及其平台包、`@vercel/stega` 被作为未修改的 npm 依赖安装。
- 决策：不 vendor、不修改其 MPL covered files；source-only 项目只提交依赖声明与
  lock。精确 package/version 仍须走人工规则，不能把 MPL 全局加入基础 allowlist。
- 复核触发：版本、vendoring、covered-file 修改或分发模型变化。
- 一手依据：[Lightning CSS](https://github.com/parcel-bundler/lightningcss)、
  [Vercel Stega](https://github.com/vercel/stega)。

### CC-BY 数据

- `caniuse-lite`：上游 Caniuse 明确其数据为 CC-BY-4.0；归属保留在
  `THIRD_PARTY_NOTICES.md`。
- `spdx-exceptions`：package metadata 为 CC-BY-3.0，README 归属 The Linux
  Foundation 与 SPDX contributors；归属同样进入 notices。
- 决策：只接受 policy 中精确版本，不把数据纳入项目 Apache-2.0；复制或再分发数据
  时必须带相应归属。
- 一手依据：[Caniuse](https://github.com/Fyrd/caniuse)、
  [spdx-exceptions](https://github.com/kemitchell/spdx-exceptions.json)。

### 缺失 metadata 与非 SPDX 声明

当前外部依赖中，两项 lock metadata 缺少 `license`：

| package | concluded license | 证据与限制 |
| --- | --- | --- |
| `md5-o-matic@0.1.1` | MIT | 精确 tarball 含 MIT 文本；[上游 LICENSE](https://github.com/trentmillar/md5-o-matic/blob/master/LICENSE) |
| `parse-cache-control@1.0.1` | BSD-3-Clause | 精确 tarball 含三条款 BSD 文本；[上游 LICENSE](https://github.com/roryf/parse-cache-control/blob/master/LICENSE) |

Override 同时锁定 package、path、version、当前 lock 的 exact SHA-512 integrity 和
evidence。生成器只在所有字段精确相符且 SBOM component 缺少 declared license 时写入
`acknowledgement=concluded`，并把 evidence integrity 写入自定义 property；validator
还会核对 CycloneDX distribution hash。即使 package/version 相同，tarball integrity
漂移也会失败，不会对同名未来版本或重打包产物自动继承。

`jsonify@0.0.1` 使用旧式 `Public Domain` 非 SPDX metadata，因此采用独立 exact-version
人工规则，而不是把该字符串放入全局 SPDX allowlist。

本仓 workspace 当前也可能尚未拥有 package-level `license` metadata；它们属于项目
自身文件和 Phase 5 根许可证映射范围，不得与外部 missing-license override 混为一谈。

## Gate 失败条件

以下任一情况必须阻止候选发布：

- lock 中出现基础 allowlist 不能满足、且无 exact-version 人工规则的许可证；
- 新增 missing license metadata，或 concluded-license 的 package/path/version/integrity/evidence 漂移；
- policy 规则没有匹配当前 lock，说明规则陈旧或依赖未完成复核；
- GitHub config 的 PURL 例外与 policy/lock 推导结果不完全相同；
- SBOM 两次生成不同、与 tracked 副本不同、缺 component license 或分类错误；
- `ffmpeg-static` 不再是 development dependency；
- Release 开始附带任何此前排除的 dependency/binary/artifact。

发生失败时先复核事实和产物边界，再以精确规则处理；不得使用 blanket approve、
`license-check: false`、宽泛 package pattern 或不带复核触发器的永久例外。
