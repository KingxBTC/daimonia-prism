# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：https://nuanqing.com.cn ｜ **市场**：china ｜ **标准**：geo_audit_standard v0.5.1 ｜ 2026-06-04T08:32:18.588Z

## 总览
**94/100 · L3（优秀）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：Niche 主体 indicative 分数易虚高（Deep 审计可能下调）

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | 100 | 20% | — |
| D2 内容可读性+meso+micro | 80 | 20% | [china] 盲区引擎（内容完全抓不到）：小红书点点(P3)。仅间接可达：豆包(P0)。整改方向：豆包←douyin/toutiao；小红书点点←xiaohongshu。；GET /llms.txt → 不存在（-10）；view-source 含 JSON-LD 与分节小标题，关键短语（服务名/数据）有节奏感，但缺少明确的正文重点加粗（结论级强调）佐证，判 partial。 |
| D3 权威信号（部分） | 100 | 25% | — |
| D4 可引用性（部分） | 60 | 25% | 每节有清晰主张（服务定位、团队、数据），FAQ 提供结论先行问答，但首页整体偏品牌叙事而非一句话答案前置，判 partial。；权威主张有支撑（2000+家庭、8+年、协会职务、媒体合作、来访者反馈作论据），但首页未对每条主张展开完整论点-论据-依据链，判 partial。 |
| D5 技术抓取基建 | 100 | 10% | CWV 未取到（PageSpeed API 失败） |

## 🔻 扣分明细（为什么扣分）
> 逐项列出每个未达标/部分达标检查的客观依据（扫了哪些页/文件、命中/未命中），扣分有据可查。

### D2 内容可读性+meso+micro
- **/llms.txt 存在性与格式** · 未达标：GET /llms.txt → 不存在（-10）
- **micro 强调节制度** · 部分达标：view-source 含 JSON-LD 与分节小标题，关键短语（服务名/数据）有节奏感，但缺少明确的正文重点加粗（结论级强调）佐证，判 partial。
- **内容平台覆盖 vs LLM 可达性盲区（§6.3）** · 部分达标：盲区引擎（内容完全抓不到）：小红书点点(P3)。仅间接可达：豆包(P0)。整改方向：豆包←douyin/toutiao；小红书点点←xiaohongshu。

### D4 可引用性（部分）
- **结论明确性** · 部分达标：每节有清晰主张（服务定位、团队、数据），FAQ 提供结论先行问答，但首页整体偏品牌叙事而非一句话答案前置，判 partial。
- **Justification 论证结构** · 部分达标：权威主张有支撑（2000+家庭、8+年、协会职务、媒体合作、来访者反馈作论据），但首页未对每条主张展开完整论点-论据-依据链，判 partial。

### D5 技术抓取基建
- **Core Web Vitals（PageSpeed Insights）** · 部分达标：PageSpeed API 失败，CWV 未取到（PSI fetch 失败: fetch failed）

## ⚠️ 本次未评估（需 Deep 审计）
- D3 earned media 覆盖度（需 Deep）
- D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）
- 引擎特定层 per-engine 分数（需 Deep）
- 异常引用模式抽查（需 Deep）

> 📌 Niche 提示：当前 indicative 分数对 Niche 主体易虚高，Deep 审计可能触发 L2 封顶

## ✅ Top 3 立即可行整改
1. **[D4] 段首给结论句（可被直接引用的明确表述）** — GEO 9 方法 ROI 最高，引用可见性提升显著（中）
2. **[D2] 新增 /llms.txt（H1 + 站点定位 + 核心页链接）** — 缺失明确 -10 分，零成本快赢（低）
3. **[D4] 论点补论据与依据，形成论证链** — 低成本可改进项（中）

## 下一步
建议 Deep 审计：YMYL 领域，权威性 earned media 需 Deep 实测；Niche 主体，Light 分易虚高，Deep 可能触发封顶；D3 earned media 覆盖度 + D4 跨 query 稳定性未评，需 Deep 获得完整分数
> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。
