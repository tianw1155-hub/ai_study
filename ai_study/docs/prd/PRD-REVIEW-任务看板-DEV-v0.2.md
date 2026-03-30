# PRD-任务看板 开发工程师评审报告 | DEV Review v0.2

> **评审人：** 开发工程师（Subagent）
> **评审日期：** 2026-03-28
> **评审对象：** PRD-任务看板.md（v0.2）
> **评审性质：** 技术可行性 + 设计一致性审查

---

## 一、P0 修复项逐一验证

### P0-1：Kanban 5列 vs 7状态不匹配 ✅ 已解决

**修复内容：** `cancelled` 不显示，`passed/completed` 归入 COL_4，通过颜色标签区分。

**验证：**
- M1.1 状态映射表完整列出全部 7 个状态，6 个正常显示，`cancelled` 标注"❌ 通过筛选器可恢复显示（默认过滤）"
- `passed` → COL_4 + 黄色标签，`completed` → COL_4 + 绿色标签，区分方案合理

**残留问题：**
- **M-2 验收标准**："数据库状态与 UI 渲染结果逐一比对"——由于 `cancelled` 默认不在看板显示，测试用例需明确使用筛选器恢复 `cancelled` 任务后再比对，否则无法覆盖全量 7 状态。建议 M-2 测试步骤中补充说明"需打开'显示已取消'筛选器后再次验证 cancelled 任务状态映射"。

---

### P0-2： "< 500ms"与轮询3s矛盾 ✅ 已解决

**修复内容：** 前端渲染 < 500ms，后端状态同步 < 3.5s。

**验证：**
- M-3 指标澄清：明确"WebSocket 消息到达前端 → 页面卡片状态更新完成"，定性为纯前端 DOM 操作，< 500ms 技术可达
- M-5 指标澄清：`cancelled` 后 WebSocket 推送 < 3.5s（3s polling + 0.5s 网络裕量），与 SYSTEM PRD 一致
- S-2 改为"后端状态同步 P95 < 3.5s"

**残留歧义（低优先级）：**
- M-5 定义"取消操作 + 计时器 + UI 断言"，计时起点是"用户点击取消"还是"后端接受请求"？建议补充明确为"用户点击取消按钮那一刻"。

---

### P0-3：pending→running 分配机制 ✅ 机制已补充

**修复内容：** 补充 `agent_type` 字段和 type → agent_type 映射表。

**验证：**
- M2.4 分配规则表：4 种 type → 4 种 agent_type，映射清晰
- 分配流程：任务创建 → System 设置 agent_type → 进入对应任务池 → Agent FIFO 认领 → Agent_claim 事件触发流转

**残留设计漏洞（需明确）：**

**漏洞 A：`agent_type` 未设置或设置错误时的兜底策略未定义**
- 如果任务创建时 `type` 为空或不在 code/test/deploy/document 范围内，System 无法设置 `agent_type`，任务将无法被认领
- 建议：Schema 层加 NOT NULL 约束 + 枚举限制，API 层对非法 type 返回 400 错误

**漏洞 B：多 Agent 并发认领同一任务的竞争条件**
- 多个同类型 Agent 空闲时，可能同时触发认领逻辑，导致race condition
- 建议：Temporal 层面需对 pending 任务的认领操作加锁（如 SELECT FOR UPDATE），只允许一个 Agent 成功 UPDATE state → running

---

### P0-4：WebSocket 事件不足 ✅ 已补充

**修复内容：** `task:state_changed` 事件携带 `from_state` / `to_state` / `task_id`。

**验证：**
- M4 事件表格明确列出 `task:state_changed`，携带全部 3 个字段
- 说明文字确认：Go API 轮询 Temporal → 检测状态变化 → 推送 `task:state_changed`

**残留问题：**
- `task:started` 与 `task:state_changed` 存在功能重叠：pending → running 时会同时触发 `task:started`（task:started 事件描述）和 `task:state_changed`（from:pending to:running）。前端可能收到重复事件，需明确去重策略（建议按 event type + taskId 做幂等，前端 Zustand store 中对同一 taskId 的状态更新取更新的那条）。

---

## 二、新发现的设计问题

### P1-A：状态机定义不一致——`failed（永久）` 在规则表中失踪

**问题描述：**
- M2.1 终态表标注 `failed（永久）` 为终态 ✅
- M2.2 流转图中有"重试超限(永久)"路径
- **M2.3 流转规则表中，目标状态只出现 `failed`，从未出现 `failed（永久）`**

这意味着当"重试次数用尽仍失败"时，系统不知道该流转到 `failed` 还是 `failed（永久）`。前端也无法正确展示"永久失败"状态（因为事件 payload 只带 `failed` 而不带永久标记）。

**建议修复：**
- 方案 1：M2.3 增加一行：`failed | Retry_exceeded | failed（永久） | System`，`failed（永久）` 单独作为一个状态值
- 方案 2：取消 `failed（永久）` 独立状态，改用 `retryCount = MAX(3)` + `isPermanent = true` 扩展字段标识永久失败

---

### P1-B：`passed` 是否终态描述模糊

**问题描述：**
- M2.1 表格：`passed` 标注"否（终态路径之一）"，括号内提到终态路径，但表格列"是否终态"填的是"否"
- 这容易产生歧义：`passed` 不是终态（可以到 `completed`），但它已经是测试阶段的终态

**建议修复：**
- M2.1 表格"是否终态"列：`passed` 改为"否（可流转至 completed）"，明确 `passed` 是中间终态（测试阶段终态），而非全局终态

---

### P1-C：`retryCount` 字段在卡片中可修改，但重试是由谁触发的？

**问题描述：**
- M2.5 重试机制：retryCount < 3 可重试，每次重试 +1
- US-3 取消任务：由用户在详情抽屉触发
- 但"重试"操作用户如何触发？US-3 中没有提到重试流程，US-4 筛选功能也没有覆盖重试

**建议：**
- US 系列故事补充 US-5："用户重试失败任务"，明确：点击"重试"按钮 → 弹出确认 → 确认后 task 入列 running，retryCount +1

---

### P1-D：M3.3 操作按钮中 `failed` 永久状态的展示逻辑存在歧义

**问题描述：**
- 表中描述："`failed` 永久状态下不显示重试按钮（因为 retryCount 已达到上限），仅显示'查看代码'（若 Agent 有产出）或'取消'"

但：
1. 如果永久失败且 Agent 无产出（running 阶段就失败了），"查看代码"按钮如何处理？
2. 永久失败的任务是否还允许"取消"？取消意味着什么（停止计费？删除任务？）—— 终态任务是否可以取消？

**建议：**
- 明确：终态任务（`cancelled` / `completed` / `failed` 永久）的操作按钮区应该如何展示，是否全部禁用操作按钮

---

### P1-E：前端 `task:state_changed` 事件的 `from_state` 使用场景不明确

**问题描述：**
- WebSocket 推送 `task:state_changed`，前端收到后需要将卡片从源列移动到目标列
- 但前端如果已经通过 React Query 维护了本地 cache，WebSocket 推送实际上是 cache update 的触发源
- 前端状态管理方案（M6）提到 React Query + Zustand，但没有说明 WebSocket 消息如何与 React Query 交互（invalidate / optimistic update / 直接写入 cache）

**建议补充：**
- M4 或 M6 中增加一节"前端 WebSocket 消息处理策略"，例如：收到 `task:state_changed` → 调用 `queryClient.setQueryData` 直接更新指定 taskId 的缓存 → Zustand 同步更新列排序

---

## 三、设计亮点（保留）

1. **筛选器与 URL 绑定**（M5.2）：刷新保留筛选条件，用户体验友好
2. **passed/completed 列内颜色标签**（M1.1）：解决了 7 状态 → 5 列的映射问题，同时保留了区分度
3. **重试指数退避**（M2.5）：10s → 30s → 90s，退避策略合理
4. **M-3/M-5/S-2 指标分层**（第4节）：将"前端渲染延迟"和"后端同步延迟"区分开来，解决了之前的矛盾

---

## 四、评审结论

| P0 项 | 修复状态 | 说明 |
|--------|----------|------|
| P0-1 Kanban 列-状态映射 | ✅ 已解决 | `cancelled` 过滤逻辑清晰，测试用例需补充覆盖 |
| P0-2 延迟指标矛盾 | ✅ 已解决 | 前后端延迟分层定义合理，无歧义 |
| P0-3 分配机制 | ⚠️ 机制已补充，存在 2 个漏洞 | 需补充 type 校验和并发认领锁 |
| P0-4 WebSocket 事件 | ⚠️ 已补充，存在重复事件问题 | 需前端去重策略 |

| 问题等级 | 数量 | 说明 |
|----------|------|------|
| P0（阻塞） | 0 | 无 |
| P1（重要） | 5 | 状态机 `failed（永久）` 不一致、`passed` 终态歧义、重试用户故事缺失、操作按钮歧义、WebSocket 前端处理策略缺失 |
| P2（次要） | 2 | M-5 计时起点歧义、`cancelled` 测试覆盖说明 |

**建议：v0.3 修复 P1-A（P0-3 补漏）和 P1-B 后可进入开发。**

---

*评审人：开发工程师 Subagent*
*评审时间：2026-03-28 20:40 GMT+8*
