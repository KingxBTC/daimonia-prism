import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { extractPage, stripTags } from '../../src/collector/extractor.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dir, 'fixtures', name), 'utf8');

describe('extractPage', () => {
  const html = fix('homepage.html');
  const page = extractPage(
    html,
    'https://acme-example.com/',
    'https://acme-example.com/',
    200,
    'text/html; charset=utf-8',
  );

  test('提取 title', () => {
    assert.ok(page.title.includes('Acme 咨询'));
  });

  test('提取 lang', () => {
    assert.equal(page.lang, 'zh-CN');
  });

  test('提取 meta description', () => {
    assert.ok(page.metaDescription.includes('数字化转型'));
  });

  test('提取 JSON-LD', () => {
    assert.equal(page.jsonLd.length, 1);
    const ld = page.jsonLd[0] as Record<string, unknown>;
    assert.equal(ld['@type'], 'Organization');
    assert.equal(ld['name'], 'Acme 咨询');
  });

  test('提取 headings 结构', () => {
    assert.ok(page.headings.length >= 3);
    const h1 = page.headings.find(h => h.level === 1);
    assert.ok(h1?.text.includes('数字化'));
  });

  test('提取内链', () => {
    assert.ok(page.internalLinks.some(l => l.includes('/about')));
    assert.ok(page.internalLinks.some(l => l.includes('/services')));
    // 首页自身不应在内链里
    assert.ok(!page.internalLinks.includes('https://acme-example.com/'));
  });

  test('有内容 → hasContentInViewSource = true', () => {
    assert.equal(page.hasContentInViewSource, true);
  });

  test('textContent 包含主要文本', () => {
    assert.ok(page.textContent.includes('数字化转型'));
    assert.ok(page.textContent.includes('500 家企业'));
    // style/script 内容应被剥除
    assert.ok(!page.textContent.includes('font-family'));
  });
});

describe('CSR 空壳检测', () => {
  test('CSR 页面 → hasContentInViewSource = false', () => {
    const html = fix('csr_homepage.html');
    const page = extractPage(html, 'https://app.example.com/', 'https://app.example.com/', 200, 'text/html');
    assert.equal(page.hasContentInViewSource, false);
  });
});

describe('stripTags', () => {
  test('去除 HTML 标签', () => {
    const text = stripTags('<p>Hello <b>world</b></p>');
    assert.equal(text, 'Hello world');
  });

  test('去除 style 块', () => {
    const text = stripTags('<style>body { color: red; }</style><p>content</p>');
    assert.ok(!text.includes('color'));
    assert.ok(text.includes('content'));
  });

  test('去除 script 块', () => {
    const text = stripTags('<script>console.log("x")</script><p>text</p>');
    assert.ok(!text.includes('console'));
    assert.ok(text.includes('text'));
  });
});
