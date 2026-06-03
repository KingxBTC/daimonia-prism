import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../skill/render/markdown.ts';
import type { AuditReport } from '../src/core/types.ts';

function load(name: string): AuditReport {
  const p = fileURLToPath(new URL(`../skill/fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(p, 'utf8')) as AuditReport;
}

const sample = load('sample-report.json');
const veto = load('veto-l0-report.json');
const errorRep = load('error-report.json');

test('markdown: 标题与元信息行（§7.3）', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /^# 🔍 Prism GEO 审计报告（Light · indicative）/);
  assert.ok(md.includes('https://example.com'), 'url');
  assert.ok(md.includes('international'), 'market');
  assert.ok(md.includes('geo_audit_standard v0.5.1'), 'standard');
  assert.ok(md.includes('2026-06-03T10:00:00Z'), 'timestamp');
});

test('markdown: 总览含 total/level + indicative 告警', () => {
  const md = renderMarkdown(sample);
  assert.ok(md.includes('52/100'), 'total');
  assert.ok(md.includes('L1'), 'level');
  assert.ok(md.includes('indicative'), 'indicative warning');
  assert.ok(md.includes('关键风险'), 'key risks line');
});

test('markdown: 五维度表含全部 5 维 + 分数 + 权重 + 问题', () => {
  const md = renderMarkdown(sample);
  for (const d of ['D1', 'D2', 'D3', 'D4', 'D5']) {
    assert.ok(md.includes(d), `${d} present`);
  }
  assert.ok(md.includes('20%') && md.includes('25%') && md.includes('10%'), 'weights');
  assert.ok(md.includes('缺 /llms.txt'), 'D2 issue text');
  assert.ok(md.includes('| D3 权威信号（部分）'), 'D3 partial label');
});

test('markdown: notEvaluated 列出全部 4 项 Deep 专属（§12.1）', () => {
  const md = renderMarkdown(sample);
  assert.ok(md.includes('本次未评估'), 'section header');
  for (const item of sample.notEvaluated) {
    assert.ok(md.includes(item), `notEvaluated: ${item}`);
  }
});

test('markdown: Top3 整改含维度/action/rationale/effort', () => {
  const md = renderMarkdown(sample);
  assert.ok(md.includes('Top 3'), 'top3 header');
  assert.ok(md.includes('核心结论补具体数字'), 'fix1 action');
  assert.ok(md.includes('Aggarwal Top3'), 'fix1 rationale');
  assert.ok(md.includes('（低）'), 'effort localized to 中文');
});

test('markdown: 推荐 Deep 时输出理由 + Deep CTA', () => {
  const md = renderMarkdown(sample);
  assert.ok(md.includes('建议 Deep 审计'), 'deep recommended');
  assert.ok(md.includes(sample.deepAuditRationale), 'rationale');
  assert.ok(md.includes('联系 Daimonia 交付团队'), 'CTA');
});

test('markdown: 一票否决触发时渲染 veto 块 + 耦合块', () => {
  const md = renderMarkdown(veto);
  assert.ok(/一票否决/.test(md), 'veto block');
  assert.ok(md.includes('D5<60'), 'veto rule');
  assert.ok(md.includes('L0'), 'level L0');
  assert.ok(/耦合/.test(md), 'coupling block');
  assert.ok(md.includes('csr_empty_html'), 'coupling code');
});

test('markdown: 无触发 veto 时不渲染 veto 块', () => {
  const md = renderMarkdown(sample);
  assert.ok(!/一票否决/.test(md), 'no veto block for clean report');
});

test('markdown: error 报告显示排查提示，不渲染五维度表', () => {
  const md = renderMarkdown(errorRep);
  assert.ok(md.includes('unreachable') || md.includes('不可达'), 'error surfaced');
  assert.ok(md.includes('DNS 解析失败'), 'error hint');
  assert.ok(!md.includes('| D1 '), 'no dimension table');
});
