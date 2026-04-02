-- DevPilot Database Schema
-- PostgreSQL 16
-- Generated: 2026-03-28

-- ============================================================================
-- tasks 表（含 PRD-任务看板 v0.4 所有字段）
-- ============================================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500),
  type VARCHAR(20), -- code/test/deploy/document
  agent_type VARCHAR(20), -- coder/tester/deployer/planner
  priority VARCHAR(10), -- high/medium/low
  state VARCHAR(20), -- pending/running/testing/passed/failed/cancelled/completed
  assignee VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  estimated_duration INT, -- 秒
  actual_duration INT, -- 秒
  retry_count INT DEFAULT 0,
  version INT DEFAULT 0, -- 乐观锁
  last_rollback_at TIMESTAMP
);

CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_assignee ON tasks(assignee);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- ============================================================================
-- rollback_logs 表（含 PRD-产物交付 v0.4 所有字段）
-- ============================================================================
CREATE TABLE rollback_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  target_version VARCHAR(20),
  step INT,
  step_name VARCHAR(100),
  status VARCHAR(20), -- pending/completed/failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  retry_count INT DEFAULT 0,
  github_revert_sha VARCHAR(40),
  deployment_id VARCHAR(100),
  last_rollback_at TIMESTAMP
);

CREATE INDEX idx_rollback_logs_task_id ON rollback_logs(task_id);
CREATE INDEX idx_rollback_logs_status ON rollback_logs(status);

-- ============================================================================
-- documents 表
-- ============================================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  filename VARCHAR(255),
  file_type VARCHAR(20), -- md/docx/pdf/txt
  file_size INT,
  summary TEXT,
  raw_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_task_id ON documents(task_id);

-- ============================================================================
-- deployments 表
-- ============================================================================
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  platform VARCHAR(20), -- vercel/render
  status VARCHAR(20), -- idle/deploying/success/failed/aborted
  commit_sha VARCHAR(40),
  preview_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployments_task_id ON deployments(task_id);
CREATE INDEX idx_deployments_status ON deployments(status);

-- ============================================================================
-- prd_versions 表
-- ============================================================================
CREATE TABLE prd_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  version VARCHAR(20),
  content TEXT,
  commit_sha VARCHAR(40),
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_prd_versions_task_id ON prd_versions(task_id);
CREATE INDEX idx_prd_versions_is_current ON prd_versions(task_id, is_current) WHERE is_current = TRUE;

-- ============================================================================
-- task_logs 表（PRD-任务看板 v0.4 - 执行日志）
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW(),
  level VARCHAR(10), -- INFO/DEBUG/ERROR/WARN
  agent VARCHAR(100),
  message TEXT
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_task_logs_timestamp ON task_logs(task_id, timestamp);

-- ============================================================================
-- users 表（GitHub OAuth，PRD-DevPilot-SYSTEM v0.4）
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    login VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- ============================================================================
-- user_preferences 表（LLM 模型偏好）
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) UNIQUE NOT NULL,
    model VARCHAR(100),
    api_key VARCHAR(255),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- ============================================================================
-- memories 表（长期记忆 + 每日总结）
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100),              -- 用户标识（GitHub login 或 anonymous）
    type VARCHAR(30) NOT NULL,         -- 'session_summary'|'daily_summary'|'project_context'|'user_preference'
    content TEXT NOT NULL,             -- 记忆内容
    summary VARCHAR(500),              -- 简短摘要，用于展示列表
    keywords VARCHAR(255),             -- 关键词，逗号分隔
    embedding VECTOR(1536),           -- 向量（可选，语义搜索用）
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW(),
    use_count INT DEFAULT 0           -- 被引用次数
);

CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
