# PRD Review — 任务看板 v0.2（测试工程师）

**评审人：** 测试工程师  
**评审日期：** 2026-03-28  
**评审版本：** v0.2  
**文件路径：** PRD-任务看板.md  

---

## 一、评审概述

本次评审重点针对上一轮 P0 修复项进行回归验证，并从测试角度审视状态机完整性、验收标准可测试性与遗留问题。整体修订质量良好，P0 修复项均已落实到位，但仍存在若干需补充的细节问题。

---

## 二、状态机完整性评审 ✅ / ⚠️

### 2.1 状态枚举

7 个状态定义完整：`pending`, `running`, `testing`, `passed`, `failed`, `failed(permanent)`, `cancelled`, `completed`。

| 状态 | 是否终态 | 备注 |
|------|----------|------|
| `pending` | 否 | |
| `running` | 否 | |
| `testing` | 否 | |
| `passed` | 否（终态路径之一） | |
| `failed`（可重试） | 否 | retryCount < 3 |
| `failed`（永久） | ✅ 是 | retryCount ≥ 3 |
| `cancelled` | ✅ 是 | |
| `completed` | ✅ 是 | |

### 2.2 流转路径（13 条）

| # | 当前状态 | 事件 | 目标状态 | 已覆盖 |
|---|----------|------|----------|--------|
| 1 | pending | Agent_claim | running | ✅ |
| 2 | pending | User_cancel | cancelled | ✅ |
| 3 | running | Code_generated | testing | ✅ |
| 4 | running | Execution_error | failed | ✅ |
| 5 | running | User_cancel | cancelled | ✅ |
| 6 | testing | All_tests_pass | passed | ✅ |
| 7 | testing | Test_failed | failed | ✅ |
| 8 | testing | User_cancel | cancelled | ✅ |
| 9 | passed | Deliver | completed | ✅ |
| 10 | failed | User_retry (< 3次) | running | ✅ |
| 11 | failed | Retry_exceeded | failed(permanent) | ✅ |
| 12 | failed | User_cancel | cancelled | ✅ |
| 13 | pending | *(无操作超时?) | - | ❌ 未定义 |

**✅ 上一轮缺失的 retry 路径已完整补充。**

### 2.3 残留问题

#### 问题 1：`pending` 超时未定义 ⚠️

状态机中未定义 `pending` 状态的任务如果长时间未被 Agent 认领（系统无响应、Agent 池无可用实例）的处理策略。建议补充：

```
pending → (超时 5min?) → failed / 告警
```

#### 问题 2：状态图缺少 `cancelled` 标注 ⚠️

流转图（M2.2）中，`running` 和 `testing` 到 `cancelled` 的 User_cancel 路径未在图中标注（仅在规则表中体现）。建议补充，以免开发实现时遗漏。

#### 问题 3：`passed` 状态的操作边界不清晰 ⚠️

`passed` 是"测试通过、等待交付"状态，在 M3.3 操作按钮中：
- `passed` 状态不显示"取消"按钮（因为没有出现在取消按钮条件里）
- `passed` 状态不显示"重试"按钮（重试条件仅限 failed）
- `passed` 状态可显示"查看代码"按钮

但如果交付过程中出现问题（例如交付失败），`passed → ?` 没有定义任何流转。建议明确：`passed` 是否允许取消？交付失败是否回退到 `failed`？

#### 问题 4：`failed(permanent)` 状态操作按钮缺失 ⚠️

M3.3 操作按钮中提到"failed 永久状态下不显示重试按钮"，但未定义该状态下有哪些可用操作。根据文档，该状态下仅"查看代码"（若有产出）或"取消"可见。但 `failed(permanent)` 已经是终态，`cancelled` 也是终态，同时显示"取消"按钮语义不合理（已无法取消已失败的任务）。建议明确：`failed(permanent)` 状态的操作按钮应仅保留"查看代码"（若有产出），不显示"取消"。

---

## 三、验收标准可测试性评审 ✅ / ⚠️

### 3.1 Must 类验收标准

| ID | 标准 | 可测试性 | 备注 |
|----|------|----------|------|
| M-1 | 首屏 2s 内完成 | ✅ 可自动化 | Performance API |
| M-2 | 任务状态与列位置一致，准确率 100% | ⚠️ 需澄清边界 | cancelled 任务不显示，但计为"正确"？测试集需覆盖 7 状态 × 5 列映射 |
| M-3 | 前端渲染延迟 < 500ms | ✅ 可自动化 | 前端时间戳打点 |
| M-4 | 详情抽屉 4 Tab 正确 | ✅ 可自动化 | UI 断言 |
| M-5 | 取消后 WebSocket < 3.5s 触达前端 | ✅ 可自动化 | 计时器 + UI 断言 |
| M-6 | 重试机制正确 | ✅ 可自动化 | 状态机测试 |

**M-2 需澄清：** `cancelled` 任务不显示在看板主视图，但 M-2 要求"状态与列位置一致，准确率 100%"。测试时，`cancelled` 是否计入分母？如果计入，则看板最多只显示 6 状态（不含 cancelled），M-2 的 100% 准确率是指这 6 状态？还是 7 状态？不建议将不可见状态计入准确率指标，建议修改为"显示中的任务状态与列位置一致，准确率 100%"。

**M-5 与 S-2 命名冲突：** M-5 原文为"WebSocket 推送 < 3.5s"，但根据 PRD 修订说明，已修正为"后端状态同步延迟 < 3.5s"（与 SYSTEM PRD 3s polling 一致）。建议统一命名，避免歧义。

### 3.2 Should 类验收标准

| ID | 标准 | 可测试性 | 备注 |
|----|------|----------|------|
| S-1 | 虚拟滚动 60fps | ✅ 可自动化 | Lighthouse / Performance API |
| S-2 | 后端状态同步 P95 < 3.5s | ✅ 可自动化 | 多次计时统计 P95 |
| S-3 | 日志复制剪贴板 | ✅ 可自动化 | Clipboard API |
| S-4 | 多条件筛选 AND 逻辑 | ✅ 可自动化 | 组合测试用例 |

### 3.3 Could 类验收标准

| ID | 标准 | 可测试性 | 备注 |
|----|------|----------|------|
| C-1 | 拖拽限制非法流转 | ⚠️ 需明确 | 文档说"非法流转前端禁止放置（drag 限制）"，但未定义哪些是合法 drag 起点→终点。测试需依赖这个定义 |

**C-1 问题：** 如果拖拽改变状态触发 `task:state_changed` 事件，则拖拽本身是一次状态变更操作。需要定义：
- 哪些状态可以发起拖拽？
- 拖拽到哪些列是合法的（触发流转）？
- 拖拽到哪些列是非法的（前端阻止）？

目前 PRD 未定义此约束，测试无法设计用例。

---

## 四、遗漏问题清单

### 🔴 P0（必须在开发前确认）

**P0-1：重试期间 User_cancel 的行为**

当 `failed` 状态的任务处于"等待重试间隔"期间（如 10s 退避中），用户是否可以取消？取消后 retryCount 是否保留？

- **影响：** 影响 M-6 重试机制测试用例设计
- **建议：** 明确"重试间隔中可取消，取消后 retryCount 保留记录，任务进入 cancelled 终态"

**P0-2：重复取消的幂等性**

用户对已经是 `cancelled` 状态的任务再次点击"取消"，系统应如何响应？（忽略/报错/无变化）

- **影响：** UI 操作健壮性测试
- **建议：** 明确为"幂等操作，后端返回当前状态不变，不报错"

**P0-3：`failed(permanent)` 状态操作按钮**

见 2.3 问题 4。建议明确该状态操作按钮集。

### 🟡 P1（开发前应确认）

**P1-1：`pending` 超时策略**

见 2.3 问题 1。

**P1-2：拖拽操作的合法流转约束**

见 3.3 C-1。

**P1-3：`passed` 交付失败路径**

见 2.3 问题 3。

**P1-4：WebSocket 断线重连策略**

M-5/S-2 要求 WebSocket 推送 < 3.5s 触达，但未定义网络中断（如 10s 断线）后的重连策略：
- 重连间隔？指数退避？
- 重连期间状态变更是否会丢失？
- 丢失的变更是否有补偿机制（如重新拉取 / 增量同步）？

**P1-5：重试上限 3 次的边界值测试**

3 次重试意味着 retryCount = 0, 1, 2 时可重试，retryCount = 3 时不可重试。需明确：retryCount 最大值是 3 还是等于 3 时触发永久失败？

---

## 五、已修复项确认

| 修复项 | 状态 | 验证结果 |
|--------|------|----------|
| Kanban 5列 vs 7状态 | ✅ | cancelled 不显示，passed/completed 归入 COL_4，列内标签区分 |
| "< 500ms"与轮询3s矛盾 | ✅ | M-3 修正为前端渲染延迟，S-2 修正为 < 3.5s |
| pending→running 分配机制 | ✅ | M2.4 完整定义 type → agent_type 映射和分配流程 |
| WebSocket task:state_changed | ✅ | M4 已补充，携带 from_state/to_state/task_id |
| retry 路径缺失 | ✅ | M2.3 流转规则表已补充 3 条 retry 相关路径 |

---

## 六、测试覆盖建议（基于本 PRD）

### 6.1 状态机测试矩阵

| 起点状态 | 触发事件 | 预期终点 | 测试优先级 |
|----------|----------|----------|------------|
| pending | Agent_claim | running | P0 |
| pending | User_cancel | cancelled | P0 |
| pending | *(超时)* | *(待定义)* | P1 |
| running | Code_generated | testing | P0 |
| running | Execution_error | failed | P0 |
| running | User_cancel | cancelled | P0 |
| testing | All_tests_pass | passed | P0 |
| testing | Test_failed | failed | P0 |
| testing | User_cancel | cancelled | P0 |
| passed | Deliver | completed | P0 |
| failed (retryCount=0,1,2) | User_retry | running | P0 |
| failed (retryCount=3) | User_retry | *(拒绝)* | P0 |
| failed | Retry_exceeded | failed(permanent) | P1 |
| failed | User_cancel | cancelled | P0 |
| failed (退避中) | User_cancel | *(待定义)* | P0 |

### 6.2 边界值测试

- retryCount = 0, 1, 2 → 可重试；retryCount = 3 → 不可重试
- WebSocket 推送延迟 P95 < 3.5s（需 20+ 次采样）
- 详情抽屉 4 Tab 切换响应 < 100ms（前端基准）
- 单列虚拟滚动启用阈值 = 20（文档定义）

---

## 七、总结

| 维度 | 评级 | 说明 |
|------|------|------|
| 状态机完整性 | 🟢 良好 | 13 条流转路径基本完整，上一轮问题均已修复 |
| 验收标准可测试性 | 🟡 需澄清 | M-2 指标边界需明确，C-1 拖拽约束未定义 |
| 文档一致性 | 🟡 需澄清 | M-5/S-2 命名重叠，`passed` 交付失败路径缺失 |
| 测试可执行性 | 🟡 中 | P0 重试期间取消行为需明确，否则无法设计完整用例 |

**建议优先处理 P0-1、P0-2、P0-3 再进入开发阶段。**

---

*评审人：测试工程师*  
*评审版本：TEST-v0.2*  
*日期：2026-03-28*
