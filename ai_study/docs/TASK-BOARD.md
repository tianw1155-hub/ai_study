# DevPilot 开发任务看板

> **项目：** DevPilot（织翼）AI 开发团队平台
> **版本基准：** PRD v0.5（首页 / 任务看板 / 产物交付）
> **技术栈：** Next.js + React Query + Zustand / Go + PostgreSQL + Temporal / Vercel + Render
> **更新时间：** 2026-03-28 (Phase 1 前端 + 后端全部完成)

---

## 项目骨架（Phase 0）— 所有模块的前置依赖

| Task | 负责 | 依赖 | 验收标准 |
|------|------|------|----------|
| ~~**T0-1 搭建 Next.js 项目骨架**~~ ✅ | 前端 | 无 | 项目初始化，路由结构 `/` `/kanban` `/delivery` `/login`，Tailwind 配置，品牌色/字体/组件库 |
| ~~**T0-2 搭建 Go API 项目骨架**~~ ✅ | 后端 | 无 | 项目结构 `cmd/api` `internal/handlers` `internal/models` `internal/db`，`go mod init`，`docker-compose.yml`（PostgreSQL 16） |
| ~~**T0-3 数据库 Schema 设计**~~ ✅ | 后端 | T0-2 | `tasks` 表（含 version/estimated_duration/actual_duration/retry_count 字段），`rollback_logs` 表（含 retry_count/github_revert_sha/deployment_id/last_rollback_at），`documents` 表，`deployments` 表 |
| ~~**T0-4 Temporal 基础设施**~~ ✅ | 后端 | T0-2 | Temporal workflow 定义（任务创建/分配/状态流转），Go SDK 集成 |
| ~~**T0-5 WebSocket 基础设施**~~ ✅ | 后端 | T0-2/T0-3 | Go WebSocket server，`Sec-WebSocket-Protocol` 头 JWT 认证，复用 SYSTEM PRD 架构 |
| **T0-6 统一 Schema 定义** | 前端+后端 | T0-2/T0-5 | WebSocket 消息 JSON Schema（event/taskId/error/status），统一命名（Planner/Coder/Tester/Deployer 全大写） |

---

## Phase 1：首页开发

### 前端任务

| Task | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| ~~**T1-F1 需求输入框组件**~~ ✅ | 前端 | T0-1 | M1.1 自然语言输入框，支持 Enter 换行、Ctrl+Enter 提交、实时字数统计、10-2000字符校验 |
| ~~**T1-F2 文档上传组件**~~ ✅ | 前端 | T0-1 | M1.2 上传区域，支持拖拽、md/docx/pdf/txt、10MB 限制、5文件限制、进度条 |
| ~~**T1-F3 提交确认流程**~~ ✅ | 前端 | T1-F1/T1-F2 | M1.3 提交按钮、网络错误处理、超时处理、1.5s 后跳转看板 |
| ~~**T1-F4 敏感词检测集成**~~ ✅ | 前端 | T0-6 | M1.1 调用 `POST /api/sensitive/check`，拦截后显示提示 |
| ~~**T1-F5 实时动态流组件**~~ ✅ | 前端 | T0-5/T0-6 | M2.1-M2.4 WebSocket 连接、`task:started/progress/completed/failed/heartbeat/state_changed` 事件渲染、动画、骨架屏 |
| ~~**T1-F6 通知组件**~~ ✅ | 前端 | T0-6 | M3 通知渠道（站内信/推送/邮件）集成，偏好设置 UI |
| ~~**T1-F7 项目模板功能**~~ ✅ | 前端 | T0-1 | M1.4 调用 `/api/templates` 渲染模板列表，点击填充 |
| ~~**T1-F8 响应式 & 移动端适配**~~ ✅ | 前端 | T1-F1 | M-5 验收：Chrome/Safari 375px/414px 真机测试无错 |

### 后端任务

| Task | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| ~~**T1-B1 需求提交 API**~~ ✅ | 后端 | T0-2/T0-3/T0-4 | `POST /api/requirements/submit` 返回 taskId，写入 tasks 表，触发 Temporal workflow |
| ~~**T1-B2 文档解析服务**~~ ✅ | 后端 | T0-2/T0-3 | `POST /api/documents/parse` 支持 .md/.docx/.pdf/.txt 解析（gooxml/gopdf），返回 summary/blocks/raw_text |
| ~~**T1-B3 敏感词检测 API**~~ ✅ | 后端 | T0-2 | `POST /api/sensitive/check`，Go 内置敏感词库（可先用 trie 结构） |
| ~~**T1-B4 模板 API**~~ ✅ | 后端 | T0-2 | `GET /api/templates` 返回模板列表 |
| ~~**T1-B5 统计 API**~~ ✅ | 后端 | T0-2 | `GET /api/stats` 返回首页底部数字 |
| ~~**T1-B6 WebSocket 事件推送**~~ ✅ | 后端 | T0-4/T0-5 | Temporal 轮询（3s 间隔）→ 事件转换 → WebSocket 推送，含 server_timestamp |

### 验收测试

| Test | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T1-T1 首页 E2E 测试** | 测试 | T1-F1-T1-F8 | M-1 ~ M-5 验收标准自动化覆盖 |
| **T1-T2 WebSocket 认证测试** | 测试 | T1-B6 | JWT 通过 `Sec-WebSocket-Protocol` 头认证，URL 无 token |
| **T1-T3 敏感词边界测试** | 测试 | T1-B3 | S-2 正向≥100条，负向≥50条，含拼音/特殊字符边界 |

---

## Phase 2：任务看板开发

### 前端任务

| Task | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T2-F1 Kanban 看板布局** | 前端 | T0-1/T0-6 | 5列看板（COL_1~COL_5），Desktop/Tablet/Mobile 响应式，虚拟滚动（阈值 20→50） |
| **T2-F2 任务卡片组件** | 前端 | T2-F1 | M1.2 卡片字段（title/type/agent_type/priority/assignee/耗时/retryCount），hover 效果 |
| **T2-F3 任务详情抽屉** | 前端 | T0-6 | M3 右侧抽屉，4个 Tab（概述/输入/输出/日志），操作按钮（取消/重试/查看代码） |
| **T2-F4 状态机流转集成** | 前端 | T0-6 | WebSocket `task:state_changed` 事件驱动看板更新，动画过渡 |
| **T2-F5 筛选 & URL 状态** | 前端 | T2-F1 | M5 筛选维度（type/状态/优先级/分配者），条件存入 URL query params |
| **T2-F6 重试交互** | 前端 | T2-F3 | M3.3 重试按钮（failed + retryCount<3），指数退避 S-5 展示 |

### 后端任务

| Task | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T2-B1 任务分配逻辑** | 后端 | T0-3/T0-4 | M2.4 分配规则（type→Agent type），pending→running，agent_type 校验（unknown → task:failed） |
| **T2-B2 并发认领锁** | 后端 | T0-3 | 乐观锁（version 字段），`WHERE version = expected_version`，冲突放弃 |
| **T2-B3 状态流转 API** | 后端 | T0-3/T0-4 | running→testing→passed/completed/failed，cancelled 用户取消 |
| **T2-B4 重试机制** | 后端 | T0-3/T0-4 | 10s→30s→90s 指数退避，retryCount 上限 3 次 |
| **T2-B5 任务详情 API** | 后端 | T0-3 | `GET /api/tasks/:id` 返回全量信息（概述/输入/输出/日志） |
| **T2-B6 任务取消 API** | 后端 | T0-3 | `POST /api/tasks/:id/cancel`，仅创建者/管理员可操作 |

### 验收测试

| Test | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T2-T1 状态机自动化测试** | 测试 | T2-B3 | 覆盖所有状态流转路径，cancelled/failed/completed 终态验证 |
| **T2-T2 重试时间间隔测试** | 测试 | T2-B4 | S-5 量化：10s±10%/27s±10%/81s±10%，时间戳打点 |
| **T2-T3 并发认领测试** | 测试 | T2-B2 | 乐观锁冲突 → 只有一个成功，另一个放弃 |
| **T2-T4 取消操作三态测试** | 测试 | T2-B6 | pending/running/testing 三态取消，WebSocket < 3.5s 触达 |

---

## Phase 3：产物交付开发

### 前端任务

| Task | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T3-F1 PRD 展示区** | 前端 | T0-1 | M1.1 GFM Markdown 渲染，版本 v3 标签，下载 MD/PDF，iframe 预览（默认）/新标签页切换 |
| **T3-F2 版本历史 & 对比** | 前端 | T3-F1 | M1.2 时间线列表，M1.3 Diff 视图（使用 `diff` npm 库），side-by-side 布局 |
| **T3-F3 代码仓库展示** | 前端 | T0-6 | M2 文件目录树（可展开/折叠），单文件预览（GitHub Raw URL），语法高亮，行号 |
| **T3-F4 部署控制台** | 前端 | T0-6 | M3 Tab（Vercel/Render），4种状态（idle/deploying/success/failed），实时日志滚动 |
| **T3-F5 回退交互** | 前端 | T3-F3/T3-F4 | M4 回退按钮/确认弹窗，回退进度展示 |
| **T3-F6 部署历史** | 前端 | T3-F4 | M3.4 最近10次部署记录，localStorage 持久化 |

### 后端任务

| Task | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T3-B1 PRD 版本管理 API** | 后端 | T0-2/T0-3 | `GET /api/tasks/:id/prd` 当前版本，`GET /api/tasks/:id/prd/versions` 版本列表，≥50版本自动归档到 GitHub docs/archive/ |
| **T3-B2 PRD 回退 API** | 后端 | T0-3/T3-B1 | 补偿事务：Step1 Git revert → Step2 更新 version_id → Step3 触发部署 → Step4 通知用户 |
| **T3-B3 GitHub 集成** | 后端 | T0-2 | 获取默认分支，仓库文件树，commit 历史，revert commit |
| **T3-B4 Vercel 集成** | 后端 | T0-2 | `POST /v13/deployments` 触发部署，`DELETE /v13/deployments/:id` 中止，状态轮询（1s） |
| **T3-B5 Render 集成** | 后端 | T0-2 | 触发部署，状态轮询；不支持中止，E-8 提示用户等待或标记 aborted |
| **T3-B6 回退冷却校验** | 后端 | T0-3 | `last_rollback_at + 5min > now()` 才能发起新回退，违者返回 429 |
| **T3-B7 回退日志 API** | 后端 | T0-3 | `GET /api/tasks/:id/rollback-logs` 返回 rollback_logs 表记录 |

### 验收测试

| Test | 负责人 | 依赖 | 验收标准 |
|------|--------|------|----------|
| **T3-T1 M-5 三端一致测试** | 测试 | T3-B2 | 回退后：GitHub commit SHA = 目标 SHA && current_version_id 指向目标版本 && deployment_id 对应目标 commit |
| **T3-T2 Diff 视图完整性测试** | 测试 | T3-F2 | 用标准 Diff 样例验证 100% 不遗漏 |
| **T3-T3 E-8 Render 中止测试** | 测试 | T3-B5 | 验证 aborted 状态标记 + 回退流程闭环 |
| **T3-T4 回退冷却期测试** | 测试 | T3-B6 | 5分钟内重复触发返回 429 |

---

## 并行开发建议

```
前端 AI Agent                     后端 AI Agent
├── T0-1 项目骨架                 ├── T0-2 项目骨架
├── T1-F1-F8 (Phase1 前端)        ├── T1-B1-B6 (Phase1 后端)
│                                   ├── T0-3 数据库 Schema
│                                   ├── T0-4 Temporal
│                                   ├── T0-5 WebSocket
├── T2-F1-F6 (Phase2 前端)        ├── T2-B1-B6 (Phase2 后端)
├── T3-F1-F6 (Phase3 前端)        ├── T3-B1-B7 (Phase3 后端)
```

**推荐节奏：**
- Phase 1 并行开发 + AI agent 覆盖 E2E 测试（T1-T3）
- Phase 2 在 Phase 1 WebSocket 基础设施就绪后启动
- Phase 3 在 Phase 2 任务完成状态就绪后启动

---

## 优先 blockers（开发启动前必须解决）

| Blocker | 解决方式 |
|---------|---------|
| Temporal 未搭建 | Phase 0 先搭，WebSocket 推送依赖 Temporal 轮询 |
| WebSocket 基础设施未就绪 | Phase 0 先搭，首页/看板/产物交付均依赖 |
| 数据库 Schema 未确定 | Phase 0 先搭，所有模块依赖 |

