# 架构文档

本目录包含系统架构设计相关文档。

## 目录结构

```
architecture/
├── ADR/                    # 架构决策记录
│   ├── README.md           # ADR 索引
│   ├── ADR-001-xxx.md      # 具体决策
│   └── ADR-002-xxx.md
├── docs/                   # 架构文档
│   ├── system-architecture.md       # 系统架构概览
│   ├── mvp-technical-solution.md     # MVP 技术方案
│   ├── tech-selection-report.md      # 技术选型报告
│   └── coding-standards-go.md        # Go 编码规范
└── diagrams/               # 架构图 (Mermaid/PNG)
```

## 核心文档

| 文档 | 描述 |
|------|------|
| system-architecture.md | 系统架构概览图、Clean Architecture 分层 |
| mvp-technical-solution.md | MVP 范围、技术选型、API 设计、数据库设计 |
| tech-selection-report.md | 技术选型矩阵、成本估算、风险评估 |
| coding-standards-go.md | Go 编码规范、命名规范、错误处理、日志规范 |

## 架构原则

基于 Martin Fowler《Clean Architecture》:

1. **依赖倒置**: 外层依赖内层，内层不关心外层实现
2. **单一职责**: 每个模块只有一个变化原因
3. **接口分离**: 多个小接口优于一个大接口
4. **无环依赖**: 禁止模块间的循环依赖

基于 Frederick Brooks《人月神话》:

1. **概念完整性**: 整个系统风格统一
2. **没有银弹**: 没有完美方案，只有最适合当前阶段的方案
3. **第二系统效应**: 避免 MVP 阶段过度设计

## ADR 生命周期

```
草稿 → 已接受 → 已废弃/已替换
```

## 更新日志

| 日期 | 更新内容 | 更新人 |
|------|----------|--------|
| 2026-03-22 | 初始版本 | 架构 Agent |
