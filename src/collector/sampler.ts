/**
 * 页面抽样策略 — §5.4
 * 首页必采 + 从 sitemap/内链选 2-3 代表页（About、核心服务页、最新内容页）
 * 总计 ≤5 页
 */

const MAX_PAGES = 5;
const SAMPLE_COUNT = 3; // 除首页外最多抽取页数

/** 关键词权重：命中权重越高越优先 */
const PRIORITY_PATTERNS: Array<{ re: RegExp; score: number }> = [
  { re: /\/about[-_]?|\/关于|\/aboutus/i,      score: 10 },
  { re: /\/service|\/services|\/product|\/solutions/i, score: 8 },
  { re: /\/blog\/|\/article\/|\/post\/|\/news\//i, score: 6 },
  { re: /\/contact|\/联系|\/faq/i,             score: 4 },
  { re: /\/case|\/showcase|\/portfolio/i,      score: 3 },
];

/**
 * 从候选 URL 列表中选取代表性页面
 * @param sitemapUrls  sitemap 中的 URL
 * @param internalLinks 首页内链
 * @param homepageUrl  首页 URL（排除自身）
 */
export function selectSamplePages(
  sitemapUrls: string[],
  internalLinks: string[],
  homepageUrl: string,
): string[] {
  const origin = safeOrigin(homepageUrl);
  const candidates = dedup([...sitemapUrls, ...internalLinks])
    .filter(u => u !== homepageUrl && isSameDomain(u, origin))
    .map(u => ({ url: u, score: scorePage(u) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SAMPLE_COUNT)
    .map(x => x.url);

  return candidates;
}

function scorePage(url: string): number {
  let s = 0;
  for (const { re, score } of PRIORITY_PATTERNS) {
    if (re.test(url)) s += score;
  }
  // 路径深度惩罚：深层页面降优先级（/a/b/c → -2）
  const depth = (url.match(/\//g) ?? []).length - 2;
  s -= Math.max(0, depth) * 2;
  return s;
}

function dedup(urls: string[]): string[] {
  return [...new Set(urls)];
}

function safeOrigin(url: string): string {
  try { return new URL(url).origin; } catch { return ''; }
}

function isSameDomain(url: string, origin: string): boolean {
  try { return new URL(url).origin === origin; } catch { return false; }
}
