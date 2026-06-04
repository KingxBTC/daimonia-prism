# 迭代方向：Light 审计「区分力」+「归因可信度」

**来源**：DAI-1325（dogfood 结果讨论，King 直接定向）
**作者**：付龙（CTO）
**日期**：2026-06-04
**状态**：方向草案，待 King 拍板 → 拆执行 child issue

---

## 0. King 的两个核心目标

1. **必须能区分**：精心做了架构的站（暖情，Astro SSR + schema）相比没做的站（abel），即使在 **Light 档**也应拉开差距——「我们做得好，浅度审计就体现不出来吗？」
2. **低分必须合理归因**：大站得分低，报告要讲清「是**他们没做**，不是我们方法/工具不对」，否则读者会质疑 Prism 不专业、降低报告可信度。

约束：**此阶段不配 Anthropic API Key**。King 的认知是「轻度工具下已调用大模型」——指 skill 跑在 Claude Code（宿主即 LLM）里，judge 应由宿主 agent 提供。

---

## 1. 根因（已用代码核实）

dogfood 出现「暖情 59 / abel 57 只差 2 分、标杆 37」的真正原因，不是方法论参数，而是 **LLM judge 从未接线**：

| 事实 | 证据 |
|------|------|
| `judge` 是注入式依赖，`auditLight(opts?.judge)` → `analyze(deps.judge)` | `src/core/audit.ts:40,70`；`src/analyzer/analyze.ts:32-60` |
| **全 repo 无任何地方传入 judge 实参**（唯一 caller `dogfood/run-dogfood.ts` 明确无 judge） | grep 全仓仅 `audit.ts:70` 的 pass-through |
| **skill 目录无任何脚本调用 `auditLight`**，只有渲染器 `render/cli.ts` | `skill/` 下唯一 auditLight 引用是渲染 |
| SKILL.md 用散文描述「组装 AuditReport」，**未接「宿主 agent 当裁判」线**，也未给出产 JSON 的命令 | `skill/SKILL.md` §2/§4 |
| 无 judge 时，D2/D3/D4 的 `llm` 项 fallback **全是固定常量**（author→poor，其余→partial），不读内容 | `checklist.ts:210,221,279,304,350,361` |

**结论**：
- 「轻度工具下调用大模型」是**设计意图、尚未实现**。当前每一次运行（含真实 skill）都走 heuristic。
- 暖情/abel 在 D2/D3/D4 逐项相同，是因为这些维度返回的是**与内容无关的常量**。
- 只有 `rule` 项能确定性区分：D1 schema/标题、D4 数字计数/引用计数、D5 robots/sitemap、D3 about、D2 llms.txt。暖情与 abel 恰好在这些硬项上同档（都有 schema、都有标题、都有 about），于是只剩 D5 sitemap 差出 2 分。

---

## 2. 解决方向（三条 Track）

### Track A — 接线「宿主 agent 当裁判」（实现 King 设想的核心架构，无需 API key）

skill 运行时，对每个 `llm` 型检查项，由宿主 agent（跑 skill 的 Claude）读取页面内容、按 `def.prompt(ctx)` 给出的 `{instruction, context}` 产出 `Rating` verdict，作为 `judge` 注入 `auditLight`。

**推荐实现形态 A1（批处理两遍，可脚本化、可测）**：
1. runner 跑 Collector + Analyzer 的 prompt 收集阶段，把所有 `llm` 项的 `{checkId, instruction, context}` 导出到 `prompts.json`。
2. 宿主 agent 读 `prompts.json`，逐项判定，写回 `verdicts.json`（`{checkId, rating, evidence}`）。
3. 第二遍 `auditLight(input, {judge})`，judge 从 `verdicts.json` 取对应 verdict。
- 优点：node 编排 + agent 在环，确定性、可缓存、可单测（judge 用 fixture 喂）。
- 备选 A2（inline 回调）node 无法回调 agent，不适合纯 CLI，排除。

**改动面**：SKILL.md（补 §2.5「judge 收集→判定→回填」流程 + 产 JSON 命令）、新增 skill 侧 runner、judge-from-file 适配器。**不动** core 三段解耦契约。

### Track B — 强化 heuristic 兜底（无 agent 时的「区分力地板」）

把固定常量 fallback 换成**读内容的启发式**，让 CI/headless 路径也有基本区分力，并修掉已发现的假象：
- `D3.freshness`：日期正则补自然语言（"January 30, 2025"）→ 修 anthropic 误判。
- `D3.author_credentials`：检测署名/bio 块/schema `Person`/`author` → 不再一律 poor。
- `D3.transparency`：检测 privacy/披露/policy 链接。
- `D2.self_contained` / `D4.conclusion_clarity` / `justification`：结构启发式（TL;DR、摘要块、「因此/综上」、指代密度）。
- 定位：**地板**，不替代 Track A 的内容判断。

### Track C — 单项有理有据（目标 2，King 修正版）

**King 拍板：不做单独的「可信度声明块」——单独做显得刻意。** 可信度靠**每个单项讲得有理有据**自然体现。

落地方式：强化每个 `CheckResult.evidence` 的说理质量，并在渲染层把「为什么扣分」的证据**显性呈现**。例：
- 「anthropic.com 全站无 JSON-LD/schema.org（已扫 4 页，0 命中）」—— 这本身既是归因（站点没做）也是可信度（有据可查），不再额外加声明。
- 每项扣分都带：扣什么、扫了哪些页/文件、命中/未命中的客观事实。

CheckResult 已带 `evidence` 字段，Track C = **把 evidence 写扎实 + 渲染显性化**，不重判、不加声明块。

---

## 3. King 拍板（2026-06-04，DAI-1325 comment da197da1）

1. **加分信号：确定引入。** 奖励「做了额外功夫」的站，让精心做的站真正领先。
2. **双 judge 产品形态都要存在**，统一 `LlmJudge` 接口 + 两个适配器：
   - **skill 形态 → agent-judge**：每个用户安装 skill，用**自己的 agent**当裁判调 scale（无需 API key）。
   - **web 形态 → API-key judge**：网页用户输入 URL 点确认，后台运行，**用 API key** 调 Anthropic API。
   - 注入点 `auditLight(opts?.judge)` 已天然支持——只需提供两个 judge 实现。
3. **不做单独可信度声明块**（见 Track C 修正版）。

> ⚠️ 诚实提示：接上 judge 后暖情**未必**自动碾压 abel——abel 也有 schema/about。「Astro 架构优势」需要**加分信号**（拍板 1）才能在分数上体现。落地后先验 separation（I6），再微调加分权重。

---

## 4. 执行拆解（方向已批准，本轮起 child issue）

| ID | Track | 内容 | output | 依赖 |
|----|----|----|----|----|
| **I1** | A | 统一 `LlmJudge` 注入 + **skill 侧 agent-judge**（批处理两遍式）；SKILL.md 补 judge 收集→判定→回填流程 + 产 JSON 命令；judge-from-file 适配器 + fixture 单测 | 可跑出带 LLM 判断的 AuditReport（skill 形态） | — |
| **I2** | 加分信号 | 打分模型扩展 penalty→penalty+bonus；检测「额外功夫」信号（rich schema 类型数 / SSR vs CSR / llms.txt 存在 / 语义化 HTML 等）；设计 bonus 进分数而不破坏 6 档 snap 语义 | 打分器支持加分信号 + 单测 + 方法论文档 | — |
| **I3** | B | 5 个固定常量 fallback → 读内容启发式（self_contained / author_credentials / transparency / conclusion_clarity / justification）+ 修 D3.freshness 自然语言日期误判 | headless 区分力地板 + 单测 | — |
| **I4** | C | 强化每个 CheckResult evidence 说理 + 渲染层「为什么扣分」证据显性化（md+HTML）；**不做声明块** | 报告单项有理有据 | — |
| **I5** | A(web) | **API-key judge 适配器**：调 Anthropic API 实现 `LlmJudge`，供 web 后台形态；key 由维龙管 | apiJudge 适配器 + 配置 | I1（接口） |
| **I6** | 验证 | agent-judge 模式复跑暖情 vs abel + anthropic/capcut，量化 separation，回填加分权重 | separation 验证报告 | I1+I2+I3 |

> 优先级：I1/I2/I3/I4 并行启动（互不阻塞）；I5 等 I1 接口定稿（web 上线前做）；I6 等 I1+I2+I3 落地。

---

## 5. I2 落地说明：加分信号（penalty → penalty+bonus）

**状态**：已实现（DAI-1329）。代码：`src/analyzer/bonus.ts`（检测）+ `src/core/scorer.ts`（聚合，`computeBonus`/`BONUS_CAP`/`buildScores`）+ `src/core/types.ts`（`BonusSignal`/`ScoreBonus`）。测试：`tests/bonus-signals.test.ts` + `tests/scorer.test.ts`。

### 5.1 关键取舍：bonus 进**总分**，不进**维度分**

「单维 6 档 + 向下就近」是**单维度不变量**——每个 `DimensionScore.score ∈ {0,20,40,60,80,100}`。若把 bonus 加进维度分再 snap，会出现两种坏情况：① 加分被 snap-down 吃掉（如 80+3→83 仍 snap 80，白加）；② 为了跨档不得不给很大权重，噪声失控。

**解法**：bonus **完全不触碰维度分**，只叠加到**总分**——而总分（`calculateTotal` 的加权和）本来就是连续值、从不是档位量。于是：

- 6 档单维不变量 **零破坏**（维度分仍只由 penalty 模型 + snap 决定）。
- bonus 作为「额外功夫」的独立加项，透明列在 `scores.bonus.signals`，可审计、可单独调权。
- 应用顺序：`总分 = min(100, 加权和 + min(Σ信号分, BONUS_CAP))` → 据此算等级 → **一票否决仍最后覆盖**（veto 命中照锁 L0，加分不能救）。
- 总分**夹紧 ≤100**：满分站已触顶、无需加分区分，bonus 只对未触顶站起作用（正是需要拉开差距的区间）。

### 5.2 信号清单（初值，I6 回填微调）

| 信号 | 维度 | 衡量「高于基础档的额外功夫」 | 档位 |
|------|------|------|------|
| `B.rich_schema` | D1 | schema.org **类型丰富度**（基础 `D1.jsonld_schema` 只判有无） | ≥4 种 → +4；2-3 种 → +2 |
| `B.semantic_html` | D1 | HTML5 **语义化 landmark 标签**（checklist 无对应项，纯新增） | ≥5 种 → +2；3-4 种 → +1 |
| `B.ssr_rich_content` | D2 | **SSR 正文深度**（基础 `D5.render_mode` 只判非空壳；阈值 ≥800 字符） | 满足 → +2 |

`BONUS_CAP = 8`（= 当前信号档位之和），既封顶防「堆信号压过维度主体」，也作为 I6 追加信号时的前向护栏。

### 5.3 不双重计分原则

bonus 只奖励**基础 penalty 模型尚未计入的额外档**：

- `rich_schema`：基础只判「有无 schema」→ 本信号判「类型数」，是更高一档，不重复。
- `semantic_html`：基础无此项 → 纯新增。
- `ssr_rich_content`：基础只判「非 CSR 空壳」→ 本信号判「正文深度」，更高一档。
- **`/llms.txt` 刻意不做 bonus**：`D2.llms_txt` 基础 check 已有 poor/partial/good 分档（含「H1+链接」高档），再加 bonus 即对同一产物双重奖励。虽在 §I2 候选清单内（「等」为示意），落地时按本原则排除。

### 5.4 边界

- robots 封锁内容（D1-D4 标 na）时**抑制 bonus**（`audit.ts`）——不奖励无法完整审计的站，符合目标 2 的诚实归因。
- CSR 空壳：`ssr_rich_content` 门控 `!isCSR`，schema/语义信号也因空壳 HTML 自然为 0，无需特判。

### 5.5 验收

`tests/bonus-signals.test.ts`「区分力」用例：rich schema + 语义化 + 深 SSR 的精心站加分 = 8，朴素同结构站 = 0；`tests/scorer.test.ts`「含信号站总分 > 无信号同结构站」：同为 5×60 维度结构下，含信号站 66 > 无信号站 60。**满足 issue 验收「含信号站总分高于无信号同结构站」。** 真站 separation（暖情 vs abel）量化与权重回填见 I6。
