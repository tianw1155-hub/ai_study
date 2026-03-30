# 系统架构概览

## 1. 架构概览图

```mermaid
graph TB
    subgraph 前端层["前端层 (Interface Layer)"]
        WA[Web App<br/>React/Next.js]
        MA[移动端 H5<br/>响应式页面]
    end

    subgraph 网关层["API 网关层"]
        APIGW[腾讯云 API Gateway]
    end

    subgraph 服务层["应用层 (Application Layer)"]
        subgraph 微服务
            US[用户服务<br/>User Service]
            CS[职业规划服务<br/>Career Service]
            RS[推荐服务<br/>Recommendation Service]
            AS[认证服务<br/>Auth Service]
        end
    end

    subgraph 领域层["领域层 (Domain Layer)"]
        subgraph 核心域
            DM[职业方向模型<br/>Career Domain]
            SM[技能图谱模型<br/>Skill Graph]
            CM[认证体系模型<br/>Certification]
        end
    end

    subgraph 基础设施层["基础设施层 (Infrastructure Layer)"]
        MONGO[(MongoDB<br/>文档数据库)]
        REDIS[(Redis<br/>缓存)]
        COS[腾讯云 COS<br/>对象存储]
        SCF[腾讯云 SCF<br/>函数计算]
    end

    subgraph 可观测性["可观测性"]
        CLS[腾讯云 CLS<br/>日志服务]
        SENTRY[Sentry<br/>错误监控]
        MONITOR[云监控<br/>基础指标]
    end

    WA --> APIGW
    MA --> APIGW
    APIGW --> US
    APIGW --> CS
    APIGW --> RS
    APIGW --> AS

    US --> DM
    CS --> DM
    CS --> SM
    RS --> SM
    RS --> CM

    US --> MONGO
    CS --> MONGO
    RS --> MONGO
    AS --> MONGO

    US --> REDIS
    CS --> REDIS
    RS --> REDIS

    SM --> COS
    CM --> COS

    US --> CLS
    CS --> CLS
    RS --> CLS
    AS --> CLS

    US --> SENTRY
    CS --> SENTRY
    RS --> SENTRY
    AS --> SENTRY
```

## 2. Clean Architecture 分层

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer (前端)                    │
│              Web App · 移动端 H5 · API Gateway                │
├─────────────────────────────────────────────────────────────┤
│                   Application Layer (应用)                    │
│         Use Cases · DTO · Service Interfaces                 │
├─────────────────────────────────────────────────────────────┤
│                     Domain Layer (领域)                       │
│          Entities · Value Objects · Domain Services          │
├─────────────────────────────────────────────────────────────┤
│                  Infrastructure Layer (基础设施)               │
│        MongoDB · Redis · COS · SCF · 第三方 API              │
└─────────────────────────────────────────────────────────────┘
```

## 3. 核心模块职责

| 模块 | 职责 | 技术选型 |
|------|------|----------|
| 用户服务 (US) | 用户注册/登录/认证 | JWT + 腾讯云 API Gateway |
| 职业规划服务 (CS) | 职业路径规划/技能树 | MongoDB + Redis |
| 推荐服务 (RS) | 个性化岗位/课程推荐 | MongoDB Graph 查询 |
| 认证服务 (AS) | 技能认证/证书管理 | COS + MongoDB |

## 4. 数据流架构

```mermaid
sequenceDiagram
    participant U as 用户
    participant GW as API Gateway
    participant S as Service
    participant D as Domain
    participant I as Infrastructure

    U->>GW: HTTP Request
    GW->>S: 路由转发
    S->>D: 业务校验
    D->>I: 数据持久化
    I-->>D: 查询结果
    D-->>S: 领域对象
    S-->>GW: DTO Response
    GW-->>U: JSON Response
```

## 5. 部署架构 (MVP)

```mermaid
graph LR
    subgraph 腾讯云区域
        subgraph VPC
            SCF1[SCF 函数<br/>用户服务]
            SCF2[SCF 函数<br/>职业服务]
            SCF3[SCF 函数<br/>推荐服务]
            SCF4[SCF 函数<br/>认证服务]
            REDIS[(Redis<br/>Serverless)]
            MONGO[(MongoDB<br/>Atlas Serverless)]
        end
        COS[COS<br/>静态资源]
        CLS[CLS<br/>日志服务]
    end

    CDN[腾讯云 CDN] --> COS
    CDN --> SCF1
    CDN --> SCF2
    CDN --> SCF3
    CDN --> SCF4
```

## 6. 质量属性目标

| 质量属性 | 目标值 | 策略 |
|----------|--------|------|
| 性能 | P99 < 500ms | Redis 缓存 · CDN 加速 |
| 可用性 | 99.9% | SCF 自动扩缩容 · 多可用区 |
| 安全性 | OAuth2 + JWT | HTTPS 强制 · 输入校验 |
| 可维护性 | 低耦合高内聚 | Clean Architecture · ADR |
| 可扩展性 | 水平扩展 | 无状态服务 · 函数计算 |
