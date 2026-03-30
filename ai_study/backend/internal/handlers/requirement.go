package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/temporal"
	"github.com/google/uuid"
)

// RequirementSubmitRequest represents the request body for requirement submission.
type RequirementSubmitRequest struct {
	RequirementID string `json:"requirement_id,omitempty"` // optional, auto-generated if empty
	Prompt        string `json:"prompt"`
	UserID        string `json:"user_id,omitempty"`         // optional, defaults to "anonymous"
}

// RequirementSubmitResponse represents the response for requirement submission.
type RequirementSubmitResponse struct {
	RequirementID string `json:"requirement_id"`
	TaskID        string `json:"task_id,omitempty"`
	Message       string `json:"message"`
}

// HandleRequirementSubmit handles POST /api/requirements/submit
// Validates prompt, writes to tasks table, triggers Temporal workflow, returns requirementId.
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

	// Trigger Temporal TaskCreationWorkflow (synchronous for now, can be async)
	err = temporal.StartRequirementWorkflow(ctx, requirementID, prompt, userID)
	if err != nil {
		log.Printf("Failed to start Temporal workflow: %v", err)
		// Still return success - requirement is saved, workflow can be retried
		resp := RequirementSubmitResponse{
			RequirementID: requirementID,
			TaskID:        taskID,
			Message:       "Requirement saved, workflow start failed (can retry)",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Return success response
	resp := RequirementSubmitResponse{
		RequirementID: requirementID,
		TaskID:        taskID,
		Message:       "Requirement submitted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// inferTaskType attempts to infer the task type from prompt keywords.
func inferTaskType(prompt string) string {
	lower := strings.ToLower(prompt)

	// Simple keyword-based inference
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
