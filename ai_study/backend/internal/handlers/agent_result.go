package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/google/uuid"
)

// AgentResultRequest 是 Python Agent 回调的请求体
type AgentResultRequest struct {
	UserID  string                 `json:"user_id"`
	Result  map[string]interface{}  `json:"result"`
}

// HandleAgentResult 接收 Python Agent 的处理结果
// POST /api/agent/result
func HandleAgentResult(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AgentResultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	result := req.Result

	// 更新 tasks 表状态
	if taskID, ok := result["task_id"].(string); ok {
		_, _ = db.Pool().Exec(ctx,
			`UPDATE tasks SET state='completed', updated_at=NOW() WHERE id=$1`,
			taskID,
		)
	}

	// 存储 PRD
	if prd, ok := result["prd"].(string); ok && prd != "" {
		// 找最新的 task_id 对应的 prd
		var taskID string
		_ = db.Pool().QueryRow(ctx,
			`SELECT id FROM tasks WHERE created_at = (SELECT MAX(created_at) FROM tasks) LIMIT 1`,
		).Scan(&taskID)
		if taskID != "" {
			prdID := uuid.New().String()
			_, _ = db.Pool().Exec(ctx,
				`INSERT INTO prd_versions (id, task_id, content, is_current)
				 VALUES ($1, $2, $3, true)`,
				prdID, taskID, prd,
			)
		}
	}

	// 存储生成的代码文件到 documents 表
	if codeFiles, ok := result["code_files"].([]interface{}); ok {
		for _, f := range codeFiles {
			if file, ok := f.(map[string]interface{}); ok {
				path, _ := file["path"].(string)
				content, _ := file["content"].(string)
				size, _ := file["size"].(float64)
				summary := file["summary"].(string)

				// 取最新 task
				var taskID string
				_ = db.Pool().QueryRow(ctx,
					`SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1`,
				).Scan(&taskID)

				if taskID != "" && content != "" {
					docID := uuid.New().String()
					_, _ = db.Pool().Exec(ctx,
						`INSERT INTO documents (id, task_id, filename, file_type, file_size, summary, raw_text)
						 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
						docID, taskID, path, "code", int(size), summary, content,
					)
				}
			}
		}
	}

	// 存储测试文件
	if testFiles, ok := result["test_files"].([]interface{}); ok {
		for _, f := range testFiles {
			if file, ok := f.(map[string]interface{}); ok {
				path, _ := file["path"].(string)
				content, _ := file["content"].(string)
				size, _ := file["size"].(float64)

				var taskID string
				_ = db.Pool().QueryRow(ctx,
					`SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1`,
				).Scan(&taskID)

				if taskID != "" && content != "" {
					docID := uuid.New().String()
					_, _ = db.Pool().Exec(ctx,
						`INSERT INTO documents (id, task_id, filename, file_type, file_size, raw_text)
						 VALUES ($1, $2, $3, $4, $5, $6)`,
						docID, taskID, path, "test", int(size), content,
					)
				}
			}
		}
	}

	// 写执行日志
	if logs, ok := result["logs"].([]interface{}); ok {
		var taskID string
		_ = db.Pool().QueryRow(ctx,
			`SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1`,
		).Scan(&taskID)

		for _, l := range logs {
			if logEntry, ok := l.(map[string]interface{}); ok {
				logID := uuid.New().String()
				agent, _ := logEntry["agent"].(string)
				msg, _ := logEntry["message"].(string)
				level := "INFO"
				if l, ok := logEntry["level"].(string); ok {
					level = l
				}
				_, _ = db.Pool().Exec(ctx,
					`INSERT INTO task_logs (id, task_id, timestamp, level, agent, message)
					 VALUES ($1, $2, $3, $4, $5, $6)`,
					logID, taskID, time.Now(), level, agent, msg,
				)
			}
		}
	}

	log.Printf("[AgentResult] Processed result from user=%s, success=%v", req.UserID, result["success"])

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "received"})
}
