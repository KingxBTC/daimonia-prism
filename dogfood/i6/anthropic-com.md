# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：https://anthropic.com ｜ **市场**：international ｜ **标准**：geo_audit_standard v0.5.1 ｜ 2026-06-04T08:32:04.882Z

## 总览
**55/100 · L1（偏弱）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：无重大一票否决风险；详见各维度问题

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | 60 | 20% | 全站无 JSON-LD/schema.org 标注（已扫 4 页，0 命中） |
| D2 内容可读性+meso+micro | 20 | 20% | 已扫 4 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构；GET /llms.txt → 不存在（-10） |
| D3 权威信号（部分） | 60 | 25% | 首页无具名作者署名（公司主体 public benefit corporation 描述，非内容作者资质），E-E-A-T 作者信号缺失，判 poor。；正文含英文自然语言日期但无结构化时间标注 |
| D4 可引用性（部分） | 40 | 25% | 首页正文未检测到具体数字/统计量（0 处）；标语明确（『AI research and products that put safety at the frontier』）、发布公告清晰，但首页偏公告流而非结论先行问答，判 partial。 |
| D5 技术抓取基建 | 100 | 10% | CWV 未取到（PageSpeed API 失败） |

## 🔻 扣分明细（为什么扣分）
> 逐项列出每个未达标/部分达标检查的客观依据（扫了哪些页/文件、命中/未命中），扣分有据可查。

### D1 结构化语义+宏观架构
- **JSON-LD / schema.org 标注** · 未达标：全站无 JSON-LD/schema.org 标注（已扫 4 页，0 命中）

### D2 内容可读性+meso+micro
- **FAQ / Q&A 块** · 未达标：已扫 4 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构
- **/llms.txt 存在性与格式** · 未达标：GET /llms.txt → 不存在（-10）
- **段落/列表/表格语义结构** · 部分达标：首页以重复导航 chrome 为主（『Try Claude / Download app』多次重复），正文以发布卡短描述为主，meso 结构偏薄，判 partial。
- **micro 强调节制度** · 部分达标：view-source 抽样以 anti-flicker/intellimize 脚本为主，正文结论级强调无明确佐证，判 partial。
- **self-contained 自足性** · 部分达标：发布卡描述可独立引用（『Claude Opus 4.8 — An upgrade to Opus across coding, agentic tasks…』），但首页大量被导航重复淹没，整体自足性受限，判 partial。
- **删 CSS 可读性** · 部分达标：文本/HTML 占比偏低（1.7%）

### D3 权威信号（部分）
- **作者 / 资质标注** · 未达标：首页无具名作者署名（公司主体 public benefit corporation 描述，非内容作者资质），E-E-A-T 作者信号缺失，判 poor。
- **内容时间新鲜度** · 部分达标：正文含英文自然语言日期但无结构化时间标注

### D4 可引用性（部分）
- **Statistics 使用率（具体数字/样本）** · 未达标：首页正文未检测到具体数字/统计量（0 处）
- **结论明确性** · 部分达标：标语明确（『AI research and products that put safety at the frontier』）、发布公告清晰，但首页偏公告流而非结论先行问答，判 partial。
- **Justification 论证结构** · 部分达标：首页提出安全使命主张但作为 hub 外链展开论证，页面本身论点-论据-依据链不完整，判 partial。

### D5 技术抓取基建
- **Core Web Vitals（PageSpeed Insights）** · 部分达标：PageSpeed API 失败，CWV 未取到（PSI fetch 失败: fetch failed）

> 🔗 耦合提示：`D1xD2_mismatch` 架构尚可但内容空；`D4xD2_micro` micro 强调/语义偏弱，可引用单元难以被独立摘取

## ⚠️ 本次未评估（需 Deep 审计）
- D3 earned media 覆盖度（需 Deep）
- D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）
- 引擎特定层 per-engine 分数（需 Deep）
- 异常引用模式抽查（需 Deep）

## ✅ Top 3 立即可行整改
1. **[D4] 核心结论补具体数字/样本量/时间窗口** — GEO 9 方法 ROI 最高，引用可见性提升显著（低）
2. **[D4] 段首给结论句（可被直接引用的明确表述）** — GEO 9 方法 ROI 最高，引用可见性提升显著（中）
3. **[D2] 新增 /llms.txt（H1 + 站点定位 + 核心页链接）** — 缺失明确 -10 分，零成本快赢（低）

## 下一步
建议 Deep 审计：YMYL 领域，权威性 earned media 需 Deep 实测；综合得分偏低，整改空间大，Deep 可精准定位优先项；D3 earned media 覆盖度 + D4 跨 query 稳定性未评，需 Deep 获得完整分数
> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。
