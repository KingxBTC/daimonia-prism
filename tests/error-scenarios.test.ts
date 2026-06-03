/**
 * error-scenarios.test.ts — §10 错误场景单元测试
 *
 * 覆盖 PRD §10 所有降级路径：
 *  1. URL 不可达
 *  2. 非 HTML 响应
 *  3. robots.txt 禁止抓取（robots_content_blocked）
 *  4. CSR 空壳
 *  5. PageSpeed API 失败（D5 partial，不阻塞整体）
 *  6. LLM 判断失败（维度 partial，重试仍失败）
 *  7. 部分维度失败 → 总分按可用维度重算
 *  8. 登录/付费墙
 *
 * 每个 case 验证：不整体崩（始终返回 AuditReport），降级字段正确标注。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeUnreachableReport,
  makeNonHtmlReport,
  applyRobotsBlock,
  applyCsrEmpty,
  patchPageSpeedFailure,
  patchLlmFailure,
  makePaywallReport,
  makeNaDimension,
} from '../src/core/errors.ts';
import { calculateTotal, calculateLevel } from '../src/core/scorer.ts';
import type { AuditReport, DimensionScore } from '../src/core/types.ts';

// Helper: 创建最小合法 D5 维度分
function makeD5(score: number): DimensionScore {
  return { score, weight: 0.10, partial: false, issues: [], checks: [] };
}

// Helper: 最小合法 partial report（有 scores）
function makeMinimalReport(d5Score: number): AuditReport {
  return {
    meta: {
      url: 'https://test.example',
      market: 'international',
      auditTier: 'light',
      standardVersion: 'geo_audit_standard v0.5.1',
      prismVersion: '1.0',
      timestamp: new Date().toISOString(),
      durationMs: 1000,
      sampledPages: ['https://test.example/'],
    },
    profile: {
      domain: 'test.example',
      businessType: '测试站',
      isYMYL: false,
      nicheTier: 'mid',
      siteScale: '100-1000',
      primaryLanguage: 'zh-CN',
      geoMarket: '国际',
      targetEngines: ['claude', 'chatgpt'],
    },
    scores: {
      total: d5Score,
      level: 'L1',
      indicative: true,
      dimensions: {
        D1: { score: 60, weight: 0.20, partial: false, issues: [], checks: [] },
        D2: { score: 60, weight: 0.20, partial: false, issues: [], checks: [] },
        D3: { score: 60, weight: 0.25, partial: true,  issues: [], checks: [] },
        D4: { score: 60, weight: 0.25, partial: true,  issues: [], checks: [] },
        D5: makeD5(d5Score),
      },
    },
    vetoes: [
      { rule: 'D5<60', triggered: d5Score < 60 },
      { rule: 'YMYL_D3<40', triggered: false },
    ],
    couplingFlags: [],
    notEvaluated: [
      'D3 earned media 覆盖度（需 Deep）',
      'D4 跨 query 稳定性 WCP/DR/WTR（需 Deep）',
      '引擎特定层 per-engine 分数（需 Deep）',
      '异常引用模式抽查（需 Deep）',
    ],
    topFixes: [],
    deepAuditRecommended: false,
    deepAuditRationale: '',
  };
}

// ---------------------------------------------------------------------------
// 1. URL 不可达
// ---------------------------------------------------------------------------
describe('§10 场景 1：URL 不可达', () => {
  const report = makeUnreachableReport('https://no-such-domain.invalid', 'international', 3000);

  test('永远返回 AuditReport（不抛异常）', () => {
    assert.ok(report, '应返回报告对象');
  });
  test('meta.error = "unreachable"', () => {
    assert.strictEqual(report.meta.error, 'unreachable');
  });
  test('meta.errorHint 非空（提供排查建议）', () => {
    assert.ok(report.meta.errorHint && report.meta.errorHint.length > 0);
  });
  test('无 scores（terminal error）', () => {
    assert.strictEqual(report.scores, undefined);
  });
  test('无 profile（L-1 未完成）', () => {
    assert.strictEqual(report.profile, undefined);
  });
  test('sampledPages 为空数组', () => {
    assert.deepStrictEqual(report.meta.sampledPages, []);
  });
  test('deepAuditRecommended = false（站不可达，Deep 也没意义）', () => {
    assert.strictEqual(report.deepAuditRecommended, false);
  });
});

// ---------------------------------------------------------------------------
// 2. 非 HTML 响应
// ---------------------------------------------------------------------------
describe('§10 场景 2：非 HTML（PDF）', () => {
  const report = makeNonHtmlReport(
    'https://example.com/doc.pdf',
    'international',
    'application/pdf',
    1500,
  );

  test('永远返回 AuditReport', () => { assert.ok(report); });
  test('meta.error = "non_html"', () => {
    assert.strictEqual(report.meta.error, 'non_html');
  });
  test('errorHint 提及 content type', () => {
    assert.ok(report.meta.errorHint?.includes('application/pdf'));
  });
  test('无 scores / profile', () => {
    assert.strictEqual(report.scores, undefined);
    assert.strictEqual(report.profile, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. robots.txt 禁止抓取
// ---------------------------------------------------------------------------
describe('§10 场景 3：robots.txt 禁止抓取', () => {
  test('applyRobotsBlock: D1/D2/D3/D4 标 na，D5 不变', () => {
    const report = makeMinimalReport(70);
    const d5Before = report.scores!.dimensions.D5.score;
    const patched = applyRobotsBlock(report, 'User-agent: * Disallow: /');

    for (const dim of ['D1', 'D2', 'D3', 'D4'] as const) {
      assert.strictEqual(patched.scores!.dimensions[dim].checks[0].status, 'na',
        `${dim} 应标 na`);
    }
    assert.strictEqual(patched.scores!.dimensions.D5.score, d5Before,
      'D5 分数不应被 robots block 修改');
  });

  test('applyRobotsBlock: couplingFlags 包含 robots_content_blocked', () => {
    const report = makeMinimalReport(70);
    const patched = applyRobotsBlock(report, 'Disallow: /');
    const flag = patched.couplingFlags.find(f => f.code === 'robots_content_blocked');
    assert.ok(flag, '缺 robots_content_blocked coupling flag');
  });
});

// ---------------------------------------------------------------------------
// 4. CSR 空壳
// ---------------------------------------------------------------------------
describe('§10 场景 4：CSR 空壳', () => {
  test('applyCsrEmpty: D2/D3/D4 标 na，D5/D1 不变', () => {
    const report = makeMinimalReport(70);
    const patched = applyCsrEmpty(report);

    for (const dim of ['D2', 'D3', 'D4'] as const) {
      assert.strictEqual(patched.scores!.dimensions[dim].checks[0].status, 'na',
        `${dim} 应标 na`);
    }
    // D1 仍评（渲染模式判 CSR 风险）
    assert.ok(patched.scores!.dimensions.D1.score > 0, 'D1 应照评');
    // D5 仍评
    assert.strictEqual(patched.scores!.dimensions.D5.score, 70, 'D5 不应被 CSR 修改');
  });

  test('applyCsrEmpty: couplingFlags 包含 csr_empty_html', () => {
    const report = makeMinimalReport(70);
    const patched = applyCsrEmpty(report);
    const flag = patched.couplingFlags.find(f => f.code === 'csr_empty_html');
    assert.ok(flag, '缺 csr_empty_html coupling flag');
  });
});

// ---------------------------------------------------------------------------
// 5. PageSpeed API 失败
// ---------------------------------------------------------------------------
describe('§10 场景 5：PageSpeed API 失败', () => {
  test('patchPageSpeedFailure: D5 标 partial，不阻塞整体报告', () => {
    const d5 = makeD5(60);
    const patched = patchPageSpeedFailure(d5, '429 Too Many Requests');

    assert.strictEqual(patched.partial, true, 'D5 应标 partial=true');
    const cwvCheck = patched.checks.find(c => c.id === 'D5.cwv');
    assert.ok(cwvCheck, '应有 D5.cwv 检查项');
    assert.strictEqual(cwvCheck!.status, 'partial');
    assert.ok(cwvCheck!.evidence.includes('429'));
  });

  test('patchPageSpeedFailure: D5 其余字段（score/weight）不变', () => {
    const d5 = makeD5(60);
    const patched = patchPageSpeedFailure(d5, 'timeout');
    assert.strictEqual(patched.score, 60, 'score 不应因 API 失败改变');
    assert.strictEqual(patched.weight, 0.10);
  });
});

// ---------------------------------------------------------------------------
// 6. LLM 判断失败
// ---------------------------------------------------------------------------
describe('§10 场景 6：LLM 判断失败', () => {
  test('patchLlmFailure: 维度标 partial=true', () => {
    const d3: DimensionScore = { score: 60, weight: 0.25, partial: false, issues: [], checks: [] };
    const patched = patchLlmFailure(d3, 'D3', 'model timeout');

    assert.strictEqual(patched.partial, true);
  });

  test('patchLlmFailure: 新增 llm_fallback 检查项', () => {
    const d3: DimensionScore = { score: 60, weight: 0.25, partial: false, issues: [], checks: [] };
    const patched = patchLlmFailure(d3, 'D3', 'context length exceeded');

    const fallbackCheck = patched.checks.find(c => c.id === 'D3.llm_fallback');
    assert.ok(fallbackCheck, '应有 llm_fallback 检查项');
    assert.strictEqual(fallbackCheck!.status, 'partial');
  });

  test('patchLlmFailure: issues 包含 LLM 失败说明', () => {
    const d3: DimensionScore = { score: 60, weight: 0.25, partial: false, issues: ['原有问题'], checks: [] };
    const patched = patchLlmFailure(d3, 'D3', 'timeout');

    assert.ok(patched.issues.includes('原有问题'), '原有 issues 应保留');
    assert.ok(patched.issues.some(i => i.includes('LLM 判断失败')), '应新增 LLM 失败说明');
  });
});

// ---------------------------------------------------------------------------
// 7. 部分维度失败 → 总分偏差处理
// ---------------------------------------------------------------------------
describe('§10 场景 7：部分维度失败', () => {
  test('calculateTotal 缺 D3 时 biasNote 包含 D3', () => {
    const dims = {
      D1: { score: 60, weight: 0.20, partial: false, issues: [], checks: [] },
      D2: { score: 60, weight: 0.20, partial: false, issues: [], checks: [] },
      // D3 缺失（LLM 失败 + 规则降级 → na）
      D4: { score: 60, weight: 0.25, partial: true,  issues: [], checks: [] },
      D5: { score: 60, weight: 0.10, partial: false, issues: [], checks: [] },
    };
    const { total, biasNote } = calculateTotal(dims);
    assert.ok(total < 60, `缺 D3 时 total(${total}) 应 < 60`);
    assert.ok(biasNote?.includes('D3'), `biasNote 应提及 D3，实际: ${biasNote}`);
  });

  test('全维度失败时 calculateTotal 仍返回结构（total=0）', () => {
    const { total } = calculateTotal({});
    assert.strictEqual(total, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. 登录/付费墙
// ---------------------------------------------------------------------------
describe('§10 场景 8：登录/付费墙', () => {
  const report = makePaywallReport('https://paywalled.example.com', 'international');

  test('永远返回 AuditReport', () => { assert.ok(report); });
  test('meta.error = "paywall"', () => {
    assert.strictEqual(report.meta.error, 'paywall');
  });
  test('deepAuditRecommended = true（有可审计潜力）', () => {
    assert.strictEqual(report.deepAuditRecommended, true);
  });
  test('无 scores / profile', () => {
    assert.strictEqual(report.scores, undefined);
    assert.strictEqual(report.profile, undefined);
  });
});

// ---------------------------------------------------------------------------
// 通用：所有 error builder 返回值是合法 AuditReport 结构
// ---------------------------------------------------------------------------
describe('§10 通用：所有 error builder 返回合法结构', () => {
  const cases: Array<[string, AuditReport]> = [
    ['makeUnreachableReport', makeUnreachableReport('https://x.invalid', 'international')],
    ['makeNonHtmlReport', makeNonHtmlReport('https://x.com/a.pdf', 'international', 'application/pdf')],
    ['makePaywallReport', makePaywallReport('https://x.com', 'international')],
  ];

  for (const [name, report] of cases) {
    test(`${name}: 包含 meta/vetoes/couplingFlags/notEvaluated/topFixes`, () => {
      assert.ok(report.meta?.url, `${name} 缺 meta.url`);
      assert.ok(Array.isArray(report.vetoes), `${name} 缺 vetoes`);
      assert.ok(Array.isArray(report.couplingFlags), `${name} 缺 couplingFlags`);
      assert.ok(Array.isArray(report.notEvaluated), `${name} 缺 notEvaluated`);
      assert.ok(Array.isArray(report.topFixes), `${name} 缺 topFixes`);
      assert.ok(typeof report.deepAuditRecommended === 'boolean', `${name} 缺 deepAuditRecommended`);
    });
  }
});
