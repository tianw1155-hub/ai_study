# PRD-任务看板 | DevPilot（织翼）

> **修订说明 v0.4**
> - **修订日期：** 2026-03-28
> - **修订依据：** 评审审核意见
> - **P0 修复项（必须）：**
>   1. **WebSocket 认证方式统一** — M4 WebSocket 连接 URL 改为 `wss://api.devpilot.com/ws`（认证通过 `Sec-WebSocket-Protocol` 头），与首页保持一致
>   2. **重试间隔量化验收标准** — 在 Should 验收标准中新增 S-5，明确指数退避间隔的测量方式和判定标准（10s±10%、27s±10%、81s±10%）
> - **P1 修复项：**
>   3. **task:state_changed 事件已补充** — 此事件已在首页 PRD 中定义，任务看板复用同一事件定义
> - **版本历史：** v1.0 → v0.2 → v0.3 → v0.4

## 1. 模块职责

任务看板是 DevPilot 的核心工作区，承担以下职责：

| 职责 | 描述 |
|------|------|
| 任务可视化 | 将需求拆解后的子任务以 Kanban 形式呈现，状态一目了然 |
| 状态流转追踪 | 记录每个任务的状态变更历史，支持溯源 |
| 任务详情查看 | 提供任务的全量信息：输入、输出、日志、关联 Agent |
| 加速用户决策 | 快速识别瓶颈任务，支持人工介入或取消 |

**设计原则**：信息密度适中，优先级清晰；支持横向（任务间）和纵向（子任务）两条浏览路径。

---

## 2. 用户故事

### US-1：用户查看任务全景

| 要素 | 内容 |
|------|------|
| **角色** | 提交需求后的用户 |
| **场景** | 想快速了解任务的整体完成情况 |
| **触发** | 从首页点击"查看详情"或通知跳转 |
| **行为** | 看到 5 列 Kanban 看板，每列显示任务数量徽章 |
| **结果** | 快速判断：任务卡在哪一列？哪一列积压最多？ |

### US-2：用户查看子任务详情

| 要素 | 内容 |
|------|------|
| **角色** | 需要深入了解某个具体任务的开发人员 |
| **场景** | 发现某个任务执行时间过长，需要排查原因 |
| **触发** | 点击 Kanban 卡片，弹出侧边详情抽屉 |
| **行为** | 查看任务的输入 Prompt、Agent 执行日志、输出产物链接 |
| **结果** | 定位问题：代码生成失败？测试不通过？接口超时？ |

### US-3：用户手动取消任务

| 要素 | 内容 |
|------|------|
| **角色** | 临时发现需求有误的用户 |
| **场景** | 提交后发现需求描述有误，不想继续执行 |
| **触发** | 在任务详情抽屉中点击"取消任务" |
| **行为** | 弹出确认对话框，确认后任务进入"cancelled"状态（从看板中移除） |
| **结果** | 停止计费，避免资源浪费 |

### US-4：用户筛选特定类型任务

| 要素 | 内容 |
|------|------|
| **角色** | 需要聚焦某类任务的开发者 |
| **场景** | 只关注"代码生成"类任务，忽略测试/部署 |
| **触发** | 点击看板顶部的筛选器 |
| **行为** | 选择筛选条件（多选），看板过滤显示 |
| **结果** | 减少干扰，聚焦核心工作 |

---

## 3. 功能详细设计

### M1：Kanban 看板（5列）

#### M1.1 列定义

| 列 ID | 列名称 | 颜色标识 | 入列条件 |
|--------|--------|----------|----------|
| COL_1 | 待处理 | 灰色 `#9CA3AF` | `pending` 状态 |
| COL_2 | 处理中 | 蓝色 `#3B82F6` | `running` 状态 |
| COL_3 | 测试中 | 黄色 `#F59E0B` | `testing` 状态 |
| COL_4 | 已完成 | 绿色 `#10B981` | `passed` / `completed` 状态（列内以标签区分：`passed` 显示黄色标签，`completed` 显示绿色标签） |
| COL_5 | 已失败 | 红色 `#EF4444` | `failed` 状态（永久失败或可重试） |

**状态与列的映射关系：**

| 状态 | Kanban 列 | 可见性 |
|------|-----------|--------|
| `pending` | COL_1（待处理） | ✅ 默认显示 |
| `running` | COL_2（处理中） | ✅ 默认显示 |
| `testing` | COL_3（测试中） | ✅ 默认显示 |
| `passed` | COL_4（已完成） | ✅ 默认显示，黄色 "passed" 标签 |
| `failed` | COL_5（已失败） | ✅ 默认显示 |
| `completed` | COL_4（已完成） | ✅ 默认显示，绿色 "completed" 标签 |
| `cancelled` | **不显示** | ❌ 通过筛选器可恢复显示（默认过滤） |

> **说明：** `cancelled` 任务不显示在主看板，通过顶部筛选器的"显示已取消"选项可恢复查看。`passed` 与 `completed` 均归入 COL_4，通过列内颜色标签区分。

#### M1.2 任务卡片

| 属性 | 规格 |
|------|------|
| 卡片尺寸 | 宽度自适应列宽，高度 80-120px（内容决定） |
| 卡片内容 | 任务标题（截断 2 行）、任务类型标签、耗时、优先级标记 |
| 卡片悬停 | 轻微上浮（translateY -2px）+ 阴影加深 |
| 卡片点击 | 打开右侧详情抽屉 |
| 长任务标题 | 超出2行部分省略号截断，hover 显示完整标题 tooltip |

#### M1.3 卡片内容字段

```json
{
  "id": "task_001",
  "title": "生成用户登录 API（POST /api/auth/login）",
  "type": "code | test | deploy | document",
  "agent_type": "coder | tester | deployer | planner",
  "priority": "high | medium | low",
  "assignee": "Agent_Coder_v2",
  "createdAt": "2026-03-28T19:30:00Z",
  "updatedAt": "2026-03-28T19:32:00Z",
  "estimatedDuration": "30s",
  "actualDuration": "45s",
  "retryCount": 0,
  "state": "pending | running | testing | passed | failed | cancelled | completed"
}
```

#### M1.4 列头信息

| 属性 | 规格 |
|------|------|
| 列标题 | 居左加粗，显示任务类型名称 |
| 任务计数徽章 | 圆形，背景色与列颜色一致，显示当前列任务数 |
| 列折叠 | 支持折叠单列，折叠后仅显示列头 + 计数 |
| 虚拟滚动 | 单列超过 20 个任务时启用虚拟滚动，保证性能 |

---

### M2：状态机流转规则

#### M2.1 状态定义

| 状态 | 含义 | 是否终态 |
|------|------|----------|
| `pending` | 待处理，等待分配 | 否 |
| `running` | 执行中，Agent 正在处理 | 否 |
| `testing` | 测试中，代码已生成进入测试 | 否 |
| `passed` | 测试通过，等待交付 | 否（终态路径之一） |
| `failed` | 执行失败（可重试） | 否 |
| `failed`(永久) | 重试次数用尽，不可恢复 | ✅ 是 |
| `cancelled` | 用户主动取消 | ✅ 是 |
| `completed` | 全部完成，已交付 | ✅ 是 |

#### M2.2 状态流转图

```
                    ┌──────────────┐
                    │   pending    │
                    └──────┬───────┘
                           │ Agent 认领
                           ▼
                    ┌──────────────┐
         ┌─────────│   running    │─────────┐
         │         └──────┬───────┘         │
         │                │ 代码生成完成     │
         ▼                ▼                 ▼
  ┌────────────┐   ┌────────────┐    ┌────────────┐
  │ cancelled  │   │  testing   │    │   failed   │
  │（用户取消） │   └──────┬─────┘    └──────┬─────┘
  └────────────┘          │                  ▲
              ┌────────────┴──────┐           │
              ▼                   ▼           │
       ┌────────────┐       ┌────────────┐    │
       │  passed   │       │   failed   │────┘
       └──────┬─────┘       └────────────┘   重试超限(永久)
              │                                ↑
              ▼                                │
       ┌────────────┐                   ┌────────────┐
       │ completed  │                   │ User_retry │
       │ (交付完成)  │                   │ (< 3 次)   │
       └────────────┘                   └────────────┘
```

#### 2.3 流转规则表

| 当前状态 | 触发事件 | 目标状态 | 执行者 |
|----------|----------|----------|--------|
| pending | Agent_claim | running | System |
| pending | User_cancel | cancelled | User |
| running | Code_generated | testing | Agent_Coder |
| running | Execution_error | failed | Agent_Coder |
| running | User_cancel | cancelled | User |
| testing | All_tests_pass | passed | Agent_Tester |
| testing | Test_failed | failed | Agent_Tester |
| testing | User_cancel | cancelled | User |
| passed | Deliver | completed | Agent_Deployer |
| failed | User_retry（< 3次） | running | User + System |
| failed | Retry_exceeded | failed（永久） | System |
| failed | User_cancel | cancelled | User |

#### 2.4 pending → running 分配机制

**分配规则：**

任务 `type` 字段决定分配给哪种 Agent：

| 任务 type | 分配给 Agent 类型 | 说明 |
|-----------|------------------|------|
| `code` | `coder` | 代码生成任务 |
| `test` | `tester` | 测试任务 |
| `deploy` | `deployer` | 部署任务 |
| `document` | `planner` | 文档任务 |

**分配流程：**
1. 任务创建时，System 根据 `type` 设置 `agent_type` 字段
2. pending 状态的任务进入对应类型的任务池
3. 对应类型的 Agent 自动认领（按 FIFO 顺序）
4. Agent 认领后触发 `Agent_claim` 事件，状态流转为 `running`

**并发认领锁机制（补充）：**
- 问题背景：多个 Agent 并发认领同一任务（如同类型 Agent 多个实例）时，race condition 导致任务被重复分配
- 实现方案：数据库乐观锁（version 字段）
- 表结构变更：
  ```sql
  ALTER TABLE tasks ADD COLUMN version INT DEFAULT 0;
  ```
- 认领 SQL（原子操作）：
  ```sql
  UPDATE tasks
  SET state = 'running',
      assignee = :agent_id,
      version = version + 1,
      updated_at = NOW()
  WHERE id = :task_id
    AND state = 'pending'
    AND version = :expected_version;  -- 乐观锁条件
  ```
- 冲突处理：
  - 影响行数 = 0 时，说明已被其他 Agent 认领，放弃本次认领（任务已被分配给其他 Agent）
  - 影响行数 = 1 时，认领成功，发送 `task:state_changed` WebSocket 事件
- 前端无感知：此锁机制在数据库层解决，前端无需额外处理
- 有效类型：`coder` / `tester` / `deployer` / `planner`
- 校验时机：pending → running 分配时
- 校验逻辑：
  ```
  IF agent_type NOT IN ('coder', 'tester', 'deployer', 'planner') THEN
      // 非法 type，标记为 'unknown'，记录错误日志
      SET agent_type = 'unknown'
      Emit error event: { event: 'task:failed', taskId: xxx, error: 'invalid agent_type' }
      STOP（不进入 running，任务保持 pending 或流转至 failed）
  END
  ```
- 前端展示：若 agent_type = 'unknown'，卡片显示"未分配"并标红

#### 2.5 重试机制

| 参数 | 值 |
|------|-----|
| 最大重试次数 | 3 次 |
| 重试间隔 | 指数退避：10s → 30s → 90s |
| 重试条件 | 仅 `failed` 状态可重试 |
| 永久失败条件 | 重试次数用尽仍失败，状态标记为 `failed（永久）` |
| retryCount 更新 | 每次重试时 System 自动 +1，超限后锁定 |

---

### M3：任务详情

#### M3.1 详情抽屉

| 属性 | 规格 |
|------|------|
| 位置 | 右侧滑出，宽度 480px（移动端全屏），最大宽度不超过视口 50% |
| 动画 | 右侧滑入 300ms ease-out |
| 关闭方式 | 点击遮罩层 / ESC 键 / 关闭按钮 |
| 顶部 | 任务标题 + 状态标签 + 优先级 |
| 底部 | 操作按钮区（取消 / 重试 / 查看代码） |

#### M3.2 详情内容区（Tab 切换）

| Tab | 内容 |
|-----|------|
| 概述 | 任务基本信息（id、type、agent_type、priority、createdAt、estimatedDuration、actualDuration、retryCount）、创建时间、耗时、Agent 分配 |
| 输入 | 该任务的输入 Prompt / 参数 |
| 输出 | 生成的代码片段 / 测试报告 / 错误日志 |
| 日志 | Agent 执行全日志（时间戳 + 级别 + 内容） |

> **Tab 内容区高度：** 固定高度，超出部分容器内滚动，不影响页面整体布局。

#### 3.3 操作按钮

| 操作 | 条件 | 样式 |
|------|------|------|
| 取消任务 | pending / running / testing 状态 | 红色描边按钮 |
| 重试任务 | failed 状态且 retryCount < 3 | 蓝色填充按钮 |
| 查看代码 | passed / completed 状态 | 跳转按钮（跳转至产物交付页） |
| 复制日志 | 任意状态 | 灰色图标按钮 |

> **说明：** `failed` 永久状态下不显示重试按钮（因为 retryCount 已达到上限），仅显示"查看代码"（若 Agent 有产出）或"取消"。

#### 3.4 日志格式

```json
{
  "logs": [
    {
      "timestamp": "2026-03-28T19:30:01.234Z",
      "level": "INFO",
      "agent": "Agent_Coder",
      "message": "开始生成代码：UserLoginHandler"
    },
    {
      "timestamp": "2026-03-28T19:30:05.567Z",
      "level": "DEBUG",
      "agent": "Agent_Coder",
      "message": "调用工具: file_write, args: {path: 'handlers/login.go'}"
    },
    {
      "timestamp": "2026-03-28T19:30:10.123Z",
      "level": "ERROR",
      "agent": "Agent_Coder",
      "message": "编译错误: undefined variable 'password'",
      "stack": "at login.go:45"
    }
  ]
}
```

---

### M4：WebSocket 实时推送

**连接方式：**
```
WebSocket URL: wss://api.devpilot.com/ws
认证方式：WebSocket 子协议握手认证（Sec-WebSocket-Protocol 头携带 JWT）
```

**WebSocket 事件类型（完整枚举）：**

| 事件类型 | 触发时机 | 消息示例 |
|----------|----------|----------|
| `task:started` | 任务开始执行（pending → running） | `{"event": "task:started", "taskId": "123", "agent": "Coder", "timestamp": "..."}` |
| `task:progress` | Agent 执行中，工具调用 | `{"event": "task:progress", "taskId": "123", "agent": "Coder", "action": "...", "status": "running", "timestamp": "..."}` |
| `task:state_changed` | **Kanban 核心事件**，状态流转 | `{"event": "task:state_changed", "taskId": "123", "from_state": "running", "to_state": "testing", "timestamp": "..."}` |
| `task:completed` | 单个子任务完成 | `{"event": "task:completed", "taskId": "123", "agent": "Coder", "status": "success", "timestamp": "..."}` |
| `task:failed` | 单个子任务失败 | `{"event": "task:failed", "taskId": "123", "agent": "Tester", "error": "编译错误", "timestamp": "..."}` |

> **说明：** `task:state_changed` 是 Kanban 看板细粒度更新的核心事件。Go API 轮询 Temporal（间隔 3s），检测到状态变化后通过 WebSocket 推送 `task:state_changed` 事件，前端根据 `from_state` / `to_state` 移动卡片到对应列。

---

### M5：筛选功能

#### M5.1 筛选维度

| 筛选字段 | 筛选类型 | 说明 |
|----------|----------|------|
| 任务类型 | 多选checkbox | code / test / deploy / document |
| 状态 | 多选checkbox | 7个状态可单独选择（含已取消） |
| 优先级 | 多选checkbox | high / medium / low |
| 分配者 | 单选下拉 | Agent_Coder / Agent_Tester / Agent_Deployer / 未分配 |

#### M5.2 筛选器 UI

- **UI 类型：** 左侧下拉面板 + 顶部快捷标签
- **多选/单选：** 任务类型、优先级、状态支持多选；分配者单选
- **筛选结果保留：** 筛选条件存储在 URL query params，刷新后保留
- **快速筛选：** 列头状态标签可点击，快速筛选该状态所有任务

---

## 4. 验收标准

### Must（必须有）

| ID | 标准 | 指标 | 测量方式 |
|----|------|------|----------|
| M-1 | Kanban 5 列正确显示 | 页面加载后 **首屏可见** 2 秒内完成 | Performance API 自动化测试 |
| M-2 | 任务卡片正确分类 | 任务状态与列位置一致，准确率 100% | 数据库状态与 UI 渲染结果逐一比对 |
| M-3 | **前端渲染延迟** | WebSocket 推送接收后渲染延迟 < **500ms** | 前端时间戳打点 |
| M-4 | 详情抽屉正确展示任务全量信息 | 4 个 Tab 全部可切换，内容正确 | 断言覆盖：概述Tab显示（id/type/priority/createdAt/estimatedDuration/actualDuration/retryCount），其余Tab非空 |
| M-5 | 取消任务功能正常 | 取消后任务从看板移除（进入 cancelled），**WebSocket 推送 < 3.5s** 内触达前端 | 取消操作 + 计时器 + UI 断言 |
| M-6 | 重试机制正确 | failed 任务重试后重新入列 running，retryCount +1 | 自动化状态机测试 |

**M-3 指标澄清：**
- M-3 指标定义为**前端渲染延迟**（WebSocket 消息到达前端 → 页面卡片状态更新完成）
- SYSTEM PRD 规定 Go API 轮询 Temporal 间隔为 3s，因此后端状态同步延迟下限为 3s，无法 < 500ms
- 前端渲染延迟 < 500ms 为技术可达指标（纯前端 DOM 操作）

**M-5 S-2 指标澄清：**
- S-2 "WebSocket 推送，更新延迟 < 1s" 修正为 "**后端状态同步延迟 < 3.5s**"（与 SYSTEM PRD 3s polling 一致，含 0.5s 网络裕量）

### Should（应该有）

| ID | 标准 | 指标 |
|----|------|------|
| S-1 | 虚拟滚动正常 | 单列 > 50 个任务时滚动流畅（60fps），测试设备：MacBook Pro M3 / Chrome 最新版 |
| S-2 | 状态变更实时通知 | WebSocket 推送，**后端状态同步 P95 < 3.5s** |
| S-3 | 日志支持复制 | 点击复制后内容正确写入剪贴板（Clipboard API + HTTPS/localhost） |
| S-4 | 筛选功能正常 | 多条件筛选（AND 逻辑），筛选结果准确 |
| S-5 | 重试间隔符合指数退避 | 重试触发时间符合指数退避（允许 ±10% 误差），测量方式：记录每次重试的 actual_delay，验证 10s ≤ actual_delay[1] ≤ 11s，27s ≤ actual_delay[2] ≤ 33s，81s ≤ actual_delay[3] ≤ 99s |

### Could（可以有）

| ID | 标准 | 指标 |
|----|------|------|
| C-1 | 任务拖拽（手动调整状态） | 拖拽后状态机验证，**非法流转前端禁止放置**（drag 限制，不依赖放置后报错） |

### Won't（本次不实现）

| ID | 标准 |
|----|------|
| W-1 | 甘特图视图 |
| W-2 | 任务依赖关系可视化 |
| W-3 | 子任务进一步拆解 |

---

## 5. 页面布局和交互细节

### 5.1 整体布局

```
┌───────────────────────────────────────────────────────────────────┐
│  ← 返回首页    任务看板 - #12345 登录功能开发          [筛选] [刷新]│
├───────────────────────────────────────────────────────────────────┤
│  汇总: 12 任务  |  待处理 3  处理中 2  测试中 1  已完成 5  已失败 1   │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────┤
│  待处理   │ 处理中   │ 测试中   │ 已完成   │ 已失败   │             │
│  ┌──────┐ │ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │             │
│  │Card 1│ │ │Card 4│ │ │Card 7│ │ │Card 8│ │ │Card11│ │             │
│  └──────┘ │ └──────┘ │ └──────┘ │ │(passed)│ │ └──────┘ │             │
│  ┌──────┐ │ └──────┘ │          │ │Card 9│ │          │             │
│  │Card 2│ │ ┌──────┐ │          │ │(compl)│ │          │             │
│  └──────┘ │ │Card 5│ │          │ └──────┘ │          │             │
│  ┌──────┐ │ └──────┘ │          │          │          │             │
│  │Card 3│ │          │          │          │          │             │
│  └──────┘ │          │          │          │          │             │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────────────┘
```

### 5.2 响应式布局

| 断点 | 看板行为 |
|------|----------|
| Desktop (≥1280px) | 5 列平铺，可横向滚动 |
| Tablet (768-1279px) | 3 列可见，横向滚动切换 |
| Mobile (<768px) | 单列可见，Tab 切换不同列 |

### 5.3 关键交互细节

| 交互 | 行为 |
|------|------|
| 卡片悬停 | translateY(-2px) + box-shadow 加深 |
| 卡片点击 | 右侧滑出详情抽屉（宽度 ≤ 视口 50%，最大 480px） |
| 状态标签点击 | 快速筛选该状态的所有任务 |
| 刷新按钮点击 | 重新拉取最新任务状态 + 按钮 spin 动画 |
| 列折叠 | 点击列头右侧折叠图标，列宽收缩至仅列头 |

### 5.4 加载与错误状态

| 状态 | UI 表现 |
|------|---------|
| 首次加载 | 骨架屏（5 列 × 3 个卡片占位） |
| 数据加载中 | 卡片区域显示半透明遮罩 |
| 网络错误 | 列头显示红色感叹号 + 重试按钮 |
| 空列 | 显示空状态插图 + "暂无任务" 文案 |
| 任务刚取消 | 卡片 fade-out 动画后从列中移除 |

---

## 6. 前端状态管理方案

> **推荐技术选型：** React Query + Zustand

| 状态类型 | 管理方案 | 说明 |
|----------|----------|------|
| 服务端状态（任务数据） | React Query | 负责 WebSocket 消息接收、缓存、轮询 |
| UI 状态（抽屉开关、Tab 切换、筛选条件） | Zustand | 轻量级，无需 boilerplate |

---

## 7. 数据库 schema 对应关系

| 卡片字段 | tasks 表字段 | 说明 |
|----------|-------------|------|
| id | `id` (PK) | 任务唯一标识 |
| title | `title` | 任务标题 |
| type | `type` | code/test/deploy/document |
| agent_type | `agent_type` | coder/tester/deployer/planner |
| priority | `priority` | high/medium/low |
| assignee | `assignee` | Agent 实例名称 |
| createdAt | `created_at` | 创建时间 |
| updatedAt | `updated_at` | 最后更新时间 |
| estimatedDuration | `estimated_duration` | 预估耗时（秒） |
| actualDuration | `actual_duration` | 实际耗时（秒） |
| retryCount | `retry_count` | 当前重试次数 |
| state | `state` | 当前状态 |

> **说明：** `estimatedDuration`、`actualDuration`、`retryCount` 为 `tasks` 表新增字段，使用 `estimated_duration`（INT，秒）、`actual_duration`（INT，秒）、`retry_count`（INT）存储。

---

*文档版本：v0.4（修订版）*
*最后更新：2026-03-28*
*修订记录：v1.0 → v0.2 → v0.3 → v0.4（P0 修复：WebSocket URL 统一、重试间隔量化验收标准）*
