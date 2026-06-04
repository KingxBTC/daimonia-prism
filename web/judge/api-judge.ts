/**
 * apiJudge 适配器 —— web 后台形态的 LlmJudge（DAI-1332 / Track A(web) / I5）。
 *
 * web 形态：用户输入 URL 点确认 → 后台运行 auditLight。此适配器用 **API key** 调
 * Anthropic Messages API，把每个 llm 型检查项的 {instruction, context} 发给模型，
 * 取回离散评级 + 依据，实现 `LlmJudge`。与 skill 形态的 agent-judge（recording-judge
 * + from-file）共用同一 `LlmJudge` 接口，注入点 `auditLight(opts?.judge)` 天然支持。
 *
 * 设计取舍（与 from-file 一致）：
 *  - 适配器只是「调 API 取 verdict」的薄壳，判断标准仍由 Analyzer 的 def.prompt(ctx)
 *    内嵌（自包含方法论），不动 core 三段解耦契约。
 *  - **错误降级（PRD §10）**：网络异常 / 非 2xx / 响应无法解析 / rating 非法 → **抛错**，
 *    交由 Analyzer 的 try/catch 逐项降级为启发式兜底 + partial，并在 evidence 里留
 *    「LLM 判断失败降级」痕迹（见 src/analyzer/analyze.ts:50-58）。使失败可见而非静默返常量。
 *  - **secret 边界**：apiKey 由调用方注入（web 后台从受限 env / 维龙管理的 secret 通道读），
 *    不硬编码、不入库。缺 key → 构造时抛错，让误配尽早暴露（web 可据此选择不注入 judge，
 *    退回纯启发式而非崩溃）。
 *  - **零运行时依赖**：用 Node 原生 fetch（>=18），不引 @anthropic-ai/sdk，与项目 dep-light
 *    风格一致；测试可注入 fetchImpl 打桩。
 */

import type { JudgeRequest, JudgeVerdict, LlmJudge, Rating } from '../../src/analyzer/types.ts';

/** 默认模型：judge 需要稳定的分类判断质量（关系到区分力 I6），默认 Sonnet，可配。 */
export const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

const VALID_RATINGS: ReadonlySet<Rating> = new Set<Rating>(['good', 'partial', 'poor', 'na']);

/**
 * 稳定的 judge 角色与输出契约。跨同一次运行的所有 llm 检查项**逐字不变**，
 * 标 cache_control 后命中 prompt 缓存，省 token（claude-api 最佳实践）。
 */
const JUDGE_SYSTEM = `你是 Daimonia Prism GEO 审计的判定器（judge）。针对单个检查项，依据给定的「判断标准」与「证据」做出离散评级。
只输出一个 JSON 对象，不要任何额外文字，不要 markdown 代码块：
{"rating": "good|partial|poor|na", "evidence": "一句中文依据，引用证据中的客观事实（扫了哪些页/命中或未命中什么）"}
评级语义：good=明确达标；partial=部分达标或证据不足；poor=明确不达标；na=该项对本站不适用。`;

export interface ApiJudgeConfig {
  /** Anthropic API key。缺省读 process.env.ANTHROPIC_API_KEY。 */
  apiKey?: string;
  /** 模型 ID，默认 DEFAULT_MODEL。 */
  model?: string;
  /** 单次响应上限 token，默认 1024（verdict 很短）。 */
  maxTokens?: number;
  /** API base url，默认官方；可指向代理/网关。 */
  baseUrl?: string;
  /** anthropic-version 头，默认 2023-06-01。 */
  anthropicVersion?: string;
  /** 单请求超时（ms），默认 30000。 */
  timeoutMs?: number;
  /** 注入 fetch（测试打桩用），默认 globalThis.fetch。 */
  fetchImpl?: typeof fetch;
}

/** Anthropic Messages API 响应里我们关心的形状。 */
interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

/** 从模型文本里抽出第一个 JSON 对象（容忍 ```json 代码块或前后多余文字）。 */
export function extractVerdictJson(text: string): { rating: unknown; evidence: unknown } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`响应无 JSON 对象：${text.slice(0, 120)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

/** 校验并归一化模型产出为 JudgeVerdict；非法 → 抛错（触发 Analyzer 降级）。 */
function toVerdict(parsed: { rating: unknown; evidence: unknown }): JudgeVerdict {
  if (typeof parsed.rating !== 'string' || !VALID_RATINGS.has(parsed.rating as Rating)) {
    throw new Error(`rating 非法：${String(parsed.rating)}（应为 good|partial|poor|na）`);
  }
  return {
    rating: parsed.rating as Rating,
    evidence:
      typeof parsed.evidence === 'string' && parsed.evidence.length > 0
        ? parsed.evidence
        : '(apiJudge 未给 evidence)',
  };
}

/** 把单条 JudgeRequest 渲染成发给模型的 user 消息。 */
function buildUserMessage(req: JudgeRequest): string {
  return `检查项：${req.name}（${req.checkId}，维度 ${req.dimension}）
判断标准：
${req.instruction}

证据：
${req.context}`;
}

/**
 * 创建 web 形态的 apiJudge。
 * @throws 构造时若无 apiKey（误配尽早暴露）。
 */
export function createApiJudge(config: ApiJudgeConfig = {}): LlmJudge {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'apiJudge：缺 Anthropic API key（传 config.apiKey 或设 ANTHROPIC_API_KEY）。' +
        'web 后台应据此选择不注入 judge，退回纯启发式而非崩溃。',
    );
  }
  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const anthropicVersion = config.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('apiJudge：运行时无可用 fetch，请升级 Node(>=18) 或注入 config.fetchImpl');
  }

  return async (req: JudgeRequest): Promise<JudgeVerdict> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': anthropicVersion,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          // 稳定 system 块标 cache_control：同一次运行多检查项命中 prompt 缓存。
          system: [{ type: 'text', text: JUDGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildUserMessage(req) }],
        }),
      });
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      throw new Error(`apiJudge 请求失败：${hint}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`apiJudge 非 2xx：${res.status} ${res.statusText} ${bodyText.slice(0, 200)}`);
    }

    const data = (await res.json()) as AnthropicMessageResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) {
      throw new Error('apiJudge 响应无文本内容');
    }
    return toVerdict(extractVerdictJson(text));
  };
}
