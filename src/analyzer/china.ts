/**
 * Analyzer ↔ china 模块的接线适配器（PRD §6.3，T7 接入）。
 *
 * 职责：从 Collector 的 `RawSiteData` 提取 china 审计所需的两类确定性信号——
 *   (1) 站点内容分布平台（扫页面 HTML 的对外平台链接 + 站点自身=官网/开放 web）；
 *   (2) robots.txt 中被 disallow 的国内 bot UA——
 * 然后调用 core/china 的 `buildChinaMarketChecks` 产出 CheckResult[]。
 *
 * 判断逻辑仍集中在 core/china（纯函数）；本文件只做"RawSiteData → 模块入参"的确定性提取，
 * 不重判（CLAUDE.md §3 三阶段解耦）。
 */

import { buildChinaMarketChecks } from '../core/china/index.ts';
import type { ChinaEngine, ContentPlatform } from '../core/china/index.ts';
import type { CheckResult, Market, RawSiteData } from './imports.ts';

/** 对外内容平台的域名签名（命中即认为站点在该平台有内容分布）。 */
const PLATFORM_DOMAIN_PATTERNS: Array<{ platform: ContentPlatform; pattern: RegExp }> = [
  { platform: 'wechat_oa', pattern: /mp\.weixin\.qq\.com/i },
  { platform: 'wechat_channels', pattern: /channels\.weixin\.qq\.com/i },
  { platform: 'douyin', pattern: /(?:v\.)?douyin\.com/i },
  { platform: 'xiaohongshu', pattern: /xiaohongshu\.com|xhslink\.com/i },
  { platform: 'bilibili', pattern: /bilibili\.com|b23\.tv/i },
  { platform: 'zhihu', pattern: /zhihu\.com/i },
  { platform: 'baijiahao', pattern: /baijiahao\.baidu\.com/i },
  { platform: 'souhu', pattern: /mp\.sohu\.com/i },
  { platform: 'wangyi', pattern: /dy\.163\.com/i },
  { platform: 'toutiao', pattern: /toutiao\.com/i },
  { platform: 'dianping', pattern: /dianping\.com/i },
];

/**
 * 检测站点内容分布平台。
 * 站点自身永远计入 `official_site`（被审计的开放 web 资产）；其余平台靠页面 HTML 中
 * 的对外链接签名命中（Light 档启发式，Deep 档可换更强的内容资产盘点）。
 */
export function detectContentPlatforms(raw: RawSiteData): ContentPlatform[] {
  const found = new Set<ContentPlatform>(['official_site']);
  const haystack = (raw.pages ?? []).map((p) => p.html ?? '').join('\n');
  for (const { platform, pattern } of PLATFORM_DOMAIN_PATTERNS) {
    if (pattern.test(haystack)) found.add(platform);
  }
  return [...found];
}

/** 从 robots 策略提取被 disallow 的国内 bot UA。 */
export function extractBlockedCnBotUAs(raw: RawSiteData): string[] {
  const policies = raw.robots?.llmBotPolicies ?? {};
  return Object.entries(policies)
    .filter(([, policy]) => policy === 'disallow')
    .map(([ua]) => ua);
}

/**
 * 接入入口：RawSiteData + market → china CheckResult[]。
 * market 不含 china（international）时返回空（由 core/china 内部保证）。
 */
export function buildChinaChecksFromRaw(
  raw: RawSiteData,
  market: Market,
  targetEngines?: readonly ChinaEngine[],
): CheckResult[] {
  return buildChinaMarketChecks({
    market,
    contentPlatforms: detectContentPlatforms(raw),
    blockedCnBotUAs: extractBlockedCnBotUAs(raw),
    targetEngines,
  });
}

/** china CheckResult.id → 归属维度（PRD §6.3：可达性→D2 内容可见性；robots→D5 access）。 */
export function chinaCheckDimension(checkId: string): 'D2' | 'D5' {
  return checkId === 'china.robots_cn_bots' ? 'D5' : 'D2';
}
