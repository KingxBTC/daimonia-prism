/**
 * scorer.test.ts — Scorer 核心打分逻辑单元测试（T2 / DAI-1272）
 *
 * 覆盖 PRD §3/§4/§5.3：
 *  - §3.1 6 档单维度打分（snapToTier 向下就近）
 *  - §3.2 加权总分
 *  - §3.3/§4.2 一票否决（checkVetoes + applyVetoes）
 *  - §3.3 耦合 flag（computeCouplingFlags）
 *  - §4.1 等级
 *  - Scorer 装配（buildScores）：snap + total + level(veto 应用) + coupling
 *  - §8.2 auditLight/auditDeep 接口签名占位
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapToTier,
  checkVetoes,
  applyVetoes,
  computeCouplingFlags,
  buildScores,
} from '../src/core/scorer.ts';
import { auditLight, auditDeep } from '../src/core/audit.ts';
import type { DimensionId, DimensionScore } from '../src/core/types.ts';

/** 构造一个最小 DimensionScore（测试用）。 */
function dim(score: number, partial = false): DimensionScore {
  return { score, weight: 0, partial, issues: [], checks: [] };
}

function dims(
  scores: Partial<Record<DimensionId, number>>,
): Record<DimensionId, DimensionScore> {
  return {
    D1: dim(scores.D1 ?? 0),
    D2: dim(scores.D2 ?? 0),
    D3: dim(scores.D3 ?? 0),
    D4: dim(scores.D4 ?? 0),
    D5: dim(scores.D5 ?? 0),
  };
}

describe('snapToTier — 6 档向下就近（PRD §3.1）', () => {
  test('档位边界精确命中', () => {
    assert.strictEqual(snapToTier(100), 100);
    assert.strictEqual(snapToTier(80), 80);
    assert.strictEqual(snapToTier(60), 60);
    assert.strictEqual(snapToTier(40), 40);
    assert.strictEqual(snapToTier(20), 20);
    assert.strictEqual(snapToTier(0), 0);
  });

  test('档位之间向下取（宁可打低不打高）', () => {
    assert.strictEqual(snapToTier(99), 80);
    assert.strictEqual(snapToTier(79), 60);
    assert.strictEqual(snapToTier(61), 60);
    assert.strictEqual(snapToTier(59), 40);
    assert.strictEqual(snapToTier(21), 20);
    assert.strictEqual(snapToTier(19), 0);
  });

  test('越界值被夹紧', () => {
    assert.strictEqual(snapToTier(120), 100);
    assert.strictEqual(snapToTier(-5), 0);
  });
});

describe('checkVetoes — 一票否决规则（PRD §3.3/§4.2）', () => {
  test('D5<60 触发 veto', () => {
    const vetoes = checkVetoes(dims({ D5: 40 }), false);
    const d5 = vetoes.find(v => v.rule === 'D5<60');
    assert.strictEqual(d5?.triggered, true);
  });

  test('D5=60 不触发（边界）', () => {
    const vetoes = checkVetoes(dims({ D5: 60 }), false);
    assert.strictEqual(vetoes.find(v => v.rule === 'D5<60')?.triggered, false);
  });

  test('YMYL 且 D3<40 触发；非 YMYL 不触发', () => {
    const ymyl = checkVetoes(dims({ D3: 20, D5: 80 }), true);
    assert.strictEqual(ymyl.find(v => v.rule === 'YMYL_D3<40')?.triggered, true);
    const nonYmyl = checkVetoes(dims({ D3: 20, D5: 80 }), false);
    assert.strictEqual(nonYmyl.find(v => v.rule === 'YMYL_D3<40')?.triggered, false);
  });

  test('D3=40 边界不触发 YMYL veto', () => {
    const vetoes = checkVetoes(dims({ D3: 40, D5: 80 }), true);
    assert.strictEqual(vetoes.find(v => v.rule === 'YMYL_D3<40')?.triggered, false);
  });

  test('始终返回两条规则', () => {
    assert.strictEqual(checkVetoes(dims({}), false).length, 2);
  });
});

describe('applyVetoes — 命中即锁 L0（PRD §4.2）', () => {
  test('任意 veto triggered → L0', () => {
    assert.strictEqual(
      applyVetoes('L3', [{ rule: 'D5<60', triggered: true }]),
      'L0',
    );
  });

  test('无 veto 命中 → 等级不变', () => {
    assert.strictEqual(
      applyVetoes('L2', [
        { rule: 'D5<60', triggered: false },
        { rule: 'YMYL_D3<40', triggered: false },
      ]),
      'L2',
    );
  });
});

describe('computeCouplingFlags — 维度耦合（PRD §3.3）', () => {
  test('D1 远高于 D2 → D1xD2_mismatch（架构尚可但内容空）', () => {
    const flags = computeCouplingFlags(dims({ D1: 80, D2: 20 }));
    const f = flags.find(x => x.code === 'D1xD2_mismatch');
    assert.ok(f, '应产出 D1xD2_mismatch');
    assert.match(f!.note, /内容/);
  });

  test('D2、D4 同时偏弱 → D4xD2_micro 耦合', () => {
    const flags = computeCouplingFlags(dims({ D2: 40, D4: 40 }));
    assert.ok(flags.some(x => x.code === 'D4xD2_micro'));
  });

  test('维度接近时不产出错配 flag', () => {
    const flags = computeCouplingFlags(dims({ D1: 60, D2: 60, D4: 80 }));
    assert.strictEqual(flags.some(x => x.code === 'D1xD2_mismatch'), false);
  });
});

describe('buildScores — Scorer 装配（PRD §3/§4/§5.3）', () => {
  test('snap 各维度分 + 加权总分 + 等级 + indicative', () => {
    const { scores } = buildScores(dims({ D1: 60, D2: 60, D3: 60, D4: 60, D5: 60 }), false);
    // 全 60：60*1.0 = 60 → L1
    assert.strictEqual(scores.total, 60);
    assert.strictEqual(scores.level, 'L1');
    assert.strictEqual(scores.indicative, true);
    // 各维度被强制 snap 到 6 档
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as DimensionId[]) {
      assert.ok([0, 20, 40, 60, 80, 100].includes(scores.dimensions[id].score));
    }
  });

  test('原始分被防御性 snap（79→60）', () => {
    const { scores } = buildScores(dims({ D1: 79, D2: 79, D3: 79, D4: 79, D5: 79 }), false);
    assert.strictEqual(scores.dimensions.D1.score, 60);
    assert.strictEqual(scores.total, 60);
  });

  test('D5<60 一票否决：即使总分高，等级锁 L0', () => {
    const { scores, vetoes } = buildScores(
      dims({ D1: 100, D2: 100, D3: 100, D4: 100, D5: 40 }),
      false,
    );
    assert.ok(scores.total >= 81, '总分本应 L3 区间');
    assert.strictEqual(scores.level, 'L0');
    assert.strictEqual(vetoes.find(v => v.rule === 'D5<60')?.triggered, true);
  });

  test('注入的额外耦合 flag（如 csr_empty_html）被合并', () => {
    const { couplingFlags } = buildScores(dims({ D1: 60, D2: 60, D3: 60, D4: 60, D5: 60 }), false, [
      { code: 'csr_empty_html', note: 'view-source 无内容' },
    ]);
    assert.ok(couplingFlags.some(f => f.code === 'csr_empty_html'));
  });
});

describe('auditLight / auditDeep — §8.2 接口签名占位', () => {
  test('auditLight 未接线 → reject（依赖 T3/T4）', async () => {
    await assert.rejects(
      () => auditLight({ url: 'https://example.com', market: 'international' }),
      /Collector|Analyzer|接线/,
    );
  });

  test('auditDeep 未实现 → reject（Phase 3 预留）', async () => {
    await assert.rejects(
      () => auditDeep({ url: 'https://example.com', market: 'international' }),
      /Deep|未实现|Phase 3/,
    );
  });
});
