/**
 * Analyzer 主入口 —— RawSiteData → AnalysisResult（per-check CheckResult + 画像 + Top3）。
 *
 * 流程（PRD §5.2 L-1~L-5）：
 *   1. L-1 画像（LLM 分类 + 启发式兜底）
 *   2. 跑 CHECKLIST：rule 项确定性判定；llm 项调 judge（失败/无 judge → fallback，PRD §10）
 *   3. 按维度聚合 DimensionAnalysis（penalty 模型）
 *   4. notEvaluated 恒列 4 项 Deep 专属；Top3 ROI 排序
 *
 * 判断逻辑集中在本层（CLAUDE.md §3）；Scorer/Reporter 只做确定性聚合，不重判。
 */

import { CHECKLIST, ALWAYS_PARTIAL_DIMENSIONS } from './checklist.ts';
import { DEEP_ONLY_NOT_EVALUATED } from '../core/scorer.ts';
import { buildCheckResult, assembleDimension } from './aggregate.ts';
import { inferProfile, heuristicClassification } from './profile.ts';
import { buildTopFixes } from './topfixes.ts';
import type {
  AnalysisResult, AnalyzeDeps, CheckContext, CheckDef, DimensionAnalysis,
  LlmJudge, Rating, RuleOutcome,
} from './types.ts';
import type { DimensionId, RawSiteData, SiteProfile } from './imports.ts';

const DIMS: DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
const VALID_RATINGS: Rating[] = ['good', 'partial', 'poor', 'na'];

/** 评估单个检查项（rule 直判；llm 调 judge，失败/无 judge → fallback）。 */
async function evaluateCheck(
  def: CheckDef,
  ctx: CheckContext,
  judge?: LlmJudge,
): Promise<RuleOutcome> {
  if (def.kind === 'rule') {
    return def.rule!(ctx);
  }
  // llm 型
  if (!judge) {
    return def.fallback ? def.fallback(ctx) : { rating: 'partial', evidence: '无 LLM judge，降级 partial' };
  }
  try {
    const { instruction, context } = def.prompt!(ctx);
    const verdict = await judge({
      checkId: def.id, dimension: def.dimension, name: def.name, instruction, context,
    });
    if (!verdict || !VALID_RATINGS.includes(verdict.rating)) {
      throw new Error(`judge 返回非法 rating: ${verdict?.rating}`);
    }
    return { rating: verdict.rating, evidence: verdict.evidence };
  } catch (err) {
    // PRD §10：LLM 判断失败 → 降级规则判断 + partial
    const hint = err instanceof Error ? err.message : String(err);
    if (def.fallback) {
      const fb = def.fallback(ctx);
      return { rating: fb.rating, evidence: `${fb.evidence}（LLM 判断失败降级：${hint}）` };
    }
    return { rating: 'partial', evidence: `LLM 判断失败降级 partial：${hint}` };
  }
}

/**
 * 主分析函数。
 * @param raw      Collector 产物（须含 pages[0] 首页）。
 * @param deps     market + 可选 LLM judge。
 * @param classify 可选：LLM 画像分类器；缺失则启发式（PRD §5.2）。
 */
export async function analyze(
  raw: RawSiteData,
  deps: AnalyzeDeps,
  classify?: (raw: RawSiteData) => Promise<import('./profile.ts').ProfileClassification>,
): Promise<AnalysisResult> {
  if (!raw.pages || raw.pages.length === 0) {
    throw new Error('analyze: RawSiteData 无可分析页面（首页缺失）。error 报告应在 analyze 前由编排层处理。');
  }

  // L-1 画像
  let classification;
  try {
    classification = classify ? await classify(raw) : heuristicClassification(raw);
  } catch {
    classification = heuristicClassification(raw); // 分类失败降级启发式
  }
  const profile: SiteProfile = inferProfile(raw, deps.market, classification);

  const ctx: CheckContext = { raw, profile, homepage: raw.pages[0] };

  // 跑检查项（deep 项跳过，仅进 notEvaluated）
  const scoredDefs = CHECKLIST.filter(c => c.kind !== 'deep');
  const outcomes = await Promise.all(
    scoredDefs.map(async def => ({ def, result: buildCheckResult(def, await evaluateCheck(def, ctx, deps.judge)) })),
  );

  // 按维度聚合
  const dimensions = {} as Record<DimensionId, DimensionAnalysis>;
  for (const d of DIMS) {
    const dimDefs = scoredDefs.filter(c => c.dimension === d);
    const dimResults = outcomes.filter(o => o.def.dimension === d).map(o => o.result);
    dimensions[d] = assembleDimension(dimDefs, dimResults, ALWAYS_PARTIAL_DIMENSIONS.has(d as 'D3' | 'D4'));
  }

  const topFixes = buildTopFixes(dimensions, CHECKLIST);

  return {
    profile,
    dimensions,
    notEvaluated: [...DEEP_ONLY_NOT_EVALUATED],
    topFixes,
  };
}
