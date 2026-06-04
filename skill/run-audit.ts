/**
 * Prism skill 侧 runner —— agent-judge 两遍式编排（DAI-1328 / Track A1）。
 *
 * 解决「LLM judge 从未接线」（见 docs/iteration-light-discrimination.md §1）：
 * skill 形态无 API key，由**宿主 agent 当裁判**，分两遍跑：
 *
 *   1) collect：跑一遍 auditLight + recording-judge，把所有 llm 检查项的
 *      {checkId,instruction,context} 导出到 prompts.json（报告丢弃）。
 *   2) 宿主 agent 读 prompts.json 逐项判定，写回 verdicts.json
 *      （[{checkId,rating,evidence}]，rating ∈ good|partial|poor|na）。
 *   3) report：跑第二遍 auditLight + judge-from-file，verdict 从 verdicts.json 取，
 *      产出 {slug}.json/.md/.html。
 *
 * 用法：
 *   node skill/run-audit.ts collect <url> [--market international|china|both] [--out prompts.json]
 *   node skill/run-audit.ts report  <url> --verdicts verdicts.json [--market ...] [--out-dir dir]
 *
 * 不动 core 三段解耦契约：两遍都只调 auditLight(input,{judge})。
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { auditLight } from '../src/core/audit.ts';
import { CHECKLIST } from '../src/analyzer/checklist.ts';
import { renderMarkdown } from './render/markdown.ts';
import { renderHtml } from './render/html.ts';
import { createRecordingJudge } from './judge/recording-judge.ts';
import { loadVerdicts, createFileJudge } from './judge/from-file.ts';
import type { Market } from '../src/core/types.ts';

const VALID_MARKETS: Market[] = ['international', 'china', 'both'];
/** Analyzer 会发给 judge 的全部 llm 检查项 id（覆盖率自检用）。 */
const LLM_CHECK_IDS = CHECKLIST.filter(c => c.kind === 'llm').map(c => c.id);

interface Flags { [k: string]: string | undefined; }

function parseFlags(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = 'true';
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function resolveMarket(flag: string | undefined): Market {
  const m = (flag ?? 'international') as Market;
  if (!VALID_MARKETS.includes(m)) {
    console.error(`--market 非法：${m}（应为 ${VALID_MARKETS.join('|')}）`);
    process.exit(2);
  }
  return m;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  } catch {
    return 'prism-report';
  }
}

// ── collect：第一遍导出 prompts.json ───────────────────────────────────────
async function cmdCollect(url: string, flags: Flags): Promise<void> {
  const market = resolveMarket(flags.market);
  const outPath = resolve(flags.out ?? 'prompts.json');

  const { judge, prompts } = createRecordingJudge();
  await auditLight({ url, market }, { judge }); // 报告丢弃，只要 prompts

  const payload = {
    url,
    market,
    generatedAt: new Date().toISOString(),
    note: '宿主 agent 请逐项判定，写回 verdicts.json：[{checkId,rating,evidence}]，rating ∈ good|partial|poor|na',
    expectedCheckIds: LLM_CHECK_IDS,
    checks: prompts,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.error(`[prism] 已导出 ${prompts.length} 条 llm prompt → ${outPath}`);
  console.error('[prism] 下一步：宿主 agent 读该文件逐项判定，写回 verdicts.json，再跑 report。');
}

// ── report：第二遍 judge-from-file 产报告 ──────────────────────────────────
async function cmdReport(url: string, flags: Flags): Promise<void> {
  const market = resolveMarket(flags.market);
  if (!flags.verdicts || flags.verdicts === 'true') {
    console.error('report 需要 --verdicts <verdicts.json>');
    process.exit(2);
  }
  const verdicts = loadVerdicts(resolve(flags.verdicts));

  // 覆盖率自检：缺哪些 llm 项会在 Analyzer 里降级兜底
  const missing = LLM_CHECK_IDS.filter(id => !verdicts.has(id));
  if (missing.length > 0) {
    console.error(`[prism] ⚠️ verdicts 缺 ${missing.length}/${LLM_CHECK_IDS.length} 个 llm 项，将降级启发式兜底：${missing.join(', ')}`);
  } else {
    console.error(`[prism] ✓ verdicts 覆盖全部 ${LLM_CHECK_IDS.length} 个 llm 项`);
  }

  const judge = createFileJudge(verdicts);
  const report = await auditLight({ url, market }, { judge });

  const outDir = resolve(flags['out-dir'] ?? '.');
  const stem = slugFromUrl(url);
  const jsonPath = join(outDir, `${stem}.json`);
  const mdPath = join(outDir, `${stem}.md`);
  const htmlPath = join(outDir, `${stem}.html`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  writeFileSync(htmlPath, renderHtml(report), 'utf8');

  // markdown 回显到 stdout（skill 形态送进对话）
  process.stdout.write(renderMarkdown(report));
  console.error(`\n[prism] 已写出：\n  ${jsonPath}\n  ${mdPath}\n  ${htmlPath}`);
}

// ── main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { positionals, flags } = parseFlags(process.argv.slice(2));
  const [cmd, url] = positionals;
  if (!cmd || !url) {
    console.error('用法：');
    console.error('  node skill/run-audit.ts collect <url> [--market international|china|both] [--out prompts.json]');
    console.error('  node skill/run-audit.ts report  <url> --verdicts verdicts.json [--market ...] [--out-dir dir]');
    process.exit(2);
  }
  if (cmd === 'collect') return cmdCollect(url, flags);
  if (cmd === 'report') return cmdReport(url, flags);
  console.error(`未知子命令：${cmd}（应为 collect | report）`);
  process.exit(2);
}

main().catch((err) => {
  console.error(`[prism] 运行失败：${err instanceof Error ? err.stack ?? err.message : err}`);
  process.exit(1);
});
