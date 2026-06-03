import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferProfile, heuristicClassification, heuristicYmyl, heuristicNicheTier, inferLanguage,
} from './profile.ts';
import { makeRaw, makePage } from './fixtures.ts';

describe('heuristicYmyl', () => {
  test('情感婚姻心理命中 YMYL', () => {
    const raw = makeRaw({ pages: [makePage({ title: '婚姻咨询服务', textContent: '专业婚姻情感心理咨询' })] });
    const r = heuristicYmyl(raw);
    assert.equal(r.isYMYL, true);
    assert.equal(r.ymylCategory, '情感婚姻心理');
  });
  test('金融命中 YMYL', () => {
    const raw = makeRaw({ pages: [makePage({ title: '投资理财', textContent: '股票基金投资' })] });
    assert.equal(heuristicYmyl(raw).isYMYL, true);
  });
  test('普通电商不命中', () => {
    const raw = makeRaw({ pages: [makePage({ title: '潮流服饰', textContent: '时尚女装男装' })] });
    assert.equal(heuristicYmyl(raw).isYMYL, false);
  });
});

describe('heuristicNicheTier', () => {
  test('>1000→head, <100→niche, 中间→mid', () => {
    assert.equal(heuristicNicheTier(makeRaw({ siteScale: '>1000' })), 'head');
    assert.equal(heuristicNicheTier(makeRaw({ siteScale: '<100' })), 'niche');
    assert.equal(heuristicNicheTier(makeRaw({ siteScale: '100-1000' })), 'mid');
  });
});

describe('inferLanguage', () => {
  test('优先用 page.lang', () => {
    assert.equal(inferLanguage(makeRaw({ pages: [makePage({ lang: 'en' })] })), 'en');
  });
  test('lang 缺失时按 CJK 占比判中文', () => {
    const raw = makeRaw({ pages: [makePage({ lang: '', textContent: '这是一段中文内容用于语言推断' })] });
    assert.equal(inferLanguage(raw), 'zh-CN');
  });
});

describe('heuristicClassification', () => {
  test('businessType 取 title 第一段', () => {
    const c = heuristicClassification(makeRaw({ pages: [makePage({ title: '智测科技 | 关于我们' })] }));
    assert.equal(c.businessType, '智测科技');
  });
});

describe('inferProfile', () => {
  test('组装完整 SiteProfile（确定性字段 + 分类）', () => {
    const raw = makeRaw();
    const p = inferProfile(raw, 'international', {
      businessType: '咨询', isYMYL: true, ymylCategory: '情感婚姻心理', nicheTier: 'niche',
    });
    assert.equal(p.domain, 'example.com');
    assert.equal(p.businessType, '咨询');
    assert.equal(p.isYMYL, true);
    assert.equal(p.nicheTier, 'niche');
    assert.equal(p.siteScale, '100-1000');
    assert.equal(p.primaryLanguage, 'zh-CN');
    assert.deepEqual(p.targetEngines, ['claude', 'chatgpt', 'gemini', 'perplexity', 'google_aio']);
  });
  test('market=china → 国内引擎 + 中国大陆市场', () => {
    const p = inferProfile(makeRaw(), 'china', heuristicClassification(makeRaw()));
    assert.equal(p.geoMarket, '中国大陆');
    assert.ok(p.targetEngines.includes('baidu'));
  });
});
