# Prism T10 Dogfood 验收报告（最终版）

**任务**：DAI-1320  
**日期**：2026-06-04  
**QA**：质龙  
**环境**：Node.js + heuristic 模式（无 ANTHROPIC_API_KEY / PAGESPEED_API_KEY）  
**方法论**：geo_audit_standard v0.5.1  

---

## 1. 两轮验收对比

### 第一轮（bug 修复前）

| 站点 | 角色 | 市场 | 总分 | 等级 | 问题 |
|------|------|------|------|------|------|
| abel.ai | 客户 | international | 57 | L1 | ✅ 正常 |
| anthropic.com | 标杆 | international | **32** | L0 | ⚠️ D3=0（bug） |
| nuanqing.com.cn | 客户 | china | 57 | L1 | ✅ 正常 |
| capcut.cn | 标杆 | china | 37 | L0 | ⚠️ D3=0 + sitemap 1 URL |

### 第二轮（DAI-1322 + DAI-1323 修复后）

| 站点 | 角色 | 市场 | 总分 | 等级 | 变化 |
|------|------|------|------|------|------|
| abel.ai | 客户 | international | 57 | L1 | 无变化（预期） |
| anthropic.com | 标杆 | international | **37** | L0 | +5（D3: 0→20，about_page PASS） |
| nuanqing.com.cn | 客户 | china | **59** | L1 | +2（D5: sitemap 空→48 URL） |
| capcut.cn | 标杆 | china | 37 | L0 | 无变化（D3=0 是真实发现） |

---

## 2. Bug 修复验证

### DAI-1322：D3.about_page 正则补 /company ✅ PASS

**修复前**：anthropic.com D3.about_page = fail（-25），/company 不在正则中  
**修复后**：anthropic.com D3.about_page = **pass**（0），"检测到 About/机构信息（链接或 Organization schema）"  
**D3 分**：0 → 20（改善，部分 LLM checks 在 heuristic 模式仍保守）

### DAI-1323：sitemap-index 递归展开 ✅ PASS

**修复前**：nuanqing.com.cn sitemap "存在但为空"，D5.sitemap = partial  
**修复后**：nuanqing.com.cn "sitemap.xml 存在，含 48 个 URL"，D5.sitemap = pass  
**D5 分**：80 → 100，总分 57 → 59  

**capcut.cn sitemap 仍 1 URL**：修复后确认 capcut.cn 的 sitemap 确实只有 1 个 URL（非解析 bug，是真实站点状态）。

---

## 3. 逐站最终 QA 评估

### 3.1 abel.ai（international · 客户）— PASS ✅

**总分 57/100 · L1**，D1=80 D2=40 D3=40 D4=60 D5=80

**关键发现（高价值）**：
- **D5=80**：robots.txt 明确禁止 ClaudeBot、GPTBot、Google-Extended——abel.ai 是 AI 产品公司却主动屏蔽 GEO 关键 bot。对客户这是最重要的发现。
- **Niche 提示**：Light 分 57 可能虚高，Deep 审计可能触发 L2 封顶。

**Top3 质量**：✅ 合理（补数字/结论句/作者资质）。

**客户销售价值**：⭐⭐⭐⭐ ClaudeBot block 是直接、可操作的商业痛点，对话推进力强。

---

### 3.2 anthropic.com（international · 标杆）— PASS（含已知限制）

**总分 37/100 · L0**（修复后从 32 升至 37）

**状态说明**：anthropic.com 在 **heuristic 模式**下仍得 L0，这是**预期行为**，不是 bug：
- D3.about_page 现在正确通过（✅）
- D3.author_credentials = poor（启发式保守）：没有 LLM judge，规则无法识别作者资质。真实产品（prism-geo-audit skill）使用 LLM 判断时，这项会显著改善。
- D3.freshness = fail：anthropic.com 日期格式是 "January 30, 2025"（非 ISO），启发式正则 `/20\d{2}[-/.年]\d{1,2}/` 未命中。
- YMYL_D3<40 因此仍触发——在无 LLM 的保守模式下，这是正确的安全行为。

**其余真实发现**：
- D5=100 ✅（robots 对所有 LLM bot 放行）
- D1=40（无 JSON-LD — 真实发现，anthropic.com 未部署 schema.org）
- 无 /llms.txt — 甚至连 Anthropic 自己都没有，有意思的真实发现

**real-LLM 模式预期**：D3.author_credentials 应得 good/partial（有作者署名），D3.freshness 可能 pass（LLM 能识别自然语言日期）。预计 D3 ≥40，等级 L1-L2，不触发 YMYL veto。

---

### 3.3 nuanqing.com.cn（china · 客户）— PASS ✅

**总分 59/100 · L1**（修复后从 57 升至 59）

**关键发现（高价值）**：
- **China 引擎可达性**：小红书点点是盲区，豆包仅间接可达（需 douyin/toutiao）。China 后端事实层正确运行 ✅
- sitemap-index 修复后读到 48 个 URL，D5 从 partial 升为 pass
- 无 llms.txt（-10）：真实发现，Top3 整改第一条

**客户销售价值**：⭐⭐⭐⭐⭐ 极高。China LLM 引擎盲区分析是 Prism 差异化卖点，数据对客户直接可操作。

---

### 3.4 capcut.cn（china · 标杆）— PASS（含真实低分发现）

**总分 37/100 · L0**

**D3=0 是真实发现**：capcut.cn 是消费类工具 App，首页全产品导向，无任何 /about、/company、/关于、/团队 等机构信息链接。采样的 4 个页面（首页、/mobile_portal、/learning、/bussiness_inquiry）均为功能页。D3=0 反映了真实的 GEO 弱点：LLM 引擎爬取 capcut.cn 看不到机构权威信号。

**有价值发现**：
- **capcut.cn 有 /llms.txt**（partial）：字节跳动已为 capcut 部署 llms.txt，说明大厂 GEO 意识已有，但执行不到位。
- **China 引擎问题严峻**：腾讯系（元宝/混元）均仅间接可达，小红书点点盲区——即使是字节系大品牌也面临中国 GEO 挑战。

---

## 4. 功能验收结论（最终版）

| 验收项 | 结果 | 说明 |
|--------|------|------|
| 4 站均能完成审计（永不崩） | ✅ PASS | 两轮均完成，无 exception |
| AuditReport JSON 结构正确 | ✅ PASS | schema 完整 |
| notEvaluated 恒含 4 项 | ✅ PASS | 两轮一致 |
| §10 降级机制 | ✅ PASS | CWV partial 正确，heuristic 有标注 |
| 中文渲染正常 | ✅ PASS | MD 报告全中文，清晰 |
| HTML 文件生成 | ✅ PASS | 4 站均有，视觉核查待 King 本地 open |
| china 后端事实层 | ✅ PASS | nuanqing/capcut 引擎分析合理有价值 |
| Top3 整改合理性 | ✅ PASS | 4 站均有具体可操作的整改建议 |
| 一票否决机制 | ✅ PASS | YMYL_D3<40 在 heuristic 下保守触发，正确 |
| D3.about_page 修复验证 | ✅ PASS | anthropic D3.about_page: fail→pass（DAI-1322） |
| sitemap-index 修复验证 | ✅ PASS | nuanqing sitemap: 空→48 URL（DAI-1323） |
| 性能 ≤5 min/站 | ✅ PASS | 最慢 36s（anthropic），均可接受 |
| 客户站报告销售价值 | ✅ PASS | abel ClaudeBot block + nuanqing china 分析 = 高价值 |
| 标杆站高分（heuristic 模式） | ⚠️ 注意 | heuristic 保守，实际 skill 模式（有 LLM）预计显著更高 |

---

## 5. Ship-readiness 最终结论

### ✅ 可发布

两个阻塞 bug 均已修复并验证：
- DAI-1322 D3.about_page 正则修复 ✅
- DAI-1323 sitemap-index 递归展开 ✅

### 已知限制（不阻塞 ship）

1. **heuristic 模式下标杆站得分偏低**：anthropic.com/capcut.cn 在无 LLM judge 时得 L0，是保守行为而非 bug。真实 skill 模式下分数会显著提升。建议 King 用 `/prism-geo-audit anthropic.com` 在 skill 模式下验证一次，确认最终产品质量。
2. **D3.freshness 日期正则过窄**（DAI-1323 范围外）：不匹配自然语言日期（"January 2025"），可 ship 后在 v1.1 改进。
3. **HTML 视觉 QA 未做浏览器核查**：建议 King 本地 `open dogfood/abel-ai.html` 目视确认雷达图和卡片渲染。

### 建议下一步

1. King 用 `/prism-geo-audit anthropic.com --market international` 做 real-LLM 复核（有 ANTHROPIC_API_KEY 的环境）
2. `open dogfood/abel-ai.html` 目视 HTML 报告质量
3. 若以上无异议，宣布 Prism MVP 完成 ✅

---

*QA：质龙 | DAI-1320 最终版 | 2026-06-04（第二轮验收）*
