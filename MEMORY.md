# MEMORY.md - 长期记忆

## 项目背景
DevPilot（织翼）— AI 开发团队平台，通过自然语言提交需求，AI Agent 团队自动完成代码生成、测试、部署。

## 人物
- **小毛球** 🦞：我是 AI 助手，小薇妹是终审人
- **小薇妹**：项目负责人，评审流程的终审者

## 评审流程
开发工程师评审 → 测试工程师评审 → 小毛球审核 → 小薇妹终审

## 当前进度（2026-03-28）
- PRD 已锁定 v0.5（首页）、v0.4（任务看板、产物交付）
- Phase 0 骨架 ✅ + Phase 1 首页 ✅
- 项目位于 `ai_study/` 目录
  - `backend/` — Go + PostgreSQL + Temporal + WebSocket
  - `frontend/` — Next.js + React Query + Zustand
- Phase 2（任务看板）和 Phase 3（产物交付）待开发

## 重要经验
- `npx create-next-app` 在 subagent 中无法等待交互安装 → 用直接写文件代替
- JWT 认证 placeholder 必须替换为真实签名验证，不能留在生产路径
