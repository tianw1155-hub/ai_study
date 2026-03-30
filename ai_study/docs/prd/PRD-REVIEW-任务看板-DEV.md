# PRD-REVIEW-任务看板-DEV

> 评审人：开发工程师视角
> 评审日期：2026-03-28
> 评审文件：PRD-任务看板.md
> 评审结论：**有条件通过（需修改后置项）**

---

## 维度一：技术可行性（Kanban 状态机）

### 1.1 状态机完整性 ✅ 基本可用

状态机定义了 7 个状态、12 条流转规则，结构清晰，覆盖了主要路径。

**优点：**
- 状态枚举完整（pending/running/testing/passed/failed/cancelled/completed）
- 失败重试机制定义明确（3次上限，指数退避 10s→30s→90s）
- 用户取消路径覆盖了 pending/running/testing 三个可取消状态
- 重试超限永久失败，防止无限循环

### 1.2 🔴 严重问题：Kanban 5列与状态机 7 状态不匹配

**问题描述：** Kanban 页面设计为 5 列，但状态机有 7 个状态，两者存在明显缺口：

| 状态 | Kanban 列归属 | 是否明确 |
|------|--------------|---------|
| pending | 待处理 COL_1 | ✅ |
| running | 处理中 COL_2 | ✅ |
| testing | 测试中 COL_3 | ✅ |
| passed | ❓ 未明确 | 🔴 |
| failed | 已失败 COL_5 | ✅ |
| cancelled | ❓ 无列显示 | 🔴 |
| completed | 已完成 COL_4 | ⚠️ 歧义 |

**具体矛盾：**
1. `cancelled` 任务（US-3 用户取消后）没有对应的 Kanban 列。取消后任务是从看板上消失，还是归入某一列？若无列可归，US-3 的"任务进入 cancelled 列"设计无法落地。
2. `passed` 状态也未明确映射到哪个列。`passed` 与 `completed` 都被映射到"已完成"，但两者含义不同（passed = 测试通过，completed = 已交付），存在歧义。

**建议修复：**
- 方案A（推荐）：Kanban 保留 5 列，但明确 `cancelled` 任务通过筛选器隐藏（不删除），`passed` 并入"已完成"列
- 方案B：Kanban 扩展为 6 列，明确增加"已取消"列
- 无论哪种方案，PRD 必须明确说明 `cancelled` 的视觉表现

### 1.3 ⚠️ 状态机边界条件未定义

以下流转路径在状态机中**缺失或模糊**：

| 路径 | 问题 |
|------|------|
| `cancelled` → ? | 已取消任务能否重新激活？用户反悔情况未定义 |
| `completed` → ? | 已交付任务是否有后续操作入口？|
| `running` → `cancelled` | 如果 running 任务被取消，Agent 端如何优雅中止（是否有 cancel signal）？Temporal 的 Activity 取消机制需要明确 |
| `failed` 永久失败后 | 状态机标注"永久"，但看板是否单独标记（区别于普通 failed）？|

### 1.4 ⚠️ `pending` 状态的 Agent 认领机制缺失

状态机定义 `pending` → `running` 转换由 **System** 触发（Agent_claim），但以下问题未解答：

- 单个 pending 任务如何分配给特定 Agent（PM/Dev/Test）？
- 是否存在多 Agent 并行处理同一个 pending 任务的情况？
- Temporal Workflow 如何感知 pending 任务并自动分配？

从 SYSTEM PRD 看，PM Agent → Dev Agent → Test Agent 是串行 DAG，但任务看板的 pending/running 列设计更像是**并行任务池**（多个 code/test/deploy 任务同时 running）。这两套模型之间存在隐含矛盾。

**建议：** 在状态机中增加 Agent 类型字段（如 `agent_type: coder | tester | deployer`），并在 pending → running 时明确指定 Agent 类型，避免混淆。

---

## 维度二：验收标准是否定量可测

### 2.1 Must 等级 ✅ 大部分可测

| ID | 标准 | 可测性 | 问题 |
|----|------|--------|------|
| M-1 | 2秒内完成渲染 | ✅ 有明确时间指标 | "页面加载后 2 秒内"指什么？首屏可见？全部卡片加载完成？需明确 |
| M-2 | 任务状态与列位置一致，准确率 100% | ✅ 可自动化测试 | |
| M-3 | 状态变更延迟 < 500ms | ⚠️ 测量位置不明确 | SYSTEM PRD 中 Go API 轮询 Temporal 间隔为 3s，500ms 要求是前端渲染延迟还是后端状态同步延迟？两者属于不同层级 |
| M-4 | 4个Tab全部可切换，内容正确 | ⚠️ "内容正确"无法量化 | 需补充断言条件（如：概述Tab显示哪些字段） |
| M-5 | 取消后更新 < 1s | ✅ 有时间指标 | |
| M-6 | failed任务重试后重新入列running | ✅ 可自动化测试 | |

### 2.2 ⚠️ 关键矛盾：M-3 与 SYSTEM PRD 架构不兼容

SYSTEM PRD（v0.4）Section 3.4 明确写道：

> "Go API 每 **3 秒**轮询一次 Temporal 任务状态"

但 M-3 要求"**状态变更延迟 < 500ms**"。这两者存在根本矛盾：

- 最乐观情况：状态变更是 polling 周期的开始时，最长延迟 = 3s（> 500ms）
- 若 M-3 指**前端渲染延迟**（从 WebSocket 收到到页面更新），则可达成
- 若 M-3 指**后端状态同步延迟**（Temporal 状态变更多久后 Go API 能感知），则不可能达到

**建议：**
- M-3 改为："前端 WebSocket 推送接收后渲染延迟 < 500ms"（S-2 已覆盖后端同步）
- 或：接受 3s polling 间隔，调整 M-3 指标为 < 3.5s

### 2.3 Should / Could 等级 ✅ 指标较清晰

S-1（60fps）、S-2（WebSocket < 1s）、S-3（剪贴板内容正确）、S-4（筛选结果准确）均有明确可测指标。

**C-1（任务拖拽）需特别注意：** 描述"拖拽后状态机验证，非法流转拦截"，但未定义拦截 UI。用户拖拽到非法列时，是禁止放置（drag 限制）还是允许放置后 toast 报错？实现成本差异很大。

---

## 维度三：页面布局和交互

### 3.1 ✅ 整体布局合理

布局设计清晰：
- 顶部汇总行（总任务数 + 各列计数）设计合理，便于快速判断瓶颈
- 响应式断点（1280/768/768）符合主流设备分布
- 骨架屏、空状态、网络错误三重 loading 设计完整
- 卡片 fade-out 取消动画细节体验良好

### 3.2 ⚠️ 详情抽屉 480px 宽度问题

桌面端 480px 详情抽屉在**双栏布局**（假设任务看板所在页面还有左侧导航或需求信息侧栏）下可能空间不足。需明确：

- 480px 是相对于视口还是相对于看板区域？
- 若相对于看板区域，减去看板宽度（约 5 × 200px = 1000px），剩余空间是否足够？

建议增加"详情抽屉最大宽度不超过视口 50%"的约束。

### 3.3 ⚠️ 筛选器交互需细化

US-4 和 S-4 提到筛选功能，但以下细节缺失：

- 筛选条件是"多选"还是"单选"？
- 筛选后的视图是否保留？还是每次刷新重置？
- "只看代码任务"筛选的是 `type: code` 字段，还是过滤掉 test/deploy/document 类型？
- 筛选器 UI 是下拉多选、标签切换、还是 checkbox 列表？

### 3.4 ⚠️ Tab 切换内容区高度问题

4 个 Tab（概述/输入/输出/日志）内容区高度未定义。若某一 Tab 内容超出容器：
- 是否支持滚动？（概述可能内容少，日志可能内容极多）
- 滚动是容器内滚动还是页面级滚动？

---

## 维度四：与 SYSTEM PRD 技术栈一致性

### 4.1 ⚠️ WebSocket 事件类型不一致

SYSTEM PRD（Section 3.4）定义的 WebSocket 事件：

```
task:started / task:progress / task:completed / task:failed
```

但任务看板 PRD 的 S-2 要求"**WebSocket 推送，更新延迟 < 1s**"，Kanban 依赖的是状态变更推送。问题：

- Kanban 的 5 列状态（pending/running/testing/...）如何映射到这 4 个事件？
- 当 `running` → `testing` 转换时，推送的是 `task:progress` 还是需要更细分的事件？
- 当 `pending` → `running` 时，`task:started` 可以覆盖，但 `passed` / `cancelled` 状态没有对应事件

**建议：** 在 SYSTEM PRD 的 WebSocket 事件列表中增加：
- `task:state_changed` — 携带 `from_state` / `to_state` / `task_id` 字段，满足 Kanban 细粒度更新需求

### 4.2 ✅ 技术栈基本一致

| 技术点 | SYSTEM PRD 定义 | 任务看板 PRD | 一致性 |
|--------|----------------|-------------|--------|
| 前端框架 | React / Next.js | React（隐含） | ✅ |
| 实时通信 | WebSocket | WebSocket | ✅ |
| 任务编排 | Temporal | Temporal（状态机规则） | ✅ |
| 数据库 | PostgreSQL | JSONB 数据结构 | ✅ |
| 前端状态管理 | 未明确 | 未明确 | ⚠️ 建议明确使用 Zustand / Redux / React Query |

### 4.3 ⚠️ 前端状态管理方案未定义

SYSTEM PRD 未规定前端状态管理方案，任务看板作为复杂交互页面，涉及到：

- 看板列数据的增删改（WebSocket 实时更新）
- 详情抽屉的打开/关闭状态
- Tab 切换状态
- 筛选条件状态
- 虚拟滚动列表状态

建议 PRD 增加前端状态管理方案选型（推荐：**React Query + Zustand**，React Query 管服务端状态，Zustand 管 UI 状态）。

### 4.4 ⚠️ 卡片字段与数据库 schema 的对应关系未定义

任务卡片暴露的字段（id/title/type/priority/assignee/estimatedDuration/actualDuration/retryCount）在 SYSTEM PRD 的 `tasks` 表中未明确定义列。`estimatedDuration`、`actualDuration`、`retryCount` 是否已有表字段对应？若没有，是新增字段还是通过 JSONB 存储？

---

## 总结：需要修改的 P0 项

| # | 问题 | 严重性 | 建议 |
|---|------|--------|------|
| P0-1 | Kanban 5列与状态机 7状态不匹配，`cancelled`/`passed` 列归属未定义 | 🔴 阻塞开发 | 明确 `cancelled` 不显示或增加列；`passed` 并入已完成列 |
| P0-2 | M-3（状态变更延迟 < 500ms）与 SYSTEM PRD 3s polling 矛盾 | 🔴 阻塞开发 | 修正指标定义，区分前端渲染延迟 vs 后端同步延迟 |
| P0-3 | 状态机缺少 `pending` → `running` 的 Agent 类型和分配机制说明 | 🔴 阻塞开发 | 增加 `agent_type` 字段，定义分配规则 |
| P0-4 | WebSocket 事件类型与 Kanban 状态更新需求不匹配 | 🔴 阻塞开发 | 增加 `task:state_changed` 事件或等效机制 |
| P1-1 | `cancelled` 任务取消后的视觉表现未定义 | ⚠️ 影响 UX | 明确取消后任务是否从看板消失 |
| P1-2 | `completed` 状态与其他状态的边界（与 passed 的区别） | ⚠️ 影响理解 | 补充 `completed` 的触发条件和含义 |
| P1-3 | 前端状态管理方案未定义 | ⚠️ 影响技术选型 | 推荐 React Query + Zustand |
| P1-4 | 卡片字段与数据库 schema 对应关系未定义 | ⚠️ 影响数据层开发 | 补充 `tasks` 表字段定义 |
| P2-1 | M-1 "2秒内完成渲染"指标边界不清晰 | 影响验收 | 明确是指首屏可见还是全部卡片加载完成 |
| P2-2 | 筛选器交互细节缺失 | 影响 UX 设计 | 补充筛选器 UI 类型和交互逻辑 |
| P2-3 | C-1 拖拽拦截的 UI 方案未定义 | 影响实现成本 | 明确是 drag 限制还是放置后报错 |
| P2-4 | 详情抽屉宽度 480px 在双栏布局下可能不足 | 影响布局实现 | 增加最大宽度约束 |
| P2-5 | 状态机边界条件（cancelled 能否复活等）未定义 | 影响状态机健壮性 | 补充边界路径定义 |

---

## 评审结论

**有条件通过。**

状态机的核心流转逻辑设计合理，重试机制和用户取消路径完整，这是本 PRD 的亮点。但存在 4 个 P0 阻塞项必须在上游（SYSTEM PRD 修订或本 PRD 明确）解决后才能进入开发阶段：

1. Kanban 列与状态机的状态覆盖不完整
2. 状态变更延迟指标与底层 polling 机制矛盾
3. pending 任务 Agent 分配机制缺失
4. WebSocket 事件类型不足

建议优先与 SYSTEM PRD 评审人确认上述 P0 问题的解决方案，再推进任务看板开发。

---

*评审版本：v1.0 | 评审人：开发工程师*
