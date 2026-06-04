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
  computeBonus,
  BONUS_CAP,
} from '../src/core/scorer.ts';
import { auditLight, auditDeep } from '../src/core/audit.ts';
import type { BonusSignal, DimensionId, DimensionScore } from '../src/core/types.ts';

/** 构造测试用加分信号。 */
function sig(points: number, id = 'B.test'): BonusSignal {
  return { id, name: id, dimension: 'D1', points, evidence: '' };
}

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

describe('computeBonus — 加分聚合 + 封顶（DAI-1329 / I2）', () => {
  test('求和多个信号', () => {
    assert.strictEqual(computeBonus([sig(4), sig(2), sig(1)]).applied, 7);
  });

  test('封顶在 BONUS_CAP', () => {
    const b = computeBonus([sig(BONUS_CAP), sig(5)]);
    assert.strictEqual(b.applied, BONUS_CAP);
    assert.strictEqual(b.cap, BONUS_CAP);
  });

  test('负分被夹为 0；空 → applied 0', () => {
    assert.strictEqual(computeBonus([sig(-3)]).applied, 0);
    assert.strictEqual(computeBonus([]).applied, 0);
    assert.strictEqual(computeBonus().applied, 0);
  });

  test('signals 原样回传（透明列出）', () => {
    const s = [sig(2, 'B.rich_schema')];
    assert.deepStrictEqual(computeBonus(s).signals, s);
  });
});

describe('buildScores × bonus — snap 交互 + 6 档不变量（DAI-1329 / I2）', () => {
  const baseDims = () => dims({ D1: 60, D2: 60, D3: 60, D4: 60, D5: 60 });

  test('含信号站总分 > 无信号同结构站（核心验收）', () => {
    const without = buildScores(baseDims(), false).scores.total;
    const withSig = buildScores(baseDims(), false, [], [sig(4), sig(2)]).scores.total;
    assert.ok(withSig > without, `含信号应更高：${withSig} vs ${without}`);
    assert.strictEqual(without, 60);
    assert.strictEqual(withSig, 66); // 60 + 6
  });

  test('加分不触碰维度分（6 档单维不变量保持）', () => {
    const { scores } = buildScores(baseDims(), false, [], [sig(BONUS_CAP)]);
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as DimensionId[]) {
      assert.strictEqual(scores.dimensions[id].score, 60, `${id} 维度分不应被加分改变`);
    }
    assert.strictEqual(scores.bonus?.applied, BONUS_CAP);
  });

  test('总分夹紧 ≤100（满分站 + 加分仍 100）', () => {
    const full = dims({ D1: 100, D2: 100, D3: 100, D4: 100, D5: 100 });
    assert.strictEqual(buildScores(full, false, [], [sig(BONUS_CAP)]).scores.total, 100);
  });

  test('加分可推动等级跨档（60/L1 + bonus → L2）', () => {
    const without = buildScores(baseDims(), false);
    assert.strictEqual(without.scores.level, 'L1');
    const withSig = buildScores(baseDims(), false, [], [sig(2)]); // 60 → 62
    assert.strictEqual(withSig.scores.total, 62);
    assert.strictEqual(withSig.scores.level, 'L2');
  });

  test('一票否决优先于加分（veto 命中仍 L0）', () => {
    const d = dims({ D1: 100, D2: 100, D3: 100, D4: 100, D5: 40 }); // D5<60 veto
    const { scores } = buildScores(d, false, [], [sig(BONUS_CAP)]);
    assert.strictEqual(scores.level, 'L0');
  });

  test('snap 后再加分：维度 79→snap60，加权 60，+bonus 只加在总分', () => {
    const { scores } = buildScores(
      dims({ D1: 79, D2: 79, D3: 79, D4: 79, D5: 79 }), false, [], [sig(4)],
    );
    assert.strictEqual(scores.dimensions.D1.score, 60); // 防御性 snap
    assert.strictEqual(scores.total, 64); // 60 + 4
  });

  test('无信号时 bonus.applied=0，总分等于纯加权和（向后兼容）', () => {
    const { scores } = buildScores(baseDims(), false);
    assert.strictEqual(scores.total, 60);
    assert.strictEqual(scores.bonus?.applied, 0);
  });
});

describe('auditLight / auditDeep — §8.2 接口签名', () => {
  // auditLight 接线后「永不崩」契约：不可达 URL → resolve 成 error AuditReport（不抛）
  test('auditLight：不可达 URL → resolve 成 error AuditReport（PRD §10 永不崩）', async () => {
    const report = await auditLight({
      url: 'https://no-such-domain-xyz-prism.invalid',
      market: 'international',
    });
    assert.ok(report, '应返回 AuditReport，而非 throw');
    assert.strictEqual(report.meta.error, 'unreachable', 'error 字段应为 unreachable');
    assert.strictEqual(report.scores, undefined, '不可达报告不含 scores');
    assert.ok(report.meta.errorHint, '应有排查提示');
  });

  test('auditDeep 未实现 → reject（Phase 3 预留）', async () => {
    await assert.rejects(
      () => auditDeep({ url: 'https://example.com', market: 'international' }),
      /Deep|未实现|Phase 3/,
    );
  });
});
