package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/temporal"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
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
		`INSERT INTO tasks (id, title, type, state, user_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		taskID,
		truncateTitle(prompt),
		taskType,
		"pending",
		userID,
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

// Requirement represents a product requirement.
type Requirement struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	CurrentVersion  int    `json:"current_version"`
	CreatedBy       string `json:"created_by"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
	ApprovedBy      string `json:"approved_by,omitempty"`
	ApprovedAt      string `json:"approved_at,omitempty"`
	PRDFilePath     string `json:"prd_file_path,omitempty"`
	PRDContent      string `json:"prd_content,omitempty"`
	ReviewStatus    string `json:"review_status,omitempty"`
	ReviewContent   string `json:"review_content,omitempty"`
}

// HandleRequirementsList returns all requirements.
func HandleRequirementsList(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")

	ctx := context.Background()
	var rows, err = db.Pool().Query(ctx,
		`SELECT id, title, COALESCE(status,'draft'), COALESCE(current_version,1),
		        COALESCE(created_by,''), created_at::text, updated_at::text,
		        COALESCE(approved_by,''), COALESCE(approved_at::text,''),
		        COALESCE(prd_file_path,''),
		        COALESCE(review_status,'pending'), COALESCE(review_content,'')
		 FROM requirements
		 WHERE ($1 = '' OR created_by = $1)
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		log.Printf("HandleRequirementsList: query failed: %v", err)
		writeError(w, "Failed to list requirements", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	reqs := []Requirement{}
	for rows.Next() {
		var r Requirement
		err := rows.Scan(&r.ID, &r.Title, &r.Status, &r.CurrentVersion,
			&r.CreatedBy, &r.CreatedAt, &r.UpdatedAt, &r.ApprovedBy, &r.ApprovedAt,
			&r.PRDFilePath, &r.ReviewStatus, &r.ReviewContent)
		if err != nil {
			log.Printf("HandleRequirementsList: scan failed: %v", err)
			continue
		}
		reqs = append(reqs, r)
	}

	writeJSON(w, map[string]interface{}{"requirements": reqs, "total": len(reqs)})
}

// HandleRequirementGet returns a single requirement with PRD content.
func HandleRequirementGet(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	ctx := context.Background()
	var req Requirement
	err := db.Pool().QueryRow(ctx,
		`SELECT id, title, COALESCE(status,'draft'), COALESCE(current_version,1),
		        COALESCE(created_by,''), created_at::text, updated_at::text,
		        COALESCE(approved_by,''), COALESCE(approved_at::text,''),
		        COALESCE(prd_file_path,''), COALESCE(prd_content,''),
		        COALESCE(review_status,'pending'), COALESCE(review_content,'')
		 FROM requirements WHERE id = $1`, id,
	).Scan(&req.ID, &req.Title, &req.Status, &req.CurrentVersion,
		&req.CreatedBy, &req.CreatedAt, &req.UpdatedAt, &req.ApprovedBy, &req.ApprovedAt,
		&req.PRDFilePath, &req.PRDContent, &req.ReviewStatus, &req.ReviewContent)
	if err != nil {
		log.Printf("HandleRequirementGet: not found: %s, err: %v", id, err)
		writeError(w, "Requirement not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	writeJSON(w, req)
}

// HandleRequirementStatusUpdate updates requirement status.
func HandleRequirementStatusUpdate(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	validStatuses := map[string]bool{
		"draft": true, "reviewing": true, "approved": true,
		"building": true, "testing": true, "deployed": true, "rejected": true,
	}
	if !validStatuses[req.Status] {
		writeError(w, "Invalid status value", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	_, err := db.Pool().Exec(ctx,
		`UPDATE requirements SET status = $1, updated_at = NOW() WHERE id = $2`,
		req.Status, id,
	)
	if err != nil {
		log.Printf("HandleRequirementStatusUpdate: update failed: %v", err)
		writeError(w, "Failed to update status", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{"message": "Status updated"})
}

// HandleRequirementApprove approves a requirement (called by dev-engineer or user).
func HandleRequirementApprove(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var req struct {
		ApprovedBy string `json:"approved_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	result, err := db.Pool().Exec(ctx,
		`UPDATE requirements SET status = 'approved', approved_by = $1,
		 approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
		req.ApprovedBy, id,
	)
	if err != nil {
		log.Printf("HandleRequirementApprove: update failed: %v", err)
		writeError(w, "Failed to approve", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, "Requirement not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	writeJSON(w, map[string]string{"message": "Requirement approved"})
}

// HandleGeneratePRD generates a PRD document from a prompt via LLM.
func HandleGeneratePRD(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title    string `json:"title"`
		Prompt   string `json:"prompt"`
		UserID   string `json:"user_id"`
		LLMModel string `json:"llm_model"`
		APIKey   string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	// Create requirement record first
	ctx := context.Background()
	var reqID string
	err := db.Pool().QueryRow(ctx,
		`INSERT INTO requirements (title, status, created_by, prd_content)
		 VALUES ($1, 'draft', $2, '')
		 RETURNING id`,
		req.Title, req.UserID,
	).Scan(&reqID)
	if err != nil {
		log.Printf("HandleGeneratePRD: insert failed: %v", err)
		writeError(w, "Failed to create requirement", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	// Generate PRD via LLM chat
	prdContent, err := generatePRDWithLLM(req.Prompt, req.LLMModel, req.APIKey)
	if err != nil {
		log.Printf("HandleGeneratePRD: LLM call failed: %v", err)
		writeError(w, "Failed to generate PRD: "+err.Error(), "LLM_ERROR", http.StatusInternalServerError)
		return
	}

	// Save PRD content
	_, err = db.Pool().Exec(ctx,
		`UPDATE requirements SET prd_content = $1, updated_at = NOW() WHERE id = $2`,
		prdContent, reqID,
	)
	if err != nil {
		log.Printf("HandleGeneratePRD: update prd failed: %v", err)
	}

	writeJSON(w, map[string]interface{}{
		"requirement_id": reqID,
		"prd_content":   prdContent,
		"message":       "PRD generated successfully",
	})
}

// generatePRDWithLLM calls the LLM to generate a PRD document.
func generatePRDWithLLM(prompt, model, apiKey string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("API key is required")
	}
	if model == "" {
		model = "MiniMax-M2.7"
	}

	systemPrompt := `你是一个资深产品经理。请根据用户的需求描述，生成一份完整的产品需求文档（PRD）。

文档要求：
# 产品名称
[自动生成]

## 1. 产品概述
- 产品背景
- 产品目标
- 目标用户

## 2. 功能需求
### 2.1 核心功能
[详细描述]
### 2.2 次要功能
[详细描述]

## 3. 非功能需求
- 性能要求
- 安全要求
- 兼容性要求

## 4. 验收标准
[可测试的验收条件]

## 5. 优先级和里程碑
[优先级: P0/P1/P2]

请用 Markdown 格式输出。`

	body, _ := json.Marshal(map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": prompt},
		},
	})

	httpReq, _ := http.NewRequest("POST", "https://api.minimax.chat/v1/text/chatcompletion_pro",
		bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode failed: %v", err)
	}

	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid choice format")
	}

	msg, ok := choice["messages"].([]interface{})
	if !ok || len(msg) == 0 {
		return "", fmt.Errorf("no messages in choice")
	}

	msg0, ok := msg[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid message format")
	}

	content, ok := msg0["text"].(string)
	if !ok {
		return "", fmt.Errorf("no text in message")
	}

	return content, nil
}

const reviewSystemPrompt = `你是一个资深架构师和代码评审专家。请对以下 PRD 文档进行评审。

评审标准：
1. 完整性：PRD 是否包含产品概述、功能需求、非功能需求、验收标准、优先级
2. 清晰度：需求描述是否清晰、无歧义
3. 可测试性：验收标准是否可验证
4. 合理性：优先级划分是否合理
5. 风险点：是否存在潜在技术风险或 scope creep

输出格式（严格按此格式）：

## ✅ 优点
[列出 2-4 个亮点]

## ⚠️ 风险与问题
[列出 2-4 个风险点，每条说明问题和建议]

## 💡 建议
[列出 2-3 条改进建议]

## 📊 评审结论
- 整体评分：优秀/良好/一般/较差
- 是否可以进入开发阶段：是/否，原因是...

请用中文输出。`

// HandleRequirementReview triggers PRD review by LLM.
func HandleRequirementReview(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	ctx := context.Background()

	// Fetch requirement
	var prdContent, title string
	err := db.Pool().QueryRow(ctx,
		`SELECT COALESCE(prd_content,''), title FROM requirements WHERE id = $1`, id,
	).Scan(&prdContent, &title)
	if err != nil {
		writeError(w, "Requirement not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	if prdContent == "" {
		writeError(w, "PRD content is empty, generate PRD first", "NO_PRD", http.StatusBadRequest)
		return
	}

	// Get API key from request body FIRST, before any DB updates
	var req struct {
		APIKey   string `json:"api_key"`
		LLMModel string `json:"llm_model"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.APIKey == "" {
		writeError(w, "API key is required for review", "AUTH_ERROR", http.StatusUnauthorized)
		return
	}
	if req.LLMModel == "" {
		req.LLMModel = "MiniMax-M2.7"
	}

	// Update status to reviewing
	_, err = db.Pool().Exec(ctx,
		`UPDATE requirements SET review_status = 'in_progress', updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		log.Printf("HandleRequirementReview: status update failed: %v", err)
	}

	// Call LLM for review
	reviewResult, err := reviewWithLLM(title, prdContent, req.LLMModel, req.APIKey)
	if err != nil {
		// Update status to failed
		db.Pool().Exec(ctx, `UPDATE requirements SET review_status = 'failed', updated_at = NOW() WHERE id = $1`, id)
		writeError(w, "Review failed: "+err.Error(), "LLM_ERROR", http.StatusInternalServerError)
		return
	}

	// Save review result
	_, err = db.Pool().Exec(ctx,
		`UPDATE requirements SET review_status = 'completed', review_content = $1,
		 updated_at = NOW() WHERE id = $2`,
		reviewResult, id)
	if err != nil {
		log.Printf("HandleRequirementReview: save failed: %v", err)
	}

	writeJSON(w, map[string]interface{}{
		"requirement_id":  id,
		"review_status":  "completed",
		"review_content": reviewResult,
		"message":        "Review completed",
	})
}

// reviewWithLLM calls the LLM to review PRD content.
func reviewWithLLM(title, prdContent, model, apiKey string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": reviewSystemPrompt},
			{"role": "user", "content": fmt.Sprintf("产品名称：%s\n\nPRD 内容：\n%s", title, prdContent)},
		},
	})

	httpReq, _ := http.NewRequest("POST", "https://api.minimax.chat/v1/text/chatcompletion_pro",
		bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode failed: %v", err)
	}

	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid choice format")
	}

	msg, ok := choice["messages"].([]interface{})
	if !ok || len(msg) == 0 {
		return "", fmt.Errorf("no messages in choice")
	}

	msg0, ok := msg[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid message format")
	}

	content, ok := msg0["text"].(string)
	if !ok {
		return "", fmt.Errorf("no text in message")
	}

	return content, nil
}

