/**
 * Analyzer 模块公共出口（T4/DAI-1274）。
 * 编排层（auditLight）：Collector → analyze() → Scorer/Reporter。
 */
export { analyze } from './analyze.ts';
export { CHECKLIST, ALWAYS_PARTIAL_DIMENSIONS } from './checklist.ts';
export { inferProfile, heuristicClassification } from './profile.ts';
export { buildTopFixes } from './topfixes.ts';
export {
  aggregateRawScore, assembleDimension, buildCheckResult,
  ratingToScoreImpact, ratingToStatus,
} from './aggregate.ts';
export type {
  AnalysisResult, AnalyzeDeps, DimensionAnalysis,
  LlmJudge, JudgeRequest, JudgeVerdict, Rating, CheckDef,
} from './types.ts';
export type { ProfileClassification } from './profile.ts';
