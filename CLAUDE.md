# CLAUDE.md — Prism 项目 Agent 操作约束

本文件定义 AI agent 在 Prism repo 中的不可逾越边界与项目规范。

---

## 项目定位

Prism（棱镜）是 Daimonia 的 GEO 审计工具。详见 `docs/prd_v1.md`。

## 架构原则

### 1. Core 与前端形态解耦

Prism Core（`src/core/`、`src/collector/`、`src/analyzer/`）与前端形态（skill / web）解耦。两个前端只调 `auditLight(input)` 统一接口，不得各自实现采集/打分逻辑。

### 2. 自包含原则

Prism 资产在运行时**不依赖**外部 skill 或 `Daimonia/00_OS/` 路径。所有方法论数据（§5.A Light 流程、D1-D5 检查项、中国后端事实表、引擎 bot UA 清单、report schema + 渲染模板）必须内嵌在 Prism 自身资产中。

方法论升版本时，由人工起 child issue 同步变更进 Prism（见 PRD §13 维护流程）。

### 3. 三阶段解耦

```
Collector（确定性采集，产 RawSiteData）
  → Analyzer（LLM + 规则判断，产 CheckResult）
    → Scorer/Reporter（确定性聚合，产 AuditReport + 渲染）
```

判断逻辑集中在 Analyzer，便于方法论升版本时单点修改。

### 4. 报告契约

- core 永远返回结构化 `AuditReport`（部分失败也返回 partial，见 PRD §10）
- 渲染层只消费 JSON，不重新判断
- JSON 是真源，markdown / HTML 是派生渲染

### 5. Deep 审计架构预留

`auditDeep` 接口已预留同签名扩展点。MVP 不实现，但数据结构（`auditTier`、`notEvaluated`）为 Deep 全自动 agent 预留。不重构现有接口形状。

## 技术栈

- 语言：TypeScript
- 运行时：Node.js
- 外部工具依赖：HTTP fetch、PageSpeed Insights API（key 由维龙管理）、Google Rich Results Test（可选兜底）

## 报告语言

所有报告默认中文（含 international 市场）。见 PRD §14 King 决策 #1。

## 工作语言

代码、标识符、API 路径、命令、URL、ticket id 保留英文。面向人的输出（commit message、issue comment）默认中文。

## 参考

- PRD：`docs/prd_v1.md`（v1.1，已通过 King review）
- 方法论 source of truth：`geo_audit_standard.md` v0.5.1
- 中国 LLM 后端事实层：`llm_search_backend_china.md` v0.1
