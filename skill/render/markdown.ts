/**
 * AuditReport → §7.3 markdown 报告渲染器。
 *
 * 纯函数：renderMarkdown(report) → string。对话内即时阅读形态（skill MVP 主输出）。
 * 只消费 JSON，不重新判断（CLAUDE.md §4）。
 */

import type { AuditReport } from '../../src/core/types.ts';
import {
  DIMENSION_META,
  DIMENSION_ORDER,
  LEVEL_DESC,
  deriveKeyRisks,
} from './spec.ts';

const EFFORT_CN: Record<string, string> = { low: '低', mid: '中', high: '高' };

/** 多个 issue 合并为一行表格单元（markdown 表格不能含裸 `|` 和换行）。 */
function joinIssues(issues: string[]): string {
  if (!issues || issues.length === 0) return '—';
  return issues.map((s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join('；');
}

function renderErrorReport(report: AuditReport): string {
  const m = report.meta;
  const lines: string[] = [];
  lines.push('# 🔍 Prism GEO 审计报告（Light · indicative）');
  lines.push(
    `**站点**：${m.url} ｜ **市场**：${m.market} ｜ **标准**：${m.standardVersion} ｜ ${m.timestamp}`,
  );
  lines.push('');
  lines.push('## ⚠️ 审计未完成');
  lines.push(`**错误**：\`${m.error}\` —— 未能采集到站点数据，无法出具评分。`);
  if (m.errorHint) {
    lines.push('');
    lines.push(`> ${m.errorHint}`);
  }
  lines.push('');
  lines.push('## 下一步');
  lines.push(report.deepAuditRationale || '解决上述问题后重试 `/prism-geo-audit`。');
  return lines.join('\n') + '\n';
}

export function renderMarkdown(report: AuditReport): string {
  if (report.meta.error) return renderErrorReport(report);

  const m = report.meta;
  const s = report.scores!;
  const lines: string[] = [];

  // 标题 + 元信息
  lines.push('# 🔍 Prism GEO 审计报告（Light · indicative）');
  lines.push(
    `**站点**：${m.url} ｜ **市场**：${m.market} ｜ **标准**：${m.standardVersion} ｜ ${m.timestamp}`,
  );
  lines.push('');

  // 总览
  lines.push('## 总览');
  lines.push(
    `**${s.total}/100 · ${s.level}（${LEVEL_DESC[s.level]}）** ⚠️ indicative，Deep 审计后可能下调`,
  );
  lines.push(`> 关键风险：${deriveKeyRisks(report).join('；')}`);
  lines.push('');

  // 五维度表
  lines.push('## 五维度');
  lines.push('| 维度 | 分数 | 权重 | 主要问题 |');
  lines.push('|------|------|------|----------|');
  for (const id of DIMENSION_ORDER) {
    const d = s.dimensions[id];
    const meta = DIMENSION_META[id];
    lines.push(
      `| ${meta.label} | ${d.score} | ${meta.weightPct} | ${joinIssues(d.issues)} |`,
    );
  }
  lines.push('');

  // 耦合块 / 一票否决块（按需）
  if (report.couplingFlags.length > 0) {
    const items = report.couplingFlags
      .map((c) => `\`${c.code}\` ${c.note}`)
      .join('；');
    lines.push(`> 🔗 耦合提示：${items}`);
    lines.push('');
  }
  const triggered = report.vetoes.filter((v) => v.triggered);
  if (triggered.length > 0) {
    const rules = triggered.map((v) => `\`${v.rule}\``).join('、');
    lines.push(`> 🚫 一票否决：${rules} 触发 —— 等级锁定 **L0**（其余维度分数仅供整改参考）`);
    lines.push('');
  }

  // 未评估
  lines.push('## ⚠️ 本次未评估（需 Deep 审计）');
  for (const item of report.notEvaluated) {
    lines.push(`- ${item}`);
  }
  if (report.nicheWarning) {
    lines.push('');
    lines.push(`> 📌 Niche 提示：${report.nicheWarning}`);
  }
  lines.push('');

  // Top3
  lines.push('## ✅ Top 3 立即可行整改');
  if (report.topFixes.length === 0) {
    lines.push('（无）');
  } else {
    for (const f of report.topFixes) {
      lines.push(
        `${f.priority}. **[${f.dimension}] ${f.action}** — ${f.rationale}（${EFFORT_CN[f.effort] ?? f.effort}）`,
      );
    }
  }
  lines.push('');

  // 下一步
  lines.push('## 下一步');
  if (report.deepAuditRecommended) {
    lines.push(`建议 Deep 审计：${report.deepAuditRationale}`);
  } else {
    lines.push('站内信号良好，可暂不做 Deep。');
  }
  lines.push(
    '> Deep 审计含多引擎实测引用率 + earned media 调研 + 跨 query 稳定性，联系 Daimonia 交付团队。',
  );

  return lines.join('\n') + '\n';
}
