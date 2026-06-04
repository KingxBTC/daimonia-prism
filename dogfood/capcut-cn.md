# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：https://www.capcut.cn ｜ **市场**：china ｜ **标准**：geo_audit_standard v0.5.1 ｜ 2026-06-04T06:47:43.958Z

## 总览
**37/100 · L0（严重不足）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：Niche 主体 indicative 分数易虚高（Deep 审计可能下调）

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | 40 | 20% | 全站无 JSON-LD/schema.org 标注；（降级启发式）有多级标题，结构尚可，未经 LLM 细判 |
| D2 内容可读性+meso+micro | 20 | 20% | [china] 盲区引擎（内容完全抓不到）：小红书点点(P3)。仅间接可达：豆包(P0)、腾讯元宝(P0)、腾讯混元(P2)。整改方向：豆包←douyin/toutiao；腾讯元宝←wechat_oa/wechat_channels；腾讯混元←wechat_oa/wechat_channels；小红书点点←xiaohongshu。；（降级启发式）疑似大段堆砌（平均段落过长）；未检测到结构化 FAQ/Q&A 块 |
| D3 权威信号（部分） | 0 | 25% | 未检测到 About/机构/联系信息；（降级启发式）未经 LLM 确认作者资质，保守判 poor |
| D4 可引用性（部分） | 60 | 25% | 仅 1 处具体数字，统计支撑偏弱；（降级启发式）结论明确性未经 LLM 细判，暂记 partial |
| D5 技术抓取基建 | 100 | 10% | CWV 未取到（PageSpeed API 失败） |

## ⚠️ 本次未评估（需 Deep 审计）
- D3 earned media 覆盖度（需 Deep）
- D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）
- 引擎特定层 per-engine 分数（需 Deep）
- 异常引用模式抽查（需 Deep）

> 📌 Niche 提示：当前 indicative 分数对 Niche 主体易虚高，Deep 审计可能触发 L2 封顶

## ✅ Top 3 立即可行整改
1. **[D4] 核心结论补具体数字/样本量/时间窗口** — GEO 9 方法 ROI 最高，引用可见性提升显著（低）
2. **[D4] 段首给结论句（可被直接引用的明确表述）** — GEO 9 方法 ROI 最高，引用可见性提升显著（中）
3. **[D2] 新增 /llms.txt（H1 + 站点定位 + 核心页链接）** — 缺失明确 -10 分，零成本快赢（低）

## 下一步
建议 Deep 审计：Niche 主体，Light 分易虚高，Deep 可能触发封顶；综合得分偏低，整改空间大，Deep 可精准定位优先项；D3 earned media 覆盖度 + D4 跨 query 稳定性未评，需 Deep 获得完整分数
> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。
