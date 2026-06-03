/**
 * Prism core 统一入口（PRD §8.2 实现契约）。
 *
 * 架构约定（CLAUDE.md §1 Core 与前端形态解耦）：
 *  - skill / web 两个前端**只调本文件的 auditLight**，不得各自实现采集/打分。
 *  - 编排链路：Collector(T3/DAI-1273, 产 RawSiteData)
 *              → Analyzer(T4/DAI-1274, 产 CheckResult/维度分)
 *              → Scorer/Reporter(T2, buildScores + 渲染)。
 *
 * 本文件（T2）锁定 §8.2 的接口形状与契约；Collector/Analyzer 装配在 T3/T4 就绪后接入。
 * 在此之前调用 auditLight 会显式抛错（而非静默返回空报告），避免被误用。
 */

import type { AuditInput, AuditOptions, AuditReport } from './types.ts';

/**
 * Light 审计统一入口（PRD §8.2，MVP 实现目标）。
 *
 * 当前为 §8.2 契约占位：装配依赖 Collector(T3) 与 Analyzer(T4)，二者就绪后在此接线。
 * 调用方应通过本函数获取结构化 `AuditReport`；core 永远返回结构化结果、不抛裸异常给最终用户
 * （PRD §10）——该"永不崩"契约在装配完成后由编排层落实，此占位阶段显式 reject。
 */
export async function auditLight(
  _input: AuditInput,
  _opts?: AuditOptions,
): Promise<AuditReport> {
  throw new Error(
    'auditLight 尚未接线：依赖 Collector(T3/DAI-1273) 与 Analyzer(T4/DAI-1274)。' +
      '本函数为 PRD §8.2 契约占位，采集/分析装配在 T3/T4 就绪后接入。',
  );
}

/**
 * Deep 审计入口（PRD §8.2 / §14 King 决策 #3）—— 同签名预留，MVP 不实现。
 *
 * 未来定位为 agent 全自动：多引擎实测采样 + earned media 调研 + 跨 query 稳定性，
 * 输出同一 `AuditReport` 结构（auditTier:'deep'，填充 Light 标 notEvaluated 的子项）。
 * 当前仅锁定接口形状，不实现采集。
 */
export async function auditDeep(
  _input: AuditInput,
  _opts?: AuditOptions,
): Promise<AuditReport> {
  throw new Error(
    'auditDeep 未实现：Phase 3 商业化形态（agent 全自动），当前仅预留 PRD §8.2 接口签名。',
  );
}
