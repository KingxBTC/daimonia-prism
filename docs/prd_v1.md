# Prism PRD v1 — 产品需求文档

> **版本**：v1.1（2026-06-03，King review 决策已落盘）
> **作者**：付龙（CTO / Product Delivery Lead, Daimonia AI）
> **状态**：已通过 King review，开放问题全部拍板，进入实现拆分
> **v1.1 变更**（King 2026-06-03 comment）：skill 名定为 `/prism-geo-audit`；international 报告默认中文；Deep 审计按 agent 全自动预留架构；小红书点点纳入 Phase 1.1；报告新增 standalone HTML 渲染（§7.5）；PageSpeed API key 派 child issue 给维龙。
> **上游**：[DAI-1253](/DOT/issues/DAI-1253#document-plan) plan v3 (final, King 确认)
> **方法论 source of truth**：`00_OS/methodology/geo_audit_standard.md` v0.5.1 + `llm_search_backend_china.md` v0.1
> **本文档定位**：Prism 开发前置规格。任何实现（skill / web）必须对齐本 PRD；本 PRD 派生自方法论文档，方法论升版本时本 PRD 跟随修订。

---

## 0. 文档约定

- **方法论锚定**：本 PRD 不重新定义 GEO 维度 / 权重 / 评分规则——这些只在 `geo_audit_standard.md` 发生。本 PRD 定义的是**如何把方法论 §5.A Light Audit 流程产品化为一个可执行工具**。维度定义引用方法论 §2，评分引用 §3-4，流程引用 §5.A。
- **范围分层**：本 PRD 覆盖完整产品愿景，但用 `[MVP]` / `[Phase 1.1]` / `[Phase 2+]` 标签区分交付批次。**v1 MVP 实现范围 = §2.2 定义的最小集**，其余为已锁定的 roadmap，不在首批实现。
- **术语**：「core / 核心引擎」= 与前端解耦的审计逻辑模块；「前端形态」= skill 或 web UI 两种调用入口。

---

## 1. 产品概述

### 1.1 是什么

**Prism（棱镜）** 是 Daimonia 的 GEO（Generative Engine Optimization，生成式引擎优化）审计工具。输入一个网站 URL + 目标市场，输出该网站对生成式搜索引擎（Claude / ChatGPT / 豆包 / 元宝 等）友好度的 **D1–D5 五维度评分报告 + 整改清单**。

产品名取"棱镜折射分散光谱"的分析意向：一束光（网站）穿过棱镜，分解成五条可量化的光谱（五维度）。

### 1.2 目标用户与使用场景

| 用户 | 场景 | 对应方法论档位 |
|------|------|----------------|
| Daimonia 内部交付团队 | 客户网站快速诊断、销售漏斗首轮、整改前基线 | Light Audit |
| Daimonia 自建站 / 客户站运营 | 上线前自查、迭代后回归 | Light Audit |
| （Phase 2）网站主自助 | 官网功能页输入 URL 即时拿 indicative 分数 | Light Audit |
| （Phase 3）付费深度交付 | 完整审计 + 多引擎实测 + 整改清单 | Deep Audit |

### 1.3 价值主张

1. **方法论落地**：把 daimonia 内部沉淀的 GEO 审计标准（学术实证支撑的 5 维度框架）变成任何人 2 分钟能跑一次的工具。
2. **市场差异化**：内嵌**中国 LLM 后端事实层**（`llm_search_backend_china.md`），能判断"内容是否落在目标国内 LLM 可抓取的源"——这是海外 GEO 工具（套 Bing 共享底座思路）做不到的，是 Daimonia 在中国 GEO 市场的壁垒（plan v3 §4 King 洞察）。
3. **通用工具**：不绑定任何客户体系，自包含，不依赖外部 skill。

### 1.4 与现有方法论的关系

Prism 是 `geo_audit_standard.md` 的**执行化产品**，三者关系：

```
geo_audit_standard.md (评分标准, source of truth)
        │ 派生
        ▼
Prism core (本 PRD 定义的核心审计引擎, 内嵌 §5.A Light 流程)
        │ 复用
        ├──► /prism-geo-audit skill (前端形态 1)
        └──► 官网功能页 (前端形态 2)
```

**自包含原则**：Prism core 必须把 §5.A Light 流程 + D1–D5 检查项 + §1.3 中国后端事实表**内嵌**进自身资产（SKILL.md / 后端代码），不在运行时去 import 任何外部 skill 或读取 `Daimonia/00_OS/` 路径。方法论升版本时，由人工把变更同步进 Prism（见 §13 维护流程）。

---

## 2. 范围

### 2.1 产品全景（愿景）

| 能力 | 批次 |
|------|------|
| Light Audit（站内静态，indicative 分数）| **[MVP]** |
| international 市场（6 引擎语境） | **[MVP]** |
| skill 形态 `/prism-geo-audit` | **[MVP]** |
| china 市场（10 引擎语境 + 后端事实层）| `[Phase 1.1]` |
| `--market both` | `[Phase 1.1]` |
| 官网功能页（web 形态） | `[Phase 2]` |
| Deep Audit（多引擎实测 + 跨 query 稳定性）| `[Phase 3]` |

### 2.2 v1 MVP 实现范围（首批必须交付）

1. **Prism core 审计模块**：实现 §5.A Light Audit 全流程（L-1 ~ L-6），输出 §7 定义的 `AuditReport` 结构。
2. **`/prism-geo-audit <url> [--market]` skill**：调用 core，渲染 §7.3 markdown 报告。
3. **市场**：`international`（默认）。`china` / `both` 的引擎清单与后端事实表**写入 PRD 与 core 数据结构**，但 china 专属采集逻辑（百家号/公众号覆盖核查等）排期到 Phase 1.1。
4. **档位**：仅 Light。Deep 的 hook 预留（report 里标 `notEvaluated`），不实现采集。

### 2.3 非目标（v1 明确不做）

- ❌ **多引擎实时采样 / Reference Rate 实测**：§3.5 重复采样是 Deep 档专属，MVP 不做（这是与竞品凡科"1-3 小时后台诊断"的关键差异——见 §5.5）。
- ❌ **内容生成 / 自动整改**：Prism 只审计 + 出清单，不改客户内容（方法论 §7.2 边界）。
- ❌ **持续监控 / ranking 防御**：point-in-time 快照，不做监控。
- ❌ **登录态 / 付费墙后内容抓取**：只审计公开可达页面。
- ❌ **多语言 earned media 深度调研**：Deep 档专属。

---

## 3. 用户流程

### 3.1 Skill 形态 `[MVP]`

**端到端流程**：

```
用户 → Claude Code 输入 `/prism-geo-audit https://example.com --market international`
  │
  ├─ [1] 参数校验：URL 合法性、market 枚举、网络可达性预检
  ├─ [2] core.auditLight({url, market}) 执行 L-1 ~ L-5 采集与打分
  │       └─ 过程中 emit 进度（"正在跑 D5 技术底座…"）
  ├─ [3] core 返回 AuditReport (JSON)
  ├─ [4] skill 渲染 §7.3 markdown 报告到对话
  └─ [5] 收尾：是否推荐 Deep 审计 + 引导（"如需完整 Deep 审计，联系 Daimonia 交付团队"）
```

**交互特征**：
- 单次命令、无多轮追问（除非 §10 错误需用户决策，如"该站是 CSR 空壳，是否仍继续仅评 D5？"）。
- 进度可见：每个维度采集完成 emit 一行进度，避免长时间静默。
- 输出即终态：报告渲染完即结束，不驻留。

### 3.2 Web 形态 `[Phase 2]`

```
访客 → 官网功能页填表单 (URL + market 下拉)
  │
  ├─ [1] 前端校验 + 提交 → POST /api/prism-geo-audit
  ├─ [2] 后端入队，返回 jobId，前端轮询/SSE 显示进度条
  ├─ [3] 后端 worker 调用同一份 Prism core.auditLight
  ├─ [4] 完成 → 返回 AuditReport JSON
  └─ [5] 前端把 JSON 渲染成可视化报告页（雷达图 + 维度卡片 + 整改清单）
          └─ CTA：留资 / 升级 Deep 审计
```

**关键约束**：web 形态与 skill 形态**共用同一 Prism core**（§8 解耦架构）。web 端差异仅在：前端渲染、任务队列、留资 CTA。

---

## 4. 输入输出规格

### 4.1 输入

| 参数 | 类型 | 必填 | 默认 | 校验 |
|------|------|------|------|------|
| `url` | string | 是 | — | 合法 http(s) URL；自动补 `https://`；解析出可达 host |
| `market` | enum | 否 | `international` | `international` \| `china` \| `both` |

**输入规范化**：
- URL 去 utm_* / fbclid 等 tracking 参数后保留；保留 path（允许审计子页或首页）。
- 无 scheme → 默认 `https://`，失败再试 `http://`。
- 审计**目标 = 该 URL 所在站点**：core 以输入 URL 为种子，抓首页 + sitemap 抽样 2–3 个代表页（§5.4），不是只看单页。

### 4.2 输出

**主输出**：`AuditReport` 结构化对象（§7.1 JSON schema）。

**衍生输出**：
- skill 形态：§7.3 markdown 报告（渲染自 JSON）。
- web 形态：§7.4 可视化 HTML（渲染自 JSON）。

**输出契约**：core 永远返回结构化 `AuditReport`（即便部分维度失败也返回 partial，见 §10），渲染层只消费 JSON、不重新判断。

---

## 5. 评分方法论（内嵌 geo_audit_standard.md v0.5.1 §5.A）

> 本节是 Prism core 的**算法规格**。完整定义见方法论 §2–§5.A；此处给出 Prism 必须实现的可执行版本。

### 5.1 五维度与权重（方法论 §2.6）

| 维度 | 名称 | 权重 | Light 可评程度 |
|------|------|------|----------------|
| D1 | 结构化语义 + 宏观架构 | 20% | 完整（站内静态可判断）|
| D2 | 内容 AI 可读性 + meso + micro（含 llms.txt）| 20% | 完整 |
| D3 | 权威性信号（E-E-A-T + Earned）| 25% | **部分**（仅站内 E-E-A-T；earned media 子项 = Deep）|
| D4 | 可引用性 + 跨 query 稳定性 | 25% | **部分**（仅站内可引用单元；跨 query 稳定性 = Deep）|
| D5 | 技术抓取基建 | 10% | 完整 |

### 5.2 Light Audit 采集流程（方法论 §5.A，Prism 实现映射）

| 步骤 | 方法论 | Prism core 动作 | 自动化程度 |
|------|--------|------------------|------------|
| L-1 网站画像 | §5.A L-1 | 抓首页 meta/title/lang + 推断业务类型 / YMYL / Niche 档 / 站点规模 / 语言 / 地理市场 | LLM 判断 + 启发式 |
| L-2 D5 技术底座 | §5.A L-2 | robots.txt 解析（LLM bot 条目）、sitemap.xml 存在+覆盖、view-source 渲染模式、Core Web Vitals、HTTPS/证书 | 全自动（确定性）|
| L-3 D1 结构架构 | §5.A L-3 | JSON-LD/schema.org 抽取与校验、H1–H4 层级一致性、章节树/导航清晰度 | 自动抽取 + LLM 判断 |
| L-4 D2 可读性 | §5.A L-4 | 代表页段落/列表/表格语义、FAQ 块、micro 强调节制度、self-contained 抽样、删 CSS 可读性、`/llms.txt` 存在+格式 | 自动抽取 + LLM 判断 |
| L-5 D3+D4 站内信号 | §5.A L-5 | D3：About/作者/时间新鲜度/透明度；D4：Cite/Quotation/Statistics 使用率、结论明确性、Justification 结构 | 自动抽取 + LLM 判断 |
| L-6 简报输出 | §5.A L-6 | 组装 `AuditReport`，算总分/等级/耦合/Top3/Deep 推荐 | 确定性 |

### 5.3 打分规则（方法论 §3–§4，Prism 必须实现）

- **单维度 6 档**（§3.1）：100/80/60/40/20/0，取核心检查项加权均后**向下就近档**（宁可打低不打高）。
- **总分**（§3.2）：`D1×0.20 + D2×0.20 + D3×0.25 + D4×0.25 + D5×0.10`，标 `indicative=true`。
- **Light 缺项处理**（§3.2 档位差异）：D3 earned / D4 跨 query 子项**不参与 Light 打分**，但 report 必须在 `notEvaluated` 列明"需 Deep 审计"。D3/D4 的 Light 分数**只基于站内可见子项**，并标 `partial=true`。
- **一票否决 / 耦合**（§3.3 / §4.2）必须实现为显式 flag：
  - `D5 < 60` → `vetoes[].triggered=true`，等级直接 L0。
  - `D3 < 40 且 YMYL` → L0。
  - D1×D2 错配、D4×D2 micro 耦合 → `couplingFlags`。
- **等级**（§4.1）：L0(0–40)/L1(41–60)/L2(61–80)/L3(81–100)，Light 等级标 indicative + "Deep 审计后可能下调"。
- **Niche 提示**（§4.3）：Light 不应用 Niche 封顶（依赖 D3 earned，Deep 专属），但 report 须显式提示"Deep 审计可能触发 Niche 封顶，当前高分对 Niche 主体易虚高"。

### 5.4 采样策略

- **页面抽样**：首页必采 + 从 sitemap/导航选 2–3 个代表性内容页（优先 About、核心服务页、最新内容页）。站点规模 >1000 时不全量爬，只评抽样页 + 站级文件（robots/sitemap/llms.txt）。
- **抽样透明**：report 的 `meta.sampledPages[]` 列出实际采到的 URL，让读者知道分数基于哪些页。

### 5.5 与竞品凡科的方法论差异（设计依据，非实现项）

凡科 AI 可见度诊断走"3 字段输入 + 实体消歧 + 1–3 小时后台多引擎诊断"——即 Deep 档思路。Prism **MVP 走 Light 档（秒级站内静态）**，定位为"快速筛查 + Deep 入口"，方法论更透明（5 维度学术支撑可解释）。**这是产品差异化的核心：不和凡科拼后台实测时长，拼方法论可解释性 + 中国后端事实层 + Deep 交付的人工深度。**

---

## 6. 引擎覆盖清单（方法论 §1.2 / §1.3 + plan v3 §4）

> **关键设计**：Light Audit **不做实时多引擎采样**（§2.3）。引擎清单在 Light 档的作用是三处：(a) D5 robots.txt 对各 LLM bot 的允许策略核查；(b) D2/D3 "内容是否落在目标引擎可抓取的源"判断（尤其 china 市场，依据 §1.3 后端事实表）；(c) 整改建议里的"引擎特定层"提示。实时引用率实测留给 Deep 档。

### 6.1 国际 — 6 引擎 `[MVP 语境]`

| 优先级 | 引擎 | bot UA（D5 核查）| 引擎特定偏好（§1.2，整改建议用）|
|--------|------|------------------|-------------------------------|
| P0 | Claude | `ClaudeBot` / `anthropic-ai` | earned 最高、英语偏重、深度+平衡 |
| P0 | ChatGPT | `GPTBot` / `OAI-SearchBot` | earned 最高、强本地语言跟随、结论先行 |
| P1 | Gemini | `Google-Extended` | 最 brand-friendly、章节骨架清晰 |
| P1 | Perplexity | `PerplexityBot` | 视频/零售/社区、具体证据+规格 |
| P1 | Google AI Overviews | `Googlebot` | 传统索引底座 |
| P2 | Bing Chat / Copilot | `Bingbot` | Microsoft 生态 |

### 6.2 国内 — 10 引擎 `[Phase 1.1 语境]`

| 优先级 | 引擎 | search 后端 | 生态独占源（§1.3）|
|--------|------|-------------|-------------------|
| P0 | 百度AI | 百度搜索 | 百家号强偏好 |
| P0 | 豆包 | 头条+抖音搜索 | 抖音 + 今日头条号 |
| P0 | 腾讯元宝 | 微信搜一搜+搜狗 | 微信公众号 + 视频号 |
| P1 | DeepSeek | 博查（开放 web）| 仅开放 web |
| P1 | 通义千问 | 夸克 | 开放 web + UC |
| P1 | Kimi | 多引擎+自建 | 知乎/公众号/小红书/B站（二手）|
| P1 | 文心一言 | 百度搜索 | 强偏百家号 |
| P2 | 智谱清言 | 多引擎可选 | 选 sogou→腾讯系 |
| P2 | 腾讯混元 | 同元宝 | 同元宝 |
| P2–P3 | 小红书点点 | 小红书内置 | 小红书站内池（按客户类型定优先级）|

### 6.3 china 市场的核心审计逻辑 `[Phase 1.1]`

依据 `llm_search_backend_china.md` §2 交叉表，china 市场 Light 审计需额外判断 **"内容平台覆盖 vs 目标 LLM 可达性"**：
- 输入站点内容分布 → 比对目标 LLM 的可抓取源 → 标出"D2 再高也无 LLM 可见性"的盲区（例：内容只在小红书 → DeepSeek/千问/文小言/豆包 都抓不到）。
- robots.txt 对国内 bot（百度 `Baiduspider` / 字节 / 等）的策略核查。
- D5 提示：平台内容（公众号/抖音）走平台索引，不受 robots 控制。

---

## 7. 报告格式详细设计

### 7.1 `AuditReport` JSON Schema（core 主输出契约）

```jsonc
{
  "meta": {
    "url": "https://example.com",
    "market": "international",          // international | china | both
    "auditTier": "light",              // light | deep
    "standardVersion": "geo_audit_standard v0.5.1",
    "prismVersion": "1.0",
    "timestamp": "2026-06-03T10:00:00Z",
    "durationMs": 84000,
    "sampledPages": ["https://example.com/", "https://example.com/about", "..."]
  },
  "profile": {                          // L-1 网站画像
    "domain": "example.com",
    "businessType": "婚姻咨询服务",
    "isYMYL": true,
    "ymylCategory": "情感婚姻心理",
    "nicheTier": "niche",              // head | mid | niche
    "siteScale": "100-1000",           // <100 | 100-1000 | >1000
    "primaryLanguage": "zh-CN",
    "geoMarket": "中国大陆",
    "targetEngines": ["claude", "chatgpt"]
  },
  "scores": {
    "total": 52,
    "level": "L1",
    "indicative": true,
    "dimensions": {
      "D1": { "score": 60, "weight": 0.20, "partial": false,
              "issues": ["schema.org 仅首页有，内容页缺 Article 标注"],
              "checks": [ /* CheckResult[] */ ] },
      "D2": { "score": 40, "weight": 0.20, "partial": false,
              "issues": ["缺 /llms.txt（-10）", "FAQ 藏在长段落"], "checks": [] },
      "D3": { "score": 45, "weight": 0.25, "partial": true,
              "issues": ["作者无资质标注"], "checks": [] },
      "D4": { "score": 50, "weight": 0.25, "partial": true,
              "issues": ["结论模糊、无独家数据"], "checks": [] },
      "D5": { "score": 70, "weight": 0.10, "partial": false,
              "issues": [], "checks": [] }
    }
  },
  "vetoes": [
    { "rule": "D5<60", "triggered": false },
    { "rule": "YMYL_D3<40", "triggered": false }
  ],
  "couplingFlags": [
    { "code": "D1xD2_mismatch", "note": "架构尚可但内容空" }
  ],
  "notEvaluated": [
    "D3 earned media 覆盖度（需 Deep）",
    "D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）",
    "引擎特定层 per-engine 分数（需 Deep）",
    "异常引用模式抽查（需 Deep）"
  ],
  "nicheWarning": "当前 indicative 分数对 Niche 主体易虚高，Deep 审计可能触发 L2 封顶",
  "topFixes": [                         // L-6 Top 3 立即可行整改
    { "priority": 1, "dimension": "D4", "method": "Statistics Addition",
      "action": "核心结论补具体数字/样本量/时间窗口", "rationale": "Aggarwal Top3，ROI 最高", "effort": "low" },
    { "priority": 2, "dimension": "D2", "method": "llms.txt",
      "action": "新增 /llms.txt（H1+定位+核心页链接）", "rationale": "缺失 -10 分", "effort": "low" },
    { "priority": 3, "dimension": "D3", "method": "E-E-A-T",
      "action": "作者页补资质/机构背景", "rationale": "YMYL 领域权威要求高", "effort": "mid" }
  ],
  "deepAuditRecommended": true,
  "deepAuditRationale": "YMYL + Niche 主体，站内分数 indicative，earned media 与跨 query 稳定性未评估，建议 Deep 审计定整改方向"
}
```

**`CheckResult` 子结构**（每个检查项）：
```jsonc
{ "id": "D2.llms_txt", "name": "/llms.txt 存在性与格式", "tier": "L+D",
  "status": "fail",                     // pass | partial | fail | na
  "evidence": "GET /llms.txt → 404",
  "scoreImpact": -10 }
```

### 7.2 报告必含要素（方法论 §5.A L-6，硬性）

1. 总分（indicative）+ 等级 + 关键风险（D5 底座 / YMYL 无权威 / Niche 虚高）。
2. 5 维度 indicative 分数 + 每维度 1–2 句主要问题。
3. **未评估项说明**（`notEvaluated`）——明确"需 Deep 审计"，不得隐瞒 Light 的局限。
4. Top 3 立即可行整改（按 D4 9 方法 ROI 排序）。
5. 是否推荐 Deep 审计 + 理由。

### 7.3 Skill markdown 报告模板 `[MVP]`

```markdown
# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：{url} ｜ **市场**：{market} ｜ **标准**：geo_audit_standard v0.5.1 ｜ {timestamp}

## 总览
**{total}/100 · {level}（{level_desc}）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：{key_risks}

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | {D1} | 20% | {D1_issues} |
| D2 内容可读性+meso+micro | {D2} | 20% | {D2_issues} |
| D3 权威信号（部分）| {D3} | 25% | {D3_issues} |
| D4 可引用性（部分）| {D4} | 25% | {D4_issues} |
| D5 技术抓取基建 | {D5} | 10% | {D5_issues} |

{coupling_flags_block}
{veto_block}

## ⚠️ 本次未评估（需 Deep 审计）
{notEvaluated_list}

## ✅ Top 3 立即可行整改
1. **[{topFix1.dimension}] {topFix1.action}** — {topFix1.rationale}（{effort}）
2. ...
3. ...

## 下一步
{deepAuditRecommended ? "建议 Deep 审计：" + deepAuditRationale : "站内信号良好，可暂不做 Deep"}
> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。
```

### 7.4 Web 可视化 `[Phase 2]`

同一 JSON 渲染为：5 维雷达图 + 维度卡片（分数+问题+整改）+ Top3 高亮 + Deep CTA。设计交付走美龙（Designer）+ 前端工程，本 PRD 只约束**数据来源 = AuditReport JSON，不另起判断逻辑**。

### 7.5 报告渲染策略（HTML vs markdown）— King 决策落盘

> **背景**：King review 提问"报告用 HTML 更美观吧，在 md 基础上再做一个 HTML？还是直接 HTML？"

**结论：不是"md 还是 html"二选一，而是"JSON 为唯一真源，按消费场景渲染多形态"。** `AuditReport` JSON 是核心产物，md / html 都只是它的无逻辑渲染器（renderer），互不重复判断。三个渲染目标：

| 渲染形态 | 消费场景 | 批次 | 说明 |
|----------|----------|------|------|
| **markdown** | skill 在 Claude Code 对话内即时阅读 | `[MVP]` | 对话/终端环境只能渲染 markdown，HTML 不渲染。skill 主输出必须是 md。|
| **standalone HTML 报告** | 客户交付 / 分享 / 存档（美观）| **`[MVP]`** | 自包含单文件 HTML（内联 CSS，无外部依赖），含 5 维雷达图 + 维度卡片 + Top3。skill 跑完**额外写出一个 `.html` 文件**作为可分享交付物。这是 King 要的"更美观"形态。|
| **web 报告页** | 官网功能页内嵌 | `[Phase 2]` | §7.4，复用同一 HTML 渲染内核。|

**MVP 决策**：skill 形态 **markdown（对话内）+ standalone HTML 文件（交付物）双出**。理由——
1. 对话内必须 md（HTML 不在 Claude Code 渲染）；
2. Daimonia 给客户交付审计报告，美观的单文件 HTML 有真实业务价值（可直接发客户/存档），优于让客户读 md；
3. 两者都是 JSON 的纯渲染，HTML 渲染内核（§7.4 web 版）与 standalone HTML 共用，Phase 2 web 端零重写。

HTML 视觉设计走美龙；本 PRD 只锁定**数据契约 = AuditReport JSON，渲染层不重判**。standalone HTML 参考 gstack `/design-html` 的 Pretext-native 自包含产物风格（单文件、文本可 reflow、零外部依赖）。

---

## 8. 系统架构（双形态解耦）

### 8.1 分层

```
┌─────────────────────────────────────────────┐
│  前端形态层 (Frontend Adapters)               │
│  ┌────────────────────┐  ┌──────────────────┐ │
│  │ /prism-geo-audit   │  │ 官网功能页        │ │
│  │ skill (MVP)        │  │ web UI (Phase 2) │ │
│  └─────────┬──────────┘  └────────┬─────────┘ │
│            └──────────┬───────────┘           │
└───────────────────────┼───────────────────────┘
                        ▼  统一接口 auditLight(input)
┌─────────────────────────────────────────────┐
│  Prism Core (审计引擎, 形态无关)              │
│  ┌─────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ Collector│→│ Analyzer │→│ Scorer/Reporter│ │
│  │ (采集)   │ │ (判断)   │ │ (打分/组装)     │ │
│  └─────────┘ └──────────┘ └────────────────┘ │
│  内嵌：§5.A 流程 + D1-D5 检查项 + §1.3 后端表 │
└────────────────────┬──────────────────────────┘
                     ▼
┌─────────────────────────────────────────────┐
│  采集工具层 (Collectors, 可替换)              │
│  HTTP fetch · robots/sitemap parser ·         │
│  HTML/JSON-LD extractor · CWV (PageSpeed API)│
└─────────────────────────────────────────────┘
```

### 8.2 Core 统一接口（实现契约）

```ts
type Market = 'international' | 'china' | 'both';
interface AuditInput { url: string; market: Market; }
interface AuditOptions { onProgress?(stage: string, pct: number): void; }

// MVP 实现
function auditLight(input: AuditInput, opts?: AuditOptions): Promise<AuditReport>;

// Phase 3 同签名扩展，预留 — Deep 商业化形态 = agent 全自动（King 决策）
// auditDeep 由 agent orchestration 驱动（多引擎实测采样 + earned media 调研 + 跨 query 稳定性），
// 输出同一 AuditReport 结构（auditTier:"deep"，填充 Light 标 notEvaluated 的子项）。
function auditDeep(input: AuditInput, opts?: AuditOptions): Promise<AuditReport>;
```

- **两个前端只调这一个函数**，不得各自实现采集/打分。skill 形态在 agent 运行时执行（采集靠 agent 的 fetch/browse 能力 + 内嵌检查清单驱动 LLM 判断）；web 形态在后端 worker 执行（采集靠服务端 HTTP/headless）。
- **三阶段内部解耦**：Collector（确定性采集，产 `RawSiteData`）→ Analyzer（LLM + 规则判断，产 per-check `CheckResult`）→ Scorer/Reporter（确定性聚合，产 `AuditReport` + 渲染 markdown / standalone HTML）。判断逻辑集中在 Analyzer，便于方法论升版本时单点修改。
- **Deep 全自动架构预留（King 决策）**：Deep 审计未来定位为 **agent 全自动**（非人工交付）。core 接口为此预留 `auditDeep` 同签名扩展点 + `AuditReport.auditTier` 字段，且 Light 的 `notEvaluated` 项与 Deep 的可填充子项一一对应——保证 Deep agent 落地时直接复用 Light 的数据结构与渲染层，不重构。MVP 不实现 `auditDeep`，仅锁定其接口形状。

### 8.3 Skill vs Web 实现差异

| 关注点 | skill `[MVP]` | web `[Phase 2]` |
|--------|---------------|------------------|
| 采集执行 | agent fetch/browse 工具 | 服务端 HTTP + headless 渲染 |
| LLM 判断 | 当前 agent 模型 | 服务端调 Claude API |
| 并发/队列 | 无（单次交互）| 任务队列 + jobId 轮询 |
| 输出 | markdown 入对话 | JSON → 可视化 HTML |
| 共享 | **§5.A 检查清单 + 打分规则 + report schema（同一份规格）** | 同左 |

> MVP 阶段 core 以「SKILL.md 内嵌规格 + 轻量脚本工具」形式落地；Phase 2 抽出独立 service 模块时，**打分规则与 report schema 不变**（这是解耦能成立的前提）。

---

## 9. 自包含技术方案（不依赖外部 skill）

### 9.1 自包含清单

Prism 资产内必须自带（不运行时依赖 `Daimonia/00_OS/` 或其它 skill）：
1. **§5.A Light 流程 + D1–D5 检查项全文**（精简执行版，内嵌 SKILL.md / core 数据）。
2. **打分规则**（§3 6 档 / 权重 / 一票否决 / 耦合）。
3. **§1.3 中国 LLM 后端事实表 + §6.2 交叉表**（china 市场判断用）。
4. **引擎 bot UA 清单**（§6 D5 核查用）。
5. **report schema + 渲染模板**。

### 9.2 工具依赖（采集层，外部但通用）

| 用途 | 工具 | 备注 |
|------|------|------|
| 页面抓取 | HTTP client / agent fetch / headless | robots 遵守见 §10 |
| robots/sitemap 解析 | 内置 parser | 确定性 |
| schema.org 校验 | 内置 JSON-LD 抽取 + 规则校验（可选 Google Rich Results Test 兜底）| |
| Core Web Vitals | Google PageSpeed Insights API | API key 由维龙申请（见 §13 enabler 任务）；无 key 时先用 keyless 低配额 / 启发式占位，失败降级（§10）|
| HTML→文本 / 删 CSS 可读性 | 内置 DOM 处理 | D2 视觉脱钩用 |

> 工具是"可替换采集器"，非"被依赖的 skill"——符合自包含原则。

---

## 10. 错误处理

| 场景 | 处理策略 | 报告体现 |
|------|----------|----------|
| URL 不可达 / DNS 失败 / 超时 | 重试 1 次（https→http）；仍失败则**终止**，返回 error report | `meta.error="unreachable"`，给排查提示 |
| robots.txt 禁止我方抓取 | 尊重 robots；仅用公开站级文件评 D5，内容维度标 `na` | D5 可评，D1/D2/D4 标 `na` + "robots 限制，建议授权审计" |
| CSR 空壳（view-source 无内容）| D5 照评 + **D1 渲染模式判 CSR 风险**；内容维度提示"需可执行 JS 抓取，Light 仅给 D5+渲染告警" | `couplingFlags: csr_empty_html`；询问是否仅出 D5 |
| D5 < 60 一票否决 | 出 L0 结论，**仍跑完其余维度供整改参考**但等级锁 L0 | veto 块显式说明 |
| 登录/付费墙 | 不绕过；标 `na` + "需授权后 Deep 审计" | |
| 非 HTML（PDF/纯 JSON API）| 终止，提示"Prism 审计 HTML 网站" | |
| 站点过大（>1000 页）| 不全量爬，抽样评估（§5.4）+ 报告注明"基于抽样" | `meta.sampledPages` |
| PageSpeed API 失败/限流 | D5 的 CWV 子项标 `partial`，用其它 D5 项打分，标"CWV 未取到" | 不阻塞整体 |
| LLM 判断步骤失败 | 该维度重试 1 次；仍失败标 `partial` + 降级为规则判断 | 维度 `partial=true` |
| 部分维度失败 | **永不整体崩**：core 返回 partial AuditReport，失败维度标 `na/partial` | 总分按可评维度重算并提示偏差 |

**原则**：core 对前端的契约是"尽力而为 + 永远返回结构化结果"，绝不抛裸异常给用户。所有降级都在 report 里透明标注。

---

## 11. 性能要求

| 指标 | skill `[MVP]` | web `[Phase 2]` |
|------|---------------|------------------|
| 单次 Light 审计墙钟 | p50 ≤ 6 min / p95 ≤ 12 min（agent 步数受限）| p50 ≤ 90s / p95 ≤ 180s（自动化）|
| 进度反馈 | 每维度 emit 一次（≤ 5 次静默间隔）| 进度条/SSE，≤ 3s 一次心跳 |
| 页面抽样上限 | ≤ 5 页 + 站级文件 | 同 |
| 外部 API 超时 | 单请求 ≤ 15s，整体硬上限 ≤ 15 min | 单请求 ≤ 10s，整体 ≤ 5 min |
| 并发（web）| — | MVP 后端 ≥ 10 并发 job；同 URL 1h 内缓存复用 |
| 资源 | — | 单 job 内存 ≤ 512MB |

> 说明：方法论 §5.A 标"Light ~20–30 分钟"是**人工审计**耗时；Prism 自动化后目标显著低于此。skill 形态受 agent 交互节奏限制，放宽到分钟级；web 自动化目标秒级。

---

## 12. 验收标准

### 12.1 MVP 功能验收

- [ ] `/prism-geo-audit <url>` 对 5 个真实站点（1 个 YMYL、1 个 Niche、1 个 CSR、1 个 robots 受限、1 个标杆站）跑通，各出符合 §7.3 模板的报告。
- [ ] report JSON 通过 §7.1 schema 校验（必含 §7.2 五要素）。
- [ ] D5 < 60 的站正确触发 L0；YMYL 站正确标 YMYL 风险。
- [ ] 缺 `/llms.txt` 的站 D2 正确 −10。
- [ ] 所有 §10 错误场景至少各有 1 个 case 验证降级不崩。
- [ ] `notEvaluated` 永远列出 4 项 Deep 专属（不隐瞒 Light 局限）。
- [ ] skill 跑完同时产出 markdown（对话内）+ standalone HTML 文件（§7.5），HTML 单文件可离线打开、含雷达图与维度卡片、无外部依赖。

### 12.2 方法论一致性验收

- [ ] 同一站点人工按 §5.A 跑一遍 Light，与 Prism 输出**维度分差 ≤ 1 档**（±20 分内）。
- [ ] 权重计算与 §3.2 公式逐位一致。

### 12.3 架构验收

- [ ] core `auditLight` 接口被 skill 调用，**无打分逻辑泄漏到渲染层**（渲染层只读 JSON）。
- [ ] 打分规则/检查清单/schema 为单一来源，skill 与（未来）web 不重复实现。

---

## 13. 里程碑与下游任务拆分

> PRD v1.1 已通过 King review，付龙按下表拆 child issue（建在 `daimonia-prism` project，继承 projectId）。依赖：T1 解仓库阻塞，T2–T6 为 MVP 核心建设，T7 为 Phase 1.1。

| # | 任务 | 建议 owner | 难度 | 依赖 |
|---|------|------------|------|------|
| T0 | enabler：PageSpeed Insights API key 申请（keyless/启发式兜底）| 维龙 | 低 | — |
| T1 | 仓库脚手架 `daimonia-prism`（repo + docs/ 迁入本 PRD）| 发龙 | 低 | — |
| T2 | Prism core 数据结构 + report schema + 打分器（Scorer/Reporter）| 产龙 | 中 | T1 |
| T3 | Collector 工具层（fetch/robots/sitemap/schema/CWV）| 码龙 | 中 | T1 |
| T4 | Analyzer：D1–D5 检查项 → CheckResult（内嵌 §5.A 清单）| 产龙 | 高 | T2 |
| T5 | `/prism-geo-audit` SKILL.md + markdown + standalone HTML 渲染（§7.3/§7.5）| 产龙 | 中 | T2,T4 |
| T5b | standalone HTML 报告视觉设计（雷达图 + 卡片，单文件自包含）| 美龙 | 中 | T2 |
| T6 | §10 错误处理 + §12 验收用例集 | 质龙 | 中 | T4,T5 |
| T7 | `[Phase 1.1]` china 市场逻辑（§6.3，含小红书点点）| 产龙 | 高 | T4 |

**维护流程（自包含的代价）**：`geo_audit_standard.md` 升版本时，须人工起 child issue 把变更同步进 Prism 内嵌规格（§9.1 五项），并 bump `prismVersion` + report 里的 `standardVersion`。

---

## 14. 开放问题 — King 决策记录（2026-06-03，全部已拍板）

| # | 问题 | King 决策 | 落点 |
|---|------|-----------|------|
| 1 | MVP 报告语言（international 是否英文）| **默认中文即可**（含 international）| §4 / §7 |
| 2 | PageSpeed API key | **派 child issue 给维龙申请**；维龙 agent 若能自助申请则做，否则升级 King | §13 T0 |
| 3 | Deep 审计商业化形态 | **未来按 agent 全自动**，core 预留架构扩展性 | §8.2 `auditDeep` 预留 |
| 4 | 小红书点点优先级 | **纳入 Phase 1.1** | §6.2 / §13 T7 |
| 5 | 报告 HTML vs markdown（King 新增问）| **JSON 真源 + 双渲染**：skill 出 markdown（对话）+ standalone HTML（交付）| §7.5 |

---

> **状态**：PRD v1.1 已通过 King review，开放问题全部拍板。付龙按 §13 拆实现 child issue 到 `daimonia-prism` project；repo 就绪后本文件迁入 `docs/prd_v1.md`。
> **派生自** `geo_audit_standard.md` v0.5.1 + `llm_search_backend_china.md` v0.1。
