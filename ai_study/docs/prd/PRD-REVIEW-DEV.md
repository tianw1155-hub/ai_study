# PRD 开发评审报告

| 字段 | 内容 |
|------|------|
| **评审文档** | PRD-001-AI开发团队平台.md |
| **评审版本** | v1.0 |
| **评审日期** | 2026-03-24 |
| **评审角色** | 开发工程师 |
| **结论** | **需要修改** |

---

## 综合判定

**结论：需要修改**

PRD 整体思路清晰，产品愿景明确，但在技术选型、架构细节、开发成本估算上存在显著问题。最核心的问题是：**技术栈与团队实际技术栈不匹配**（Go 团队用 Python/FastAPI/LangGraph），以及 **SQLite 并发模型与多 Agent 并发写入场景根本性冲突**。这些问题如果不在开发前解决，后期将产生大量返工。

---

## 一、技术可行性评审

### 1.1 总体技术栈（❌ 严重不匹配）

**问题**：PRD 推荐 Python 3.11+ + FastAPI + LangGraph，但明确提到团队技术栈是 Go。这是一个需要在开发启动前对齐的战略级问题。

| 层级 | PRD 推荐 | Go 替代建议 |
|------|----------|-------------|
| Web 框架 | FastAPI | Gin / Echo / Fiber |
| 多 Agent 框架 | LangGraph | 自研轻量状态机 / Temporal / Conductor |
| 共享上下文 | SQLite | SQLite 仍可用，或 badger（纯 Go KV）|
| 消息推送 | 飞书 Python SDK | 飞书 Go SDK（github.com/chyroc/go-lark）|
| LLM 网关 | LangChain/LangGraph | go-llama.cpp / 自研 OpenAI 兼容接口 |
| ORM | 原生 SQL | GORM / sqlx |

**建议**：
- 如果必须用 Python（LLM 生态优势），接受双技术栈但需要明确 Split Tier：Python 负责 Agent 执行层（LLM 调用），Go 负责 orchestration/持久化/消息接入层。
- 如果要纯 Go，推荐组合：**Gin + Temporal（分布式任务编排）+ go-llama.cpp 本地模型 or OpenAI API**，Temporal 在多 Agent 任务编排上有成熟的生产级方案，比 LangGraph 更适合长期维护。
- **不要在没有充分讨论的情况下假设团队接受 Python MVP**。这个决策影响后续招聘、运维、二次开发。

### 1.2 LangGraph 的实际使用存疑（⚠️ 歧义）

**问题**：5.1 节把 LangGraph 作为"多 Agent 框架"推荐，但 4.3.3 节（编排引擎 MVP）明确定义 MVP 是"线性队列，不做 DAG"。LangGraph 的核心价值在于 DAG 状态机 + 条件分支，MVP 根本用不到它。

这造成歧义：
- Sprint 0 和 Sprint 1 都没有提到 LangGraph 的引入计划
- 如果 MVP 是线性队列，为什么要用 LangGraph？

**建议**：明确 MVP 阶段是否使用 LangGraph。如果用，改为用 LangGraph 实现线性状态机（比手写队列好）。如果不用，不要在 5.1 节放 LangGraph 混淆判断。

### 1.3 SQLite 并发模型（❌ 根本性缺陷）

**问题**：SQLite 是单写多读的嵌入式数据库，**设计目标是嵌入式场景（手机 App、IoT）**，不是多 Agent 并发写入场景。

PRD 中有 3 个 Agent（Dev/Test/Ops）+ 1 个 Orchestrator 同时操作 SQLite：
- 任务状态更新（Orchestrator 写）
- Agent 执行日志写入（多个 Agent 同时写 `agent_logs`）
- HiL 状态更新（HiL handler 写）
- 上下文读写（各 Agent 读 + 写）

SQLite 的 writer lock 会导致：`database is locked` 错误。即使配置了 WAL 模式，在高频写入场景下性能也会严重退化。

Sprint 3 提到"SQLite 连接池"——**SQLite 根本没有真正的连接池概念**，这个任务本身是伪命题。

**建议**：
- MVP 如果坚持 SQLite：写入频率高的 `agent_logs` 表单独处理（异步写入，不阻塞主流程），或者直接用文件 log + 定期 flush
- 更好的方案：PostgreSQL（支持连接池，并发友好），或者用 Go 的话用 Badger KV（纯 Go，高并发）

### 1.4 GitHub API 操作（✅ 实现难度适中）

**评估**：GitHub REST API 操作（创建文件、提交 PR、读写 Wiki）是标准化的，GitHub CLI + PAT 认证，有成熟的 SDK。

主要风险点：
- **PR 创建后自动触发 CI**：GitHub Actions 默认配置下，创建 PR 会自动触发 workflow，这是预期行为，但需要处理"PR 是否 ready for review"的时序问题
- **Wiki API**：GitHub Wiki 没有原生 REST API，只能通过 git clone `repo.wiki.git` 的方式写入，操作复杂度比普通 repo 高，建议 MVP 阶段把交付物写入普通 docs 目录而非 Wiki
- **Rate Limit**：未在 PRD 中提及，GitHub API 无认证 60 req/h，有 PAT 5000 req/h，Agent 密集调用需要加缓存和批量请求
- **代码分支管理**：PRD 说"写入 feature branch"但没说明是哪个分支、PR title 规范、是否需要 Code Review——这些需要明确

---

## 二、架构设计评审

### 2.1 模块拆分（⚠️ 基本合理，有边界模糊）

M1-M10 的拆分总体清晰，但有几处边界问题：

| 问题 | 描述 |
|------|------|
| **M3 vs M7 边界模糊** | Orchestrator（编排引擎）负责任务调度，HiL 负责人工确认。但 HiL 节点是嵌入在任务流中的（HiL#1 在 PM 后，HiL#2 在测试后），这个"节点插入"的逻辑是算 Orchestrator 还是 HiL？如果是 Orchestrator，则 HiL 是其一个功能模块；如果 HiL 独立，则它需要被 Orchestrator 回调。建议明确 HiL 是 Orchestrator 的一个扩展点，而不是独立模块。 |
| **M8 共享上下文的粒度** | PRD 说"每个需求独立的上下文存储"，但没有说明上下文的数据模型。每个需求是一个 namespace？Agent 之间如何做事务性读取（不会读到半写的状态）？这对后续调试非常重要。 |
| **缺少 LLM 网关的具体设计** | M1-M10 里没有模块负责 LLM 调用管理。Retry、Fallback、Cost Log、Model Selection 这些横切关注点需要一个明确的模块，而不是散落在各 Agent 的 Prompt 里。 |

### 2.2 任务队列设计（⚠️ MVP 可以接受，有漏洞）

**MVP 线性队列**：对于 MVP 阶段串行执行，线性队列是正确的选择，简化调试。✅

**但有漏洞**：

1. **失败后重试的任务 ID 不变吗？** 如果 task-001 失败后重试生成的是 task-001-retry 还是新 task-ID？这影响任务去重和依赖图重建。
2. **depends_on 在线性队列里没有实际作用**：PRD 说 MVP 是线性队列，但 task 模型里有 `depends_on` 字段，这两个设计是矛盾的——要么删掉 `depends_on`（MVP 确实不需要），要么就承认 MVP 设计是伪线性（实际还是按顺序执行但保留依赖扩展能力）。
3. **没有任务取消机制**：老板在中途说"停"，系统如何处理正在执行的任务？Agent 执行的 LLM 调用无法中止（HTTTP 请求一旦发出只能等超时），这个问题在 MVP 就存在，但 PRD 没有提到。

### 2.3 目录结构（✅ 基本合理）

`src/` 下的模块划分和 PRD 的 M1-M10 能对应上。几点建议：

- `src/integrations/github.py` **单独一层是好的**，但飞书/TG/GitHub 三个外部集成都堆在一起，建议拆成 `src/integrations/feishu/` / `src/integrations/github/` 各成包
- 缺少 `src/config.py`——配置加载应该是顶层模块，不应该每个模块各自读 `config.yaml`
- 建议增加 `src/llm/` 包统一管理 LLM 调用（retry、fallback、cost tracking）

---

## 三、开发成本评审

### 3.1 Sprint 0 估算（⚠️ 部分低估）

| 任务 | PRD 估算 | 实际预估 | 差距 |
|------|----------|----------|------|
| 项目初始化 | 0.5d | 0.5d | ✅ |
| config.yaml | 0.5d | 0.5d | ✅ |
| 飞书 Bot 接入 | 1d | 1-1.5d | ⚠️ 飞书 Bot 的 webhook 调试（消息加签验证、event type 判断、本地 ngrok）比预期耗时 |
| SQLite 初始化 | 1d | 1d | ✅ |
| GitHub API 封装 | 1d | **2-3d** | ❌ 被低估。GitHub API 封装不只是"能创建文件和 PR"，还包括：error handling（403/404/409 Conflict）、PR merge 状态轮询、文件 SHA 管理（更新文件需要先获取 SHA）、repo 结构创建（如果 docs/ 目录不存在需要先创建）|
| 手动模拟 PM Agent | 1d | 1d | ✅ |
| 手动模拟 Dev Agent | 1d | 1.5d | ⚠️ 生成"能跑通的 CRUD"需要多次 Prompt 调优 |
| 端到端串联 | 1d | **2d** | ❌ 被低估。本地飞书 webhook + LLM 生成 + GitHub 写入 + 验证 PR 存在的完整链路，调试链路长 |

**结论**：Sprint 0 实际需要 **8-9 人天**，比估算多 30-40%。建议延长到 1.5 周或砍掉部分任务（如果 GitHub API 封装和端到端串联同时做风险太大，可以拆分）。

### 3.2 被低估的模块

| 模块 | 被低估程度 | 原因 |
|------|-----------|------|
| **GitHub API 封装** | 高 | 涉及 PAT 权限、文件 SHA 管理、PR Conflict 处理、Wiki 的 git 协议写入 |
| **Intent Classifier** | 中 | Few-shot 分类器需要评测集调优，10 条测试数据不够，需要至少 50 条代表性需求才能验证 80% 准确率 |
| **PRD 生成质量** | 高 | LLM 生成 PRD 的最大问题不是生成速度，而是**生成内容的可用性**——PRD 里写的技术方案，Dev Agent 能否直接作为代码实现的输入？这两者的对齐需要大量 prompt 迭代 |
| **飞书交互卡片设计** | 中 | 飞书支持 Interactive 卡片（按钮、Select）、Markdown 消息、普通文本，不同消息类型的适用场景需要测试 |

---

## 四、风险点评审

### 4.1 高风险技术债务

| 债务 | 风险 | 后期影响 | 建议 |
|------|------|----------|------|
| **SQLite 写并发** | 高 | MVP 阶段数据量小感知不到，一旦并发增加（多需求同时处理），系统 hang | MVP 阶段就使用 PostgreSQL，不要用 SQLite |
| **没有 LLM 调用统一封装** | 高 | 每个 Agent 各自调 LLM，retry/fallback/cost 不一致，后期维护困难 | 立即增加 `src/llm/` 模块 |
| **Prompt 作为硬编码字符串** | 中 | 所有 Prompt 散落在各个 Agent 的 .py 文件里，无法 A/B 测试，无法版本化管理 | Prompt 独立存储在 `prompts/` 目录下，YAML 管理 |
| **配置明文存储** | 中 | config.yaml 里放 LLM API Key、GitHub PAT，风险高 | 使用环境变量注入，config.yaml 只放非敏感配置 |

### 4.2 难以修改的设计决策

| 决策 | 为什么难以修改 | 窗口期 |
|------|---------------|--------|
| **SQLite → PostgreSQL 迁移** | 数据从文件迁移到独立 DB 进程，连接字符串变化，backup 策略变化 | 现在决定，MVP 后迁移成本极高 |
| **线性队列 → DAG 编排** | 状态模型和调度逻辑完全重写 | Sprint 1 就应该规划清楚，不要等到 Sprint 3 |
| **消息平台（Telegram 支持）** | 两套 Bot 实现 + 两套消息模板，后期维护成本翻倍 | 初期设计就要考虑消息抽象层 |
| **LLM Provider 切换** | 如果 prompt 和 provider 耦合（如直接调用 `openai.ChatCompletion.create`），切换成本高 | LLM Gateway 在 Sprint 0 就应该建好 |

### 4.3 产品层面的风险（影响开发）

| 风险 | 对开发的影响 |
|------|-------------|
| **老板满意度 NPS ≥ 50** | 这个 KPI 依赖 LLM 输出质量，而 LLM 输出不可控。PRD 没有说明当 LLM 生成内容质量差时（PRD 不完整、代码有 bug），系统如何兜底或承认失败 |
| **Agent 任务完成率 ≥ 85%** | 没有定义"完成"的边界。代码写入了 GitHub PR 算完成，还是 PR merged 算完成？这个定义直接影响测试和验收标准 |
| **HiL 超时 72h** | 72h 处于 pending 状态的任务如何处理？如果老板 5 天没回，任务队列就一直挂着，不能复用也不能取消 |

---

## 五、具体修改建议（标注 PRD 章节）

### P0（开发前必须修改）

1. **§5.1 技术选型**：将技术栈从 Python/FastAPI/LangGraph 改为与团队技术栈（Go）一致的方案，或明确说明 Split Tier 架构（Python Agent 层 + Go 编排层），并在评审中达成共识。

2. **§5.1 技术选型**：SQLite 替换为 PostgreSQL（或 Badger 如果坚持 Go）。SQLite 并发问题是架构级缺陷，不是"连接池"能解决的。

3. **§5.3 数据库设计**：增加 `agent_logs` 表的写入策略说明（异步写入 or WAL 模式）。增加 LLM 调用记录表（`llm_calls`：model、input_tokens、output_tokens、latency、cost），这是成本控制和审计的基础。

4. **§4.3 任务模型**：明确失败重试的任务 ID 策略（保留原 ID vs 新建 ID），以及 `depends_on` 在 MVP 线性队列里的实际作用（建议简化：删掉 `depends_on` 字段，或注明"为后续并行扩展预留"）。

### P1（开发早期 Sprint 1 前修改）

5. **§5.1 增加 LLM Gateway 设计**：明确 `src/llm/` 模块的职责：统一接口（支持 OpenAI/Anthropic/本地模型）、Retry 策略（指数退避）、Fallback（主模型失败切备选）、Cost 记录。

6. **§4.1 M1 Intake**：Intent Classifier 的评测集规模需要扩大（至少 50 条），并定义"分类错误"时的兜底策略（如 confidence < 0.5 时直接请求澄清而非猜测）。

7. **§6.2 Sprint 0**：GitHub API 封装从 1d 调整为 2-3d，增加 Wiki 写入方案评审（建议 MVP 阶段用 docs 目录代替 Wiki，减少 git protocol 复杂度）。

8. **§4.2 M2 PRD 输出**：增加"PRD → 代码"的对齐验证步骤。PRD 里的技术方案应该有明确的结构化字段（如 api_endpoints、data_model），而不是自由文本，否则 Dev Agent 需要重新理解而不是直接执行。

### P2（建议修改，不阻断开发）

9. **§3.2 MVP 范围**：建议在 M8 共享上下文的 MVP 范围里增加"上下文读写事务性"要求（即一个 Agent 读到的上下文要么是完整的要么不存在，不会有中间状态）。

10. **§2.1 Step 9 产物交付**：PRD 说"写入 GitHub Wiki"，建议改为"写入 docs/ 目录 + GitHub PR"，Wiki 的 git 协议写入复杂度不值得在 MVP 投入。

11. **§5.4 目录结构**：增加 `prompts/` 目录（管理所有 LLM Prompt），增加 `src/llm/` 模块，配置加载统一到 `src/config.py`。

12. **§4.3 失败处理**：增加"任务取消"场景的说明（老板中途喊停，Orchestrator 如何中止正在执行的 Agent）。

---

## 六、技术选型建议总结

如果团队是 **Go 技术栈**，推荐如下方案：

| 层级 | 推荐技术 | 说明 |
|------|----------|------|
| Web/消息接入 | Gin / Echo | 轻量 Go web 框架 |
| 任务编排 | **Temporal** | 分布式任务工作流引擎，支持 DAG、有重试、有状态持久化，比自研或 LangGraph 更适合生产 |
| Agent 实现 | Go + LLM API (OpenAI兼容) | Agent 逻辑用 Go 写，LLM 调用走统一的 Gateway |
| 共享上下文 | PostgreSQL + Redis | PostgreSQL 存结构化数据，Redis 存高频读写状态 |
| 飞书集成 | github.com/chyroc/go-lark | 活跃的 Go 飞书 SDK |
| GitHub | go-github | 官方 GitHub Go SDK |
| LLM Gateway | 自研（简单 proxy） | 统一 OpenAI/Anthropic 接口，加 retry/fallback |
| ORM | GORM / sqlx | - |

**为什么不选 AutoGen / LangGraph（即使做 Python 层）**：
- 这两个都是研究向框架，AutoGen 已出现维护问题（微软团队重心转移）
- 如果 Python 层是必要的恶（LLM 生态），建议用 LangChain + LangServe 的组合，生产级组件更多

---

## 七、总结

| 维度 | 评分 | 说明 |
|------|------|------|
| 技术可行性 | 6/10 | 思路可行但栈不匹配，SQLite 并发是架构级缺陷 |
| 架构设计 | 7/10 | 模块拆分基本合理，队列设计有漏洞，边界需明确 |
| 开发成本 | 6/10 | Sprint 0 被低估 30-40%，GitHub API 和端到端串联风险高 |
| 风险可控性 | 5/10 | 多处设计决策后期难以修改，技术债在 MVP 后会快速累积 |

**最终建议**：**需要修改后再评审**。开发前必须对齐的问题（P0）：
1. Go vs Python 技术栈决策（战略级）
2. SQLite → PostgreSQL 替换（架构级）
3. Sprint 0 时间重新估算

这些问题不解决就开发，会在 4-6 周后（Sprint 2-3）集中爆发。
