/**
 * api-judge.test.ts — web 形态 apiJudge 适配器单测（DAI-1332 / I5）
 *
 * 在 fetch 边界打桩，不打真实 Anthropic API。验证：
 *  1. verdict 结构与 agent-judge 一致（{rating, evidence}，rating ∈ good|partial|poor|na）；
 *  2. key 注入（config.apiKey / 缺 key 构造抛错）+ 模型选择透传到请求体；
 *  3. JSON 解析鲁棒性（裸 JSON / ```json 代码块 / 前后多余文字）；
 *  4. 错误降级（PRD §10）：网络异常 / 非 2xx / rating 非法 / 空响应 → 抛错（交 Analyzer 降级）。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApiJudge, extractVerdictJson, DEFAULT_MODEL } from '../../web/judge/api-judge.ts';
import type { JudgeRequest } from '../../src/analyzer/types.ts';

const REQ: JudgeRequest = {
  checkId: 'D2.self_contained',
  dimension: 'D2',
  name: '内容自包含',
  instruction: '判断首页正文是否可独立理解。',
  context: '首页含 TL;DR 摘要块与完整产品介绍。',
};

/** 造一个返回指定 body 的 fetch 桩；记录最后一次请求供断言。 */
function stubFetch(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
  throwErr?: Error;
}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (opts.throwErr) throw opts.throwErr;
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: opts.statusText ?? 'OK',
      json: async () => opts.json,
      text: async () => opts.text ?? '',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** Anthropic Messages 响应封装：单 text block。 */
function msg(text: string) {
  return { content: [{ type: 'text', text }] };
}

describe('apiJudge — 构造与配置', () => {
  test('缺 key 构造抛错（误配尽早暴露）', () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      assert.throws(() => createApiJudge({}), /缺 Anthropic API key/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test('config.apiKey + 模型选择透传到请求', async () => {
    const { impl, calls } = stubFetch({ json: msg('{"rating":"good","evidence":"ok"}') });
    const judge = createApiJudge({ apiKey: 'sk-test', model: 'claude-haiku-4-5', fetchImpl: impl });
    await judge(REQ);

    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.match(url, /\/v1\/messages$/);
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['x-api-key'], 'sk-test');
    assert.ok(headers['anthropic-version']);
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, 'claude-haiku-4-5');
    // 稳定 system 块标 cache_control（prompt 缓存）
    assert.equal(body.system[0].cache_control.type, 'ephemeral');
    // 请求体携带检查项标准与证据
    assert.match(body.messages[0].content, /内容自包含/);
    assert.match(body.messages[0].content, /TL;DR/);
  });

  test('默认模型为 DEFAULT_MODEL', async () => {
    const { impl, calls } = stubFetch({ json: msg('{"rating":"partial","evidence":"x"}') });
    const judge = createApiJudge({ apiKey: 'sk-test', fetchImpl: impl });
    await judge(REQ);
    assert.equal(JSON.parse(calls[0].init.body as string).model, DEFAULT_MODEL);
  });
});

describe('apiJudge — verdict 结构与 agent-judge 一致', () => {
  test('裸 JSON 解析为 {rating, evidence}', async () => {
    const { impl } = stubFetch({ json: msg('{"rating":"good","evidence":"全站 4 页均含 schema"}') });
    const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
    const v = await judge(REQ);
    assert.deepEqual(v, { rating: 'good', evidence: '全站 4 页均含 schema' });
  });

  test('rating 取值落在合法离散集（与 agent-judge / from-file 同语义）', async () => {
    for (const r of ['good', 'partial', 'poor', 'na']) {
      const { impl } = stubFetch({ json: msg(`{"rating":"${r}","evidence":"e"}`) });
      const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
      const v = await judge(REQ);
      assert.equal(v.rating, r);
    }
  });

  test('evidence 缺失时回填占位（与 from-file 一致，不返空）', async () => {
    const { impl } = stubFetch({ json: msg('{"rating":"poor"}') });
    const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
    const v = await judge(REQ);
    assert.equal(v.rating, 'poor');
    assert.ok(v.evidence.length > 0);
  });
});

describe('extractVerdictJson — 解析鲁棒性', () => {
  test('容忍 ```json 代码块包裹', () => {
    const parsed = extractVerdictJson('```json\n{"rating":"good","evidence":"e"}\n```');
    assert.equal(parsed.rating, 'good');
  });

  test('容忍前后多余文字', () => {
    const parsed = extractVerdictJson('判定如下：{"rating":"partial","evidence":"e"} 完毕');
    assert.equal(parsed.rating, 'partial');
  });

  test('无 JSON 对象 → 抛错', () => {
    assert.throws(() => extractVerdictJson('没有 JSON'), /无 JSON 对象/);
  });
});

describe('apiJudge — 错误降级（PRD §10：抛错交 Analyzer 兜底）', () => {
  test('网络异常 → 抛错', async () => {
    const { impl } = stubFetch({ throwErr: new Error('ECONNRESET') });
    const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
    await assert.rejects(() => judge(REQ), /请求失败.*ECONNRESET/);
  });

  test('非 2xx → 抛错（含状态码）', async () => {
    const { impl } = stubFetch({ ok: false, status: 529, statusText: 'Overloaded', text: 'overloaded' });
    const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
    await assert.rejects(() => judge(REQ), /非 2xx：529/);
  });

  test('rating 非法 → 抛错', async () => {
    const { impl } = stubFetch({ json: msg('{"rating":"excellent","evidence":"e"}') });
    const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
    await assert.rejects(() => judge(REQ), /rating 非法/);
  });

  test('空响应文本 → 抛错', async () => {
    const { impl } = stubFetch({ json: { content: [] } });
    const judge = createApiJudge({ apiKey: 'k', fetchImpl: impl });
    await assert.rejects(() => judge(REQ), /无文本内容/);
  });
});
