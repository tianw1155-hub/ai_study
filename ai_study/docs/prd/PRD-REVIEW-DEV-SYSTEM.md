# DevPilot 系统框架 PRD 评审报告

> 评审人：开发工程师视角 | 评审日期：2026-03-28 | 评审文件：PRD-DevPilot-SYSTEM.md v0.1

---

## 综合判定

**需要修改** — 架构方向可行，但存在多个 P0/P1 级模糊点和安全隐患，需要在详细设计阶段明确，否则后续重构成本极高。

---

## 一、技术可行性评审

### 1.1 Go + Gin + Temporal + Python Agent 分层

**结论：方向正确，通信机制不清晰。**

分层思路合理：Go 负责控制面（HTTP/WebSocket/认证），Python 负责 LLM 执行面（LangGraph 状态机）。但文档缺失关键设计：**Go 接入层如何触发 Temporal Workflow？Python Agent 是 Temporal Worker 还是独立服务？**

当前理解有两种可能的架构：
- **方案 A**：Go API 调用 Temporal SDK 提交 Workflow，Python Agent 作为 Temporal Worker 接收 Task
- **方案 B**：Python Agent 是独立服务，Go API 通过消息队列或 HTTP 调用驱动

方案 A 更合理，但需要明确：
- Python Agent 作为 Temporal Worker，其注册和生命周期管理谁负责？
- 一个 Workflow 内如何协调 PM/Dev/Test 三个 Agent 的顺序和数据传递？（Temporal Activity 之间如何共享 LLM 中间结果？）
- 如果 Python Agent 崩溃，Temporal 的 Activity 重试机制能覆盖吗？（Python 进程级崩溃不在 Temporal 控制范围内）

### 1.2 Vercel / Render 预览部署

**结论：存在冷启动和用量限制风险，MVP 可用，生产环境需评估。**

| 风险点 | 说明 |
|--------|------|
| Render 免费实例休眠 | 免费实例 90 分钟无活动自动休眠，首次请求冷启动需 30-60s，对"一键预览"体验影响较大 |
| Vercel 构建分钟数限制 | Hobby 计划每月 100 小时构建时间，团队协作场景容易超标 |
| 预览环境状态持久化 | 预览环境无持久化存储，刷新页面后数据是否丢失？ |
| 并发预览数限制 | 如果用户同时有多个 PR，MVP 是否支持多预览环境并行？ |

建议：预览部署作为 MVP 核心卖点，需在 Ops Agent PRD 中明确定义兜底方案（如构建失败重试、冷启动超时告警）。

### 1.3 Docker Compose 单机部署

**结论：4核8G 资源配置偏紧，P1 风险。**

粗略资源估算：

| 组件 | 估算内存 |
|------|---------|
| PostgreSQL | 512MB - 1GB |
| Temporal (SQLite/Postgres) | 256MB |
| Go API | 256MB |
| Python Agent × 1 | 512MB - 1GB |
| Python Agent × 2 (并发场景) | 1-2GB |
| **合计** | **2.5GB - 4.5GB** |

4核8G 勉强够用，但无冗余。如果 Python Agent 内存占用超预期（LLM 调用期间 Python 进程内存会膨胀），可能触发 OOM。建议：
- 最低要求提升至 8核16G
- 或在详细设计中明确标注内存限制和 OOM 处理策略

---

## 二、架构设计评审

### 2.1 Split Tier 架构

**结论：层级清晰，但跨层数据流定义不足。**

当前架构：
```
用户层 → Go+Gin → Temporal → Python Agent → LLM Gateway
```

问题：
- **WebSocket 实时推送**：用户看到"实时动态流"，数据从 Python Agent → Go API → WebSocket，这条通路没有设计。如果 Python Agent 和 Go API 无直接通信通道，实时流无法实现。
- **Workflow 状态如何回传给 Go API**：Kanban 看板显示任务状态，Temporal 的状态变更如何同步到 PostgreSQL？Temporal 有 Query API，但 Python Agent 的 Task 状态是否写入 PostgreSQL？两份状态如何保持一致？
- **Ops Agent 的位置**：架构图列出 Ops Agent，但分层架构中未见其位置。Ops Agent 负责触发 Vercel/Render，是作为独立 Python Agent 还是 Go 服务？

### 2.2 Temporal 任务编排

**结论：适合场景，但 Workflow DAG 设计需要提前定义。**

Temporal 的核心价值（状态持久化 + 失败重试 + DAG）在 DevPilot 场景完全适用。但需要确认：
- PM → Dev → Test 是严格的线性依赖还是允许部分并行？（复杂需求 Dev 和 Test 可能有重叠）
- 每个 Agent 内部的子步骤（如 Dev Agent 的"生成代码" → "自测" → "创建 PR"）是否也用 Temporal Activity 实现？
- Temporal Workflow 的最大执行时长：复杂需求可能超过 2 小时，Temporal 默认 7 天 retention，但 PostgreSQL 作为 Temporal 后端时，长时运行 Workflow 的状态大小是否有限制？

### 2.3 PostgreSQL 元数据 + GitHub 代码存储边界

**结论：基本清晰，部分边界模糊。**

| 内容 | 存储位置 | 明确性 |
|------|---------|--------|
| 需求正文（MoSCoW、状态） | PostgreSQL | ✅ 清晰 |
| PRD 正文 | GitHub `docs/prd/` | ✅ 清晰 |
| 产物代码 | 用户个人仓库 | ✅ 清晰 |
| Agent 执行日志 | PostgreSQL（30天） | ⚠️ 模糊：日志量大时如何存储？是否有归档策略？ |
| Workflow 执行状态 | Temporal（内存/DB） | ❌ 未定义：Kanban 状态是否依赖 Temporal Query API？ |
| 用户 Key（透传） | 不存储 | ⚠️ 模糊：LLM Gateway 如何在不存储的情况下使用用户 Key？ |

---

## 三、LLM 方案评审

### 3.1 用户自配 Key + 平台内置免费模型安全性

**结论：安全性声称与实现之间存在缺口，P1 风险。**

文档声称"平台不存储用户 Key，仅在请求时透传"，但这个说法在技术上有问题：

**问题 1：LLM Gateway 如何实现"不存储 Key"？**

如果 Go 层是 Gateway：
- 每次请求需要从用户侧获取 Key → 转发给 LLM API → 不存储
- 但 Go Gateway 进程重启后 Key 丢失，用户需要重新输入
- 如果前端每次请求都带 Key，Key 会出现在日志、审计表、APM 中

**问题 2：Temporal Worker 如何获取用户 Key？**

Python Agent（Temporal Worker）处理请求时需要调用 LLM，如果 Key 不存在，Worker 如何拿到 Key？
- 如果 Key 放在 Workflow Input 里随着每个 Activity 传递 → Key 会写入 Temporal Event History（持久化在 PostgreSQL）
- 这相当于存储了用户 Key，与"不存储"矛盾

**问题 3：平台内置免费模型（DeepSeek/Gemini）的 Key 由谁管理？**

平台集成 DeepSeek-V3，平台必须持有 DeepSeek API Key：
- 这个 Key 是平台的，放在 LLM Gateway 环境变量中 → 可接受
- 但需要明确：DeepSeek 免费额度用完怎么办？是否会自动切换模型？

**建议**：
- 如果要真正"不存储"用户 Key，正确的架构是：前端 → Go Gateway → 用户浏览器直连 LLM API（OAuth 授权转发）。但这会引入 CORS、身份验证等复杂问题。
- 更现实的方案：用户 Key 加密存储（而非不存储），并在 Temporal Workflow History 中不记录明文 Key。
- 当前方案在 MVP 阶段可用，但需在安全设计文档中明确说明限制和缓解措施。

### 3.2 LLM Gateway 设计

**结论：设计过于简化，存在多个安全隐患。**

缺失的关键设计：

| 问题 | 风险等级 | 说明 |
|------|---------|------|
| **无 API Key 隔离** | P0 | 不同用户的 Key 是否在同一个 Gateway 实例处理？如是，用户 A 的 Key 可能被用于用户 B 的请求（逻辑 Bug） |
| **无用量/配额控制** | P0 | 用户自配 Key 情况下，平台无法控制用户消耗速度。GPT-4 按 token 计费，用户一条大需求可能产生数百元账单 |
| **无 Prompt 审计** | P1 | 所有用户请求经过同一 Gateway，无法审计恶意 Prompt（如 prompt injection） |
| **无模型降级策略** | P1 | DeepSeek/Gemini 免费模型不可用时（API 故障、配额耗尽），系统是否自动降级？降级到哪个模型？ |
| **无请求超时和熔断** | P1 | LLM API 超时 5 分钟（文档提到），但 Gateway 层面是否有熔断器防止级联故障？ |
| **Key 轮转/刷新机制** | P2 | 用户更换 Key 后，旧 Key 的并发请求如何处理？ |

---

## 四、风险点评审

### 4.1 后期难以修改的设计决策

| 决策 | 后期修改成本 | 说明 |
|------|-------------|------|
| **Temporal 作为任务编排核心** | 极高 | 业务逻辑与 Temporal Workflow 深度耦合，迁移到其他编排引擎（如 Airflow/Step Functions）几乎等于重写 |
| **PostgreSQL 元数据 + GitHub 代码双存储** | 高 | 涉及到两个系统的数据一致性，如后期迁移到对象存储（如 S3）或切换代码平台（如 GitLab），需要数据迁移工具 |
| **LLM Gateway 路由逻辑** | 高 | 多模型路由、用户 Key 隔离、计费逻辑均在内，后期换 Gateway 框架影响面大 |
| **单租户固定 tenant_id="1"** | 中 | 当前 hardcode 为 "1"，后续扩展多租户需要大量 WHERE clause 回填，需提前设计 tenant_id 可配置化 |

### 4.2 潜在技术债务

| 技术债务 | 显现时间 | 说明 |
|---------|---------|------|
| **Python Agent 内存泄漏** | 上线 1-2 周 | LangGraph + LLM SDK 在长期运行后内存膨胀，需要定期重启 Worker。MVP 应设计健康检查和自动重启 |
| **Temporal Event History 膨胀** | 并发量上升后 | 每个 Workflow 的所有 Event 持久化在 PostgreSQL，大型 Workflow 的 History 可能达数百 MB，需要定期归档 |
| **GitHub API 速率限制** | 用户量 > 10 后 | GitHub REST API 速率限制 5000 req/hour（认证后），Ops Agent 创建 PR + 触发预览可能耗尽配额 |
| **预览环境清理机制缺失** | 用户量上升后 | 用户 PR 合并/关闭后，Vercel/Render 预览环境是否自动删除？长期积累造成资源浪费和成本问题 |
| **日志无结构化** | 排障时 | PostgreSQL `exec_logs` 表存原始文本日志，Python Agent 的工具调用记录（JSON）如何存储和查询？需要 JSONB + 索引 |
| **无数据库迁移工具** | 任何 schema 变更时 | Flyway / Goose 未引入，schema 变更需要手动执行 |

### 4.3 业务逻辑风险

| 风险 | 等级 | 说明 |
|------|------|------|
| **AI 生成代码质量不可控** | P0 | Dev Agent 生成的代码可能包含安全漏洞（SQL injection、XSS 等），MVP 无自动安全扫描，Test Agent 也仅生成测试用例 |
| **需求描述模糊导致循环重试** | P1 | 如果用户需求描述不清晰，PM Agent 可能反复生成错误的 PRD，触发 Temporal 重试风暴 |
| **GitHub OAuth 权限过大** | P1 | MVP 要求 `repo` 权限（完整读写），但实际只需要 `repo:write`（代码写入）和 `workflows`（触发 Actions） |
| **复杂需求超时处理** | P1 | 单次 LLM 调用超时 5min + 重试 2 次，但复杂需求的完整 Workflow 可能持续数小时，超时后用户如何感知？ |

---

## 五、具体问题列表

### P0（阻塞 MVP 发布）

1. **Python Agent 与 Go API 的通信机制未定义**
   - 实时动态流（WebSocket）和 Kanban 状态更新依赖跨服务通信，但文档未说明
   - 影响：前端无法实现实时推送

2. **用户 Key 的 Temporal Workflow History 泄露风险**
   - 如果 Key 放在 Workflow Input，每个 Activity 重试都会携带 Key，且 Key 写入 Temporal Event History（PostgreSQL）
   - 影响：用户 Key 实际被持久化，与"不存储"承诺矛盾

3. **API Key 无用量配额控制**
   - 用户自配 Key 情况下，平台无法限制用户消耗量，存在账单超支风险
   - 影响：用户可能收到远超预期的 LLM 账单

### P1（影响开发，需尽快明确）

4. **Docker Compose 单机 4核8G 资源配置偏紧**
   - Python Agent 并发时内存可能超限
   - 影响：上线后可能频繁 OOM

5. **LLM Gateway 缺少熔断和降级策略**
   - DeepSeek/Gemini 不可用时无自动切换机制
   - 影响：单点故障导致整平台不可用

6. **GitHub OAuth 权限过宽**
   - 当前要求 `repo` 完整权限，实际仅需写入权限
   - 影响：用户信任度降低，可能拒绝授权

7. **预览环境无清理机制**
   - PR 关闭后 Vercel/Render 预览环境持续占用资源
   - 影响：长期积累造成不必要成本

8. **Temporal Workflow 状态与 PostgreSQL 状态双写问题**
   - Kanban 看板状态来源不明确（Temporal Query vs PostgreSQL）
   - 影响：两份状态不一致时用户看到错误的进度

### P2（影响开发效率，纳入后续迭代）

9. **无数据库迁移工具（Flyway/Goose）**
   - Schema 变更需要手动执行，增加团队协作风险

10. **exec_logs 表无结构化存储**
    - Agent 执行日志为文本，JSON 格式的工具调用记录无法索引和查询

11. **无 Python Agent 健康检查和自动重启**
    - 长期运行内存泄漏未处理

12. **复杂需求 DAG 拆分逻辑未定义**
    - "自动拆分为多条子需求"没有说明拆分粒度和依赖管理

---

## 六、技术建议

### 6.1 立即明确（详细设计前）

| 事项 | 建议方案 |
|------|---------|
| Go ↔ Python Agent 通信 | 方案 A（推荐）：Python Agent 作为 Temporal Worker，Go API 通过 Temporal Client 提交 Workflow。实时推送通过 Go 订阅 Temporal Query/Heartbeat 实现 |
| 用户 Key 安全传递 | Workflow Input 只传用户 Key 的引用（如 `key_id`），Python Worker 从加密的 Key Store（如 Vault）获取实际 Key |
| 状态来源统一 | Kanban 状态以 PostgreSQL 为单一数据源，Temporal Workflow 执行完成后写入 PostgreSQL，不依赖 Temporal Query API |

### 6.2 MVP 可用，但需记录技术债

| 事项 | 建议 |
|------|------|
| 资源规划 | 开发测试用 8核16G 单机，明确标注 4核8G 为最低兼容配置 |
| GitHub 权限 | OAuth 申请时明确只申请 `repo:write` 权限 |
| 预览环境清理 | 在 Ops Agent PRD 中设计 PR 关闭后自动触发删除 Webhook |

### 6.3 长期建议

| 建议 | 理由 |
|------|------|
| 引入 Redis 作为 Temporal 辅助存储 | 解决 Workflow 状态共享和实时推送问题 |
| 考虑 Temporal Cloud 或自托管 Temporal Cloud | 减少运维复杂度，避免 PostgreSQL 作为 Temporal 后端的扩展性问题 |
| LLM Gateway 引入 API 治理层（如 APISIX） | 在 Gateway 层面统一处理配额、审计、熔断，而不是在应用层实现 |

---

## 七、附录：评审结论汇总

| 维度 | 判定 | 主要问题 |
|------|------|---------|
| 技术可行性 | ⚠️ 需要修改 | Python/Go 通信机制缺失，资源配置偏紧 |
| 架构设计 | ⚠️ 需要修改 | Split Tier 跨层数据流不完整，状态管理有歧义 |
| LLM 方案 | ❌ 拒绝（当前设计） | Key 安全声称与实现矛盾，Gateway 安全漏洞 P0 级 |
| 风险可控性 | ⚠️ 需要修改 | P0 问题需在详细设计前解决，否则后期重构成本极高 |

**综合建议：暂不通过技术评审，聚焦 P0 问题（Go↔Python 通信、Key 安全、API 配额）的架构方案补充后再次评审。**

---

*评审完成。建议在进入各 Agent 详细 PRD（如 PRD-PM-Agent）之前，先输出一份《DevPilot 架构补充方案》明确上述 P0/P1 问题。*
