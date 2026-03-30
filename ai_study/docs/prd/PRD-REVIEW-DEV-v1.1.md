# PRD-001 v1.1 开发工程师评审报告

| 字段 | 内容 |
|------|------|
| **评审版本** | v1.1 |
| **评审日期** | 2026-03-24 |
| **评审角色** | 开发工程师 |
| **评审轮次** | 第二轮 |
| **评审结论** | ⚠️ 需要修改（2 个新增 P0 问题） |

---

## 一、上一轮 P0 问题修复情况

| # | 原问题 | 修复状态 | 评审意见 |
|---|--------|----------|----------|
| 1 | 技术栈不匹配（Python → Go + Temporal） | ✅ **已修复** | Section 5.1 明确定义：Go + Temporal 负责编排，Python + LangGraph 负责 Agent，LLM Gateway 独立 Python 服务。架构清晰。 |
| 2 | SQLite 并发缺陷 → PostgreSQL | ✅ **已修复** | Section 5.3 提供完整 PostgreSQL Schema，含 requirements/tasks/agent_logs/hil_confirmations 表，JSONB 字段用于共享上下文，索引设计合理。 |
| 3 | Sprint 0 工时低估 | ✅ **已修复** | Section 6.2.1 已重估算：4d → **6-7d**。GitHub API 估了 2-3d，Temporal 调试新增 1d，单需求串联新增 1d。修订理由充分。 |

---

## 二、v1.1 新增 / 遗留 P0 问题

### ❌ P0-4：LLM Gateway 单点故障，无高可用设计

**严重程度**：P0  
**影响范围**：整个平台

**问题描述**：

Section 5.2 架构图中，LLM Gateway 是所有 Python Agent 调用 LLM 的唯一出口：

```
Python Agent → LLM Gateway → OpenAI/Claude API
```

一旦 LLM Gateway 进程崩溃或重启，所有正在执行任务的 Agent 均会hang住，直到 Temporal Activity 超时（默认 10 分钟）。

**为什么是 P0**：这等同于所有 Agent 的"神经网络"被拔掉。平台核心价值（AI 自动完成端到端交付）完全依赖这个单点。

**建议修复**（二选一）：

1. **轻量方案（MVP 可接受）**：Agent 侧实现 LLM API 直通 + Gateway 作为可选代理。Gateway 挂掉时，Agent 自动切换到直连 OpenAI/Claude，附带降级日志。
2. **生产方案**：LLM Gateway 做成双实例 + 负载均衡，Gateway 内部实现模型无关的 Client，当主实例故障时 Temporal 自动调度到备实例。

**验收标准**：杀掉 LLM Gateway 进程，已运行的任务在 ≤ 2 分钟内检测到失败并重试。

---

### ❌ P0-5：部署基础设施未定义（生产环境跑在哪？）

**严重程度**：P0  
**影响范围**：Sprint 3+ 生产部署

**问题描述**：

Section 5.5 "部署方案" 只描述了"Docker Compose on 云服务器（4核8G最低）"，但：

- 云服务器是哪家？AWS / 阿里云 / 腾讯云 / 华为云？
- 是否有明确的主机规格、存储、网络要求？
- 预发布和生产是否共用一套资源？如何隔离？
- Temporal 高可用（Section 5.5 提到）需要 PostgreSQL 高可用+多 Worker，基础设施如何保障？

**为什么是 P0**：Sprint 3 明确要"预发布环境部署"和"生产上线"，但 PRD 没有定义服务器资源要求。团队可能在 Sprint 3 才发现没有可用基础设施，导致整个计划延期。

**建议修复**：

在 Section 5.5 增加一张"基础设施规划表"：

| 环境 | 资源配置 | 服务部署 | 备注 |
|------|----------|----------|------|
| 开发环境 | 本地/Docker Compose | Go + Temporal + Python Agent + PostgreSQL（all in one） | ngrok 暴露飞书 Webhook |
| 预发布环境 | 1 台云服务器（4核8G） | Docker Compose，同一套内不同容器 | 生产账号飞书 Bot |
| 生产环境 | ≥2 台云服务器（4核8G × 2，负载均衡） | Docker Compose + PostgreSQL 主从流复制 | Temporal 多 Worker |

---

## 三、技术评审详情

### 1. 技术栈 ✅ 通过

Go + Temporal + PostgreSQL + LangGraph + go-lark，技术栈选型合理，理由充分（Section 5.1 对 AutoGen/FastAPI 的对比也有记录）。

### 2. Split Tier 架构 ✅ 通过（附建议）

架构设计合理，Go/Python 分层通过 Temporal Activity 解耦是正确的方向。

**附加建议（非阻塞）**：
- Section 5.4.1 "服务间通信"提到 Temporal Worker → Python Agent 通过 gRPC/HTTP，建议明确选型。推荐 **gRPC**（Schema 强定义，版本兼容更好）。
- Python Agent → PostgreSQL 直接连接（Sect 5.4.1），在 Split Tier 下合理，但需确保 Python Agent 的连接池配置（Psycopg2 pool）由 Go 侧 config.yaml 统一管理。

### 3. Sprint 0 重估算 ✅ 通过

6-7d 的估算覆盖了关键路径（GitHub API 2-3d + Temporal 1d + 串联 2d）。风险点识别正确（Temporal 调试、Temporal Webhook 本地调试）。

### 4. 其他观察 ⚠️（非 P0，供 PM 参考）

| 项目 | 描述 | 优先级 |
|------|------|--------|
| Sect 5.4 目录结构 | `agent/llm_gateway/` 和 `agent/tools/` 与 `agent/agents/` 并列，命名上容易混淆（一个是服务，一个是目录）。建议 `agent/services/llm_gateway/` 统一 | 低 |
| Sect 5.3 HiL 超时策略 | 提到 72h 无响应升级通知，但没说谁来接收升级通知（飞书？短信？）。建议明确 | 中 |
| Sect 6.3 Sprint 1 | 串联测试只测 10 条需求，建议至少 20 条，覆盖边界类型（超长需求、无明确功能点的需求） | 低 |
| 数据库迁移 | migrations/ 只有 `001_init.sql`，没有版本管理（Flyway/Liquibase）。建议在附录说明 | 低 |

---

## 四、评审结论

| 章节 | 评审项 | 结论 | 备注 |
|------|--------|------|------|
| 2.1 技术栈 | Go + Temporal + PostgreSQL | ✅ 通过 | 架构清晰，选型理由充分 |
| 2.2 Split Tier 架构 | Go/Python 分层 | ✅ 通过 | 有附加建议（gRPC 选型明确） |
| 2.3 Sprint 0 工时 | 6-7d 重估算 | ✅ 通过 | 覆盖关键路径，风险识别到位 |
| 2.4 新增 P0 | LLM Gateway 单点 | ❌ 拒绝 | P0-4：需补充高可用/降级方案 |
| 2.5 新增 P0 | 部署基础设施 | ❌ 拒绝 | P0-5：需补充生产环境基础设施规划 |

**总体结论**：⚠️ **需要修改**

v1.1 相比 v1.0 有显著改进，3 个原 P0 问题均已正确修复。但新发现 2 个 P0 级别问题（P0-4 基础设施单点、P0-5 部署目标未定义），需要 PM 补充后才能进入研发阶段。

---

*评审人：开发工程师 Subagent | 评审时间：2026-03-24*
