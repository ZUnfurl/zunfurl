# Contact 页轻量表单设计方案

状态：已实施，等待真实链路人工验收

日期：2026-07-03

适用项目：`gcss-v3-site-framework`

审核结论：第 17 节待确认问题按第 18 节推荐决策执行。

## 1. 结论

Contact 页可以增加一套轻量表单，但它的定位必须保持清晰：

> 这是一个邮件转发入口，不是客服系统、CRM、工单系统或订单查询系统。

第一版推荐使用：

```text
Astro 静态 Contact 页面
+ Cloudflare Worker /api/contact
+ Cloudflare Turnstile
+ Resend 或 Postmark 邮件 API
+ 短期防刷计数
+ 不存储表单正文数据
```

这套方案符合当前项目的基本边界：

- 静态优先。
- 不做全站 SSR。
- 不引入常驻服务器。
- 不建设自定义客服后台。
- 不把用户提交写入 Sanity。
- 不把用户提交写入 Shopify。
- 不把 Worker 变成长期业务数据库。
- 不为 Contact 表单引入复杂运营后台。

## 2. 设计目标

### 必须达成

- 用户可以在 Contact 页提交普通咨询。
- 表单提交后，业务方通过邮箱收到咨询内容。
- 表单内容不进入 Sanity、Shopify、GitHub、R2、D1 或长期数据库。
- 恶意请求不能轻易耗尽邮件服务额度。
- Contact 页面仍然是静态页面，普通浏览不进入 Worker 动态逻辑。
- 表单配置和文案可以通过 Sanity 维护。
- 技术实现可以被自动测试覆盖。

### 不做

- 不做客服工单后台。
- 不做提交记录列表。
- 不做处理状态、分配客服、SLA、标签系统。
- 不做用户自动回执邮件。
- 不做文件上传。
- 不做订单查询。
- 不接 Shopify Customer Account API。
- 不自动写入 Shopify Customer、Order、Metafield 或 Note。
- 不把表单提交内容存入 Sanity。
- 不把表单提交内容写入 Durable Object / KV / D1 / R2。

## 3. 行业定位

企业官网的轻量表单通常有四类做法：

| 方案 | 适合场景 | 优点 | 缺点 | 是否推荐给本项目 |
| --- | --- | --- | --- | --- |
| 第三方表单服务，如 Formspree、Tally、Typeform | 无开发能力、快速上线 | 快速、省代码 | 通常会存储提交记录，样式和隐私边界受限 | 暂不推荐 |
| CRM 表单，如 HubSpot Forms | 销售线索管理 | 表单、线索、自动化完整 | 天然存客户数据，体系偏重 | 后期有销售运营需求再考虑 |
| 客服系统表单，如 Zendesk、Gorgias、Help Scout | 多客服、多工单、多渠道 | 工单流成熟 | 成本和运营复杂度高 | 有真实客服量后再考虑 |
| Serverless 表单 + 邮件 API | 静态官网、低频咨询 | 轻、快、便宜、边界清晰 | 没有客服后台 | 推荐 |

本项目当前最适合第四种。

## 4. 成本预估

以下价格和额度只作为 2026-07-03 设计评估参考，正式上线前需要复核官方页面。

| 服务 | 第一版用途 | 当前可用免费层或起步成本 | 说明 |
| --- | --- | --- | --- |
| Cloudflare Workers | `/api/contact` 接收表单 | Free 计划通常足够轻量表单使用 | Contact 页面浏览不进入 Worker，只有提交时进入 |
| Cloudflare Turnstile | 人机验证 | Free 计划适合中小企业和多数生产应用 | 必须做服务端验证 |
| Resend | 发送邮件到业务邮箱 | Free 计划可用于低频表单，常见限制是每天 100 封、每月 3000 封 | 第一版推荐使用 |
| Postmark | 发送邮件到业务邮箱 | 免费更偏测试，正式使用通常从付费层开始 | 如果重视事务邮件投递口碑，可后续切换 |

推荐第一版按 Resend Free 设计，但业务上自己设置更低的每日上限，例如每天最多发送 60 封，避免被攻击时打空邮件额度。

## 5. 性能判断

普通页面访问：

- 仍然由 Astro 静态产物和 Cloudflare Worker Assets 承载。
- 不调用 Resend。
- 不调用 Turnstile Siteverify。
- 不访问协调对象存储。
- 不访问 Sanity 或 Shopify 实时接口。

表单提交：

- 进入 `POST /api/contact`。
- Worker 校验请求、Turnstile、防刷计数和内容格式。
- 校验通过后调用邮件 API。
- 不写长期数据库。

性能瓶颈通常不在 Worker，而在邮件 API 响应速度。对普通企业官网咨询量，这个方案性能足够。

## 6. 页面结构

当前 Contact 页属于品牌内容页，应继续遵守页面一一对应原则。

如果引入轻量表单，Contact 页建议结构为：

```text
0 基础设置
1 内页 Hero                  -> BrandPageHero.astro
2 联系与轻量表单              -> ContactSection.astro
3 内容区块                    -> BrandContentBlocks.astro
9 SEO 设置
```

其中：

- `ContactSection.astro` 是 Contact 页主模块，合并联系说明和轻量表单。
- 联系说明只保留必要内容，例如合作说明、业务方向和回复时间；公开页面不再展示直接邮箱入口。
- 回复说明不暴露测试邮箱或内部配置，统一表达为服务流程升级期间回复、合作评估、订单协助和信息确认可能延迟。
- 轻量表单是该模块的主功能，用户不需要先经过一个独立 CTA 区块。
- Turnstile 使用提交时手动执行，初始页面不展示验证框；点击提交后显示验证区域并生成 token，必要时由用户完成点击验证。
- 表单模块不显示隐私长文，但会在提交按钮前展示简短法律提示和 4 份条款入口；用户点击提交即视为已阅读并接受适用条款。
- `BrandContentBlocks.astro` 继续负责补充说明、FAQ、隐私提示或服务说明，但 Contact 页默认关闭显示；已填写内容保留在 Studio 中，之后可通过 `显示内容区块` 开关重新启用。

这样 Studio 字段、前台组件和页面区域可以继续保持 100% 一一对应。

实现状态：首页联系入口已经独立为 `HomeContactCtaSection.astro`；Contact 页正式使用 `ContactSection.astro` 承载联系说明和轻量表单。旧 `contactCtaSection` 已在第一轮低风险字段清理中移除，不再对应前台组件或 Studio 编辑入口。

```text
Contact 页：ContactSection.astro
首页联系入口：HomeContactCtaSection.astro
旧内容兼容：已完成清理，不再保留 contactCtaSection
```

最终命名应让编辑体验和组件职责保持一致：Contact 页只有一个 `联系与轻量表单` 主模块，首页只保留一个跳转型联系入口。

## 7. Sanity 职责

Sanity 只负责编辑表单展示和文案，不负责保存提交内容。

建议新增或扩展字段：

```text
contactSection
  enabled                         # Studio: 2.0 表单开关
  eyebrow                         # Studio: 2.1 左侧联系说明
  title
  body
  businessDirections[]
    title
    body
  responseTime                    # Studio 显示为“自定义说明”
  legalNotice                     # Studio: 2.2 提交前法律提示
    title
    body
    links[]
      label
      href
    acceptance
  fieldCopy                       # 系统固定，Studio 隐藏
    nameLabel
    emailLabel
    topicLabel
    orderNumberLabel
    messageLabel
    messagePlaceholder
    messageLimitLabel
  submitLabel                     # 系统固定，Studio 隐藏
  successTitle
  successBody
  errorTitle
  errorBody
  topics[]                        # 系统固定，Studio 隐藏
    label
    value
```

Sanity 可以维护：

- 联系模块标题。
- 联系模块说明。
- 合作说明。
- 业务方向。
- 自定义说明，例如服务延迟、合作流程提示或临时公告。
- 提交前法律提示，包括标题、正文、条款链接和默认接受说明。

Sanity 不开放给日常内容编辑维护：

- 右侧表单字段标签和 placeholder。
- 提交按钮文案。
- 咨询类型机器值。
- 成功、失败、限流和表单关闭状态反馈。

这些固定内容属于表单系统契约，改动会影响邮件分类、Turnstile 提交流程、多语言一致性和运营判断。后续如确实要调整，应作为一次代码变更处理，而不是在 Studio 中临时修改。

Sanity 不维护：

- 收件邮箱 secret。
- Resend API key。
- Turnstile secret。
- 表单提交记录。
- IP、邮箱、消息正文。
- 订单号查询结果。

## 8. 前端表单字段

第一版建议字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 联系人姓名，最多 80 字符 |
| `email` | 是 | 回复邮箱，必须是合法邮箱格式 |
| `topic` | 是 | 固定选项，不允许自由输入 |
| `orderNumber` | 否 | 订单号，只做邮件上下文，不查询 Shopify |
| `message` | 是 | 咨询内容，最多 2000 字符 |
| `privacyAccepted` | 是 | 前端点击提交时自动传入，表示用户已看到提交前法律提示 |
| `company` | 否 | Honeypot 隐藏字段，正常用户不可见 |
| `cf-turnstile-response` | 是 | Turnstile token |

不做附件上传。附件会显著增加垃圾提交、病毒文件、存储和隐私风险。

## 9. Worker 路由

新增路由：

```text
POST /api/contact
```

其他 method 直接返回：

```text
405 Method Not Allowed
```

推荐处理顺序：

```text
检查 CONTACT_FORM_ENABLED
-> 检查 method
-> 检查 Origin / Host
-> 检查 Content-Type
-> 检查 body size
-> 解析 JSON
-> Honeypot 检查
-> 基础字段校验
-> Turnstile 服务端验证
-> 防刷限流
-> 内容安全检查
-> 调用 Resend/Postmark
-> 返回成功
```

注意：

- Honeypot 命中时可以返回普通成功提示，但不发送邮件，减少攻击者反馈。
- 所有失败响应都应避免暴露精确原因，例如不要提示“你的 IP 被限制”。
- 邮件 API 调用失败时，返回通用失败提示，不展示直接邮箱入口。

## 10. 防御恶意邮件攻击

核心目标：

> 攻击请求必须尽量在调用 Resend 之前被拦截。

### 10.1 不发送用户自动回执

第一版不要给提交者自动回复邮件。

原因：

- 攻击者可以填写别人的邮箱。
- 网站会被利用成垃圾邮件转发器。
- 每次提交会消耗两封额度，而不是一封。

第一版只发送一封邮件到业务邮箱。

### 10.2 Turnstile 服务端验证

只在前端放 Turnstile widget 不够，Worker 必须调用 Cloudflare Siteverify。

原因：

- 攻击者可以绕过前端，直接请求 `/api/contact`。
- Turnstile token 有有效期。
- Turnstile token 是单次使用。

参考：

- Cloudflare Turnstile 服务端验证文档：`https://developers.cloudflare.com/turnstile/get-started/server-side-validation/`

### 10.3 限流策略

第一版建议阈值：

| 限制对象 | 建议阈值 | 目的 |
| --- | --- | --- |
| 全站每日邮件发送 | 60 封 / day | 保护 Resend Free 的 100/day 额度 |
| 全站每小时邮件发送 | 10 封 / hour | 防突发攻击 |
| 单 IP 每小时 | 3 次 / hour | 限制普通脚本刷表单 |
| 单 IP 每天 | 8 次 / day | 限制持续刷表单 |
| 单邮箱每小时 | 2 次 / hour | 防止同一邮箱被重复提交 |
| 单邮箱每天 | 5 次 / day | 防止邮箱维度滥用 |
| message 链接数量 | 最多 2 个 | 降低垃圾营销内容 |
| message 字符数 | 最多 2000 字符 | 降低滥用成本和邮件体积 |

这些阈值可以放到 Worker 环境变量中，后续按真实咨询量调整。

### 10.4 短期计数，不存正文

为了保护 Resend 每日额度，需要保存短期计数。这里的计数不是业务数据，也不保存表单正文。

使用 Worker 内的 SQLite-backed Durable Object 保存短期计数：

```text
contact:global:day:2026-07-03 = 37
contact:global:hour:2026-07-03T10 = 4
contact:ip:{hmac}:hour:2026-07-03T10 = 1
contact:ip:{hmac}:day:2026-07-03 = 2
contact:email:{hmac}:hour:2026-07-03T10 = 1
contact:email:{hmac}:day:2026-07-03 = 1
```

要求：

- IP 和邮箱不明文进入计数 bucket。
- 使用 HMAC hash。
- HMAC secret 存在 Worker secret。
- 计数行带 `expires_at`，例如小时 bucket 保留 2 小时，日 bucket 保留 36 小时，并由 alarm 清理。
- 不保存 `name`、`message`、`orderNumber` 等表单正文。

同一站点的全局、IP 和邮箱 bucket 必须在一个协调对象调用中完成“全部检查或全部递增”。Workers KV 是最终一致存储，`get → put` 不是原子事务，不能作为严格的并发邮件额度保护；当前实现因此不再使用 KV 计数器。

### 10.5 Cloudflare 层预防

可以在 Cloudflare 上额外配置安全规则：

```text
路径：/api/contact
方法：POST
动作：rate limit / managed challenge / block
```

Cloudflare WAF Rate Limiting Rules 可以在请求进入 Worker 之前拦截部分异常流量。

参考：

- Cloudflare WAF Rate Limiting Rules：`https://developers.cloudflare.com/waf/rate-limiting-rules/`
- Cloudflare Workers Rate Limiting API：`https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/`

### 10.6 紧急关闭开关

必须提供 Worker 环境变量：

```text
CONTACT_FORM_ENABLED=false
```

关闭后：

- 表单不发送邮件。
- 前端提示稍后重试，不展示公开邮箱入口。
- 页面仍然可浏览。
- 业务邮箱仍作为 Worker 后台收件配置保留，但不作为页面 mailto fallback。

## 11. 邮件发送设计

第一版邮件只发送到业务邮箱。

推荐邮件标题：

```text
[Example Brand Contact] {topicLabel} - {name}
```

推荐邮件正文：

```text
语言：zh-CN
咨询类型：产品咨询
姓名：张三
邮箱：person@example.com
订单号：未填写

消息：
我想了解 Example Product 的使用方式。

---
来源页面：https://example.com/zh-cn/contact/
提交时间：2026-07-03T10:30:00+08:00
```

邮件头建议：

```text
From: Example Brand Website <no-reply@example.com>
To: business@example.com
Reply-To: 用户填写的邮箱
```

注意：

- `From` 不使用用户邮箱，避免 DMARC/SPF 问题。
- `Reply-To` 使用用户邮箱，方便业务方直接回复。
- 用户邮箱必须经过格式校验和换行符过滤，防止 header injection。

## 12. 隐私边界

页面文案应避免写“完全不存储任何数据”。

推荐说法：

> 本网站不会在自有系统中保存表单提交记录。您提交的信息仅用于邮件转发和后续回复，邮件服务商和收件邮箱可能按其服务规则保留必要的传输记录。

原因：

- 项目不保存正文。
- 但邮件进入业务邮箱后会被邮箱系统保存。
- 邮件服务商可能有短期日志或内容保留。
- Cloudflare 可能有请求日志或安全事件记录。

这比“绝对不存储”更真实，也更安全。

## 13. 环境变量和 Secret

### Storefront 构建时公开变量

用于前端显示 Turnstile widget：

```text
PUBLIC_TURNSTILE_SITE_KEY
```

### Worker secrets

必须通过 Cloudflare Worker secrets 配置，不提交到 Git：

```text
CONTACT_FORM_ENABLED
CONTACT_RECIPIENT_EMAIL
CONTACT_ALLOWED_ORIGINS
CONTACT_HMAC_SECRET
TURNSTILE_SECRET_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
```

第一版业务收件别名使用 `service@example.com`。Contact 表单仍由 Worker 调用 Resend 发信；`service@example.com` 作为 Worker 后台收件配置和客户业务邮箱别名，由 Cloudflare Email Routing 转发到实际业务收件邮箱。公开 Contact 页不再展示 mailto 入口，实际转发目标只在 Cloudflare 控制台维护，不写入仓库。

### Worker 非敏感变量

可放在 wrangler 配置中，或继续按 secret 管理：

```text
CONTACT_DAILY_LIMIT=60
CONTACT_HOURLY_LIMIT=10
CONTACT_IP_HOURLY_LIMIT=6
CONTACT_IP_DAILY_LIMIT=20
CONTACT_EMAIL_HOURLY_LIMIT=2
CONTACT_EMAIL_DAILY_LIMIT=5
CONTACT_MESSAGE_MAX_LENGTH=2000
```

### 必要绑定

```text
GCSS_COORDINATOR
```

`GCSS_COORDINATOR` 在 A2/B/C 的 Wrangler 配置中和 `GcssCoordinator` SQLite migration 一起生成。A2 使用它执行 Contact 原子多桶计数；B/C 还使用它完成 webhook 短期幂等。A1 不生成该绑定。

## 14. 错误提示

前端不应展示太技术化或太具体的错误。

推荐：

| 场景 | 用户提示 |
| --- | --- |
| 成功 | 已收到您的咨询，我们会尽快回复。 |
| Turnstile 失败 | 提交未完成，请刷新页面后重试。 |
| 限流 | 当前在线咨询较多，请稍后重试。 |
| 邮件服务失败 | 暂时无法提交，请稍后重试。 |
| 表单关闭 | 在线表单暂时不可用，请稍后再试。 |

错误状态不展示公开邮箱入口，避免绕过 Turnstile 和限流。

## 15. 验收标准

### 自动测试

应新增或扩展测试覆盖：

- `POST /api/contact` 成功路径。
- 非 POST 返回 405。
- 表单关闭时不发送邮件。
- 缺少 Turnstile token 时不发送邮件。
- Turnstile 验证失败时不发送邮件。
- Honeypot 命中时不发送邮件。
- 超过 body size 时不发送邮件。
- 字段格式错误时不发送邮件。
- 超过 IP 限流时不发送邮件。
- 超过邮箱限流时不发送邮件。
- 超过全站每日上限时不发送邮件。
- Resend API 失败时返回可理解错误。
- Worker 不写 Sanity。
- Worker 不调用 Shopify。
- Worker 不把表单正文写入协调对象或其他存储。
- 两个并发请求争用最后一个额度时，最多一个请求获得额度。

### 手动验收

- Contact 页面正常显示。
- Turnstile 正常加载。
- 中文、英文、法文 Contact 页面都能显示对应文案。
- 正常提交后业务邮箱收到邮件。
- 邮件 `Reply-To` 是用户邮箱。
- 重复快速提交会被限制。
- 达到全站上限后页面提示稍后重试。
- 表单关闭开关生效。
- 浏览 Contact 页面不触发 Worker 邮件逻辑。
- Contact 表单展示 2000 字限制提示和动态计数。
- Contact 表单提交按钮前展示 4 份法律条款入口。
- 4 份法律页在 `en`、`fr`、`zh-cn` 下均可访问。

## 16. 实施顺序

审核通过后建议按以下顺序执行：

1. 更新文档和项目日志。
2. 增加 Sanity schema：`contactSection`。
3. 增加 Studio 模块说明标签，保持页面区域一一对应。
4. 更新 GROQ 查询、content source 和本地 fallback JSON。
5. 新增 `ContactSection.astro`，合并联系说明和轻量表单。
6. 保留或重命名首页联系入口组件，避免首页继续依赖 Contact 页主模块。
7. 在 `BrandPageTemplate.astro` 中只对 Contact 页渲染 `ContactSection.astro`。
8. 新增 Worker `/api/contact` 路由。
9. 增加 Turnstile 服务端验证。
10. 增加短期防刷计数。
11. 增加邮件发送适配层。
12. 补自动测试。
13. 本地构建和 Worker dry-run。
14. 配置 Cloudflare Worker secrets。
15. 部署测试。
16. 真实提交一封测试邮件。

## 17. 需要审核确认的问题

执行前需要确认：

1. 第一版邮件服务是否选择 Resend。
2. 业务收件邮箱使用哪个地址。
3. 是否接受第一版不发送用户自动回执。
4. 是否接受第一版不做附件上传。
5. 是否接受第一版只做邮件转发，不做后台记录。
6. 每日全站发送上限是否采用 60 封。
7. 每小时全站发送上限是否采用 10 封。
8. 是否接受由客户 Cloudflare Worker 创建 Durable Object，用于短期 hash 计数且不保存表单正文。
9. Contact 页是否按 `2 联系与轻量表单`、`3 内容区块` 调整 Studio 排序。
10. 是否需要同时支持 `en`、`zh-CN`、`fr` 三种语言表单文案。

## 18. 推荐决策

我的推荐：

- 使用 Resend 作为第一版邮件 API。
- 不发送自动回执。
- 不做附件上传。
- 不查 Shopify 订单。
- 不保存正文。
- 使用 Turnstile 服务端验证。
- 使用 Durable Object 只保存短期 HMAC 计数，并原子检查全部额度 bucket。
- 全站每日邮件上限设置为 60。
- 公开页面只使用表单系统，不提供直接 mailto fallback。
- Contact 页 Studio 结构使用 `2 联系与轻量表单`，由 `ContactSection.astro` 统一承载联系说明和表单。
- 联系说明保持精简，只服务表单决策，不再作为独立大 CTA 模块。

这样可以用最低复杂度完成 Contact 页轻量表单，同时把恶意邮件攻击造成的损失控制在可接受范围内。

## 19. 参考链接

- Cloudflare Turnstile server-side validation：`https://developers.cloudflare.com/turnstile/get-started/server-side-validation/`
- Cloudflare Workers Rate Limiting API：`https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/`
- Cloudflare WAF Rate Limiting Rules：`https://developers.cloudflare.com/waf/rate-limiting-rules/`
- Cloudflare Workers Pricing：`https://developers.cloudflare.com/workers/platform/pricing/`
- Cloudflare Turnstile Plans：`https://developers.cloudflare.com/turnstile/plans/`
- Resend Pricing：`https://resend.com/pricing`
- Postmark Pricing：`https://postmarkapp.com/pricing`
