/**
 * sitemap.xml 解析器
 * 支持 sitemap index（子 sitemap）和普通 urlset
 * 不全量爬 >1000 站（§5.4），仅取前 500 条 URL 用于规模估算和抽样
 */

import type { SitemapParsed } from './types.ts';

const MAX_URLS_PER_SITEMAP = 500;

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
