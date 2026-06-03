/** Collector 层数据类型 — 确定性采集产物 RawSiteData */

export type BotPolicy = 'allow' | 'disallow' | 'unspecified';
export type SiteScale = '<100' | '100-1000' | '>1000';

export interface RobotsParsed {
  exists: boolean;
  raw: string;
  /** bot UA → allow/disallow/unspecified */
  llmBotPolicies: Record<string, BotPolicy>;
  /** robots.txt 中声明的 Sitemap URL */
  sitemapUrls: string[];
  /** Prism 自身（PrismBot）是否被允许 */
  prismBotAllowed: boolean;
}

export interface SitemapParsed {
  exists: boolean;
  /** 提取到的内容页 URL（不含 sitemap index 自身） */
  urls: string[];
  /** sitemap 中 URL 总数（≠ urls.length，仅用于规模估算） */
  totalUrlCount: number;
  /** sitemap index 子 sitemap URL */
  subSitemapUrls: string[];
}

export interface RawPageData {
  url: string;
  finalUrl: string;      // 重定向后实际 URL
  statusCode: number;
  contentType: string;
  isHttps: boolean;
  html: string;          // view-source 原始 HTML
  textContent: string;   // 删 CSS 纯文本（strip all tags）
  title: string;
  lang: string;
  metaDescription: string;
  jsonLd: unknown[];     // 页面中所有 JSON-LD 块
  headings: Array<{ level: 1 | 2 | 3 | 4; text: string }>;
  internalLinks: string[];
  /** view-source 中是否有实质文本内容（false = CSR 空壳） */
  hasContentInViewSource: boolean;
}

export interface CwvData {
  available: boolean;
  error?: string;
  /** Largest Contentful Paint (ms) */
  lcp?: number;
  /** Cumulative Layout Shift (unitless) */
  cls?: number;
  /** First Contentful Paint (ms) */
  fcp?: number;
  /** Time to First Byte (ms) */
  ttfb?: number;
  /** PageSpeed 整体 performance score (0-100) */
  performanceScore?: number;
  strategy: 'mobile' | 'desktop';
}

export interface CollectorError {
  stage: string;
  message: string;
}

export interface RawSiteData {
  /** 输入 URL（规范化） */
  url: string;
  domain: string;
  isHttps: boolean;

  robots: RobotsParsed;
  sitemap: SitemapParsed;
  llmsTxt: {
    exists: boolean;
    url?: string;
    content?: string;
  };

  /** pages[0] = 首页，其余为抽样代表页，≤5 页 */
  pages: RawPageData[];

  cwv: CwvData;

  /** 首页是否为 CSR 空壳（view-source 无内容） */
  isCSR: boolean;
  siteScale: SiteScale;

  collectedAt: string;
  durationMs: number;
  errors: CollectorError[];
}
