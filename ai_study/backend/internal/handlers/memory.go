package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/models"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// HandleMemoryCreate handles POST /api/memory
func HandleMemoryCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.MemoryCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		writeError(w, "Content is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	// Default type
	if req.Type == "" {
		req.Type = models.MemoryTypeProjectContext
	}

	// Generate summary from content if not provided
	summary := req.Summary
	if summary == "" && len(req.Content) > 100 {
		summary = req.Content[:100] + "..."
	}

	ctx := context.Background()
	var id string
	err := db.Pool().QueryRow(ctx,
		`INSERT INTO memories (user_id, type, content, summary, keywords)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		req.UserID, req.Type, req.Content, summary, req.Keywords,
	).Scan(&id)
	if err != nil {
		log.Printf("HandleMemoryCreate: %v", err)
		writeError(w, "Failed to create memory", "INTERNAL_ERROR", http.StatusInternalServerError)
		return
	}

	memory := models.Memory{
		ID:        id,
		UserID:    req.UserID,
		Type:      req.Type,
		Content:   req.Content,
		Summary:   summary,
		Keywords:  req.Keywords,
		CreatedAt: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"memory": memory,
		"id":     id,
	})
}

// HandleMemoryList handles GET /api/memory
// Query params: user_id, type (optional)
func HandleMemoryList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.URL.Query().Get("user_id")
	memType := r.URL.Query().Get("type")
	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "50"
	}

	ctx := context.Background()

	query := `SELECT id, COALESCE(user_id,''), type, content, COALESCE(summary,''), COALESCE(keywords,''), created_at, last_used_at, COALESCE(use_count,0)
	          FROM memories WHERE 1=1`
	var args []interface{}
	argIdx := 1

	if userID != "" {
		query += ` AND user_id = $` + fmt.Sprintf("$%d", argIdx)
		args = append(args, userID)
		argIdx++
	}
	if memType != "" {
		query += ` AND type = $` + fmt.Sprintf("$%d", argIdx)
		args = append(args, memType)
		argIdx++
	}

	query += ` ORDER BY last_used_at DESC LIMIT $` + fmt.Sprintf("$%d", argIdx)
	args = append(args, limit)

	rows, err := db.Pool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("HandleMemoryList: %v", err)
		writeError(w, "Failed to list memories", "INTERNAL_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	memories := []models.Memory{}
	for rows.Next() {
		var m models.Memory
		if err := rows.Scan(&m.ID, &m.UserID, &m.Type, &m.Content, &m.Summary, &m.Keywords, &m.CreatedAt, &m.LastUsedAt, &m.UseCount); err != nil {
			continue
		}
		memories = append(memories, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.MemoryListResponse{
		Memories: memories,
		Total:    len(memories),
	})
}

// HandleMemoryDelete handles DELETE /api/memory/{id}
func HandleMemoryDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	ctx := context.Background()
	result, err := db.Pool().Exec(ctx, `DELETE FROM memories WHERE id = $1`, id)
	if err != nil {
		log.Printf("HandleMemoryDelete: %v", err)
		writeError(w, "Failed to delete memory", "INTERNAL_ERROR", http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, "Memory not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Memory deleted"})
}

// HandleMemoryUpdate handles PUT /api/memory/{id}
func HandleMemoryUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	var req struct {
		Content  string `json:"content"`
		Keywords string `json:"keywords"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	summary := req.Content
	if len(summary) > 100 {
		summary = summary[:100] + "..."
	}

	result, err := db.Pool().Exec(ctx,
		`UPDATE memories SET content=$1, summary=$2, keywords=$3, last_used_at=NOW() WHERE id=$4`,
		req.Content, summary, req.Keywords, id,
	)
	if err != nil {
		log.Printf("HandleMemoryUpdate: %v", err)
		writeError(w, "Failed to update memory", "INTERNAL_ERROR", http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, "Memory not found", "NOT_FOUND", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Memory updated"})
}

// HandleMemorySearch handles GET /api/memory/search?keywords=xxx
// Simple keyword-based search (no vector search needed for now)
func HandleMemorySearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	keywords := r.URL.Query().Get("keywords")
	userID := r.URL.Query().Get("user_id")

	if keywords == "" {
		writeError(w, "keywords query param is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	query := `SELECT id, COALESCE(user_id,''), type, content, COALESCE(summary,''), COALESCE(keywords,''), created_at, last_used_at, COALESCE(use_count,0)
	          FROM memories WHERE 1=1`
	var args []interface{}
	argIdx := 1

	kwParts := strings.Split(keywords, ",")
	kwConditions := []string{}
	for _, kw := range kwParts {
		kw := strings.TrimSpace(kw)
		if kw == "" {
			continue
		}
		kwConditions = append(kwConditions, `(content ILIKE $`+fmt.Sprintf("$%d", argIdx)+` OR keywords ILIKE $`+fmt.Sprintf("$%d", argIdx)+` OR summary ILIKE $`+fmt.Sprintf("$%d", argIdx)+`)`)
		args = append(args, "%"+kw+"%")
		argIdx++
	}

	if len(kwConditions) > 0 {
		query += ` AND (` + strings.Join(kwConditions, " OR ") + `)`
	}

	if userID != "" {
		query += ` AND user_id = $` + fmt.Sprintf("$%d", argIdx)
		args = append(args, userID)
		argIdx++
	}

	query += ` ORDER BY use_count DESC, last_used_at DESC LIMIT 20`

	rows, err := db.Pool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("HandleMemorySearch: %v", err)
		writeError(w, "Failed to search memories", "INTERNAL_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	memories := []models.Memory{}
	for rows.Next() {
		var m models.Memory
		if err := rows.Scan(&m.ID, &m.UserID, &m.Type, &m.Content, &m.Summary, &m.Keywords, &m.CreatedAt, &m.LastUsedAt, &m.UseCount); err != nil {
			continue
		}
		memories = append(memories, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"memories": memories,
		"total":    len(memories),
	})
}

// IncrementMemoryUseCount increments the use_count when a memory is referenced.
func IncrementMemoryUseCount(ctx context.Context, memoryID string) {
	db.Pool().Exec(ctx, `UPDATE memories SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1`, memoryID)
}

// HandleGetRelevantMemories returns memories relevant to a given prompt/topic.
func HandleGetRelevantMemories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	prompt := r.URL.Query().Get("prompt")
	userID := r.URL.Query().Get("user_id")

	if prompt == "" {
		writeError(w, "prompt query param is required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	// Extract keywords from prompt (simple split)
	words := strings.Fields(prompt)
	kwArgs := []string{}
	args := []interface{}{}
	argIdx := 1

	// Match against content, summary, keywords
	for _, word := range words {
		if len(word) < 3 {
			continue
		}
		kwArgs = append(kwArgs, `(content ILIKE $`+fmt.Sprintf("$%d", argIdx)+` OR keywords ILIKE $`+fmt.Sprintf("$%d", argIdx)+`)`)
		args = append(args, "%"+word+"%")
		argIdx++
	}

	query := `SELECT id, COALESCE(user_id,''), type, content, COALESCE(summary,''), COALESCE(keywords,''), created_at, last_used_at, COALESCE(use_count,0)
	          FROM memories WHERE 1=1`

	if userID != "" {
		query += ` AND user_id = $` + fmt.Sprintf("$%d", argIdx)
		args = append(args, userID)
		argIdx++
	}

	if len(kwArgs) > 0 {
		query += ` AND (` + strings.Join(kwArgs, " OR ") + `)`
	}

	query += ` ORDER BY use_count DESC, last_used_at DESC LIMIT 5`

	rows, err := db.Pool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("HandleGetRelevantMemories: %v", err)
		writeError(w, "Failed to get relevant memories", "INTERNAL_ERROR", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	memories := []models.Memory{}
	for rows.Next() {
		var m models.Memory
		if err := rows.Scan(&m.ID, &m.UserID, &m.Type, &m.Content, &m.Summary, &m.Keywords, &m.CreatedAt, &m.LastUsedAt, &m.UseCount); err != nil {
			continue
		}
		// Increment use count
		IncrementMemoryUseCount(ctx, m.ID)
		memories = append(memories, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"memories": memories,
		"total":    len(memories),
	})
}

// UUID validation helper (avoid external dep for simple validation)
func isValidUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}
