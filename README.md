# Prism（棱镜）— Daimonia GEO 审计工具

Prism 是 Daimonia 的生成式引擎优化（GEO）审计工具。输入一个网站 URL + 目标市场，输出 D1–D5 五维度评分报告 + 整改清单。

## 架构

```
前端形态层 → /prism-geo-audit skill (MVP) / 官网功能页 (Phase 2)
                ↓ 统一接口 auditLight(input)
Prism Core  → Collector → Analyzer → Scorer/Reporter
                ↓
采集工具层 → HTTP fetch · robots/sitemap · HTML/JSON-LD · CWV
```

Core 与前端形态解耦，共享同一审计引擎。详见 `docs/prd_v1.md` §8。

## 快速开始

MVP 阶段以 skill 形态交付：

```bash
/prism-geo-audit https://example.com --market international
```

## 文档

- [PRD v1.1](docs/prd_v1.md) — 产品需求文档（已通过 King review）
- 方法论 source of truth：`geo_audit_standard.md` v0.5.1

## 项目结构

```
src/
├── core/        # AuditReport schema + Scorer/Reporter (T2)
├── collector/   # 采集工具层 (T3)
└── analyzer/    # D1-D5 检查项 → CheckResult (T4)
skill/           # /prism-geo-audit SKILL.md + 渲染 (T5)
tests/           # 验收用例集 (T6)
docs/            # PRD 与设计文档
```

## 许可证

Proprietary — Daimonia AI 内部项目。
