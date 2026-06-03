import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHINA_ENGINES, CONTENT_PLATFORMS, CHINA_ENGINE_META, REACHABILITY, CHINA_BOTS,
} from '../src/core/china/facts.ts';

test('facts: 10 个 china 引擎（§6.2，含小红书点点）', () => {
  assert.equal(CHINA_ENGINES.length, 10);
  assert.ok(CHINA_ENGINES.includes('xiaohongshu_diandian'), '含小红书点点');
});

test('facts: 12 个内容平台（§2 交叉表 + 官网）', () => {
  assert.equal(CONTENT_PLATFORMS.length, 12);
  assert.ok(CONTENT_PLATFORMS.includes('official_site'));
  assert.ok(CONTENT_PLATFORMS.includes('xiaohongshu'));
});

test('facts: 每个引擎都有完整 meta + 完整可达性行', () => {
  for (const e of CHINA_ENGINES) {
    assert.ok(CHINA_ENGINE_META[e], `${e} 有 meta`);
    assert.ok(CHINA_ENGINE_META[e].name.length > 0, `${e} 有中文名`);
    const r = REACHABILITY[e];
    assert.ok(r, `${e} 有可达性行`);
    for (const p of CONTENT_PLATFORMS) {
      assert.ok(['direct', 'indirect', 'none'].includes(r[p]), `${e}.${p} 合法`);
    }
  }
});

test('facts: 生态独占源关键事实（§2 takeaway）', () => {
  // 豆包独占 抖音 + 头条号
  assert.equal(REACHABILITY.doubao.douyin, 'direct');
  assert.equal(REACHABILITY.doubao.toutiao, 'direct');
  // 文小言独占 百家号（强偏好）；百度AI 同栈
  assert.equal(REACHABILITY.wenxin.baijiahao, 'direct');
  assert.equal(REACHABILITY.baidu_ai.baijiahao, 'direct');
  // 元宝/混元 独占 微信公众号 + 视频号
  assert.equal(REACHABILITY.tencent_yuanbao.wechat_oa, 'direct');
  assert.equal(REACHABILITY.tencent_hunyuan.wechat_channels, 'direct');
  // 开放 web 4 家（DeepSeek/千问/Kimi/智谱）官网直通
  for (const e of ['deepseek', 'tongyi_qwen', 'kimi', 'zhipu'] as const) {
    assert.equal(REACHABILITY[e].official_site, 'direct', `${e} 官网直通`);
  }
  // 小红书点点：仅小红书站内
  assert.equal(REACHABILITY.xiaohongshu_diandian.xiaohongshu, 'direct');
  assert.equal(REACHABILITY.xiaohongshu_diandian.official_site, 'none');
});

test('facts: 抖音是 doubao 独占（其它 P0/P1 抓不到原生）', () => {
  assert.equal(REACHABILITY.tencent_yuanbao.douyin, 'none');
  assert.equal(REACHABILITY.wenxin.douyin, 'none');
  assert.equal(REACHABILITY.tongyi_qwen.douyin, 'none');
});

test('facts: CHINA_BOTS 含 Baiduspider 且映射到 baidu_ai/wenxin', () => {
  const baidu = CHINA_BOTS.find((b) => b.ua === 'Baiduspider');
  assert.ok(baidu);
  assert.ok(baidu.engines.includes('baidu_ai'));
  assert.ok(baidu.engines.includes('wenxin'));
});
