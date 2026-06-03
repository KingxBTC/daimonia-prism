/** LLM 引擎 bot User-Agent 清单 — 内嵌 PRD §6，自包含原则 */

export interface LlmBot {
  ua: string;
  engine: string;
  market: 'international' | 'china' | 'both';
}

/** 国际市场 6 引擎 bot UA（MVP §6.1） */
export const LLM_BOTS_INTERNATIONAL: readonly LlmBot[] = [
  { ua: 'ClaudeBot',       engine: 'Claude',       market: 'international' },
  { ua: 'anthropic-ai',    engine: 'Claude',       market: 'international' },
  { ua: 'GPTBot',          engine: 'ChatGPT',      market: 'international' },
  { ua: 'OAI-SearchBot',   engine: 'ChatGPT',      market: 'international' },
  { ua: 'Google-Extended', engine: 'Gemini',       market: 'international' },
  { ua: 'PerplexityBot',   engine: 'Perplexity',   market: 'international' },
  { ua: 'Googlebot',       engine: 'GoogleAI',     market: 'international' },
  { ua: 'Bingbot',         engine: 'BingChat',     market: 'international' },
];

/** 中国市场 bot UA — Phase 1.1 预留 §6.2 */
export const LLM_BOTS_CHINA: readonly LlmBot[] = [
  { ua: 'Baiduspider',     engine: '百度AI',       market: 'china' },
  { ua: 'Bytespider',      engine: '豆包',         market: 'china' },
  { ua: 'Sogou web spider',engine: '腾讯元宝',     market: 'china' },
];

export function getBotsForMarket(market: 'international' | 'china' | 'both'): readonly LlmBot[] {
  if (market === 'international') return LLM_BOTS_INTERNATIONAL;
  if (market === 'china') return LLM_BOTS_CHINA;
  return [...LLM_BOTS_INTERNATIONAL, ...LLM_BOTS_CHINA];
}
