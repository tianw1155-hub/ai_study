# DevPilot 系统框架 PRD v0.2 第二轮评审

> 评审日期：2026-03-28 | 评审角色：开发工程师 | 评审结论版本：v1.0

---

## 一、上一轮 P0 问题修订核查

### ✅ P0-1：Python Agent ↔ Go API 通信机制（SSE + WebSocket）

**原问题：** 通信机制不明确，无实时推送能力。

**v0.2 修订：**
- Section 3.4 新增「实时通信机制」章节
- 链路：`Temporal Workflow 执行 Agent Activity → SSE → Go API → WebSocket → 前端`
- 定义了事件类型：`task:started / task:progress / task:completed / task:failed`

**评审意见：**

| 维度 | 评估 |
|------|------|
| 架构方向 | ✅ SSE + WebSocket 分层设计合理 |
| Go → 前端 WebSocket | ✅ 明确 |
| **Python Agent → Go API（SSE）** | ⚠️ **存在架构黑洞**（见下节 P0-new-1） |
| 事件类型 | ✅ 覆盖基本场景 |
| 断线重连 | ❌ 未提及 |
| 消息可靠性（at-least-once） | ❌ 未提及 |

**结论：** 方向正确，但实现路径存在重大未澄清点。

---

### ✅ P0-2：用户 Key 存储矛盾（加密 + 引用 ID）

**原问题：** 用户 Key 存储方式存在矛盾。

**v0.2 修订：**
- PostgreSQL AES-256 加密存储
- Temporal Workflow History 仅存引用 ID
- Activity 执行时：读取 → 临时变量 → 不落盘

**评审意见：**

| 维度 | 评估 |
|------|------|
| 加密存储 | ✅ 方向正确 |
| Workflow History 不存明文 | ✅ |
| **AES-256 主密钥管理** | ❌ **未见说明**（见下节 P0-new-2） |
| **"不落盘"实现** | ⚠️ **未验证**——Python 进程内临时变量是否可能落 swap？GIL 下的内存安全未讨论 |
| Key 隔离（每个用户仅用自己的 Key） | ✅ 从描述看已满足 |

**结论：** 方案框架正确，但密钥管理主钥匙的存储和轮转方案缺失。

---

### ✅ P0-3：配额控制（已移除）

**原问题：** 配额控制方案不明确。

**v0.2 修订：**
- 用户自配 Key，平台仅提供免费模型（DeepSeek-V3 / Gemini-2.0-Flash）
- Section 7 明确：「用户自配自付，平台不存储」

**结论：** 已彻底移除，✅ 无问题。

---

### ✅ P0-4：自动化率无定义

**原问题：** 自动化率无法计量。

**v0.2 修订：**
- Section 2.2 定义：`自动化率 = 无人介入完成的需求数 / 总需求数 × 100%`
- 计量说明表：明确 HiL #1/#2/#3 确认 = 人工介入，提交需求/自动流转 ≠ 人工介入

**结论：** ✅ 定义清晰，计量方式可行。

---

### ✅ P0-5：交付时间边界模糊

**原问题：** 交付时间无法衡量。

**v0.2 修订：**
- 计时起点：用户点击「提交」时刻
- 计时终点：GitHub PR 创建成功 **或** 预览 URL 生成时刻（以最后完成者为准）

**评审意见：**
- ✅ 起点明确
- ⚠️ 终点有歧义：「PR 创建成功」和「预览 URL 生成」是两个不同的事件：
  - 如果是"PR 创建成功且预览 URL 生成"，那失败预览 URL 生成时，终点怎么定？
  - 如果是"PR 创建成功或预览 URL 生成（任一先完成）"，则可能 PR 已合入但预览未出，用户感知不到交付
- 建议明确定义为：**预览 URL 生成时刻**（预览才算交付完成，PR 创建只是代码就位）

**结论：** ✅ 框架正确，建议统一终点为「预览 URL 生成」。

---

### ✅ P0-6：PR 质量门禁缺失

**原问题：** 无代码质量控制。

**v0.2 修订：**
- Section 5.1：ESLint/golangci-lint（0 错误）、覆盖率 ≥ 60%、Bandit/Semgrep（0 Critical/High）、Prettier/gofmt

**评审意见：**

| 维度 | 评估 |
|------|------|
| lint + 格式化 | ✅ |
| 覆盖率 ≥ 60% | ⚠️ 简单/happy-path 项目容易达标，复杂项目需差异化阈值 |
| 安全扫描 | ✅ 工具链明确 |
| **PR 合入前强制执行** | ✅ GitHub Actions 自动触发 |
| **谁来修复 CI 失败？** | ❌ 未讨论——Dev Agent 自动修复？还是需要人工介入？若需人工介入，自动化率如何保证？ |

**结论：** ✅ CI 门禁到位，但 CI 失败处理流程需明确（影响自动化率）。

---

## 二、新发现 P0 问题

---

### 🔴 P0-new-1：Python Agent → Go API SSE 通道的架构黑洞

**严重程度：P0（阻断）**

**问题描述：**

Section 3.4 描述链路为：
```
Temporal Workflow 执行 Agent Activity
    ↓（SSE 长连接）
Go API 接收执行状态
```

但这里存在**架构黑洞**：

1. **Temporal 是工作流引擎，不是 SSE 服务器**。Temporal Workflow 本身不发起 SSE 连接。

2. **Python Agent 是 Temporal Worker**。Worker 接收 Activity Task，执行后返回结果给 Temporal。这个过程中：
   - Worker 不"推送"SSE——它只响应 Temporal 的任务分发
   - SSE 需要一个常驻的 HTTP 服务器来接收/转发事件

3. **Python Agent 如何知道 Go API 的 SSE 端点？** Go API 的地址、端口、认证方式（如果需要）完全未提及。

**具体疑点：**
- Temporal Workflow 怎么触发 Python Agent 往外发 SSE？
- SSE 连接是 Workflow 级别的还是 Activity 级别的？
- 如果是 Activity 级别的，每个 Activity 都建立 SSE 连接，连接数怎么控制？
- SSE 连接断开后，事件是否丢失？如何保证 at-least-once ？

**建议方案：**
在 Go API 侧部署一个 SSE Gateway / WebSocket Hub，所有 Python Agent 通过共享消息队列（如 Redis Pub/Sub 或内部 HTTP 回调）将事件推送到 Go API，再由 Go API 统一转发 WebSocket 到前端。Temporal 本身不直接暴露 SSE。

**修复要求：** 在技术架构中明确：
1. Python Agent 事件如何传递给 Go API（SSE/HTTP callback/消息队列）
2. 连接管理和事件可靠性保证

---

### 🔴 P0-new-2：API Key 加密方案缺少主密钥（Master Key）管理

**严重程度：P0（法律/合规风险）**

**问题描述：**

Section 3.3 说「用户 Key 加密存储在 PostgreSQL（AES-256）」，但：

1. **AES-256 是对称加密，需要 Master Key 来加密/解密**。这个 Master Key 存在哪里？
   - 写死在代码里？→ 泄露风险
   - 写死在 Docker 镜像里？→ 同样泄露
   - 环境变量？→ 宿主机重启后丢失，服务不可恢复
   - 密钥管理服务（KMS）？→ 未提及

2. **Master Key 轮转方案缺失**。用户 Key 量大后（数千用户），Master Key 泄露的破坏面极大。是否有定期轮转机制？

3. **PostgreSQL 数据加密 vs. 传输加密**。Section 3.3 说的是 AES-256 加密存储，但 PostgreSQL 本身是否启用了 `pgcrypto` 或透明数据加密（TDE）？这两者是不同层次。

**合规风险：** 如果用户 Key 泄露（如 GPT API Key），攻击者可以以该用户身份消费其账户——这是平台的法律责任范围。

**修复要求：**
- 明确 Master Key 存储方案（推荐：HashiCorp Vault / AWS KMS / GCP Secret Manager）
- 说明 Master Key 的初始化和轮转机制
- 明确 PostgreSQL 的加密层次（应用层 AES + 数据库层 TDE）

---

### 🟡 P0-new-3：LLM Gateway 设计空白

**严重程度：P0（影响多 Agent 协作正确性）**

**问题描述：**

Section 3.1 架构图和 Section 3.3 提到「LLM Gateway」，但：
- LLM Gateway 是路由层（proxy）还是 key 管理器？
- 多用户并发时，Key 如何隔离（用户 A 的 GPT Key 不会串到用户 B 的请求）？
- 平台内置免费模型和用户自配模型如何路由？
- 请求失败/超时如何处理（Go Agent 还是 Python Agent 重试）？

**修复要求：** 在技术架构中补充 LLM Gateway 的职责边界和请求路由逻辑。

---

## 三、中高优先级问题

### 🟡 P-1：CI 失败后自动化率如何保证？

Section 5.1 的 CI 门禁通过才合入 PR，但：
- CI 失败后，是 Dev Agent 自动修复，还是需要人工介入？
- 如果需要人工介入（HiL），则自动化率会下降，但 Section 2.2 没有定义「CI 失败」是否算一次人工介入
- 建议：定义 CI 失败后的处理 SOP，并明确其对自动化率的影响

---

### 🟡 P-2：GitHub OAuth + 用户 Key 管理 UI 缺失

Section 7 说「GitHub OAuth 登录」，但：
- 用户自配 LLM Key 的入口在哪里？
- Key 管理页面（上传、删除、更新）是否在 MVP 范围内？
- 如果没有 UI，用户怎么配置自己的 Key？

---

### 🟡 P-3：Ops Agent 调用云平台凭证管理缺失

Section 8.2 提到 Ops Agent 触发 Vercel/Render 部署，但：
- 平台持有哪个 Vercel/Render 账号的凭证？
- 是否用用户的 GitHub OAuth Token 来触发用户仓库的预览部署？
- 如果是平台统一账号：平台如何获取用户的 Vercel/Render 权限授权？

---

### 🟡 P-4：Temporal Worker 注册与扩缩容

Python Agent 是 Temporal Worker，但：
- Worker 的注册地址（Temporal Server 地址）在哪里配置？
- 多个 Python Agent 实例如何水平扩展（共享 Task Queue）？
- Worker 崩溃后，Temporal 是否有 Activity 重试保障（应该是有，但需确认 Activity 设计支持幂等）？

---

## 四、上一轮问题修订结论汇总

| P0 | 问题 | 修订状态 | 说明 |
|----|------|----------|------|
| 1 | Python Agent ↔ Go API 通信 | ⚠️ 部分解决 | SSE 方向明确，但实现路径有架构黑洞 |
| 2 | 用户 Key 存储矛盾 | ⚠️ 部分解决 | 加密框架正确，但 Master Key 管理缺失 |
| 3 | 配额控制 | ✅ 已解决 | 用户自配自付，清晰 |
| 4 | 自动化率无定义 | ✅ 已解决 | 计量方式明确 |
| 5 | 交付时间边界模糊 | ✅ 已解决 | 计时边界明确 |
| 6 | PR 质量门禁缺失 | ✅ 已解决 | CI 门禁到位，但 CI 失败处理需补充 |

---

## 五、总体评审结论

| 维度 | 评级 | 说明 |
|------|------|------|
| 产品定位清晰度 | ⭐⭐⭐⭐ | 一句话定位明确，核心价值对比清晰 |
| 需求完整性 | ⭐⭐⭐ | MVP 范围清晰，但多 Agent 协作协议、安全边界、Key 管理需细化 |
| 技术可行性 | ⭐⭐ | SSE 架构黑洞、Master Key 缺失、LLM Gateway 空白是实现阻断项 |
| 安全设计 | ⭐⭐ | Key 加密方向正确，但密钥管理方案缺失；GitHub 权限边界未定义 |
| 自动化率可计量性 | ⭐⭐⭐⭐ | 定义清晰，计量方式可行 |

**综合判定：v0.2 仍需修改（3 个新增 P0 未解决）**

---

## 六、建议下一步

1. **先解决新增 P0**（优先级：P0-new-1 > P0-new-2 > P0-new-3）
2. 修订后重新评审，再进入各子模块 PRD（PM Agent / Dev Agent / Test Agent）
3. 建议补充：LLM Gateway 详细设计文档

---

*评审人：开发工程师 | 评审日期：2026-03-28*
