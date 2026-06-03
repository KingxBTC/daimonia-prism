import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { selectSamplePages } from '../../src/collector/sampler.ts';

const HOMEPAGE = 'https://example.com/';

describe('selectSamplePages', () => {
  test('优先选 About 页', () => {
    const urls = [
      'https://example.com/about',
      'https://example.com/random-page',
      'https://example.com/services',
    ];
    const result = selectSamplePages(urls, [], HOMEPAGE);
    assert.ok(result.includes('https://example.com/about'));
  });

  test('排除首页自身', () => {
    const urls = [
      'https://example.com/',
      'https://example.com/about',
    ];
    const result = selectSamplePages(urls, [], HOMEPAGE);
    assert.ok(!result.includes('https://example.com/'));
  });

  test('排除外链', () => {
    const urls = [
      'https://other.com/page',
      'https://example.com/about',
    ];
    const result = selectSamplePages(urls, [], HOMEPAGE);
    assert.ok(!result.includes('https://other.com/page'));
  });

  test('返回不超过 3 页（不含首页）', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/page-${i}`);
    const result = selectSamplePages(urls, [], HOMEPAGE);
    assert.ok(result.length <= 3);
  });

  test('sitemap + 内链合并去重', () => {
    const sitemapUrls = ['https://example.com/about'];
    const internalLinks = ['https://example.com/about', 'https://example.com/services'];
    const result = selectSamplePages(sitemapUrls, internalLinks, HOMEPAGE);
    const aboutCount = result.filter(u => u.includes('/about')).length;
    assert.equal(aboutCount, 1, '去重后 /about 只出现一次');
  });

  test('空输入返回空数组', () => {
    const result = selectSamplePages([], [], HOMEPAGE);
    assert.deepEqual(result, []);
  });
});
