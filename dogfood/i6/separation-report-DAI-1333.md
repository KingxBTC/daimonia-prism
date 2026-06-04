# I6 — agent-judge separation 验证报告

**Issue**：DAI-1333（父 DAI-1325）·**方向文档**：`docs/iteration-light-discrimination.md` §I6
**作者**：付龙（CTO，本人即 agent-judge）·**日期**：2026-06-04
**依赖落地状态**：I1（DAI-1328 判 judge 接线）+ I2（DAI-1329 加分信号）+ I3（DAI-1330 启发式地板）全部就位
**执行分支**：`dai-1330-i3-heuristic-floor`（含 I2 commit `6036233`；隔离 worktree 跑，避免与 main 共享 checkout 冲突）

---

## 0. 结论（TL;DR）

**验收通过。** agent-judge 模式下，精心做架构 + 权威建设的站（暖情）相对基准站显著拉开差距：

- **暖情 vs abel：heuristic 仅差 2 分（59 vs 57）→ agent-judge+bonus 差 16 分（94 vs 78），且分属不同等级（L3 vs L2）。**
- 差距 **可解释**：暖情领先几乎全部来自 **D3 权威性（E-E-A-T）**——作者资质 + 透明度 + 时效，这正是暖情真做了而 abel（产品 landing）没做的功夫。abel 反而在 D4 论证性上**真实领先**暖情，Prism 如实呈现，不掩盖。

---

## 1. 方法

agent-judge 两遍式（I1 / Track A1），宿主 agent（Claude Opus 4.8，本人）当裁判，无 API key：

1. `node skill/run-audit.ts collect <url> --market <m>` → 导出 8 条 llm 检查项的 `{checkId,instruction,context}` 到 `prompts-*.json`。
2. 本人逐项读页面证据判定 → 写回 `verdicts-*.json`（`{checkId,rating,evidence}`，rating ∈ good/partial/poor/na）。判定矩阵见 §5。
3. `node skill/run-audit.ts report <url> --verdicts verdicts-*.json` → 第二遍 auditLight 注入 judge-from-file，产最终报告。4 站均 **✓ 覆盖全部 8 个 llm 项**（无降级兜底）。

bonus（I2）确定性计算，与 judge 正交：从 RawSiteData 检测 rich_schema / semantic_html / ssr_rich_content，cap=8，只进总分不破 6 档维度语义。

**对照基线**：heuristic 跑（DAI-1320 dogfood，无 judge、无 bonus），即 `dogfood/*.json`。

---

## 2. 四站结果（heuristic → agent-judge+bonus）

| 站点 | 角色 | heuristic | agent-judge+bonus | Δ | 等级变化 |
|------|------|-----------|--------------------|----|---------|
| **暖情** nuanqing.com.cn | 客户 | 59 L1 | **94 L3** | **+35** | L1→L3 |
| **abel** abel.ai | 基准 | 57 L1 | **78 L2** | +21 | L1→L2 |
| **anthropic** anthropic.com | 基准 | 37 L0 | 55 L1 | +18 | L0→L1 |
| **capcut** www.capcut.cn | 基准 | 37 L0 | 39 L0 | +2 | L0→L0 |

维度明细（agent-judge+bonus）：

| 站点 | D1(.20) | D2(.20) | D3(.25) | D4(.25) | D5(.10) | bonus | 总分 |
|------|----|----|----|----|----|----|----|
| 暖情 | 100 | 80 | **100** | 60 | 100 | 8 [schema4+sem2+ssr2] | 94 |
| abel | 100 | 60 | **40** | 80 | 80 | 8 [schema4+sem2+ssr2] | 78 |
| anthropic | 60 | 20 | 60 | 40 | 100 | 4 [sem2+ssr2] | 55 |
| capcut | 40 | 40 | 0 | 40 | 100 | 3 [sem1+ssr2] | 39 |

---

## 3. 区分力量化

- **暖情 ↔ abel（客户 vs 同档基准）**：2 分 → **16 分**（×8 放大），跨 1 个等级。✅ 远超验收线「明显高于原 2 分」。
- **客户 vs 弱基准（暖情 ↔ capcut）**：22 分 → **55 分**。
- **判别不是无差别抬分**：capcut（纯功能营销页）仅 +2，仍锁 L0——judge 对薄内容给出 partial/poor，区分力在低分段同样成立。

---

## 4. 归因分析（16 分差从哪来）

按维度加权拆解暖情−abel 的总分差：

| 维度 | 暖情 | abel | 差 | ×权重 | 贡献 | 说明 |
|------|----|----|----|------|------|------|
| D3 | 100 | 40 | +60 | 0.25 | **+15** | **暖情领先核心**：作者资质 + 透明度 |
| D2 | 80 | 60 | +20 | 0.20 | +4 | 暖情 self-contained / 段落结构更优 |
| D5 | 100 | 80 | +20 | 0.10 | +2 | 暖情 sitemap 完备 |
| D4 | 60 | 80 | −20 | 0.25 | **−5** | **abel 真实领先**：论证结构更强 |
| D1 | 100 | 100 | 0 | 0.20 | 0 | 平手（均富 schema + 清晰导航）|
| bonus | 8 | 8 | 0 | — | 0 | 平手（均触顶）|
| | | | | | **≈+16** | |

**D3 解剖（差距来源）**：

| D3 子项 | 暖情 | abel |
|---------|------|------|
| about_page | pass | pass |
| author_credentials | **pass**（JSON-LD Person + hasCredential：协会副会长/会长；团队均标从业年限） | **fail**（产品 landing 无具名作者/资质）|
| freshness | pass（结构化 datePublished/dateModified） | partial（正文有数字日期无结构化标注）|
| transparency | **pass**（数据时间戳 + 案例授权脱敏披露 + 资质/媒体可查） | partial（有方法论证据，缺来源/披露/政策标注）|

→ 暖情 D3 四项全 pass→snap 100；abel 一 fail 两 partial→snap 40。**这 60 分的 D3 鸿沟（加权 15 分）就是暖情领先的主因**，且每一分都有客观扫描事实背书（I4 evidence）。

**诚实点**：abel D4=80 > 暖情 D4=60。abel 的「四时代框架 + 256.73 bps / 200,000+ 变量 / 0-11 gates」论证确实更强，Prism 没有为了让客户站好看而压低 abel。**暖情的领先是「权威性」而非「论证力」**——这与 King 目标 1（精心做架构/权威的站要拉开）和目标 2（低分必须合理归因）完全吻合。

---

## 5. agent-judge 判定矩阵（8 检查项 × 4 站）

| checkId | 暖情 | abel | anthropic | capcut |
|---------|------|------|-----------|--------|
| D1.nav_clarity | good | good | good | partial |
| D2.paragraph_list_table | good | good | partial | partial |
| D2.micro_emphasis | partial | partial | partial | partial |
| D2.self_contained | good | good | partial | partial |
| D3.author_credentials | **good** | **poor** | poor | poor |
| D3.transparency | **good** | partial | good | partial |
| D4.conclusion_clarity | partial | **good** | partial | partial |
| D4.justification | partial | **good** | partial | poor |

完整 evidence 见 `verdicts-*.json`。

---

## 6. I2 加分权重回填结论

**结论：维持 I2 现有权重不变（rich_schema 4/2 · semantic_html 2/1 · ssr_rich_content 2 · cap 8）。不做上调。**

理由：

1. **bonus 不是、也不应是「暖情 vs abel」的区分杠杆**。本轮暖情与 abel 的 bonus 都触顶 8 分（两者都真做了 schema + 语义化 + SSR）。区分由 **D3 权威性判断**承担——这才是「精心做的站」的正确判别维度。若靠堆高 bonus 制造分差，等于用技术信号掩盖真正的内容/权威差异，违背 §I2「只奖基础未计入的额外档」与诚实归因原则。
2. **bonus 在该奖的地方确实奖了**：暖情/abel（技术扎实）拿满 8，anthropic 4，capcut 3——bonus 单调反映「额外功夫」梯度，区分度正常。
3. **cap=8 的前向护栏有效**：当前信号档位之和恰为 8，未出现 bonus 压过维度主体的失衡（总分仍由 5 维主导）。
4. 若未来要进一步奖励「权威建设」的额外功夫（如 hasCredential 数量、媒体背书数），应作为**新增 bonus 信号**走 child issue 评审，而非上调现有技术信号权重。

---

## 7. 局限与诚实提示

- judge 仅判**首页抽样**的 8 个 llm 项；earned media 覆盖、跨 query 稳定性仍属 Deep（4 项 notEvaluated 恒列）。Light 分为 indicative。
- judge=本人单次判定，未做多裁判投票；判定矩阵已留 evidence 供复核。同一宿主不同次判定可能有 ±1 档抖动，但 D3 这种硬信号（有无 schema Person/hasCredential）稳定。
- `report` 二遍重新联网采集；若站点内容在 collect↔report 间变动，bonus（基于 report 采集）与 verdict（基于 collect 采集）可能轻微错位。本轮 4 站采集稳定，未观测到异常。
- **基线对照已对齐**：heuristic 与 agent-judge 走同一 collector/scorer，唯一变量为 judge 注入 + bonus。

---

## 8. 复现命令

```bash
# 在含 I1+I2+I3 的分支（dai-1330-i3-heuristic-floor）执行
for s in "https://abel.ai international abel" \
         "https://anthropic.com international anthropic" \
         "https://nuanqing.com.cn china nuanqing" \
         "https://www.capcut.cn china capcut"; do
  set -- $s
  node skill/run-audit.ts collect $1 --market $2 --out dogfood/i6/prompts-$3.json
  # 宿主 agent 据 prompts-$3.json 判定写 verdicts-$3.json
  node skill/run-audit.ts report  $1 --market $2 --verdicts dogfood/i6/verdicts-$3.json --out-dir dogfood/i6
done
```

产物：`dogfood/i6/{prompts,verdicts}-*.json` + `{slug}.{json,md,html}`。
