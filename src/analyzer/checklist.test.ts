import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST, ALWAYS_PARTIAL_DIMENSIONS } from './checklist.ts';
import { makeRaw, makePage } from './fixtures.ts';
import type { DimensionId, RawSiteData, SiteProfile } from './imports.ts';
import type { CheckContext } from './types.ts';

const DIMS: DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

/** 按 id 取检查项（测试断言用，缺失即测试失败）。 */
const byId = (id: string) => {
  const c = CHECKLIST.find(x => x.id === id);
  assert.ok(c, `未找到检查项 ${id}`);
  return c!;
};

/** 构造 CheckContext（I3 兜底启发式单测用）。 */
function makeCtx(over: Partial<RawSiteData> = {}): CheckContext {
  const raw = makeRaw(over);
  const profile: SiteProfile = {
    domain: raw.domain,
    businessType: 'tech',
    isYMYL: false,
    nicheTier: 'mid',
    siteScale: raw.siteScale,
    primaryLanguage: 'zh',
    geoMarket: 'international',
    targetEngines: [],
  };
  return { raw, profile, homepage: raw.pages[0] };
}

describe('CHECKLIST 结构不变量', () => {
  test('检查项 id 全局唯一', () => {
    const ids = CHECKLIST.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, '存在重复 id');
  });

  test('5 个维度都至少有一个 Light 计分检查项', () => {
    for (const d of DIMS) {
      const scored = CHECKLIST.filter(c => c.dimension === d && c.kind !== 'deep');
      assert.ok(scored.length >= 1, `${d} 无 Light 计分检查项`);
    }
  });

  test('每维度 Light 计分检查项 penalty 之和 = 100（penalty 模型基线）', () => {
    for (const d of DIMS) {
      const sum = CHECKLIST
        .filter(c => c.dimension === d && c.kind !== 'deep')
        .reduce((s, c) => s + c.penalty, 0);
      assert.equal(sum, 100, `${d} penalty 合计=${sum}，应为 100`);
    }
  });

  test('deep 检查项 penalty=0 且不参与 Light 计分', () => {
    const deep = CHECKLIST.filter(c => c.kind === 'deep');
    assert.ok(deep.length >= 2, '应至少有 D3.earned + D4.cross_query 两个 deep 项');
    for (const c of deep) assert.equal(c.penalty, 0, `${c.id} deep 项 penalty 应为 0`);
  });

  test('rule 检查项有 rule，llm 检查项有 prompt+fallback', () => {
    for (const c of CHECKLIST) {
      if (c.kind === 'rule') assert.ok(c.rule, `${c.id} 缺 rule`);
      if (c.kind === 'llm') {
        assert.ok(c.prompt, `${c.id} 缺 prompt`);
        assert.ok(c.fallback, `${c.id} 缺 fallback（PRD §10 降级要求）`);
      }
    }
  });

  test('llms.txt 检查项 penalty=10（对齐 PRD §7.1 -10 示例）', () => {
    const llms = CHECKLIST.find(c => c.id === 'D2.llms_txt');
    assert.ok(llms);
    assert.equal(llms!.penalty, 10);
  });

  test('D3/D4 标记为恒 partial', () => {
    assert.ok(ALWAYS_PARTIAL_DIMENSIONS.has('D3'));
    assert.ok(ALWAYS_PARTIAL_DIMENSIONS.has('D4'));
    assert.ok(!ALWAYS_PARTIAL_DIMENSIONS.has('D1'));
  });
});

// ── I3（DAI-1330）heuristic 兜底地板：读内容启发式的区分力 ──
describe('I3 兜底启发式区分力（DAI-1330）', () => {
  describe('D3.freshness 自然语言日期（修 anthropic 误判）', () => {
    test('英文自然语言日期 "January 30, 2025" → partial（旧版误判 poor）', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [], textContent: 'Published January 30, 2025 by the team.' })] });
      assert.equal(byId('D3.freshness').rule!(ctx).rating, 'partial');
    });
    test('"30 Jan 2025" 反序也命中 → partial', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [], textContent: 'Updated 30 Jan 2025 in the changelog.' })] });
      assert.equal(byId('D3.freshness').rule!(ctx).rating, 'partial');
    });
    test('结构化 datePublished → good', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [{ datePublished: '2025-01-30' }] })] });
      assert.equal(byId('D3.freshness').rule!(ctx).rating, 'good');
    });
    test('无任何日期 → poor', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [], textContent: '一段没有任何时间信息的纯文本内容。' })] });
      assert.equal(byId('D3.freshness').rule!(ctx).rating, 'poor');
    });
  });

  describe('D3.author_credentials fallback（不再一律 poor）', () => {
    test('schema Person + 资质词 → good', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [{ '@type': 'Person', name: 'Dr. Wang' }], textContent: '本文由王教授撰写。' })] });
      assert.equal(byId('D3.author_credentials').fallback!(ctx).rating, 'good');
    });
    test('仅中文署名 → partial', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [], textContent: '作者：张三。这是一段普通正文内容。' })] });
      assert.equal(byId('D3.author_credentials').fallback!(ctx).rating, 'partial');
    });
    test('无署名 → poor（地板保留）', () => {
      const ctx = makeCtx({ pages: [makePage({ jsonLd: [], textContent: '没有任何作者署名的描述性内容。' })] });
      assert.equal(byId('D3.author_credentials').fallback!(ctx).rating, 'poor');
    });
  });

  describe('D3.transparency fallback（检测隐私/条款/披露）', () => {
    test('privacy + terms 链接 → good', () => {
      const ctx = makeCtx({ pages: [makePage({ internalLinks: ['https://x.com/privacy-policy', 'https://x.com/terms-of-service'] })] });
      assert.equal(byId('D3.transparency').fallback!(ctx).rating, 'good');
    });
    test('仅 privacy → partial', () => {
      const ctx = makeCtx({ pages: [makePage({ internalLinks: ['https://x.com/privacy'], textContent: '正文无其它政策信号。' })] });
      assert.equal(byId('D3.transparency').fallback!(ctx).rating, 'partial');
    });
    test('无政策信号 → poor', () => {
      const ctx = makeCtx({ pages: [makePage({ internalLinks: ['https://x.com/products'], textContent: '只有产品介绍。' })] });
      assert.equal(byId('D3.transparency').fallback!(ctx).rating, 'poor');
    });
  });

  describe('D2.self_contained fallback（指代密度启发式）', () => {
    test('多标题分块 + 低指代密度 → good', () => {
      const ctx = makeCtx({ pages: [makePage({
        textContent: '我们提供企业级数据分析平台。平台支持实时仪表盘配置。客户可自助生成报表。团队由资深工程师组成。',
        headings: [{ level: 1, text: 'A' }, { level: 2, text: 'B' }, { level: 2, text: 'C' }, { level: 2, text: 'D' }],
      })] });
      assert.equal(byId('D2.self_contained').fallback!(ctx).rating, 'good');
    });
    test('高指代密度（每句裸代词起手）→ poor', () => {
      const ctx = makeCtx({ pages: [makePage({
        textContent: '它依赖前文才能理解。这一点非常重要。它还需要额外配置。这也是关键所在。它最后才总结。',
        headings: [],
      })] });
      assert.equal(byId('D2.self_contained').fallback!(ctx).rating, 'poor');
    });
  });

  describe('D4.conclusion_clarity fallback（摘要/结论先行）', () => {
    test('TL;DR 摘要块 → good', () => {
      const ctx = makeCtx({ pages: [makePage({ textContent: ('TL;DR：本产品显著提升转化率。' + '后续详细展开论述。'.padEnd(120, '容')) })] });
      assert.equal(byId('D4.conclusion_clarity').fallback!(ctx).rating, 'good');
    });
    test('仅结论性连接词、未先行 → partial', () => {
      const ctx = makeCtx({ pages: [makePage({ textContent: ('我们做了大量测试与分析工作。'.padEnd(200, '容') + '因此我们认为该方案可行。') })] });
      assert.equal(byId('D4.conclusion_clarity').fallback!(ctx).rating, 'partial');
    });
    test('无结论标志 → poor', () => {
      const ctx = makeCtx({ pages: [makePage({ textContent: '一段平铺直叙的描述性文字，没有明显的收尾标志。'.padEnd(200, '容') })] });
      assert.equal(byId('D4.conclusion_clarity').fallback!(ctx).rating, 'poor');
    });
  });

  describe('D4.justification fallback（论证连接词 + 数据支撑）', () => {
    test('多论证连接词 + 数据 + 外链 → good', () => {
      const ctx = makeCtx({ pages: [makePage({
        textContent: '因为用户增长达到 120%，根据 2025 年调研数据，因此我们扩大投入。研究表明留存提升 30%。',
        html: '<a href="https://r1.com">1</a><a href="https://r2.com">2</a><a href="https://r3.com">3</a>',
      })] });
      assert.equal(byId('D4.justification').fallback!(ctx).rating, 'good');
    });
    test('空洞断言无依据 → poor', () => {
      const ctx = makeCtx({ pages: [makePage({ textContent: '我们是最好的平台没有之一。', html: '<p>无任何外链</p>' })] });
      assert.equal(byId('D4.justification').fallback!(ctx).rating, 'poor');
    });
  });

  test('综合区分力：富内容站 good 数远高于空壳站（验收）', () => {
    const fbIds = ['D3.author_credentials', 'D3.transparency', 'D2.self_contained', 'D4.conclusion_clarity', 'D4.justification'];
    const countGood = (page: ReturnType<typeof makePage>) =>
      fbIds.filter(id => byId(id).fallback!(makeCtx({ pages: [page] })).rating === 'good').length;

    const richPage = makePage({
      jsonLd: [{ '@type': 'Person', name: 'Dr. Wang' }, { '@type': 'Organization' }],
      textContent: 'TL;DR：平台显著提升转化。本文作者：王教授。因为数据显示增长 120%，根据 2025 年调研，因此结论明确。',
      headings: [{ level: 1, text: 'A' }, { level: 2, text: 'B' }, { level: 2, text: 'C' }, { level: 2, text: 'D' }],
      internalLinks: ['https://x.com/privacy', 'https://x.com/terms'],
      html: '<a href="https://r1.com">1</a><a href="https://r2.com">2</a><a href="https://r3.com">3</a>',
    });
    const barePage = makePage({
      jsonLd: [], textContent: '它就是好。这很重要。它最棒。', headings: [], internalLinks: [], html: '<p>x</p>',
    });

    const rich = countGood(richPage);
    const bare = countGood(barePage);
    assert.ok(rich >= 4, `富站 good 数=${rich}，应≥4`);
    assert.equal(bare, 0, `空壳站 good 数=${bare}，应=0`);
    assert.ok(rich > bare, `区分力未拉开：rich=${rich} bare=${bare}`);
  });
});
