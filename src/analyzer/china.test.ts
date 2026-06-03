import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './analyze.ts';
import { detectContentPlatforms, extractBlockedCnBotUAs, buildChinaChecksFromRaw } from './china.ts';
import { makeRaw, makePage } from './fixtures.ts';

test('detectContentPlatforms: 站点自身恒计入 official_site', () => {
  const plats = detectContentPlatforms(makeRaw());
  assert.ok(plats.includes('official_site'));
});

test('detectContentPlatforms: HTML 含小红书/抖音链接 → 命中平台', () => {
  const raw = makeRaw({
    pages: [makePage({
      html: '<a href="https://www.xiaohongshu.com/user/abc">小红书</a>'
        + '<a href="https://v.douyin.com/xyz">抖音</a>',
    })],
  });
  const plats = detectContentPlatforms(raw);
  assert.ok(plats.includes('xiaohongshu'));
  assert.ok(plats.includes('douyin'));
  assert.ok(!plats.includes('zhihu'), '未出现的平台不误报');
});

test('extractBlockedCnBotUAs: 取 disallow 的 UA', () => {
  const raw = makeRaw({
    robots: {
      exists: true, raw: '', sitemapUrls: [], prismBotAllowed: true,
      llmBotPolicies: { Baiduspider: 'disallow', Bytespider: 'allow', 'Sogou web spider': 'unspecified' },
    },
  });
  assert.deepEqual(extractBlockedCnBotUAs(raw), ['Baiduspider']);
});

test('buildChinaChecksFromRaw: international → 空', () => {
  assert.deepEqual(buildChinaChecksFromRaw(makeRaw(), 'international'), []);
});

test('analyze(market=china): D2 含可达性 check、D5 含 robots check', async () => {
  // 内容只在小红书 + 封 Baiduspider
  const raw = makeRaw({
    pages: [makePage({ html: '<a href="https://www.xiaohongshu.com/u/x">小红书主页</a>' })],
    robots: {
      exists: true, raw: '', sitemapUrls: [], prismBotAllowed: true,
      llmBotPolicies: { Baiduspider: 'disallow', Bytespider: 'allow' },
    },
  });
  const r = await analyze(raw, { market: 'china' });
  const d2 = r.dimensions.D2.checks.find((c) => c.id === 'china.platform_reachability');
  const d5 = r.dimensions.D5.checks.find((c) => c.id === 'china.robots_cn_bots');
  assert.ok(d2, 'D2 有 china 可达性 check');
  assert.ok(d5, 'D5 有 china robots check');
  // 盲区应被标注进 D2 issues
  assert.ok(r.dimensions.D2.issues.some((i) => i.startsWith('[china]')), 'D2 issues 含 china 盲区标注');
});

test('analyze(market=international): 不附加任何 china check', async () => {
  const raw = makeRaw({ pages: [makePage({ html: '<a href="https://www.xiaohongshu.com/u/x">x</a>' })] });
  const r = await analyze(raw, { market: 'international' });
  const allIds = Object.values(r.dimensions).flatMap((d) => d.checks.map((c) => c.id));
  assert.ok(!allIds.some((id) => id.startsWith('china.')), 'international 无 china check');
});

test('analyze(market=china): china check 不改变维度 rawScore（penalty=0 标注）', async () => {
  const clean = makeRaw();
  const intl = await analyze(clean, { market: 'international' });
  const cn = await analyze(clean, { market: 'china' });
  // 同一 raw，china 仅附加标注，D2/D5 rawScore 不变
  assert.equal(cn.dimensions.D2.rawScore, intl.dimensions.D2.rawScore);
  assert.equal(cn.dimensions.D5.rawScore, intl.dimensions.D5.rawScore);
});
