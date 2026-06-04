/**
 * T10 Dogfood Runner — 4 真实站端到端验收
 * DAI-1320
 *
 * 运行：node dogfood/run-dogfood.ts
 *
 * 产出：
 *   dogfood/{domain}.json   — AuditReport JSON
 *   dogfood/{domain}.md     — Markdown 报告
 *   dogfood/{domain}.html   — 自包含 HTML 报告
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLight } from '../src/core/audit.ts';
import { renderMarkdown } from '../skill/render/markdown.ts';
import { renderHtml } from '../skill/render/html.ts';
import type { AuditReport, Market } from '../src/core/types.ts';

const OUT_DIR = fileURLToPath(new URL('.', import.meta.url));

interface SiteTarget {
  label: string;
  url: string;
  market: Market;
  role: 'client' | 'benchmark';
}

const TARGETS: SiteTarget[] = [
  { label: 'abel.ai',            url: 'https://abel.ai',            market: 'international', role: 'client' },
  { label: 'anthropic.com',      url: 'https://anthropic.com',      market: 'international', role: 'benchmark' },
  { label: 'nuanqing.com.cn',    url: 'https://nuanqing.com.cn',    market: 'china',         role: 'client' },
  { label: 'capcut.cn',          url: 'https://www.capcut.cn',      market: 'china',         role: 'benchmark' },
];

function slug(label: string): string {
  return label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

async function runOne(target: SiteTarget): Promise<{
  label: string;
  role: string;
  report: AuditReport;
  durationMs: number;
}> {
  console.log(`\n📡 [${target.role.toUpperCase()}] 开始审计 ${target.label} (market=${target.market})...`);
  const t0 = Date.now();

  const report = await auditLight(
    { url: target.url, market: target.market },
    {
      onProgress: (stage) => {
        process.stdout.write(`  ⏳ ${stage}\r`);
      },
    },
  );

  const durationMs = Date.now() - t0;
  process.stdout.write('\n');
  return { label: target.label, role: target.role, report, durationMs };
}

function saveReports(label: string, report: AuditReport): { jsonPath: string; mdPath: string; htmlPath: string } {
  const s = slug(label);
  const jsonPath = join(OUT_DIR, `${s}.json`);
  const mdPath = join(OUT_DIR, `${s}.md`);
  const htmlPath = join(OUT_DIR, `${s}.html`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  writeFileSync(htmlPath, renderHtml(report), 'utf8');

  return { jsonPath, mdPath, htmlPath };
}

function printSummary(report: AuditReport, role: string, durationMs: number): void {
  const m = report.meta;
  if (m.error) {
    console.log(`  ⚠️  错误报告：${m.error}`);
    if (m.errorHint) console.log(`     提示：${m.errorHint}`);
    return;
  }

  const s = report.scores!;
  const triggered = report.vetoes.filter(v => v.triggered);
  console.log(`  总分：${s.total}/100 · ${s.level} (indicative=${s.indicative})`);
  console.log(`  维度：D1=${s.dimensions.D1.score} D2=${s.dimensions.D2.score} D3=${s.dimensions.D3.score} D4=${s.dimensions.D4.score} D5=${s.dimensions.D5.score}`);
  console.log(`  采样页：${m.sampledPages.slice(0, 3).join(', ')}${m.sampledPages.length > 3 ? '...' : ''}`);
  if (triggered.length > 0) console.log(`  🚫 一票否决：${triggered.map(v => v.rule).join(', ')}`);
  if (report.couplingFlags.length > 0) console.log(`  🔗 耦合：${report.couplingFlags.map(f => f.code).join(', ')}`);
  console.log(`  topFixes 数：${report.topFixes.length}，notEvaluated 数：${report.notEvaluated.length}`);
  console.log(`  运行时间：${(durationMs / 1000).toFixed(1)}s`);

  // role-specific checks
  if (role === 'benchmark') {
    const ok = s.total >= 41;
    console.log(`  ${ok ? '✅' : '❌'} [标杆站期望] 总分 ≥ 41 (L1+)：${ok ? 'PASS' : `FAIL (${s.total})`}`);
  } else {
    console.log(`  ℹ️  [客户站] 销售价值评估见 dogfood 报告`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('🔍 Prism T10 Dogfood 验收跑 — 4 站端到端 auditLight');
console.log(`   注意：无 LLM judge，LLM 型检查项走启发式兜底（partial）`);
console.log(`   输出目录：${OUT_DIR}\n`);

const summary: Array<{
  label: string; role: string; market: string;
  total: number | null; level: string | null; error: string | null;
  jsonPath: string; mdPath: string; htmlPath: string;
  durationMs: number;
}> = [];

for (const target of TARGETS) {
  const { label, role, report, durationMs } = await runOne(target);
  printSummary(report, role, durationMs);

  const { jsonPath, mdPath, htmlPath } = saveReports(label, report);
  console.log(`  💾 已保存：${jsonPath}`);

  summary.push({
    label,
    role,
    market: target.market,
    total: report.scores?.total ?? null,
    level: report.scores?.level ?? null,
    error: report.meta.error ?? null,
    jsonPath,
    mdPath,
    htmlPath,
    durationMs,
  });
}

// ── 汇总表 ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('📊 T10 Dogfood 汇总');
console.log('═'.repeat(70));
console.log(`${'站点'.padEnd(22)} ${'角色'.padEnd(10)} ${'市场'.padEnd(14)} ${'得分'.padEnd(8)} ${'等级'.padEnd(5)} 状态`);
console.log('-'.repeat(70));
for (const r of summary) {
  const score = r.error ? '错误' : String(r.total ?? '—');
  const level = r.error ? r.error : (r.level ?? '—');
  const status = r.error ? '❌ error' : '✅ 有报告';
  console.log(`${r.label.padEnd(22)} ${r.role.padEnd(10)} ${r.market.padEnd(14)} ${score.padEnd(8)} ${level.padEnd(5)} ${status}`);
}
console.log('═'.repeat(70));
console.log('\n✅ Dogfood 跑完，请人工核对各站 .md / .html 报告。');
console.log('   见 dogfood/ 目录中的 *.md 和 *.html 文件。');
