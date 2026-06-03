import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST, ALWAYS_PARTIAL_DIMENSIONS } from './checklist.ts';
import type { DimensionId } from './imports.ts';

const DIMS: DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

describe('CHECKLIST 结构不变量', () => {
  test('检查项 id 全局唯一', () => {
    const ids = CHECKLIST.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, '存在重复 id');
  });

  test('5 个维度都至少有一个 Light 计分检查项', () => {
    for (const d of DIMS) {
      const scored = CHECKLIST.filter(c => c.dimension === d && c.kind !== 'deep');
      assert.ok(scored.length >= 1, `${d} 无 Light 计分检查项`);
    }
  });

  test('每维度 Light 计分检查项 penalty 之和 = 100（penalty 模型基线）', () => {
    for (const d of DIMS) {
      const sum = CHECKLIST
        .filter(c => c.dimension === d && c.kind !== 'deep')
        .reduce((s, c) => s + c.penalty, 0);
      assert.equal(sum, 100, `${d} penalty 合计=${sum}，应为 100`);
    }
  });

  test('deep 检查项 penalty=0 且不参与 Light 计分', () => {
    const deep = CHECKLIST.filter(c => c.kind === 'deep');
    assert.ok(deep.length >= 2, '应至少有 D3.earned + D4.cross_query 两个 deep 项');
    for (const c of deep) assert.equal(c.penalty, 0, `${c.id} deep 项 penalty 应为 0`);
  });

  test('rule 检查项有 rule，llm 检查项有 prompt+fallback', () => {
    for (const c of CHECKLIST) {
      if (c.kind === 'rule') assert.ok(c.rule, `${c.id} 缺 rule`);
      if (c.kind === 'llm') {
        assert.ok(c.prompt, `${c.id} 缺 prompt`);
        assert.ok(c.fallback, `${c.id} 缺 fallback（PRD §10 降级要求）`);
      }
    }
  });

  test('llms.txt 检查项 penalty=10（对齐 PRD §7.1 -10 示例）', () => {
    const llms = CHECKLIST.find(c => c.id === 'D2.llms_txt');
    assert.ok(llms);
    assert.equal(llms!.penalty, 10);
  });

  test('D3/D4 标记为恒 partial', () => {
    assert.ok(ALWAYS_PARTIAL_DIMENSIONS.has('D3'));
    assert.ok(ALWAYS_PARTIAL_DIMENSIONS.has('D4'));
    assert.ok(!ALWAYS_PARTIAL_DIMENSIONS.has('D1'));
  });
});
