/**
 * penalty 模型聚合 —— rating → scoreImpact，CheckResult[] → 维度 rawScore。
 *
 * Analyzer↔Scorer 契约（见 types.ts）：
 *   维度 rawScore = clamp(100 + Σ scoreImpact, 0, 100)。
 *   na 检查项剔除：把其 penalty 从基线扣除并按比例重整（避免"未评=送分"）。
 *   Scorer 再做 snapToTier(rawScore)（PRD §3.1）。
 */

import type { CheckDef, Rating, RuleOutcome, DimensionAnalysis } from './types.ts';
import type { CheckResult } from './imports.ts';

/** rating → 该检查项实际扣分（penalty 模型，<=0）。 */
export function ratingToScoreImpact(rating: Rating, penalty: number): number {
  switch (rating) {
    case 'good': return 0;
    case 'partial': return -penalty / 2;
    case 'poor': return -penalty;
    case 'na': return 0; // na 不直接扣分，聚合时从基线剔除其权重
  }
}

/** rating → CheckResult.status。 */
export function ratingToStatus(rating: Rating): CheckResult['status'] {
  switch (rating) {
    case 'good': return 'pass';
    case 'partial': return 'partial';
    case 'poor': return 'fail';
    case 'na': return 'na';
  }
}

/** 把一次评级结果组装成 CheckResult。 */
export function buildCheckResult(def: CheckDef, outcome: RuleOutcome): CheckResult {
  return {
    id: def.id,
    name: def.name,
    tier: def.tier,
    status: ratingToStatus(outcome.rating),
    evidence: outcome.evidence,
    scoreImpact: ratingToScoreImpact(outcome.rating, def.penalty),
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * 由检查项（def + 评级）聚合维度 rawScore。
 * na 项：其 penalty 从「满分基线」剔除，剩余项按原 penalty 在新基线内重整。
 * 全部 na（无可评项）→ 返回 null（维度不可评，交 Scorer 标 na/缺失）。
 */
export function aggregateRawScore(
  items: Array<{ penalty: number; rating: Rating }>,
): number | null {
  const scored = items.filter(i => i.rating !== 'na');
  if (scored.length === 0) return null;
  const basis = scored.reduce((s, i) => s + i.penalty, 0);
  if (basis === 0) return null;
  // 在「可评 penalty 之和」基线内计算扣分占比，再映射回 100 分制
  const lost = scored.reduce((s, i) => s + (-ratingToScoreImpact(i.rating, i.penalty)), 0);
  const raw = 100 * (1 - lost / basis);
  return Math.round(clamp(raw, 0, 100));
}

/**
 * 组装单维度分析结果。
 *  - rawScore：penalty 模型聚合（na 剔除重整）。
 *  - partial：alwaysPartial（D3/D4）或存在 na 检查项 → true。
 *  - issues：fail/partial 检查项的 evidence，按严重度（fail 优先）取前 2（PRD §7.2 1-2 句）。
 */
export function assembleDimension(
  defs: CheckDef[],
  results: CheckResult[],
  alwaysPartial: boolean,
): DimensionAnalysis {
  const byId = new Map(defs.map(d => [d.id, d]));
  const items = results.map(r => ({
    penalty: byId.get(r.id)?.penalty ?? 0,
    rating: statusToRating(r.status),
  }));
  const rawScore = aggregateRawScore(items) ?? 0;
  const hasNa = results.some(r => r.status === 'na');

  const issues = [...results]
    .filter(r => r.status === 'fail' || r.status === 'partial')
    .sort((a, b) => severity(b.status) - severity(a.status))
    .slice(0, 2)
    .map(r => r.evidence);

  return {
    rawScore,
    partial: alwaysPartial || hasNa,
    issues,
    checks: results,
  };
}

function statusToRating(status: CheckResult['status']): Rating {
  switch (status) {
    case 'pass': return 'good';
    case 'partial': return 'partial';
    case 'fail': return 'poor';
    case 'na': return 'na';
  }
}

function severity(status: CheckResult['status']): number {
  return status === 'fail' ? 2 : status === 'partial' ? 1 : 0;
}
