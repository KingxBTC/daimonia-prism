/**
 * Prism — china 市场内嵌事实层（自包含原则，CLAUDE.md §2 / PRD §9.1 item 3-4）。
 *
 * source of truth（人工同步，非运行时 import）:
 *  - `Daimonia/00_OS/methodology/llm_search_backend_china.md` v0.1 §1（后端对照表）/ §2（交叉表）
 *  - `docs/prd_v1.md` v1.1 §6.2（国内 10 引擎）/ §6.3（china 核心审计逻辑）/ §1.3
 *
 * 方法论升版本时由人工起 child issue 同步进本文件（PRD §13 维护流程）。
 *
 * 与 T3（src/collector/bots.ts）的关系：bots.ts 的 `LLM_BOTS_CHINA` 是 "Phase 1.1 预留"
 * 的占位 stub；本文件 `CHINA_BOTS` 是 china bot UA 的权威清单（§6.3 robots 核查用）。
 * 二者落地时应收敛到本文件（已在 T7 交接评论中记录）。
 */

/** 内容平台（§2 交叉表行 + 自有官网/开放 web）。 */
export type ContentPlatform =
  | 'official_site'      // 官网 / 自有博客（开放 web）
  | 'wechat_oa'          // 微信公众号
  | 'wechat_channels'    // 微信视频号
  | 'douyin'             // 抖音
  | 'xiaohongshu'        // 小红书
  | 'bilibili'           // B 站
  | 'zhihu'              // 知乎
  | 'baijiahao'          // 百家号
  | 'souhu'              // 搜狐号
  | 'wangyi'             // 网易号
  | 'toutiao'            // 今日头条号
  | 'dianping';          // 大众点评

export const CONTENT_PLATFORMS = [
  'official_site', 'wechat_oa', 'wechat_channels', 'douyin', 'xiaohongshu',
  'bilibili', 'zhihu', 'baijiahao', 'souhu', 'wangyi', 'toutiao', 'dianping',
] as const satisfies readonly ContentPlatform[];

/** china 市场 10 引擎（PRD §6.2，含小红书点点）。 */
export type ChinaEngine =
  | 'baidu_ai'              // 百度AI
  | 'doubao'               // 豆包
  | 'tencent_yuanbao'      // 腾讯元宝
  | 'deepseek'             // DeepSeek
  | 'tongyi_qwen'          // 通义千问
  | 'kimi'                 // Kimi
  | 'wenxin'               // 文心一言 / 文小言
  | 'zhipu'                // 智谱清言
  | 'tencent_hunyuan'      // 腾讯混元
  | 'xiaohongshu_diandian'; // 小红书点点

export const CHINA_ENGINES = [
  'baidu_ai', 'doubao', 'tencent_yuanbao', 'deepseek', 'tongyi_qwen',
  'kimi', 'wenxin', 'zhipu', 'tencent_hunyuan', 'xiaohongshu_diandian',
] as const satisfies readonly ChinaEngine[];

/** 可达性等级：√ 一手直通 / △ 开放 web 间接 / × 结构性不覆盖（§2 图例）。 */
export type Reachability = 'direct' | 'indirect' | 'none';

export type EnginePriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ChinaEngineMeta {
  /** 中文展示名（报告 / evidence 用）。 */
  name: string;
  vendor: string;
  /** search 后端（§1.3 / §6.2）。 */
  searchBackend: string;
  priority: EnginePriority;
  /** 生态独占源（§6.2 / §2 takeaway）——投放这些平台才能直通该引擎。 */
  nativeSources: string;
  /** §1.3 一手来源可信度。 */
  confidence: 'high' | 'mid' | 'low';
}

/** §1.3 后端事实表（8 主流 LLM + 百度AI + 小红书点点 = §6.2 的 10 引擎）。 */
export const CHINA_ENGINE_META: Record<ChinaEngine, ChinaEngineMeta> = {
  baidu_ai: {
    name: '百度AI', vendor: '百度', searchBackend: '百度搜索', priority: 'P0',
    nativeSources: '百家号强偏好', confidence: 'high',
  },
  doubao: {
    name: '豆包', vendor: '字节跳动', searchBackend: '头条搜索 + 抖音多模态搜索', priority: 'P0',
    nativeSources: '抖音 + 今日头条号', confidence: 'high',
  },
  tencent_yuanbao: {
    name: '腾讯元宝', vendor: '腾讯', searchBackend: '微信搜一搜 + 搜狗搜索', priority: 'P0',
    nativeSources: '微信公众号 + 视频号', confidence: 'high',
  },
  deepseek: {
    name: 'DeepSeek', vendor: '深度求索', searchBackend: '博查 AI Search（第三方聚合，开放 web）', priority: 'P1',
    nativeSources: '仅开放 web', confidence: 'high',
  },
  tongyi_qwen: {
    name: '通义千问', vendor: '阿里巴巴', searchBackend: '夸克搜索（UC/夸克生态）', priority: 'P1',
    nativeSources: '开放 web + UC 生态', confidence: 'mid',
  },
  kimi: {
    name: 'Kimi', vendor: '月之暗面', searchBackend: '官方未公开（社区指向博查/Bing 系 + 自建抓取）', priority: 'P1',
    nativeSources: '知乎/公众号/小红书/B站（均二手）', confidence: 'mid',
  },
  wenxin: {
    name: '文心一言 / 文小言', vendor: '百度', searchBackend: '百度搜索', priority: 'P1',
    nativeSources: '强偏百家号', confidence: 'high',
  },
  zhipu: {
    name: '智谱清言', vendor: '智谱 AI', searchBackend: '多引擎可选（默认本表按 search_pro_sogou 通道）', priority: 'P2',
    nativeSources: '选 sogou → 腾讯生态 + 知乎', confidence: 'high',
  },
  tencent_hunyuan: {
    name: '腾讯混元', vendor: '腾讯', searchBackend: '同元宝（搜一搜 + 搜狗）', priority: 'P2',
    nativeSources: '同元宝（公众号 + 视频号）', confidence: 'high',
  },
  xiaohongshu_diandian: {
    name: '小红书点点', vendor: '小红书', searchBackend: '小红书内置', priority: 'P3',
    nativeSources: '小红书站内池（仅站内内容）', confidence: 'mid',
  },
};

/**
 * §2 内容平台 × LLM 引用能力交叉表。
 * REACHABILITY[engine][platform] = direct(√) | indirect(△) | none(×)。
 *
 * 数据来源：methodology §2 八列（豆包/DeepSeek/千问/元宝/Kimi/文小言/智谱/混元）转置；
 * 百度AI 后端=百度搜索，按 §1.3 与文心一言同栈，镜像 wenxin 行；
 * 小红书点点后端=小红书内置，仅站内可达（小红书 direct，其余 none）。
 */
const D: Reachability = 'direct';
const I: Reachability = 'indirect';
const N: Reachability = 'none';

/** 平台顺序与 CONTENT_PLATFORMS 一致，便于人工核对行向量。 */
function row(vals: readonly Reachability[]): Record<ContentPlatform, Reachability> {
  const out = {} as Record<ContentPlatform, Reachability>;
  CONTENT_PLATFORMS.forEach((p, i) => { out[p] = vals[i]; });
  return out;
}
//                       official wechat_oa channels douyin xhs  bili zhihu baijia souhu wangyi toutiao dianping
export const REACHABILITY: Record<ChinaEngine, Record<ContentPlatform, Reachability>> = {
  baidu_ai:             row([D,       N,        N,       N,     N,   N,   N,    D,     I,    I,     N,      N]),
  wenxin:               row([D,       N,        N,       N,     N,   N,   N,    D,     I,    I,     N,      N]),
  doubao:               row([I,       N,        N,       D,     N,   N,   N,    N,     N,    N,     D,      N]),
  tencent_yuanbao:      row([I,       D,        D,       N,     N,   N,   I,    N,     I,    I,     N,      N]),
  tencent_hunyuan:      row([I,       D,        D,       N,     N,   N,   I,    N,     I,    I,     N,      N]),
  deepseek:             row([D,       I,        N,       N,     I,   I,   I,    I,     I,    I,     N,      I]),
  tongyi_qwen:          row([D,       N,        N,       N,     N,   N,   N,    N,     I,    I,     N,      N]),
  kimi:                 row([D,       I,        N,       I,     I,   I,   I,    I,     I,    I,     I,      I]),
  zhipu:                row([D,       D,        I,       N,     N,   N,   D,    N,     I,    I,     N,      N]),
  xiaohongshu_diandian: row([N,       N,        N,       N,     D,   N,   N,    N,     N,    N,     N,      N]),
};

/**
 * §6.3 国内 bot UA 清单（robots.txt 核查用，自包含 PRD §9.1 item 4）。
 * 仅含"开放 web 抓取型"bot——平台原生内容（公众号/抖音/视频号）走平台索引，
 * 不受 robots 控制（§6.3 D5 提示），故不在 robots 核查范围内。
 *
 * DeepSeek（博查）/ Kimi（自建/Bing 系）无稳定公开 UA，走通用开放 web 爬虫
 * （Bingbot/Googlebot，见 §6.1 国际清单），此处以 caveat 记录，不单列伪 UA。
 */
export interface ChinaBot {
  ua: string;
  /** 该 bot 喂给哪些 china 引擎的开放 web 后端。 */
  engines: ChinaEngine[];
  note: string;
}

export const CHINA_BOTS: readonly ChinaBot[] = [
  { ua: 'Baiduspider',      engines: ['baidu_ai', 'wenxin'],
    note: '百度搜索（百度AI / 文心一言后端）' },
  { ua: 'Bytespider',       engines: ['doubao'],
    note: '字节头条搜索（豆包开放 web 补充；抖音/头条号原生不受 robots 控制）' },
  { ua: 'Sogou web spider', engines: ['tencent_yuanbao', 'tencent_hunyuan', 'zhipu'],
    note: '搜狗搜索（腾讯元宝/混元 + 智谱选 sogou 通道）' },
  { ua: 'YisouSpider',      engines: ['tongyi_qwen'],
    note: '神马/夸克搜索（通义千问后端）' },
];

/** DeepSeek/Kimi 开放 web 可达性依赖通用国际爬虫，robots 核查兜底说明。 */
export const OPEN_WEB_FALLBACK_NOTE =
  'DeepSeek（博查）/ Kimi（自建/Bing 系）无稳定公开中文 bot UA，其开放 web 可达性依赖通用爬虫（Bingbot/Googlebot），robots 核查请并看国际 bot 清单。';
