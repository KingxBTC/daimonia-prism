/**
 * 内嵌方法论检查清单 —— geo_audit_standard v0.5.1 §5.A L-2~L-5 的可执行精简版。
 *
 * 自包含（CLAUDE.md §2 / PRD §9.1）：运行时不读 00_OS，方法论全文内嵌于此。
 * 方法论升版本时只改本文件（CLAUDE.md §3 判断逻辑单点修改）。
 *
 * penalty 模型：每维度 Light 计分检查项的 penalty 之和 = 100。
 *   维度 rawScore = 100 + Σ scoreImpact（good:0 / partial:-penalty/2 / poor:-penalty / na:剔除）。
 * fix.method 对应 §2.4 GEO 9 方法 + Prism 快赢项（llms.txt / E-E-A-T），供 Top3 ROI 排序。
 */

import type { CheckDef, CheckContext, RuleOutcome } from './types.ts';
import type { DimensionId } from './imports.ts';

/** 常用：统计页面文本中数字/百分比/统计量出现次数。 */
function countStats(text: string): number {
  const matches = text.match(/\d[\d,.]*\s?(%|％|percent|个|项|人|年|倍|万|亿|million|billion|k\b)/gi);
  return matches ? matches.length : 0;
}

/** 常用：探测 FAQ / Q&A 结构（schema 或文本模式）。 */
function hasFaqSignal(ctx: CheckContext): boolean {
  const jsonLdHasFaq = ctx.raw.pages.some(p =>
    p.jsonLd.some(block => {
      const t = JSON.stringify(block).toLowerCase();
      return t.includes('faqpage') || t.includes('"@type":"question"');
    }),
  );
  if (jsonLdHasFaq) return true;
  const text = ctx.homepage.textContent;
  const qMarks = (text.match(/[?？]/g) ?? []).length;
  const faqWord = /faq|常见问题|常见问答|q&a|问：|问:/i.test(text);
  return faqWord && qMarks >= 2;
}

// ── I3（DAI-1330）heuristic 兜底地板：headless/无 judge 路径的区分力 ──

/** 英文月份名（用于自然语言日期，含缩写 + 句点变体）。 */
const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

/**
 * 自然语言英文日期：'January 30, 2025' / 'Jan. 30 2025' / '30 January 2025'。
 * 补 D3.freshness 原 numeric-only 正则的盲区（anthropic 误判根因，DAI-1330）。
 */
const NL_DATE_RE = new RegExp(
  `\\b(?:(?:${MONTH_RE})\\.?\\s+\\d{1,2},?\\s+20[12]\\d|\\d{1,2}\\s+(?:${MONTH_RE})\\.?,?\\s+20[12]\\d)\\b`,
  'i',
);

/** 聚合全部抽样页的纯文本（兜底启发式跨页扫描用）。 */
function allText(ctx: CheckContext): string {
  return ctx.raw.pages.map(p => p.textContent).join('\n');
}

// ─────────────────────────────────────────────────────────────
// D5 技术抓取基建（L-2，完整可评，penalty 合计 100）
// ─────────────────────────────────────────────────────────────

const KNOWN_LLM_BOTS = [
  'ClaudeBot', 'anthropic-ai', 'GPTBot', 'OAI-SearchBot',
  'Google-Extended', 'PerplexityBot', 'Bingbot',
];

const D5_robots: CheckDef = {
  id: 'D5.robots_llm_bots', dimension: 'D5', name: 'robots.txt 对 LLM bot 的允许策略',
  tier: 'L', step: 'L2', penalty: 30, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const r = ctx.raw.robots;
    if (!r.exists) {
      // 无 robots.txt = 默认全允许，对 LLM 抓取友好
      return { rating: 'good', evidence: '无 robots.txt（默认允许所有 bot 抓取）' };
    }
    const policies = r.llmBotPolicies;
    const known = KNOWN_LLM_BOTS.filter(b => policies[b] !== undefined);
    const disallowed = KNOWN_LLM_BOTS.filter(b => policies[b] === 'disallow');
    if (disallowed.length === 0) {
      return { rating: 'good', evidence: `robots.txt 未禁止任何已知 LLM bot（${known.length} 个有显式条目）` };
    }
    if (disallowed.length >= KNOWN_LLM_BOTS.length / 2) {
      return { rating: 'poor', evidence: `robots.txt 禁止多数 LLM bot：${disallowed.join(', ')}` };
    }
    return { rating: 'partial', evidence: `robots.txt 禁止部分 LLM bot：${disallowed.join(', ')}` };
  },
  fix: { method: 'robots 放行', action: 'robots.txt 放行 ClaudeBot/GPTBot/Google-Extended 等 LLM bot', effort: 'low' },
};

const D5_https: CheckDef = {
  id: 'D5.https', dimension: 'D5', name: 'HTTPS / 证书',
  tier: 'L', step: 'L2', penalty: 15, kind: 'rule',
  rule: (ctx): RuleOutcome =>
    ctx.raw.isHttps && ctx.homepage.isHttps
      ? { rating: 'good', evidence: '全站 HTTPS' }
      : { rating: 'poor', evidence: '非 HTTPS 或证书异常' },
  fix: { method: 'HTTPS', action: '启用 HTTPS 并配置有效证书', effort: 'mid' },
};

const D5_render: CheckDef = {
  id: 'D5.render_mode', dimension: 'D5', name: 'view-source 渲染模式（SSR vs CSR 空壳）',
  tier: 'L', step: 'L2', penalty: 20, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    if (ctx.raw.isCSR || !ctx.homepage.hasContentInViewSource) {
      return { rating: 'poor', evidence: 'view-source 无实质内容（CSR 空壳，多数 LLM bot 不执行 JS）' };
    }
    return { rating: 'good', evidence: 'view-source 含实质内容（SSR/SSG，bot 可直接抓取）' };
  },
  fix: { method: 'SSR/预渲染', action: '关键内容改 SSR/SSG 或预渲染，确保 view-source 可见', effort: 'high' },
};

const D5_sitemap: CheckDef = {
  id: 'D5.sitemap', dimension: 'D5', name: 'sitemap.xml 存在 + 覆盖',
  tier: 'L', step: 'L2', penalty: 20, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const s = ctx.raw.sitemap;
    if (!s.exists) return { rating: 'poor', evidence: 'GET /sitemap.xml → 不存在（bot 需逐页爬取发现，收录效率低）' };
    if (s.totalUrlCount === 0) return { rating: 'partial', evidence: 'sitemap.xml 存在但为空' };
    return { rating: 'good', evidence: `sitemap.xml 存在，含 ${s.totalUrlCount} 个 URL` };
  },
  fix: { method: 'sitemap', action: '生成并在 robots.txt 声明 sitemap.xml', effort: 'low' },
};

const D5_cwv: CheckDef = {
  id: 'D5.cwv', dimension: 'D5', name: 'Core Web Vitals（PageSpeed）',
  tier: 'L', step: 'L2', penalty: 15, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const c = ctx.raw.cwv;
    if (!c.available) {
      // PRD §10：CWV 未取到 → partial，不阻塞，用其它 D5 项打分
      return { rating: 'na', evidence: `CWV 未取到${c.error ? `（${c.error}）` : ''}，本项不参与计分` };
    }
    const score = c.performanceScore ?? 0;
    if (score >= 80) return { rating: 'good', evidence: `PageSpeed 性能分 ${score}` };
    if (score >= 50) return { rating: 'partial', evidence: `PageSpeed 性能分 ${score}（中等）` };
    return { rating: 'poor', evidence: `PageSpeed 性能分 ${score}（差）` };
  },
  fix: { method: '性能优化', action: '优化 LCP/CLS（图片/字体/布局抖动）', effort: 'mid' },
};

// ─────────────────────────────────────────────────────────────
// D1 结构化语义 + 宏观架构（L-3，完整可评，penalty 合计 100）
// ─────────────────────────────────────────────────────────────

const D1_jsonld: CheckDef = {
  id: 'D1.jsonld_schema', dimension: 'D1', name: 'JSON-LD / schema.org 标注',
  tier: 'L', step: 'L3', penalty: 40, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const pagesWithLd = ctx.raw.pages.filter(p => p.jsonLd.length > 0);
    if (pagesWithLd.length === 0) return { rating: 'poor', evidence: `全站无 JSON-LD/schema.org 标注（已扫 ${ctx.raw.pages.length} 页，0 命中）` };
    if (pagesWithLd.length < ctx.raw.pages.length) {
      return { rating: 'partial', evidence: `仅 ${pagesWithLd.length}/${ctx.raw.pages.length} 个抽样页有 schema.org 标注` };
    }
    return { rating: 'good', evidence: `全部 ${ctx.raw.pages.length} 个抽样页均有 schema.org 标注` };
  },
  fix: { method: 'schema.org', action: '内容页补 Article/FAQ/Organization 等 JSON-LD 标注', effort: 'mid' },
};

const D1_headings: CheckDef = {
  id: 'D1.heading_hierarchy', dimension: 'D1', name: 'H1-H4 层级一致性',
  tier: 'L', step: 'L3', penalty: 30, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const h = ctx.homepage.headings;
    if (h.length === 0) return { rating: 'poor', evidence: '首页无任何标题层级（H1-H4 缺失）' };
    const h1 = h.filter(x => x.level === 1).length;
    if (h1 === 0) return { rating: 'partial', evidence: '缺 H1' };
    if (h1 > 1) return { rating: 'partial', evidence: `多个 H1（${h1} 个），层级不唯一` };
    // 检查是否跳级（如 H1 直接到 H3）
    const levels = h.map(x => x.level);
    let jumped = false;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) { jumped = true; break; }
    }
    if (jumped) return { rating: 'partial', evidence: '标题层级有跳级（如 H1→H3）' };
    return { rating: 'good', evidence: `单一 H1 + ${h.length} 个标题层级清晰` };
  },
  fix: { method: '标题层级', action: '修正为单一 H1 + 不跳级的 H2-H4 章节树', effort: 'low' },
};

const D1_nav: CheckDef = {
  id: 'D1.nav_clarity', dimension: 'D1', name: '章节树 / 导航清晰度',
  tier: 'L+D', step: 'L3', penalty: 30, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断该页的章节组织与导航是否清晰、对 LLM 抽取友好（章节标题是否自解释、内容是否按主题分块）。good=清晰自解释；partial=尚可但有混乱；poor=无结构/导航混乱。',
    context: `标题树：\n${ctx.homepage.headings.map(h => `${'  '.repeat(h.level - 1)}H${h.level} ${h.text}`).join('\n').slice(0, 1500)}`,
  }),
  fallback: (ctx): RuleOutcome =>
    ctx.homepage.headings.length >= 3
      ? { rating: 'partial', evidence: '（降级启发式）有多级标题，结构尚可，未经 LLM 细判' }
      : { rating: 'poor', evidence: '（降级启发式）标题过少，结构性弱' },
  fix: { method: '章节结构', action: '按主题重组章节，标题自解释', effort: 'mid' },
};

// ─────────────────────────────────────────────────────────────
// D2 内容 AI 可读性 + meso + micro（L-4，完整可评，penalty 合计 100）
// ─────────────────────────────────────────────────────────────

const D2_paragraph: CheckDef = {
  id: 'D2.paragraph_list_table', dimension: 'D2', name: '段落/列表/表格语义结构',
  tier: 'L+D', step: 'L4', penalty: 25, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断正文是否用恰当的段落/有序列表/表格组织信息（meso 结构），便于 LLM 抽取。good=结构化良好；partial=部分段落过长或缺列表；poor=大段堆砌。',
    context: ctx.homepage.textContent.slice(0, 2000),
  }),
  fallback: (ctx): RuleOutcome => {
    const text = ctx.homepage.textContent;
    const avgParaLen = text.length / Math.max(1, (text.match(/\n\n/g) ?? []).length + 1);
    return avgParaLen < 600
      ? { rating: 'partial', evidence: '（降级启发式）段落长度尚可，未经 LLM 细判' }
      : { rating: 'poor', evidence: '（降级启发式）疑似大段堆砌（平均段落过长）' };
  },
  fix: { method: '内容分块', action: '长段落拆分，适当用列表/表格组织', effort: 'mid' },
};

const D2_faq: CheckDef = {
  id: 'D2.faq_block', dimension: 'D2', name: 'FAQ / Q&A 块',
  tier: 'L', step: 'L4', penalty: 15, kind: 'rule',
  rule: (ctx): RuleOutcome =>
    hasFaqSignal(ctx)
      ? { rating: 'good', evidence: '检测到 FAQ/Q&A 结构（利于 LLM 直接引用问答对）' }
      : { rating: 'poor', evidence: `已扫 ${ctx.raw.pages.length} 页 JSON-LD + 首页正文，未发现 FAQPage schema 或问答结构` },
  fix: { method: 'FAQ', action: '核心问题做结构化 FAQ 块（建议加 FAQPage schema）', effort: 'low' },
};

const D2_micro: CheckDef = {
  id: 'D2.micro_emphasis', dimension: 'D2', name: 'micro 强调节制度',
  tier: 'L+D', step: 'L4', penalty: 15, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断加粗/强调（micro 层）是否节制且用在关键结论上。good=节制精准；partial=偏多或偏少；poor=滥用或全无。',
    context: ctx.homepage.html.replace(/<(?!\/?(strong|b|em)\b)[^>]+>/gi, ' ').slice(0, 1500),
  }),
  fallback: (): RuleOutcome => ({ rating: 'partial', evidence: '（降级启发式）micro 强调未经 LLM 细判，暂记 partial' }),
  fix: { method: 'micro 强调', action: '关键结论用加粗，避免滥用', effort: 'low' },
};

const D2_selfcontained: CheckDef = {
  id: 'D2.self_contained', dimension: 'D2', name: 'self-contained 自足性',
  tier: 'L+D', step: 'L4', penalty: 20, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断段落是否 self-contained（不依赖上下文/图片即可被单独引用）。good=多数段落自足；partial=部分依赖上下文；poor=高度依赖上下文/图片。',
    context: ctx.homepage.textContent.slice(0, 2000),
  }),
  fallback: (ctx): RuleOutcome => {
    const text = ctx.homepage.textContent;
    // CJK 句间无空格，按句末标点本身切分（英文句点需后接空白以免误切小数 120.5）
    const sentences = text
      .split(/[。！？!?]+|\.\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 8);
    if (sentences.length < 4) {
      return { rating: 'poor', evidence: '（降级启发式）正文句子过少，难以独立成段引用' };
    }
    // 指代开头句（裸代词起手 = 依赖上下文）密度越低，自足性越好
    const refOpener = /^(?:this|that|these|those|it|they|he|she|here|该|此|这|那|它|他|她|其)\b/i;
    const dependent = sentences.filter(s => refOpener.test(s)).length;
    const ratio = dependent / sentences.length;
    const headings = ctx.homepage.headings.length;
    const pct = (ratio * 100).toFixed(0);
    if (ratio < 0.12 && headings >= 3) {
      return { rating: 'good', evidence: `（降级启发式）指代开头句占比 ${pct}%、${headings} 个标题分块，段落自足性较好` };
    }
    if (ratio > 0.3) {
      return { rating: 'poor', evidence: `（降级启发式）指代开头句占比 ${pct}%，段落高度依赖上下文` };
    }
    return { rating: 'partial', evidence: `（降级启发式）指代开头句占比 ${pct}%，自足性中等` };
  },
  fix: { method: '自足改写', action: '关键段落改写为可独立引用（补足主语/背景）', effort: 'mid' },
};

const D2_css: CheckDef = {
  id: 'D2.css_stripped_readability', dimension: 'D2', name: '删 CSS 可读性',
  tier: 'L', step: 'L4', penalty: 15, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const text = ctx.homepage.textContent.trim();
    const html = ctx.homepage.html;
    if (text.length < 200) return { rating: 'poor', evidence: `删 CSS 后纯文本仅 ${text.length} 字（内容靠视觉/JS 呈现）` };
    const ratio = text.length / Math.max(1, html.length);
    if (ratio < 0.05) return { rating: 'partial', evidence: `文本/HTML 占比偏低（${(ratio * 100).toFixed(1)}%）` };
    return { rating: 'good', evidence: `删 CSS 后纯文本 ${text.length} 字，可读性良好` };
  },
  fix: { method: '语义化 HTML', action: '内容用语义标签承载，不依赖 CSS/JS 呈现', effort: 'mid' },
};

const D2_llmstxt: CheckDef = {
  id: 'D2.llms_txt', dimension: 'D2', name: '/llms.txt 存在性与格式',
  tier: 'L+D', step: 'L4', penalty: 10, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const l = ctx.raw.llmsTxt;
    if (!l.exists) return { rating: 'poor', evidence: 'GET /llms.txt → 不存在（-10）' };
    const content = l.content ?? '';
    const hasH1 = /^#\s+\S/m.test(content);
    const hasLinks = /\]\(/.test(content);
    if (hasH1 && hasLinks) return { rating: 'good', evidence: '/llms.txt 存在且含 H1 + 核心页链接' };
    return { rating: 'partial', evidence: '/llms.txt 存在但格式不完整（缺 H1 或链接）' };
  },
  fix: { method: 'llms.txt', action: '新增 /llms.txt（H1 + 站点定位 + 核心页链接）', effort: 'low' },
};

// ─────────────────────────────────────────────────────────────
// D3 权威性信号（L-5，部分可评：站内 E-E-A-T；earned media = Deep。penalty 合计 100）
// ─────────────────────────────────────────────────────────────

const D3_about: CheckDef = {
  id: 'D3.about_page', dimension: 'D3', name: 'About / 机构信息存在性',
  tier: 'L', step: 'L5', penalty: 25, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const links = ctx.raw.pages.flatMap(p => p.internalLinks).map(l => l.toLowerCase());
    // about-us/about_us 已被 about 子串覆盖；company/who-we-are 是权威站常用机构页（DAI-1322）
    const aboutSignal = links.some(l => /about|company|who-we-are|关于|联系|contact|公司|团队|team/.test(l));
    const orgLd = ctx.raw.pages.some(p => p.jsonLd.some(b => /organization|localbusiness/i.test(JSON.stringify(b))));
    if (aboutSignal || orgLd) return { rating: 'good', evidence: '检测到 About/机构信息（链接或 Organization schema）' };
    return { rating: 'poor', evidence: `已扫 ${links.length} 条内部链接 + ${ctx.raw.pages.length} 页 JSON-LD，未发现 About/机构页或 Organization schema` };
  },
  fix: { method: 'E-E-A-T', action: '补 About 页（机构背景/联系方式/Organization schema）', effort: 'low' },
};

const D3_author: CheckDef = {
  id: 'D3.author_credentials', dimension: 'D3', name: '作者 / 资质标注',
  tier: 'L+D', step: 'L5', penalty: 30, kind: 'llm',
  prompt: (ctx) => ({
    instruction: `判断内容是否标注作者及其资质/机构背景（E-E-A-T 的 Expertise/Authoritativeness）。${ctx.profile.isYMYL ? 'YMYL 领域对权威要求高。' : ''}good=有明确作者+资质；partial=有作者无资质；poor=无作者署名。`,
    context: ctx.homepage.textContent.slice(0, 1500),
  }),
  fallback: (ctx): RuleOutcome => {
    const ldStr = ctx.raw.pages.map(p => JSON.stringify(p.jsonLd)).join('').toLowerCase();
    const schemaAuthor = /"@type"\s*:\s*"person"|"author"\s*:/.test(ldStr);
    const text = allText(ctx);
    // 署名：英文 "By Firstname Lastname" 或中文作者/撰文标注（收紧避免 "created by AI" 误命中）
    const byline = /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(text)
      || /作者[：:　\s]|撰文[：:　\s]|本文作者|供稿[：:　\s]/.test(text);
    const credential = /\b(?:ph\.?d|m\.?d|professor|researcher|fellow)\b/i.test(text)
      || /博士|教授|研究员|主任医师|高级工程师|注册.{0,4}师/.test(text);
    if (schemaAuthor && (byline || credential)) {
      return { rating: 'good', evidence: '（降级启发式）检测到 schema author/Person + 署名或资质词' };
    }
    if (schemaAuthor || byline) {
      return { rating: 'partial', evidence: '（降级启发式）检测到署名/作者标注，未确认资质背景' };
    }
    return { rating: 'poor', evidence: '（降级启发式）未检测到作者署名/资质标注' };
  },
  fix: { method: 'E-E-A-T', action: '作者页补资质/机构背景/外部权威背书', effort: 'mid' },
};

const D3_freshness: CheckDef = {
  id: 'D3.freshness', dimension: 'D3', name: '内容时间新鲜度',
  tier: 'L', step: 'L5', penalty: 20, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const dateLd = ctx.raw.pages.some(p =>
      p.jsonLd.some(b => /datepublished|datemodified/i.test(JSON.stringify(b))));
    if (dateLd) return { rating: 'good', evidence: '页面含 datePublished/dateModified 结构化时间标注' };
    // 数字格式（2025-01 / 2025年1）+ 英文自然语言（January 30, 2025）双扫，修 anthropic 误判
    const numericDate = ctx.raw.pages.some(p => /20[12]\d[-/年.]\d{1,2}/.test(p.textContent));
    const nlDate = ctx.raw.pages.some(p => NL_DATE_RE.test(p.textContent));
    if (numericDate || nlDate) {
      const fmt = nlDate && !numericDate ? '英文自然语言日期' : '数字日期';
      return { rating: 'partial', evidence: `正文含${fmt}但无结构化时间标注` };
    }
    return { rating: 'poor', evidence: '未检测到内容时间信息（已扫数字与英文自然语言日期）' };
  },
  fix: { method: '时间标注', action: '补 datePublished/dateModified 结构化时间', effort: 'low' },
};

const D3_transparency: CheckDef = {
  id: 'D3.transparency', dimension: 'D3', name: '透明度（来源/披露/政策）',
  tier: 'L+D', step: 'L5', penalty: 25, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断内容透明度：是否标注信息来源、利益披露、隐私/服务政策等。good=透明充分；partial=部分；poor=无。',
    context: ctx.homepage.textContent.slice(0, 1500),
  }),
  fallback: (ctx): RuleOutcome => {
    const haystack = [
      ...ctx.raw.pages.flatMap(p => p.internalLinks),
      allText(ctx),
    ].join('\n').toLowerCase();
    const signals: Record<string, boolean> = {
      隐私: /privacy|隐私/.test(haystack),
      条款: /terms|服务条款|用户协议|使用条款/.test(haystack),
      披露: /disclosure|信息披露|利益相关|affiliate/.test(haystack),
      cookie政策: /cookie[\s\-]?(?:policy|notice|政策|声明)/.test(haystack),
    };
    const hits = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);
    if (hits.length >= 2) return { rating: 'good', evidence: `（降级启发式）检测到透明度信号：${hits.join('、')}` };
    if (hits.length === 1) return { rating: 'partial', evidence: `（降级启发式）仅检测到 ${hits[0]} 链接` };
    return { rating: 'poor', evidence: '（降级启发式）未检测到隐私/条款/披露等透明度信号' };
  },
  fix: { method: '透明披露', action: '补来源标注/利益披露/隐私政策链接', effort: 'low' },
};

const D3_earned: CheckDef = {
  id: 'D3.earned_media', dimension: 'D3', name: 'earned media 覆盖度',
  tier: 'D', step: 'L5', penalty: 0, kind: 'deep',
};

// ─────────────────────────────────────────────────────────────
// D4 可引用性 + 跨 query 稳定性（L-5，部分可评：站内可引用单元；跨query=Deep。penalty 合计 100）
// ─────────────────────────────────────────────────────────────

const D4_statistics: CheckDef = {
  id: 'D4.statistics_usage', dimension: 'D4', name: 'Statistics 使用率（具体数字/样本）',
  tier: 'L+D', step: 'L5', penalty: 30, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const n = countStats(ctx.homepage.textContent);
    if (n >= 5) return { rating: 'good', evidence: `检测到 ${n} 处统计量/具体数字` };
    if (n >= 1) return { rating: 'partial', evidence: `仅 ${n} 处具体数字，统计支撑偏弱` };
    return { rating: 'poor', evidence: '首页正文未检测到具体数字/统计量（0 处）' };
  },
  fix: { method: 'Statistics Addition', action: '核心结论补具体数字/样本量/时间窗口', effort: 'low' },
};

const D4_citation: CheckDef = {
  id: 'D4.citation_usage', dimension: 'D4', name: 'Cite / 引用来源使用率',
  tier: 'L+D', step: 'L5', penalty: 25, kind: 'rule',
  rule: (ctx): RuleOutcome => {
    const html = ctx.raw.pages.map(p => p.html).join('');
    const extLinks = (html.match(/href=["']https?:\/\//gi) ?? []).length;
    const citeTags = (html.match(/<(cite|blockquote)\b/gi) ?? []).length;
    if (citeTags >= 1 || extLinks >= 5) return { rating: 'good', evidence: `检测到 ${citeTags} 处 cite/quote + ${extLinks} 处外链引用` };
    if (extLinks >= 1) return { rating: 'partial', evidence: `仅 ${extLinks} 处外链，引用支撑偏弱` };
    return { rating: 'poor', evidence: `已扫 ${ctx.raw.pages.length} 页 HTML，未发现 cite/blockquote 标签或外部来源链接（0 处）` };
  },
  fix: { method: 'Citing Sources', action: '关键论点补权威来源链接/引用', effort: 'low' },
};

const D4_conclusion: CheckDef = {
  id: 'D4.conclusion_clarity', dimension: 'D4', name: '结论明确性',
  tier: 'L+D', step: 'L5', penalty: 25, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断内容是否结论先行、明确可引用（LLM 易摘出一句话答案）。good=结论清晰先行；partial=结论模糊/埋在中间；poor=无明确结论。',
    context: ctx.homepage.textContent.slice(0, 2000),
  }),
  fallback: (ctx): RuleOutcome => {
    const text = ctx.homepage.textContent;
    const head = text.slice(0, 600);
    const summaryBlock = /tl;?dr|摘要|概要|key\s+takeaways?|in\s+summary|一句话|核心结论|本文要点/i.test(text);
    // 结论先行：摘要/要点/结论标志出现在正文开头区
    const leadConclusion = /综上|总之|结论|要点|takeaway|summary/i.test(head);
    const concluding = /因此|综上|总之|总的来说|总而言之|结论是|therefore|in conclusion|to sum up|bottom line/i.test(text);
    if (summaryBlock || leadConclusion) {
      return { rating: 'good', evidence: '（降级启发式）检测到摘要/要点/结论先行块' };
    }
    if (concluding) {
      return { rating: 'partial', evidence: '（降级启发式）含结论性连接词但未结论先行' };
    }
    return { rating: 'poor', evidence: '（降级启发式）未检测到摘要块或明确结论标志' };
  },
  fix: { method: 'Quotation Addition', action: '段首给结论句（可被直接引用的明确表述）', effort: 'mid' },
};

const D4_justification: CheckDef = {
  id: 'D4.justification', dimension: 'D4', name: 'Justification 论证结构',
  tier: 'L+D', step: 'L5', penalty: 20, kind: 'llm',
  prompt: (ctx) => ({
    instruction: '判断论点是否有论证结构（论点-论据-依据）。good=论证完整；partial=部分缺依据；poor=断言无支撑。',
    context: ctx.homepage.textContent.slice(0, 2000),
  }),
  fallback: (ctx): RuleOutcome => {
    const text = ctx.homepage.textContent;
    const reasoning = (text.match(/因为|由于|因此|所以|这是因为|基于|根据|because|since|due to|based on|according to|研究表明|数据显示|实验证明/gi) ?? []).length;
    const stats = countStats(text);
    const extLinks = (ctx.homepage.html.match(/href=["']https?:\/\//gi) ?? []).length;
    if (reasoning >= 3 && (stats >= 2 || extLinks >= 3)) {
      return { rating: 'good', evidence: `（降级启发式）${reasoning} 处论证连接词 + ${stats} 处数据/${extLinks} 处外链支撑` };
    }
    if (reasoning >= 1 || stats >= 1) {
      return { rating: 'partial', evidence: `（降级启发式）${reasoning} 处论证连接词、${stats} 处数据，论证支撑中等` };
    }
    return { rating: 'poor', evidence: '（降级启发式）未检测到论证连接词或数据支撑（断言无依据）' };
  },
  fix: { method: 'Authoritative', action: '论点补论据与依据，形成论证链', effort: 'mid' },
};

const D4_crossquery: CheckDef = {
  id: 'D4.cross_query_stability', dimension: 'D4', name: '跨 query 稳定性（WCP/DR/WTR）',
  tier: 'D', step: 'L5', penalty: 0, kind: 'deep',
};

/** 完整检查清单（L-2~L-5）。 */
export const CHECKLIST: readonly CheckDef[] = [
  // D5
  D5_robots, D5_https, D5_render, D5_sitemap, D5_cwv,
  // D1
  D1_jsonld, D1_headings, D1_nav,
  // D2
  D2_paragraph, D2_faq, D2_micro, D2_selfcontained, D2_css, D2_llmstxt,
  // D3
  D3_about, D3_author, D3_freshness, D3_transparency, D3_earned,
  // D4
  D4_statistics, D4_citation, D4_conclusion, D4_justification, D4_crossquery,
];

/** D3/D4 在 Light 档恒为 partial（earned/跨query 子项未评，PRD §5.1）。 */
export const ALWAYS_PARTIAL_DIMENSIONS: ReadonlySet<DimensionId> = new Set(['D3', 'D4']);
