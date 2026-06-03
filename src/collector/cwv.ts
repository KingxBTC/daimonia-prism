/**
 * Core Web Vitals 采集 — Google PageSpeed Insights API
 * 无 API key 走 keyless（低配额）；失败降级（§10 协议）
 */

import type { CwvData } from './types.ts';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TIMEOUT_MS = 30_000;

export async function fetchCwv(
  url: string,
  apiKey?: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<CwvData> {
  const params = new URLSearchParams({ url, strategy });
  if (apiKey) params.set('key', apiKey);

  const endpoint = `${PSI_ENDPOINT}?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        available: false,
        error: `PSI API ${res.status}: ${body.slice(0, 200)}`,
        strategy,
      };
    }

    const data = await res.json() as PsiResponse;
    return parsePsiResponse(data, strategy);
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `PSI fetch 失败: ${msg}`, strategy };
  }
}

function parsePsiResponse(data: PsiResponse, strategy: 'mobile' | 'desktop'): CwvData {
  const audits = data.lighthouseResult?.audits;
  const categories = data.lighthouseResult?.categories;

  if (!audits) {
    return { available: false, error: 'PSI 响应缺少 audits 字段', strategy };
  }

  const lcp = msFromNumeric(audits['largest-contentful-paint']?.numericValue);
  const cls = audits['cumulative-layout-shift']?.numericValue;
  const fcp = msFromNumeric(audits['first-contentful-paint']?.numericValue);
  const ttfb = msFromNumeric(audits['server-response-time']?.numericValue);
  const performanceScore = categories?.performance?.score != null
    ? Math.round(categories.performance.score * 100)
    : undefined;

  return { available: true, lcp, cls, fcp, ttfb, performanceScore, strategy };
}

function msFromNumeric(v: number | undefined): number | undefined {
  if (v == null) return undefined;
  return Math.round(v);
}

// PSI API 响应的最小类型
interface PsiResponse {
  lighthouseResult?: {
    audits?: Record<string, { numericValue?: number; displayValue?: string }>;
    categories?: {
      performance?: { score?: number };
    };
  };
}
