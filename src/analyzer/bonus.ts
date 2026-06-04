/**
 * 加分信号检测（DAI-1329 / I2）—— 确定性，从 RawSiteData 直接判定。
 *
 * 定位（docs/iteration-light-discrimination.md §I2）：
 *  - 基础 penalty 模型奖励「table stakes 存在性」；bonus 奖励「高于基础档的额外功夫」。
 *  - 每个信号衡量的都是**基础二元 check 之上**的一档，避免与 checklist.ts 双重计分：
 *      · rich_schema   —— D1.jsonld_schema 只判「有无」；本信号判「类型丰富度」（≥2 种）。
 *      · semantic_html —— checklist 无对应项；纯新增维度（语义化 landmark 标签）。
 *      · ssr_rich_content —— D5.render_mode 只判「非空壳」；本信号判「正文深度」（长正文 SSR）。
 *  - **不含 llms.txt**：D2.llms_txt 基础 check 已有 poor/partial/good 分档（含 H1+链接的高档），
 *    再加 bonus 即对同一产物双重奖励，违反「只奖基础未计入的额外档」原则。详见文档 §I2。
 *
 * 判断逻辑集中在 Analyzer 层（CLAUDE.md §3）；Scorer 只做确定性聚合（cap + 进总分）。
 */

import type { BonusSignal, RawSiteData, RawPageData } from './imports.ts';

/** SSR 正文深度阈值：view-source 纯文本 ≥ 此长度才视为「正文充实」。 */
export const SSR_RICH_CONTENT_MIN_CHARS = 800;

/** 语义化 landmark 标签集合（HTML5 结构语义，利于 bot 切分内容）。 */
const SEMANTIC_TAGS = [
  'main', 'article', 'section', 'nav', 'header', 'footer', 'aside', 'figure', 'time',
] as const;

/**
 * 递归收集一个 JSON-LD 块里的所有 @type（兼容 string / array / @graph 嵌套）。
 */
function collectSchemaTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaTypes(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const t = obj['@type'];
    if (typeof t === 'string') out.add(t);
    else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
    // @graph / 其他容器字段递归
    for (const key of Object.keys(obj)) {
      if (key === '@type') continue;
      collectSchemaTypes(obj[key], out);
    }
  }
}

/** 全站抽样页去重后的 schema.org 类型集合。 */
export function distinctSchemaTypes(raw: RawSiteData): string[] {
  const set = new Set<string>();
  for (const p of raw.pages) {
    for (const block of p.jsonLd) collectSchemaTypes(block, set);
  }
  return [...set];
}

/** 首页 view-source 中出现的语义化 landmark 标签（去重）。 */
export function semanticTagsUsed(page: RawPageData): string[] {
  const html = page.html.toLowerCase();
  return SEMANTIC_TAGS.filter(tag => new RegExp(`<${tag}[\\s>/]`).test(html));
}

/**
 * 检测加分信号（确定性）。返回 points>0 的信号列表（无信号 → []）。
 *
 * 各信号按档给分；权重为 I2 初值，I6 验证 separation 后回填微调
 * （docs/iteration-light-discrimination.md §4 I6）。
 */
export function detectBonusSignals(raw: RawSiteData): BonusSignal[] {
  const signals: BonusSignal[] = [];
  if (!raw.pages || raw.pages.length === 0) return signals;
  const homepage = raw.pages[0];

  // ── B.rich_schema（D1）：schema 类型丰富度，高于「有无」基础档 ──────────
  const types = distinctSchemaTypes(raw);
  if (types.length >= 4) {
    signals.push({
      id: 'B.rich_schema', name: 'schema 类型丰富度', dimension: 'D1', points: 4,
      evidence: `检测到 ${types.length} 种 schema.org 类型（${types.slice(0, 5).join('/')}…），结构化标注超出基础水平`,
    });
  } else if (types.length >= 2) {
    signals.push({
      id: 'B.rich_schema', name: 'schema 类型丰富度', dimension: 'D1', points: 2,
      evidence: `检测到 ${types.length} 种 schema.org 类型（${types.join('/')}），多类型标注`,
    });
  }

  // ── B.semantic_html（D1）：HTML5 语义化 landmark 标签 ────────────────────
  const semTags = semanticTagsUsed(homepage);
  if (semTags.length >= 5) {
    signals.push({
      id: 'B.semantic_html', name: '语义化 HTML 结构', dimension: 'D1', points: 2,
      evidence: `首页使用 ${semTags.length} 种语义化标签（${semTags.join('/')}），利于 bot 切分内容`,
    });
  } else if (semTags.length >= 3) {
    signals.push({
      id: 'B.semantic_html', name: '语义化 HTML 结构', dimension: 'D1', points: 1,
      evidence: `首页使用 ${semTags.length} 种语义化标签（${semTags.join('/')}）`,
    });
  }

  // ── B.ssr_rich_content（D2）：SSR 且正文充实，高于「非空壳」基础档 ───────
  const textLen = homepage.textContent?.length ?? 0;
  if (!raw.isCSR && homepage.hasContentInViewSource && textLen >= SSR_RICH_CONTENT_MIN_CHARS) {
    signals.push({
      id: 'B.ssr_rich_content', name: 'SSR 正文深度', dimension: 'D2', points: 2,
      evidence: `view-source 含完整正文（约 ${textLen} 字符，SSR/SSG），bot 可直接抓取全文`,
    });
  }

  return signals;
}
