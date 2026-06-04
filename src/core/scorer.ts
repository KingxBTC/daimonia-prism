/**
 * 评分核心工具 —— 打分、等级、一票否决、权重常量。
 * 所有判断规则源自 PRD §3/§4/§5.3；渲染层只消费 AuditReport，不重判。
 */

import type {
  BonusSignal,
  CouplingFlag,
  DimensionId,
  DimensionScore,
  Level,
  Scores,
  ScoreBonus,
  Veto,
} from './types.ts';

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

/**
 * 应用一票否决（PRD §3.3/§4.2）：任意 veto triggered → 等级锁 L0。
 * 与 checkVetoes 分离：checkVetoes 只判定，applyVetoes 负责把判定结果落到等级上。
 */
export function applyVetoes(level: Level, vetoes: Veto[]): Level {
  return vetoes.some(v => v.triggered) ? 'L0' : level;
}

/**
 * 维度耦合错配阈值：两维度分差 ≥ 此值（2 档）即判错配。
 *
 * ⚠️ 阈值为 PRD §3.3 的可执行化"暂定值"——方法论 geo_audit_standard.md 未给出精确数值。
 * 机制（显式 flag）已按 PRD §5.3 落地；精确阈值待 T4/方法论复核后调整（见 issue 交接说明）。
 */
export const COUPLING_GAP_THRESHOLD = 40;
/** D4×D2 micro 耦合的弱档阈值（≤ 此分视为偏弱）。 */
export const COUPLING_WEAK_TIER = 40;

/**
 * 计算维度耦合 flag（PRD §3.3）。确定性、只读维度分，不做内容判断。
 *  - D1×D2 错配：结构架构与内容质量显著背离（差距 ≥ COUPLING_GAP_THRESHOLD）。
 *  - D4×D2 micro 耦合：micro 可读性弱（D2 低）拖累可引用单元（D4 低）。
 *
 * CSR 空壳等采集期 flag（csr_empty_html）由 Collector/错误处理注入，不在此计算。
 */
export function computeCouplingFlags(
  dimensions: Partial<Record<DimensionId, DimensionScore>>,
): CouplingFlag[] {
  const flags: CouplingFlag[] = [];
  const d1 = dimensions.D1?.score;
  const d2 = dimensions.D2?.score;
  const d4 = dimensions.D4?.score;

  if (d1 != null && d2 != null && Math.abs(d1 - d2) >= COUPLING_GAP_THRESHOLD) {
    flags.push({
      code: 'D1xD2_mismatch',
      note: d1 > d2 ? '架构尚可但内容空' : '内容质量高于结构承载，结构化标注待补',
    });
  }

  if (d2 != null && d4 != null && d2 <= COUPLING_WEAK_TIER && d4 <= COUPLING_WEAK_TIER) {
    flags.push({
      code: 'D4xD2_micro',
      note: 'micro 强调/语义偏弱，可引用单元难以被独立摘取',
    });
  }

  return flags;
}

/**
 * 加分上限（DAI-1329 / I2）。
 *
 * 关键取舍（docs/iteration-light-discrimination.md §I2）：
 *  - bonus **不进维度分**（保 6 档单维不变量），只进**总分**（total 本就连续）。
 *  - 加分**封顶**，防止「堆信号」压过维度主体；当前信号档位之和恰为 8，cap 同时作为
 *    I6 后续追加信号时的前向护栏。
 *  - 总分加 bonus 后**夹紧 ≤100**：满分站（已 100）无需加分区分，bonus 只对未触顶站起作用。
 */
export const BONUS_CAP = 8;

/**
 * 聚合加分信号 → ScoreBonus（确定性，cap 封顶）。
 * Analyzer 负责检测信号（每信号带 points + evidence），Scorer 只做求和 + cap。
 */
export function computeBonus(signals: BonusSignal[] = []): ScoreBonus {
  const sum = signals.reduce((s, x) => s + Math.max(0, x.points), 0);
  return { applied: Math.min(sum, BONUS_CAP), cap: BONUS_CAP, signals };
}

/** buildScores 返回的打分包：最终 Scores + 透明项（vetoes/coupling）。 */
export interface ScoreBundle {
  scores: Scores;
  vetoes: Veto[];
  couplingFlags: CouplingFlag[];
}

/**
 * Scorer 装配（PRD §5.2 L-6 / §3/§4）—— 确定性聚合，不做内容判断。
 *
 * 步骤：
 *  1. 防御性把各维度分 snapToTier 到 6 档（§3.1，Scorer 是 6 档不变量的唯一权威）。
 *  2. 加权总分（§3.2）。
 *  3. 等级（§4.1）后应用一票否决（§4.2）。
 *  4. 计算耦合 flag（§3.3），合并外部注入的 flag（如 csr_empty_html）。
 *
 * Light 档总是 indicative=true（§3.2）。
 *
 * 加分（DAI-1329 / I2）：在 snap 后的加权总分上叠加 capped bonus（夹紧 ≤100），
 * 再据此算等级——加分**不触碰维度分**，6 档单维不变量零破坏（见 BONUS_CAP 注释）。
 * 一票否决仍在最后覆盖等级（veto 优先于加分）。
 *
 * @param dimensions 五维度分（含 raw score；本函数负责 snap）。
 * @param isYMYL     画像是否 YMYL（影响 YMYL_D3<40 veto）。
 * @param extraCouplingFlags 采集/错误处理期注入的额外 flag。
 * @param bonusSignals Analyzer 检测的加分信号（无信号 → []）。
 */
export function buildScores(
  dimensions: Record<DimensionId, DimensionScore>,
  isYMYL: boolean,
  extraCouplingFlags: CouplingFlag[] = [],
  bonusSignals: BonusSignal[] = [],
): ScoreBundle {
  const ALL_DIMS: DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
  const snapped = {} as Record<DimensionId, DimensionScore>;
  for (const id of ALL_DIMS) {
    const d = dimensions[id];
    snapped[id] = { ...d, score: snapToTier(d.score) };
  }

  const { total: baseTotal } = calculateTotal(snapped);
  const bonus = computeBonus(bonusSignals);
  const total = Math.min(100, baseTotal + bonus.applied);
  const vetoes = checkVetoes(snapped, isYMYL);
  const level = applyVetoes(calculateLevel(total), vetoes);
  const couplingFlags = [...computeCouplingFlags(snapped), ...extraCouplingFlags];

  return {
    scores: { total, level, indicative: true, dimensions: snapped, bonus },
    vetoes,
    couplingFlags,
  };
}
