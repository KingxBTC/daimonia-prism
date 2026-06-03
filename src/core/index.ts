/**
 * Prism core 公共出口（barrel）。
 *
 * 前端形态（skill / web）与下游模块从此导入 core 公共 API：
 *  - 数据契约：AuditReport 及其子结构、AuditInput/AuditOptions（PRD §7.1/§8.2）。
 *  - 统一入口：auditLight / auditDeep（PRD §8.2）。
 *  - 打分器：snapToTier / calculateTotal / calculateLevel / checkVetoes / applyVetoes /
 *           computeCouplingFlags / buildScores（PRD §3/§4/§5.3）。
 *
 * 渲染层只消费 AuditReport，不重新判断（CLAUDE.md §4 报告契约）。
 */

export type {
  Market,
  AuditTier,
  NicheTier,
  SiteScale,
  Level,
  DimensionId,
  CheckStatus,
  CheckResult,
  AuditMeta,
  SiteProfile,
  DimensionScore,
  Scores,
  Veto,
  CouplingFlag,
  TopFix,
  AuditReport,
  AuditInput,
  AuditOptions,
} from './types.ts';

export {
  DIMENSION_WEIGHTS,
  DEEP_ONLY_NOT_EVALUATED,
  SCORE_TIERS,
  COUPLING_GAP_THRESHOLD,
  COUPLING_WEAK_TIER,
  snapToTier,
  calculateLevel,
  calculateTotal,
  checkVetoes,
  applyVetoes,
  computeCouplingFlags,
  buildScores,
} from './scorer.ts';
export type { ScoreBundle } from './scorer.ts';

export { auditLight, auditDeep } from './audit.ts';
