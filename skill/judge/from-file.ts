/**
 * judge-from-file 适配器 —— 第二遍「judge 回填」用（DAI-1328 / Track A1）。
 *
 * 宿主 agent（跑 skill 的 Claude）读 prompts.json 逐项判定后写回 verdicts.json；
 * 本适配器把 verdicts.json 包成一个 LlmJudge 注入 auditLight，按 checkId 取对应
 * verdict。缺项时**抛错**——交由 Analyzer 的 try/catch 降级为启发式兜底（PRD §10），
 * 同时在 evidence 里留「LLM 判断失败降级」痕迹，使遗漏可见而非静默返常量。
 *
 * 设计取舍：判断逻辑仍集中在 Analyzer，本适配器只做「按 key 取 verdict」的薄壳，
 * 不动 core 三段解耦契约。
 */

import { readFileSync } from 'node:fs';
import type { JudgeVerdict, LlmJudge, Rating } from '../../src/analyzer/types.ts';

const VALID_RATINGS: ReadonlySet<Rating> = new Set<Rating>(['good', 'partial', 'poor', 'na']);

/** verdicts.json 单条。 */
export interface FileVerdict {
  checkId: string;
  rating: Rating;
  evidence: string;
}

/** verdicts.json 顶层结构（也兼容直接是数组）。 */
export interface VerdictsFile {
  verdicts: FileVerdict[];
}

/** 解析 + 校验 verdicts 列表，建成 checkId → JudgeVerdict 映射。 */
export function parseVerdicts(raw: unknown): Map<string, JudgeVerdict> {
  const list: unknown = Array.isArray(raw)
    ? raw
    : (raw as VerdictsFile | null)?.verdicts;
  if (!Array.isArray(list)) {
    throw new Error('verdicts 格式非法：应为数组或 { verdicts: [...] }');
  }
  const map = new Map<string, JudgeVerdict>();
  for (const item of list as FileVerdict[]) {
    if (!item || typeof item.checkId !== 'string') {
      throw new Error(`verdicts 条目缺 checkId：${JSON.stringify(item)}`);
    }
    if (!VALID_RATINGS.has(item.rating)) {
      throw new Error(`verdicts[${item.checkId}] rating 非法：${item.rating}（应为 good|partial|poor|na）`);
    }
    map.set(item.checkId, {
      rating: item.rating,
      evidence: typeof item.evidence === 'string' && item.evidence.length > 0
        ? item.evidence
        : '(agent-judge 未给 evidence)',
    });
  }
  return map;
}

/** 从 verdicts.json 文件读取并解析。 */
export function loadVerdicts(path: string): Map<string, JudgeVerdict> {
  return parseVerdicts(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * 用一份 verdict 映射构造 LlmJudge。
 * 缺 checkId → 抛错（Analyzer 降级兜底）。
 */
export function createFileJudge(verdicts: Map<string, JudgeVerdict>): LlmJudge {
  return async (req) => {
    const v = verdicts.get(req.checkId);
    if (!v) {
      throw new Error(`verdicts.json 缺 checkId=${req.checkId} 的判定`);
    }
    return v;
  };
}

/** 便捷：直接从文件路径建 judge。 */
export function createFileJudgeFromPath(path: string): LlmJudge {
  return createFileJudge(loadVerdicts(path));
}
