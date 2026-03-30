# MVP 技术方案（一周可行）

## 1. MVP 范围定义

### 1.1 核心功能 (MVP)

| 功能模块 | 功能点 | 优先级 | 预计工时 |
|----------|--------|--------|----------|
| 用户模块 | 手机号注册/登录 | P0 | 4h |
| 用户模块 | JWT 认证 | P0 | 2h |
| 职业探索 | 职业方向列表/详情 | P0 | 4h |
| 职业探索 | 技能图谱展示 | P0 | 6h |
| 技能规划 | 个人技能档案 | P1 | 4h |
| 认证管理 | 认证记录查询 | P1 | 2h |
| 推荐 | 热门职业推荐 | P1 | 4h |

### 1.2 剔除范围 (MVP 后)

- 复杂的个性化推荐算法
- 第三方认证机构对接
- 完整的支付流程
- 移动端原生 App
- 高级数据分析看板

## 2. 技术架构

### 2.1 架构决策

**ADR-001: MVP 部署架构选择**

| 候选方案 | 优点 | 缺点 | 决策 |
|----------|------|------|------|
| SCF 函数计算 | 免运维 · 自动扩缩容 · 按调用计费 | 冷启动延迟 · 有状态处理复杂 | **选用** |
| CVM 轻量服务器 | 完全控制 · 性能稳定 | 需自行运维 · 资源浪费 | 备选 |
| 容器 (TKE) | 弹性扩缩 · K8s 生态 | 学习成本高 · 成本较高 | 备选 |

**理由**: MVP 阶段需要快速迭代，SCF 的免运维特性可大幅提升开发效率。

### 2.2 技术选型清单

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| 前端 | Next.js (SSR) | SEO 友好 · 开发效率高 |
| API 网关 | 腾讯云 API Gateway | 原生集成 · 免运维 |
| 计算 | 腾讯云 SCF | 按需计费 · 自动扩缩 |
| 数据库 | MongoDB Atlas Serverless | 灵活 schema · 免运维 |
| 缓存 | 腾讯云 Redis Serverless | 冷启动快 · 按需计费 |
| 存储 | 腾讯云 COS | 成本低 · 接入简单 |
| 监控 | 腾讯云云监控 + CLS | 集成简单 |
| 错误追踪 | Sentry 免费版 | 接入简单 · 免费额度够用 |

## 3. 数据库设计

### 3.1 MongoDB Collections

```javascript
// users collection
{
  _id: ObjectId,
  phone: String,          // 手机号 (唯一索引)
  nickname: String,
  avatar: String,         // COS URL
  skills: [{              // 技能档案
    skillId: ObjectId,
    level: Number,         // 1-5
    certified: Boolean,
    certifiedAt: Date
  }],
  careerGoals: [ObjectId],  // 职业目标 refs career_paths
  createdAt: Date,
  updatedAt: Date
}

// career_paths collection
{
  _id: ObjectId,
  name: String,            // "前端开发工程师"
  category: String,        // "技术"
  description: String,
  skills: [{               // 技能要求图谱
    skillId: ObjectId,
    required: Boolean,
    weight: Number,        // 权重
    level: Number          // 要求等级 1-5
  }],
  salary: {
    entry: Number,         // 入职薪资
    mid: Number,           // 中位数
    senior: Number         // 高级
  },
  hotness: Number,         // 热度指数
  createdAt: Date
}

// skills collection
{
  _id: ObjectId,
  name: String,            // "Go语言"
  category: String,        // "编程语言"
  parentId: ObjectId,       // 父技能 (形成树结构)
  description: String,
  resources: [{            // 学习资源
    title: String,
    url: String,
    type: String           // "video" | "article" | "course"
  }],
  createdAt: Date
}

// certifications collection
{
  _id: ObjectId,
  userId: ObjectId,
  skillId: ObjectId,
  provider: String,        // "阿里云" | "AWS" | "内部认证"
  certificateNo: String,
  issueDate: Date,
  expireDate: Date,
  status: String,          // "valid" | "expired"
  credentialUrl: String,  // 证书URL
  createdAt: Date
}
```

### 3.2 索引设计

```javascript
// users
{ "phone": 1 }                     // 登录查询
{ "careerGoals": 1 }               // 职业目标查询

// career_paths
{ "category": 1, "hotness": -1 }   // 分类+热度
{ "skills.skillId": 1 }            // 技能反向查询

// skills
{ "parentId": 1 }                  // 树形结构查询

// certifications
{ "userId": 1, "skillId": 1 }     // 用户技能认证查询
{ "expireDate": 1 }               // 过期检查
```

## 4. API 设计

### 4.1 API 规范

- **版本**: v1
- **协议**: HTTPS
- **认证**: Bearer Token (JWT)
- **格式**: JSON
- **错误码**: 遵循 RFC 7807 Problem Details

### 4.2 API 列表

#### 用户模块

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | /api/v1/auth/phone/send-code | 发送验证码 | 否 |
| POST | /api/v1/auth/phone/verify | 验证登录 | 否 |
| GET | /api/v1/users/me | 获取当前用户 | 是 |
| PUT | /api/v1/users/me | 更新用户信息 | 是 |

#### 职业探索模块

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/v1/careers | 职业列表 | 是 |
| GET | /api/v1/careers/:id | 职业详情 | 是 |
| GET | /api/v1/careers/:id/skills | 职业技能图谱 | 是 |

#### 技能模块

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/v1/skills | 技能树 | 是 |
| GET | /api/v1/skills/:id | 技能详情 | 是 |

#### 认证模块

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | /api/v1/certifications | 添加认证 | 是 |
| GET | /api/v1/certifications | 我的认证列表 | 是 |
| GET | /api/v1/certifications/:id | 认证详情 | 是 |

#### 推荐模块

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/v1/recommendations/careers | 热门职业推荐 | 是 |
| GET | /api/v1/recommendations/skills | 技能提升建议 | 是 |

### 4.3 API 响应示例

**成功响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "64abc123...",
    "name": "前端开发工程师",
    "skills": [...]
  }
}
```

**错误响应**
```json
{
  "code": 1001,
  "message": "验证码已过期",
  "detail": "请重新获取验证码",
  "traceId": "abc123"
}
```

## 5. 项目结构

```
src/
├── cmd/
│   └── api/
│       └── main.go              # 入口
├── internal/
│   ├── handler/                 # Interface Layer
│   │   ├── user.go
│   │   ├── career.go
│   │   ├── skill.go
│   │   ├── certification.go
│   │   └── recommendation.go
│   ├── service/                  # Application Layer
│   │   ├── user_service.go
│   │   ├── career_service.go
│   │   └── ...
│   ├── domain/                   # Domain Layer
│   │   ├── user.go
│   │   ├── career.go
│   │   ├── skill.go
│   │   └── certification.go
│   ├── repository/               # Infrastructure Layer
│   │   ├── user_repo.go
│   │   ├── career_repo.go
│   │   └── ...
│   └── infrastructure/
│       ├── mongodb/
│       ├── redis/
│       └── cos/
├── pkg/
│   ├── response/                  # 统一响应
│   ├── errors/                   # 错误定义
│   └── middleware/               # 中间件
├── api/
│   └── v1/
│       └── openapi.yaml           # OpenAPI 规范
├── config/
│   └── config.go
└── go.mod
```

## 6. 可观测性方案

### 6.1 日志规范

```go
// 结构化日志字段
{
  "timestamp": "2026-03-22T10:00:00Z",
  "level": "info",
  "service": "career-service",
  "traceId": "abc123",
  "userId": "user456",
  "method": "GET",
  "path": "/api/v1/careers",
  "statusCode": 200,
  "latencyMs": 45,
  "message": "request completed"
}
```

### 6.2 监控指标

| 指标 | 描述 | 告警阈值 |
|------|------|----------|
| QPS | 每秒请求数 | > 1000 |
| 错误率 | 5xx 比例 | > 1% |
| P99 延迟 | 99 分位延迟 | > 500ms |
| CPU 使用率 | 函数 CPU | > 80% |

### 6.3 Sentry 集成

- 捕获未处理异常
- 记录请求上下文 (traceId, userId)
- 按环境分组 (production, staging)

## 7. 一周冲刺计划

### Sprint 1 (Week 1): MVP 交付

| Day | 任务 | 交付物 |
|-----|------|--------|
| Day 1 | 项目脚手架 + 架构设计评审 | 代码骨架 + ADR |
| Day 2 | 用户模块 (注册/登录/JWT) | API 端点 |
| Day 3 | 职业模块 CRUD | API 端点 + 种子数据 |
| Day 4 | 技能模块 + 缓存 | API 端点 + Redis |
| Day 5 | 认证模块 | API 端点 |
| Day 6 | 推荐模块 + 联调 | 完整 API |
| Day 7 | 部署 + 冒烟测试 | 可用服务 |

## 8. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| SCF 冷启动延迟 | 用户体验差 | 预置并发 + Redis 缓存 |
| MongoDB Serverless 冷启动 | API 响应慢 | 保持最小实例 |
| 验证码接口限制 | 无法注册 | 使用腾讯云 SMS 服务 |
| 数据初始化 | 无内容可展示 | 预置种子数据 |
