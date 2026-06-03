import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../skill/render/html.ts';
import type { AuditReport } from '../src/core/types.ts';

function load(name: string): AuditReport {
  const p = fileURLToPath(new URL(`../skill/fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(p, 'utf8')) as AuditReport;
}

const sample = load('sample-report.json');
const errorRep = load('error-report.json');

test('html: 单文件自包含文档（§7.5：无外部依赖，复用美龙 T5b 模板）', () => {
  const html = renderHtml(sample);
  assert.ok(html.toLowerCase().startsWith('<!doctype html>'), 'doctype');
  assert.ok(html.includes('<style>'), 'inline css');
  assert.ok(!/<link\s/i.test(html), 'no external <link>');
  assert.ok(!/<script\s+src=/i.test(html), 'no external script src');
  assert.ok(!/src=["']https?:/i.test(html), 'no http(s) src asset');
  assert.ok(!/url\(\s*["']?https?:/i.test(html), 'no http(s) css url() asset');
  assert.ok(html.includes('id="radar"'), '美龙模板雷达容器');
  assert.ok(html.includes('id="audit-report-data"'), '数据岛');
});

test('html: 把真实 report 注入数据岛（替换模板样例）', () => {
  const html = renderHtml(sample);
  // 我方 fixture 独有的抽样页 URL —— 证明注入替换了美龙模板内置样例
  assert.ok(html.includes('https://example.com/services/counseling'), 'injected fixture sampledPages');
  // 美龙模板样例独有的 issue 文案 —— 注入后不应再出现
  assert.ok(!html.includes('H2/H3 层级在服务页不稳定'), '模板样例已被替换');
  assert.ok(html.includes('52'), 'total score in data island');
  assert.ok(html.includes('"L1"'), 'level in data island');
});

test('html: 数据岛注入安全 —— </script> 与 < 被转义，不破岛/不新增 script', () => {
  const crafted: AuditReport = JSON.parse(JSON.stringify(sample));
  crafted.scores!.dimensions.D1.issues = ['</script><script>alert(1)</script> & <b>x</b>'];
  const html = renderHtml(crafted);
  // 注入的 JSON 内不得出现裸 </script>（否则提前关闭数据岛）
  const island = html.slice(
    html.indexOf('id="audit-report-data"'),
    html.indexOf('</script>', html.indexOf('id="audit-report-data"')),
  );
  assert.ok(!island.includes('</script>'), 'no raw </script> inside data island');
  assert.ok(html.includes('\\u003c'), '< 被转义为 \\u003c');
  // 文档内 <script> 标签总数不因注入数据而增加（数据岛 + 渲染脚本 = 2 个闭合）
  const closes = (html.match(/<\/script>/g) || []).length;
  assert.equal(closes, 2, 'exactly 2 </script> (data island + render script)');
});

test('html: error 报告渲染自包含错误页（不依赖美龙报告模板）', () => {
  const html = renderHtml(errorRep);
  assert.ok(html.toLowerCase().startsWith('<!doctype html>'), 'doctype');
  assert.ok(html.includes('DNS 解析失败'), 'error hint');
  assert.ok(html.includes('unreachable'), 'error code');
  assert.ok(!/<link\s/i.test(html), 'self-contained');
});
