import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './analyze.ts';
import { makeRaw, makePage } from './fixtures.ts';
import type { LlmJudge } from './types.ts';

/** mock judge：所有 llm 项一律 good。 */
const goodJudge: LlmJudge = async () => ({ rating: 'good', evidence: 'mock good' });
/** mock judge：所有 llm 项一律 poor。 */
const poorJudge: LlmJudge = async () => ({ rating: 'poor', evidence: 'mock poor' });
/** mock judge：抛错（测降级）。 */
const throwingJudge: LlmJudge = async () => { throw new Error('LLM timeout'); };

describe('analyze 集成', () => {
  test('健康站 + goodJudge → 5 维度齐全、高分、4 项 notEvaluated', async () => {
    const r = await analyze(makeRaw(), { market: 'international', judge: goodJudge });
    assert.deepEqual(Object.keys(r.dimensions).sort(), ['D1', 'D2', 'D3', 'D4', 'D5']);
    assert.equal(r.notEvaluated.length, 4);
    // 健康 fixture：llms.txt 缺失(-10) 否则 D2 接近满分
    assert.ok(r.dimensions.D1.rawScore >= 80, `D1=${r.dimensions.D1.rawScore}`);
    assert.ok(r.dimensions.D5.rawScore >= 80, `D5=${r.dimensions.D5.rawScore}`);
  });

  test('D3/D4 恒 partial（earned/跨query 未评）', async () => {
    const r = await analyze(makeRaw(), { market: 'international', judge: goodJudge });
    assert.equal(r.dimensions.D3.partial, true);
    assert.equal(r.dimensions.D4.partial, true);
  });

  test('deep 检查项不进 checks（只在 notEvaluated）', async () => {
    const r = await analyze(makeRaw(), { market: 'international', judge: goodJudge });
    const allCheckIds = Object.values(r.dimensions).flatMap(d => d.checks.map(c => c.id));
    assert.ok(!allCheckIds.includes('D3.earned_media'));
    assert.ok(!allCheckIds.includes('D4.cross_query_stability'));
  });

  test('缺 llms.txt → D2 含 llms_txt fail 且 scoreImpact -10', async () => {
    const r = await analyze(makeRaw({ llmsTxt: { exists: false } }), { market: 'international', judge: goodJudge });
    const llms = r.dimensions.D2.checks.find(c => c.id === 'D2.llms_txt');
    assert.equal(llms?.status, 'fail');
    assert.equal(llms?.scoreImpact, -10);
  });

  test('CSR 空壳 → D5 render_mode fail', async () => {
    const raw = makeRaw({ isCSR: true, pages: [makePage({ hasContentInViewSource: false })] });
    const r = await analyze(raw, { market: 'international', judge: goodJudge });
    const render = r.dimensions.D5.checks.find(c => c.id === 'D5.render_mode');
    assert.equal(render?.status, 'fail');
  });

  test('CWV 不可用 → D5.cwv 标 na 且 D5 partial', async () => {
    const raw = makeRaw({ cwv: { available: false, error: 'no api key', strategy: 'mobile' } });
    const r = await analyze(raw, { market: 'international', judge: goodJudge });
    const cwv = r.dimensions.D5.checks.find(c => c.id === 'D5.cwv');
    assert.equal(cwv?.status, 'na');
    assert.equal(r.dimensions.D5.partial, true); // na 项 → partial
  });

  test('无 judge → llm 项走 fallback（不崩，记 partial/poor）', async () => {
    const r = await analyze(makeRaw(), { market: 'international' }); // 无 judge
    const nav = r.dimensions.D1.checks.find(c => c.id === 'D1.nav_clarity');
    assert.ok(nav, 'nav_clarity 应存在');
    assert.ok(['partial', 'fail'].includes(nav!.status));
    assert.ok(nav!.evidence.includes('降级'));
  });

  test('judge 抛错 → 降级 fallback 不崩', async () => {
    const r = await analyze(makeRaw(), { market: 'international', judge: throwingJudge });
    const nav = r.dimensions.D1.checks.find(c => c.id === 'D1.nav_clarity');
    assert.ok(nav!.evidence.includes('LLM 判断失败降级'));
  });

  test('poorJudge + 差站 → 低分 + Top3 整改', async () => {
    const badRaw = makeRaw({
      robots: { exists: true, raw: '', llmBotPolicies: { GPTBot: 'disallow', ClaudeBot: 'disallow', 'Google-Extended': 'disallow', PerplexityBot: 'disallow' }, sitemapUrls: [], prismBotAllowed: false },
      sitemap: { exists: false, urls: [], totalUrlCount: 0, subSitemapUrls: [] },
      llmsTxt: { exists: false },
      pages: [makePage({ jsonLd: [], headings: [], internalLinks: [], textContent: '空' })],
    });
    const r = await analyze(badRaw, { market: 'international', judge: poorJudge });
    assert.ok(r.dimensions.D4.rawScore < 50, `D4=${r.dimensions.D4.rawScore}`);
    assert.ok(r.topFixes.length >= 1 && r.topFixes.length <= 3);
    // Top1 应是高 ROI 方法
    assert.equal(r.topFixes[0].priority, 1);
  });

  test('无页面 → 抛错（编排层应先处理 error 报告）', async () => {
    await assert.rejects(
      () => analyze(makeRaw({ pages: [] }), { market: 'international' }),
      /无可分析页面/,
    );
  });
});

describe('judge 收到正确的检查项上下文', () => {
  test('judge req 含 checkId/dimension/instruction', async () => {
    const seen: string[] = [];
    const spyJudge: LlmJudge = async (req) => {
      seen.push(req.checkId);
      assert.ok(req.instruction.length > 0, `${req.checkId} instruction 为空`);
      assert.ok(['D1', 'D2', 'D3', 'D4', 'D5'].includes(req.dimension));
      return { rating: 'good', evidence: 'x' };
    };
    await analyze(makeRaw(), { market: 'international', judge: spyJudge });
    assert.ok(seen.includes('D1.nav_clarity'));
    assert.ok(seen.includes('D4.conclusion_clarity'));
  });
});
