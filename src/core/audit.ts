/**
 * Prism core 统一入口（PRD §8.2 实现契约）。
 *
 * 架构约定（CLAUDE.md §1 Core 与前端形态解耦）：
 *  - skill / web 两个前端**只调本文件的 auditLight**，不得各自实现采集/打分。
 *  - 编排链路：Collector(T3/DAI-1273, 产 RawSiteData)
 *              → Analyzer(T4/DAI-1274, 产 CheckResult/维度分)
 *              → Scorer/Reporter(T2, buildScores + 渲染)。
 *
 * 错误处理（PRD §10）：永不整体崩，所有异常都被捕获并返回降级 AuditReport。
 * 调用方保证收到结构化结果；裸异常只在 URL 解析彻底失败时才上抛（框架级错误）。
 */

import { collect } from '../collector/index.ts';
import { FetchError } from '../collector/http.ts';
import { analyze } from '../analyzer/analyze.ts';
import {
  buildScores, snapToTier, DIMENSION_WEIGHTS,
} from './scorer.ts';
import {
  makeUnreachableReport, makeNonHtmlReport, makeNaDimension,
  patchPageSpeedFailure,
} from './errors.ts';
import type {
  AuditInput, AuditOptions, AuditReport, DimensionId, DimensionScore, Market,
} from './types.ts';

const PRISM_VERSION = '1.0';
const STANDARD_VERSION = 'geo_audit_standard v0.5.1';

/**
 * Light 审计统一入口（PRD §8.2，MVP 实现）。
 *
 * 永远返回结构化 AuditReport（PRD §10 契约）。
 * 不注入 LLM judge 时，llm 型检查项全部走启发式兜底（适合 CI / 集成测试）。
 * 注入 judge 时（skill / web 形态），LLM 判断项调外部 judge。
 */
export async function auditLight(
  input: AuditInput,
  opts?: AuditOptions & { judge?: import('../analyzer/types.ts').LlmJudge },
): Promise<AuditReport> {
  const { url, market } = input;
  const progress = opts?.onProgress ?? (() => {});
  const startMs = performance.now();

  // ── 1. Collect ──────────────────────────────────────────────────────────
  progress('collect', 0);
  let raw: Awaited<ReturnType<typeof collect>>;
  try {
    raw = await collect(url, {
      market,
      onProgress: (stage) => progress(`collect:${stage}`, 0.2),
    });
  } catch (err) {
    const durationMs = elapsed(startMs);
    if (err instanceof FetchError) {
      const stage = err.stage;
      if (stage === 'non_html') {
        const ct = extractContentType(err.message) ?? 'unknown/type';
        return makeNonHtmlReport(url, market, ct, durationMs);
      }
    }
    return makeUnreachableReport(url, market, durationMs);
  }

  // ── 2. Analyze ──────────────────────────────────────────────────────────
  progress('analyze', 0.4);
  let result: Awaited<ReturnType<typeof analyze>>;
  try {
    result = await analyze(raw, { market, judge: opts?.judge });
  } catch {
    // analyze は pages がある限り throw しないはず; もしくれば unreachable 扱い
    return makeUnreachableReport(url, market, elapsed(startMs));
  }

  // ── 3. DimensionAnalysis → DimensionScore (raw, buildScores がsnap) ──
  const dimensions = {} as Record<DimensionId, DimensionScore>;
  for (const dim of ['D1', 'D2', 'D3', 'D4', 'D5'] as DimensionId[]) {
    const a = result.dimensions[dim];
    dimensions[dim] = {
      score: a.rawScore,              // buildScores 内で snapToTier する
      weight: DIMENSION_WEIGHTS[dim],
      partial: a.partial,
      issues: a.issues,
      checks: a.checks,
    };
  }

  // ── 4. 额外 coupling flags（采集层信号）──────────────────────────────
  const extraCouplingFlags: import('./types.ts').CouplingFlag[] = [];

  if (raw.isCSR) {
    extraCouplingFlags.push({
      code: 'csr_empty_html',
      note: 'view-source 无实质内容；LLM 引擎通常能执行 JS，但 Light 档采集依赖静态 HTML，内容维度评分有限，建议使用 headless 渲染后再审计',
    });
  }

  // ── 5. robots 封锁：D1/D2/D3/D4 → na ──────────────────────────────────
  if (!raw.robots.prismBotAllowed) {
    const naReason = 'robots.txt 禁止 PrismBot 抓取内容页，内容维度 D1/D2/D3/D4 标 na';
    for (const dim of ['D1', 'D2', 'D3', 'D4'] as DimensionId[]) {
      const naD = makeNaDimension(naReason);
      dimensions[dim] = { ...naD, weight: DIMENSION_WEIGHTS[dim] };
    }
    extraCouplingFlags.push({
      code: 'robots_content_blocked',
      note: `${naReason}。D5 按站级文件（robots/sitemap）照评。建议授权后进行完整审计。`,
    });
  }

  // ── 6. PageSpeed API 失败：D5.cwv 子项 partial ──────────────────────
  if (!raw.cwv.available) {
    dimensions.D5 = patchPageSpeedFailure(
      dimensions.D5,
      raw.cwv.error ?? 'PageSpeed API 不可用',
    );
  }

  // ── 7. buildScores（确定性聚合：snap/等级/veto/coupling）─────────────
  progress('score', 0.8);
  // robots 封锁内容时 D1-D4 标 na，不奖励无法完整审计的站 → 抑制 bonus（诚实归因）。
  const bonusSignals = raw.robots.prismBotAllowed ? result.bonusSignals : [];
  const { scores, vetoes, couplingFlags } = buildScores(
    dimensions,
    result.profile.isYMYL,
    extraCouplingFlags,
    bonusSignals,
  );

  const durationMs = elapsed(startMs);

  // ── 8. 组装最终 AuditReport ───────────────────────────────────────────
  progress('report', 0.95);
  const anyVeto = vetoes.some(v => v.triggered);
  const deepRec = buildDeepAuditRec(result.profile, scores.level, anyVeto, !!raw.isCSR);

  return {
    meta: {
      url,
      market,
      auditTier: 'light',
      standardVersion: STANDARD_VERSION,
      prismVersion: PRISM_VERSION,
      timestamp: new Date().toISOString(),
      durationMs,
      sampledPages: raw.pages.map(p => p.finalUrl),
    },
    profile: result.profile,
    scores,
    vetoes,
    couplingFlags,
    notEvaluated: result.notEvaluated,
    nicheWarning: result.profile.nicheTier === 'niche'
      ? '当前 indicative 分数对 Niche 主体易虚高，Deep 审计可能触发 L2 封顶'
      : undefined,
    topFixes: result.topFixes,
    deepAuditRecommended: deepRec.recommended,
    deepAuditRationale: deepRec.rationale,
  };
}

/**
 * Deep 审计入口（PRD §8.2 / §14 King 决策 #3）—— 同签名预留，MVP 不实现。
 */
export async function auditDeep(
  _input: AuditInput,
  _opts?: AuditOptions,
): Promise<AuditReport> {
  throw new Error(
    'auditDeep 未实现：Phase 3 商业化形态（agent 全自动），当前仅预留 PRD §8.2 接口签名。',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function elapsed(startMs: number): number {
  return Math.round(performance.now() - startMs);
}

/** 从 FetchError.message 中提取 content type 字符串。 */
function extractContentType(msg: string): string | null {
  const m = msg.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

/** Deep 审计推荐逻辑（PRD §7.2 要素 5）。 */
function buildDeepAuditRec(
  profile: import('./types.ts').SiteProfile,
  level: import('./types.ts').Level,
  anyVeto: boolean,
  isCSR: boolean,
): { recommended: boolean; rationale: string } {
  const reasons: string[] = [];

  if (anyVeto) reasons.push('一票否决触发（L0），根因修复后需 Deep 重评');
  if (profile.isYMYL) reasons.push('YMYL 领域，权威性 earned media 需 Deep 实测');
  if (profile.nicheTier === 'niche') reasons.push('Niche 主体，Light 分易虚高，Deep 可能触发封顶');
  if (isCSR) reasons.push('CSR 空壳影响内容维度准确性，建议 headless 渲染后 Deep 审计');
  if (level === 'L1' || level === 'L0') reasons.push('综合得分偏低，整改空间大，Deep 可精准定位优先项');

  // D3/D4 部分评（Light 恒 partial）→ 总是建议 Deep
  reasons.push('D3 earned media 覆盖度 + D4 跨 query 稳定性未评，需 Deep 获得完整分数');

  const recommended = reasons.length > 0;
  const rationale = reasons.join('；');
  return { recommended, rationale };
}
