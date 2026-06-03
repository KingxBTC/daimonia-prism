/**
 * §10 错误处理 — 降级策略与 partial/error AuditReport 构建器。
 *
 * 核心原则（PRD §10）：
 *  - core 对前端的契约是"尽力而为 + 永远返回结构化结果"，绝不抛裸异常。
 *  - Terminal 错误（unreachable/non_html）：返回 error report（无 profile/scores）。
 *  - Degraded 错误（robots/CSR/pagespeed/LLM/partial）：返回 partial report，
 *    失败维度标 na/partial，总分按可评维度重算并提示偏差。
 */

import type {
  AuditReport, AuditMeta, DimensionScore, DimensionId, Market, CheckResult,
} from './types.ts';
import { DEEP_ONLY_NOT_EVALUATED } from './scorer.ts';

const PRISM_VERSION = '1.0';
const STANDARD_VERSION = 'geo_audit_standard v0.5.1';

function baseMeta(url: string, market: Market, durationMs = 0): AuditMeta {
  return {
    url,
    market,
    auditTier: 'light',
    standardVersion: STANDARD_VERSION,
    prismVersion: PRISM_VERSION,
    timestamp: new Date().toISOString(),
    durationMs,
    sampledPages: [],
  };
}

function baseReport(meta: AuditMeta): AuditReport {
  return {
    meta,
    vetoes: [],
    couplingFlags: [],
    notEvaluated: [...DEEP_ONLY_NOT_EVALUATED],
    topFixes: [],
    deepAuditRecommended: false,
    deepAuditRationale: '',
  };
}

// ---------------------------------------------------------------------------
// Terminal errors — 无 profile/scores，返回 error report
// ---------------------------------------------------------------------------

/**
 * URL 不可达（DNS 失败/超时）——已重试 https→http 仍失败。
 * PRD §10 行 1：`meta.error="unreachable"`
 */
export function makeUnreachableReport(
  url: string,
  market: Market,
  durationMs = 0,
): AuditReport {
  const meta = baseMeta(url, market, durationMs);
  meta.error = 'unreachable';
  meta.errorHint =
    'DNS 解析失败或连接超时，已重试 https→http 仍不可达。请确认域名拼写、站点是否在线、是否需要内网/授权访问。';
  return {
    ...baseReport(meta),
    notEvaluated: ['全部维度（站点不可达，未采集到任何数据）'],
    deepAuditRecommended: false,
    deepAuditRationale: '站点不可达，无法审计。恢复可达后重试。',
  };
}

/**
 * 非 HTML 响应（PDF/纯 JSON API 等）。
 * PRD §10：终止，提示"Prism 审计 HTML 网站"。
 */
export function makeNonHtmlReport(
  url: string,
  market: Market,
  contentType: string,
  durationMs = 0,
): AuditReport {
  const meta = baseMeta(url, market, durationMs);
  meta.error = 'non_html';
  meta.errorHint = `该 URL 返回 ${contentType}，Prism 仅审计 HTML 网站。若需审计 PDF 内容请先转为 HTML 页面。`;
  return {
    ...baseReport(meta),
    notEvaluated: ['全部维度（非 HTML 响应，无法解析）'],
    deepAuditRecommended: false,
    deepAuditRationale: '非 HTML 内容，无法运行 GEO 审计。',
  };
}

// ---------------------------------------------------------------------------
// Degraded / partial reports — 有 profile，部分维度 na/partial
// ---------------------------------------------------------------------------

/**
 * NA 维度占位符（CheckResult 级别标注）。
 */
export function makeNaDimension(reason: string): DimensionScore {
  return {
    score: 0,
    weight: 0,
    partial: false,
    issues: [reason],
    checks: [{
      id: 'na.blocked',
      name: 'N/A — 无法评估',
      tier: 'L',
      status: 'na',
      evidence: reason,
      scoreImpact: 0,
    } satisfies CheckResult],
  };
}

/**
 * robots.txt 禁止抓取 —— D5 可评，D1/D2/D3/D4 标 na。
 * PRD §10：尊重 robots；D5 照评，内容维度标 na。
 */
export function applyRobotsBlock(
  report: AuditReport,
  robotsEvidence: string,
): AuditReport {
  const naReason = `robots.txt 禁止抓取内容页（${robotsEvidence}），仅站级文件可用`;
  const blockedDims: DimensionId[] = ['D1', 'D2', 'D3', 'D4'];
  if (!report.scores) return report;

  for (const dim of blockedDims) {
    report.scores.dimensions[dim] = makeNaDimension(naReason);
    report.scores.dimensions[dim].weight = { D1: 0.20, D2: 0.20, D3: 0.25, D4: 0.25, D5: 0.10 }[dim];
  }

  report.couplingFlags.push({
    code: 'robots_content_blocked',
    note: `${robotsEvidence}；内容维度 D1/D2/D3/D4 标 na，D5 按站级文件评分。建议开放授权后再做完整审计。`,
  });
  return report;
}

/**
 * CSR 空壳 —— view-source 无内容，内容维度提示仅 D5 + 渲染告警。
 * PRD §10：D5 照评 + D1 渲染模式判 CSR 风险；couplingFlags: csr_empty_html。
 */
export function applyCsrEmpty(report: AuditReport): AuditReport {
  const naReason = 'CSR 空壳：view-source 无实质内容，需可执行 JS 抓取，Light 仅给 D5 + 渲染告警';
  const nadims: DimensionId[] = ['D2', 'D3', 'D4'];
  if (!report.scores) return report;

  for (const dim of nadims) {
    report.scores.dimensions[dim] = makeNaDimension(naReason);
    report.scores.dimensions[dim].weight = { D1: 0.20, D2: 0.20, D3: 0.25, D4: 0.25, D5: 0.10 }[dim];
  }

  report.couplingFlags.push({
    code: 'csr_empty_html',
    note: 'view-source 无实质内容；LLM 引擎通常能执行 JS，但 Light 档采集依赖静态 HTML，评分有限，建议使用 headless 渲染后再审计',
  });
  return report;
}

/**
 * PageSpeed API 失败 —— D5 的 CWV 子项标 partial，其余 D5 项照评。
 * PRD §10：不阻塞整体，标"CWV 未取到"。
 */
export function patchPageSpeedFailure(d5: DimensionScore, errorDetail: string): DimensionScore {
  const cwvCheck: CheckResult = {
    id: 'D5.cwv',
    name: 'Core Web Vitals（PageSpeed Insights）',
    tier: 'L',
    status: 'partial',
    evidence: `PageSpeed API 失败，CWV 未取到（${errorDetail}）`,
    scoreImpact: 0,
  };
  const existing = d5.checks.filter(c => c.id !== 'D5.cwv');
  return {
    ...d5,
    partial: true,
    issues: [...d5.issues, 'CWV 未取到（PageSpeed API 失败）'],
    checks: [...existing, cwvCheck],
  };
}

/**
 * LLM 判断步骤失败 —— 该维度重试 1 次仍失败时调用，降级为规则判断 + 标 partial。
 * PRD §10：维度 `partial=true`，不整体崩。
 */
export function patchLlmFailure(
  dim: DimensionScore,
  dimensionId: DimensionId,
  errorDetail: string,
): DimensionScore {
  return {
    ...dim,
    partial: true,
    issues: [...dim.issues, `LLM 判断失败（${errorDetail}），已降级为规则判断，分数仅供参考`],
    checks: [...dim.checks, {
      id: `${dimensionId}.llm_fallback`,
      name: 'LLM 判断降级',
      tier: 'L',
      status: 'partial',
      evidence: errorDetail,
      scoreImpact: 0,
    } satisfies CheckResult],
  };
}

/**
 * 登录/付费墙 —— 不绕过，标 na + 提示。
 * PRD §10：不绕过；标 na + "需授权后 Deep 审计"。
 */
export function makePaywallReport(
  url: string,
  market: Market,
  durationMs = 0,
): AuditReport {
  const meta = baseMeta(url, market, durationMs);
  meta.error = 'paywall';
  meta.errorHint = '该站点存在登录/付费墙，Prism 不绕过访问控制。如需审计，请提供授权访问或使用 Deep 审计（授权模式）。';
  return {
    ...baseReport(meta),
    notEvaluated: ['全部维度（登录/付费墙阻止内容访问）'],
    deepAuditRecommended: true,
    deepAuditRationale: '需授权后 Deep 审计',
  };
}
