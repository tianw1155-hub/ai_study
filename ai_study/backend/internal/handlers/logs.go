// Task logs API handler
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/models"
	"github.com/gorilla/mux"
)

// HandleTaskLogsGet handles GET /api/tasks/:id/logs
// Returns execution logs for a task.
func HandleTaskLogsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	taskID := vars["id"]

	ctx := context.Background()

	// Check if task_logs table exists, if not fall back to empty
	rows, err := db.Pool().Query(ctx,
		`SELECT id, task_id, timestamp, level, agent, message
		 FROM task_logs
		 WHERE task_id = $1
		 ORDER BY timestamp ASC`, taskID,
	)

	if err != nil {
		// If table doesn't exist, return empty logs
		log.Printf("HandleTaskLogsGet: task_logs query failed (table may not exist): %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"task_id": taskID,
			"logs":    []models.TaskLog{},
			"total":   0,
		})
		return
	}
	defer rows.Close()

	logs := []models.TaskLog{}
	for rows.Next() {
		var l models.TaskLog
		if err := rows.Scan(&l.ID, &l.TaskID, &l.Timestamp, &l.Level, &l.Agent, &l.Message); err != nil {
			log.Printf("HandleTaskLogsGet: scan failed: %v", err)
			continue
		}
		logs = append(logs, l)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"task_id": taskID,
		"logs":    logs,
		"total":   len(logs),
	})
}
