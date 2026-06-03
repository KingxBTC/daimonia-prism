/**
 * Analyzer 层契约 —— 消费 Collector 的 RawSiteData，产出 per-check CheckResult
 * + 站点画像 + Top3 整改 + notEvaluated。
 *
 * 架构（CLAUDE.md §3 三阶段解耦）：
 *   Collector → RawSiteData → **Analyzer（本层，LLM+规则判断）** → CheckResult[]/DimensionAnalysis
 *     → Scorer/Reporter（确定性聚合，T2/DAI-1272）→ AuditReport
 *
 * Analyzer↔Scorer 契约（本文件定义，供 T2 Scorer 消费）：
 *   - 每检查项产 CheckResult，`scoreImpact` 为「对维度 100 基线的扣分」（penalty 模型，可负）。
 *   - Analyzer 按维度聚合出 `DimensionAnalysis`（含连续 rawScore），Scorer 负责
 *     `snapToTier(rawScore)`（PRD §3.1 向下就近 6 档）+ 总分/等级/一票否决（PRD §3.2-§4.2）。
 *   - 判断逻辑全部集中在本层，方法论升版本时单点修改 checklist.ts（CLAUDE.md §2 自包含）。
 */

import type {
  CheckResult,
  DimensionId,
  RawSiteData,
  RawPageData,
  SiteProfile,
  Market,
  TopFix,
} from './imports.ts';

/** LLM 判断的离散评级（便于 LLM 稳定产出 + 映射到 penalty）。 */
export type Rating = 'good' | 'partial' | 'poor' | 'na';

/** 单个 LLM 判断请求（注入式 judge 的入参）。 */
export interface JudgeRequest {
  checkId: string;
  dimension: DimensionId;
  name: string;
  /** 给 LLM 的判断标准（内嵌方法论，自包含）。 */
  instruction: string;
  /** 从 RawSiteData 摘出的待判断证据（页面节选等）。 */
  context: string;
}

export interface JudgeVerdict {
  rating: Rating;
  /** 判断依据，写入 CheckResult.evidence。 */
  evidence: string;
}

/**
 * LLM 判断适配器（依赖注入）。
 *  - skill 形态：薄适配器包裹当前 agent 的判断（PRD §8.3）。
 *  - web 形态：调 Claude API。
 *  - 测试：注入 mock。
 * 失败/不可用时 Analyzer 降级为启发式（PRD §10）。
 */
export type LlmJudge = (req: JudgeRequest) => Promise<JudgeVerdict>;

/** 检查项执行上下文。 */
export interface CheckContext {
  raw: RawSiteData;
  profile: SiteProfile;
  /** 首页（raw.pages[0]）。 */
  homepage: RawPageData;
}

/** rule 型检查项的确定性输出。 */
export interface RuleOutcome {
  rating: Rating;
  evidence: string;
}

/** GEO 整改方法（Top3 用，挂在检查项上）。 */
export interface FixHint {
  method: string;
  action: string;
  effort: 'low' | 'mid' | 'high';
}

/**
 * 检查项定义（内嵌方法论 §5.A L-2~L-5 的可执行版）。
 *  - kind='rule'：确定性，从 RawSiteData 直接判定。
 *  - kind='llm'：需 judge 判断（带启发式兜底）。
 *  - kind='deep'：Deep 档专属，Light 不评，写入 notEvaluated。
 */
export interface CheckDef {
  id: string;                 // e.g. "D2.llms_txt"
  dimension: DimensionId;
  name: string;
  tier: 'L' | 'L+D' | 'D';
  step: 'L2' | 'L3' | 'L4' | 'L5';
  /** 该检查项对维度 100 基线的最大扣分。Light 计分的检查项 penalty 之和 = 100。 */
  penalty: number;
  kind: 'rule' | 'llm' | 'deep';
  /** rule 型判定。 */
  rule?: (ctx: CheckContext) => RuleOutcome;
  /** llm 型：构造判断指令 + 证据上下文。 */
  prompt?: (ctx: CheckContext) => { instruction: string; context: string };
  /** llm 失败时的确定性兜底（PRD §10：降级为规则判断 + partial）。 */
  fallback?: (ctx: CheckContext) => RuleOutcome;
  /** 整改提示（Top3 映射）。 */
  fix?: FixHint;
}

/** 单维度聚合结果（供 Scorer 转 DimensionScore）。 */
export interface DimensionAnalysis {
  /** penalty 模型连续分 [0,100]，未 snap。Scorer 负责 snapToTier。 */
  rawScore: number;
  /** D3/D4 Light 恒 partial（earned/跨query 未评）；其余维度有 na 检查项时 partial。 */
  partial: boolean;
  /** 1-2 句主要问题（PRD §7.2）。 */
  issues: string[];
  checks: CheckResult[];
}

/** Analyzer 主输出。 */
export interface AnalysisResult {
  profile: SiteProfile;
  dimensions: Record<DimensionId, DimensionAnalysis>;
  /** 恒含 4 项 Deep 专属（PRD §12.1）。 */
  notEvaluated: string[];
  topFixes: TopFix[];
}

export interface AnalyzeDeps {
  market: Market;
  /** 不传则全程启发式降级（PRD §10）。 */
  judge?: LlmJudge;
}

export type { CheckResult, DimensionId, RawSiteData, RawPageData, SiteProfile, Market, TopFix };
