/**
 * Recording judge —— 第一遍「prompt 收集」用（DAI-1328 / Track A1）。
 *
 * 把一个 LlmJudge 注入 auditLight，它**不做任何真实判断**，只把 Analyzer 为每个
 * llm 型检查项构造的 {checkId, instruction, context} 记录下来，并返回一个哨兵 verdict
 * 让分析流程跑完（产出的报告被丢弃）。
 *
 * 这样收集到的 prompts 与正式运行时 Analyzer 实际发给 judge 的内容**逐字一致**
 * （复用同一份 def.prompt(ctx)），无需在 core 里另开「prompt 导出」通道，
 * 不动三段解耦契约。
 */

import type { JudgeRequest, JudgeVerdict, LlmJudge } from '../../src/analyzer/types.ts';

/** 收集到的单条 prompt（= JudgeRequest，原样落盘）。 */
export type CollectedPrompt = JudgeRequest;

/** 哨兵 verdict：仅用于让第一遍分析流程跑完，报告会被丢弃。 */
const SENTINEL: JudgeVerdict = {
  rating: 'partial',
  evidence: '[recording-judge sentinel] 第一遍仅收集 prompt，未做判断',
};

/**
 * 创建一个记录型 judge。
 * @returns judge 注入 auditLight；prompts 是运行后被收集的所有 llm 检查项请求。
 */
export function createRecordingJudge(): { judge: LlmJudge; prompts: CollectedPrompt[] } {
  const prompts: CollectedPrompt[] = [];
  const judge: LlmJudge = async (req) => {
    prompts.push({
      checkId: req.checkId,
      dimension: req.dimension,
      name: req.name,
      instruction: req.instruction,
      context: req.context,
    });
    return SENTINEL;
  };
  return { judge, prompts };
}
