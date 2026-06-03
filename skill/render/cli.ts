/**
 * Prism 渲染 CLI —— 读取一份 AuditReport JSON，产出同名 .md 与 .html 双文件。
 *
 * 用法：
 *   node skill/render/cli.ts <report.json> [outDir]
 *   cat report.json | node skill/render/cli.ts -          # 从 stdin 读，写到 ./
 *
 * skill 形态运行时：core.auditLight 产出 AuditReport → 写临时 JSON → 调本 CLI
 * → markdown 入对话（stdout 同时回显）、.html 作为可分享交付物落盘。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { renderMarkdown } from './markdown.ts';
import { renderHtml } from './html.ts';
import type { AuditReport } from '../../src/core/types.ts';

function readInput(src: string): { json: string; baseDir: string; stem: string } {
  if (src === '-') {
    return { json: readFileSync(0, 'utf8'), baseDir: process.cwd(), stem: 'prism-report' };
  }
  const abs = resolve(src);
  const json = readFileSync(abs, 'utf8');
  const stem = basename(abs, extname(abs));
  return { json, baseDir: dirname(abs), stem };
}

function main(argv: string[]): void {
  const src = argv[2];
  if (!src) {
    console.error('用法：node skill/render/cli.ts <report.json> [outDir]');
    process.exit(2);
  }
  const { json, baseDir, stem } = readInput(src);
  let report: AuditReport;
  try {
    report = JSON.parse(json) as AuditReport;
  } catch (e) {
    console.error(`无法解析 JSON：${(e as Error).message}`);
    process.exit(1);
  }

  const outDir = argv[3] ? resolve(argv[3]) : baseDir;
  const md = renderMarkdown(report);
  const html = renderHtml(report);

  const mdPath = join(outDir, `${stem}.md`);
  const htmlPath = join(outDir, `${stem}.html`);
  writeFileSync(mdPath, md, 'utf8');
  writeFileSync(htmlPath, html, 'utf8');

  // markdown 同时回显到 stdout（skill 形态把它送进对话）。
  process.stdout.write(md);
  console.error(`\n[prism] 已写出：\n  ${mdPath}\n  ${htmlPath}`);
}

main(process.argv);
