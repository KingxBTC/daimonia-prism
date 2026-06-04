# 🔍 Prism GEO 审计报告（Light · indicative）
**站点**：https://www.capcut.cn ｜ **市场**：china ｜ **标准**：geo_audit_standard v0.5.1 ｜ 2026-06-04T08:32:37.145Z

## 总览
**39/100 · L0（严重不足）** ⚠️ indicative，Deep 审计后可能下调
> 关键风险：Niche 主体 indicative 分数易虚高（Deep 审计可能下调）

## 五维度
| 维度 | 分数 | 权重 | 主要问题 |
|------|------|------|----------|
| D1 结构化语义+宏观架构 | 40 | 20% | 全站无 JSON-LD/schema.org 标注（已扫 4 页，0 命中）；仅 1 个 H1 + 3 个 H2（更多AI智能工具/专业剪辑/全能易用），章节树极浅，按功能类目分块但层级单薄，判 partial。 |
| D2 内容可读性+meso+micro | 40 | 20% | [china] 盲区引擎（内容完全抓不到）：小红书点点(P3)。仅间接可达：豆包(P0)、腾讯元宝(P0)、腾讯混元(P2)。整改方向：豆包←douyin/toutiao；腾讯元宝←wechat_oa/wechat_channels；腾讯混元←wechat_oa/wechat_channels；小红书点点←xiaohongshu。；已扫 4 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构；正文为功能名+一句话描述的营销罗列（『智能抠像 — 智能识别人像并抠除背景』），有列表感但无真正段落/表格组织，判 partial。 |
| D3 权威信号（部分） | 0 | 25% | 已扫 5 条内部链接 + 4 页 JSON-LD，未发现 About/机构页或 Organization schema；无任何作者署名，仅页脚公司主体（深圳市脸萌科技/字节跳动），E-E-A-T 作者资质信号缺失，判 poor。 |
| D4 可引用性（部分） | 40 | 25% | 纯功能断言无论证支撑（『电影级质感』『录音棚音质』等主张无论据/依据），论点-论据-依据链缺失，判 poor。；仅 1 处具体数字，统计支撑偏弱 |
| D5 技术抓取基建 | 100 | 10% | CWV 未取到（PageSpeed API 失败） |

## 🔻 扣分明细（为什么扣分）
> 逐项列出每个未达标/部分达标检查的客观依据（扫了哪些页/文件、命中/未命中），扣分有据可查。

### D1 结构化语义+宏观架构
- **JSON-LD / schema.org 标注** · 未达标：全站无 JSON-LD/schema.org 标注（已扫 4 页，0 命中）
- **章节树 / 导航清晰度** · 部分达标：仅 1 个 H1 + 3 个 H2（更多AI智能工具/专业剪辑/全能易用），章节树极浅，按功能类目分块但层级单薄，判 partial。

### D2 内容可读性+meso+micro
- **FAQ / Q&A 块** · 未达标：已扫 4 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构
- **段落/列表/表格语义结构** · 部分达标：正文为功能名+一句话描述的营销罗列（『智能抠像 — 智能识别人像并抠除背景』），有列表感但无真正段落/表格组织，判 partial。
- **micro 强调节制度** · 部分达标：view-source 抽样以 route manifest 脚本为主，正文结论级强调无明确佐证，判 partial。
- **self-contained 自足性** · 部分达标：功能描述多为依赖功能网格语境的短片段（『多机位 — 4机位或9机位模式…』），独立引用价值有限，判 partial。
- **删 CSS 可读性** · 部分达标：文本/HTML 占比偏低（2.9%）
- **/llms.txt 存在性与格式** · 部分达标：/llms.txt 存在但格式不完整（缺 H1 或链接）
- **内容平台覆盖 vs LLM 可达性盲区（§6.3）** · 部分达标：盲区引擎（内容完全抓不到）：小红书点点(P3)。仅间接可达：豆包(P0)、腾讯元宝(P0)、腾讯混元(P2)。整改方向：豆包←douyin/toutiao；腾讯元宝←wechat_oa/wechat_channels；腾讯混元←wechat_oa/wechat_channels；小红书点点←xiaohongshu。

### D3 权威信号（部分）
- **About / 机构信息存在性** · 未达标：已扫 5 条内部链接 + 4 页 JSON-LD，未发现 About/机构页或 Organization schema
- **作者 / 资质标注** · 未达标：无任何作者署名，仅页脚公司主体（深圳市脸萌科技/字节跳动），E-E-A-T 作者资质信号缺失，判 poor。
- **内容时间新鲜度** · 未达标：未检测到内容时间信息（已扫数字与英文自然语言日期）
- **透明度（来源/披露/政策）** · 部分达标：有合规披露（用户协议/隐私协议、营业执照、ICP备案、增值电信许可、商务联系），但纯产品营销无内容来源/信息披露，判 partial。

### D4 可引用性（部分）
- **Justification 论证结构** · 未达标：纯功能断言无论证支撑（『电影级质感』『录音棚音质』等主张无论据/依据），论点-论据-依据链缺失，判 poor。
- **Statistics 使用率（具体数字/样本）** · 部分达标：仅 1 处具体数字，统计支撑偏弱
- **结论明确性** · 部分达标：营销主张清晰但泛化（『创作无限新可能』+ 功能卖点），无可引用的实质结论，判 partial。

### D5 技术抓取基建
- **Core Web Vitals（PageSpeed Insights）** · 部分达标：PageSpeed API 失败，CWV 未取到（PSI fetch 失败: fetch failed）

> 🔗 耦合提示：`D4xD2_micro` micro 强调/语义偏弱，可引用单元难以被独立摘取

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
