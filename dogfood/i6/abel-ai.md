# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：https://abel.ai ｜ **市场**：international ｜ **标准**：geo_audit_standard v0.5.1 ｜ 2026-06-04T08:31:32.289Z

## 总览
**78/100 · L2（良好）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：Niche 主体 indicative 分数易虚高（Deep 审计可能下调）

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | 100 | 20% | — |
| D2 内容可读性+meso+micro | 60 | 20% | 已扫 4 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构；view-source 抽样段以主题切换脚本为主，正文重点强调（结论级加粗）无明确佐证，判 partial。 |
| D3 权威信号（部分） | 40 | 25% | 首页为产品 landing，虽提及『Two papers that shape the work』但无具名作者/团队资质署名，E-E-A-T 作者权威信号缺失，判 poor。；正文含数字日期但无结构化时间标注 |
| D4 可引用性（部分） | 80 | 25% | 仅 4 处具体数字，统计支撑偏弱 |
| D5 技术抓取基建 | 80 | 10% | robots.txt 禁止部分 LLM bot：ClaudeBot, GPTBot, Google-Extended；CWV 未取到（PageSpeed API 失败） |

## 🔻 扣分明细（为什么扣分）
> 逐项列出每个未达标/部分达标检查的客观依据（扫了哪些页/文件、命中/未命中），扣分有据可查。

### D2 内容可读性+meso+micro
- **FAQ / Q&A 块** · 未达标：已扫 4 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构
- **micro 强调节制度** · 部分达标：view-source 抽样段以主题切换脚本为主，正文重点强调（结论级加粗）无明确佐证，判 partial。

### D3 权威信号（部分）
- **作者 / 资质标注** · 未达标：首页为产品 landing，虽提及『Two papers that shape the work』但无具名作者/团队资质署名，E-E-A-T 作者权威信号缺失，判 poor。
- **内容时间新鲜度** · 部分达标：正文含数字日期但无结构化时间标注
- **透明度（来源/披露/政策）** · 部分达标：有方法论与可验证证据（PCMCI、live causal graph、『Real money. Real timestamps』、引用 papers），但缺少明确的来源/披露/政策标注，判 partial。

### D4 可引用性（部分）
- **Statistics 使用率（具体数字/样本）** · 部分达标：仅 4 处具体数字，统计支撑偏弱

### D5 技术抓取基建
- **robots.txt 对 LLM bot 的允许策略** · 部分达标：robots.txt 禁止部分 LLM bot：ClaudeBot, GPTBot, Google-Extended
- **Core Web Vitals（PageSpeed Insights）** · 部分达标：PageSpeed API 失败，CWV 未取到（PSI fetch 失败: fetch failed）

> 🔗 耦合提示：`D1xD2_mismatch` 架构尚可但内容空

## ⚠️ 本次未评估（需 Deep 审计）
- D3 earned media 覆盖度（需 Deep）
- D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）
- 引擎特定层 per-engine 分数（需 Deep）
- 异常引用模式抽查（需 Deep）

> 📌 Niche 提示：当前 indicative 分数对 Niche 主体易虚高，Deep 审计可能触发 L2 封顶

## ✅ Top 3 立即可行整改
1. **[D4] 核心结论补具体数字/样本量/时间窗口** — GEO 9 方法 ROI 最高，引用可见性提升显著（低）
2. **[D3] 作者页补资质/机构背景/外部权威背书** — YMYL 领域权威要求高，影响 D3（中）
3. **[D2] 核心问题做结构化 FAQ 块（建议加 FAQPage schema）** — 当前明确缺失，修复 ROI 高（低）

## 下一步
建议 Deep 审计：Niche 主体，Light 分易虚高，Deep 可能触发封顶；D3 earned media 覆盖度 + D4 跨 query 稳定性未评，需 Deep 获得完整分数
> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。
