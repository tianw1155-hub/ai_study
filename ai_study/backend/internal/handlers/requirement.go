package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/temporal"
	"github.com/google/uuid"
)

// RequirementSubmitRequest represents the request body for requirement submission.
type RequirementSubmitRequest struct {
	RequirementID string `json:"requirement_id,omitempty"`
	Prompt        string `json:"prompt"`
	UserID        string `json:"user_id,omitempty"`
	LLMModel      string `json:"llm_model,omitempty"`
	APIKey        string `json:"api_key,omitempty"`
}

// RequirementSubmitResponse represents the response for requirement submission.
type RequirementSubmitResponse struct {
	RequirementID string `json:"requirement_id"`
	TaskID        string `json:"task_id,omitempty"`
	Message       string `json:"message"`
}

// AgentResultPayload 是发给 Python Agent 的请求体
type AgentProcessPayload struct {
	Requirement string `json:"requirement"`
	UserID      string `json:"user_id"`
	Language    string `json:"language"`
	Framework   string `json:"framework"`
	LLMModel    string `json:"llm_model"`
	APIKey      string `json:"api_key"`
}

var agentServiceURL = os.Getenv("AGENT_SERVICE_URL")

func init() {
	if agentServiceURL == "" {
		agentServiceURL = "http://localhost:8081"
	}
}

// HandleRequirementSubmit handles POST /api/requirements/submit
// Validates prompt, writes to tasks table, triggers Python Agent service, returns requirementId.
func HandleRequirementSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// Decode request body
	var req RequirementSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	// Validate prompt length (10-2000 characters)
	prompt := strings.TrimSpace(req.Prompt)
	if len(prompt) < 10 || len(prompt) > 2000 {
		http.Error(w, `{"error": "Prompt must be between 10 and 2000 characters"}`, http.StatusBadRequest)
		return
	}

	// Generate or use provided requirement ID
	requirementID := req.RequirementID
	if requirementID == "" {
		requirementID = uuid.New().String()
	}

	// Use provided user ID or default to "anonymous"
	userID := req.UserID
	if userID == "" {
		userID = "anonymous"
	}

	ctx := context.Background()

	// Infer task type from prompt keywords or default to "code"
	taskType := inferTaskType(prompt)

	// Generate task ID
	taskID := uuid.New().String()

	// Insert into tasks table with state=pending
	_, err := db.Pool().Exec(ctx,
		`INSERT INTO tasks (id, title, type, state, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		taskID,
		truncateTitle(prompt),
		taskType,
		"pending",
		time.Now(),
		time.Now(),
	)
	if err != nil {
		log.Printf("Failed to insert task: %v", err)
		http.Error(w, `{"error": "Failed to create task"}`, http.StatusInternalServerError)
		return
	}

	// Store user model config (upsert)
	if req.LLMModel != "" && req.APIKey != "" {
		_, err = db.Pool().Exec(ctx,
			`INSERT INTO user_preferences (user_id, model, api_key, updated_at)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (user_id) DO UPDATE SET model=$2, api_key=$3, updated_at=$4`,
			userID, req.LLMModel, req.APIKey, time.Now(),
		)
		if err != nil {
			log.Printf("Warning: failed to store user preferences: %v", err)
		}
	}

	// Call Python Agent Service asynchronously
	go callAgentService(requirementID, taskID, req, prompt)

	// Return success response immediately
	resp := RequirementSubmitResponse{
		RequirementID: requirementID,
		TaskID:        taskID,
		Message:       "Requirement submitted, AI processing started",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// callAgentService 异步调用 Python Agent Service
func callAgentService(requirementID, taskID string, req RequirementSubmitRequest, prompt string) {
	// 注入记忆上下文
	ctx := context.Background()
	memoryContext := fetchMemoryContext(ctx, prompt, req.UserID)
	enrichedPrompt := memoryContext + "\n\n[用户新需求]\n" + prompt

	payload := AgentProcessPayload{
		Requirement: enrichedPrompt,
		UserID:      req.UserID,
		Language:    inferLanguage(req.UserID),
		Framework:   "",
		LLMModel:    req.LLMModel,
		APIKey:      req.APIKey,
	}

	body, _ := json.Marshal(payload)
	url := agentServiceURL + "/process"

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Agent] Failed to call agent service for %s: %v", requirementID, err)
		// 更新 task 状态为 failed
		updateTaskState(taskID, "failed")
		return
	}
	defer resp.Body.Close()

	log.Printf("[Agent] Agent service accepted requirement %s (task %s)", requirementID, taskID)

	// Temporal workflow 仍然触发（用于历史记录，即使 stub 模式也有日志）
	_ = temporal.StartRequirementWorkflow(context.Background(), requirementID, prompt, req.UserID)
}

// inferTaskType attempts to infer the task type from prompt keywords.
func inferTaskType(prompt string) string {
	lower := strings.ToLower(prompt)
	switch {
	case strings.Contains(lower, "测试") || strings.Contains(lower, "test"):
		return "test"
	case strings.Contains(lower, "部署") || strings.Contains(lower, "deploy"):
		return "deploy"
	case strings.Contains(lower, "文档") || strings.Contains(lower, "doc") || strings.Contains(lower, "readme"):
		return "document"
	default:
		return "code"
	}
}

// truncateTitle truncates the prompt to create a title (max 500 chars).
func truncateTitle(prompt string) string {
	if len(prompt) <= 500 {
		return prompt
	}
	return prompt[:500]
}

// inferLanguage 根据 task type 推断语言
func inferLanguage(userID string) string {
	return "python" // 默认，后续可从用户偏好读取
}

// updateTaskState 更新任务状态
func updateTaskState(taskID, state string) {
	ctx := context.Background()
	db.Pool().Exec(ctx, `UPDATE tasks SET state=$1, updated_at=NOW() WHERE id=$2`, state, taskID)
}

// fetchMemoryContext retrieves relevant memories and formats them as context prefix.
// Returns empty string if no relevant memories found.
func fetchMemoryContext(ctx context.Context, prompt string, userID string) string {
	words := strings.Fields(prompt)
	var conditions []string
	args := []interface{}{}

	for i, word := range words {
		if len(word) < 3 {
			continue
		}
		conditions = append(conditions, "(content ILIKE $"+itoa(i+1)+" OR keywords ILIKE $"+itoa(i+1)+" OR summary ILIKE $"+itoa(i+1)+")")
		args = append(args, "%"+word+"%")
		if len(conditions) >= 10 {
			break
		}
	}

	if len(conditions) == 0 {
		return ""
	}

	query := `SELECT id, COALESCE(user_id,''), type, content, COALESCE(summary,''), COALESCE(keywords,''), created_at, last_used_at, COALESCE(use_count,0)
	          FROM memories WHERE (` + strings.Join(conditions, " OR ") + `)`

	if userID != "" && userID != "anonymous" {
		query += ` AND (user_id = $` + itoa(len(args)+1) + ` OR user_id = '' OR user_id IS NULL)`
		args = append(args, userID)
	}

	query += ` ORDER BY use_count DESC, last_used_at DESC LIMIT 3`

	rows, err := db.Pool().Query(ctx, query, args...)
	if err != nil {
		return ""
	}
	defer rows.Close()

	var memories []string
	for rows.Next() {
		var id, uid, mtype, content, summary, keywords string
		var createdAt, lastUsedAt time.Time
		var useCount int
		if err := rows.Scan(&id, &uid, &mtype, &content, &summary, &keywords, &createdAt, &lastUsedAt, &useCount); err != nil {
			continue
		}
		db.Pool().Exec(ctx, `UPDATE memories SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1`, id)
		memories = append(memories, content)
	}

	if len(memories) == 0 {
		return ""
	}

	return "[相关记忆上下文]\n" + strings.Join(memories, "\n\n---\n")
}

// itoa converts a positive int to a string without importing strconv.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

