/**
 * Top3 立即可行整改 —— 按 §2.4 GEO 9 方法 ROI 排序（PRD §7.2 / L-6）。
 *
 * ROI 排名依据 Aggarwal et al. "GEO" 实证：Statistics/Quotation/Citing Sources 类
 * 相对可见性提升最高；Authoritative/Fluency 次之；Keyword Stuffing 反效果（不推荐）。
 * 叠加 Prism 快赢项（llms.txt / E-E-A-T / robots / sitemap：低成本高确定收益）。
 */

import type { CheckDef, DimensionAnalysis, FixHint } from './types.ts';
import type { TopFix, DimensionId, CheckResult } from './imports.ts';

/** method → ROI 排名（越小越优先）+ 默认 effort。来源见文件头。 */
const METHOD_ROI: Record<string, number> = {
  'Statistics Addition': 1,
  'Quotation Addition': 2,
  'Citing Sources': 3,
  'llms.txt': 4,           // 极低成本 + PRD 明确 -10，快赢
  'E-E-A-T': 5,
  'Authoritative': 6,
  'schema.org': 7,
  'FAQ': 8,
  'sitemap': 9,
  'robots 放行': 10,
  '时间标注': 11,
  '标题层级': 12,
  '内容分块': 13,
  '章节结构': 14,
  '自足改写': 15,
  '透明披露': 16,
  'micro 强调': 17,
  '语义化 HTML': 18,
  '性能优化': 19,
  'HTTPS': 20,
  'SSR/预渲染': 21,
};

const SEVERITY: Record<CheckResult['status'], number> = { fail: 2, partial: 1, pass: 0, na: 0 };

interface FixCandidate {
  dimension: DimensionId;
  fix: FixHint;
  severity: number;
  roi: number;
}

/**
 * 从各维度 fail/partial 检查项收集整改候选，按 (ROI, 严重度) 排序，取 Top3。
 * 同一 method 去重（保留更严重的那条）。
 */
export function buildTopFixes(
  dimensions: Partial<Record<DimensionId, DimensionAnalysis>>,
  defs: readonly CheckDef[],
): TopFix[] {
  const byId = new Map(defs.map(d => [d.id, d]));
  const candidates: FixCandidate[] = [];

  for (const dimAnalysis of Object.values(dimensions)) {
    if (!dimAnalysis) continue;
    for (const check of dimAnalysis.checks) {
      if (check.status !== 'fail' && check.status !== 'partial') continue;
      const def = byId.get(check.id);
      if (!def?.fix) continue;
      candidates.push({
        dimension: def.dimension,
        fix: def.fix,
        severity: SEVERITY[check.status],
        roi: METHOD_ROI[def.fix.method] ?? 99,
      });
    }
  }

  // 同 method 去重，保留严重度更高者
  const byMethod = new Map<string, FixCandidate>();
  for (const c of candidates) {
    const prev = byMethod.get(c.fix.method);
    if (!prev || c.severity > prev.severity) byMethod.set(c.fix.method, c);
  }

  const ranked = [...byMethod.values()].sort((a, b) => {
    if (a.roi !== b.roi) return a.roi - b.roi;     // ROI 优先
    return b.severity - a.severity;                 // 同 ROI 看严重度
  });

  return ranked.slice(0, 3).map((c, i): TopFix => ({
    priority: i + 1,
    dimension: c.dimension,
    method: c.fix.method,
    action: c.fix.action,
    rationale: rationaleFor(c),
    effort: c.fix.effort,
  }));
}

function rationaleFor(c: FixCandidate): string {
  if (c.roi <= 3) return 'GEO 9 方法 ROI 最高，引用可见性提升显著';
  if (c.fix.method === 'llms.txt') return '缺失明确 -10 分，零成本快赢';
  if (c.fix.method === 'E-E-A-T') return 'YMYL 领域权威要求高，影响 D3';
  if (c.severity >= 2) return '当前明确缺失，修复 ROI 高';
  return '低成本可改进项';
}
