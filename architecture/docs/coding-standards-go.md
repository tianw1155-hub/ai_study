# Go 编码规范

## 1. 命名规范

### 1.1 包命名

```go
// ✅ 正确: 使用简短的小写单词
package user        // 用户模块
package career      // 职业模块
package skill       // 技能模块

// ❌ 错误: 避免下划线、大写、复数形式
package UserService
package user_service
package users
```

### 1.2 变量命名

```go
// ✅ 正确: 驼峰命名，见名知意
var userID string
var careerPath CareerPath
var isAuthenticated bool

// ❌ 错误: 避免缩写、单个字母(循环变量除外)
var uid string
var cp CareerPath
var flag bool
```

### 1.3 常量命名

```go
// ✅ 正确: 全大写下划线分割
const MaxRetryCount = 3
const DefaultPageSize = 20
const JWTExpirationHours = 24

// ❌ 错误
const max_retry_count = 3
const kMaxRetry = 3
```

### 1.4 接口命名

```go
// ✅ 正确: 动词 + er/eer 结尾
type UserRepository interface {}
type CareerService interface {}
type SkillCache interface {}

// ❌ 错误: 避免 I 前缀
type IUserRepository interface {}
```

## 2. 项目结构

```
src/
├── cmd/
│   └── api/
│       └── main.go              # 入口文件，依赖注入
├── internal/                     # 私有包
│   ├── handler/                  # Interface Layer
│   │   ├── handler.go           # 基类/中间件
│   │   ├── user.go
│   │   └── career.go
│   ├── service/                  # Application Layer
│   │   ├── user_service.go
│   │   └── career_service.go
│   ├── domain/                   # Domain Layer
│   │   ├── user.go
│   │   ├── career.go
│   │   └── errors.go            # 领域错误
│   ├── repository/               # Infrastructure Layer
│   │   ├── user_repo.go
│   │   └── mongo/               # MongoDB 实现
│   └── infrastructure/           # Infrastructure Layer
│       ├── mongodb/
│       ├── redis/
│       └── cos/
├── pkg/                          # 公共包
│   ├── response/                 # 统一响应
│   ├── errors/                   # 错误封装
│   └── middleware/               # 中间件
├── api/
│   └── v1/
│       └── openapi.yaml
├── config/
│   └── config.go
├── go.mod
└── go.sum
```

## 3. 代码组织

### 3.1 分层依赖规则

```
handler → service → domain
         ↓
    repository
         ↓
    infrastructure
```

**原则**: 依赖方向只能从外到内，禁止反向依赖。

### 3.2 文件组织

```go
// user.go - 单个领域对象
package domain

// User 领域实体
type User struct {
    ID        string
    Phone     string
    Nickname  string
    Skills    []UserSkill
    CreatedAt time.Time
    UpdatedAt time.Time
}

// UserSkill 用户技能值对象
type UserSkill struct {
    SkillID    string
    Level      int
    Certified  bool
}

// ✅ 正确: 按依赖顺序组织代码
// 1. 常量定义
// 2. 变量定义
// 3. 类型定义
// 4. 接口定义
// 5. 构造函数
// 6. 方法
// 7. 内部函数
```

## 4. 错误处理

### 4.1 错误定义

```go
// domain/errors.go
package domain

import "errors"

var (
    // 用户相关错误
    ErrUserNotFound      = errors.New("user not found")
    ErrUserAlreadyExists = errors.New("user already exists")
    ErrInvalidPhone      = errors.New("invalid phone number")
    
    // 职业相关错误
    ErrCareerNotFound    = errors.New("career not found")
    
    // 认证相关错误
    ErrCertExpired       = errors.New("certificate expired")
)

// ✅ 正确: 使用 sentinel errors 便于日志和测试
if errors.Is(err, domain.ErrUserNotFound) {
    // 处理逻辑
}
```

### 4.2 错误包装

```go
// ✅ 正确: 包装错误保留上下文
func (r *UserRepository) FindByID(ctx context.Context, id string) (*User, error) {
    user, err := r.collection.FindOne(ctx, bson.M{"_id": id})
    if err != nil {
        if errors.Is(err, mongo.ErrNoDocuments) {
            return nil, domain.ErrUserNotFound
        }
        return nil, fmt.Errorf("find user by id: %w", err)
    }
    return user, nil
}

// ❌ 错误: 不要直接暴露内部错误
// return err  // ❌
```

### 4.3 错误返回

```go
// handler/user.go
func (h *UserHandler) GetUser(c *gin.Context) {
    user, err := h.userService.GetUser(c.Request.Context(), userID)
    if err != nil {
        // ✅ 正确: 根据错误类型返回对应 HTTP 状态码
        if errors.Is(err, domain.ErrUserNotFound) {
            response.NotFound(c, err)
            return
        }
        response.InternalError(c, err)
        return
    }
    response.Success(c, user)
}
```

## 5. 日志规范

### 5.1 日志库选择

使用标准库的 `log/slog` 或第三方库如 `zerolog`。

### 5.2 日志级别

```go
const (
    LevelDebug = "debug"
    LevelInfo  = "info"
    LevelWarn  = "warn"
    LevelError = "error"
)
```

### 5.3 日志格式

```go
// ✅ 正确: 结构化日志
slog.Info("request completed",
    "traceId", traceID,
    "userId", userID,
    "method", method,
    "path", path,
    "statusCode", statusCode,
    "latencyMs", latency.Milliseconds(),
)

// ❌ 错误: 避免字符串拼接
// log.Printf("User %s logged in at %s", userID, time.Now())
```

## 6. 接口设计

### 6.1 接口定义原则

```go
// ✅ 正确: 小接口单一职责
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    FindByPhone(ctx context.Context, phone string) (*User, error)
    Create(ctx context.Context, user *User) error
    Update(ctx context.Context, user *User) error
}

// ✅ 正确: 接口放在使用者对侧
// user_service.go 定义它需要的 repository 接口
type UserService struct {
    repo UserRepository  // 接口作为结构体字段
}
```

### 6.2 DTO 定义

```go
// 请求 DTO
type CreateUserRequest struct {
    Phone    string `json:"phone" binding:"required"`
    Nickname string `json:"nickname" binding:"required,min=2,max=20"`
    Code     string `json:"code" binding:"required,len=6"`
}

// 响应 DTO
type UserResponse struct {
    ID        string    `json:"id"`
    Phone     string    `json:"phone"`
    Nickname  string    `json:"nickname"`
    Avatar    string    `json:"avatar,omitempty"`
    CreatedAt time.Time `json:"createdAt"`
}
```

## 7. 并发安全

### 7.1 互斥锁

```go
// ✅ 正确: 使用 sync.Mutex 保护共享状态
type UserCache struct {
    mu   sync.RWMutex
    data  map[string]*User
}

// ❌ 错误: 避免全局变量共享状态
var globalMap = make(map[string]*User)
```

### 7.2 context 传递

```go
// ✅ 正确: context 必须作为第一个参数
func (s *UserService) GetUser(ctx context.Context, id string) (*User, error) {
    // ctx 用于超时控制、取消信号、trace 传递
}

// ❌ 错误: 不要在 ctx 中存储值
// ctx = context.WithValue(ctx, "userId", id)
```

## 8. 测试规范

### 8.1 单元测试

```go
// ✅ 正确: 表格驱动测试
func TestUserService_GetUser(t *testing.T) {
    tests := []struct {
        name    string
        userID  string
        wantErr error
    }{
        {
            name:    "user exists",
            userID:  "valid-id",
            wantErr: nil,
        },
        {
            name:    "user not found",
            userID:  "invalid-id",
            wantErr: ErrUserNotFound,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // test logic
        })
    }
}
```

### 8.2 依赖注入

```go
// ✅ 正确: 依赖接口而非实现
type UserService struct {
    repo    UserRepository      // 接口
    cache   SkillCache          // 接口
    mapper  *Mapper             // 普通结构体
}

// ❌ 错误: 依赖具体实现
// type UserService struct {
//     mongoRepo *MongoUserRepository
//     redis     *RedisClient
// }
```

## 9. 配置管理

### 9.1 环境变量

```go
// config/config.go
type Config struct {
    MongoURI    string
    RedisAddr   string
    JWTKey      string
    Environment string
}

func Load() (*Config, error) {
    return &Config{
        MongoURI:    os.Getenv("MONGODB_URI"),
        RedisAddr:   os.Getenv("REDIS_ADDR"),
        JWTKey:      os.Getenv("JWT_SECRET_KEY"),
        Environment: getEnv("ENVIRONMENT", "development"),
    }
}
```

## 10. 代码审查清单

- [ ] 代码符合命名规范
- [ ] 错误已正确处理并包装
- [ ] 无硬编码配置
- [ ] context 正确传递
- [ ] 接口定义在使用者侧
- [ ] 有单元测试覆盖核心逻辑
- [ ] 日志使用结构化格式
- [ ] 无资源泄漏 (defer close)
