// Task board API handlers
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"bytes"
	"net/http"
	"os"
	"os/exec"
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

// HandleTasksCreate handles POST /api/tasks
func HandleTasksCreate(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	var req struct {
		Title    string `json:"title"`
		Type     string `json:"type"`
		Priority string `json:"priority"`
		Assignee string `json:"assignee"`
		UserID   string `json:"user_id"`
		ReqID    string `json:"requirement_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		writeError(w, "Title is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	taskType := req.Type
	if taskType == "" {
		taskType = "code"
	}
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	id := uuid.New().String()
	assignee := req.Assignee
	if assignee == "" {
		assignee = "unassigned"
	}

	var createdAt time.Time
	err := db.Pool().QueryRow(ctx,
		`INSERT INTO tasks (id, title, type, priority, state, assignee, user_id, created_at, updated_at, estimated_duration, retry_count, version)
		 VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW(), NOW(), 3600, 0, 1)
		 RETURNING created_at`,
		id, req.Title, taskType, priority, assignee, req.UserID,
	).Scan(&createdAt)
	if err != nil {
		log.Printf("HandleTasksCreate: insert failed: %v", err)
		writeError(w, "Failed to create task", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	// If requirement_id provided, mark it as approved
	if req.ReqID != "" {
		db.Pool().Exec(ctx,
			`UPDATE requirements SET status='approved', updated_at=NOW()
			 WHERE id=$1`,
			req.ReqID)
	}

	// Broadcast task created
	broadcastTaskStateChanged(id, "", "pending")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         id,
		"title":      req.Title,
		"type":       taskType,
		"priority":   priority,
		"state":      "pending",
		"assignee":   assignee,
		"user_id":    req.UserID,
		"created_at": createdAt,
	})
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

	// If transitioning from testing -> running, re-spawn coder agent
	if req.FromState == "testing" && req.ToState == "running" {
		scriptPath := "/Users/tianwei/.openclaw/workspace/ai_study/backend/scripts/run_coder.py"
		cmd := exec.Command("python3", scriptPath, taskID, "http://localhost:8080")
		cmd.Dir = "/Users/tianwei/.openclaw/workspace/ai_study/backend"
		cmd.Stdin = nil
		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &out
		go func() {
			err := cmd.Run()
			if err != nil {
				log.Printf("HandleTaskTransition: coder script failed for task %s: %v, stdout: %s", taskID, err, out.String())
				db.Pool().Exec(context.Background(),
					`UPDATE tasks SET state='failed', updated_at=NOW() WHERE id=$1`, taskID)
				broadcastTaskStateChanged(taskID, "running", "failed")
				return
			}
			log.Printf("HandleTaskTransition: coder completed for task %s", taskID)
			db.Pool().Exec(context.Background(),
				`UPDATE tasks SET state='testing', updated_at=NOW() WHERE id=$1 AND state='running'`, taskID)
			broadcastTaskStateChanged(taskID, "running", "testing")
		}()
	}

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

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}


// HandleTaskTest runs the tester agent for a task in testing state.
func HandleTaskTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, map[string]string{"error": "Method not allowed"})
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	var state string
	err := db.Pool().QueryRow(db.Ctx(),
		"SELECT state FROM tasks WHERE id = $1", taskID).Scan(&state)
	if err != nil {
		writeJSON(w, map[string]string{"error": "Task not found"})
		return
	}
	if state != "testing" {
		writeJSON(w, map[string]string{"error": fmt.Sprintf("Task is in state %s, not testing", state)})
		return
	}

	log.Printf("HandleTaskTest: running tester for task %s", taskID)

	scriptPath := "/Users/tianwei/.openclaw/workspace/ai_study/backend/scripts/run_tester.py"
	cmd := exec.Command("python3", scriptPath, taskID, "http://localhost:8080")
	cmd.Dir = "/Users/tianwei/.openclaw/workspace/ai_study/backend"
	cmd.Stdin = nil
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err = cmd.Run()
	output := out.String()

	if err != nil {
		log.Printf("HandleTaskTest: tester FAILED for task %s: %v\nOutput: %s", taskID, err, output)
		db.Pool().Exec(db.Ctx(),
			"UPDATE tasks SET state='running', updated_at=NOW() WHERE id=$1 AND state='testing'", taskID)
		broadcastTaskStateChanged(taskID, "testing", "running")
		writeJSON(w, map[string]interface{}{
			"id": taskID, "state": "running", "test_result": "failed",
			"output": output, "message": "测试未通过，任务已退回 running",
		})
		return
	}

	log.Printf("HandleTaskTest: tester PASSED for task %s", taskID)
	db.Pool().Exec(db.Ctx(),
		"UPDATE tasks SET state='completed', updated_at=NOW() WHERE id=$1 AND state='testing'", taskID)
	broadcastTaskStateChanged(taskID, "testing", "completed")
	writeJSON(w, map[string]interface{}{
		"id": taskID, "state": "completed", "test_result": "passed",
		"output": output, "message": "测试通过！",
	})
}

// HandleTasksExecute claims a task and spawns a coder agent to work on it.
func HandleTasksExecute(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	vars := mux.Vars(r)
	taskID := vars["id"]

	// Verify task exists and is pending/running
	var currentState string
	err := db.Pool().QueryRow(ctx,
		`SELECT COALESCE(state,'') FROM tasks WHERE id = $1`, taskID,
	).Scan(&currentState)
	if err != nil {
		writeError(w, "Task not found", "NOT_FOUND", http.StatusNotFound)
		return
	}
	if currentState != "pending" && currentState != "running" {
		writeError(w, "Task is not in pending/running state", "INVALID_STATE", http.StatusBadRequest)
		return
	}

	// Update task to running
	db.Pool().Exec(ctx,
		`UPDATE tasks SET state='running', updated_at=NOW(), version=version+1 WHERE id=$1`,
		taskID)

	// Broadcast running state
	broadcastTaskStateChanged(taskID, currentState, "running")

	// Spawn coder script in background
	scriptPath := "/Users/tianwei/.openclaw/workspace/ai_study/backend/scripts/run_coder.py"
	cmd := exec.Command("python3", scriptPath, taskID, "http://localhost:8080")
	cmd.Dir = "/Users/tianwei/.openclaw/workspace/ai_study/backend"
	cmd.Stdin = nil
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	go func() {
		err := cmd.Run()
		if err != nil {
			log.Printf("HandleTasksExecute: coder script failed: %v, stdout: %s", err, out.String())
			db.Pool().Exec(context.Background(),
				`UPDATE tasks SET state='failed', updated_at=NOW() WHERE id=$1`,
				taskID)
			broadcastTaskStateChanged(taskID, "running", "failed")
			return
		}
		log.Printf("HandleTasksExecute: coder script succeeded, output: %s", out.String())

		// Transition task to completed in Go
		var updatedState string
		err = db.Pool().QueryRow(context.Background(),
			`UPDATE tasks SET state='testing', updated_at=NOW()
			 WHERE id=$1 AND state='running'
			 RETURNING state`,
			taskID).Scan(&updatedState)
		if err != nil {
			log.Printf("HandleTasksExecute: transition to testing failed: %v", err)
			return
		}
		log.Printf("HandleTasksExecute: task %s transitioned to testing", taskID)
		broadcastTaskStateChanged(taskID, "running", "testing")
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      taskID,
		"state":   "running",
		"message": "Coding agent started",
	})
}

// HandleTaskOutput returns the generated code output for a task.
func HandleTaskOutput(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	taskID := vars["id"]

	outputFile := fmt.Sprintf("/Users/tianwei/.openclaw/workspace/ai_study/backend/generated/%s/output.md", taskID)
	data, err := os.ReadFile(outputFile)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, "Output not ready yet", "NOT_FOUND", http.StatusNotFound)
			return
		}
		writeError(w, "Failed to read output: "+err.Error(), "IO_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write(data)
}

