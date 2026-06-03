/**
 * Prism Collector — 主入口
 * 确定性采集，产 RawSiteData
 * 三阶段：采集 → (Analyzer) → (Scorer/Reporter)
 *
 * 错误策略（§10）：永不整体崩，局部失败标 error 继续
 */

import type { RawSiteData, RawPageData, CollectorError } from './types.ts';
import { fetchPage, fetchFile, FetchError } from './http.ts';
import { parseRobots, emptyRobots, isPrismAllowed } from './robots.ts';
import { parseSitemap, emptySitemap, estimateSiteScale } from './sitemap.ts';
import { extractPage } from './extractor.ts';
import { fetchCwv } from './cwv.ts';
import { selectSamplePages } from './sampler.ts';
import { getBotsForMarket } from './bots.ts';

export type { RawSiteData } from './types.ts';

export interface CollectOptions {
  market?: 'international' | 'china' | 'both';
  pageSpeedApiKey?: string;
  onProgress?(stage: string): void;
}

/**
 * 采集一个网站，返回 RawSiteData
 * 不抛异常：所有错误都记录到 errors 数组并尽力继续
 */
export async function collect(inputUrl: string, opts: CollectOptions = {}): Promise<RawSiteData> {
  const startMs = Date.now();
  const errors: CollectorError[] = [];
  const market = opts.market ?? 'international';
  const progress = opts.onProgress ?? (() => {});

  // ── 1. 规范化 URL & 基础信息 ──────────────────────────────────────────
  let normalizedUrl: string;
  let domain: string;
  try {
    normalizedUrl = normalizeUrl(inputUrl);
    domain = new URL(normalizedUrl).hostname;
  } catch {
    throw new FetchError('url_parse', `非法 URL: ${inputUrl}`);
  }

  progress('fetch:homepage');

  // ── 2. 抓首页 ────────────────────────────────────────────────────────
  let homepageResult: Awaited<ReturnType<typeof fetchPage>>;
  try {
    homepageResult = await fetchPage(normalizedUrl);
  } catch (err) {
    throw new FetchError(
      'http_fetch',
      `首页不可达: ${normalizedUrl}`,
      err,
    );
  }

  // 非 HTML 内容直接报错
  if (!isHtml(homepageResult.contentType) && !isHtml(homepageResult.body.slice(0, 100))) {
    throw new FetchError('non_html', `非 HTML 内容 (${homepageResult.contentType}): ${normalizedUrl}`);
  }

  const homepageData = extractPage(
    homepageResult.body,
    normalizedUrl,
    homepageResult.finalUrl,
    homepageResult.statusCode,
    homepageResult.contentType,
  );
  const homepage: RawPageData = {
    ...homepageData,
    isHttps: homepageResult.isHttps,
  };

  progress('fetch:robots');

  // ── 3. robots.txt ────────────────────────────────────────────────────
  const botsToCheck = getBotsForMarket(market).map(b => b.ua);
  const robotsUrl = `${new URL(homepageResult.finalUrl).origin}/robots.txt`;
  let robots = emptyRobots(botsToCheck);
  try {
    const robotsFile = await fetchFile(robotsUrl);
    if (robotsFile) robots = parseRobots(robotsFile.body, botsToCheck);
  } catch (err) {
    errors.push({ stage: 'robots', message: String(err) });
  }

  progress('fetch:sitemap');

  // ── 4. sitemap.xml ───────────────────────────────────────────────────
  const sitemapCandidates = [
    ...robots.sitemapUrls,
    `${new URL(homepageResult.finalUrl).origin}/sitemap.xml`,
    `${new URL(homepageResult.finalUrl).origin}/sitemap_index.xml`,
  ];
  let sitemap = emptySitemap();
  for (const sitemapUrl of sitemapCandidates) {
    try {
      const file = await fetchFile(sitemapUrl);
      if (file) {
        sitemap = parseSitemap(file.body);
        break;
      }
    } catch {
      // 继续尝试下一个候选
    }
  }

  progress('fetch:llmstxt');

  // ── 5. llms.txt ──────────────────────────────────────────────────────
  const llmsTxtUrl = `${new URL(homepageResult.finalUrl).origin}/llms.txt`;
  let llmsTxt: RawSiteData['llmsTxt'] = { exists: false };
  try {
    const file = await fetchFile(llmsTxtUrl);
    if (file) {
      llmsTxt = { exists: true, url: llmsTxtUrl, content: file.body };
    }
  } catch {
    // llms.txt 不存在不算错误
  }

  progress('sample:pages');

  // ── 6. 页面抽样（§5.4）———————————————————————————————
  const pages: RawPageData[] = [homepage];

  if (isPrismAllowed(robots)) {
    const sampleUrls = selectSamplePages(
      sitemap.urls,
      homepage.internalLinks,
      homepage.finalUrl,
    );

    for (const pageUrl of sampleUrls) {
      progress(`fetch:${pageUrl}`);
      try {
        const res = await fetchPage(pageUrl);
        if (!isHtml(res.contentType)) continue;
        const data = extractPage(res.body, pageUrl, res.finalUrl, res.statusCode, res.contentType);
        pages.push({ ...data, isHttps: res.isHttps });
      } catch (err) {
        errors.push({ stage: `page:${pageUrl}`, message: String(err) });
      }
    }
  } else {
    errors.push({
      stage: 'robots',
      message: 'robots.txt 不允许 PrismBot 爬取，跳过内容页采集（§10）',
    });
  }

  progress('fetch:cwv');

  // ── 7. Core Web Vitals ───────────────────────────────────────────────
  let cwv = await fetchCwv(homepage.finalUrl, opts.pageSpeedApiKey).catch(err => ({
    available: false as const,
    error: String(err),
    strategy: 'mobile' as const,
  }));

  // ── 8. 规模估算 ──────────────────────────────────────────────────────
  const siteScale = estimateSiteScale(sitemap.totalUrlCount, homepage.internalLinks.length);

  const isCSR = !homepage.hasContentInViewSource;

  return {
    url: normalizedUrl,
    domain,
    isHttps: homepageResult.isHttps,
    robots,
    sitemap,
    llmsTxt,
    pages,
    cwv,
    isCSR,
    siteScale,
    collectedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    errors,
  };
}

function normalizeUrl(input: string): string {
  const raw = input.trim();
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  // 去 tracking params
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function isHtml(s: string): boolean {
  return /text\/html|<!doctype\s+html|<html/i.test(s);
}
