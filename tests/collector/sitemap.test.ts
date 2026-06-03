import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseSitemap, estimateSiteScale } from '../../src/collector/sitemap.ts';

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
