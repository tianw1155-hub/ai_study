# ADR-003: 架构模式选择

**状态**: 已接受  
**日期**: 2026-03-22  
**决策者**: 架构团队

---

## 背景/问题陈述

MVP 需要一个可持续维护的代码架构。但面临以下约束：
- 团队可能无架构经验
- 一周时间紧迫
- 后期可能扩展团队

问题：如何在快速交付和长期可维护性之间取得平衡？

---

## 候选方案

### 方案 A: 传统三层架构

```
Controller → Service → Repository
```

| 优点 | 缺点 |
|------|------|
| 简单易懂 | 业务逻辑容易渗入 Service 层 |
| 上手快 | 难以测试 |
| 适合小项目 | 后期难以扩展 |

### 方案 B: Clean Architecture

```
Interface → Application → Domain → Infrastructure
```

| 优点 | 缺点 |
|------|------|
| 职责清晰 | 学习成本 |
| 易于测试 | 代码量增加 |
| 可扩展 | 需要 discipline |

### 方案 C: 简化 Clean Architecture (MVP 选用)

保留核心分层，但简化文件夹结构。

```
handler → service → domain
           ↓
        repository
           ↓
       infrastructure
```

---

## 决策

**选择方案 C: 简化 Clean Architecture**

### 决策理由

1. **平衡速度和可维护性**: 保留核心分层理念，但减少不必要的复杂性
2. **渐进式采用**: 团队可以逐步引入完整 Clean Architecture 的实践
3. **符合布鲁克斯经验**: MVP 阶段避免"第二系统效应"
4. **腾讯云 SCF 友好**: 函数计算天然适合这种分层

### 分层职责

| 层级 | 职责 | 依赖方向 |
|------|------|----------|
| handler | HTTP 请求处理、参数校验 | service |
| service | 业务逻辑、事务管理 | domain, repository |
| domain | 实体、值对象、领域服务 | 无 (核心) |
| repository | 数据持久化抽象 | infrastructure |
| infrastructure | MongoDB/Redis/COS 实现 | 无 |

### 限制条件

- repository 接口定义在 domain 或 application 层
- 禁止 infrastructure 层反向依赖 domain 层
- 每个 handler 尽量薄，业务逻辑在 service 层

---

## 后果

### 正面

- 分层清晰，职责明确
- 易于单元测试
- 便于后续扩展
- 与 Go 语言的 interface 机制天然契合

### 负面

- 比单文件代码复杂
- 需要开发者理解分层原则
- 文件数量增加

---

## 后续行动

- [ ] 制定详细的文件夹结构规范
- [ ] 创建代码生成模板
- [ ] 编写分层示例代码

---

## 审查记录

| 日期 | 审查结果 | 说明 |
|------|----------|------|
| 2026-03-22 | 接受 | MVP 最优选择 |
