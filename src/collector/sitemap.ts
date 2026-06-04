/**
 * sitemap.xml 解析器
 * 支持 sitemap index（子 sitemap）和普通 urlset
 * 不全量爬 >1000 站（§5.4），仅取前 500 条 URL 用于规模估算和抽样
 */

import type { SitemapParsed } from './types.ts';

const MAX_URLS_PER_SITEMAP = 500;
/** 整个 sitemap index 树最多抓取的子 sitemap 数（防爆量 / 防循环） */
const MAX_SUB_SITEMAP_FETCHES = 50;
/** sitemap index 递归最大深度 */
const MAX_SITEMAP_DEPTH = 3;

/** 抓取子 sitemap 的回调：返回 XML body，失败 / 404 返回 null */
export type SitemapFetcher = (url: string) => Promise<string | null>;

export function parseSitemap(xml: string, baseUrl?: string): SitemapParsed {
  const subSitemapUrls = extractSitemapIndexUrls(xml);
  const contentUrls = extractUrlsetUrls(xml);

  return {
    exists: true,
    urls: contentUrls.slice(0, MAX_URLS_PER_SITEMAP),
    totalUrlCount: contentUrls.length,
    subSitemapUrls,
  };
}

/**
 * 解析 sitemap 并递归展开 sitemap index（DAI-1323）
 *
 * 普通 urlset：等价于 parseSitemap，不调用 fetcher。
 * sitemap index：用 fetcher 抓取每个子 sitemap，聚合其内容页 URL；
 * 子 sitemap 本身又是 index 时继续递归（最多 MAX_SITEMAP_DEPTH 层）。
 *
 * 防护：全树最多抓取 MAX_SUB_SITEMAP_FETCHES 个子 sitemap，并用 visited 集去重，
 * 避免自引用 / 循环导致无限递归。子 sitemap 抓取失败（fetcher 抛错或返回 null）跳过不崩。
 */
export async function resolveSitemap(
  rootXml: string,
  fetcher: SitemapFetcher,
): Promise<SitemapParsed> {
  const root = parseSitemap(rootXml);
  const aggregatedUrls: string[] = [...root.urls];
  let totalUrlCount = root.totalUrlCount;
  const visited = new Set<string>();
  let fetchCount = 0;

  async function walk(subSitemapUrls: string[], depth: number): Promise<void> {
    if (depth > MAX_SITEMAP_DEPTH) return;
    for (const subUrl of subSitemapUrls) {
      if (fetchCount >= MAX_SUB_SITEMAP_FETCHES) return;
      if (visited.has(subUrl)) continue;
      visited.add(subUrl);
      fetchCount++;

      let body: string | null;
      try {
        body = await fetcher(subUrl);
      } catch {
        continue;
      }
      if (!body) continue;

      const sub = parseSitemap(body);
      aggregatedUrls.push(...sub.urls);
      totalUrlCount += sub.totalUrlCount;
      if (sub.subSitemapUrls.length > 0) {
        await walk(sub.subSitemapUrls, depth + 1);
      }
    }
  }

  await walk(root.subSitemapUrls, 1);

  return {
    exists: true,
    urls: aggregatedUrls.slice(0, MAX_URLS_PER_SITEMAP),
    totalUrlCount,
    subSitemapUrls: root.subSitemapUrls,
  };
}

export function emptySitemap(): SitemapParsed {
  return {
    exists: false,
    urls: [],
    totalUrlCount: 0,
    subSitemapUrls: [],
  };
}

/** 从 sitemap index 提取子 sitemap URL */
function extractSitemapIndexUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = decodeXmlEntities(m[1].trim());
    if (url) urls.push(url);
  }
  return urls;
}

/** 从 urlset 提取内容页 URL */
function extractUrlsetUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = decodeXmlEntities(m[1].trim());
    if (url) urls.push(url);
  }
  return urls;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** 估算站点规模 */
export function estimateSiteScale(
  sitemapTotalUrls: number,
  internalLinksCount: number,
): '<100' | '100-1000' | '>1000' {
  const estimate = Math.max(sitemapTotalUrls, internalLinksCount);
  if (estimate > 1000) return '>1000';
  if (estimate >= 100) return '100-1000';
  return '<100';
}
