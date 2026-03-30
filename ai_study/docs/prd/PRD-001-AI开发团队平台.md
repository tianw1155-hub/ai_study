# PRD-001：AI 开发团队平台

| 字段 | 内容 |
|------|------|
| **文档版本** | v1.1 |
| **撰写日期** | 2026-03-24 |
| **作者** | AI 产品经理 Agent |
| **状态** | **需重新评审** |
| **目标读者** | 研发团队、技术负责人 |

---

## 1. 产品概述

### 1.1 背景

当前软件开发交付链路长、角色多（产品、研发、测试、运维），老板（决策者）作为非技术角色，难以高效驱动团队且容易被技术细节淹没。现有工具链分散，协作摩擦大。

AI Agent 技术的成熟为自动化协作提供了技术基础：大语言模型已具备理解自然语言、生成结构化内容、执行多步骤任务的能力，多 Agent 协作框架（如 LangGraph、AutoGen）也趋于稳定。

**结论**：现在是构建「自然语言驱动 AI Agent 团队」产品的最佳窗口期。

### 1.2 产品目标

打造一个**零技术门槛**的产品：老板用自然语言提需求，AI Agent 团队自动完成从需求分析 → PRD 撰写 → 代码实现 → 测试 → 部署上线的全流程。

### 1.3 核心价值主张

| 维度 | 传统模式 | 本产品 |
|------|----------|--------|
| 需求响应 | 需求会议 → 文档往返 → 排期等待（3-7天） | 即时接收，AI 立即开始（<5分钟启动） |
| 跨角色协作 | 产品/研发/测试/运维各自为战 | AI Agent 团队端到端闭环 |
| 老板参与度 | 需理解技术细节才能做决策 | 自然语言交互，无需技术背景 |
| 交付可见性 | 需主动追问才知道进展 | 共享任务板，关键节点主动通知 |
| 变更成本 | 需求变更牵一发动全身 | 增量拆解，变更影响可控 |

### 1.4 成功指标（KPI）

| 指标 | 目标值 | 衡量方式 |
|------|--------|----------|
| 需求首次响应时间 | < 5 分钟 | 从消息收到 → AI 确认理解并创建任务 |
| 端到端交付周期（MVP 功能） | ≤ 72 小时 | 需求提出 → 部署完成 |
| 人工确认节点数量 | ≤ 3 次/需求 | Human-in-the-Loop 触发次数 |
| Agent 任务完成率 | ≥ 85% | 到达终态的任务 / 总任务数 |
| 老板满意度（NPS） | ≥ 50 | 每次交付后收集反馈 |

---

## 2. 用户故事

### 2.1 完整用户旅程

```
┌──────────────────────────────────────────────────────────────────────┐
│                     老板的端到端体验                                    │
└──────────────────────────────────────────────────────────────────────┘

Step 1: 老板发消息
──────────────────────────────────────────────────────────────────────
  场景：老板在飞书/Telegram 发出需求
  示例："我们需要做一个用户积分系统，用户消费可以累计积分，积分可以兑换礼品"
  ↓
Step 2: PM Agent 接收并解析
──────────────────────────────────────────────────────────────────────
  · 理解需求意图，提取关键实体（用户、积分、礼品）
  · 自动出 PRD 草稿，包含功能范围、技术方案建议、MoSCoW 定级
  · 推送飞书："收到！我理解你想要：1) 积分累计规则 2) 积分兑换功能……"
  · 等待老板确认"方向对了"（Human-in-the-Loop #1）
  ↓
Step 3: 编排引擎拆解任务
──────────────────────────────────────────────────────────────────────
  · 将需求拆解为原子任务：建表、API设计、积分计算逻辑、兑换逻辑、测试用例……
  · 任务路由：Dev Agent 领代码任务，Test Agent 领测试任务，Ops Agent 准备部署
  · 共享上下文写入：所有 Agent 可读取当前需求背景和约束
  ↓
Step 4: Dev Agent 执行
──────────────────────────────────────────────────────────────────────
  · 生成代码（数据库 schema、API 路由、业务逻辑）
  · 写入 GitHub 仓库（feature branch）
  · 推送飞书："积分累计接口已实现，代码在 feature/integral-system"
  ↓
Step 5: Test Agent 执行
──────────────────────────────────────────────────────────────────────
  · 自动生成测试用例（单元测试 + 集成测试）
  · 运行测试套件，输出覆盖率报告
  · 安全扫描（OWASP Top 10 静态扫描）
  · 如测试失败 → 自动通知 Dev Agent 修复（无需老板介入）
  ↓
Step 6: Ops Agent 准备部署
──────────────────────────────────────────────────────────────────────
  · 生成 Dockerfile / docker-compose.yml
  · 准备 CI/CD pipeline 配置（GitHub Actions）
  · 推送飞书："代码已完成测试，是否可以部署到预发布环境？"（Human-in-the-Loop #2）
  ↓
Step 7: 部署 + 监控就绪
──────────────────────────────────────────────────────────────────────
  · 老板确认 → Ops Agent 执行部署
  · 配置基础监控（CPU/内存/错误率）
  · 推送飞书："功能已上线预发布环境，监控面板：xxx"
  ↓
Step 8: 验收 + 上线
──────────────────────────────────────────────────────────────────────
  · 老板验收（或 AI 自动跑验收测试）
  · 确认后，Ops Agent 部署生产环境（Human-in-the-Loop #3）
  · 推送飞书："✅ 功能已上线生产环境"
  ↓
Step 9: 产物交付
──────────────────────────────────────────────────────────────────────
  · 产物汇总：PRD 文档、代码 PR、技术方案、测试报告、部署记录
  · 写入 GitHub Wiki 或飞书文档
  · 推送老板："交付物汇总：[链接]"
```

### 2.2 关键 Human-in-the-Loop 节点

| 节点 | 触发时机 | 老板操作 | 超时策略 |
|------|----------|----------|----------|
| HiL #1 | PM Agent 完成 PRD 初稿 | 确认方向/提出修改意见 | 48h 无响应 → 自动发送提醒，72h → 升级通知 |
| HiL #2 | 代码完成测试，准备预发布 | 确认部署预发布 | 同上 |
| HiL #3 | 预发布验证通过，准备生产 | 确认生产上线 | 同上 |

---

## 3. 功能全景图

### 3.1 模块总览

```
┌─────────────────────────────────────────────────────────────────┐
│                      交互层（飞书 / Telegram）                    │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     核心层（AI Agent 团队）                        │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ M1: 需求    │ M2: PM      │ M3: 编排    │ M4: Dev     │ M5: Test│
│ Intake      │ Agent       │ 引擎        │ Agent       │ Agent   │
│             │             │             │             │         │
│ 自然语言接收 │ PRD生成     │ 任务拆解    │ 代码实现    │ 测试+   │
│ 意图识别    │ 方案建议     │ 路由调度    │ PR创建      │ 安全扫描│
│ 需求确认    │ MoSCoW定级   │ 状态追踪    │ 代码审查    │         │
├─────────────┴─────────────┴─────────────┼─────────────┴─────────┤
│                     M7: Human-in-the-Loop                      │
│                     （关键节点人工确认）                            │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      支撑层                                       │
├────────────────┬────────────────┬───────────────────────────────┤
│ M8: 共享上下文  │ M9: 产物交付   │ M10: 可观测性面板              │
│                │               │                               │
│ Agent间状态共享│ 代码/文档/报告 │ 任务状态/Agent日志/指标         │
│ 统一知识库     │ 交付物汇总     │ 飞书/TG推送通知                 │
└────────────────┴────────────────┴───────────────────────────────┘
```

### 3.2 MVP 范围定义

> **MVP（最小可行产品）目标**：验证核心价值——"老板自然语言提需求，AI 自动完成端到端交付"——的最少功能集。

| 模块 | MVP 范围 | MVP 后扩展 |
|------|----------|------------|
| **M1: 需求 Intake** | 飞书消息接收 + 基础意图识别 + 需求确认回复 | Telegram 支持；多轮对话澄清 |
| **M2: PM Agent** | 生成简化版 PRD（功能列表 + MoSCoW） + 技术方案摘要 | 完整 PRD、用户旅程图、竞品分析 |
| **M3: 编排引擎** | 线性任务队列 + 状态推送飞书 | DAG 任务图 + 并行执行 + 条件路由 |
| **M4: Dev Agent** | 生成单表 CRUD + 基础 API + 写入 GitHub PR | 复杂业务逻辑、多个微服务、代码优化 |
| **M5: Test Agent** | 基础单元测试生成 + 本地运行 | 集成测试、性能测试、安全扫描报告 |
| **M6: Ops Agent** | 生成 Dockerfile + GitHub Actions YAML | K8s 部署、自动回滚、灰度发布 |
| **M7: Human-in-the-Loop** | 3 个固定节点的人工确认（飞书按钮/回复） | 自定义节点配置 |
| **M8: 共享上下文** | 每个需求独立的上下文存储（PostgreSQL JSONB） | Redis 分布式共享 + 版本化 |
| **M9: 产物交付** | 每个需求交付物写入 GitHub Wiki 页面 | 飞书文档同步、版本化交付包 |
| **M10: 可观测性面板** | 飞书/TG 消息推送进度 | Web 面板（后续章节展开） |

### 3.3 功能优先级矩阵（MoSCoW）

| 模块 | Must Have（MVP） | Should Have | Could Have | Won't Have（本周期） |
|------|-----------------|-------------|------------|---------------------|
| M1 需求 Intake | ✅ 飞书接收 + 意图识别 | 模糊意图澄清 | TG 支持 | 多语言支持 |
| M2 PM Agent | ✅ 简化 PRD + MoSCoW | 完整 PRD | 技术选型深度分析 | 成本估算 |
| M3 编排引擎 | ✅ 线性任务队列 | 基础并行 | DAG 编排 | 动态路由 |
| M4 Dev Agent | ✅ 单表 CRUD 代码 | 业务逻辑代码 | 多服务代码 | 代码优化重构 |
| M5 Test Agent | ✅ 单元测试生成 | 集成测试 | 安全扫描 | 自动化性能测试 |
| M6 Ops Agent | ✅ Dockerfile + Actions | K8s 配置 | 监控配置 | 灰度/回滚 |
| M7 HiL | ✅ 3 节点确认 | 节点可配置 | 委托代理确认 | 移动端审批 App |
| M8 共享上下文 | ✅ PostgreSQL JSONB | Redis | 分布式 KV |
| M9 产物交付 | ✅ GitHub Wiki 汇总 | 飞书文档同步 | 版本化交付包 | 自动化发布日志 |
| M10 可观测性 | ✅ 飞书/TG 进度推送 | 日志聚合 | 指标面板 | 告警规则配置 |

---

## 4. MVP 详细设计

### 4.1 M1：需求 Intake

#### 4.1.1 功能描述

接收来自老板的自然语言需求，完成**理解 → 确认 → 录入**的全流程。

#### 4.1.2 交互流程

```
老板发送消息
      │
      ▼
┌─────────────────┐
│ 飞书/TG Bot     │ ← Webhook 接收消息
│ 消息预处理      │   - 去除无关内容（表情、HTML）
└────────┬────────┘
         ▼
┌─────────────────┐
│ 意图分类器      │ ← LLM 调用（少量样本 Few-shot）
│                 │   - intent: new_feature | bug_fix | question
│                 │   - confidence: 0.0-1.0
└────────┬────────┘
         ▼
    ┌────┴────┐
    │confidence│
    │ >= 0.8  │──→ 直接解析需求内容
    │ < 0.8  │──→ 请求老板澄清（HiL 前置）
    └─────────┘
         │
         ▼
┌─────────────────┐
│ 需求实体提取    │ ← LLM 调用
│                 │   - extract entities (user, action, object)
│                 │   - 生成需求摘要（< 200 字）
└────────┬────────┘
         ▼
┌─────────────────┐
│ 需求录入确认    │
│ 推送飞书：      │
│ "我理解你想要： │
│  1. xxx         │
│  2. xxx         │
│  请确认是否正确" │
└─────────────────┘
```

#### 4.1.3 输入/输出定义

| 字段 | 说明 |
|------|------|
| 输入 | 老板原始消息（文本，最多 2000 字） |
| 意图分类 | new_feature / bug_fix / question |
| 提取实体 | JSON：{entities: [], summary: string, confidence: float} |
| 确认消息 | 推送给老板的确认卡片 |
| 状态 | pending_confirmation → confirmed → routing |

#### 4.1.4 技术实现要点

- **飞书消息接收**：使用飞书开放平台 Webhook Bot（推荐）或 Application Bot
- **Telegram Bot**：使用 Telegram Bot API + Webhook 模式
- **意图分类 Prompt 示例**：

```
你是一个需求分类器。请将用户输入分类为以下类别之一：
- new_feature: 新功能开发
- bug_fix: Bug 修复
- question: 纯咨询问题

用户输入：{user_message}

输出格式（仅输出JSON）：
{"intent": "...", "confidence": 0.xx, "reasoning": "..."}
```

### 4.2 M2：PM Agent

#### 4.2.1 功能描述

接收已确认的需求，自动生成**简化版 PRD**（功能范围 + MoSCoW 定级）和**技术方案摘要**。

#### 4.2.2 PRD 模板（MVP 版本）

```markdown
# PRD-{需求ID}：{需求标题}

## 1. 需求背景
{AI 总结的需求背景，2-3 句话}

## 2. 功能范围（MoSCoW）

### Must Have（核心功能，P0）
- {功能点1}
- {功能点2}

### Should Have（重要功能，P1）
- {功能点1}

### Could Have（加分项，P2）
- {功能点1}

### Won't Have（本期不做）
- {功能点1}

## 3. 用户故事
- 作为 {角色}，我想要 {功能}，以便 {价值}

## 4. 技术方案摘要
- 技术栈建议：{语言/框架}
- 数据模型：{核心实体}
- API 设计：{REST/GraphQL}
- 第三方依赖：{如有}

## 5. 约束与假设
- {假设条件}
- {非功能需求（性能/安全）}

## 6. 验收标准
- {可测试的验收条件}
```

#### 4.2.3 MoSCoW 定级 Prompt 示例

```
你是一个产品经理。请根据以下需求，进行 MoSCoW 优先级定级。

需求：{confirmed_requirement}

请按以下格式输出：
Must Have（不完成功能不可用，定义为 P0）：
Should Have（重要但可延期，定义为 P1）：
Could Have（有资源再做，定义为 P2）：
Won't Have（本期不做）：

注意：
- Must Have 总数不超过 3 个
- 定级理由请简要在每条后备注
```

#### 4.2.4 输出产物

| 产物 | 格式 | 存储位置 |
|------|------|----------|
| PRD 文档 | Markdown | `github.com/tianw1155-hub/ai_study/docs/prd/PRD-{id}.md` |
| 需求摘要 | JSON | 共享上下文 |
| MoSCoW 定级 | JSON | 共享上下文 |
| 技术方案摘要 | Markdown | 共享上下文 |

### 4.3 M3：编排引擎

#### 4.3.1 功能描述

编排引擎是整个平台的核心调度中心，负责将 PM Agent 输出的需求拆解为**原子任务**，并驱动 Dev / Test / Ops Agent 依次执行。

#### 4.3.2 任务模型

```json
{
  "task_id": "task-001",
  "requirement_id": "req-001",
  "task_name": "生成用户积分表 schema",
  "task_type": "dev",
  "assigned_agent": "dev_agent",
  "status": "pending|assigned|running|completed|failed",
  "depends_on": ["task-000"],
  "created_at": "2026-03-24T10:00:00Z",
  "started_at": "2026-03-24T10:05:00Z",
  "completed_at": null,
  "output": {},
  "error": null
}
```

#### 4.3.3 任务拆分策略（MVP）

MVP 采用**线性队列**模式，不做复杂 DAG 依赖图：

```
需求确认
  │
  ▼
任务拆解（PM Agent 完成后自动触发）
  │  生成任务列表
  ▼
任务1: Dev Agent - 生成数据库 Schema
  │  完成后
  ▼
任务2: Dev Agent - 生成 CRUD API
  │  完成后
  ▼
任务3: Test Agent - 生成单元测试
  │  完成后
  ▼
任务4: Ops Agent - 生成 Dockerfile
  │  完成后
  ▼
HiL #2: 部署预发布确认
  │
  ▼
HiL #3: 生产上线确认
```

> **MVP 不做并行**：所有 Agent 串行执行，确保状态简单可控，减少调试成本。

#### 4.3.4 状态推送

每次任务状态变更，通过飞书/TG Bot 推送给老板：

| 事件 | 推送内容 |
|------|----------|
| 任务开始 | 📋 任务开始：{task_name} |
| 任务完成 | ✅ 任务完成：{task_name}（耗时 {duration}） |
| 任务失败 | ❌ 任务失败：{task_name}，原因：{error}，AI 正在重试 |
| 等待 HiL | ⏸ 需要你确认：{内容}，回复「确认」继续 |

#### 4.3.5 失败处理策略

| 失败场景 | 处理方式 |
|----------|----------|
| Agent 执行失败（可重试，如 API 超时） | 自动重试 2 次，间隔 30s |
| Agent 执行失败（不可重试，如代码逻辑错误） | 通知老板，标记失败，人工介入 |
| HiL 节点超时（72h 无响应） | 每日提醒，72h 后升级通知 |

---

## 5. 技术架构建议

### 5.1 技术选型（Split Tier 架构）

**核心设计原则**：Go 做编排（稳定、高并发），Python 做 Agent（LLM 生态），两者通过 Temporal 解耦。

| 层级 | 推荐技术 | 选型理由 |
|------|----------|----------|
| **编排层** | Go + **Temporal** | 任务编排：工作流持久化、失败重试、分布式支持 |
| **Agent 层** | **Python + LangGraph** | LLM 调用：LangGraph 状态机、工具调用、多 Agent 协作 |
| **LLM Gateway** | 独立 **Python 服务** | 模型切换（GPT-4 / Claude 3.5 / 国产模型）、Token 统计、限流 |
| **消息接入** | **go-lark**（Go 原生） | 飞书 Webhook 接收/回复，高性能，无 Python GIL 问题 |
| **API 框架** | **Gin（Go）** | HiL 回调、状态查询、Agent 心跳 |
| **数据库** | **PostgreSQL** | 需求/任务持久化，支持 JSON 字段查询 |
| **代码托管** | GitHub REST API | 仓库已在 GitHub，直接用 API 操作 PR/文件 |
| **CI/CD** | GitHub Actions | 零额外基础设施，YAML 即配置 |
| **容器化** | Docker + Docker Hub | 标准化交付 |

> **为什么不选 AutoGen？** AutoGen 更偏研究场景，生产级任务编排 Temporal + LangGraph 更成熟稳定。
> **为什么不选 FastAPI？** FastAPI 是 Python 单线程，消息接入层需要高并发 Go 处理。

### 5.2 系统架构图（Split Tier）

```
                        老板（飞书）
                            │
                            ▼
                    ┌───────────────┐
                    │  go-lark（Go）│
                    │  接收消息      │
                    │  消息预处理    │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Temporal（Go）│
                    │  任务编排      │
                    │  工作流持久化   │
                    └───────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
│ Python Agent    │ │ Python Agent  │ │ Python Agent    │
│ 服务（PM Agent） │ │ 服务（Dev）    │ │ 服务（Test/Ops） │
│ LLM 调用        │ │ LLM 调用      │ │ LLM 调用        │
│ LangGraph       │ │ LangGraph     │ │ LangGraph       │
└────────┬────────┘ └───────┬───────┘ └────────┬────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   LLM Gateway（Python）   │
              │   模型切换 / Token 统计   │
              └────────────┬────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ GitHub   │    │PostgreSQL│    │ Docker   │
    │ API      │    │          │    │ Hub      │
    └──────────┘    └──────────┘    └──────────┘
```

### 5.2.1 分层职责说明

| 层级 | 组件 | 职责 |
|------|------|------|
| **接入层** | go-lark | 飞书 Webhook 接收消息，消息回复，高性能 Go 处理 |
| **编排层** | Temporal + Gin | 任务工作流定义、执行、持久化；HiL 回调 API |
| **Agent 层** | Python + LangGraph | LLM 调用（PRD 生成、代码实现、测试生成） |
| **网关层** | LLM Gateway | 多模型切换、Token 统计、限流、Prompt 模板管理 |
| **存储层** | PostgreSQL | 需求、任务、Agent 日志持久化 |

### 5.3 数据库设计（PostgreSQL）

```sql
-- 需求表
CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_message TEXT NOT NULL,
    intent TEXT NOT NULL,
    entities JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','running','completed','failed')),
    prd_path TEXT,
    moscow JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 任务表
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID NOT NULL REFERENCES requirements(id),
    task_name TEXT NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('dev','test','ops')),
    assigned_agent TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','assigned','running','completed','failed')),
    depends_on JSONB DEFAULT '[]',
    output JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Agent 执行日志
CREATE TABLE agent_logs (
    id SERIAL PRIMARY KEY,
    task_id UUID REFERENCES tasks(id),
    agent_name TEXT NOT NULL,
    log_level TEXT CHECK (log_level IN ('DEBUG','INFO','WARN','ERROR')),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- HiL 确认记录
CREATE TABLE hil_confirmations (
    id SERIAL PRIMARY KEY,
    requirement_id UUID NOT NULL REFERENCES requirements(id),
    node TEXT NOT NULL CHECK (node IN ('hil_1','hil_2','hil_3')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','timeout')),
    confirmed_at TIMESTAMPTZ,
    response_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_tasks_requirement_id ON tasks(requirement_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_agent_logs_task_id ON agent_logs(task_id);
CREATE INDEX idx_hil_requirement_id ON hil_confirmations(requirement_id);
```

### 5.3.1 PostgreSQL 配置要求

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| 版本 | PostgreSQL 14+ | PostgreSQL 15+ |
| 连接池 | — | PgBouncer（transaction 模式） |
| 备份 | 每日全备 | WAL + 增量备份 |
| 高可用 | 单机 | 主从流复制 |

### 5.4 目录结构建议（Split Tier）

```
ai_study/
├── README.md
├── config.yaml                 # 全局配置（仓库信息、Temporal 地址等）
│
├── cmd/                        # Go 入口
│   ├── gateway/               # API 网关（Gin）
│   │   └── main.go
│   └── worker/                # Temporal Worker
│       └── main.go
│
├── pkg/                        # Go 公共包
│   ├── feishu/                # go-lark 封装
│   ├── temporal/              # Temporal workflow/activity 定义
│   ├── models/                # Go 数据模型
│   └── repository/            # PostgreSQL 数据访问层
│
├── internal/                   # Go 内部模块
│   ├── gateway/               # Gin HTTP handler
│   │   ├── handler/           # HTTP handlers
│   │   ├── middleware/        # 中间件（日志、认证）
│   │   └── router.go
│   ├── workflow/              # Temporal workflows
│   │   ├── requirement.go     # 需求处理 workflow
│   │   └── tasks.go           # 任务编排 workflow
│   └── activity/              # Temporal activities
│       ├── feishu.go          # 飞书活动
│       └── github.go          # GitHub 活动
│
├── agent/                      # Python Agent 服务（独立进程）
│   ├── requirements.txt
│   ├── main.py                 # Agent 服务入口
│   ├── agents/
│   │   ├── pm_agent/          # PM Agent（PRD 生成）
│   │   ├── dev_agent/          # Dev Agent（代码实现）
│   │   ├── test_agent/         # Test Agent（测试生成）
│   │   └── ops_agent/          # Ops Agent（部署配置）
│   ├── llm_gateway/            # LLM Gateway
│   │   ├── main.py
│   │   ├── router.py          # 模型路由
│   │   └── limiter.py         # 限流
│   └── tools/                  # Agent 工具集
│       ├── github.py
│       └── docker_hub.py
│
├── migrations/                  # PostgreSQL 迁移
│   └── 001_init.sql
│
├── docs/
│   ├── prd/                   # PRD 文档
│   └── design/                # 技术设计文档
│
└── tests/
    ├── gateway_test/          # Go 网关测试
    ├── workflow_test/          # Temporal workflow 测试
    └── agent_test/            # Python Agent 测试
```

### 5.4.1 服务间通信

| 通信路径 | 协议 | 说明 |
|----------|------|------|
| 飞书 → Go Gateway | Webhook HTTP | go-lark 接收 |
| Go Gateway → Temporal | Temporal SDK | 触发工作流 |
| Temporal Worker → Python Agent | gRPC / HTTP | Activity 调用 |
| Python Agent → LLM Gateway | HTTP | LLM API 调用 |
| Python Agent → PostgreSQL | PostgreSQL Wire | 直接读写 |
| Python Agent → GitHub | GitHub REST API | 代码操作 |

### 5.5 部署方案

| 环境 | 部署方式 | 说明 |
|------|----------|------|
| **开发环境** | 本地运行 Go Gateway + Temporal（Docker）+ Python Agent | 使用 ngrok 暴露飞书 Webhook |
| **预发布环境** | Docker Compose on 云服务器 | Go Gateway + Temporal Worker + Python Agent + PostgreSQL |
| **生产环境** | Docker Compose on 云服务器（4核8G最低） | 飞书/TG Bot 生产账号，Temporal 高可用 |

> **MVP 阶段部署原则**：先跑通本地，用 ngrok 测试 Webhook。确认功能正常后，再迁移到云服务器 Docker Compose 部署。MVP 不做 K8s，增加运维复杂度。
> **Temporal 开发模式**：Temporal Cloud（SaaS）或 Docker Compose 自建。Sprint 0 阶段使用 Docker Compose 本地调试。

---

## 6. Sprint 规划

### 6.1 Sprint 概览

| Sprint | 周期 | 目标 | 交付物 |
|--------|------|------|--------|
| Sprint 0 | 1 周 | 基建 + 单 Agent 闭环验证 | 项目初始化、飞书 Bot 接入、单条需求端到端跑通 |
| Sprint 1 | 2 周 | MVP 核心链路 | Intake + PM Agent + 编排引擎 + Dev Agent |
| Sprint 2 | 2 周 | 测试 + 交付完善 | Test Agent + 产物交付 + HiL 确认流程 |
| Sprint 3 | 2 周 | 运维 + 稳定性 | Ops Agent + 可观测性 + 错误处理 + 重试机制 |
| Sprint 4 | 1 周 | 端到端验收 | 全链路压测 + Bug 修复 + 文档完善 |

> **总工期**：约 8 周

---

### 6.2 Sprint 0：基建 + 闭环验证（1 周）

**目标**：验证技术方案可行性，跑通单条需求的最小闭环。

#### 6.2.1 详细任务

| 任务 | 负责人 | 原估 | 修订后 | 验收标准 |
|------|--------|------|--------|----------|
| 项目初始化（目录结构、Git、Go mod + Python venv） | Dev | 0.5d | 0.5d | 目录结构符合 Split Tier 设计 |
| config.yaml 配置管理方案 | Dev | 0.5d | 0.5d | 支持仓库地址、Temporal 地址等配置 |
| 飞书 Bot 接入 + go-lark 接收消息 | Dev | 1d | 1d | 本地 ngrok + 飞书 Bot，能收到消息并回复 |
| PostgreSQL 数据库初始化 + CRUD | Dev | 1d | 1d | 数据库创建，requirements/task 表增删改查 |
| GitHub API 封装（创建文件/PR） | Dev | 1d | **2-3d** | 能用 PAT 创建文件、提交 PR；分支创建、PR 评论 |
| Temporal 集群本地调试 | Dev | — | **1d** | Temporal Docker Compose 启动，工作流可执行 |
| 手动模拟 PM Agent（直接 LLM 调用） | AI | 1d | 1d | 输入需求，输出 Markdown PRD |
| 手动模拟 Dev Agent（直接 LLM 调用） | AI | 1d | 1d | 输入 PRD，输出 Python CRUD 代码 |
| 单需求端到端手动串联 | Dev | 1d | **2d** | 飞书发消息 → Temporal 触发 → Python Agent 生成代码 → 写入 GitHub PR |

> **Sprint 0 总工时：4d → 6-7d**（修订原因：Temporal 调试复杂度、GitHub API 全流程覆盖）

#### 6.2.2 Sprint 0 产出

- ✅ 可运行的本地项目（Go Gateway + Python Agent + Temporal）
- ✅ 飞书 Bot 可接收/发送消息（go-lark）
- ✅ PostgreSQL 数据持久化
- ✅ Temporal 本地工作流可执行
- ✅ 单需求端到端手动跑通（证明技术可行性）

#### 6.2.3 Sprint 0 风险点

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 飞书 Bot Webhook 本地调试复杂 | 中 | 高 | 改用 ngrok 或 Cloudflare Tunnel |
| LLM 生成代码质量不稳定 | 高 | 中 | 先固定使用 GPT-4，Prompt 优化后再测 Claude |
| GitHub PAT 权限不足 | 低 | 高 | 提前确认 Token 权限（repo + admin:org） |
| **Temporal 本地调试复杂度** | **中** | **高** | **新增 1d 专门调试时间** |

---

### 6.3 Sprint 1：MVP 核心链路（2 周）

**目标**：老板发一条需求，自动完成 PRD 生成 + 代码实现。

#### 6.3.1 详细任务

| 任务 | 工时 | 验收标准 |
|------|------|----------|
| **M1: Intake 完善** | | |
| · 意图分类器（Few-shot） | 1d | 10 条测试需求，分类准确率 ≥ 80% |
| · 实体提取模块 | 1d | 提取的实体可被人工验证正确 |
| · 飞书确认卡片设计 | 0.5d | 卡片包含需求摘要（≤200字）+ 功能列表 + MoSCoW 预览，支持回复"确认"继续 |
| **M2: PM Agent 完善** | | |
| · PRD 自动生成 | 2d | 生成的 PRD 包含：背景、功能列表、MoSCoW、验收标准 |
| · MoSCoW 自动定级 | 1d | MoSCoW 生成结果包含 Must Have 1-3 个、Should Have 0-5 个；人工可修改 |
| · PRD 写入 GitHub Wiki | 1d | PRD 文件出现在仓库 docs/prd/ 目录 |
| **M3: 编排引擎** | | |
| · 任务拆解模块 | 2d | PRD → 任务列表（5-10 个原子任务） |
| · 线性任务队列 | 2d | 任务按顺序执行，状态持久化到 PostgreSQL |
| · 任务状态推送（飞书） | 1d | 每步完成/失败推送给老板 |
| **M1-M3 串联测试** | 2d | 10 条不同类型需求，从收到推PRD，自动化率 ≥ 70% |

#### 6.3.2 Sprint 1 产出

- ✅ 老板发送需求 → 自动生成 PRD → 拆解任务队列
- ✅ 所有任务串行执行，状态实时推送
- ✅ 端到端平均时间 < 30 分钟（纯 AI 执行，不含人工确认）

---

### 6.4 Sprint 2：测试 + 交付完善（2 周）

**目标**：代码自动测试，产物自动交付。

#### 6.4.1 详细任务

| 任务 | 工时 | 验收标准 |
|------|------|----------|
| **M5: Test Agent** | | |
| · 单元测试生成（基于代码 AST） | 2d | 为 Dev Agent 生成的代码生成 pytest 测试用例 |
| · 测试自动运行（GitHub Actions） | 1d | PR 创建后自动触发 Actions 运行测试 |
| · 测试报告生成 | 1d | 输出覆盖率报告，< 60% 覆盖率告警 |
| **M5 测试标准（定量）** | | |
| · 有效覆盖率 | — | 排除永真断言、重复测试后的覆盖率 ≥ 70% |
| · 边界用例数 | — | 每个 API 至少覆盖：正常值、空值、超长（>1000字符）、非法类型（int 传 string） |
| · 安全扫描 | — | Bandit + Semgrep，OWASP Top 10 每条有对应检测规则 |
| · 漏洞分级 | — | Critical/High/Medium/Low，**Critical 必须修复才能合并** |
| · 失效感知 | — | 测试通过后，随机注入已知 bug（≥3 个），验证测试能检测出 ≥ 2 个 |
| **M9: 产物交付** | | |
| · 交付物汇总生成器 | 1d | 自动汇总：PRD + 代码 PR 链接 + 测试报告 |
| · GitHub Wiki 页面更新 | 1d | 汇总写入 Wiki，每需求一个页面 |
| **M7: Human-in-the-Loop v1** | | |
| · HiL 节点确认（PRD 确认） | 1d | PM Agent 出 PRD 后暂停，等待老板"确认" |
| · 确认超时处理 | 1d | 48h 无响应 → 每日提醒 |
| **M8: 共享上下文** | | |
| · 上下文读写封装 | 1d | 各 Agent 可读取当前需求的所有上下文 |
| **集成测试** | 2d | 完整链路测试（需求 → PRD确认 → 代码 → 测试 → 报告） |

---

### 6.5 Sprint 3：运维 + 稳定性（2 周）

**目标**：部署自动化，平台可观测，错误可恢复。

#### 6.5.1 详细任务

| 任务 | 工时 | 验收标准 |
|------|------|----------|
| **M6: Ops Agent** | | |
| · Dockerfile 生成 | 1d | 根据技术栈自动生成 Dockerfile |
| · GitHub Actions CI/CD | 2d | 提交 PR → 自动构建 Docker 镜像 → 推送到 Hub |
| · 预发布环境部署 | 1d | Actions 完成后自动部署到预发布环境（服务器） |
| **M7: Human-in-the-Loop v2** | | |
| · HiL 节点2（预发布确认） | 0.5d | 预发布部署完成后暂停 |
| · HiL 节点3（生产上线确认） | 0.5d | 预发布验收后，生产上线前暂停 |
| · HiL 按钮交互（飞书） | 1d | 支持"确认部署"按钮，而非纯文字 |
| **M10: 可观测性** | | |
| · 统一日志模块（structlog） | 1d | 所有 Agent 日志 JSON 格式，含：task_id、agent_name、level、timestamp、message |
| · 飞书推送完善 | 1d | 进度卡片（文字+emoji 进度条） |
| · 失败告警推送 | 0.5d | Agent 失败 → 立即推送老板 |
| **稳定性** | | |
| · Agent 失败自动重试 | 1d | API 超时等临时错误自动重试 2 次 |
| · PostgreSQL 连接池（PGBouncer） | 0.5d | 并发场景不出现连接耗尽 |
| · 配置热加载 | 0.5d | 修改 config.yaml 不重启服务 |

---

### 6.6 Sprint 4：端到端验收（1 周）

**目标**：稳定可用，文档完整，准备对外演示。

| 任务 | 工时 | 验收标准 |
|------|------|----------|
| 全链路集成测试（20 条真实需求） | 2d | 成功率 ≥ 85%，平均交付时间 < 2h |
| Bug 修复 | 1d | 所有 P0/P1 Bug 修复完成 |
| 技术文档完善 | 1d | README + 开发者文档 + 部署文档 |
| 演示流程录制 | 0.5d | 录制一条需求端到端演示视频 |
| 复盘 + 下一版本规划 | 0.5d | Sprint 复盘会议，输出 v1.1 计划 |

---

### 6.7 Sprint 看板（MVP）

```
待开发        │ 进行中        │ 测试中        │ 完成
──────────────┼───────────────┼───────────────┼───────────────
Sprint 0:     │ M1 意图分类器  │               │ Sprint 0 全部 ✅
Sprint 1:     │ M2 PRD生成    │               │
M1 Intake     │ M3 任务拆解   │               │
M2 PM Agent   │               │               │
M3 编排引擎   │               │               │
Sprint 2:     │               │               │
M5 Test Agent │               │               │
M7 HiL v1     │               │               │
M9 产物交付   │               │               │
Sprint 3:     │               │               │
M6 Ops Agent  │               │               │
M7 HiL v2/v3  │               │               │
M10 可观测性  │               │               │
Sprint 4:     │               │               │
全链路验收    │               │               │
```

---

## 附录

### A. 飞书 Bot 接入 Checklist

- [ ] 创建飞书企业自建应用
- [ ] 配置机器人能力
- [ ] 获取 App ID + App Secret，换取 tenant_access_token
- [ ] 配置消息 Webhook URL（指向 FastAPI 服务）
- [ ] 添加 Bot 到群/单聊
- [ ] 配置权限（接收消息、发送消息、读写文件）

### B. GitHub PAT 权限 Checklist

- [ ] 生成 Classic PAT（repo + admin:org）
- [ ] 配置为 GitHub Secret（ Actions 用）
- [ ] 配置 repo 权限（tianw1155-hub/ai_study）

### C. Prompt 迭代策略

MVP 阶段 LLM 质量是关键瓶颈。建议：

1. **先跑通，再优化**：先用基础 Prompt 验证流程
2. **建立评测集**：收集 20 条典型需求，作为每次 Prompt 迭代的回归测试集
3. **Track 失败模式**：记录 LLM 典型失败（如：代码无法运行、PRD 缺关键字段），针对性优化 Prompt

---

*文档版本：v1.1 | 最后更新：2026-03-24 | **需重新评审**
