/**
 * 渲染层共享规格 —— 维度标签、等级描述、关键风险派生。
 *
 * 纯函数 / 常量。不重新判断打分（CLAUDE.md §4），只是把 AuditReport 的既有字段
 * 映射成人类可读的展示文案（标签来自 PRD §7.3 表头、§5.3 等级定义）。
 */

import type { AuditReport, DimensionId, Level } from '../../src/core/types.ts';

/** §7.3 markdown 模板表头使用的维度展示标签 + 权重。 */
export const DIMENSION_META: Record<
  DimensionId,
  { label: string; weightPct: string }
> = {
  D1: { label: 'D1 结构化语义+宏观架构', weightPct: '20%' },
  D2: { label: 'D2 内容可读性+meso+micro', weightPct: '20%' },
  D3: { label: 'D3 权威信号（部分）', weightPct: '25%' },
  D4: { label: 'D4 可引用性（部分）', weightPct: '25%' },
  D5: { label: 'D5 技术抓取基建', weightPct: '10%' },
};

/** HTML 维度卡片用的短标签（去掉"（部分）"，partial 状态单独以徽标表达）。 */
export const DIMENSION_SHORT: Record<DimensionId, string> = {
  D1: '结构化语义 + 宏观架构',
  D2: '内容可读性 + meso + micro',
  D3: '权威性信号（E-E-A-T + Earned）',
  D4: '可引用性 + 跨 query 稳定性',
  D5: '技术抓取基建',
};

export const DIMENSION_ORDER: DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

/** §5.3 等级定义：L0(0–40)/L1(41–60)/L2(61–80)/L3(81–100)。 */
export const LEVEL_DESC: Record<Level, string> = {
  L0: '严重不足',
  L1: '偏弱',
  L2: '良好',
  L3: '优秀',
};

/**
 * 关键风险派生（PRD §7.2：D5 底座 / YMYL 无权威 / Niche 虚高）。
 * 纯派生——只读 report 既有 flag，不重新判分。
 */
export function deriveKeyRisks(report: AuditReport): string[] {
  const risks: string[] = [];
  const triggered = report.vetoes.filter((v) => v.triggered);
  for (const v of triggered) {
    if (v.rule === 'D5<60') {
      risks.push('D5 技术底座不达标 —— 一票否决，等级锁定 L0');
    } else if (v.rule === 'YMYL_D3<40') {
      risks.push('YMYL 领域权威信号严重不足 —— 一票否决 L0');
    } else {
      risks.push(`${v.rule} 触发 —— 一票否决`);
    }
  }
  if (report.profile?.isYMYL && !triggered.some((v) => v.rule === 'YMYL_D3<40')) {
    const d3 = report.scores?.dimensions.D3.score;
    if (d3 !== undefined && d3 < 60) {
      risks.push('YMYL 主体但站内权威信号偏弱，LLM 引用门槛高');
    }
  }
  if (report.nicheWarning) {
    risks.push('Niche 主体 indicative 分数易虚高（Deep 审计可能下调）');
  }
  if (risks.length === 0) {
    risks.push('无重大一票否决风险；详见各维度问题');
  }
  return risks;
}
