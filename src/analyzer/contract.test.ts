/**
 * 契约集成测试：Analyzer 输出 → T2 Scorer 原语，验证 Analyzer↔Scorer 边界可组合。
 * 证明 DimensionAnalysis.rawScore 可被 snapToTier 消费，并产出合法 DimensionScore/总分/等级/veto。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './analyze.ts';
import { makeRaw, makePage } from './fixtures.ts';
import { snapToTier, calculateTotal, calculateLevel, checkVetoes, DIMENSION_WEIGHTS } from '../core/scorer.ts';
import type { DimensionScore, DimensionId } from './imports.ts';
import type { LlmJudge } from './types.ts';

const goodJudge: LlmJudge = async () => ({ rating: 'good', evidence: 'g' });

/** 把 Analyzer 的 DimensionAnalysis 映射为 Scorer 的 DimensionScore（编排层将来做的事）。 */
function toDimensionScores(result: Awaited<ReturnType<typeof analyze>>): Record<DimensionId, DimensionScore> {
  const out = {} as Record<DimensionId, DimensionScore>;
  for (const [id, da] of Object.entries(result.dimensions)) {
    out[id as DimensionId] = {
      score: snapToTier(da.rawScore),
      weight: DIMENSION_WEIGHTS[id as DimensionId],
      partial: da.partial,
      issues: da.issues,
      checks: da.checks,
    };
  }
  return out;
}

describe('Analyzer → Scorer 契约', () => {
  test('rawScore 经 snapToTier 落在 6 档', async () => {
    const r = await analyze(makeRaw(), { market: 'international', judge: goodJudge });
    const dims = toDimensionScores(r);
    for (const id of Object.keys(dims) as DimensionId[]) {
      assert.ok([0, 20, 40, 60, 80, 100].includes(dims[id].score), `${id} 非 6 档: ${dims[id].score}`);
    }
  });

  test('总分/等级可计算且合法', async () => {
    const r = await analyze(makeRaw(), { market: 'international', judge: goodJudge });
    const dims = toDimensionScores(r);
    const { total } = calculateTotal(dims);
    assert.ok(total >= 0 && total <= 100);
    assert.ok(['L0', 'L1', 'L2', 'L3'].includes(calculateLevel(total)));
  });

  test('D5<60 触发一票否决（CSR 空壳 + 禁 bot 拉低 D5）', async () => {
    const raw = makeRaw({
      isCSR: true,
      robots: { exists: true, raw: '', llmBotPolicies: { GPTBot: 'disallow', ClaudeBot: 'disallow', 'Google-Extended': 'disallow', PerplexityBot: 'disallow' }, sitemapUrls: [], prismBotAllowed: false },
      sitemap: { exists: false, urls: [], totalUrlCount: 0, subSitemapUrls: [] },
      cwv: { available: true, performanceScore: 20, strategy: 'mobile' },
      pages: [makePage({ hasContentInViewSource: false, isHttps: false })],
      isHttps: false,
    });
    const r = await analyze(raw, { market: 'international', judge: goodJudge });
    const dims = toDimensionScores(r);
    assert.ok(dims.D5.score < 60, `D5=${dims.D5.score} 应 <60`);
    const vetoes = checkVetoes(dims, r.profile.isYMYL);
    assert.equal(vetoes.find(v => v.rule === 'D5<60')?.triggered, true);
  });
});
