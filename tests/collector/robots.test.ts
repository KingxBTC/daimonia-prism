import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseRobots, emptyRobots, isPrismAllowed } from '../../src/collector/robots.ts';
import { LLM_BOTS_INTERNATIONAL } from '../../src/collector/bots.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dir, 'fixtures', name), 'utf8');

const BOT_UAS = LLM_BOTS_INTERNATIONAL.map(b => b.ua);

describe('parseRobots', () => {
  test('全部允许的 robots.txt → 所有 LLM bot 为 allow', () => {
    const raw = fix('robots_allow_all.txt');
    const result = parseRobots(raw, BOT_UAS);

    assert.equal(result.exists, true);
    assert.equal(result.prismBotAllowed, true);
    for (const ua of BOT_UAS) {
      assert.equal(result.llmBotPolicies[ua], 'allow', `${ua} should be allow`);
    }
  });

  test('屏蔽 GPTBot 和 ClaudeBot → 对应 bot 为 disallow', () => {
    const raw = fix('robots_block_llm.txt');
    const result = parseRobots(raw, BOT_UAS);

    assert.equal(result.llmBotPolicies['GPTBot'], 'disallow');
    assert.equal(result.llmBotPolicies['ClaudeBot'], 'disallow');
    assert.equal(result.llmBotPolicies['anthropic-ai'], 'disallow');
    // Bingbot 被允许
    assert.equal(result.llmBotPolicies['Bingbot'], 'allow');
  });

  test('从 robots.txt 提取 Sitemap URL', () => {
    const raw = fix('robots_block_llm.txt');
    const result = parseRobots(raw, BOT_UAS);

    assert.ok(result.sitemapUrls.includes('https://acme-example.com/sitemap.xml'));
  });

  test('多个 Sitemap 声明都被提取', () => {
    const raw = fix('robots_allow_all.txt');
    const result = parseRobots(raw, BOT_UAS);

    assert.equal(result.sitemapUrls.length, 2);
  });

  test('PrismBot 未被屏蔽 → prismBotAllowed = true', () => {
    const raw = fix('robots_block_llm.txt');
    const result = parseRobots(raw, BOT_UAS);
    assert.equal(result.prismBotAllowed, true);
  });

  test('emptyRobots：不存在 robots.txt → 默认允许', () => {
    const result = emptyRobots(BOT_UAS);
    assert.equal(result.exists, false);
    assert.equal(result.prismBotAllowed, true);
    for (const ua of BOT_UAS) {
      assert.equal(result.llmBotPolicies[ua], 'unspecified');
    }
  });

  test('全站 Disallow + PrismBot → isPrismAllowed = false', () => {
    const raw = `User-agent: PrismBot\nDisallow: /\n`;
    const result = parseRobots(raw, []);
    assert.equal(isPrismAllowed(result), false);
  });
});
