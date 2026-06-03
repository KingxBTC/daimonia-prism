/**
 * Prism core 主输出契约 —— `AuditReport` 及其子结构。
 *
 * source of truth: docs/prd_v1.md §7.1。
 *
 * 架构约定（CLAUDE.md §1/§4）：
 *  - 这是 core 与渲染层之间的**唯一数据契约**。Scorer/Reporter（T2/DAI-1272）产出本结构，
 *    渲染层（T5/本文件邻接的 skill/render/*）只消费本结构，不重新判断。
 *  - T2 落地 Scorer 时应复用本文件定义；若需调整，须在 PRD §7.1 同步并通知 T5 渲染层。
 *  - Deep 预留（§8.2）：`auditTier:'deep'` 复用同结构，填充 Light 标 notEvaluated 的子项。
 */

export type Market = 'international' | 'china' | 'both';
export type AuditTier = 'light' | 'deep';

/** core 统一入口的输入契约（PRD §8.2）。 */
export interface AuditInput {
  url: string;
  market: Market;
}

/** core 统一入口的可选项（PRD §8.2）：进度回调等。 */
export interface AuditOptions {
  onProgress?(stage: string, pct: number): void;
}
export type NicheTier = 'head' | 'mid' | 'niche';
export type SiteScale = '<100' | '100-1000' | '>1000';
export type Level = 'L0' | 'L1' | 'L2' | 'L3';
export type DimensionId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

/** 单个检查项结果（PRD §7.1 CheckResult 子结构）。 */
export type CheckStatus = 'pass' | 'partial' | 'fail' | 'na';
export interface CheckResult {
  id: string;            // e.g. "D2.llms_txt"
  name: string;
  tier: string;          // "L" | "D" | "L+D"
  status: CheckStatus;
  evidence: string;
  scoreImpact: number;   // 对维度分的影响（可正可负）
}

/** 审计元信息。`error` 非空表示采集失败的 error/partial 报告（PRD §10）。 */
export interface AuditMeta {
  url: string;
  market: Market;
  auditTier: AuditTier;
  standardVersion: string;
  prismVersion: string;
  timestamp: string;
  durationMs: number;
  sampledPages: string[];
  /** 仅在采集失败时出现，见 PRD §10：unreachable | non_html | robots_blocked | ... */
  error?: string;
  /** error 报告时给用户的排查/处置提示。 */
  errorHint?: string;
}

export interface SiteProfile {
  domain: string;
  businessType: string;
  isYMYL: boolean;
  ymylCategory?: string;
  nicheTier: NicheTier;
  siteScale: SiteScale;
  primaryLanguage: string;
  geoMarket: string;
  targetEngines: string[];
}

export interface DimensionScore {
  score: number;        // 0..100，6 档之一
  weight: number;       // 0.20 / 0.25 / 0.10
  partial: boolean;     // D3/D4 Light 仅站内可见子项时为 true
  issues: string[];
  checks: CheckResult[];
}

export interface Scores {
  total: number;
  level: Level;
  indicative: boolean;
  dimensions: Record<DimensionId, DimensionScore>;
}

export interface Veto {
  rule: string;          // "D5<60" | "YMYL_D3<40"
  triggered: boolean;
}

export interface CouplingFlag {
  code: string;          // "D1xD2_mismatch" | "csr_empty_html" | ...
  note: string;
}

export interface TopFix {
  priority: number;
  dimension: DimensionId;
  method: string;
  action: string;
  rationale: string;
  effort: 'low' | 'mid' | 'high';
}

export interface AuditReport {
  meta: AuditMeta;
  profile?: SiteProfile;        // error 报告可能缺画像
  scores?: Scores;              // error 报告可能缺分数
  vetoes: Veto[];
  couplingFlags: CouplingFlag[];
  notEvaluated: string[];
  nicheWarning?: string;
  topFixes: TopFix[];
  deepAuditRecommended: boolean;
  deepAuditRationale: string;
}
