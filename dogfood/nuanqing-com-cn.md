# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：https://nuanqing.com.cn ｜ **市场**：china ｜ **标准**：geo_audit_standard v0.5.1 ｜ 2026-06-04T07:13:46.317Z

## 总览
**59/100 · L1（偏弱）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：YMYL 主体但站内权威信号偏弱，LLM 引用门槛高；Niche 主体 indicative 分数易虚高（Deep 审计可能下调）

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | 80 | 20% | （降级启发式）有多级标题，结构尚可，未经 LLM 细判 |
| D2 内容可读性+meso+micro | 40 | 20% | [china] 盲区引擎（内容完全抓不到）：小红书点点(P3)。仅间接可达：豆包(P0)。整改方向：豆包←douyin/toutiao；小红书点点←xiaohongshu。；（降级启发式）疑似大段堆砌（平均段落过长）；GET /llms.txt → 不存在（-10） |
| D3 权威信号（部分） | 40 | 25% | （降级启发式）未经 LLM 确认作者资质，保守判 poor；（降级启发式）透明度未经 LLM 细判，暂记 partial |
| D4 可引用性（部分） | 60 | 25% | （降级启发式）结论明确性未经 LLM 细判，暂记 partial；（降级启发式）论证结构未经 LLM 细判，暂记 partial |
| D5 技术抓取基建 | 100 | 10% | CWV 未取到（PageSpeed API 失败） |

> 🔗 耦合提示：`D1xD2_mismatch` 架构尚可但内容空

## ⚠️ 本次未评估（需 Deep 审计）
- D3 earned media 覆盖度（需 Deep）
- D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）
- 引擎特定层 per-engine 分数（需 Deep）
- 异常引用模式抽查（需 Deep）

> 📌 Niche 提示：当前 indicative 分数对 Niche 主体易虚高，Deep 审计可能触发 L2 封顶

## ✅ Top 3 立即可行整改
1. **[D4] 段首给结论句（可被直接引用的明确表述）** — GEO 9 方法 ROI 最高，引用可见性提升显著（中）
2. **[D2] 新增 /llms.txt（H1 + 站点定位 + 核心页链接）** — 缺失明确 -10 分，零成本快赢（低）
3. **[D3] 作者页补资质/机构背景/外部权威背书** — YMYL 领域权威要求高，影响 D3（中）

## 下一步
建议 Deep 审计：YMYL 领域，权威性 earned media 需 Deep 实测；Niche 主体，Light 分易虚高，Deep 可能触发封顶；综合得分偏低，整改空间大，Deep 可精准定位优先项；D3 earned media 覆盖度 + D4 跨 query 稳定性未评，需 Deep 获得完整分数
> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。
