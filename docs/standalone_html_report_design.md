# Prism standalone HTML report design v1

> Issue: DAI-1283  
> Owner: 美龙（Aesthetic Manager）  
> Date: 2026-06-03  
> Status: v1 template for T5 integration

## Brief

为 `/prism-geo-audit` MVP 增加客户可分享的 standalone HTML 报告模板。使用场景是 Daimonia 内部交付团队跑完 Light Audit 后，把 `AuditReport` JSON 渲染成可离线打开、可发客户、可存档的单文件报告。硬约束：零外部依赖、内联 CSS、文本可 reflow、渲染层只消费 `AuditReport` JSON、不重新判断逻辑。

## Visual Direction

报告采用“棱镜审计面板”方向：顶部给出总分和风险判断，中段用 5 维雷达图建立扫描记忆，右侧/下方用维度卡片展开问题与整改，底部用 Top3 和 Deep CTA 完成行动闭环。

引用 lens：

- **Hierarchy**：总分、等级、Deep 推荐是第一层；雷达图和 5 维卡片是第二层；证据页、未评估项是第三层，避免客户先陷入细节。
- **Alignment / Grid**：桌面使用 12 栏感的两列 grid，移动端改为单列；所有卡片共享边和统一内边距。
- **60-30-10 配比**：大面积暖白与墨黑承担阅读，青蓝/紫作为 Prism 光谱强调，琥珀只用于风险和 CTA，避免报告变成彩色仪表盘。
- **Progressive Disclosure**：首屏只暴露结论和关键风险，维度卡片中再展开 issues/checks，确保客户能先抓行动重点。

## Tokens

| Token | Value | Usage |
|---|---:|---|
| `--bg` | `#f7f5f0` | 页面底色 |
| `--surface` | `#fffdf8` | 卡片与主体面 |
| `--ink` | `#171717` | 主文本 |
| `--muted` | `#62615d` | 次级文本 |
| `--line` | `#ded8cc` | 分隔线 |
| `--prism-cyan` | `#12a4b6` | D1 / 信息强调 |
| `--prism-blue` | `#3157d5` | D2 / 链接强调 |
| `--prism-violet` | `#7a4bd8` | D3 / 雷达渐变 |
| `--prism-rose` | `#c04777` | D4 / 风险补色 |
| `--prism-amber` | `#d8841f` | D5 / CTA / caution |
| `--ok` | `#237a56` | pass 状态 |
| `--warn` | `#a86412` | partial 状态 |
| `--bad` | `#a83f38` | fail 状态 |
| `--radius-sm` | `8px` | 小控件 |
| `--radius-md` | `16px` | 卡片 |
| `--space-*` | `4/8/12/16/24/32/48/64px` | 间距 scale |

字体系统：优先系统 UI 字体，`font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`；中文由系统 fallback 承接。字号使用 12/14/16/18/24/32/48/64 scale。

## Template Contract

文件：`skill/prism-report-template.html`

T5 集成时只需要替换：

```html
<script id="audit-report-data" type="application/json">
  { ...AuditReport JSON... }
</script>
```

渲染逻辑：

- 读取 `AuditReport` JSON。
- 把 `scores.dimensions.D1-D5` 映射为雷达图、维度卡片、问题列表。
- 把 `topFixes` 映射为 Top3 行动卡。
- 把 `notEvaluated`、`vetoes`、`couplingFlags` 透明展示。
- 不根据原始检查项重新计算 `total`、`level`、`deepAuditRecommended`。

## Responsive Rules

- Desktop `>= 980px`：总览区为两列，左侧结论，右侧雷达图；维度卡片为 responsive grid。
- Mobile `< 760px`：单列，雷达图保持正方形 `min(82vw, 360px)`，Top3 卡片纵向堆叠。
- 文本可自然换行；URL 使用 `overflow-wrap:anywhere`；没有固定高度截断。

## Usage Guidance

合规用法：

- 用真实 `AuditReport` JSON 替换样例数据。
- 报告默认中文，即使 `market=international`。
- 客户分享前保留 `Light · indicative` 与 `notEvaluated` 区块，不能为了好看隐藏局限。

不合规用法：

- 在 HTML renderer 中重新打分或改变 `level`。
- 引入外部字体、CDN CSS、图标库或图片。
- 删除 Deep 审计局限说明，导致客户误以为 Light 是最终结论。

## Tradeoff

v1 使用内联 SVG 雷达图和少量原生 JS，优点是零依赖、可离线、T5 接入成本低；代价是图表表达克制，不做交互 tooltip 和复杂动画。这个取舍符合 MVP 客户交付：可靠性优先于炫技。

