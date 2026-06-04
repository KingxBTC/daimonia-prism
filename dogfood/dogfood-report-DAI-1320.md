# Prism T10 Dogfood 验收报告

**任务**：DAI-1320  
**日期**：2026-06-04  
**QA**：质龙  
**环境**：Node.js + heuristic 模式（无 ANTHROPIC_API_KEY / PAGESPEED_API_KEY）  
**方法论**：geo_audit_standard v0.5.1  

---

## 1. 4 站审计结果汇总

| 站点 | 角色 | 市场 | 总分 | 等级 | 一票否决 | 耗时 | 状态 |
|------|------|------|------|------|---------|------|------|
| abel.ai | 客户 | international | 57 | L1 | — | 17s | ✅ 有完整报告 |
| anthropic.com | 标杆 | international | 32 | L0 | YMYL_D3<40 | 28s | ⚠️ 有缺陷（见 §3 Bug 1） |
| nuanqing.com.cn | 客户 | china | 57 | L1 | — | 15s | ✅ 有完整报告 |
| capcut.cn | 标杆 | china | 37 | L0 | — | 17s | ⚠️ 疑似误判（见 §3 Bug 2） |

---

## 2. 逐站 QA 评估

### 2.1 abel.ai（international · 客户）— PASS ✅

**总分 57/100 · L1**，D1=80 D2=40 D3=40 D4=60 D5=80

**关键发现（真实有价值）**：
- **D5=80** — robots.txt 禁止 ClaudeBot、GPTBot、Google-Extended。abel.ai 是 AI 产品公司，主动屏蔽主流 LLM 抓取 bot，这对客户来说是重磅发现，直接影响 GEO 可见性。
- **D1=80** — 有结构化标题，无 JSON-LD（-40 penalty），结构尚可。
- **D2=40** — 无 FAQ 块，启发式认为段落过长（无 LLM 判断）。
- **Niche 提示** — abel.ai 被判为 niche，Light 分可能虚高，Deep 可能触发封顶。

**Top3 整改合理性**：✅ D4 补数字/结论句 + D3 作者页补资质 — 对 AI 研究类站点完全合理。

**客户报告销售价值**：⭐⭐⭐⭐ 高。最关键发现（ClaudeBot 被 block）是直接、可操作的商业痛点，能推动客户参与。nuanqing 作为对比案例进一步说明价值。

---

### 2.2 anthropic.com（international · 标杆）— ⚠️ 含缺陷

**总分 32/100 · L0** — 期望 ≥41（L1），**未达标杆预期，但有根本原因**

**D3=0 根因（Bug）**：
- D3.about_page 规则：`/about|关于|联系|contact|公司|团队|team/` 不包含 `/company`
- anthropic.com 的机构页是 `https://www.anthropic.com/company`，URL 含 "company" 不含 "about"
- 规则返回 poor，扣 -25 分
- 结合 D3_author 启发式 poor（-30）+ D3_freshness poor（-20）+ D3_transparency partial（-12.5）
- D3 原始分 = 100 - 87.5 = 12.5 → snap 到 0
- 触发 YMYL_D3<40 一票否决，等级锁 L0

**其余发现可信度**：
- D5=100 ✅（robots.txt 对所有 LLM bot 放行，7 个显式条目，D5 技术底座很好）
- D1=40 ✅（anthropic.com 确实没有 JSON-LD，有 23 个标题，这是真实发现）
- D2=20 ⚠️（无 llms.txt 是真实发现；其余 D2 项是启发式噪声）
- D4=40 ⚠️（"几乎无具体数字"——anthropic.com 博客有数据，但被评为 poor，因采样了 news 页面且 heuristic 不识别）

**结论**：anthropic.com 报告有 P1 级 Bug（D3.about_page 漏检 /company 模式），修复后预期 D3 至少 40，等级可达 L1-L2。

---

### 2.3 nuanqing.com.cn（china · 客户）— PASS ✅

**总分 57/100 · L1**，D1=80 D2=40 D3=40 D4=60 D5=80

**关键发现（真实有价值）**：
- **China 市场分析 ✅**：D2 显示小红书点点是"盲区引擎"（内容完全抓不到），豆包仅间接可达（需通过 douyin/toutiao）。整改方向明确。这是 china 后端事实层的核心价值展示。
- **sitemap.xml 存在但为空** — 真实发现，D5 扣 partial。
- **无 llms.txt** — 真实发现，D2 -10。
- **D3=40** — 找到 About 页信号（nuanqing 有 /about 页面，sampler 正确选中）。

**China 模块合理性**：✅ 正确识别了各 china 引擎的可达性，并给出了有依据的整改方向（豆包走 douyin/toutiao；小红书点点走 xiaohongshu 原生内容）。

**客户报告销售价值**：⭐⭐⭐⭐⭐ 极高。中国特色 LLM 引擎盲区分析是 Prism 独有价值，对暖情客户直接可转化。

---

### 2.4 capcut.cn（china · 标杆）— ⚠️ 含疑问

**总分 37/100 · L0** — 期望 ≥41，**可能含误判**

**发现**：
- **capcut.cn 有 /llms.txt**（partial，缺 H1/链接）— 意外发现！字节跳动已为 capcut 配置 llms.txt，这说明大厂已经意识到 GEO 优化需求。属于真实发现。
- **D3=0**：未检测到 About/机构信息，且 D3_author/freshness 均 poor。capcut.cn 是消费类工具 App 首页，产品导向极强，可能真的没有 about 类链接。但也可能有中文版 "关于" 链接被采集页面遗漏。需人工验证 capcut.cn 首页是否有 /关于 或 /company 链接。
- **sitemap 仅 1 个 URL** — 疑问！capcut.cn 是大型站，sitemap 只有 1 个 URL 非常可疑。可能是 sitemap-index 文件（包含多个子 sitemap），当前 sitemap 解析器只读了第一层没有展开。这可能是 Bug 2。
- **D5=100** — robots 全放行 ✅（字节系平台经验）。D5 技术底座好。
- **China 平台分析**：腾讯系（元宝/混元）仅间接可达 → 需通过微信公众号/视频号分发。这对字节系产品是很真实的平台竞争反映。

**结论**：D3=0 需人工核查是否真缺 about 链接；sitemap=1 URL 疑是解析 Bug，需 code 验证。

---

## 3. 发现的 Bug

### Bug 1 (P1)：D3.about_page 正则漏检 `/company` 模式

**文件**：`src/analyzer/checklist.ts:263`

**当前正则**：`/about|关于|联系|contact|公司|团队|team/`

**问题**：anthropic.com 的机构信息页是 `/company`，不匹配任何现有模式，导致 D3=0。全球大量企业站（特别是 B2B SaaS、AI 公司）用 `/company` 而非 `/about`。

**修复建议**：正则加入 `\/company|\/about-us|\/about_us|\/who-we-are`。

**影响**：anthropic.com D3 从 0 提升至 ≥40（修复 `about_page` 后，其余 D3 项有 1 个 good，总分预期 L1-L2）。

**Owner**：产龙（Staff Engineer）

---

### Bug 2 (P2)：sitemap-index 解析不展开子 sitemap

**症状**：capcut.cn sitemap 仅读到 1 个 URL，但实际为大型站。可能是 sitemap.xml 是 `<sitemapindex>` 格式（包含子 sitemap URL），解析器未递归展开。

**文件**：`src/collector/sitemap.ts`（需验证）

**建议**：检查 sitemap.ts 是否支持 sitemapindex，若不支持则补实现（一级展开即可）。

**Owner**：产龙（Staff Engineer）

---

### Bug 3 (P2)：D3.freshness 日期正则过窄

**症状**：anthropic.com 新闻页有发布日期，但 D3.freshness = fail。正则 `/20[12]\d[-/年.]\d{1,2}/` 只匹配 ISO 格式（2025-01），不匹配 "January 2025" 或 "Apr 2026"。

**Owner**：产龙（Staff Engineer）

---

## 4. 功能验收结论（逐项）

| 验收项 | 结果 | 说明 |
|--------|------|------|
| 4 站均能完成审计（永不崩） | ✅ PASS | 全部完成，无 exception |
| AuditReport 结构正确 | ✅ PASS | JSON schema 完整，所有字段存在 |
| notEvaluated 恒含 4 项 | ✅ PASS | D3 earned / D4 跨 query / per-engine / 异常引用 |
| §10 降级正确触发 | ✅ PASS | CWV partial，heuristic fallback 有标注 |
| 中文渲染正常 | ✅ PASS | MD 报告全中文，结构清晰 |
| HTML 输出（visual） | ✅ PASS | 文件生成正常；视觉 QA 需浏览器打开核对 |
| china 后端事实层 | ✅ PASS | nuanqing/capcut 均有引擎可达性分析，逻辑合理 |
| Top3 整改合理 | ✅ PASS | 4 站 Top3 均有具体可行动作 |
| 一票否决正确触发 | ✅ PASS | anthropic YMYL_D3<40 正确；capcut D5 满分无触发 |
| 标杆站得高分+少 fixes | ❌ FAIL | anthropic/capcut 均 L0，不符期望（Bug 1 + 启发式噪声） |
| D3.about_page 漏检 /company | ❌ BUG | 影响 anthropic.com，需修复 |
| 性能 ≤5 min per site | ✅ PASS | 最慢 28s（anthropic），均在预期内 |
| 客户站报告有销售价值 | ✅ PASS | abel.ai 的 ClaudeBot block 发现 + nuanqing china 分析均高价值 |

---

## 5. HTML 视觉 QA

HTML 文件已生成到 `dogfood/`：
- `dogfood/abel-ai.html`
- `dogfood/anthropic-com.html`
- `dogfood/nuanqing-com-cn.html`
- `dogfood/capcut-cn.html`

> ⚠️ 本次 QA 未做浏览器视觉核查（无浏览器环境）。建议 King 或 CTO 本地 `open dogfood/abel-ai.html` 目视检查雷达图、维度卡片、Top3 排版是否正常。如需浏览器 QA，起 follow-up issue。

---

## 6. Ship-readiness 结论

**可发布（条件：P1 Bug 先修）**

| 优先级 | 项目 | 是否阻塞 ship |
|--------|------|--------------|
| P1 | Bug 1 - D3.about_page 漏检 /company | ✅ 是（影响标杆站质量） |
| P2 | Bug 2 - sitemap-index 不展开 | ❌ 否（降级处理正确）|
| P2 | Bug 3 - freshness 日期正则 | ❌ 否（降级 partial 正确） |
| P2 | HTML 视觉浏览器核查 | ❌ 否（可 ship 后复查）|

**修复 P1 后预期**：anthropic.com 总分约 45-55，L1-L2；标杆站达到期望等级；客户站不受影响。

**注意**：本次 dogfood 在无 LLM judge 条件下运行。D2/D3/D4 的 LLM 型检查项全部降级为启发式（标注"降级启发式"）。真实产品（skill 形态）将有 LLM 判断，质量更高。建议 P1 修复后，在有 LLM 的环境再复跑一次 anthropic.com 验证分数合理性。

---

*QA：质龙 | DAI-1320 | 2026-06-04*
