/**
 * 评分核心工具 —— 打分、等级、一票否决、权重常量。
 * 所有判断规则源自 PRD §3/§4/§5.3；渲染层只消费 AuditReport，不重判。
 */

import type { DimensionId, DimensionScore, Level, Veto } from './types.ts';

export const DIMENSION_WEIGHTS: Record<DimensionId, number> = {
  D1: 0.20,
  D2: 0.20,
  D3: 0.25,
  D4: 0.25,
  D5: 0.10,
};

/** Light 档永远须列出的 4 项 Deep-only notEvaluated（PRD §12 验收条件）。 */
export const DEEP_ONLY_NOT_EVALUATED: readonly string[] = [
  'D3 earned media 覆盖度（需 Deep）',
  'D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）',
  '引擎特定层 per-engine 分数（需 Deep）',
  '异常引用模式抽查（需 Deep）',
];

/** 6 档单维度分（PRD §3.1）：向下就近取 */
export const SCORE_TIERS = [100, 80, 60, 40, 20, 0] as const;

/**
 * 把连续分对齐到最近（向下）6 档。
 * 例：78 → 60，80 → 80，59 → 40。
 */
export function snapToTier(raw: number): number {
  for (const t of SCORE_TIERS) {
    if (raw >= t) return t;
  }
  return 0;
}

/** 从总分计算等级（PRD §4.1）。*/
export function calculateLevel(total: number): Level {
  if (total <= 40) return 'L0';
  if (total <= 60) return 'L1';
  if (total <= 80) return 'L2';
  return 'L3';
}

/**
 * 检查一票否决规则（PRD §3.3/§4.2）。
 * 任意 veto triggered → 等级应锁为 L0（由 Scorer 负责应用）。
 */
export function checkVetoes(
  dimensions: Partial<Record<DimensionId, DimensionScore>>,
  isYMYL: boolean,
): Veto[] {
  const d5Score = dimensions.D5?.score ?? 100;
  const d3Score = dimensions.D3?.score ?? 100;
  return [
    { rule: 'D5<60', triggered: d5Score < 60 },
    { rule: 'YMYL_D3<40', triggered: isYMYL && d3Score < 40 },
  ];
}

/**
 * 计算加权总分（PRD §3.2）。
 *
 * 若存在 na/缺失维度，用可用维度的原始权重之和计分（不重新归一化），
 * 总分偏低——调用方须把 biasNote 写入报告。
 */
export function calculateTotal(
  dimensions: Partial<Record<DimensionId, DimensionScore>>,
): { total: number; biasNote?: string } {
  const ALL_DIMS: DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
  const missing = ALL_DIMS.filter(id => !dimensions[id]);
  const available = ALL_DIMS.filter(id => !!dimensions[id]);

  const weightedSum = available.reduce(
    (s, id) => s + dimensions[id]!.score * DIMENSION_WEIGHTS[id],
    0,
  );
  const total = Math.round(weightedSum);

  if (missing.length > 0) {
    return {
      total,
      biasNote: `${missing.join('/')} 未参与计分（总分偏低，不含满权重 ${(missing.reduce((s, id) => s + DIMENSION_WEIGHTS[id], 0) * 100).toFixed(0)}%）`,
    };
  }
  return { total };
}
