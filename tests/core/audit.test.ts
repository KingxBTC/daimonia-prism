/**
 * audit.test.ts — auditLight 端到端编排单测（T8 / DAI-1289）
 *
 * 目标：在**网络边界（global fetch）打桩**的前提下，跑真实的
 *   collect → analyze → buildScores → AuditReport 编排链路，
 * 验证 PRD §10「永不整体崩，降级 partial」契约与 market 透传。
 *
 * 设计取舍：只 mock 最外层 I/O（fetch），collect/analyze/scorer/report
 * 组装全部走真实代码——这是对 auditLight 编排逻辑的集成验证，而非
 * 对 error builder 的单元验证（后者已由 tests/error-scenarios.test.ts 覆盖）。
 */

import { test, describe, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { auditLight } from '../../src/core/audit.ts';
import type { Market } from '../../src/core/types.ts';

const BASE = 'http://prism-test.local';

// 含 >200 字可见文本，避免被 CSR 空壳检测（extractor CSR_TEXT_THRESHOLD=200）
const HOMEPAGE_HTML = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><title>Prism 测试站 — GEO 审计样例</title>
<meta name="description" content="这是一个用于 auditLight 编排测试的样例站点，内容足够长以通过 CSR 检测。">
</head><body>
<h1>Prism 测试站</h1>
<p>本页用于 auditLight 端到端编排集成测试。我们提供足够长度的正文内容，
确保 view-source 中存在实质文本，从而不会被误判为 CSR 空壳页面。内容涵盖
产品介绍、服务说明、联系方式等常见栏目，模拟一个真实可被采集的首页结构。</p>
<h2>关于我们</h2>
<p>Daimonia Prism 是一款 GEO 审计工具，面向生成式引擎优化场景。</p>
</body></html>`;

// 最小合法 PageSpeed Insights 响应（fetchCwv 解析用）
const PSI_OK = JSON.stringify({
  lighthouseResult: {
    audits: {
      'largest-contentful-paint': { numericValue: 2000 },
      'cumulative-layout-shift': { numericValue: 0.05 },
      'first-contentful-paint': { numericValue: 1500 },
      'server-response-time': { numericValue: 300 },
    },
    categories: { performance: { score: 0.9 } },
  },
});

interface RouteSpec {
  status?: number;
  contentType?: string;
  body?: string;
}
type Handler = RouteSpec | 'throw';

interface Routes {
  /** pathname → handler；缺省路径返回 404（robots/sitemap/llms 不存在视为可继续） */
  paths?: Record<string, Handler>;
  /** PageSpeed Insights 桩：'ok' 成功 / 'throw' 网络异常 / 'error' 5xx */
  psi?: 'ok' | 'throw' | 'error';
}

function makeRes(url: string, spec: RouteSpec) {
  const status = spec.status ?? 200;
  const contentType = spec.contentType ?? 'text/html; charset=utf-8';
  const body = spec.body ?? '';
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

function installFakeFetch(routes: Routes) {
  const fake = async (input: unknown): Promise<unknown> => {
    const url = typeof input === 'string' ? input : String((input as { url: string }).url);
    const u = new URL(url);

    // PageSpeed Insights 外部端点
    if (u.hostname === 'www.googleapis.com') {
      const psi = routes.psi ?? 'ok';
      if (psi === 'throw') throw new TypeError('PSI fetch failed (test stub)');
      if (psi === 'error') return makeRes(url, { status: 500, contentType: 'application/json', body: '{}' });
      return makeRes(url, { status: 200, contentType: 'application/json', body: PSI_OK });
    }

    const handler = routes.paths?.[u.pathname];
    if (handler === undefined) {
      // robots/sitemap/llms 等未配置 → 404（视为文件不存在，采集继续）
      return makeRes(url, { status: 404, contentType: 'text/plain', body: '' });
    }
    if (handler === 'throw') throw new TypeError(`fetch failed (test stub): ${url}`);
    return makeRes(url, handler);
  };
  mock.method(globalThis, 'fetch', fake);
}

/** 标准「站点可达 + 允许抓取」首页路由 */
function reachableRoutes(extra?: Partial<Routes>): Routes {
  return {
    paths: {
      '/': { body: HOMEPAGE_HTML },
      '/robots.txt': { contentType: 'text/plain', body: 'User-agent: *\nAllow: /\n' },
      ...(extra?.paths ?? {}),
    },
    psi: extra?.psi ?? 'ok',
  };
}

afterEach(() => {
  mock.restoreAll();
});

// ---------------------------------------------------------------------------
// 1. 站点不可达 → unreachable 降级（编排捕获 FetchError http_fetch）
// ---------------------------------------------------------------------------
describe('auditLight §10：站点不可达', () => {
  test('homepage fetch 抛错 → meta.error=unreachable，不抛异常', async () => {
    installFakeFetch({ paths: { '/': 'throw' } });
    const report = await auditLight({ url: BASE, market: 'international' });

    assert.strictEqual(report.meta.error, 'unreachable');
    assert.strictEqual(report.scores, undefined, 'terminal error 无 scores');
    assert.strictEqual(report.profile, undefined, 'terminal error 无 profile');
    assert.deepStrictEqual(report.meta.sampledPages, []);
    assert.strictEqual(report.meta.market, 'international', 'market 透传到 error report');
  });
});

// ---------------------------------------------------------------------------
// 2. 非 HTML 响应 → non_html 降级（content-type 透传进 errorHint）
// ---------------------------------------------------------------------------
describe('auditLight §10：非 HTML 响应', () => {
  test('homepage 返回 application/pdf → meta.error=non_html', async () => {
    installFakeFetch({
      paths: { '/': { contentType: 'application/pdf', body: '%PDF-1.4 binary...' } },
    });
    const report = await auditLight({ url: BASE, market: 'international' });

    assert.strictEqual(report.meta.error, 'non_html');
    assert.ok(
      report.meta.errorHint?.includes('application/pdf'),
      `errorHint 应含 content-type，实际: ${report.meta.errorHint}`,
    );
    assert.strictEqual(report.scores, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. robots.txt 封锁 PrismBot → D1-D4 标 na + robots_content_blocked
// ---------------------------------------------------------------------------
describe('auditLight §10：robots 封锁内容抓取', () => {
  test('Disallow / → 内容维度 na，仍返回 scores（不整体崩）', async () => {
    installFakeFetch(reachableRoutes({
      paths: { '/robots.txt': { contentType: 'text/plain', body: 'User-agent: *\nDisallow: /\n' } },
    }));
    const report = await auditLight({ url: BASE, market: 'international' });

    assert.ok(report.scores, 'robots 封锁仍应产出 scores（非 terminal error）');
    const flag = report.couplingFlags.find(f => f.code === 'robots_content_blocked');
    assert.ok(flag, '应含 robots_content_blocked coupling flag');

    for (const dim of ['D1', 'D2', 'D3', 'D4'] as const) {
      assert.ok(
        report.scores!.dimensions[dim].checks.some(c => c.status === 'na'),
        `${dim} 应有 na 检查项`,
      );
    }
    assert.strictEqual(typeof report.deepAuditRecommended, 'boolean');
  });
});

// ---------------------------------------------------------------------------
// 4. PageSpeed API 失败 → D5 partial（不阻塞整体报告）
// ---------------------------------------------------------------------------
describe('auditLight §10：PageSpeed 失败降级', () => {
  test('PSI fetch 抛错 → D5.partial=true + D5.cwv partial 检查项', async () => {
    installFakeFetch(reachableRoutes({ psi: 'throw' }));
    const report = await auditLight({ url: BASE, market: 'international' });

    assert.ok(report.scores, 'PSI 失败不应导致 terminal error');
    const d5 = report.scores!.dimensions.D5;
    assert.strictEqual(d5.partial, true, 'D5 应标 partial');
    const cwvCheck = d5.checks.find(c => c.id === 'D5.cwv');
    assert.ok(cwvCheck, '应有 D5.cwv 检查项');
    assert.strictEqual(cwvCheck!.status, 'partial');
  });
});

// ---------------------------------------------------------------------------
// 5. CSR 空壳 → csr_empty_html coupling flag
// ---------------------------------------------------------------------------
describe('auditLight §10：CSR 空壳', () => {
  test('首页正文 < 阈值 → couplingFlags 含 csr_empty_html', async () => {
    installFakeFetch(reachableRoutes({
      paths: { '/': { body: '<!doctype html><html><head><title>X</title></head><body><div id="root"></div></body></html>' } },
    }));
    const report = await auditLight({ url: BASE, market: 'international' });

    assert.ok(report.scores, 'CSR 空壳仍应产出 scores');
    assert.ok(
      report.couplingFlags.some(f => f.code === 'csr_empty_html'),
      '应含 csr_empty_html coupling flag',
    );
  });
});

// ---------------------------------------------------------------------------
// 6. 正常站点 → 完整 AuditReport（happy path 全字段就位）
// ---------------------------------------------------------------------------
describe('auditLight：正常站点完整报告', () => {
  test('可达 + 允许抓取 + PSI 成功 → scores/profile/meta 完整', async () => {
    installFakeFetch(reachableRoutes());
    const report = await auditLight({ url: BASE, market: 'international' });

    assert.ok(report.scores, '应有 scores');
    assert.ok(report.profile, '应有 profile');
    assert.strictEqual(report.meta.auditTier, 'light');
    assert.ok(report.meta.sampledPages.length >= 1, 'sampledPages ≥ 1');
    assert.ok(report.notEvaluated.length >= 4, 'notEvaluated ≥ 4（Deep 专属项）');
    assert.ok(Array.isArray(report.topFixes), 'topFixes 存在');
    assert.strictEqual(typeof report.deepAuditRecommended, 'boolean');
    // PSI 成功 → D5 不应因 CWV 失败而 partial（D5 仍可能因其他子项 partial，仅验证无 cwv partial）
    const cwv = report.scores!.dimensions.D5.checks.find(c => c.id === 'D5.cwv');
    if (cwv) assert.notStrictEqual(cwv.status, 'partial', 'PSI 成功时 D5.cwv 不应 partial');
  });
});

// ---------------------------------------------------------------------------
// 7. market 透传：international/china/both 一路到 Analyzer（T8 #4）
// ---------------------------------------------------------------------------
describe('auditLight：market 透传到 Analyzer', () => {
  function hasChinaCheck(report: { scores?: { dimensions: Record<string, { checks: Array<{ id: string }> }> } }): boolean {
    if (!report.scores) return false;
    return ['D2', 'D5'].some(dim =>
      report.scores!.dimensions[dim].checks.some(c => c.id.startsWith('china.')),
    );
  }

  for (const market of ['china', 'both'] as Market[]) {
    test(`market=${market} → 报告含 china.* 检查项`, async () => {
      installFakeFetch(reachableRoutes());
      const report = await auditLight({ url: BASE, market });
      assert.strictEqual(report.meta.market, market, 'meta.market 透传');
      assert.ok(hasChinaCheck(report), `market=${market} 应注入 china.* 检查项`);
    });
  }

  test('market=international → 不注入 china.* 检查项', async () => {
    installFakeFetch(reachableRoutes());
    const report = await auditLight({ url: BASE, market: 'international' });
    assert.strictEqual(report.meta.market, 'international');
    assert.ok(!hasChinaCheck(report), 'international 不应有 china.* 检查项');
  });
});
