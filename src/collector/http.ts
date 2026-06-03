/**
 * HTTP fetch 工具 — 带超时、https→http 重试、User-Agent
 * 不实现 robots.txt 遵守（调用方负责在 fetch 内容页前先检查 robots）
 */

const PRISM_UA = 'PrismBot/1.0 (GEO audit; contact@daimonia.ai)';
const TIMEOUT_MS = 15_000;

export interface FetchResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  body: string;
  isHttps: boolean;
}

export class FetchError extends Error {
  readonly stage: string;
  readonly cause?: unknown;

  constructor(stage: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'FetchError';
    this.stage = stage;
    this.cause = cause;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': PRISM_UA },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按 §10 协议：先试 https，失败再试 http（仅针对输入 URL 本身）
 */
export async function fetchPage(inputUrl: string): Promise<FetchResult> {
  const candidates = buildCandidateUrls(inputUrl);
  let lastError: unknown;

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url);
      const contentType = res.headers.get('content-type') ?? '';
      const body = await res.text();
      return {
        url,
        finalUrl: res.url,
        statusCode: res.status,
        contentType,
        body,
        isHttps: new URL(res.url).protocol === 'https:',
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new FetchError('http_fetch', `无法访问 ${inputUrl}`, lastError);
}

/**
 * 轻量 fetch，不做 https→http 重试（用于站级文件 robots/sitemap/llms.txt）
 * 404 → 返回 null；其他错误抛出
 */
export async function fetchFile(url: string): Promise<FetchResult | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (res.status === 404) return null;
    const body = await res.text();
    return {
      url,
      finalUrl: res.url,
      statusCode: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body,
      isHttps: new URL(res.url).protocol === 'https:',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchError('http_timeout', `请求超时: ${url}`, err);
    }
    return null;
  }
}

function buildCandidateUrls(input: string): string[] {
  let url: URL;
  try {
    // 补全 scheme
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new FetchError('url_parse', `非法 URL: ${input}`);
  }

  // 非 HTML 内容（API / .json 等）不重试
  const https = new URL(url.toString());
  https.protocol = 'https:';

  const http = new URL(url.toString());
  http.protocol = 'http:';

  if (url.protocol === 'https:') return [https.toString(), http.toString()];
  return [http.toString(), https.toString()];
}

export { PRISM_UA };
