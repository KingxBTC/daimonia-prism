import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseSitemap, resolveSitemap, estimateSiteScale } from '../../src/collector/sitemap.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dir, 'fixtures', name), 'utf8');

describe('parseSitemap', () => {
  test('解析 urlset sitemap', () => {
    const xml = fix('sitemap.xml');
    const result = parseSitemap(xml);

    assert.equal(result.exists, true);
    assert.equal(result.urls.length, 5);
    assert.ok(result.urls.includes('https://acme-example.com/about'));
    assert.ok(result.urls.includes('https://acme-example.com/services'));
  });

  test('解析 sitemap index', () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/sitemap1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap2.xml</loc></sitemap>
</sitemapindex>`;
    const result = parseSitemap(xml);
    assert.equal(result.subSitemapUrls.length, 2);
    assert.ok(result.subSitemapUrls.includes('https://example.com/sitemap1.xml'));
  });

  test('XML 实体解码', () => {
    const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/path?a=1&amp;b=2</loc></url>
</urlset>`;
    const result = parseSitemap(xml);
    assert.ok(result.urls[0].includes('a=1&b=2'));
  });
});

describe('resolveSitemap (递归展开 sitemap index)', () => {
  const INDEX = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/sitemap1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap2.xml</loc></sitemap>
</sitemapindex>`;

  const SUB1 = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;

  const SUB2 = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/c</loc></url>
</urlset>`;

  test('sitemap index 递归抓取子 sitemap 并聚合 URL（DAI-1323 回归）', async () => {
    const map: Record<string, string> = {
      'https://example.com/sitemap1.xml': SUB1,
      'https://example.com/sitemap2.xml': SUB2,
    };
    const result = await resolveSitemap(INDEX, async (url) => map[url] ?? null);

    assert.equal(result.urls.length, 3);
    assert.ok(result.urls.includes('https://example.com/a'));
    assert.ok(result.urls.includes('https://example.com/c'));
    assert.equal(result.totalUrlCount, 3);
    assert.equal(result.subSitemapUrls.length, 2);
  });

  test('普通 urlset 不调用 fetcher', async () => {
    const xml = fix('sitemap.xml');
    let calls = 0;
    const result = await resolveSitemap(xml, async () => { calls++; return null; });

    assert.equal(calls, 0);
    assert.equal(result.urls.length, 5);
  });

  test('嵌套 sitemap index（多层）也能展开', async () => {
    const nestedIndex = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/inner-index.xml</loc></sitemap>
</sitemapindex>`;
    const innerIndex = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/leaf.xml</loc></sitemap>
</sitemapindex>`;
    const map: Record<string, string> = {
      'https://example.com/inner-index.xml': innerIndex,
      'https://example.com/leaf.xml': SUB1,
    };
    const result = await resolveSitemap(nestedIndex, async (url) => map[url] ?? null);

    assert.equal(result.urls.length, 2);
    assert.ok(result.urls.includes('https://example.com/a'));
  });

  test('子 sitemap 抓取失败（返回 null）时跳过不崩', async () => {
    const map: Record<string, string> = {
      'https://example.com/sitemap2.xml': SUB2,
    };
    const result = await resolveSitemap(INDEX, async (url) => map[url] ?? null);

    assert.equal(result.urls.length, 1);
    assert.ok(result.urls.includes('https://example.com/c'));
  });

  test('自引用 / 循环不会无限递归', async () => {
    const selfRef = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/self.xml</loc></sitemap>
</sitemapindex>`;
    const map: Record<string, string> = {
      'https://example.com/self.xml': selfRef,
    };
    const result = await resolveSitemap(selfRef, async (url) => map[url] ?? null);

    assert.equal(result.urls.length, 0);
  });
});

describe('estimateSiteScale', () => {
  test('< 100 URLs', () => {
    assert.equal(estimateSiteScale(5, 20), '<100');
  });

  test('100-1000 URLs', () => {
    assert.equal(estimateSiteScale(200, 50), '100-1000');
  });

  test('> 1000 URLs', () => {
    assert.equal(estimateSiteScale(5000, 100), '>1000');
  });

  test('取 sitemap 和内链的最大值', () => {
    assert.equal(estimateSiteScale(50, 150), '100-1000');
  });
});
