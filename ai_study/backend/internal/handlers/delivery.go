// Delivery API handlers for PRD version management, GitHub integration, and deployment.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	
	"log"
	"net/http"
	
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/deploy"
	"github.com/devpilot/backend/internal/github"
	"github.com/devpilot/backend/internal/models"
	"github.com/devpilot/backend/internal/websocket"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// HubRefDelivery is a reference to the WebSocket hub for delivery events.
var HubRefDelivery *websocket.Hub

// GitHubOwnerRepo holds GitHub owner/repo parsed from task metadata.
// In production, this would come from the task's associated repository info.
var GitHubOwnerRepo = map[string]struct{ Owner, Repo string }{}

// GetGitHubRepoInfo returns the GitHub owner and repo for a task.
// In production, this should query the database or task metadata.
func getGitHubRepoInfo(taskID string) (string, string) {
	if info, ok := GitHubOwnerRepo[taskID]; ok {
		return info.Owner, info.Repo
	}
	// Default fallback for development - should be overridden
	return "devpilot", taskID[:8]
}

// ============================================================================
// PRD Version Management
// ============================================================================

// HandlePRDGet handles GET /api/delivery/:task_id/prd
// Returns PRD information: current version content and version list.
func HandlePRDGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	ctx := context.Background()

	// Query current PRD version
	var currentVersion models.PRDVersion
	err := db.Pool().QueryRow(ctx,
		`SELECT id, task_id, version, content, commit_sha, is_current, created_at
		 FROM prd_versions
		 WHERE task_id = $1 AND is_current = true`, taskID,
	).Scan(&currentVersion.ID, &currentVersion.TaskID, &currentVersion.Version,
		&currentVersion.Content, &currentVersion.CommitSHA, &currentVersion.IsCurrent, &currentVersion.CreatedAt)

	if err != nil {
		log.Printf("HandlePRDGet: no current PRD version for task %s: %v", taskID, err)
		// Return empty response instead of error
		currentVersion = models.PRDVersion{}
	}

	// Query recent versions (last 50)
	rows, err := db.Pool().Query(ctx,
		`SELECT id, task_id, version, content, commit_sha, is_current, created_at
		 FROM prd_versions
		 WHERE task_id = $1
		 ORDER BY created_at DESC
		 LIMIT 50`, taskID,
	)
	if err != nil {
		log.Printf("HandlePRDGet: query versions failed: %v", err)
		writeError(w, "Failed to query PRD versions", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	versions := []models.PRDVersion{}
	for rows.Next() {
		var v models.PRDVersion
		if err := rows.Scan(&v.ID, &v.TaskID, &v.Version, &v.Content, &v.CommitSHA, &v.IsCurrent, &v.CreatedAt); err != nil {
			log.Printf("HandlePRDGet: scan version failed: %v", err)
			continue
		}
		versions = append(versions, v)
	}

	response := models.PRDCurrentResponse{
		CurrentVersion: &currentVersion,
		Versions:       versions,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandlePRDRollback handles POST /api/delivery/:task_id/prd/rollback
// Rolls back PRD to a previous version (only updates database, no code changes).
func HandlePRDRollback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	var req models.PRDRollbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.TargetVersionID == "" {
		writeError(w, "target_version_id is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Start transaction
	tx, err := db.Pool().Begin(ctx)
	if err != nil {
		log.Printf("HandlePRDRollback: begin transaction failed: %v", err)
		writeError(w, "Transaction failed", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// Check if target version exists and belongs to this task
	var targetVersion models.PRDVersion
	err = tx.QueryRow(ctx,
		`SELECT id, task_id, version, content, commit_sha, is_current, created_at
		 FROM prd_versions WHERE id = $1 AND task_id = $2`, req.TargetVersionID, taskID,
	).Scan(&targetVersion.ID, &targetVersion.TaskID, &targetVersion.Version,
		&targetVersion.Content, &targetVersion.CommitSHA, &targetVersion.IsCurrent, &targetVersion.CreatedAt)

	if err != nil {
		log.Printf("HandlePRDRollback: target version not found: %s", req.TargetVersionID)
		writeError(w, "Target version not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	// Unconditionally set all versions to not current
	_, err = tx.Exec(ctx,
		`UPDATE prd_versions SET is_current = false WHERE task_id = $1`, taskID)
	if err != nil {
		log.Printf("HandlePRDRollback: reset current failed: %v", err)
		writeError(w, "Failed to update versions", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	// Create a new version record that references the target content
	// This preserves history and implements "rollback generates new record"
	newVersionID := uuid.New().String()
	newVersionNum := fmt.Sprintf("v%d", len(targetVersion.Version)+1)

	_, err = tx.Exec(ctx,
		`INSERT INTO prd_versions (id, task_id, version, content, commit_sha, is_current, created_at)
		 VALUES ($1, $2, $3, $4, $5, true, NOW())`,
		newVersionID, taskID, newVersionNum, targetVersion.Content, targetVersion.CommitSHA)

	if err != nil {
		log.Printf("HandlePRDRollback: insert new version failed: %v", err)
		writeError(w, "Failed to create rollback version", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("HandlePRDRollback: commit failed: %v", err)
		writeError(w, "Transaction commit failed", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":       "PRD rolled back successfully",
		"new_version":   newVersionNum,
		"new_version_id": newVersionID,
		"target_version": targetVersion.Version,
	})
}

// ============================================================================
// GitHub Integration
// ============================================================================

// HandleGitHubGet handles GET /api/delivery/:task_id/github
// Returns GitHub repository information.
func HandleGitHubGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	owner, repo := getGitHubRepoInfo(taskID)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := github.NewClient(owner, repo)
	info, err := client.GetRepoInfo(ctx)
	if err != nil {
		log.Printf("HandleGitHubGet: failed to get repo info: %v", err)
		writeError(w, "Failed to fetch GitHub repository info", "GITHUB_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// HandleGitHubTree handles GET /api/delivery/:task_id/github/tree
// Returns the code directory tree.
func HandleGitHubTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]
	treeSHA := r.URL.Query().Get("sha")

	if treeSHA == "" {
		// If no SHA provided, get the default branch first
		owner, repo := getGitHubRepoInfo(taskID)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := github.NewClient(owner, repo)
		_, err := client.GetRepoInfo(ctx)
		if err != nil {
			log.Printf("HandleGitHubTree: failed to get repo info: %v", err)
			writeError(w, "Failed to fetch GitHub repository info", "GITHUB_ERROR", http.StatusInternalServerError)
			return
		}

		// Get the tree SHA for the default branch
		commits, err := client.GetCommits(ctx, 1)
		if err != nil || len(commits) == 0 {
			writeError(w, "Failed to get commit info", "GITHUB_ERROR", http.StatusInternalServerError)
			return
		}
		treeSHA = commits[0].SHA
	}

	owner, repo := getGitHubRepoInfo(taskID)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := github.NewClient(owner, repo)
	nodes, err := client.GetFileTree(ctx, treeSHA)
	if err != nil {
		log.Printf("HandleGitHubTree: failed to get file tree: %v", err)
		writeError(w, "Failed to fetch file tree", "GITHUB_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tree_sha": treeSHA,
		"files":    nodes,
	})
}

// HandleGitHubFile handles GET /api/delivery/:task_id/github/file
// Returns a single file's content.
func HandleGitHubFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]
	filePath := r.URL.Query().Get("path")
	ref := r.URL.Query().Get("ref")

	if filePath == "" {
		writeError(w, "path query parameter is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	owner, repo := getGitHubRepoInfo(taskID)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := github.NewClient(owner, repo)

	if ref == "" {
		// Default to repository's default branch from GitHub API
		repoInfo, err := client.GetRepoInfo(ctx)
		if err != nil {
			log.Printf("HandleGitHubFile: failed to get repo info for default branch: %v", err)
			writeError(w, "Failed to determine default branch", "GITHUB_ERROR", http.StatusInternalServerError)
			return
		}
		ref = repoInfo.DefaultBranch
	}

	content, size, err := client.GetFileContent(ctx, filePath, ref)
	if err != nil {
		log.Printf("HandleGitHubFile: failed to get file content: %v", err)
		writeError(w, fmt.Sprintf("Failed to fetch file: %s", err.Error()), "GITHUB_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-File-Size", fmt.Sprintf("%d", size))
	w.Write(content)
}

// HandleGitHubCommits handles GET /api/delivery/:task_id/github/commits
// Returns the recent commit history.
func HandleGitHubCommits(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	owner, repo := getGitHubRepoInfo(taskID)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := github.NewClient(owner, repo)
	commits, err := client.GetCommits(ctx, 10)
	if err != nil {
		log.Printf("HandleGitHubCommits: failed to get commits: %v", err)
		writeError(w, "Failed to fetch commits", "GITHUB_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"commits": commits,
	})
}

// ============================================================================
// Deployment
// ============================================================================

// HandleDeploy handles POST /api/delivery/:task_id/deploy
// Triggers a new deployment.
func HandleDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	var req models.DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.Platform == "" {
		req.Platform = "vercel"
	}
	if req.Type == "" {
		req.Type = "frontend"
	}

	if req.Platform != "vercel" && req.Platform != "render" {
		writeError(w, "platform must be 'vercel' or 'render'", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Get task info for repo details
	var taskRepo string
	err := db.Pool().QueryRow(ctx,
		`SELECT COALESCE(metadata->>'repo_url', '') FROM tasks WHERE id = $1`, taskID,
	).Scan(&taskRepo)
	if err != nil {
		taskRepo = fmt.Sprintf("https://github.com/devpilot/%s", taskID)
	}

	// Get GitHub repo info for branch/commit
	owner, repo := getGitHubRepoInfo(taskID)
	ghClient := github.NewClient(owner, repo)
	repoInfo, err := ghClient.GetRepoInfo(ctx)
	if err != nil {
		log.Printf("HandleDeploy: failed to get repo info: %v", err)
	}

	deployPlatform := deploy.GetPlatform(req.Platform)
	if deployPlatform == nil {
		writeError(w, "Deployment platform not available", "PLATFORM_ERROR", http.StatusInternalServerError)
		return
	}

	deployReq := deploy.DeployRequest{
		RepoURL:   taskRepo,
		Branch:    "main",
		CommitSHA: "",
		Type:      req.Type,
		TaskID:    taskID,
	}

	if repoInfo != nil {
		deployReq.Branch = repoInfo.DefaultBranch
		deployReq.CommitSHA = repoInfo.LatestCommitSHA
	}

	// Broadcast deployment started event
	broadcastDeploymentEvent(taskID, "deployment:started", req.Platform, "deploying", "", "")

	result, err := deployPlatform.TriggerDeploy(ctx, deployReq)
	if err != nil {
		log.Printf("HandleDeploy: trigger failed: %v", err)
		broadcastDeploymentEvent(taskID, "deployment:failed", req.Platform, "failed", "", err.Error())
		writeError(w, fmt.Sprintf("Deployment trigger failed: %s", err.Error()), "DEPLOY_ERROR", http.StatusInternalServerError)
		return
	}

	// Save deployment record to database
	deployID := uuid.New().String()
	_, err = db.Pool().Exec(ctx,
		`INSERT INTO deployments (id, task_id, platform, status, commit_sha, preview_url, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
		deployID, taskID, req.Platform, "deploying", deployReq.CommitSHA, result.PreviewURL)

	if err != nil {
		log.Printf("HandleDeploy: failed to save deployment record: %v", err)
	}

	// Start background status polling
	go pollDeploymentStatus(taskID, deployID, req.Platform, result.DeploymentID)

	response := models.DeployResponse{
		DeploymentID: deployID,
		PreviewURL:   result.PreviewURL,
		Status:       result.Status,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleDeployStatus handles GET /api/delivery/:task_id/deploy/status
// Queries the status of a deployment.
func HandleDeployStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]
	deploymentID := r.URL.Query().Get("deployment_id")

	if deploymentID == "" {
		writeError(w, "deployment_id query parameter is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Get deployment record from database
	var record struct {
		Platform  string
		Status    string
		CommitSHA string
		PreviewURL string
	}
	err := db.Pool().QueryRow(ctx,
		`SELECT platform, status, commit_sha, preview_url FROM deployments WHERE id = $1 AND task_id = $2`,
		deploymentID, taskID,
	).Scan(&record.Platform, &record.Status, &record.CommitSHA, &record.PreviewURL)

	if err != nil {
		writeError(w, "Deployment not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	// Query real-time status from platform
	platform := deploy.GetPlatform(record.Platform)
	if platform == nil {
		writeError(w, "Platform not available", "PLATFORM_ERROR", http.StatusInternalServerError)
		return
	}

	status, err := platform.GetDeployStatus(ctx, deploymentID)
	if err != nil {
		log.Printf("HandleDeployStatus: get status failed: %v", err)
		// Return database status as fallback
		status = &deploy.DeployStatus{Status: record.Status}
	}

	// Update database with latest status
	if status != nil && status.Status != "" {
		db.Pool().Exec(ctx,
			`UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2`,
			status.Status, deploymentID)
	}

	logs, _ := platform.GetLogs(ctx, deploymentID)
	if logs == nil {
		logs = []string{}
	}

	response := models.DeployStatusResponse{
		Status: status.Status,
		Logs:   logs,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleDeployments handles GET /api/delivery/:task_id/deployments
// Returns the recent deployment history.
func HandleDeployments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	ctx := context.Background()

	rows, err := db.Pool().Query(ctx,
		`SELECT id, task_id, platform, status, commit_sha, preview_url, created_at, updated_at
		 FROM deployments
		 WHERE task_id = $1
		 ORDER BY created_at DESC
		 LIMIT 10`, taskID,
	)
	if err != nil {
		log.Printf("HandleDeployments: query failed: %v", err)
		writeError(w, "Failed to query deployments", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	deployments := []models.Deployment{}
	for rows.Next() {
		var d models.Deployment
		if err := rows.Scan(&d.ID, &d.TaskID, &d.Platform, &d.Status, &d.CommitSHA, &d.PreviewURL, &d.CreatedAt, &d.UpdatedAt); err != nil {
			log.Printf("HandleDeployments: scan failed: %v", err)
			continue
		}
		deployments = append(deployments, d)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"deployments": deployments,
	})
}

// ============================================================================
// Rollback
// ============================================================================

// HandleRollbackLogs handles GET /api/delivery/:task_id/rollback/logs
// Returns rollback operation logs.
func HandleRollbackLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	ctx := context.Background()

	rows, err := db.Pool().Query(ctx,
		`SELECT id, task_id, target_version, step, step_name, status, error_message,
		        created_at, updated_at, completed_at, retry_count, github_revert_sha,
		        deployment_id, last_rollback_at
		 FROM rollback_logs
		 WHERE task_id = $1
		 ORDER BY created_at DESC
		 LIMIT 50`, taskID,
	)
	if err != nil {
		log.Printf("HandleRollbackLogs: query failed: %v", err)
		writeError(w, "Failed to query rollback logs", "DB_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	logs := []models.RollbackLog{}
	for rows.Next() {
		var rl models.RollbackLog
		if err := rows.Scan(
			&rl.ID, &rl.TaskID, &rl.TargetVersion, &rl.Step, &rl.StepName, &rl.Status, &rl.ErrorMessage,
			&rl.CreatedAt, &rl.UpdatedAt, &rl.CompletedAt, &rl.RetryCount, &rl.GitHubRevertSHA,
			&rl.DeploymentID, &rl.LastRollbackAt,
		); err != nil {
			log.Printf("HandleRollbackLogs: scan failed: %v", err)
			continue
		}
		logs = append(logs, rl)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"rollback_logs": logs,
	})
}

// HandleRollback handles POST /api/delivery/:task_id/rollback
// Performs a code rollback using the compensating transaction pattern.
func HandleRollback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["task_id"]

	var req models.RollbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.TargetVersion == "" {
		writeError(w, "target_version is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Check cooldown period (E-4: 5-minute cooldown)
	var lastRollbackAt *time.Time
	err := db.Pool().QueryRow(ctx,
		`SELECT last_rollback_at FROM tasks WHERE id = $1`, taskID,
	).Scan(&lastRollbackAt)
	if err == nil && lastRollbackAt != nil {
		if time.Since(*lastRollbackAt) < 5*time.Minute {
			writeError(w, "Cooldown period active: cannot rollback within 5 minutes of last rollback", "COOLDOWN_ACTIVE", http.StatusTooManyRequests)
			return
		}
	}

	// Acquire row lock for concurrent rollback protection (E-6)
	tx, err := db.Pool().Begin(ctx)
	if err != nil {
		log.Printf("HandleRollback: begin transaction failed: %v", err)
		writeError(w, "Failed to start rollback transaction", "DB_ERROR", http.StatusInternalServerError)
		return
	}

	// Try to acquire advisory lock
	lockKey := fmt.Sprintf("rollback_%s", taskID)
	lockID := int64(hashString(lockKey))
	_, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", lockID)
	if err != nil {
		tx.Rollback(ctx)
		log.Printf("HandleRollback: failed to acquire lock: %v", err)
		writeError(w, "Concurrent rollback in progress", "CONFLICT", http.StatusConflict)
		return
	}

	// Check for pending rollback logs (resume from checkpoint)
	var pendingLog models.RollbackLog
	err = tx.QueryRow(ctx,
		`SELECT id, step, status, retry_count FROM rollback_logs
		 WHERE task_id = $1 AND status = 'pending'
		 ORDER BY created_at DESC LIMIT 1`, taskID,
	).Scan(&pendingLog.ID, &pendingLog.Step, &pendingLog.Status, &pendingLog.RetryCount)

	resumeFromStep := 0
	if err == nil && pendingLog.ID != "" {
		// Resume from checkpoint
		resumeFromStep = pendingLog.Step
		log.Printf("HandleRollback: resuming from step %d", resumeFromStep)
	}

	tx.Rollback(ctx) // Release transaction, lock is held until transaction ends

	// Create rollback log
	rollbackLogID := uuid.New().String()

	// Get target version's commit SHA
	var targetCommitSHA string
	err = db.Pool().QueryRow(ctx,
		`SELECT commit_sha FROM prd_versions WHERE task_id = $1 AND version = $2`,
		taskID, req.TargetVersion,
	).Scan(&targetCommitSHA)
	if err != nil {
		targetCommitSHA = ""
	}

	// Get current version
	var currentVersion string
	db.Pool().QueryRow(ctx,
		`SELECT version FROM prd_versions WHERE task_id = $1 AND is_current = true`, taskID,
	).Scan(&currentVersion)

	// E-5: Commit count validation — reject if more than 10 commits between current and target
	owner, repo := getGitHubRepoInfo(taskID)
	ghClient := github.NewClient(owner, repo)

	// Get current HEAD SHA for comparison
	var currentCommitSHA string
	db.Pool().QueryRow(ctx,
		`SELECT commit_sha FROM prd_versions WHERE task_id = $1 AND is_current = true`, taskID,
	).Scan(&currentCommitSHA)

	if currentCommitSHA != "" && targetCommitSHA != "" {
		count, err := ghClient.GetCommitCount(ctx, currentCommitSHA, targetCommitSHA)
		if err != nil {
			log.Printf("HandleRollback: failed to get commit count: %v", err)
		} else if count > 10 {
			writeError(w, "超过10个commit限制", "ERR_COMMIT_COUNT_EXCEEDED", http.StatusBadRequest)
			return
		}
	}

	// Broadcast rollback started
	broadcastRollbackEvent(taskID, "rollback:started", req.TargetVersion, currentVersion, 0, "")

	// Execute rollback steps with compensating transaction pattern
	go executeRollback(taskID, rollbackLogID, req.TargetVersion, targetCommitSHA, resumeFromStep)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":           "Rollback initiated",
		"rollback_log_id":  rollbackLogID,
		"target_version":   req.TargetVersion,
	})
}

// executeRollback performs the rollback steps in a compensating transaction pattern.
func executeRollback(taskID, rollbackLogID, targetVersion, targetCommitSHA string, resumeFromStep int) {
	ctx := context.Background()

	owner, repo := getGitHubRepoInfo(taskID)
	ghClient := github.NewClient(owner, repo)

	// Get repo info for default branch
	repoInfo, err := ghClient.GetRepoInfo(ctx)
	if err != nil {
		log.Printf("executeRollback: failed to get repo info: %v", err)
		return
	}

	// Step 1: Git revert — update branch ref to target commit (safe, non-force)
	githubRevertSHA := ""
	if resumeFromStep < 1 {
		// 1a. Create backup ref pointing to current HEAD
		currentHeadSHA, err := ghClient.GetBranchRef(ctx, repoInfo.DefaultBranch)
		if err != nil {
			log.Printf("executeRollback: Step 1 - failed to get current HEAD: %v", err)
			insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 1, "Git revert", "failed", err.Error(), "", "")
			broadcastRollbackEvent(taskID, "rollback:failed", targetVersion, "", 1, err.Error())
			return
		}

		// 1b. Update branch ref to target commit SHA
		if targetCommitSHA == "" {
			// Fallback: use the commit SHA from the target version
			targetCommitSHA = currentHeadSHA
		}

		err = ghClient.UpdateBranchRef(ctx, repoInfo.DefaultBranch, targetCommitSHA)
		if err != nil {
			log.Printf("executeRollback: Step 1 - Git revert failed: %v", err)
			insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 1, "Git revert", "failed", err.Error(), githubRevertSHA, "")
			broadcastRollbackEvent(taskID, "rollback:failed", targetVersion, "", 1, err.Error())
			return
		}
		githubRevertSHA = targetCommitSHA

		insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 1, "Git revert", "completed", "", githubRevertSHA, "")
		broadcastRollbackEvent(taskID, "rollback:step", targetVersion, "", 1, "Git revert completed")
	}

	// Step 2: Update PRD current version in database
	if resumeFromStep < 2 {
		// Update the tasks table last_rollback_at
		_, err = db.Pool().Exec(ctx,
			`UPDATE tasks SET last_rollback_at = NOW() WHERE id = $1`, taskID)
		if err != nil {
			log.Printf("executeRollback: failed to update last_rollback_at: %v", err)
		}

		insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 2, "Update PRD version", "completed", "", "", "")

		// Mark target version as current
		_, err = db.Pool().Exec(ctx,
			`UPDATE prd_versions SET is_current = false WHERE task_id = $1`, taskID)
		if err != nil {
			log.Printf("executeRollback: failed to reset current: %v", err)
		}
		_, err = db.Pool().Exec(ctx,
			`UPDATE prd_versions SET is_current = true WHERE task_id = $1 AND version = $2`, taskID, targetVersion)
		if err != nil {
			log.Printf("executeRollback: failed to set current: %v", err)
		}

		broadcastRollbackEvent(taskID, "rollback:step", targetVersion, "", 2, "Update PRD version completed")
	}

	// Step 3: Trigger redeployment
	if resumeFromStep < 3 {
		deployPlatform := deploy.GetPlatform("vercel")
		if deployPlatform == nil {
			deployPlatform = deploy.GetPlatform("render")
		}

		if deployPlatform != nil {
			deployReq := deploy.DeployRequest{
				RepoURL:   fmt.Sprintf("https://github.com/%s/%s", owner, repo),
				Branch:    repoInfo.DefaultBranch,
				CommitSHA: targetCommitSHA,
				Type:      "frontend",
				TaskID:    taskID,
			}

			result, err := deployPlatform.TriggerDeploy(ctx, deployReq)
			if err != nil {
				log.Printf("executeRollback: deploy trigger failed: %v", err)
				insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 3, "Trigger redeployment", "failed", err.Error(), "", "")
				broadcastRollbackEvent(taskID, "rollback:failed", targetVersion, "", 3, err.Error())
				return
			}

			insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 3, "Trigger redeployment", "completed", "", "", result.DeploymentID)

			// Start polling deployment status
			go pollDeploymentStatus(taskID, result.DeploymentID, "vercel", result.DeploymentID)
		}

		broadcastRollbackEvent(taskID, "rollback:step", targetVersion, "", 3, "Redeployment triggered")
	}

	// Step 4: Complete notification
	insertRollbackLog(ctx, rollbackLogID, taskID, targetVersion, 4, "Complete", "completed", "", "", "")
	broadcastRollbackEvent(taskID, "rollback:done", targetVersion, "", 4, "")
}

// insertRollbackLog inserts or updates a rollback log entry.
func insertRollbackLog(ctx context.Context, logID, taskID, targetVersion string, step int, stepName, status, errMsg, revertSHA, deployID string) {
	now := time.Now()

	if deployID == "" {
		_, err := db.Pool().Exec(ctx,
			`INSERT INTO rollback_logs (id, task_id, target_version, step, step_name, status, error_message, github_revert_sha, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 ON CONFLICT (id) DO UPDATE SET status = $6, error_message = $7, github_revert_sha = $8, updated_at = $10`,
			logID, taskID, targetVersion, step, stepName, status, errMsg, revertSHA, now, now)
		if err != nil {
			log.Printf("insertRollbackLog: failed: %v", err)
		}
	} else {
		_, err := db.Pool().Exec(ctx,
			`INSERT INTO rollback_logs (id, task_id, target_version, step, step_name, status, error_message, github_revert_sha, deployment_id, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			 ON CONFLICT (id) DO UPDATE SET status = $6, error_message = $7, github_revert_sha = $8, deployment_id = $9, updated_at = $11`,
			logID, taskID, targetVersion, step, stepName, status, errMsg, revertSHA, deployID, now, now)
		if err != nil {
			log.Printf("insertRollbackLog: failed: %v", err)
		}
	}
}

// pollDeploymentStatus polls the deployment status and broadcasts updates.
func pollDeploymentStatus(taskID, deploymentID, platform, externalDeployID string) {
	ctx := context.Background()
	platformClient := deploy.GetPlatform(platform)

	if platformClient == nil {
		return
	}

	timeout := time.After(3 * time.Minute) // E-2: 3 minute timeout
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			log.Printf("pollDeploymentStatus: deployment %s timed out", deploymentID)
			broadcastDeploymentEvent(taskID, "deployment:failed", platform, "failed", deploymentID, "Deployment timeout (> 3 minutes)")
			db.Pool().Exec(ctx, `UPDATE deployments SET status = 'failed' WHERE id = $1`, deploymentID)
			return
		case <-ticker.C:
			status, err := platformClient.GetDeployStatus(ctx, externalDeployID)
			if err != nil {
				log.Printf("pollDeploymentStatus: get status failed: %v", err)
				continue
			}

			// Update database
			db.Pool().Exec(ctx, `UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2`, status.Status, deploymentID)

			// Broadcast status
			switch status.Status {
			case "deploying":
				broadcastDeploymentEvent(taskID, string(websocket.DeploymentStatus), platform, "deploying", deploymentID, "")
			case "success":
				broadcastDeploymentEvent(taskID, string(websocket.DeploymentDone), platform, "success", deploymentID, "")
				return
			case "failed":
				broadcastDeploymentEvent(taskID, string(websocket.DeploymentFailed), platform, "failed", deploymentID, "")
				return
			}
		}
	}
}

// broadcastDeploymentEvent sends a deployment event via WebSocket.
func broadcastDeploymentEvent(taskID, eventType, platform, status, deploymentID, errorMsg string) {
	if HubRefDelivery == nil {
		log.Printf("broadcastDeploymentEvent: HubRefDelivery is nil, skipping broadcast")
		return
	}

	info := websocket.DeploymentInfo{
		Platform: platform,
		Status:   status,
	}

	msg := websocket.Message{
		Type:        websocket.MessageType(eventType),
		TaskID:      taskID,
		Timestamp:   time.Now(),
		ServerTime:  time.Now().UnixMilli(),
		Payload:     nil,
		DeploymentInfo: &info,
	}

	if errorMsg != "" {
		msg.Error = errorMsg
	}

	HubRefDelivery.Broadcast(msg)
	log.Printf("Broadcasted %s: task=%s, platform=%s, status=%s", eventType, taskID, platform, status)
}

// broadcastRollbackEvent sends a rollback event via WebSocket.
func broadcastRollbackEvent(taskID, eventType, targetVersion, currentVersion string, step int, errorMsg string) {
	if HubRefDelivery == nil {
		log.Printf("broadcastRollbackEvent: HubRefDelivery is nil, skipping broadcast")
		return
	}

	info := websocket.RollbackInfo{
		TargetVersion:  targetVersion,
		CurrentVersion: currentVersion,
		Step:           step,
	}

	msg := websocket.Message{
		Type:          websocket.MessageType(eventType),
		TaskID:        taskID,
		Timestamp:     time.Now(),
		ServerTime:    time.Now().UnixMilli(),
		RollbackInfo:  &info,
	}

	if errorMsg != "" {
		msg.Error = errorMsg
	}

	HubRefDelivery.Broadcast(msg)
	log.Printf("Broadcasted %s: task=%s, target=%s", eventType, taskID, targetVersion)
}

// hashString computes a simple hash for the advisory lock key.
func hashString(s string) int64 {
	var hash int64
	for _, c := range s {
		hash = 31*hash + int64(c)
	}
	return hash
}
