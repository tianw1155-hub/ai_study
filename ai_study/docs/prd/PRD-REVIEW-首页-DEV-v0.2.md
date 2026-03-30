# PRD-首页 开发工程师评审 | v0.2

> **评审人：** 开发工程师
> **评审日期：** 2026-03-28
> **评审版本：** PRD-首页 v0.2
> **对比版本：** PRD-首页 v1.0 → v0.2 修订评审

---

## 一、P0 修复验证

### P0-1：WebSocket 消息格式 ✅ 部分解决，仍有结构不一致

**原问题：** 消息协议不明确，四类事件字段定义缺失。

**v0.2 修复情况：**
- ✅ 补充了 5 个完整事件类型枚举：`task:started`、`task:progress`、`task:completed`、`task:failed`、`task:heartbeat`
- ✅ 每个事件有独立 JSON 示例
- ✅ 连接方式、认证方式（JWT URL 参数）、断线重连、心跳均已定义

**仍存在的漏洞 🔴：**

**Schema 与示例不匹配：**

M2.2 统一消息结构定义：
```json
{
  "id": "msg_001",
  "timestamp": "...",
  "agent": "Planner | Coder | Tester | Deployer",
  "action": "任务分解 | 代码生成 | 单元测试 | 部署",
  "detail": "...",
  "status": "running | success | error",
  "icon": "🤖 | ✅ | ❌"
}
```

但各事件示例与上述 schema 不一致：

| 事件 | 示例字段 | 与 Schema 不匹配处 |
|------|----------|-------------------|
| `task:started` | `event`, `taskId`, `agent`, `timestamp` | Schema 中无 `event`（用 `action`?）、无 `taskId`（用 `id`?） |
| `task:progress` | `event`, `taskId`, `agent`, `action`, `detail`, `status`, `timestamp` | 多了 `event`、`taskId` |
| `task:completed` | `event`, `taskId`, `agent`, `status`, `timestamp` | 无 `detail`（完成消息写在哪？） |
| `task:failed` | `event`, `taskId`, `agent`, `error`, `timestamp` | `error` 字段不在 Schema 中；Schema 的 `status: error` 与独立 `error` 字段冗余 |
| `task:heartbeat` | `event`, `taskId`, `timestamp` | Schema 要求 `status`，但心跳无此字段 |

**根本问题：** M2.2 的统一 schema 无法覆盖所有事件类型的字段。开发者实际实现时该以哪个为准？

**建议修复：**
- 方案 A：各事件类型独立定义 schema（推荐），不再强求统一结构
- 方案 B：若要统一 schema，`detail` 字段承载可变信息（成功信息/错误原因），`error` 作为可选字段，去掉 `icon`（前端按 `status` 渲染图标）

---

### P0-2：文档解析职责 ✅ 基本解决，缺失错误处理

**原问题：** 职责划分不清，.docx/.pdf 解析主体不明。

**v0.2 修复情况：**
- ✅ 明确 `.md`/`.txt` = 前端解析（FileReader API）
- ✅ 明确 `.docx`/`.pdf` = 后端 Go API 解析
- ✅ 指定了具体 Go 库：`baliance/gooxml`（docx）、`signintech/gopdf`（pdf）
- ✅ 定义了 API：`POST /api/documents/parse`，返回 `{ "summary", "blocks", "raw_text" }`
- ✅ 提供了完整流程图

**仍存在的漏洞 🟡：**

1. **解析失败场景未定义**
   - Go API 解析 .docx/.pdf 失败时（如文件损坏、加密 PDF），前端收到什么响应？HTTP 状态码？错误提示文案？
   - 用户体验：弹窗报错？inline 提示？

2. **解析耗时无独立 SLO**
   - M-2 要求"解析时间 < 5 秒"，但这是**上传 + 解析的总时间**，还是仅解析时间？
   - 大文件（接近 10MB）的 PDF 解析可能 > 5s，Go PDF 库（`signintech/gopdf`）对复杂 PDF 支持有限，建议补充兜底方案（如调用 Python Agent 解析）

3. **`blocks` 字段语义不清**
   - 返回结构中 `blocks` 的具体格式是什么？段落数组？标题+内容结构？
   - 建议补充示例：`{ "blocks": [{ "type": "heading", "level": 1, "text": "..." }, { "type": "paragraph", "text": "..." }] }`

---

### P0-3：动态延迟 < 1s ✅ 定义澄清，但验收标准未同步更新

**原问题：** "延迟 < 1s" 指标歧义。

**v0.2 修复情况：**
- ✅ 拆分为 P95 网络延迟 < 1s + 渲染延迟 < 200ms
- ✅ 明确了总端到端 P95 < 1.2s
- ✅ 补充了测量方式：`server_timestamp` 打点，前端计算差值

**仍存在的漏洞 🟡：**

1. **测量范围缺失： Temporal → Go API 段未被纳入**
   - 当前测量 `now - server_timestamp` 只能覆盖：Go API 发出 → 前端接收 → 渲染
   - **缺失：** Temporal 事件发生 → Go API 接收（轮询间隔 3s 是主要延迟来源）
   - 3s 轮询间隔意味着极端情况下，Agent 动作发生后最多 3s 才被 Go API 发现，加上网络延迟和渲染，实际用户感知延迟可达 3s+

2. **M-3 验收标准仍写 "< 1s"，未同步为 "< 1.2s"**
   - 原文 M-3："端到端 P95 延迟 < 1s"
   - 但下方定义表格写的是"总延迟 < 1.2s（两者之和的 P95）"
   - 建议：验收标准与定义表格保持一致

---

## 二、P1 优化项验证

### P1-1：WebSocket 认证方式 ✅ 已补充

JWT via URL query 参数已明确，但存在安全风险（见下节）。

### P1-2：敏感词检测 API ✅ 部分明确

- ✅ 明确了触发时机（提交时）
- ✅ 明确了返回提示文案
- ❌ 未明确接口路径（M1.1 提到 "Go API 内置敏感词库"，但 API 签名未列出 `/api/sensitive/check`）
- ❌ 未定义敏感词检测的响应时间（影响提交按钮 loading 时长）

### P1-3：数据统计条来源 ✅ 已明确

来源定义为 `/api/stats`，来源合理。

---

## 三、新发现的漏洞

### 🟡 中优先级：JWT Token 通过 URL 参数传递存在安全隐患

**问题：** `wss://api.devpilot.com/ws?token={jwt_token}` 将 JWT 放在 URL 中，存在以下风险：
- Server access log 会记录完整 URL（包含 token）
- 浏览器历史记录会保存 token
-  Referer header 可能泄露 token
- 代理/CDN 日志可能记录

**建议：**
- 短期：改用 WebSocket 子协议握手认证（`Sec-WebSocket-Protocol` 头），不放在 URL 中
- 或：首次连接时通过 `POST /api/ws/connect` 获取临时 WebSocket 令牌

### 🟡 中优先级：WebSocket 连接无显式断开/关闭生命周期

- 连接何时关闭？页面卸载时？登出时？
- 前端 `beforeunload` 是否发送关闭帧？
- 关闭后 session 状态是否清理？

### 🟢 低优先级：缺少前端 API 统一错误码文档

M1.3 提到"网络错误"、"超时"两种错误，但未定义：
- 错误码体系（4xx/5xx/业务错误码）
- Go API 返回的 JSON 错误结构（`{ "code": "...", "message": "..." }`？）
- 前端如何统一处理这些错误

---

## 四、综合评级

| 维度 | v1.0 评级 | v0.2 评级 | 变化 |
|------|----------|----------|------|
| P0-1 WebSocket 协议 | 🔴 未解决 | 🟡 部分解决 | ↑ 有进步但 schema 不一致 |
| P0-2 文档解析职责 | 🔴 未解决 | 🟢 已解决 | ↑ ✅ |
| P0-3 动态延迟定义 | 🔴 未解决 | 🟡 部分解决 | ↑ 定义澄清但测量范围缺失 |
| 技术可行性 | 🟡 中 | 🟡 中 | — |
| 验收标准 | 🟢 好 | 🟢 好 | — |

**整体结论：v0.2 较 v1.0 有显著改进，3 个 P0 均已朝正确方向修复，但均未达到"完全解决"标准。建议修复 schema 不一致 + 测量范围缺失后再进入开发。**

---

## 五、修复建议汇总

### 🔴 P0（必须修复）

| # | 问题 | 建议 |
|---|------|------|
| P0-1-a | M2.2 统一 schema 与各事件示例不匹配 | 各事件类型独立定义 schema；或统一 `detail` 字段承载可变信息 |
| P0-3-a | 延迟测量未覆盖 Temporal → Go API 段 | 补充完整端到端测量方式：Temporal 事件携带 `event_timestamp`，WebSocket 消息携带 `api_timestamp`，前端两者均接收 |
| P0-3-b | M-3 验收标准 "< 1s" 与定义表格 "< 1.2s" 不一致 | 统一为 "< 1.2s"（端到端 P95） |

### 🟡 P1（强烈建议）

| # | 问题 | 建议 |
|---|------|------|
| P1-a | 文档解析失败无错误处理 | 补充 Go API 解析失败的 HTTP 状态码和错误文案 |
| P1-b | JWT Token 放 URL 有安全风险 | 改为 WebSocket 子协议握手认证 |
| P1-c | 敏感词检测 API 路径未列出 | 补充 `/api/sensitive/check` 到 API 接口签名表 |
| P1-d | `blocks` 字段格式未定义 | 补充 `blocks` 数据结构示例 |

---

*评审结论：v0.2 较上一版有实质性改进，但 3 个 P0 均存在未完全解决的细节问题，建议修复 P0-a/b 后再进入开发阶段。*
