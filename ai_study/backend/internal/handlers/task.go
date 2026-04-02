// Task board API handlers
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/models"
	"github.com/devpilot/backend/internal/websocket"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// HubRef is a reference to the WebSocket hub, set during server initialization.
var HubRef *websocket.Hub

// TaskClaimRequest represents the request body for claiming a task.
type TaskClaimRequest struct {
	AgentID        string `json:"agent_id"`
	ExpectedVersion int    `json:"expected_version"`
}

// HandleTasksGet handles GET /api/tasks
// Returns all tasks with optional filtering by state, type, priority, assignee.
func HandleTasksGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := context.Background()

	// Build query with optional filters
	query := `
		SELECT id, title, type,
		       COALESCE(agent_type, ''),
		       COALESCE(priority, ''),
		       COALESCE(state, ''),
		       COALESCE(assignee, ''),
		       created_at, updated_at,
		       COALESCE(estimated_duration, 0),
		       COALESCE(actual_duration, 0),
		       COALESCE(retry_count, 0),
		       COALESCE(version, 1)
		FROM tasks
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	// Filter by state
	if state := r.URL.Query().Get("state"); state != "" {
		query += fmt.Sprintf(" AND state = $%d", argIdx)
		args = append(args, state)
		argIdx++
	}

	// Filter by type
	if taskType := r.URL.Query().Get("type"); taskType != "" {
		query += fmt.Sprintf(" AND type = $%d", argIdx)
		args = append(args, taskType)
		argIdx++
	}

	// Filter by priority
	if priority := r.URL.Query().Get("priority"); priority != "" {
		query += fmt.Sprintf(" AND priority = $%d", argIdx)
		args = append(args, priority)
		argIdx++
	}

	// Filter by assignee
	if assignee := r.URL.Query().Get("assignee"); assignee != "" {
		query += fmt.Sprintf(" AND assignee = $%d", argIdx)
		args = append(args, assignee)
		argIdx++
	}

	query += " ORDER BY created_at DESC"

	rows, err := db.Pool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("HandleTasksGet: query failed: %v", err)
		writeError(w, "Database query failed", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tasks := []models.Task{}
	for rows.Next() {
		var t models.Task
		err := rows.Scan(
			&t.ID, &t.Title, &t.Type, &t.AgentType, &t.Priority, &t.State, &t.Assignee,
			&t.CreatedAt, &t.UpdatedAt, &t.EstimatedDuration, &t.ActualDuration,
			&t.RetryCount, &t.Version,
		)
		if err != nil {
			log.Printf("HandleTasksGet: scan failed: %v", err)
			continue
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tasks": tasks,
		"total": len(tasks),
	})
}

// HandleTaskGet handles GET /api/tasks/:id
// Returns a single task with associated documents and rollback logs.
func HandleTaskGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	ctx := context.Background()

	// Query task
	var t models.Task
	err := db.Pool().QueryRow(ctx,
		`SELECT id, title, COALESCE(type,''), COALESCE(agent_type,''), COALESCE(priority,''), state, COALESCE(assignee,''),
		        created_at, updated_at, COALESCE(estimated_duration,0), COALESCE(actual_duration,0),
		        COALESCE(retry_count,0), version
		 FROM tasks WHERE id = $1`, taskID,
	).Scan(
		&t.ID, &t.Title, &t.Type, &t.AgentType, &t.Priority, &t.State, &t.Assignee,
		&t.CreatedAt, &t.UpdatedAt, &t.EstimatedDuration, &t.ActualDuration,
		&t.RetryCount, &t.Version,
	)
	if err != nil {
		log.Printf("HandleTaskGet: task not found: %s, err: %v", taskID, err)
		writeError(w, "Task not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	// Query associated documents
	docRows, err := db.Pool().Query(ctx,
		`SELECT id, task_id, filename, file_type, file_size, summary, created_at
		 FROM documents WHERE task_id = $1`, taskID,
	)
	documents := []models.Document{}
	if err == nil {
		defer docRows.Close()
		for docRows.Next() {
			var d models.Document
			if err := docRows.Scan(&d.ID, &d.TaskID, &d.Filename, &d.FileType, &d.FileSize, &d.Summary, &d.CreatedAt); err == nil {
				documents = append(documents, d)
			}
		}
	}

	// Query rollback logs
	rbRows, err := db.Pool().Query(ctx,
		`SELECT id, task_id, target_version, step, step_name, status, error_message,
		        created_at, updated_at, completed_at, retry_count, github_revert_sha,
		        deployment_id, last_rollback_at
		 FROM rollback_logs WHERE task_id = $1`, taskID,
	)
	rollbackLogs := []models.TaskRollbackLog{}
	if err == nil {
		defer rbRows.Close()
		for rbRows.Next() {
			var rl models.TaskRollbackLog
			if err := rbRows.Scan(
				&rl.ID, &rl.TaskID, &rl.TargetVersion, &rl.Step, &rl.StepName, &rl.Status, &rl.ErrorMessage,
				&rl.CreatedAt, &rl.UpdatedAt, &rl.CompletedAt, &rl.RetryCount, &rl.GitRevertSHA,
				&rl.DeploymentID, &rl.LastRollbackAt,
			); err == nil {
				rollbackLogs = append(rollbackLogs, rl)
			}
		}
	}

	detail := models.TaskDetail{
		Task:         t,
		Documents:    documents,
		RollbackLogs: rollbackLogs,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

// HandleTaskClaim handles POST /api/tasks/:id/claim
// Claims a pending task (pending -> running) with optimistic locking.
func HandleTaskClaim(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	var req TaskClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.AgentID == "" {
		writeError(w, "agent_id is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Optimistic lock UPDATE: only succeeds if state=pending AND version matches
	var fromState string
	err := db.Pool().QueryRow(ctx,
		`UPDATE tasks
		 SET state = 'running', assignee = $1, version = version + 1, updated_at = NOW()
		 WHERE id = $2 AND state = 'pending' AND version = $3
		 RETURNING state`,
		req.AgentID, taskID, req.ExpectedVersion,
	).Scan(&fromState)

	if err != nil {
		log.Printf("HandleTaskClaim: claim failed for task %s: %v", taskID, err)
		writeError(w, "Claim failed: task may already be claimed or does not exist", "CONFLICT", http.StatusConflict)
		return
	}

	// Broadcast task:state_changed WebSocket event
	broadcastTaskStateChanged(taskID, fromState, "running")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Task claimed successfully",
		"task_id": taskID,
		"state":   "running",
	})
}

// HandleTaskCancel handles POST /api/tasks/:id/cancel
// Cancels a task (pending/running/testing -> cancelled).
func HandleTaskCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	ctx := context.Background()

	// Get current state first
	var fromState string
	err := db.Pool().QueryRow(ctx,
		`SELECT state FROM tasks WHERE id = $1`, taskID,
	).Scan(&fromState)
	if err != nil {
		log.Printf("HandleTaskCancel: task not found: %s", taskID)
		writeError(w, "Task not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	// Only allow cancelling from pending/running/testing
	allowedStates := map[string]bool{"pending": true, "running": true, "testing": true}
	if !allowedStates[fromState] {
		writeError(w, fmt.Sprintf("Cannot cancel task in state: %s", fromState), "INVALID_STATE", http.StatusBadRequest)
		return
	}

	// Update state to cancelled
	_, err = db.Pool().Exec(ctx,
		`UPDATE tasks SET state = 'cancelled', updated_at = NOW() WHERE id = $1`, taskID,
	)
	if err != nil {
		log.Printf("HandleTaskCancel: update failed: %v", err)
		writeError(w, "Failed to cancel task", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	// Broadcast task:state_changed WebSocket event
	broadcastTaskStateChanged(taskID, fromState, "cancelled")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Task cancelled successfully",
		"task_id": taskID,
		"state":   "cancelled",
	})
}

// HandleTaskRetry handles POST /api/tasks/:id/retry
// Retries a failed task (failed -> running), incrementing retryCount.
func HandleTaskRetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	ctx := context.Background()

	// Get current state and retry count
	var fromState string
	var retryCount int
	err := db.Pool().QueryRow(ctx,
		`SELECT state, retry_count FROM tasks WHERE id = $1`, taskID,
	).Scan(&fromState, &retryCount)
	if err != nil {
		log.Printf("HandleTaskRetry: task not found: %s", taskID)
		writeError(w, "Task not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	// Only allow retry from failed state
	if fromState != "failed" {
		writeError(w, fmt.Sprintf("Cannot retry task in state: %s (only 'failed' allowed)", fromState), "INVALID_STATE", http.StatusBadRequest)
		return
	}

	// Check retry limit
	if retryCount >= 3 {
		writeError(w, "Retry limit exceeded (max 3 retries)", "RETRY_LIMIT_EXCEEDED", http.StatusBadRequest)
		return
	}

	// Update state to running and increment retry count
	_, err = db.Pool().Exec(ctx,
		`UPDATE tasks
		 SET state = 'running', retry_count = retry_count + 1, updated_at = NOW()
		 WHERE id = $1`, taskID,
	)
	if err != nil {
		log.Printf("HandleTaskRetry: update failed: %v", err)
		writeError(w, "Failed to retry task", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	// Broadcast task:state_changed WebSocket event
	broadcastTaskStateChanged(taskID, fromState, "running")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":     "Task retry initiated",
		"task_id":     taskID,
		"state":       "running",
		"retry_count": retryCount + 1,
	})
}

// HandleTaskTransition handles POST /api/tasks/:id/transition
// Internal API called by Temporal to transition task state.
// Receives {from_state, to_state, logs?} and updates tasks table.
func HandleTaskTransition(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	var req models.TaskStateTransitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.FromState == "" || req.ToState == "" {
		writeError(w, "from_state and to_state are required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Update task state
	var updatedState string
	err := db.Pool().QueryRow(ctx,
		`UPDATE tasks
		 SET state = $1, updated_at = NOW()
		 WHERE id = $2 AND state = $3
		 RETURNING state`,
		req.ToState, taskID, req.FromState,
	).Scan(&updatedState)

	if err != nil {
		log.Printf("HandleTaskTransition: transition failed for task %s: %v", taskID, err)
		writeError(w, "Transition failed: task may not exist or state mismatch", "TRANSITION_FAILED", http.StatusConflict)
		return
	}

	// Insert logs if provided (task_logs table)
	if len(req.Logs) > 0 {
		for _, logEntry := range req.Logs {
			logID := uuid.New().String()
			_, err := db.Pool().Exec(ctx,
				`INSERT INTO task_logs (id, task_id, timestamp, level, agent, message)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				logID, taskID, logEntry.Timestamp, logEntry.Level, logEntry.Agent, logEntry.Message,
			)
			if err != nil {
				log.Printf("HandleTaskTransition: failed to insert log: %v", err)
			}
		}
	}

	// Broadcast task:state_changed WebSocket event
	broadcastTaskStateChanged(taskID, req.FromState, req.ToState)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":   "Transition successful",
		"task_id":   taskID,
		"from_state": req.FromState,
		"to_state":  req.ToState,
	})
}

// broadcastTaskStateChanged sends a task:state_changed WebSocket event to all connected clients.
func broadcastTaskStateChanged(taskID, fromState, toState string) {
	if HubRef == nil {
		log.Printf("broadcastTaskStateChanged: HubRef is nil, skipping broadcast")
		return
	}

	msg := websocket.Message{
		Type:       websocket.TaskStateChange,
		TaskID:     taskID,
		Timestamp:  time.Now(),
		ServerTime: time.Now().UnixMilli(),
		State:      websocket.TaskState(toState),
		Payload: map[string]string{
			"from_state": fromState,
			"to_state":   toState,
		},
	}
	HubRef.Broadcast(msg)
	log.Printf("Broadcasted task:state_changed: task=%s, %s -> %s", taskID, fromState, toState)
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, message, code string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}
