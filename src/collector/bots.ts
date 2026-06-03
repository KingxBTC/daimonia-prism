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

/**
 * 中国市场开放 web 抓取型 bot UA（§6.2 / §6.3 robots 核查用）。
 *
 * 与 `src/core/china/facts.ts` 的 `CHINA_BOTS` 保持一致——后者是方法论权威清单
 * （含每个 bot 喂哪些引擎 + 来源注释）；collector 只需 UA 串去查 robots 策略，
 * 故此处仅保留 UA + 代表引擎。新增/调整 UA 时两处同步（T7 接入时已对齐）。
 *
 * 注：平台原生内容（公众号/抖音/视频号）走平台索引，不受 robots 控制（§6.3 D5），
 * 不在本清单；DeepSeek（博查）/ Kimi（自建/Bing 系）无稳定公开中文 UA，走通用爬虫。
 */
export const LLM_BOTS_CHINA: readonly LlmBot[] = [
  { ua: 'Baiduspider',      engine: '百度AI/文心一言', market: 'china' },
  { ua: 'Bytespider',       engine: '豆包',            market: 'china' },
  { ua: 'Sogou web spider', engine: '腾讯元宝/混元/智谱', market: 'china' },
  { ua: 'YisouSpider',      engine: '通义千问',        market: 'china' },
];

export function getBotsForMarket(market: 'international' | 'china' | 'both'): readonly LlmBot[] {
  if (market === 'international') return LLM_BOTS_INTERNATIONAL;
  if (market === 'china') return LLM_BOTS_CHINA;
  return [...LLM_BOTS_INTERNATIONAL, ...LLM_BOTS_CHINA];
}
