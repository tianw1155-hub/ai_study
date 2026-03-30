# PRD 技术评审报告 v0.3

> **评审人：** 开发工程师
> **评审日期：** 2026-03-28
> **评审范围：** PRD-首页.md、PRD-任务看板.md、PRD-产物交付.md
> **评审原则：** 技术可行性、实现复杂度、一致性、安全性

---

## 一、PRD-首页.md 评审

### 1.1 技术可行性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **API 设计** | WebSocket URL 与正文描述矛盾 | 🔴 严重 | **第 6 章 API 接口签名** 中写 `wss://api.devpilot.com/ws?token={jwt}`，但**修订说明 P0 修复项第 3 条**明确"JWT 不再放 URL query params，改用 WebSocket 子协议握手认证（`Sec-WebSocket-Protocol` 头）"。正文 M2.3 节描述与 API 签名表不一致，API 签名表未更新 |
| **API 设计** | 敏感词检测 API 位置不明确 | 🟡 中等 | M1.1 节说"敏感词检测：提交时触发，Go API 内置敏感词库"，M1.3 提交确认流程未体现敏感词检测是同步还是异步、失败是否阻塞提交 |
| **API 设计** | `/api/documents/parse` 返回结构不完整 | 🟡 中等 | M1.2 解析流程描述返回 `{ "summary": "...", "blocks": [...], "raw_text": "..." }`，但未定义 `blocks` 数组中每个元素的字段结构 |
| **状态机** | WebSocket 事件类型定义完整 | ✅ 无问题 | 5 种事件类型（task:started/progress/completed/failed/heartbeat）定义清晰 |

### 1.2 实现复杂度

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **依赖** | Go 文档解析库选型未锁定 | 🟡 中等 | M1.2 提到 `.docx` 用 `baliance/gooxml`、`.pdf` 用 `signintech/gopdf` 或调用 Python Agent，但未说明若 gooxml 有 bug 或 gopdf 不支持某些 PDF 结构时的备选方案 |
| **边界** | 文件名/扩展名大小写未校验 | 🟢 轻微 | 用户上传 `file.PDF` 或 `file.DOCX` 是否视为合法？建议统一 toLowerCase 后判断 |
| **边界** | 空文档（0 字节）处理未定义 | 🟢 轻微 | M1.2 未说明 0 字节文件的处理方式 |

### 1.3 一致性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **认证** | WebSocket 认证方式前后矛盾 | 🔴 严重 | 与 1.1 API 设计问题重复，见上文 |
| **字段命名** | M2.2 Schema 与 M2.3 事件示例存在不一致 | 🟡 中等 | M2.2 Schema 定义了 `event`/`taskId` 为必填，`error` 在 `task:failed` 时必填。但 M2.3 事件示例中 `task:started` 和 `task:heartbeat` 未显示 `error` 字段（M2.2 说"可不填或填 `null`"），建议明确可选字段在示例中写 `null` 而非省略 |
| **命名** | 文档中称呼不统一 | 🟢 轻微 | 有时称"Agent"，有时称"AI Agent 团队"，建议统一 |

### 1.4 安全性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **认证** | JWT Token URL 安全问题（API 签名表未更新） | 🔴 严重 | 已在 P0 修复项中确认，API 签名表需同步更新为使用 `Sec-WebSocket-Protocol` 头 |
| **数据校验** | 字符限制可被绕过 | 🟡 中等 | M1.1 规定"最多 2000 字符"，但未说明前端提交时是按字符数还是字节数校验（UTF-8 多字节字符需按字节算），建议明确按 Unicode 码点数校验 |
| **敏感词** | 敏感词库更新机制未定义 | 🟡 中等 | M1.1 说"Go API 内置敏感词库"，未说明词库如何更新（运行时热更新？版本发布时更新？），也未说明是前缀树还是哈希表等实现方式 |

---

## 二、PRD-任务看板.md 评审

### 2.1 技术可行性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **API 设计** | WebSocket 认证仍用 URL query params | 🔴 严重 | **第 4 章 WebSocket 实时推送** 写 `wss://api.devpilot.com/ws?token={jwt_token}`，与首页 PRD v0.3 要求的 `Sec-WebSocket-Protocol` 头方案不一致 |
| **API 设计** | `task:state_changed` 事件首页未定义 | 🟡 中等 | 任务看板定义了 `task:state_changed` 事件（含 `from_state`/`to_state`），但首页 M2.3 WebSocket 事件类型中只有 task:started/progress/completed/failed/heartbeat，缺少 `task:state_changed` |
| **状态机** | `failed` 永久失败的区分方式不明确 | 🟡 中等 | M2.1 节说"failed(永久)：重试次数用尽，不可恢复"，但 M2.2 流转规则表只写 `failed` 而未区分永久/可恢复。终态标注"✅ 是"仅针对永久失败，建议增加 `failed_permanent` 状态值或在 `failed` 状态中增加 `permanent` 标记字段 |
| **Schema** | 新增字段定义缺少数据库类型 | 🟡 中等 | M2.4 提到 `version` 字段用于乐观锁，`tasks` 表需新增 `version INT DEFAULT 0`。但其他新增字段如 `estimated_duration`、`actual_duration`、`retry_count` 在 M7 数据库 schema 对应关系中描述为"INT，秒/秒/INT"，建议在 Schema 节明确 SQL 类型 |
| **并发** | 乐观锁冲突后重试策略未定义 | 🟡 中等 | M2.4 说"影响行数=0 时放弃本次认领"，未定义 Agent 是否会立即重试（如 sleep 后重试），可能造成任务饥饿（starvation） |

### 2.2 实现复杂度

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **性能** | 虚拟滚动阈值与验收标准不一致 | 🟡 中等 | M1.4 说"单列超过 20 个任务时启用虚拟滚动"，但 S-1 验收标准说"单列 > 50 个任务时滚动流畅"，阈值不统一 |
| **性能** | 筛选条件 URL 存储实现未说明 | 🟢 轻微 | M5.2 说"筛选条件存储在 URL query params，刷新后保留"，未说明是前端 JS 写入 `window.history` 还是 SSR 渲染 |
| **边界** | 重试次数耗尽后 `failed` 状态流转未明确 | 🟡 中等 | M2.2 流转规则表写"failed → Retry_exceeded → failed（永久）"，但未说明从 temporary `failed` 到 permanent `failed` 的状态字段如何区分（是改 `state` 字段还是增加 `permanent` flag？） |
| **依赖** | 任务取消的 WebSocket 推送未定义 | 🟢 轻微 | US-3 描述取消后 WebSocket 推送，但第 4 章 WebSocket 事件类型表未列出 `task:cancelled` 事件 |

### 2.3 一致性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **认证** | WebSocket 认证方式与首页不一致 | 🔴 严重 | 与 2.1 问题重复 |
| **事件命名** | `task:state_changed` 跨模块缺失 | 🟡 中等 | 任务看板使用 `task:state_changed` 事件驱动看板更新，但首页 WebSocket 事件表未定义此事件。前端需同时监听首页和任务看板的 WebSocket，两套事件定义需对齐 |
| **状态命名** | `passed` 与 `completed` 语义混淆 | 🟡 中等 | M2.1 定义 `passed` 为"测试通过，等待交付"，`completed` 为"全部完成，已交付"。但两个状态都归入 COL_4（已完成），且在 M1.1 卡片内容字段中 `state` 类型同时列出 `passed`/`completed`，容易混淆。建议增加 `delivered` 替代 `completed` 或明确两者语义差异 |
| **事件** | `task:completed` 与 `task:state_changed` 关系不清 | 🟡 中等 | 第 4 章同时定义了 `task:completed` 和 `task:state_changed`，`task:completed` 是否等同于 `passed → completed`？两事件是否互斥？ |

### 2.4 安全性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **认证** | JWT 放 URL 会被写入日志 | 🔴 严重 | 已在首页 PRD 中确认，任务看板仍未同步更新 |
| **授权** | 取消/重试操作的权限校验未定义 | 🟡 中等 | US-3 说"用户手动取消任务"，M3.3 说取消/重试按钮的条件，但未说明非任务创建者能否操作（是否只有创建者或管理员可以？） |
| **校验** | `agent_type` 非法值后任务流向不明确 | 🟡 中等 | M2.4 说"不进入 running，任务保持 pending 或流转至 failed"，两种路径未选定其一 |

---

## 三、PRD-产物交付.md 评审

### 3.1 技术可行性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **API 设计** | E-1 异常处理中 rollback_logs step 编号错误 | 🔴 严重 | **第 4.5 节 E-1** 写"rollback_logs step=2 标记 failed"，但根据 4.2 补偿事务步骤定义，Git revert 是 Step 1，E-1 场景是 Git revert 失败，应标记 `step=1` 而非 `step=2` |
| **API 设计** | HiL #2 确认部署的触发机制未定义 | 🟡 中等 | M3.1 说"部署预览触发前需等 HiL #2 确认，HiL #2 通过后才调用 Ops Agent 触发部署"，但未定义 HiL #2 是什么（Human-in-the-Loop？系统组件？），其 API 签名、通过条件、超时处理均未说明 |
| **流程** | Render 不支持中止部署的处理逻辑不完整 | 🟡 中等 | E-8 提到 Render 不支持中止 API，"提供'部署进行中，请等待完成后回退'提示，用户可选择强制中止（标记状态为 `aborted`，不等候）"，但标记 `aborted` 后后续流程如何处理（是否算回退成功？）未说明 |
| **Schema** | `rollback_logs` 表字段完整 | ✅ 无问题 | 已补充 `retry_count`、`github_revert_sha`、`deployment_id`、`last_rollback_at` |
| **补偿事务** | 补偿事务顺序调整后 E-1 未同步 | 🔴 严重 | 4.2 流程图已调整 Step1=Git revert、Step2=数据库，但 E-1 描述仍写"step=2"，存在文档内部不一致 |
| **版本归档** | 归档版本恢复流程未完整定义 | 🟡 中等 | E-7 说"从 GitHub docs/archive/ 目录恢复文件内容，继续回退流程"，但未说明：① 恢复后的文件内容如何写入数据库（新版本记录还是覆盖当前版本？）；② GitHub archive 文件命名格式是否可反解析出原版本号 |

### 3.2 实现复杂度

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **依赖** | GitHub API 限流处理未定义 | 🟡 中等 | 版本归档、回退 revert 等操作均依赖 GitHub API，但未说明 GitHub API 限流（5000 req/hour for authenticated）的应对策略 |
| **依赖** | `diff` npm 库选型未锁定 | 🟢 轻微 | M1.3 说"使用成熟开源库 `diff`（npm）实现"，建议明确包名（如 `diff` from npm 或 `jsdiff`），避免实现阶段选型歧义 |
| **边界** | 预览 iframe 加载跨域问题未处理 | 🟡 中等 | M1.1 说"iframe 内嵌展示"，但 Vercel/Render 预览域名可能设置 `X-Frame-Options: DENY` 或 `frame-ancestors` CSP，导致 iframe 无法加载。建议说明 fallback 方案（自动切换到新标签页打开） |
| **边界** | 大文件预览前 1000 行截断逻辑未定义 | 🟢 轻微 | M2.3 说"> 1MB 时显示提示'文件过大，仅展示前 1000 行'"，但未说明是前端请求前 1000 行（Range header）还是后端截断返回 |
| **部署** | 部署状态 `idle` 的定义不明确 | 🟢 轻微 | M3.1 定义 4 种状态（idle/deploying/success/failed），未说明 `idle` 是"从未部署过"还是"上次部署完成后等待下次部署" |

### 3.3 一致性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **认证** | WebSocket 认证方式与首页/任务看板不一致 | 🔴 严重 | 产物交付 PRD 未明确定义 WebSocket 认证方式，与首页/任务看板的 URL query params 保持一致（错误做法），未采用 v0.3 修订的 `Sec-WebSocket-Protocol` 头方案 |
| **事件** | 部署完成通知与任务看板事件未对齐 | 🟡 中等 | 产物交付 M4.4 说"回退完成通知用户"，但未定义通知的 WebSocket 事件类型（是否复用首页的 `task:completed`？还是新定义 `deploy:rollback_completed`？） |
| **命名** | M-5 验收标准"更新时间 < 3min"含义模糊 | 🟡 中等 | "更新时间 < 3min"指单步骤 < 3min 还是整个回退流程 < 3min？建议明确 |
| **版本** | 版本号定义不一致 | 🟢 轻微 | M1.2 说"保留最近 50 个版本"，但 M1.1 说"顶部显示'版本 v3（当前）'"。v3 是显示用版本号，是否等于数据库 version 字段？两者是否同步？ |

### 3.4 安全性

| 类别 | 问题 | 级别 | 说明 |
|------|------|------|------|
| **授权** | 回退权限校验 API 未定义 | 🟡 中等 | M4.3 说"仅任务创建者和管理员可操作"，但未定义校验机制（JWT payload 中是否有 role 字段？调用哪个 API 校验权限？） |
| **幂等** | 并发回退的行锁实现未说明 | 🟡 中等 | M4.3 说"数据库行锁"，但未说明是 `SELECT FOR UPDATE` 还是事务隔离级别控制 |
| **冷却期** | 冷却期校验的 API 未定义 | 🟡 中等 | M4.3 说"前端 + 后端双重校验"，但后端校验 API 未定义（如 `/api/rollback/check-cooldown?task_id=xxx`） |
| **数据校验** | 回退 commit 数量校验实现不明确 | 🟡 中等 | M4.3 说"最多回退 10 个 commit"，前端禁止点击、后端二次校验。但后端二次校验的 API 未定义，校验逻辑是在回退 API 内部还是独立校验接口？ |
| **注入** | GitHub API 调用未说明防注入 | 🟢 轻微 | rollback_logs 记录 `github_revert_sha`，若该字段未做转义可能存在注入风险（虽然 SHA 是 hex 格式，但 GitHub API 其他参数如 repo 名需防 injection） |

---

## 四、跨模块一致性问题汇总

| # | 问题 | 涉及模块 | 级别 |
|---|------|----------|------|
| C-1 | **WebSocket 认证方式三处不一致** | 首页 API 签名表 vs 任务看板 vs 产物交付 | 🔴 严重 |
| C-2 | `task:state_changed` 事件定义缺失 | 首页未定义，任务看板依赖此事件 | 🔴 严重 |
| C-3 | 部署 WebSocket 复用方案未明确 | 产物交付说"复用 SYSTEM PRD WebSocket 架构"，但未说明是同一连接还是独立连接 | 🟡 中等 |
| C-4 | `task:completed` 事件与 `passed`/`completed` 状态关系不清 | 首页/任务看板事件与状态机定义不一致 | 🟡 中等 |
| C-5 | HiL #2 机制跨模块未定义 | 任务看板/产物交付均提及，但 SYSTEM PRD 中无明确接口定义 | 🟡 中等 |

---

## 五、P0 修复项追踪

| PRD | 修复项 | 状态 | 说明 |
|-----|--------|------|------|
| 首页 | Schema 统一（event/taskId/error 字段） | ⚠️ 部分完成 | Schema 已统一，但示例中可选字段仍省略不写 |
| 首页 | 端到端延迟测量范围补全 | ✅ 已完成 | M-3 延迟定义已完整 |
| 首页 | JWT Token URL 安全问题 | ⚠️ 未完成 | API 签名表仍写 `?token={jwt}`，正文描述正确但未同步 |
| 任务看板 | agent_type 未校验 | ✅ 已完成 | M2.4 分配机制已补充校验逻辑 |
| 任务看板 | 并发认领缺锁 | ✅ 已完成 | M2.4 已补充乐观锁方案 |
| 产物交付 | 补偿事务步骤顺序调整 | ⚠️ 未完成 | 流程图已调整，但 E-1 仍写 `step=2` |
| 产物交付 | E-8 中止部署缺失 | ⚠️ 部分完成 | Vercel 中止方案已补充，Render 标记 `aborted` 后流程不完整 |
| 产物交付 | rollback_logs 缺少字段 | ✅ 已完成 | 四个字段均已补充 |

---

## 六、评审结论

**整体评估：** 三个 PRD v0.3 相比之前版本有显著改进，P0 修复项大部分已落地，但仍有以下**阻塞性问题**需在 v0.4 中修复：

1. **🔴 WebSocket 认证方式三处不一致**：首页 API 签名表、任务看板、产物交付均未统一采用 `Sec-WebSocket-Protocol` 头方案
2. **🔴 E-1 rollback_logs step 编号错误**：产物交付文档内部不一致
3. **🔴 HiL #2 机制跨模块未定义**：SYSTEM PRD 需补充此关键组件的接口定义

**建议：** 在下一版本（v0.4）中优先修复上述 P0 问题，并统一三个模块的 WebSocket 认证方案。
