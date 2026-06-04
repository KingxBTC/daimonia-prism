/**
 * 跨模块类型依赖的单一入口。
 * Analyzer 依赖 T2(core/types) 的输出契约 + T3(collector/types) 的输入契约，
 * 集中在此 re-export，便于契约变动时单点对齐。
 */
export type {
  CheckResult,
  DimensionId,
  DimensionScore,
  SiteProfile,
  Market,
  TopFix,
  NicheTier,
  SiteScale,
  CheckStatus,
  BonusSignal,
} from '../core/types.ts';

export type {
  RawSiteData,
  RawPageData,
} from '../collector/types.ts';
