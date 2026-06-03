import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ratingToScoreImpact,
  ratingToStatus,
  aggregateRawScore,
  assembleDimension,
  buildCheckResult,
} from './aggregate.ts';
import type { CheckDef } from './types.ts';
import type { CheckResult } from './imports.ts';

describe('ratingToScoreImpact (penalty 模型)', () => {
  test('good=0, partial=-penalty/2, poor=-penalty, na=0', () => {
    assert.equal(ratingToScoreImpact('good', 30), 0);
    assert.equal(ratingToScoreImpact('partial', 30), -15);
    assert.equal(ratingToScoreImpact('poor', 30), -30);
    assert.equal(ratingToScoreImpact('na', 30), 0);
  });
  test('llms.txt 缺失 → -10（对齐 PRD §7.1）', () => {
    assert.equal(ratingToScoreImpact('poor', 10), -10);
  });
});

describe('ratingToStatus', () => {
  test('映射到 PRD CheckStatus', () => {
    assert.equal(ratingToStatus('good'), 'pass');
    assert.equal(ratingToStatus('partial'), 'partial');
    assert.equal(ratingToStatus('poor'), 'fail');
    assert.equal(ratingToStatus('na'), 'na');
  });
});

describe('aggregateRawScore', () => {
  test('全 good → 100', () => {
    assert.equal(aggregateRawScore([{ penalty: 40, rating: 'good' }, { penalty: 60, rating: 'good' }]), 100);
  });
  test('全 poor → 0', () => {
    assert.equal(aggregateRawScore([{ penalty: 40, rating: 'poor' }, { penalty: 60, rating: 'poor' }]), 0);
  });
  test('单项 poor (penalty40/总100) → 60', () => {
    assert.equal(aggregateRawScore([
      { penalty: 40, rating: 'poor' }, { penalty: 30, rating: 'good' }, { penalty: 30, rating: 'good' },
    ]), 60);
  });
  test('partial 扣半 penalty', () => {
    // penalty100, 一项 partial(penalty20) → lost10 → 90
    assert.equal(aggregateRawScore([
      { penalty: 20, rating: 'partial' }, { penalty: 80, rating: 'good' },
    ]), 90);
  });
  test('na 项剔除并重整基线（不送分）', () => {
    // 两项各 penalty50；一项 na 剔除，剩 poor(penalty50) 占满基线 → 0
    assert.equal(aggregateRawScore([
      { penalty: 50, rating: 'na' }, { penalty: 50, rating: 'poor' },
    ]), 0);
    // 剩 good → 100
    assert.equal(aggregateRawScore([
      { penalty: 50, rating: 'na' }, { penalty: 50, rating: 'good' },
    ]), 100);
  });
  test('全 na → null（维度不可评）', () => {
    assert.equal(aggregateRawScore([{ penalty: 50, rating: 'na' }]), null);
  });
});

describe('assembleDimension', () => {
  const defs: CheckDef[] = [
    { id: 'D5.a', dimension: 'D5', name: 'a', tier: 'L', step: 'L2', penalty: 50, kind: 'rule' },
    { id: 'D5.b', dimension: 'D5', name: 'b', tier: 'L', step: 'L2', penalty: 50, kind: 'rule' },
  ];
  const mk = (id: string, status: CheckResult['status'], ev = ''): CheckResult => ({
    id, name: id, tier: 'L', status, evidence: ev || status, scoreImpact: 0,
  });

  test('issues 取 fail/partial 前 2，fail 优先', () => {
    const r = assembleDimension(defs, [mk('D5.a', 'partial', 'p问题'), mk('D5.b', 'fail', 'f问题')], false);
    assert.deepEqual(r.issues, ['f问题', 'p问题']); // fail 排前
  });
  test('alwaysPartial=true → partial', () => {
    const r = assembleDimension(defs, [mk('D5.a', 'pass'), mk('D5.b', 'pass')], true);
    assert.equal(r.partial, true);
  });
  test('有 na 检查项 → partial', () => {
    const r = assembleDimension(defs, [mk('D5.a', 'na'), mk('D5.b', 'pass')], false);
    assert.equal(r.partial, true);
  });
  test('全 pass 且非 alwaysPartial → 不 partial，rawScore=100', () => {
    const r = assembleDimension(defs, [mk('D5.a', 'pass'), mk('D5.b', 'pass')], false);
    assert.equal(r.partial, false);
    assert.equal(r.rawScore, 100);
    assert.deepEqual(r.issues, []);
  });
});

describe('buildCheckResult', () => {
  test('def + outcome → CheckResult（PRD 字段齐全）', () => {
    const def: CheckDef = { id: 'D2.llms_txt', dimension: 'D2', name: 'llms', tier: 'L+D', step: 'L4', penalty: 10, kind: 'rule' };
    const cr = buildCheckResult(def, { rating: 'poor', evidence: '404' });
    assert.deepEqual(cr, { id: 'D2.llms_txt', name: 'llms', tier: 'L+D', status: 'fail', evidence: '404', scoreImpact: -10 });
  });
});
