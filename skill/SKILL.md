---
name: prism-geo-audit
description: >-
  Prism（棱镜）GEO 审计 —— 输入一个网站 URL + 目标市场，按 geo_audit_standard v0.5.1
  §5.A Light 流程跑 D1–D5 五维度站内静态审计，对话内输出中文 markdown 报告，并额外产出一份
  可分享的自包含 HTML 报告文件。MVP 为 Light 档（秒/分钟级站内静态筛查），非多引擎实测。
  触发：用户输入 /prism-geo-audit <url> [--market international|china|both]，或要求
  "做 GEO 审计 / AI 可见度诊断 / Prism 审计 / 测一下这个站对 LLM 友不友好"。
---

# /prism-geo-audit

GEO（生成式引擎优化）站内静态审计。输入站点 URL + 目标市场，输出 D1–D5 五维度
indicative 评分报告 + Top3 整改清单，双出：**对话内 markdown** + **可分享 standalone HTML 文件**。

> 方法论真源：`geo_audit_standard.md` v0.5.1 §5.A（Light）。产品规格：`docs/prd_v1.md` v1.1。
> 本 skill 为 **Light 档**：站内静态可判断的子项；earned media / 跨 query 稳定性 / per-engine
> 实测引用率属 **Deep 档**，本档不评，但报告里显式列入 `notEvaluated`，绝不隐瞒局限。

---

## 1. 调用与参数

```
/prism-geo-audit <url> [--market international|china|both]
```

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `url` | 是 | — | 合法 http(s) URL；无 scheme 默认补 `https://`，失败再试 `http://` |
| `--market` | 否 | `international` | `international` \| `china` \| `both`（china 走 §6.3 国内后端事实层逻辑，Phase 1.1）|

**输入规范化（PRD §4.1）**：去 `utm_*`/`fbclid` 等 tracking 参数，保留 path；审计目标 = 该 URL
所在**站点**（首页 + sitemap/导航抽样 2–3 个代表页，不是只看单页）。

---

## 2. 执行流程（PRD §3.1 / §5.2 L-1 ~ L-6）

每完成一个阶段 **emit 一行进度**（避免长时间静默；性能要求 ≤5 次静默间隔，PRD §11）：

1. **L-1 网站画像** — 抓首页 meta/title/lang，推断 businessType / isYMYL / nicheTier / siteScale /
   primaryLanguage / geoMarket / targetEngines。`emit("正在画像网站…")`
2. **L-2 D5 技术底座** — robots.txt（各 LLM bot 条目，UA 清单见分析器规格）、sitemap 覆盖、
   view-source 渲染模式（CSR 风险）、Core Web Vitals（PageSpeed Insights API，无 key 降级见 §10）、
   HTTPS/证书。`emit("正在跑 D5 技术底座…")`
3. **L-3 D1 结构架构** — JSON-LD/schema.org 抽取校验、H1–H4 层级、章节树/导航清晰度。`emit(...)`
4. **L-4 D2 可读性** — 段落/列表/表格语义、FAQ 块、micro 节制、self-contained 抽样、删 CSS 可读性、
   `/llms.txt` 存在+格式。`emit(...)`
5. **L-5 D3+D4 站内信号** — D3：About/作者资质/时间新鲜度/透明度；D4：Cite/Quotation/Statistics
   使用率、结论明确性、Justification 结构。`emit(...)`
6. **L-6 简报输出** — 组装 `AuditReport`，算总分/等级/一票否决/耦合/Top3/Deep 推荐。`emit("正在生成报告…")`

> **D1–D5 检查项的判定规则（rubric）** 由 Analyzer 规格维护（任务 T4 / DAI-1281），内嵌于 Prism
> 自身资产（§9.1 自包含）。本 skill 负责**编排 + 进度 + 渲染 + 收尾**；判断逻辑集中在 Analyzer，
> 升版本时单点修改。运行时只产出/消费 `src/core/types.ts` 定义的 `AuditReport` 契约。

---

## 3. 打分规则速查（PRD §5.3，确定性，渲染层不重判）

- **单维度 6 档**：100/80/60/40/20/0，核心项加权均后**向下就近档**（宁低勿高）。
- **总分**：`D1×0.20 + D2×0.20 + D3×0.25 + D4×0.25 + D5×0.10`，标 `indicative=true`。
- **Light 缺项**：D3 earned / D4 跨 query 子项**不参与**打分，列入 `notEvaluated`；D3/D4 标 `partial=true`。
- **一票否决**（显式 flag）：`D5<60` → veto 触发，等级锁 `L0`；`D3<40 且 YMYL` → `L0`。
- **耦合**：D1×D2 错配、D4×D2 micro 耦合、CSR 空壳 → `couplingFlags`。
- **等级**：L0(0–40)/L1(41–60)/L2(61–80)/L3(81–100)，Light 标 indicative + "Deep 后可能下调"。
- **Niche 提示**：Light 不应用 Niche 封顶，但 `nicheWarning` 提示 Deep 可能触发封顶。

---

## 4. 输出渲染（PRD §7.3 / §7.5，双出）

L-6 产出的 `AuditReport`（JSON，契约见 `src/core/types.ts`）写到临时文件，再调渲染器：

```bash
node skill/render/cli.ts <report.json> [outDir]
```

- **markdown**（§7.3 模板）→ 回显到 stdout，由本 skill **送进对话**供即时阅读（对话只渲染 md）。
- **standalone HTML**（§7.5）→ 写出 `<stem>.html`：自包含单文件、内联 CSS、零外部依赖，
  含 5 维 SVG 雷达图 + 维度卡片 + Top3，可离线打开 / 直接发客户 / 存档。

> 渲染器是 `AuditReport` 的**无逻辑渲染器**，互不重复判断（CLAUDE.md §4）。HTML 视觉 token
> 与 T5b（美龙 DAI-1276/1283）对齐后集中替换 CSS，不改数据契约与结构。

**报告必含五要素（§7.2，硬性）**：总分(indicative)+等级+关键风险 / 5 维分数+问题 /
未评估项(需 Deep) / Top3 整改 / 是否推荐 Deep + 理由。

---

## 5. 收尾（PRD §3.1 [5]）

报告渲染完即终态，不驻留。结尾给：

- **是否推荐 Deep 审计** + 理由（`deepAuditRecommended` / `deepAuditRationale`）。
- **引导**："Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，
  联系 Daimonia 交付团队。"（已内嵌进两种渲染输出末尾）

---

## 6. 错误处理速查（PRD §10，永不整体崩，降级透明标注）

| 场景 | 处理 |
|------|------|
| URL 不可达 / DNS / 超时 | 重试 1 次（https→http）；仍失败 → 出 error 报告（`meta.error="unreachable"` + 排查提示），终止 |
| robots.txt 禁抓 | 尊重；仅用站级文件评 D5，内容维度标 `na` + "建议授权审计" |
| CSR 空壳 | D5 照评 + D1 渲染模式判 CSR 风险；`couplingFlags: csr_empty_html`；询问是否仅出 D5 |
| D5<60 一票否决 | 出 L0，仍跑完其余维度供整改参考，等级锁 L0，veto 块显式说明 |
| 登录/付费墙 | 不绕过，标 `na` + "需授权后 Deep 审计" |
| 非 HTML（PDF/JSON API）| 终止，提示"Prism 审计 HTML 网站" |
| 站点 >1000 页 | 不全量爬，抽样（≤5 页 + 站级文件），`meta.sampledPages` 注明 |
| PageSpeed API 失败/限流 | D5 的 CWV 子项标 `partial`，用其它 D5 项打分，"CWV 未取到"，不阻塞 |
| 部分维度失败 | 返回 partial `AuditReport`，失败维度标 `na/partial`，总分按可评维度重算并提示偏差 |

error / partial 报告同样走渲染器：markdown 出"审计未完成 + 排查提示"，HTML 出错误页（不画雷达）。

---

## 7. 自包含与维护（PRD §9.1 / §13）

Prism 运行时**不依赖**外部 skill 或 `Daimonia/00_OS/` 路径。方法论数据（L 流程、D1–D5 rubric、
中国后端事实表、bot UA 清单、report schema + 渲染模板）内嵌于 Prism 自身资产。
`geo_audit_standard.md` 升版本时，人工起 child issue 同步变更进 Prism 并 bump `prismVersion` +
report 的 `standardVersion`。

## 8. 文件清单（T5 交付）

```
skill/
├── SKILL.md                  # 本文件：编排 + 参数 + 进度 + 渲染调用 + 收尾
├── render/
│   ├── spec.ts               # 维度标签 / 等级描述 / 关键风险派生（共享，纯函数）
│   ├── markdown.ts           # renderMarkdown(report) → §7.3 对话内 md
│   ├── html.ts               # renderHtml(report)     → §7.5 自包含 HTML（SVG 雷达）
│   └── cli.ts                # 读 AuditReport JSON → 写 .md + .html
└── fixtures/                 # 渲染验证样例（normal / veto-L0 / error）
src/core/types.ts             # AuditReport 数据契约（与 T2 共享）
tests/                        # render-markdown / render-html 单测（node:test，零依赖）
```
