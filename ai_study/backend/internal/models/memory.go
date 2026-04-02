package models

import "time"

// MemoryType represents the type of memory entry.
type MemoryType string

const (
	MemoryTypeSessionSummary  MemoryType = "session_summary"  // 会话摘要
	MemoryTypeDailySummary   MemoryType = "daily_summary"   // 每日总结
	MemoryTypeProjectContext MemoryType = "project_context"  // 项目上下文
	MemoryTypeUserPreference MemoryType = "user_preference"  // 用户偏好
)

// Memory represents a long-term memory entry.
type Memory struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id,omitempty"`
	Type       MemoryType `json:"type"`
	Content    string     `json:"content"`
	Summary    string     `json:"summary,omitempty"`
	Keywords   string     `json:"keywords,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt time.Time  `json:"last_used_at"`
	UseCount   int        `json:"use_count"`
}

// MemoryCreateRequest is the request body for creating a memory.
type MemoryCreateRequest struct {
	UserID   string     `json:"user_id,omitempty"`
	Type     MemoryType `json:"type"`
	Content  string     `json:"content"`
	Summary  string     `json:"summary,omitempty"`
	Keywords string     `json:"keywords,omitempty"`
}

// MemoryListResponse is the response for listing memories.
type MemoryListResponse struct {
	Memories []Memory `json:"memories"`
	Total    int      `json:"total"`
}
