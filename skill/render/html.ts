/**
 * AuditReport → standalone HTML 报告（PRD §7.5 [MVP]）。
 *
 * 渲染策略（T5 × T5b 集成）：HTML 视觉模板由美龙交付并拥有
 * （`skill/prism-report-template.html`，设计规格见 docs/standalone_html_report_design.md）。
 * 本渲染器**不重新设计视觉**，只做模板契约规定的集成：把真实 `AuditReport` JSON
 * 注入模板的数据岛 `<script id="audit-report-data" type="application/json">`，
 * 模板内联 JS 在打开时把 JSON 映射成雷达图/卡片/Top3（CLAUDE.md §4：渲染层只消费 JSON）。
 *
 * 输出仍是自包含单文件（内联 CSS/JS，零外部依赖）。
 *
 * 本文件负责的工程安全项：数据岛注入转义 —— 把 `<` 转成 `<`，避免数据中的
 * `</script>` 提前关闭数据岛（JSON.parse 时还原为 `<`）。注：模板内联 JS 用 innerHTML
 * 渲染文本，HTML 实体转义是模板侧职责，已作为 T5b 工程跟进项反馈美龙（见 issue 评论）。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AuditReport } from '../../src/core/types.ts';

const TEMPLATE_PATH = fileURLToPath(
  new URL('../prism-report-template.html', import.meta.url),
);

const DATA_ISLAND_RE =
  /(<script id="audit-report-data" type="application\/json">)[\s\S]*?(<\/script>)/;

/** 安全序列化为可嵌入 <script> 数据岛的 JSON 文本（防 </script> 破岛）。 */
function toDataIsland(report: AuditReport): string {
  return JSON.stringify(report, null, 2).replace(/</g, '\\u003c');
}

/** 把真实报告注入美龙模板的数据岛。 */
function injectIntoTemplate(report: AuditReport): string {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  if (!DATA_ISLAND_RE.test(template)) {
    throw new Error(
      `prism-report-template.html 缺少 <script id="audit-report-data"> 数据岛，无法注入`,
    );
  }
  const json = toDataIsland(report);
  return template.replace(DATA_ISLAND_RE, `$1\n${json}\n  $2`);
}

// ---- error / partial 报告：自包含错误页（美龙报告模板 v1 不覆盖错误态）-------------

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderErrorHtml(report: AuditReport): string {
  const m = report.meta;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prism GEO 审计报告 — 审计未完成</title>
<style>
  :root{--bg:#f7f5f0;--surface:#fffdf8;--ink:#171717;--muted:#62615d;--bad:#a83f38;--line:#ded8cc}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);line-height:1.55;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .page{max-width:640px;margin:80px auto;padding:0 20px}
  .card{background:var(--surface);border:1px solid var(--bad);border-radius:16px;padding:28px}
  h1{font-size:24px;margin:0 0 4px}
  .eyebrow{color:var(--muted);font-size:13px;font-weight:700;text-transform:uppercase;margin:0 0 16px}
  h2{color:var(--bad);font-size:18px;margin:0 0 12px}
  code{background:rgba(168,63,56,.1);padding:1px 6px;border-radius:6px}
  .hint{background:rgba(168,63,56,.07);border-radius:8px;padding:12px 14px;margin:12px 0}
  .muted{color:var(--muted)}
</style>
</head>
<body>
<main class="page">
  <p class="eyebrow">Prism GEO Audit · Light · indicative</p>
  <h1>🔍 Prism GEO 审计报告</h1>
  <div class="card">
    <h2>⚠️ 审计未完成</h2>
    <p><strong>站点</strong>：${esc(m.url)}</p>
    <p><strong>错误</strong>：<code>${esc(m.error)}</code></p>
    ${m.errorHint ? `<p class="hint">${esc(m.errorHint)}</p>` : ''}
    <p class="muted">${esc(report.deepAuditRationale || '解决后重试 /prism-geo-audit。')}</p>
  </div>
</main>
</body>
</html>
`;
}

export function renderHtml(report: AuditReport): string {
  if (report.meta.error) return renderErrorHtml(report);
  return injectIntoTemplate(report);
}
