# PRD-DevPilot 系统框架 v0.4 第四轮评审报告

**评审日期：** 2026-03-28
**评审角色：** 开发工程师
**评审文件：** PRD-DevPilot-SYSTEM.md v0.4

---

## 一、上一轮 4 个 P0 修订验证

### P0-1：Section 矛盾（Key 密文存 PostgreSQL，Master Key 存环境变量）

| 位置 | 描述 |
|------|------|
| §3.3 安全设计 | 用户 Key 存储在 PostgreSQL（由 Master Key 加密），Master Key 存储在**环境变量**，不存 DB |
| §7 安全与隔离 | API Key → 用户 Key 密文存储在 PostgreSQL，Master Key 存环境变量，执行时解密，用完即释放，平台不保留明文 |

**结论：✅ 已统一，无矛盾。**

---

### P0-2：HiL 超时机制缺失（3 节点 + 48h/72h 处理策略）

| 节点 | 触发时机 | 超时策略 | 阻塞/非阻塞 |
|------|----------|----------|------------|
| HiL #1 | PM Agent 完成 PRD 初稿 | 48h 内提醒 → 72h 升级通知 | **阻塞**（不确认方向，Dev Agent 不开始开发） |
| HiL #2 | 测试完成，部署预览前 | 同上 | **非阻塞**（超时后可选择继续或取消） |
| HiL #3 | 预览验收完成，生产上线前 | 同上 | **非阻塞**（同上） |

**结论：✅ 策略完整，阻塞/非阻塞区分合理。**

---

### P0-3：Go ↔ Python 调用协议缺失（gRPC + Temporal Activity + Protobuf）

§3.5 已定义：
- 协议：gRPC（Protobuf）
- Activity 超时：10min
- 重试：Temporal 内置指数退避，最多 3 次
- 接口示例：`GeneratePRD / GenerateCode / GenerateTests / DeployPreview`

**结论：✅ 接口清晰，协议可行。**

---

### P0-4：WebSocket 认证缺失（JWT Token + 心跳 + 断线重连）

§3.4 已定义：
- 认证：JWT Token（URL 参数传递），由 GitHub OAuth Token 换取
- 心跳：每 30 秒 Ping/Pong
- 断线重连：指数退避 1s → 2s → 4s → 8s，最多 5 次
- 重连失败：提示用户刷新页面

**结论：✅ 认证和重连机制完整。**

---

## 二、关键技术方案评估

### 2.1 gRPC + Temporal Activity 方案是否可行？

**评估：✅ 可行，推荐实施。**

理由：
- Temporal 的 Activity 本质上就是设计用来做长时间运行的远程调用，与 Python Agent 的 LLM 推理场景天然匹配
- Go Temporal Worker 负责调度，Python Agent 专注 LLM 逻辑，职责分离清晰
- 10min Activity 超时对 LLM 生成任务合理（GPT/DeepSeek 生成 PRD 或代码通常在分钟级）
- Temporal 内置的状态持久化和重试减少了我方开发量

**潜在风险（建议关注，不视为 P0）：**
- Python Agent 需要实现幂等性 Activity，以便重试时不产生副作用（如重复创建 GitHub PR）
- 建议在 Activity 内部对 GitHub 操作（Push/PR）做幂等处理（如检查 PR 是否已存在）

---

### 2.2 HiL 超时策略（阻塞/非阻塞）是否合理？

**评估：✅ 合理，分层策略得当。**

| HiL 节点 | 阻塞理由 |
|----------|----------|
| HiL #1（方向确认） | 阻塞正确 — 方向错误后续全错，且 PRD 生成后可终止避免浪费资源 |
| HiL #2（部署预览确认） | 非阻塞合理 — 预览已就绪，用户超时不代表预览有问题，可继续部署 |
| HiL #3（生产上线确认） | 非阻塞合理 — 预览验收已完成，上线是最终确认，超时强制升级即可 |

**一个建议（可选）：** HiL #2/#3 非阻塞场景下，建议明确"72h 无响应且未选择继续"的默认行为（如：自动取消并归档），避免任务永久挂起。当前 PRD 描述"用户超时后可选择继续或取消"，隐含了平台不主动推进，但未明确超时截止后的最终状态。

---

## 三、新发现的 P0 问题

### P0-NEW-1：GitHub OAuth Token 刷新机制缺失 ⚠️

**严重程度：** P0

**问题描述：**
- Python Agent 在执行代码 Push、创建 PR 等 GitHub 操作时，使用用户的 GitHub OAuth Token
- GitHub OAuth Token 有失效机制（用户撤销、Token 过期）
- 当前 PRD 未定义 Token 刷新策略

**风险场景：**
1. 用户提交需求 → PM Agent 生成 PRD（用 Token 写 docs/prd/）→ 用户超过数小时未操作，Token 可能已失效 → Dev Agent 执行时 Push 代码失败 → Temporal 重试仍失败 → 任务永久阻塞
2. Temporal 重试 Activity 时，Token 已过期，重试无效

**建议修复：**
在 §3.5 或 §7 中增加：
> **GitHub OAuth Token 刷新策略：**
> - Go API 在发起 Workflow 前，检查 Token 有效期（如 GitHub API 可查询 token 剩余时间）
> - Token 即将过期时（< 1h），自动引导用户重新授权 GitHub OAuth
> - Token 失效时：Activity 立即失败并通知用户，阻止无效重试

---

### P0-NEW-2：Master Key 轮换策略缺失 ⚠️

**严重程度：** P1（当前 MVP 可暂缓，但生产环境为 P0）

**问题描述：**
- 用户 Key 由 Master Key 加密后存入 PostgreSQL
- Master Key 存储在环境变量，一旦泄漏或需要轮换，所有用户 Key 均无法解密

**建议修复（可在后续 PRD 补充）：**
> **Master Key 轮换方案：**
> - Master Key 泄漏应对：立即重置环境变量，重新引导所有用户重新提交 API Key
> - Master Key 轮换（定期）：设计 Master Key 版本号（v1/v2），渐进式重加密用户 Key，不影响线上服务

---

## 四、非 P0 级别的观察项（供参考）

| 级别 | 问题 | 说明 |
|------|------|------|
| P2 | Python Agent 幂等性 | gRPC Activity 重试时，GitHub 操作需幂等（如检查 PR 是否已存在） |
| P2 | HiL #2/#3 超时默认行为 | 72h 无响应且未选择的最终状态应明确定义 |
| P3 | PostgreSQL 备份策略 | MVP 可暂缓，生产环境需定义备份频率和恢复方案 |
| P3 | Temporal 状态持久化 | 当前依赖 Temporal 内置 SQL 存储，需确保数据库不丢 |

---

## 五、总结

| 类别 | 结论 |
|------|------|
| 上一轮 P0-1~P0-4 | ✅ 全部已正确修订 |
| gRPC + Temporal Activity 方案 | ✅ 可行，技术选型合理 |
| HiL 超时策略（阻塞/非阻塞） | ✅ 分层合理，建议明确超时默认行为 |
| 新发现 P0 | ⚠️ GitHub OAuth Token 刷新机制缺失（需补充） |
| 建议升为 P1 | Master Key 轮换策略缺失（当前 MVP 可接受） |

**综合结论：建议签署通过（条件）——需先修复 P0-NEW-1（GitHub OAuth Token 刷新）。**

---

*评审人：开发工程师 | 评审轮次：第四轮*
