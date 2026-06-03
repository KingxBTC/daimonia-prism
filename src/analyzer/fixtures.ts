/** 测试用 RawSiteData 工厂（非 .test.ts，不被 test runner 收集）。 */
import type { RawSiteData, RawPageData } from './imports.ts';

export function makePage(over: Partial<RawPageData> = {}): RawPageData {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    contentType: 'text/html',
    isHttps: true,
    html: '<html><body><h1>Example</h1><p>正文内容，足够长以通过删 CSS 可读性检查。'.padEnd(400, '内容') + '</p></body></html>',
    textContent: '正文内容，足够长以通过删 CSS 可读性检查。'.padEnd(400, '内容'),
    title: 'Example Co | 首页',
    lang: 'zh-CN',
    metaDescription: 'Example 公司官网',
    jsonLd: [{ '@type': 'Organization', name: 'Example Co', datePublished: '2026-01-01' }],
    headings: [{ level: 1, text: 'Example' }, { level: 2, text: '服务' }, { level: 2, text: '关于' }],
    internalLinks: ['https://example.com/about', 'https://example.com/services'],
    hasContentInViewSource: true,
    ...over,
  };
}

export function makeRaw(over: Partial<RawSiteData> = {}): RawSiteData {
  return {
    url: 'https://example.com/',
    domain: 'example.com',
    isHttps: true,
    robots: { exists: true, raw: '', llmBotPolicies: { GPTBot: 'allow', ClaudeBot: 'allow' }, sitemapUrls: [], prismBotAllowed: true },
    sitemap: { exists: true, urls: ['https://example.com/about'], totalUrlCount: 12, subSitemapUrls: [] },
    llmsTxt: { exists: false },
    pages: [makePage()],
    cwv: { available: true, performanceScore: 85, strategy: 'mobile' },
    isCSR: false,
    siteScale: '100-1000',
    collectedAt: '2026-06-03T10:00:00Z',
    durationMs: 5000,
    errors: [],
    ...over,
  };
}
