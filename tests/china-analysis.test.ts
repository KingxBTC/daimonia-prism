import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReachability, chinaRemediationHints, selectChinaEngines,
  checkChinaRobots, buildPlatformCoverageCheck, buildChinaMarketChecks, reachabilityOf,
} from '../src/core/china/analysis.ts';
import { CHINA_ENGINES } from '../src/core/china/facts.ts';

test('reachabilityOf: 直接查表', () => {
  assert.equal(reachabilityOf('doubao', 'douyin'), 'direct');
  assert.equal(reachabilityOf('doubao', 'wechat_oa'), 'none');
});

test('analyzeReachability: 只有小红书 → DeepSeek/千问/文小言/豆包 都抓不到（§6.3 例）', () => {
  const targets = ['deepseek', 'tongyi_qwen', 'wenxin', 'doubao'] as const;
  const res = analyzeReachability(['xiaohongshu'], targets);
  const byEngine = Object.fromEntries(res.map((r) => [r.engine, r]));
  // 千问/文小言/豆包：小红书完全抓不到 → 盲区
  assert.equal(byEngine.tongyi_qwen.blindSpot, true);
  assert.equal(byEngine.wenxin.blindSpot, true);
  assert.equal(byEngine.doubao.blindSpot, true);
  // DeepSeek：小红书是 △ 间接可达 → 非盲区但仅 indirect
  assert.equal(byEngine.deepseek.blindSpot, false);
  assert.equal(byEngine.deepseek.best, 'indirect');
});

test('analyzeReachability: 官网覆盖 → 开放 web 4 家直通', () => {
  const res = analyzeReachability(['official_site'], ['deepseek', 'kimi', 'tongyi_qwen', 'zhipu']);
  for (const r of res) {
    assert.equal(r.best, 'direct', `${r.engine} 官网直通`);
    assert.equal(r.blindSpot, false);
    assert.deepEqual(r.viaPlatforms, ['official_site']);
  }
});

test('analyzeReachability: 取最佳可达性（公众号 √ 优于 官网 △ for 元宝）', () => {
  const [r] = analyzeReachability(['official_site', 'wechat_oa'], ['tencent_yuanbao']);
  assert.equal(r.best, 'direct');
  assert.deepEqual(r.viaPlatforms, ['wechat_oa']); // 只列贡献最佳的平台
});

test('analyzeReachability: 无内容平台 → 全盲区', () => {
  const res = analyzeReachability([], ['doubao', 'deepseek']);
  assert.ok(res.every((r) => r.blindSpot && r.best === 'none'));
});

test('chinaRemediationHints: 盲区引擎给出可直通平台', () => {
  // 目标豆包，但只覆盖官网（△）→ 建议投 抖音/头条号（direct）
  const hints = chinaRemediationHints(['official_site'], ['doubao']);
  const doubao = hints.find((h) => h.engine === 'doubao');
  assert.ok(doubao, '豆包有整改建议');
  const plats = doubao.recommendPlatforms.map((p) => p.platform);
  assert.ok(plats.includes('douyin') || plats.includes('toutiao'));
  assert.ok(doubao.recommendPlatforms.every((p) => p.level === 'direct'));
});

test('chinaRemediationHints: 已直通的引擎不再建议', () => {
  const hints = chinaRemediationHints(['douyin'], ['doubao']);
  assert.equal(hints.find((h) => h.engine === 'doubao'), undefined);
});

test('selectChinaEngines: market 路由', () => {
  assert.deepEqual(selectChinaEngines('international'), []);
  assert.equal(selectChinaEngines('china').length, CHINA_ENGINES.length);
  assert.equal(selectChinaEngines('both').length, CHINA_ENGINES.length);
});

test('checkChinaRobots: 封 Baiduspider 命中 P0 引擎 → fail', () => {
  const c = checkChinaRobots(['Baiduspider'], ['baidu_ai', 'doubao']);
  assert.equal(c.id, 'china.robots_cn_bots');
  assert.equal(c.status, 'fail');
  assert.ok(c.scoreImpact < 0);
  assert.ok(c.evidence.includes('Baiduspider'));
});

test('checkChinaRobots: 无封禁 → pass，scoreImpact 0', () => {
  const c = checkChinaRobots([], ['baidu_ai', 'doubao']);
  assert.equal(c.status, 'pass');
  assert.equal(c.scoreImpact, 0);
});

test('checkChinaRobots: 封的 bot 与目标引擎无关 → pass', () => {
  // 目标只有豆包；封 Baiduspider（百度系）与豆包无关
  const c = checkChinaRobots(['Baiduspider'], ['doubao']);
  assert.equal(c.status, 'pass');
});

test('buildPlatformCoverageCheck: P0 盲区 → fail', () => {
  // 只投小红书，目标含 P0 豆包/百度AI → 盲区
  const c = buildPlatformCoverageCheck(['xiaohongshu'], ['doubao', 'baidu_ai', 'deepseek']);
  assert.equal(c.id, 'china.platform_reachability');
  assert.equal(c.status, 'fail');
  assert.ok(c.evidence.includes('豆包') || c.evidence.includes('百度AI'));
});

test('buildPlatformCoverageCheck: 官网+公众号+抖音+百家 全覆盖 → pass', () => {
  const present = ['official_site', 'wechat_oa', 'douyin', 'baijiahao'] as const;
  const c = buildPlatformCoverageCheck(present, ['baidu_ai', 'doubao', 'tencent_yuanbao', 'deepseek']);
  assert.equal(c.status, 'pass');
});

test('buildChinaMarketChecks: international 市场 → 空', () => {
  const checks = buildChinaMarketChecks({ market: 'international', contentPlatforms: ['official_site'] });
  assert.deepEqual(checks, []);
});

test('buildChinaMarketChecks: china 市场 → 含覆盖 + robots 两项 check', () => {
  const checks = buildChinaMarketChecks({
    market: 'china',
    contentPlatforms: ['xiaohongshu'],
    blockedCnBotUAs: ['Baiduspider'],
  });
  const ids = checks.map((c) => c.id);
  assert.ok(ids.includes('china.platform_reachability'));
  assert.ok(ids.includes('china.robots_cn_bots'));
});
