// WebSocket Message Type Definitions
//
// Unified schema for all WebSocket events, aligned with PRD-首页 v0.5.

package websocket

import "time"

// MessageType represents the event type sent over WebSocket.
type MessageType string

const (
	// Task lifecycle events
	TaskStarted     MessageType = "task:started"
	TaskProgress    MessageType = "task:progress"
	TaskCompleted   MessageType = "task:completed"
	TaskFailed      MessageType = "task:failed"
	TaskStateChange MessageType = "task:state_changed"

	// Agent heartbeat
	AgentHeartbeat MessageType = "agent:heartbeat"

	// Rollback events
	RollbackStarted MessageType = "rollback:started"
	RollbackStep    MessageType = "rollback:step"
	RollbackDone    MessageType = "rollback:done"
	RollbackFailed  MessageType = "rollback:failed"

	// Deployment events
	DeploymentStarted MessageType = "deployment:started"
	DeploymentUpdated MessageType = "deployment:updated"
	DeploymentStatus  MessageType = "deployment:status"
	DeploymentDone    MessageType = "deployment:done"
	DeploymentFailed  MessageType = "deployment:failed"

	// Notification events
	Notification MessageType = "notification"

	// Error events
	Error MessageType = "error"
)

// Priority represents task priority levels.
type Priority string

const (
	PriorityHigh   Priority = "high"
	PriorityMedium Priority = "medium"
	PriorityLow    Priority = "low"
)

// AgentType represents the AI agent types.
type AgentType string

const (
	AgentPlanner  AgentType = "PLANNER"
	AgentCoder    AgentType = "CODER"
	AgentTester   AgentType = "TESTER"
	AgentDeployer AgentType = "DEPLOYER"
)

// TaskType represents the type of task.
type TaskType string

const (
	TaskTypeCode      TaskType = "code"
	TaskTypeTest      TaskType = "test"
	TaskTypeDeploy    TaskType = "deploy"
	TaskTypeDocument  TaskType = "document"
)

// TaskState represents the current state of a task.
type TaskState string

const (
	TaskStatePending    TaskState = "pending"
	TaskStateRunning    TaskState = "running"
	TaskStateTesting    TaskState = "testing"
	TaskStatePassed     TaskState = "passed"
	TaskStateFailed     TaskState = "failed"
	TaskStateCancelled  TaskState = "cancelled"
	TaskStateCompleted  TaskState = "completed"
)

// Message represents the unified WebSocket message schema.
type Message struct {
	Type           MessageType    `json:"type"`
	TaskID         string         `json:"taskId,omitempty"`
	EventID        string         `json:"eventId,omitempty"`
	Timestamp      time.Time      `json:"timestamp"`
	ServerTime     int64          `json:"server_timestamp"` // Unix ms, for latency measurement
	AgentType      AgentType      `json:"agentType,omitempty"`
	TaskType       TaskType       `json:"taskType,omitempty"`
	Priority       Priority       `json:"priority,omitempty"`
	State          TaskState      `json:"state,omitempty"`
	Title          string         `json:"title,omitempty"`
	Progress       int            `json:"progress,omitempty"` // 0-100
	RetryCount     int            `json:"retryCount,omitempty"`
	Error          string         `json:"error,omitempty"`
	Payload        interface{}    `json:"payload,omitempty"`
	RollbackInfo   *RollbackInfo   `json:"rollbackInfo,omitempty"`
	DeploymentInfo *DeploymentInfo `json:"deploymentInfo,omitempty"`
}

// RollbackInfo contains rollback-specific data.
type RollbackInfo struct {
	TargetVersion   string `json:"targetVersion"`
	CurrentVersion  string `json:"currentVersion"`
	Step            int    `json:"step"`
	StepName        string `json:"stepName"`
	GitRevertSHA    string `json:"gitRevertSha,omitempty"`
	DeploymentID    string `json:"deploymentId,omitempty"`
}

// DeploymentInfo contains deployment-specific data.
type DeploymentInfo struct {
	Platform   string `json:"platform"` // vercel/render
	Status     string `json:"status"`   // idle/deploying/success/failed/aborted
	CommitSHA  string `json:"commitSha,omitempty"`
	PreviewURL string `json:"previewUrl,omitempty"`
}

// OutboundMessage wraps Message with client-targeting metadata.
type OutboundMessage struct {
	TargetClientIDs []string // Empty means broadcast to all
	Message         Message
}
