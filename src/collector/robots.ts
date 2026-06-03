/**
 * robots.txt 解析器
 * 判断各 LLM bot UA 的 allow/disallow 策略
 * 提取 Sitemap 声明
 */

import type { BotPolicy, RobotsParsed } from './types.ts';
import { PRISM_UA } from './http.ts';

/** 从 robots.txt 原始文本解析针对指定 UA 的策略 */
export function parseRobots(raw: string, botsToCheck: string[]): RobotsParsed {
  const lines = raw.split(/\r?\n/);
  const sitemapUrls: string[] = [];
  const llmBotPolicies: Record<string, BotPolicy> = {};

  // 解析结构：User-agent 块 → rules
  const blocks = extractBlocks(lines);

  for (const ua of botsToCheck) {
    llmBotPolicies[ua] = resolvePolicy(ua, blocks);
  }

  // PrismBot 策略
  const prismBotAllowed = resolvePolicy('PrismBot', blocks) !== 'disallow';

  // Sitemap 声明（顶层，不属于任何 User-agent 块）
  for (const line of lines) {
    const m = line.match(/^Sitemap:\s*(.+)/i);
    if (m) sitemapUrls.push(m[1].trim());
  }

  return {
    exists: true,
    raw,
    llmBotPolicies,
    sitemapUrls,
    prismBotAllowed,
  };
}

export function emptyRobots(botsToCheck: string[]): RobotsParsed {
  const llmBotPolicies: Record<string, BotPolicy> = {};
  for (const ua of botsToCheck) llmBotPolicies[ua] = 'unspecified';
  return {
    exists: false,
    raw: '',
    llmBotPolicies,
    sitemapUrls: [],
    prismBotAllowed: true, // 无 robots.txt → 默认允许
  };
}

interface RuleBlock {
  agents: string[];
  disallows: string[];
  allows: string[];
}

function extractBlocks(lines: string[]): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  let current: RuleBlock | null = null;

  for (const raw of lines) {
    const line = raw.trim();

    // 注释行跳过（但不结束块）
    if (line.startsWith('#')) continue;

    // 空行 → 结束当前块
    if (!line) {
      current = null;
      continue;
    }

    const agentMatch = line.match(/^User-agent:\s*(.+)/i);
    const disallowMatch = line.match(/^Disallow:\s*(.*)/i);
    const allowMatch = line.match(/^Allow:\s*(.*)/i);

    if (agentMatch) {
      // 同一块可以有多个 User-agent 行（规则未开始时）
      // 一旦出现 Allow/Disallow 后再遇到 User-agent → 新块
      const hasRules = current && (current.disallows.length > 0 || current.allows.length > 0);
      if (!current || hasRules) {
        current = { agents: [], disallows: [], allows: [] };
        blocks.push(current);
      }
      current.agents.push(agentMatch[1].trim());
    } else if (disallowMatch) {
      if (!current) continue;
      const path = disallowMatch[1].trim();
      if (path) current.disallows.push(path);
    } else if (allowMatch) {
      if (!current) continue;
      const path = allowMatch[1].trim();
      if (path) current.allows.push(path);
    }
    // Sitemap 等其他指令忽略（已在上层提取）
  }

  return blocks;
}

function resolvePolicy(ua: string, blocks: RuleBlock[]): BotPolicy {
  // 精确匹配 > 通配符 * 匹配
  const exactBlocks = blocks.filter(b =>
    b.agents.some(a => a.toLowerCase() === ua.toLowerCase())
  );
  const wildcardBlocks = blocks.filter(b =>
    b.agents.some(a => a === '*')
  );

  const matchedBlocks = exactBlocks.length > 0 ? exactBlocks : wildcardBlocks;
  if (matchedBlocks.length === 0) return 'unspecified';

  // 如果有任一块的 disallows 包含 '/' (全站) 且 allows 为空 → disallow
  for (const block of matchedBlocks) {
    if (block.disallows.some(d => d === '/') && block.allows.length === 0) {
      return 'disallow';
    }
    if (block.disallows.some(d => d === '/') && block.allows.length > 0) {
      // 部分允许，算 allow（保守处理：有 allow 规则就不算完全禁止）
      return 'allow';
    }
    if (block.disallows.length > 0) {
      // 部分路径 disallow，但不是全站 → allow（仅评估是否可抓取站点）
      return 'allow';
    }
  }

  return 'allow';
}

/** 判断 Prism 是否被允许爬取（用于决定是否采集内容页） */
export function isPrismAllowed(robots: RobotsParsed): boolean {
  return robots.prismBotAllowed;
}
