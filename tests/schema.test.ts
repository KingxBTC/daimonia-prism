/**
 * schema.test.ts — AuditReport JSON schema 校验
 *
 * 验收条件（PRD §12.3 架构验收）：
 *  - fixture 文件符合 §7.1 schema 结构
 *  - error report 有 meta.error，无 scores/profile
 *  - 所有 Light 报告 notEvaluated 包含 4 项 Deep-only 条目
 *  - 分数满足权重公式
 */

import { test, suite, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEEP_ONLY_NOT_EVALUATED, calculateLevel, calculateTotal } from '../src/core/scorer.ts';
import type { AuditReport } from '../src/core/types.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dir, '../skill/fixtures');

function loadFixture(name: string): AuditReport {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as AuditReport;
}

// ---------------------------------------------------------------------------
// §12.3 架构验收 — 渲染层不重判
// ---------------------------------------------------------------------------

describe('AuditReport schema: 基本结构完整性', () => {
  test('sample-report 必含 §7.2 五要素', () => {
    const report = loadFixture('sample-report.json');
    // 1. 总分 + 等级
    assert.ok(report.scores?.total !== undefined, '缺 scores.total');
    assert.ok(report.scores?.level, '缺 scores.level');
    // 2. 5 维度分
    for (const dim of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      assert.ok(report.scores?.dimensions[dim], `缺维度 ${dim}`);
    }
    // 3. notEvaluated 非空
    assert.ok(report.notEvaluated.length > 0, 'notEvaluated 为空');
    // 4. topFixes 存在（可为空数组）
    assert.ok(Array.isArray(report.topFixes), '缺 topFixes');
    // 5. deepAuditRecommended 明确声明
    assert.ok(typeof report.deepAuditRecommended === 'boolean', '缺 deepAuditRecommended');
  });

  test('sample-report indicative=true（Light 档要求）', () => {
    const report = loadFixture('sample-report.json');
    assert.strictEqual(report.scores?.indicative, true);
  });

  test('sample-report notEvaluated 包含全部 4 项 Deep-only 条目（PRD §12 验收条件）', () => {
    const report = loadFixture('sample-report.json');
    for (const item of DEEP_ONLY_NOT_EVALUATED) {
      assert.ok(
        report.notEvaluated.includes(item),
        `notEvaluated 缺 "${item}"`,
      );
    }
  });

  test('sample-report vetoes 数组包含 D5<60 和 YMYL_D3<40 两条规则', () => {
    const report = loadFixture('sample-report.json');
    const rules = report.vetoes.map(v => v.rule);
    assert.ok(rules.includes('D5<60'), '缺 D5<60 veto');
    assert.ok(rules.includes('YMYL_D3<40'), '缺 YMYL_D3<40 veto');
  });

  test('sample-report D5=70(>=60) → D5<60 veto 未触发', () => {
    const report = loadFixture('sample-report.json');
    const d5Veto = report.vetoes.find(v => v.rule === 'D5<60');
    assert.ok(d5Veto, 'D5<60 veto 条目不存在');
    assert.strictEqual(d5Veto.triggered, false, 'D5=70 不应触发 D5<60 veto');
  });

  test('sample-report D3=45(>=40) + YMYL=true → YMYL_D3<40 veto 未触发', () => {
    const report = loadFixture('sample-report.json');
    const ymylVeto = report.vetoes.find(v => v.rule === 'YMYL_D3<40');
    assert.ok(ymylVeto, 'YMYL_D3<40 veto 条目不存在');
    assert.strictEqual(ymylVeto.triggered, false, 'D3=45 不应触发 YMYL_D3<40 veto');
  });
});

// ---------------------------------------------------------------------------
// error report 结构校验
// ---------------------------------------------------------------------------

describe('Error AuditReport schema', () => {
  test('error-report 有 meta.error 字段', () => {
    const report = loadFixture('error-report.json');
    assert.ok(report.meta.error, '缺 meta.error');
    assert.strictEqual(report.meta.error, 'unreachable');
  });

  test('error-report 无 scores（terminal error 不出打分）', () => {
    const report = loadFixture('error-report.json');
    assert.strictEqual(report.scores, undefined, 'unreachable report 不应有 scores');
  });

  test('error-report 无 profile（terminal error 未完成 L-1）', () => {
    const report = loadFixture('error-report.json');
    assert.strictEqual(report.profile, undefined, 'unreachable report 不应有 profile');
  });

  test('error-report meta.errorHint 存在', () => {
    const report = loadFixture('error-report.json');
    assert.ok(report.meta.errorHint, '缺 meta.errorHint');
  });

  test('error-report sampledPages 为空数组', () => {
    const report = loadFixture('error-report.json');
    assert.deepStrictEqual(report.meta.sampledPages, []);
  });
});

// ---------------------------------------------------------------------------
// Scorer 函数单元测试
// ---------------------------------------------------------------------------

describe('Scorer 单元测试', () => {
  test('calculateLevel: 边界值', () => {
    assert.strictEqual(calculateLevel(0), 'L0');
    assert.strictEqual(calculateLevel(40), 'L0');
    assert.strictEqual(calculateLevel(41), 'L1');
    assert.strictEqual(calculateLevel(60), 'L1');
    assert.strictEqual(calculateLevel(61), 'L2');
    assert.strictEqual(calculateLevel(80), 'L2');
    assert.strictEqual(calculateLevel(81), 'L3');
    assert.strictEqual(calculateLevel(100), 'L3');
  });

  test('calculateTotal: 全维度可用时无 biasNote', () => {
    const dims = {
      D1: { score: 60, weight: 0.20, partial: false, issues: [], checks: [] },
      D2: { score: 40, weight: 0.20, partial: false, issues: [], checks: [] },
      D3: { score: 80, weight: 0.25, partial: true,  issues: [], checks: [] },
      D4: { score: 60, weight: 0.25, partial: true,  issues: [], checks: [] },
      D5: { score: 80, weight: 0.10, partial: false, issues: [], checks: [] },
    };
    // Expected: 60*0.20 + 40*0.20 + 80*0.25 + 60*0.25 + 80*0.10
    //         = 12 + 8 + 20 + 15 + 8 = 63
    const { total, biasNote } = calculateTotal(dims);
    assert.strictEqual(total, 63);
    assert.strictEqual(biasNote, undefined);
  });

  test('calculateTotal: D3 缺失时 biasNote 非空、total 偏低', () => {
    const dims = {
      D1: { score: 80, weight: 0.20, partial: false, issues: [], checks: [] },
      D2: { score: 80, weight: 0.20, partial: false, issues: [], checks: [] },
      D4: { score: 80, weight: 0.25, partial: true,  issues: [], checks: [] },
      D5: { score: 80, weight: 0.10, partial: false, issues: [], checks: [] },
    };
    // Without D3 (0.25 weight): max possible = 80*(0.20+0.20+0.25+0.10) = 80*0.75 = 60
    const { total, biasNote } = calculateTotal(dims);
    assert.ok(total < 80, '缺 D3 时 total 应偏低');
    assert.ok(biasNote, '缺维度时应有 biasNote');
    assert.ok(biasNote!.includes('D3'), 'biasNote 应提及缺失维度');
  });

  test('DEEP_ONLY_NOT_EVALUATED 恰好 4 项', () => {
    assert.strictEqual(DEEP_ONLY_NOT_EVALUATED.length, 4);
  });
});
