/**
 * HTML 抽取器
 * - JSON-LD 块提取
 * - 标题结构 (H1–H4)
 * - 删 CSS 纯文本（strip all tags）
 * - meta title / description / lang
 * - 内链提取
 * - CSR 空壳检测（view-source 无实质内容）
 */

import type { RawPageData } from './types.ts';

/** CSR 判定：view-source body 文本字符数少于此阈值认定为空壳 */
const CSR_TEXT_THRESHOLD = 200;

export function extractPage(
  html: string,
  url: string,
  finalUrl: string,
  statusCode: number,
  contentType: string,
): Omit<RawPageData, 'isHttps'> {
  const title = extractTitle(html);
  const lang = extractLang(html);
  const metaDescription = extractMetaDescription(html);
  const jsonLd = extractJsonLd(html);
  const headings = extractHeadings(html);
  const textContent = stripTags(html);
  const internalLinks = extractInternalLinks(html, finalUrl);
  const hasContentInViewSource = textContent.trim().length > CSR_TEXT_THRESHOLD;

  return {
    url,
    finalUrl,
    statusCode,
    contentType,
    html,
    textContent,
    title,
    lang,
    metaDescription,
    jsonLd,
    headings,
    internalLinks,
    hasContentInViewSource,
  };
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

function extractLang(html: string): string {
  const m = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  return m ? m[1].trim() : '';
}

function extractMetaDescription(html: string): string {
  const m = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      // LD+JSON 可以是数组或对象
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch {
      // 解析失败的块跳过
    }
  }
  return results;
}

function extractHeadings(html: string): Array<{ level: 1 | 2 | 3 | 4; text: string }> {
  const results: Array<{ level: 1 | 2 | 3 | 4; text: string }> = [];
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const level = parseInt(m[1]) as 1 | 2 | 3 | 4;
    const text = decodeHtmlEntities(stripTags(m[2])).trim();
    if (text) results.push({ level, text });
  }
  return results;
}

/** 删除所有 HTML 标签，返回纯文本（删 CSS 可读性，§5.A L-4） */
export function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractInternalLinks(html: string, pageUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  const links = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#?]+)[^"']*["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === origin && resolved.pathname !== '/') {
        // 规范化：去掉 trailing slash 和 query/hash
        links.add(resolved.origin + resolved.pathname.replace(/\/$/, ''));
      }
    } catch {
      // 跳过非法 URL
    }
  }
  return [...links];
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
