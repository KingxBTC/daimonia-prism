/**
 * Prism — china 市场核心审计逻辑（PRD §6.3）。
 *
 * 纯函数层：输入"站点内容平台分布 + 目标引擎 + robots 核查结果"，
 * 输出"内容平台覆盖 vs LLM 可达性盲区"判断与整改方向，组装成 CheckResult。
 *
 * 这是 Analyzer（T4/DAI-1274）在 market 含 china 时调用的子模块——判断集中在此，
 * 便于方法论升版本单点修改（CLAUDE.md §3）。
 */

import type { CheckResult, Market } from '../types.ts';
import {
  CHINA_BOTS, CHINA_ENGINE_META, CHINA_ENGINES, CONTENT_PLATFORMS,
  OPEN_WEB_FALLBACK_NOTE, REACHABILITY,
} from './facts.ts';
import type { ChinaEngine, ContentPlatform, Reachability } from './facts.ts';

const RANK: Record<Reachability, number> = { none: 0, indirect: 1, direct: 2 };

/** 引擎中文标签（含优先级），evidence 用。 */
function label(engine: ChinaEngine): string {
  const m = CHINA_ENGINE_META[engine];
  return `${m.name}(${m.priority})`;
}

/** 单引擎在给定内容分布下的可达性判定。 */
export interface EngineReachability {
  engine: ChinaEngine;
  /** 在 present 平台里能达到的最佳可达性。 */
  best: Reachability;
  /** 贡献该最佳可达性的（已覆盖）平台。 */
  viaPlatforms: ContentPlatform[];
  /** best === 'none'：该引擎完全抓不到本站内容（盲区）。 */
  blindSpot: boolean;
}

/** 盲区/弱可达引擎的整改方向。 */
export interface RemediationHint {
  engine: ChinaEngine;
  current: Reachability;
  /** 尚未覆盖、但能提升可达性的平台（按 direct 优先排序）。 */
  recommendPlatforms: { platform: ContentPlatform; level: Reachability }[];
  note: string;
}

/** 某引擎对某平台的可达性。 */
export function reachabilityOf(engine: ChinaEngine, platform: ContentPlatform): Reachability {
  return REACHABILITY[engine][platform];
}

/**
 * PRD §6.3 核心：内容平台覆盖 → 目标 LLM 可达性盲区标注。
 * 对每个目标引擎，取其在已覆盖平台上的最佳可达性。
 */
export function analyzeReachability(
  present: readonly ContentPlatform[],
  targets: readonly ChinaEngine[],
): EngineReachability[] {
  return targets.map((engine) => {
    let best: Reachability = 'none';
    for (const p of present) {
      const r = reachabilityOf(engine, p);
      if (RANK[r] > RANK[best]) best = r;
    }
    const viaPlatforms = best === 'none'
      ? []
      : present.filter((p) => reachabilityOf(engine, p) === best);
    return { engine, best, viaPlatforms, blindSpot: best === 'none' };
  });
}

/** 对盲区/仅间接可达的引擎，给出"投哪个平台能直通"的整改方向。 */
export function chinaRemediationHints(
  present: readonly ContentPlatform[],
  targets: readonly ChinaEngine[],
): RemediationHint[] {
  const presentSet = new Set(present);
  const hints: RemediationHint[] = [];
  for (const er of analyzeReachability(present, targets)) {
    if (er.best === 'direct') continue; // 已直通，无需整改
    // 未覆盖且能提升可达性的平台，按可达性降序
    const candidates = CONTENT_PLATFORMS
      .filter((p) => !presentSet.has(p))
      .map((p) => ({ platform: p, level: reachabilityOf(er.engine, p) }))
      .filter((c) => RANK[c.level] > RANK[er.best])
      .sort((a, b) => RANK[b.level] - RANK[a.level]);
    if (candidates.length === 0) continue; // 无更优平台（结构性不可达）
    // 只保留最高一档（direct 优先；无 direct 时给 indirect）
    const topLevel = candidates[0].level;
    const recommendPlatforms = candidates.filter((c) => c.level === topLevel);
    const m = CHINA_ENGINE_META[er.engine];
    hints.push({
      engine: er.engine,
      current: er.best,
      recommendPlatforms,
      note: `${m.name}（后端：${m.searchBackend}）独占源：${m.nativeSources}`,
    });
  }
  return hints;
}

/** market → 需要评估的 china 引擎集合（§6.2 全量 10 引擎）。 */
export function selectChinaEngines(market: Market): ChinaEngine[] {
  if (market === 'international') return [];
  return [...CHINA_ENGINES];
}

/** §6.3 robots.txt 对国内 bot 的策略核查 → CheckResult。 */
export function checkChinaRobots(
  blockedBotUAs: readonly string[],
  targets: readonly ChinaEngine[],
): CheckResult {
  const targetSet = new Set(targets);
  const blockedSet = new Set(blockedBotUAs);
  // 仅核查服务于目标引擎、且为"开放 web 抓取型"的 bot
  const relevant = CHINA_BOTS.filter((b) => b.engines.some((e) => targetSet.has(e)));
  const blocked = relevant.filter((b) => blockedSet.has(b.ua));
  const base = { id: 'china.robots_cn_bots', name: 'robots.txt 国内 bot 策略核查（§6.3）', tier: 'L' };

  if (blocked.length === 0) {
    return {
      ...base, status: 'pass', scoreImpact: 0,
      evidence: `未发现封禁目标引擎相关国内 bot（已核查 ${relevant.map((b) => b.ua).join(' / ') || '无'}）。`
        + ` 注：平台原生内容（公众号/抖音/视频号）走平台索引，不受 robots 控制（§6.3 D5）。${OPEN_WEB_FALLBACK_NOTE}`,
    };
  }
  const hitsP0 = blocked.some(
    (b) => b.engines.some((e) => targetSet.has(e) && CHINA_ENGINE_META[e].priority === 'P0'),
  );
  const detail = blocked
    .map((b) => `${b.ua}→${b.engines.filter((e) => targetSet.has(e)).map(label).join('/')}（${b.note}）`)
    .join('；');
  return {
    ...base,
    status: hitsP0 ? 'fail' : 'partial',
    scoreImpact: hitsP0 ? -15 : -5,
    evidence: `robots.txt 封禁了国内 bot：${detail}。${hitsP0 ? '命中 P0 引擎后端，开放 web 可达性受损。' : ''}`
      + ` 平台原生内容不受影响（§6.3 D5）。`,
  };
}

/** §6.3 核心 check：内容平台覆盖 vs LLM 可达性盲区 → CheckResult。 */
export function buildPlatformCoverageCheck(
  present: readonly ContentPlatform[],
  targets: readonly ChinaEngine[],
): CheckResult {
  const reach = analyzeReachability(present, targets);
  const blind = reach.filter((r) => r.blindSpot);
  const indirectOnly = reach.filter((r) => r.best === 'indirect');
  const p0Blind = blind.filter((r) => CHINA_ENGINE_META[r.engine].priority === 'P0');
  const base = { id: 'china.platform_reachability', name: '内容平台覆盖 vs LLM 可达性盲区（§6.3）', tier: 'L' };

  if (blind.length === 0 && indirectOnly.length === 0) {
    const direct = reach.map((r) => label(r.engine)).join('、');
    return {
      ...base, status: 'pass', scoreImpact: 0,
      evidence: `目标引擎均可一手直通：${direct}。`,
    };
  }
  // 整改方向
  const hints = chinaRemediationHints(present, targets);
  const hintStr = hints
    .map((h) => `${CHINA_ENGINE_META[h.engine].name}←${h.recommendPlatforms.map((p) => p.platform).join('/')}`)
    .join('；');
  const parts: string[] = [];
  if (blind.length > 0) parts.push(`盲区引擎（内容完全抓不到）：${blind.map((r) => label(r.engine)).join('、')}`);
  if (indirectOnly.length > 0) parts.push(`仅间接可达：${indirectOnly.map((r) => label(r.engine)).join('、')}`);
  if (hintStr) parts.push(`整改方向：${hintStr}`);
  return {
    ...base,
    status: p0Blind.length > 0 ? 'fail' : 'partial',
    scoreImpact: p0Blind.length > 0 ? -20 : -10,
    evidence: parts.join('。') + '。',
  };
}

export interface ChinaMarketInput {
  market: Market;
  /** 站点检测到的内容分布平台。 */
  contentPlatforms: readonly ContentPlatform[];
  /** 目标引擎；缺省时按 market 全量。 */
  targetEngines?: readonly ChinaEngine[];
  /** robots.txt 中被 Disallow 根路径的 bot UA（来自 collector）。 */
  blockedCnBotUAs?: readonly string[];
}

/**
 * china 市场审计入口：返回供 Analyzer 合并的 CheckResult[]。
 * market === 'international' → 返回空（不评 china）。
 */
export function buildChinaMarketChecks(input: ChinaMarketInput): CheckResult[] {
  if (input.market === 'international') return [];
  const targets = input.targetEngines && input.targetEngines.length > 0
    ? input.targetEngines
    : selectChinaEngines(input.market);
  return [
    buildPlatformCoverageCheck(input.contentPlatforms, targets),
    checkChinaRobots(input.blockedCnBotUAs ?? [], targets),
  ];
}
