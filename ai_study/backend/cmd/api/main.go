// DevPilot Backend API Entry Point
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/handlers"
	"github.com/devpilot/backend/internal/temporal"
	"github.com/devpilot/backend/internal/websocket"
	"github.com/gorilla/mux"
)

func main() {
	ctx := context.Background()

	// Initialize database connection
	if err := db.Init(ctx); err != nil {
		log.Printf("Warning: Database connection failed: %v (continuing without DB)", err)
	} else {
		log.Println("Database connection established")
		defer db.Close()
		// Create memories table if not exists
		if err := db.InitMemoriesTable(ctx); err != nil {
			log.Printf("Warning: Failed to init memories table: %v", err)
		} else {
			log.Println("Memories table ready")
		}
	}

	// Initialize WebSocket server
	wsServer := websocket.NewServer(os.Getenv("JWT_SECRET"))

	// Initialize Temporal client (optional - continue without if not available)
	temporalAddr := os.Getenv("TEMPORAL_ADDR")
	if temporalAddr != "" {
		if err := temporal.InitTemporal(temporalAddr); err != nil {
			log.Printf("Warning: Temporal connection failed: %v (workflows will not run)", err)
		} else {
			log.Println("Temporal client initialized")
			defer temporal.CloseTemporal()
		}
	} else {
		log.Println("TEMPORAL_ADDR not set - Temporal workflows disabled")
	}

	// Initialize Agent gRPC client (optional - continues without if not available)
	agentAddr := os.Getenv("AGENT_GRPC_ADDR")
	useMock := agentAddr == ""
	if useMock {
		log.Println("Using MockAgentClient (set AGENT_GRPC_ADDR for production)")
	} else {
		log.Printf("Agent gRPC address: %s", agentAddr)
	}
	if err := temporal.InitAgentClient(agentAddr, useMock); err != nil {
		log.Printf("Warning: Agent client init failed: %v (using MockAgentClient)", err)
	}

	// Start WebSocket server
	hub := wsServer.Hub()
	websocket.SetGlobalHub(hub)
	hub.RunWithTemporalPolling()

	// Create HTTP mux (gorilla/mux for path parameters support)
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", healthHandler)

	// Phase 1 - Homepage APIs
	router.HandleFunc("/api/requirements/submit", handlers.HandleRequirementSubmit)
	router.HandleFunc("/api/requirements", handlers.HandleRequirementsList)
	router.HandleFunc("/api/requirements/generate-prd", handlers.HandleGeneratePRD)
	router.HandleFunc("/api/requirements/{id}", handlers.HandleRequirementGet)
	router.HandleFunc("/api/requirements/{id}/status", handlers.HandleRequirementStatusUpdate)
	router.HandleFunc("/api/requirements/{id}/approve", handlers.HandleRequirementApprove)
	router.HandleFunc("/api/requirements/{id}/review", handlers.HandleRequirementReview)
	router.HandleFunc("/api/chat", handlers.HandleChat)
	router.HandleFunc("/api/sensitive/check", handlers.HandleSensitiveCheck)
	router.HandleFunc("/api/templates", handlers.HandleTemplates)
	router.HandleFunc("/api/stats", handlers.HandleStats)
	router.HandleFunc("/api/users/{user_id}/model-config", handlers.HandleUserModelConfig)

	// Phase 2 - Task Kanban APIs
	router.HandleFunc("/api/tasks", handlers.HandleTasksGet)
	router.HandleFunc("/api/tasks/create", handlers.HandleTasksCreate)
	router.HandleFunc("/api/tasks/{id}/execute", handlers.HandleTasksExecute)
	router.HandleFunc("/api/tasks/{id}/output", handlers.HandleTaskOutput)
	router.HandleFunc("/api/tasks/{id}", handlers.HandleTaskGet)
	router.HandleFunc("/api/tasks/{id}/claim", handlers.HandleTaskClaim)
	router.HandleFunc("/api/tasks/{id}/cancel", handlers.HandleTaskCancel)
	router.HandleFunc("/api/tasks/{id}/retry", handlers.HandleTaskRetry)
	router.HandleFunc("/api/tasks/{id}/transition", handlers.HandleTaskTransition)
	router.HandleFunc("/api/tasks/{id}/test", handlers.HandleTaskTest)
	router.HandleFunc("/api/tasks/{id}/logs", handlers.HandleTaskLogsGet)

	// Set HubRef for WebSocket broadcasting
	handlers.HubRef = hub
	handlers.HubRefDelivery = hub

	// Phase 3 - Delivery APIs
	router.HandleFunc("/api/delivery/{task_id}/prd", handlers.HandlePRDGet)
	router.HandleFunc("/api/delivery/{task_id}/prd/rollback", handlers.HandlePRDRollback)
	router.HandleFunc("/api/delivery/{task_id}/github", handlers.HandleGitHubGet)
	router.HandleFunc("/api/delivery/{task_id}/github/tree", handlers.HandleGitHubTree)
	router.HandleFunc("/api/delivery/{task_id}/github/file", handlers.HandleGitHubFile)
	router.HandleFunc("/api/delivery/{task_id}/github/commits", handlers.HandleGitHubCommits)
	router.HandleFunc("/api/delivery/{task_id}/deploy", handlers.HandleDeploy)
	router.HandleFunc("/api/delivery/{task_id}/deploy/status", handlers.HandleDeployStatus)
	router.HandleFunc("/api/delivery/{task_id}/deployments", handlers.HandleDeployments)
	router.HandleFunc("/api/delivery/{task_id}/rollback/logs", handlers.HandleRollbackLogs)
	router.HandleFunc("/api/delivery/{task_id}/rollback", handlers.HandleRollback)

	// Phase 6 - Memory APIs
	router.HandleFunc("/api/memory", handlers.HandleMemoryCreate).Methods("POST")
	router.HandleFunc("/api/memory", handlers.HandleMemoryList).Methods("GET")
	router.HandleFunc("/api/memory/search", handlers.HandleMemorySearch).Methods("GET")
	router.HandleFunc("/api/memory/relevant", handlers.HandleGetRelevantMemories).Methods("GET")
	router.HandleFunc("/api/memory/{id}", handlers.HandleMemoryDelete).Methods("DELETE")
	router.HandleFunc("/api/memory/{id}", handlers.HandleMemoryUpdate).Methods("PUT")

	// Phase 5 - Auth API
	authHandler := handlers.NewAuthHandler()
	router.HandleFunc("/api/auth/github", authHandler.HandleGitHubCallback)

	// Agent callback
	router.HandleFunc("/api/agent/result", handlers.HandleAgentResult)

	// WebSocket endpoint
	router.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsServer.HandleWebSocket(w, r)
	})

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")
		hub.Shutdown()
		os.Exit(0)
	}()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("DevPilot API server starting on :%s", port)

	// CORS middleware for local development
	corsMux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		router.ServeHTTP(w, r)
	})

	if err := http.ListenAndServe(":"+port, corsMux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// HealthResponse represents the health check response body.
type HealthResponse struct {
	Status  string    `json:"status"`
	Service string    `json:"service"`
	Version string    `json:"version"`
	Time    time.Time `json:"time"`
}

// healthHandler handles GET /health requests.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	resp := HealthResponse{
		Status:  "ok",
		Service: "devpilot-api",
		Version: "0.1.0",
		Time:    time.Now(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
