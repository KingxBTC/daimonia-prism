import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * DAI-1288：模板客户端 JS 的 stored XSS 回归测试。
 *
 * 漏洞面：模板内联 JS 把报告数据经 text()（零转义）塞进多处 .innerHTML。
 * 报告数据多来自被审计站点内容 / LLM 分析输出，可分享 .html 被打开即执行注入脚本。
 *
 * 测试策略（无新增依赖，遵守项目 native node --test 约定）：
 * 抽取模板**真实的内联渲染脚本**，喂给极小 DOM stub 后执行，断言流入
 * innerHTML 的恶意 payload 被转义成惰性文本（非裸 HTML），良性数据视觉不变。
 */

const TEMPLATE_PATH = fileURLToPath(
  new URL('../skill/prism-report-template.html', import.meta.url),
);

/** 抽取模板里无属性的 <script>（即渲染脚本，数据岛 <script id=.. type=..> 带属性不匹配）。 */
function extractRenderScript(html: string): string {
  const m = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  if (!m) throw new Error('模板缺少内联渲染脚本');
  return m[1];
}

/** 极小 DOM stub：getElementById 记录每个节点的 innerHTML/textContent。 */
function makeDom(islandJson: string) {
  const store: Record<string, string> = {};
  const els: Record<string, any> = {};
  const make = (id: string) => ({
    set innerHTML(v: string) {
      store[`${id}#innerHTML`] = v;
    },
    get innerHTML() {
      return store[`${id}#innerHTML`] ?? '';
    },
    set textContent(v: string) {
      store[`${id}#textContent`] = v;
    },
    get textContent() {
      // 数据岛节点返回注入的 JSON，渲染脚本据此 JSON.parse
      return id === 'audit-report-data'
        ? islandJson
        : (store[`${id}#textContent`] ?? '');
    },
    setAttribute() {},
  });
  const document = {
    getElementById(id: string) {
      return els[id] || (els[id] = make(id));
    },
  };
  return { store, document };
}

function runTemplate(report: unknown) {
  const html = readFileSync(TEMPLATE_PATH, 'utf8');
  const script = extractRenderScript(html);
  const { store, document } = makeDom(JSON.stringify(report));
  // 在受控沙箱里执行模板真实渲染脚本（仅注入 document，其余用 node 内建全局）。
  // eslint-disable-next-line no-new-func
  new Function('document', script)(document);
  return store;
}

const baseReport = {
  meta: {
    url: 'https://example.com',
    market: 'international',
    auditTier: 'light',
    standardVersion: 'geo_audit_standard v0.5.1',
    prismVersion: '1.0',
    timestamp: '2026-06-03T10:00:00Z',
    sampledPages: ['https://example.com/'],
  },
  profile: { domain: 'example.com', businessType: '婚姻咨询服务' },
  scores: {
    total: 52,
    level: 'L1',
    indicative: true,
    dimensions: {
      D1: { score: 60, weight: 0.2, partial: false, issues: ['正常问题文案'], checks: [] },
      D2: { score: 40, weight: 0.2, partial: false, issues: ['x'], checks: [] },
      D3: { score: 45, weight: 0.25, partial: true, issues: ['x'], checks: [] },
      D4: { score: 50, weight: 0.25, partial: true, issues: ['x'], checks: [] },
      D5: { score: 70, weight: 0.1, partial: false, issues: ['x'], checks: [] },
    },
  },
  vetoes: [{ rule: 'D5<60', triggered: false }],
  couplingFlags: [{ code: 'D1xD2_mismatch', note: '架构尚可' }],
  notEvaluated: ['x'],
  topFixes: [
    { priority: 1, dimension: 'D4', method: 'Statistics Addition', action: '正常整改建议', rationale: '理由', effort: 'low' },
  ],
  deepAuditRecommended: true,
  deepAuditRationale: '建议 Deep',
};

const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

test('xss: topFixes[].action 注入脚本被转义为惰性文本（不进入 innerHTML 为裸 HTML）', () => {
  const r = JSON.parse(JSON.stringify(baseReport));
  r.topFixes[0].action = XSS;
  const store = runTemplate(r);
  const fixes = store['fixes#innerHTML'];
  assert.ok(!fixes.includes(XSS), 'fixes innerHTML 不得含裸 <img onerror>');
  assert.ok(fixes.includes(XSS_ESCAPED), 'payload 应转义为实体文本');
});

test('xss: dimensions issues 注入脚本被转义', () => {
  const r = JSON.parse(JSON.stringify(baseReport));
  r.scores.dimensions.D1.issues = ['<svg/onload=alert(2)>'];
  const store = runTemplate(r);
  const dims = store['dimensions#innerHTML'];
  assert.ok(!dims.includes('<svg/onload=alert(2)>'), 'dimensions innerHTML 不得含裸 <svg onload>');
  assert.ok(dims.includes('&lt;svg/onload=alert(2)&gt;'), 'payload 应转义为实体文本');
});

test('xss: meta（profile.businessType / meta.url）注入被转义', () => {
  const r = JSON.parse(JSON.stringify(baseReport));
  r.profile.businessType = XSS;
  const store = runTemplate(r);
  const meta = store['meta-grid#innerHTML'];
  assert.ok(!meta.includes(XSS), 'meta innerHTML 不得含裸 payload');
  assert.ok(meta.includes(XSS_ESCAPED), 'payload 应转义为实体文本');
});

test('xss: couplingFlags / vetoes 注入被转义', () => {
  const r = JSON.parse(JSON.stringify(baseReport));
  r.couplingFlags = [{ code: XSS, note: '<b>x</b>' }];
  const store = runTemplate(r);
  const flags = store['flags#innerHTML'];
  assert.ok(!flags.includes(XSS), 'flags innerHTML 不得含裸 payload');
  assert.ok(flags.includes(XSS_ESCAPED), 'payload 应转义为实体文本');
});

test('xss: 良性数据视觉中性 —— 正常文案原样可见、textContent 不被转义污染', () => {
  const store = runTemplate(baseReport);
  // innerHTML 路径：正常中文文案应原样出现（转义对良性数据无副作用）
  assert.ok(store['fixes#innerHTML'].includes('正常整改建议'), '良性 action 文案保留');
  assert.ok(store['dimensions#innerHTML'].includes('正常问题文案'), '良性 issue 文案保留');
  assert.ok(store['meta-grid#innerHTML'].includes('婚姻咨询服务'), '良性 businessType 保留');
  // textContent 路径：必须是字面量，不能被转义成 &lt; 之类（issue 明确不可转义 textContent）
  assert.equal(store['total-score#textContent'], '52', 'total-score textContent 原值');
});
