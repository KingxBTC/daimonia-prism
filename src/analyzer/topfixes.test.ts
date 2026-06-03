import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopFixes } from './topfixes.ts';
import { CHECKLIST } from './checklist.ts';
import type { DimensionAnalysis } from './types.ts';
import type { CheckResult, DimensionId } from './imports.ts';

function dim(checks: Array<Partial<CheckResult> & { id: string; status: CheckResult['status'] }>): DimensionAnalysis {
  return {
    rawScore: 0, partial: false, issues: [],
    checks: checks.map(c => ({ name: c.id, tier: 'L', evidence: '', scoreImpact: 0, ...c })),
  };
}

describe('buildTopFixes', () => {
  test('按 ROI 排序：Statistics > llms.txt > 性能优化', () => {
    const dims: Partial<Record<DimensionId, DimensionAnalysis>> = {
      D2: dim([{ id: 'D2.llms_txt', status: 'fail' }]),
      D4: dim([{ id: 'D4.statistics_usage', status: 'fail' }]),
      D5: dim([{ id: 'D5.cwv', status: 'fail' }]),
    };
    const fixes = buildTopFixes(dims, CHECKLIST);
    assert.equal(fixes.length, 3);
    assert.equal(fixes[0].method, 'Statistics Addition'); // ROI 1
    assert.equal(fixes[0].priority, 1);
    assert.equal(fixes[1].method, 'llms.txt');             // ROI 4
    assert.equal(fixes[2].method, '性能优化');             // ROI 19
  });

  test('只取 Top3', () => {
    const dims: Partial<Record<DimensionId, DimensionAnalysis>> = {
      D2: dim([
        { id: 'D2.llms_txt', status: 'fail' },
        { id: 'D2.faq_block', status: 'fail' },
      ]),
      D4: dim([
        { id: 'D4.statistics_usage', status: 'fail' },
        { id: 'D4.citation_usage', status: 'fail' },
      ]),
      D5: dim([{ id: 'D5.sitemap', status: 'fail' }]),
    };
    const fixes = buildTopFixes(dims, CHECKLIST);
    assert.equal(fixes.length, 3);
  });

  test('pass 检查项不产生整改', () => {
    const dims: Partial<Record<DimensionId, DimensionAnalysis>> = {
      D4: dim([{ id: 'D4.statistics_usage', status: 'pass' }]),
    };
    assert.equal(buildTopFixes(dims, CHECKLIST).length, 0);
  });

  test('同 method 去重', () => {
    // statistics fail 出现在两个维度引用（构造重复 method）
    const dims: Partial<Record<DimensionId, DimensionAnalysis>> = {
      D4: dim([
        { id: 'D4.statistics_usage', status: 'partial' },
        { id: 'D4.statistics_usage', status: 'fail' }, // 同 id/method，保留更严重
      ]),
    };
    const fixes = buildTopFixes(dims, CHECKLIST);
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].method, 'Statistics Addition');
  });
});
