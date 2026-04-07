# AI Study - 智能产品工作流系统

AI 原生产品开发工作流，实现从需求对谈到代码交付的端到端闭环。

## 核心流程

1. **聊天式需求采集** — 用户在对话里描述产品想法，AI PM 实时追问澄清，检测到需求确认后自动生成 PRD
2. **PRD 生成 + AI 评审** — LLM 生成结构化产品文档，dev-engineer 评审层输出优点/风险/建议
3. **任务自动流转** — 用户确认后自动创建任务跳转看板，WebSocket 实时同步状态
4. **代码生成可见** — 点「立即开发」触发 coder agent 生成代码，在看板里直接查看输出

## 技术栈

- 前端：Next.js + React + TypeScript + Tailwind CSS
- 后端：Go (Gin) + PostgreSQL + WebSocket
- Agent：Python coder script + OpenClaw subagent
- LLM：MiniMax M2.7

## 本地运行

### 后端

```bash
cd backend
docker compose up -d  # 启动 PostgreSQL
go run cmd/api/main.go
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 项目结构

```
ai_study/
├── backend/
│   ├── cmd/api/          # Go API 入口
│   ├── internal/
│   │   ├── handlers/     # HTTP handlers
│   │   ├── db/           # PostgreSQL 连接
│   │   └── websocket/    # WebSocket Hub
│   └── scripts/
│       └── run_coder.py  # Coder agent 脚本
├── frontend/
│   └── src/
│       ├── app/          # Next.js pages
│       ├── components/   # React 组件
│       └── hooks/        # 自定义 hooks
└── README.md
```
