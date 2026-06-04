/**
 * DAI-1328 —— judge-from-file 适配器 + recording-judge + agent-judge 接线验收。
 * node:test 零依赖（CLAUDE.md 工具链约定）。
 *
 * 核心验收（issue output 要求）：agent-judge 注入后，D2/D3/D4 的 llm 项不再返常量。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseVerdicts, createFileJudge } from '../../skill/judge/from-file.ts';
import { createRecordingJudge } from '../../skill/judge/recording-judge.ts';
import { analyze } from '../../src/analyzer/analyze.ts';
import { CHECKLIST } from '../../src/analyzer/checklist.ts';
import { makeRaw } from '../../src/analyzer/fixtures.ts';
import type { JudgeVerdict } from '../../src/analyzer/types.ts';

const LLM_IDS = CHECKLIST.filter(c => c.kind === 'llm').map(c => c.id);

// ── parseVerdicts ──────────────────────────────────────────────────────────

test('parseVerdicts: 接受数组与 {verdicts:[]} 两种顶层结构', () => {
  const arr = parseVerdicts([{ checkId: 'D1.nav_clarity', rating: 'good', evidence: 'ok' }]);
  assert.equal(arr.get('D1.nav_clarity')?.rating, 'good');
  const wrapped = parseVerdicts({ verdicts: [{ checkId: 'D2.self_contained', rating: 'poor', evidence: 'x' }] });
  assert.equal(wrapped.get('D2.self_contained')?.rating, 'poor');
});

test('parseVerdicts: 非法 rating 抛错', () => {
  assert.throws(
    () => parseVerdicts([{ checkId: 'D1.nav_clarity', rating: 'excellent' as never, evidence: 'x' }]),
    /rating 非法/,
  );
});

test('parseVerdicts: 缺 checkId 抛错', () => {
  assert.throws(() => parseVerdicts([{ rating: 'good', evidence: 'x' } as never]), /缺 checkId/);
});

test('parseVerdicts: 空 evidence 回填占位', () => {
  const m = parseVerdicts([{ checkId: 'D1.nav_clarity', rating: 'good', evidence: '' }]);
  assert.match(m.get('D1.nav_clarity')!.evidence, /未给 evidence/);
});

// ── createFileJudge ─────────────────────────────────────────────────────────

test('createFileJudge: 命中 checkId 返回 verdict', async () => {
  const v: JudgeVerdict = { rating: 'good', evidence: '署名+机构背书齐全' };
  const judge = createFileJudge(new Map([['D3.author_credentials', v]]));
  const got = await judge({ checkId: 'D3.author_credentials', dimension: 'D3', name: '', instruction: '', context: '' });
  assert.deepEqual(got, v);
});

test('createFileJudge: 缺 checkId 抛错（交 Analyzer 降级）', async () => {
  const judge = createFileJudge(new Map());
  await assert.rejects(
    () => judge({ checkId: 'D2.micro_emphasis', dimension: 'D2', name: '', instruction: '', context: '' }),
    /缺 checkId=D2.micro_emphasis/,
  );
});

// ── recording-judge ─────────────────────────────────────────────────────────

test('recording-judge: 收集全部 llm 检查项的 {checkId,instruction,context}', async () => {
  const { judge, prompts } = createRecordingJudge();
  await analyze(makeRaw(), { market: 'international', judge });
  const ids = prompts.map(p => p.checkId).sort();
  assert.deepEqual(ids, [...LLM_IDS].sort(), '收集到的 prompt 应覆盖全部 llm 检查项');
  for (const p of prompts) {
    assert.ok(p.instruction.length > 0, `${p.checkId} 应有 instruction`);
    assert.equal(typeof p.context, 'string', `${p.checkId} 应有 context`);
  }
});

// ── 端到端接线：agent-judge 后 llm 项不再返常量（issue 核心验收）──────────────

test('agent-judge 注入后：全部 llm 检查项采用 verdict，不再走常量兜底', async () => {
  // 宿主 agent 把每个 llm 项判为 good（区别于多数常量兜底 partial/poor）
  const verdicts = new Map<string, JudgeVerdict>(
    LLM_IDS.map(id => [id, { rating: 'good', evidence: `agent 判定 ${id} = good` }]),
  );
  const withJudge = await analyze(makeRaw(), { market: 'international', judge: createFileJudge(verdicts) });

  for (const dim of ['D1', 'D2', 'D3', 'D4'] as const) {
    for (const check of withJudge.dimensions[dim].checks) {
      if (!LLM_IDS.includes(check.id)) continue;
      assert.equal(check.status, 'pass', `${check.id} 应采用 agent verdict(good→pass)`);
      assert.match(check.evidence, /agent 判定/, `${check.id} evidence 应来自 verdict`);
    }
  }
});

test('对照：无 judge 时 D3.author_credentials 走常量兜底 poor(fail)', async () => {
  const noJudge = await analyze(makeRaw(), { market: 'international' });
  const author = noJudge.dimensions.D3.checks.find(c => c.id === 'D3.author_credentials')!;
  assert.equal(author.status, 'fail', '无 judge → 常量兜底 poor');

  const verdicts = new Map<string, JudgeVerdict>([
    ['D3.author_credentials', { rating: 'good', evidence: '有作者+资质' }],
  ]);
  const withJudge = await analyze(makeRaw(), { market: 'international', judge: createFileJudge(verdicts) });
  const author2 = withJudge.dimensions.D3.checks.find(c => c.id === 'D3.author_credentials')!;
  assert.equal(author2.status, 'pass', '有 judge → 采用 verdict good');
  assert.notEqual(author.status, author2.status, '接线前后行为应不同（证明 judge 真的生效）');
});
