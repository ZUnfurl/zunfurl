# 公开媒体来源、授权与处置记录

> 状态日期：2026-08-15
>
> 清单权威：[ASSET_LICENSES.yml](./ASSET_LICENSES.yml)
>
> 自动门禁：[validate-public-assets.mjs](../../scripts/tests/validate-public-assets.mjs)

## 1. 审计结论

- Git `HEAD` 中原有 29 项媒体缺少可核验的作者、来源和授权证据，全部按 `unknown-not-published` 处置；其中 25 项在原路径替换，3 项旧 logo SVG 和 `favicon.ico` 删除。
- 当前 `apps/storefront/public` 有 26 项受管媒体：23 个 WebP、1 个 MP4、1 个布局 mask SVG 和 1 个 favicon SVG。另有 `robots.txt`，它是运行配置文本，不属于本媒体清单。
- 三张视觉主源由 Noodle Freeman 使用 OpenAI ImageGen 生成；主源本体不随仓库发布，只保留 exact prompt、生成日期和 SHA-256 作为来源证据。
- 22 个 WebP 使用 Sharp 0.34.5 从对应主源裁切、缩放并以 quality 84 编码；6 秒首页视频使用 FFmpeg 8.1.2 从 brand 主源生成 H.264 MP4，且不含音轨。
- mask 与 favicon 是项目自行编写的纯路径 SVG，不含文字、字体、脚本或外部资源。
- README 截图来自本地构建的 `0.3.0-preview.1` 中性 `/en/` 页面，在内容和 hero 动画稳定后以浏览器 viewport 捕获，并由 Sharp 0.35.3 编码为 WebP quality 86；底层页面代码为本项目第一方代码，画面媒体均来自本清单已批准的 CC0 资产。
- 当前 26 项媒体由 Noodle Freeman 以 [`CC0-1.0`](https://creativecommons.org/publicdomain/zero/1.0/legalcode) 提供；清单固定这一官方 legal code URL，避免只保留无法追溯的 SPDX 短标识。AI 主源为合成内容，不含真人、可识别财产、第三方商标或既有作品，因此 model/property release 记为 `not-required-synthetic`，商标审查记为 `reviewed-no-marks`。
- 仓库代码许可证不会自动替代逐项媒体声明；媒体分发状态以清单中的 `rights.license` 与 `review.status` 为准。

## 2. 当前来源链

| 来源记录 | 类型 | 上游或工具 | 覆盖范围 |
|---|---|---|---|
| `openai-imagegen-brand-2026-08-15` | AI 主源 | OpenAI ImageGen；SHA-256 `e91a631824c8a20eafba090e6cedd548ebeb60e2e8445f90c1b4a00b7afab07b` | brand、about、contact 与首页视频 |
| `openai-imagegen-product-2026-08-15` | AI 主源 | OpenAI ImageGen；SHA-256 `1912ce51cab392dc1ffc0016df9493be9c3f7e43136849bbb8a731a54f3ed0be` | products hero 与 example-product gallery |
| `openai-imagegen-story-2026-08-15` | AI 主源 | OpenAI ImageGen；SHA-256 `c7f604dd13c30439b53f6507004f751a25dac60a8fca52c02c58024a66863123` | example-product transparency story |
| `sharp-brand-webp-2026-08-15` | 派生 | Sharp 0.34.5；brand 主源；WebP quality 84 | 8 个 brand/about/contact WebP |
| `sharp-product-webp-2026-08-15` | 派生 | Sharp 0.34.5；product 主源；WebP quality 84 | 3 个 products hero 与 5 个 SKU WebP |
| `sharp-story-webp-2026-08-15` | 派生 | Sharp 0.34.5；story 主源；WebP quality 84 | 6 个 transparency WebP |
| `ffmpeg-brand-video-2026-08-15` | 派生 | FFmpeg 8.1.2；brand 主源 | 6 秒 H.264 MP4，无音频 |
| `project-authored-svg-2026-08-15` | 原创 | 手写 SVG path | mask 与 favicon |
| `browser-readme-screenshot-2026-08-15` | 原创捕获 | Codex in-app browser；Sharp 0.35.3 | README 中性示例首页截图 |

最终文件路径、逐项 SHA-256、用途、源码引用、来源记录和复核状态均保存在权威清单中，不在本文重复维护第二份易漂移数据。

## 3. Exact prompts

### prompt-zunfurl-brand-foundation-v1

```text
Use case: stylized-concept
Asset type: wide landing-page brand and hero master image for an open-source framework demo
Primary request: an elegant abstract composition suggesting a folded ribbon unfurling into an architectural landscape, expressing visibility, confidence, and invitation without forming a logo
Scene/backdrop: warm off-white studio environment with sculptural paper planes and translucent fabric-like surfaces
Style/medium: premium editorial 3D still life, realistic materials, restrained and timeless
Composition/framing: very wide 2:1 landscape, strong depth, generous negative space, no border
Lighting/mood: soft directional daylight, calm, polished, optimistic
Color palette: warm ivory, muted terracotta, charcoal, subtle sage accents
Materials/textures: matte paper, frosted glass, fine woven textile
Constraints: no people, no products, no packaging, no text, no letters, no logos, no trademarks, no watermark, no signature, no recognizable property or artwork
Avoid: gradients containing banding, illegible pseudo-text, commercial brand styling
```

### prompt-zunfurl-example-product-v1

```text
Use case: product-mockup
Asset type: portrait product gallery master for a neutral open-source retail catalog demo
Primary request: a fictional unbranded modular ceramic desk vessel with a simple cylindrical body and removable shallow tray, photographed as a refined but generic design object
Scene/backdrop: seamless warm ivory studio sweep with a low stone plinth and one folded sheet of neutral paper
Subject: exactly one fictional ceramic vessel, no packaging
Style/medium: high-end editorial product photography, physically plausible, clean catalog quality
Composition/framing: vertical 3:4 portrait, full object visible, centered with generous margin; suitable for alternate crops
Lighting/mood: soft side light, subtle shadow, calm and tactile
Color palette: warm chalk white ceramic, muted terracotta accent, charcoal detail
Materials/textures: matte ceramic, natural stone, heavy paper
Constraints: no people, no hands, no text, no letters, no logo, no trademark, no label, no barcode, no watermark, no signature, no resemblance to a famous commercial product
Avoid: cosmetics, food, medicine, electronics, recognizable packaging, pseudo-text
```

### prompt-zunfurl-product-story-v1

```text
Use case: product-mockup
Asset type: wide editorial story master image for a fictional retail demo product
Primary request: an abstract exploded still life showing generic matte ceramic rings, a shallow tray, folded paper, and small clay color swatches arranged as a modular design study; no complete branded product and no packaging
Scene/backdrop: clean warm ivory studio surface
Style/medium: premium editorial product photography with subtle sculptural composition
Composition/framing: wide 2:1 landscape, objects distributed across the frame with generous negative space; suitable for three alternate crops
Lighting/mood: soft raking daylight with delicate shadows, calm and tactile
Color palette: ivory, muted terracotta, charcoal, pale sage
Materials/textures: matte ceramic, uncoated paper, natural stone
Constraints: no people, no hands, no food, no cosmetics, no medicine, no text, no letters, no logo, no trademark, no label, no barcode, no watermark, no signature
Avoid: recognizable commercial designs, pseudo-text, product claims, transparent glass with reflections that resemble lettering
```

## 4. 当前引用审计

| 媒体组 | 数量 | 主要引用位置 |
|---|---:|---|
| brand | 3 | 三种语言的 `about.json`、`home.json` |
| about hero | 3 | 三种语言的 `about.json`；01 还用于 Sanity 图片 fallback 测试 |
| contact hero | 2 | 三种语言的 `contact.json`、首页 CTA；01 还用于 Sanity 图片 fallback 测试 |
| products hero | 3 | 三种语言的 `products.json` |
| example product gallery | 5 | 三种语言的 `product-locale-pages/*/example-product.json` |
| transparency story | 6 | 01–03 被三种语言商品页引用；04–06 是明确登记的 bundled-unused 示例候选 |
| home video | 1 | 三种语言的 `home.json` |
| mask | 1 | `HomeContactCtaSection.astro` |
| favicon | 1 | `SiteDocument.astro` |
| README screenshot | 1 | 根 `README.md` |

header/footer 已改用普通文本品牌名，不再引用或分发旧 logo SVG；`SiteDocument.astro` 也已移除 `favicon.ico` 引用。

## 5. Git HEAD 遗留媒体处置表

下表固定记录替换前 `HEAD` 的 Git blob ID 与 blob 内容 SHA-256。所有条目的权利状态均未知，且这些旧二进制不作为开源发布物重新复制、改名或另行分发。

| 旧路径 | Git blob | SHA-256 | 处置 | 权利/发布状态 |
|---|---|---|---|---|
| `apps/storefront/public/brand-assets/brand/Brand-01.webp` | `6f87fc229c7facdced0affad12bfbed7e0733c3c` | `f6996aeee0ed48147c3be55783de67a3392e30b3170b5c846bf14608b8062446` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/brand/Brand-02.webp` | `1e498722a3f4b0903907f2c50d50480a4384cb88` | `3b37f069f0c6a4d33618b5a4ca6d4b3671116948384476ddc49ae3bb8422c3a1` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/brand/Brand-03.webp` | `c40dde71e687aadd4c2da61b11bc78c4417a8136` | `ece3dd18bba3f3c674429ca71edfc960ed48da8ca2721d81cde44ca5fbea54c6` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/about/Hero-About-01.webp` | `17f3e6a3dff6292fd0640b77e8fad654903d74f2` | `dbffd8171ea12800aeb3b0699e41598e320c5465e5d9c4ea24dffa5c8e411947` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/about/Hero-About-02.webp` | `42cf93fd26d73a5ce44b0ac636dd6c34a469b572` | `a5235bacb6842c636931d024dea974916fa4c910d915bd95bcec16ab29fc6bbd` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/about/Hero-About-03.webp` | `c40dde71e687aadd4c2da61b11bc78c4417a8136` | `ece3dd18bba3f3c674429ca71edfc960ed48da8ca2721d81cde44ca5fbea54c6` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/contact/Hero-Contact-01.webp` | `6f87fc229c7facdced0affad12bfbed7e0733c3c` | `f6996aeee0ed48147c3be55783de67a3392e30b3170b5c846bf14608b8062446` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/contact/Hero-Contact-02.webp` | `1e498722a3f4b0903907f2c50d50480a4384cb88` | `3b37f069f0c6a4d33618b5a4ca6d4b3671116948384476ddc49ae3bb8422c3a1` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/products/Hero-Products-01.webp` | `5dc1f0b90ff9ee45413788c5bdea443101fb8217` | `953494e41fe234a912b3c4b4aa6a856a55e50fb216b44e3430487907e3382f9f` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/products/Hero-Products-02.webp` | `5e8d3763097d05cb2ee1215f4d6348d358db2d71` | `52bda661848e57ac6f79c04a4ab31fd5c940e7760b96b0e2ab2e5bea6c1abd5b` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/hero/products/Hero-Products-03.webp` | `339c44709650f4c248b17308ec8ac3de2556f5b2` | `5611e3652c8efa58cd70951cf71008f48432516c66e102a861bfc5b6a6dba88c` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/logo/logo_01.svg` | `b677dea42cd1d4c819881b74c759fe7939169ea6` | `0a252e0466931ef4f526407ba25d8ae97079de25f0e3e3c5006c0c9c3c67dea5` | `removed` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/logo/logo_icon_01.svg` | `b1f1308c29115baff7ced1d09e1a8fb2efb59274` | `fde2707d211801288eef0e1c51eea515f89ebf1d4861dc1b57b6362e62b57344` | `removed` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/logo/logo_word_01.svg` | `dfc8d6f08da6a3c51b4de8831cc46884fb9b663c` | `c6ba77ab7838d8762b9a1746db2139c3f0258e6a217ff3f75c426086ab203f5f` | `removed` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/masks/cut-01-mask.svg` | `77cd53b4af4bdd85bef45c9686be770da406c0e8` | `cf0db18b374e9a80fbc1d90fbddf0dcba5e5c791a0d68209e3318eceec5df804` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/example-product-sku-01.webp` | `4e68e94a770b20c5329aa4c6371eab56f3d6de89` | `20eb2d00108e044e9d984697e77b277c9ce3c90c7066f89736e42f7500370d99` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/example-product-sku-02.webp` | `3e87860d4ea95e14ac0706a0f293ee3036aaadf4` | `3e261731cf9acc00cfeafa3758c5cbe2103f550928a45608d3fea441d36e541e` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/example-product-sku-03.webp` | `1ba09b0fc2cac7185b7698b1ab586b7097d15311` | `bedda5a18a17d04797918bfd59502c844a8425d943ef61a377ab1f0de649d68d` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/example-product-sku-04.webp` | `8d36754dc4e8670ec6c609775dca0a664881d744` | `769095b582f5fbecaa75a88190cbe817d22a83b054f076bae43a2353b2d9e4f1` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/example-product-sku-main.webp` | `78f0ba67a8b17553f89ba47b8cb2fb4b4aed206e` | `0976213ed19b4bff6a607ea6500aedaca418246d4619db27000c04add496ba72` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/transparency/example-product-powder-01.webp` | `e3d5d86801db8391d0c7363fe135b4ca10f4d440` | `ec5e324903a5e46194b7421b4a372b9135e3011dbcc40b38e732ff1453586d40` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/transparency/example-product-powder-02.webp` | `ef6487f3d19d8e7afeb3f887d39ec2b7cf0940c6` | `ad0cfb4a88fc6345c15cbc4256493424febaff11f91b5e78b58f926eb2c1b687` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/transparency/example-product-powder-03.webp` | `98aa0b5b9b11394f7e034a7c2927576079a7d8ca` | `a9280011825fbeedf282938e7f2053a2ea3590d1eba207be5630435d7774b055` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/transparency/example-product-powder-04.webp` | `74ec58a7c0723eb410dbf4c6317be0a7b50b8825` | `baa9439e85296be3320e319e86af83dabc1594d03d2a57c622b1a51413d4f853` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/transparency/example-product-powder-05.webp` | `53a8760affef6e88c876cc99eace7caf1fc70f0f` | `01ccf409c6e07238c6d64fd184cfd951314b293967e3c5567e0a79790a91bed1` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/products/example-product/transparency/example-product-powder-06.webp` | `6d13c9a3b52472ecec44dd32b51401e4bcdc22bb` | `1c355c29dc2034981639d5373886531ec0e0b1f662d8b7413d1f8eefef41e4d5` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/brand-assets/video/homevideo.mp4` | `0fbc21180332c8a962c72cb95d548ecb237ac6e2` | `5e6c3f6678361b7c742d592b35956d81be08661c84bd0cc9f75fe0f1e820762a` | `replaced` | `unknown-not-published` |
| `apps/storefront/public/favicon.ico` | `97a604541398c58c750ea450ff5eaadd2204c8f2` | `44182a551435b009630188049e05cba72adb7d9876418d3262e6aa735b4753ab` | `removed` | `unknown-not-published` |
| `apps/storefront/public/favicon.svg` | `85d7ace4b67015396b1e0b9e0c9724626d911474` | `1a4b1bcd24484a835520258d5ba97369d005e7a52d899dbd6c46e0d72c5b4068` | `replaced` | `unknown-not-published` |

计数：`replaced=25`、`removed=4`、总计 `29`。

## 6. 门禁规则

直接运行：

```powershell
node .\scripts\tests\validate-public-assets.mjs
```

门禁采用 fail-closed 语义，并拒绝：

- public 中存在清单未登记媒体，或清单指向不存在的媒体；
- 路径大小写冲突、目录穿越、符号链接或不受管扩展名；
- SHA-256、MIME、源码引用映射或 bundled-unused 标记不一致；
- 来源、作者、日期、版权主体、许可证、证据或复核字段缺失；
- `legacy-unverified`、`legacy-replace-required`、`NOASSERTION` 等未解决状态；
- AI 主源缺少 promptRef、源输出 SHA-256 或合成内容 release/商标复核字段；
- 派生记录缺少有效上游、工具或变换说明；
- SVG 中包含 script、事件处理器、外链、外部 CSS、DOCTYPE/entity、foreignObject、可见文本或嵌入字体。

`ASSET_LICENSES.yml` 使用 JSON 语法编写；JSON 是 YAML 1.2 的严格子集，因此门禁无需依赖间接安装的 YAML parser。

## 7. 后续资产变更步骤

1. 先确认媒体来源、作者、版权主体、分发许可证和证据。
2. 新增或复用一条完整 `provenanceRecords` 记录；派生资产必须列出上游记录和变换工具。
3. 更新媒体文件、源码引用及清单中的路径、SHA-256、MIME、用途与 references。
4. 对 AI 内容记录 exact prompt、未发布主源 SHA-256、合成内容状态以及 model/property/trademark 复核。
5. 将逐项 `review.status` 设为 `approved` 前，由复核者检查 SVG 和视觉内容。
6. 运行门禁；只有零错误退出才允许进入开源发布候选。
