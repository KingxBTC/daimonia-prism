/**
 * renderMarkdown 扣分明细（Track C / I4）渲染契约测试。
 *
 * 验证：fail/partial 检查项的 evidence 在「扣分明细」段被逐项显性展示，
 * 且 pass/na 项不进入明细（DAI-1331 验收：每个低分项可见客观扣分依据）。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.ts';
import type {
  AuditReport,
  CheckResult,
  DimensionId,
  DimensionScore,
} from '../../src/core/types.ts';

function check(over: Partial<CheckResult> & { evidence: string }): CheckResult {
  return {
    id: 'D1.x',
    name: '检查项',
    tier: 'L',
    status: 'fail',
    scoreImpact: -40,
    ...over,
  };
}

function dim(over: Partial<DimensionScore> = {}): DimensionScore {
  return { score: 60, weight: 0.2, partial: false, issues: [], checks: [], ...over };
}

function makeReport(dimensions: Record<DimensionId, DimensionScore>): AuditReport {
  return {
    meta: {
      url: 'https://example.com',
      market: 'international',
      auditTier: 'light',
      standardVersion: 'v0.5.1',
      prismVersion: 'test',
      timestamp: '2026-06-04T00:00:00Z',
      durationMs: 1,
      sampledPages: ['https://example.com'],
    },
    scores: {
      total: 60,
      level: 'L2',
      indicative: true,
      dimensions,
    },
    vetoes: [],
    couplingFlags: [],
    notEvaluated: [],
    topFixes: [],
    deepAuditRecommended: false,
    deepAuditRationale: '',
  };
}

describe('renderMarkdown 扣分明细（I4）', () => {
  test('fail/partial 检查项的 evidence 在扣分明细段逐项显性展示', () => {
    const report = makeReport({
      D1: dim({
        checks: [
          check({ id: 'D1.jsonld_schema', name: 'JSON-LD 标注', status: 'fail', evidence: '全站无 JSON-LD（已扫 4 页，0 命中）' }),
          check({ id: 'D1.headings', name: '标题层级', status: 'partial', evidence: '缺 H1' }),
          check({ id: 'D1.ok', name: '通过项', status: 'pass', evidence: '良好' }),
        ],
      }),
      D2: dim(),
      D3: dim(),
      D4: dim(),
      D5: dim({ checks: [check({ id: 'D5.cwv', name: 'CWV', status: 'na', evidence: '未取到' })] }),
    });

    const md = renderMarkdown(report);

    assert.ok(md.includes('## 🔻 扣分明细（为什么扣分）'), '缺扣分明细段标题');
    assert.ok(md.includes('JSON-LD 标注'), '缺 fail 检查项名');
    assert.ok(md.includes('全站无 JSON-LD（已扫 4 页，0 命中）'), 'fail 项 evidence 未显性展示');
    assert.ok(md.includes('未达标'), '缺 fail 中文状态标签');
    assert.ok(md.includes('标题层级'), '缺 partial 检查项名');
    assert.ok(md.includes('部分达标'), '缺 partial 中文状态标签');
    // pass / na 项不进入明细
    assert.ok(!md.includes('通过项'), 'pass 项不应出现在扣分明细');
    assert.ok(!md.includes('CWV'), 'na 项不应出现在扣分明细');
  });

  test('全部检查项达标时显示无扣分明细兜底', () => {
    const allPass = dim({ checks: [check({ status: 'pass', evidence: 'ok' })] });
    const report = makeReport({ D1: allPass, D2: allPass, D3: allPass, D4: allPass, D5: allPass });
    const md = renderMarkdown(report);
    assert.ok(md.includes('（本次各检查项均达标，无扣分明细）'), '缺无扣分兜底文案');
  });
});
