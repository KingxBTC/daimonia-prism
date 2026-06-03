/**
 * L-1 网站画像推断（PRD §5.2 L-1）—— YMYL / Niche / 规模 / 语言 / 目标引擎。
 *
 * 设计：确定性字段（domain/语言/规模/市场/引擎）由 RawSiteData 直接推断；
 * 主观字段（businessType/isYMYL/nicheTier）优先用 LLM 分类，缺失则启发式兜底（PRD §5.2 "LLM 判断 + 启发式"）。
 */

import type { RawSiteData, SiteProfile, Market, NicheTier, SiteScale } from './imports.ts';

/** LLM 或启发式产出的主观分类。 */
export interface ProfileClassification {
  businessType: string;
  isYMYL: boolean;
  ymylCategory?: string;
  nicheTier: NicheTier;
}

/** YMYL 关键词（中英），命中即判 YMYL（§3.3 一票否决 + Niche 相关）。 */
const YMYL_KEYWORDS: Array<{ re: RegExp; cat: string }> = [
  { re: /医疗|健康|疾病|药|诊断|治疗|health|medical|disease|drug|clinic/i, cat: '医疗健康' },
  { re: /婚姻|情感|心理|咨询|psycholog|marriage|counsel|therapy/i, cat: '情感婚姻心理' },
  { re: /金融|投资|理财|保险|贷款|股票|基金|finance|invest|insurance|loan|stock/i, cat: '金融理财' },
  { re: /法律|律师|诉讼|合同|legal|lawyer|attorney|litigation/i, cat: '法律' },
  { re: /教育|升学|考试|留学|education|tuition|admission/i, cat: '教育' },
  { re: /安全|急救|safety|emergency/i, cat: '人身安全' },
];

/** 目标引擎（PRD §6，取各市场高优先级）。 */
const ENGINES: Record<Market, string[]> = {
  international: ['claude', 'chatgpt', 'gemini', 'perplexity', 'google_aio'],
  china: ['baidu', 'doubao', 'yuanbao', 'deepseek', 'qwen'],
  both: ['claude', 'chatgpt', 'gemini', 'baidu', 'doubao', 'yuanbao'],
};

/** 启发式 YMYL 判断（标题 + meta + 首页正文）。 */
export function heuristicYmyl(raw: RawSiteData): { isYMYL: boolean; ymylCategory?: string } {
  const home = raw.pages[0];
  const hay = `${home?.title ?? ''} ${home?.metaDescription ?? ''} ${(home?.textContent ?? '').slice(0, 1000)}`;
  for (const { re, cat } of YMYL_KEYWORDS) {
    if (re.test(hay)) return { isYMYL: true, ymylCategory: cat };
  }
  return { isYMYL: false };
}

/** 启发式 nicheTier（规模 + 内链广度的粗判；earned 数据缺失，仅 indicative）。 */
export function heuristicNicheTier(raw: RawSiteData): NicheTier {
  if (raw.siteScale === '>1000') return 'head';
  if (raw.siteScale === '<100') return 'niche';
  return 'mid';
}

/** 确定性兜底分类（无 LLM 时用）。 */
export function heuristicClassification(raw: RawSiteData): ProfileClassification {
  const ymyl = heuristicYmyl(raw);
  const home = raw.pages[0];
  const businessType = (home?.title ?? '').trim().split(/[|｜\-–—·]/)[0].trim().slice(0, 40) || '未知';
  return {
    businessType,
    isYMYL: ymyl.isYMYL,
    ymylCategory: ymyl.ymylCategory,
    nicheTier: heuristicNicheTier(raw),
  };
}

/** 语言推断：首页 lang 优先，否则按 CJK 字符占比粗判。 */
export function inferLanguage(raw: RawSiteData): string {
  const home = raw.pages[0];
  if (home?.lang) return home.lang;
  const text = home?.textContent ?? '';
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  return cjk > text.length * 0.1 ? 'zh-CN' : 'unknown';
}

function geoMarketLabel(market: Market, lang: string): string {
  if (market === 'china') return '中国大陆';
  if (market === 'both') return '中国大陆 + 国际';
  return lang.startsWith('zh') ? '中文区（国际语境）' : '国际';
}

/**
 * 组装 SiteProfile（L-1）。
 * @param classification LLM 或启发式产出的主观分类（businessType/YMYL/niche）。
 */
export function inferProfile(
  raw: RawSiteData,
  market: Market,
  classification: ProfileClassification,
): SiteProfile {
  const language = inferLanguage(raw);
  return {
    domain: raw.domain,
    businessType: classification.businessType,
    isYMYL: classification.isYMYL,
    ymylCategory: classification.ymylCategory,
    nicheTier: classification.nicheTier,
    siteScale: raw.siteScale as SiteScale,
    primaryLanguage: language,
    geoMarket: geoMarketLabel(market, language),
    targetEngines: ENGINES[market],
  };
}
