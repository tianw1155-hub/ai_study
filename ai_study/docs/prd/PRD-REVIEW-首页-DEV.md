# PRD-首页 开发工程师评审

> 评审人：开发工程师  
> 评审日期：2026-03-28  
> 评审版本：PRD-首页 v1.0  
> SYSTEM PRD 参考：PRD-DevPilot-SYSTEM v0.4

---

## 一、技术可行性（React/Next.js 实现难度）

### 1.1 整体评估：✅ 技术可行，无高难度阻塞

首页 3 个核心模块（M1 需求提交、M2 实时动态流、M3 结果通知）均属常规 Web 开发范畴，React/Next.js 生态有成熟方案支撑。

### 1.2 各模块实现难度分析

| 模块 | 难度 | 说明 |
|------|------|------|
| M1.1 自然语言输入框 | 🟢 低 | 标准 Textarea，Enter/Cmd+Enter 交互，字符计数，React Controlled Component 即可 |
| M1.2 文档上传区 | 🟡 中 | 涉及拖拽（HTML5 Drag & Drop API）、文件解析（md-docx-pdf）、进度条；`.docx` 和 `.pdf` 解析需引入库（如 `mammoth.docx`、`pdf-parse`），服务端需处理 |
| M1.3 提交确认 | 🟢 低 | API 调用 + loading 状态 + 跳转；Next.js `router.push` |
| M1.4 项目模板 | 🟢 低 | 静态数据渲染到表单，onClick 填充 |
| M2 实时动态流 | 🟡 中 | **核心难点**：依赖 WebSocket 实时推送。SYSTEM PRD 规定 Go API 轮询 Temporal → WebSocket 推送前端，前端负责接收和渲染。需处理：断线重连、心跳、消息去重、滚动底部对齐、20 条折叠逻辑 |
| M3 结果通知 | 🟡 中 | 站内信（WebSocket 推送或轮询）、推送通知（移动端 PWA/Service Worker）、邮件（SMTP 服务）；通知偏好设置需用户配置存储（数据库） |

### 1.3 关键技术风险点

**⚠️ 风险 1：WebSocket 实时推送是 M2 的核心依赖**

SYSTEM PRD 规定：
- Go API 每 3 秒轮询 Temporal 状态
- 通过 WebSocket 推送前端

**前端需处理：**
1. WebSocket 连接建立与 JWT 认证（SYSTEM PRD 要求 JWT 在 URL 参数中）
2. 断线重连（指数退避：1s → 2s → 4s → 8s，最多 5 次）
3. 心跳维持（每 30s Ping/Pong）
4. 消息按 `task:started / task:progress / task:completed / task:failed` 分发渲染
5. 30 分钟无更新时显示骨架屏

**建议：** 将 WebSocket 封装为独立 Hook（如 `useAgentStream`），统一管理连接状态、消息队列、重连逻辑。技术成本中等，但需要提前与后端对齐 WebSocket 消息协议（JSON 格式）。

**⚠️ 风险 2：文档解析（.docx / .pdf）需服务端配合**

SYSTEM PRD 的 Agent 层是 Python，文档解析可能需要：
- `.md` / `.txt`：前端可直接解析（或传给后端 Go API）
- `.docx`：需解压 XML（可用 `mammoth.js` 前端库）或后端 Python 服务解析
- `.pdf`：需后端解析（Python `pdfplumber` / `PyMuPDF`）

**建议：** 在 SYSTEM PRD 中明确定义文档解析职责划分，避免前端做了发现后端没有对应接口。

**⚠️ 风险 3：敏感词检测**

敏感词检测 M1.1 要求"提交时触发"，但 SYSTEM PRD 未定义此 API。需要确认：
- 敏感词库存储位置（本地+定期更新 vs 第三方 API）
- 检测接口由谁提供（Go API 内置 vs Python Agent）
- 响应时间要求（影响提交按钮 loading 时长）

---

## 二、验收标准是否定量可测

### 2.1 总体评估：✅ 大部分定量，少数需补充定义

| 等级 | ID | 标准 | 定量指标 | 可测性 |
|------|----|------|----------|--------|
| Must | M-1 | 提交按钮 2 秒内返回任务 ID | ✅ 明确（≤2s） | ✅ 可自动化压测 |
| Must | M-2 | 文档上传解析时间 < 5s | ✅ 明确（<5s） | ⚠️ 需按文件类型分别测 |
| Must | M-3 | 动态延迟 < 1s 更新 | ⚠️ 模糊（"每条动态延迟 < 1s"指什么延迟？网络延迟？渲染延迟？） | ⚠️ 需明确定义 |
| Must | M-4 | 站内通知 3 秒内触达 | ✅ 明确（≤3s） | ✅ 可 WebSocket 消息计时 |
| Must | M-5 | 移动端 Chrome/Safari 无错乱 | ✅ 明确 | ✅ 可真机测试 |
| Should | S-1 | 跳转时间 1.5s | ✅ 明确 | ✅ 可自动化计时 |
| Should | S-2 | 敏感词误拦<1%，漏拦<0.1% | ✅ 明确 | ⚠️ 需大量测试用例 |
| Should | S-3 | 最近 50 条动态 | ✅ 明确 | ✅ 可接口测试 |
| Could | C-1 | 模板填充 < 500ms | ✅ 明确 | ✅ 可自动化计时 |
| Could | C-2 | 邮件通知 | ✅ 定性 | ✅ 人工验证 |

### 2.2 需要澄清的指标

**M-3 "每条动态延迟 < 1 秒更新" 定义不清晰：**

建议拆分为：
- `P95 网络延迟`：WebSocket 消息从 Go API 发出到前端接收，< 1s
- `渲染延迟`：前端接收到新消息到渲染完成，< 200ms

**S-2 敏感词测试需要测试集：**

需提前准备：
- 100+ 条正向需求（不应拦截）
- 50+ 条包含敏感词的需求（应拦截）
- 边界：拼音绕过、特殊字符、空格插入等

---

## 三、页面布局和交互是否合理

### 3.1 总体评估：✅ 布局合理，交互符合常见模式

### 3.2 优点

1. **布局清晰**：Hero 区 → 输入框 → 上传区 → CTA → 动态流 → 数据条，视觉流程自然
2. **响应式断点设计完整**：Desktop 960px / Tablet 768px / Mobile 375px 三档，考虑周全
3. **加载和错误状态覆盖完整**：骨架屏、spinner、toast、snackbar、空状态均有定义
4. **动态流折叠策略合理**：20 条折叠 + 同类型合并 + 30 分钟无更新骨架屏，避免信息过载
5. **拖拽上传有明确反馈**：边框虚线 + 背景色变，符合用户预期

### 3.3 改进建议

**建议 1：M1.3 成功跳转后"附带任务 ID toast"——此时页面已跳转，toast 显示在哪？**

> 建议：跳转前在当前页显示 toast（1.5s），然后跳转。跳转后任务 ID 在看板页面 URL 参数中携带（`/task-board?taskId=12345`），看板页直接展示。

**建议 2：文档上传后"3 秒后自动收起"解析结果预览——如果用户正在阅读就收起，体验不佳**

> 建议：改为用户主动关闭（点击 × 或区域外点击），或设置"不再提示"选项。

**建议 3：M2 动态流最大高度 400px——在移动端 400px 可能占用过多屏幕**

> 建议：移动端改为 200px，或默认折叠为只显示最新 3 条。

**建议 4：数据统计条"已为 12,345 位开发者 完成 45,678 个任务"——数字硬编码，动态数据从哪来？**

> 建议：从 Go API `/api/stats` 获取，由后端定时汇总（PostgreSQL 查询 count），避免前端硬编码。

**建议 5：首页是否需要登录才能访问？**

> SYSTEM PRD 提到 GitHub OAuth 登录。如果是未登录可访问（访客可提交需求），则需明确登录时机（提交前？提交后？）。建议：未登录可看到首页和输入需求，点击提交时引导登录。

**建议 6：导航栏 [文档] [价格] [登录] [注册]——价格页和文档页的 PRD 是否已定义？**

> 首页 PRD 提到了这些入口，但没有对应的 PRD。如果这些页面不存在，入口应隐藏或标记为"即将上线"。

---

## 四、与 SYSTEM PRD 技术栈一致性

### 4.1 总体评估：✅ 一致，无冲突

| 维度 | SYSTEM PRD 规定 | PRD-首页 实现 | 一致性 |
|------|----------------|--------------|--------|
| 前端框架 | React / Next.js | React / Next.js（隐含） | ✅ |
| 实时通信 | WebSocket（Go API 轮询 Temporal → 推送前端） | 实时动态流（M2）依赖 WebSocket | ✅ |
| 消息协议 | `task:started / progress / completed / failed` 四类事件 | 动态流包含 `running / success / error` 状态 | ✅（字段映射需对齐） |
| 认证方式 | GitHub OAuth + JWT（WebSocket URL 参数） | 提到登录/注册，未明确 WebSocket 认证 | ⚠️ 需补充 |
| 通知渠道 | 站内信（WebSocket）、推送、邮件 | M3 定义了三类通知渠道 | ✅ |
| 文档解析 | 未明确定义（Python Agent 层） | 前端上传 md/docx/pdf | ⚠️ 需对齐解析职责 |
| 部署平台 | Vercel（前端） | 未提及 | ✅ |

### 4.2 需要对齐的具体问题

**问题 1：WebSocket 认证**

SYSTEM PRD v0.4 规定 WebSocket JWT Token 在 URL 参数中传递，PRD-首页未提及前端如何建立 WebSocket 连接。建议在首页 PRD 中补充：

```
WebSocket URL: wss://api.devpilot.com/ws?token={jwt_token}
```

**问题 2：动态流消息字段与 SYSTEM PRD 事件类型映射**

PRD-首页定义了动态消息结构：
```
agent: "Planner | Coder | Tester | Deployer"
status: "running | success | error"
```

SYSTEM PRD 事件类型：
```
task:started / task:progress / task:completed / task:failed
```

需要确认：
- 前端收到的 WebSocket 消息是直接使用 SYSTEM PRD 的 4 类事件，还是经过 Go API 转换后按 M2.2 的格式下发？
- 建议：Go API 在转发时做格式转换，前端只依赖 M2.2 定义的结构。

---

## 五、总结与建议

### 5.1 综合评级：🟡 良好，需小幅修改后可实现

| 维度 | 评级 | 说明 |
|------|------|------|
| 技术可行性 | 🟡 中 | WebSocket 和文档解析是主要风险点，需提前与后端对齐 |
| 验收标准 | 🟢 好 | 大部分定量，3 处指标需澄清定义 |
| 布局交互 | 🟢 好 | 整体设计合理，5 处细节建议优化 |
| 技术栈一致 | 🟡 中 | 需补充 WebSocket 认证和文档解析职责定义 |

### 5.2 建议优先级

**🔴 P0（必须修复）：**
1. 补充 WebSocket 连接方式（URL、认证、消息协议）与 M2.2 格式的映射关系
2. 明确文档解析职责（.docx/.pdf 前端解析还是后端？后端是 Go 还是 Python Agent？）
3. 澄清 M-3 "动态延迟 < 1s"的具体定义（P95 网络延迟 / 渲染延迟 / 总延迟）

**🟡 P1（强烈建议）：**
4. 登录状态与首页可见性（未登录用户能否看到首页？提交前是否强制登录？）
5. 敏感词检测 API 位置和响应时间定义
6. 数据统计条数字来源（API 还是硬编码？）

**🟢 P2（可选优化）：**
7. 文档解析预览改为用户主动关闭
8. 移动端动态流高度调整为 200px
9. 补充价格页和文档页（或其他占位页面）的存在状态

### 5.3 下一步行动

建议在进入开发前，与后端（Go）和 Agent（Python）团队对齐以下 API 接口签名：
- `POST /api/requirements/submit`（需求提交）
- `POST /api/documents/parse`（文档解析）
- `GET /api/sensitive/check`（敏感词检测）
- `WebSocket /ws?token={jwt}`（实时动态流）
- `GET /api/stats`（数据统计）

---

*评审结论：整体质量良好，P0 问题解决后可进入开发阶段。*
