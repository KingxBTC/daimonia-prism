/**
 * bonus-signals.test.ts — 加分信号检测单测（DAI-1329 / I2）
 *
 * 覆盖 src/analyzer/bonus.ts：
 *  - rich_schema / semantic_html / ssr_rich_content 三档检测
 *  - @type 数组 / @graph 嵌套递归
 *  - 不与基础 check 双重计分（无 llms.txt bonus）
 *  - 含信号站 vs 无信号同结构站：检测出更多加分
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBonusSignals,
  distinctSchemaTypes,
  semanticTagsUsed,
  SSR_RICH_CONTENT_MIN_CHARS,
} from '../src/analyzer/bonus.ts';
import { makeRaw, makePage } from '../src/analyzer/fixtures.ts';

const SEMANTIC_HTML =
  '<html><body><header>h</header><nav>n</nav><main><article><section>s</section></article></main><footer>f</footer></body></html>';

function bySignal(raw: ReturnType<typeof makeRaw>) {
  return new Map(detectBonusSignals(raw).map(s => [s.id, s]));
}

describe('distinctSchemaTypes — @type 递归（string / array / @graph）', () => {
  test('多块各一类型 → 去重计数', () => {
    const raw = makeRaw({
      pages: [makePage({ jsonLd: [{ '@type': 'Organization' }, { '@type': 'WebSite' }] })],
    });
    assert.deepStrictEqual(distinctSchemaTypes(raw).sort(), ['Organization', 'WebSite']);
  });

  test('@type 数组 + @graph 嵌套均被展开', () => {
    const raw = makeRaw({
      pages: [makePage({
        jsonLd: [{
          '@graph': [
            { '@type': ['Article', 'NewsArticle'] },
            { '@type': 'BreadcrumbList' },
          ],
        }],
      })],
    });
    assert.deepStrictEqual(
      distinctSchemaTypes(raw).sort(),
      ['Article', 'BreadcrumbList', 'NewsArticle'],
    );
  });
});

describe('semanticTagsUsed — HTML5 语义化 landmark', () => {
  test('识别 header/nav/main/article/section/footer', () => {
    const tags = semanticTagsUsed(makePage({ html: SEMANTIC_HTML }));
    assert.ok(tags.length >= 5, `应识别 ≥5 种语义标签，实得 ${tags.length}`);
    assert.ok(tags.includes('main') && tags.includes('article'));
  });

  test('无语义标签的裸 HTML → 空', () => {
    const tags = semanticTagsUsed(makePage({ html: '<html><body><div><h1>x</h1></div></body></html>' }));
    assert.deepStrictEqual(tags, []);
  });
});

describe('detectBonusSignals — 分档给分', () => {
  test('无信号站（默认 fixture）→ 0 信号', () => {
    // 默认 makePage：1 种 schema、无语义标签、textContent 400<800 → 全不触发
    assert.deepStrictEqual(detectBonusSignals(makeRaw()), []);
  });

  test('rich_schema：≥4 类型 → +4；2-3 类型 → +2', () => {
    const four = bySignal(makeRaw({
      pages: [makePage({
        jsonLd: [
          { '@type': 'Organization' }, { '@type': 'WebSite' },
          { '@type': 'Article' }, { '@type': 'BreadcrumbList' },
        ],
      })],
    }));
    assert.strictEqual(four.get('B.rich_schema')?.points, 4);

    const two = bySignal(makeRaw({
      pages: [makePage({ jsonLd: [{ '@type': 'Organization' }, { '@type': 'WebSite' }] })],
    }));
    assert.strictEqual(two.get('B.rich_schema')?.points, 2);
  });

  test('rich_schema：单一类型 → 无信号（基础 check 已计「有无」）', () => {
    const one = bySignal(makeRaw({ pages: [makePage({ jsonLd: [{ '@type': 'Organization' }] })] }));
    assert.strictEqual(one.has('B.rich_schema'), false);
  });

  test('semantic_html：≥5 种 → +2；3-4 种 → +1', () => {
    const rich = bySignal(makeRaw({ pages: [makePage({ html: SEMANTIC_HTML })] }));
    assert.strictEqual(rich.get('B.semantic_html')?.points, 2);

    const mid = bySignal(makeRaw({
      pages: [makePage({ html: '<html><body><main><article><section>x</section></article></main></body></html>' })],
    }));
    assert.strictEqual(mid.get('B.semantic_html')?.points, 1);
  });

  test('ssr_rich_content：SSR + 长正文 → +2；CSR / 短正文 → 无', () => {
    const longText = 'a'.repeat(SSR_RICH_CONTENT_MIN_CHARS);
    const ssr = bySignal(makeRaw({
      isCSR: false,
      pages: [makePage({ textContent: longText, hasContentInViewSource: true })],
    }));
    assert.strictEqual(ssr.get('B.ssr_rich_content')?.points, 2);

    // CSR 空壳：即便文本长度够也不奖励
    const csr = bySignal(makeRaw({
      isCSR: true,
      pages: [makePage({ textContent: longText, hasContentInViewSource: false })],
    }));
    assert.strictEqual(csr.has('B.ssr_rich_content'), false);

    // 短正文不达阈值
    const short = bySignal(makeRaw({ pages: [makePage({ textContent: 'a'.repeat(100) })] }));
    assert.strictEqual(short.has('B.ssr_rich_content'), false);
  });
});

describe('detectBonusSignals — 不与基础 check 双重计分', () => {
  test('有 llms.txt 也不产出 llms bonus（D2.llms_txt 已计入）', () => {
    const raw = makeRaw({ llmsTxt: { exists: true, content: '# Site\n- [home](/)' } });
    const ids = detectBonusSignals(raw).map(s => s.id);
    assert.ok(!ids.some(id => /llms/i.test(id)), `不应有 llms 加分信号：${ids}`);
  });
});

describe('detectBonusSignals — 区分力（验收）', () => {
  test('精心站（rich schema + 语义化 + 深 SSR）总加分 > 朴素同结构站', () => {
    const fancy = makeRaw({
      pages: [makePage({
        html: SEMANTIC_HTML,
        textContent: 'a'.repeat(1200),
        jsonLd: [
          { '@type': 'Organization' }, { '@type': 'WebSite' },
          { '@type': 'Article' }, { '@type': 'FAQPage' },
        ],
      })],
    });
    const plain = makeRaw(); // 1 类型、无语义标签、短正文

    const sum = (r: ReturnType<typeof makeRaw>) =>
      detectBonusSignals(r).reduce((s, x) => s + x.points, 0);

    assert.ok(sum(fancy) > sum(plain), `精心站加分应更高：${sum(fancy)} vs ${sum(plain)}`);
    assert.strictEqual(sum(plain), 0);
    assert.strictEqual(sum(fancy), 8); // 4 + 2 + 2
  });
});
