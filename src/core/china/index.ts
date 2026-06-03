/**
 * Prism — china 市场模块公开面（PRD §6.2 / §6.3，Phase 1.1）。
 *
 * Analyzer（T4/DAI-1274）在 market 含 china 时调用 `buildChinaMarketChecks`，
 * 把返回的 CheckResult[] 合并进 D2/D3/D5 维度与 china 专项段。
 * 入口 auditLight（T2/T5）按 `selectChinaEngines(market)` 决定是否走 china 流程。
 */

export * from './facts.ts';
export * from './analysis.ts';
