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
)

func main() {
	ctx := context.Background()

	// Initialize database connection
	if err := db.Init(ctx); err != nil {
		log.Printf("Warning: Database connection failed: %v (continuing without DB)", err)
	} else {
		log.Println("Database connection established")
		defer db.Close()
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

	// Create HTTP mux
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", healthHandler)

	// Phase 1 - Homepage APIs
	mux.HandleFunc("/api/requirements/submit", handlers.HandleRequirementSubmit)
	mux.HandleFunc("/api/sensitive/check", handlers.HandleSensitiveCheck)
	mux.HandleFunc("/api/templates", handlers.HandleTemplates)
	mux.HandleFunc("/api/stats", handlers.HandleStats)

	// Phase 2 - Task Kanban APIs
	mux.HandleFunc("/api/tasks", handlers.HandleTasksGet)
	mux.HandleFunc("/api/tasks/{id}", handlers.HandleTaskGet)
	mux.HandleFunc("/api/tasks/{id}/claim", handlers.HandleTaskClaim)
	mux.HandleFunc("/api/tasks/{id}/cancel", handlers.HandleTaskCancel)
	mux.HandleFunc("/api/tasks/{id}/retry", handlers.HandleTaskRetry)
	mux.HandleFunc("/api/tasks/{id}/transition", handlers.HandleTaskTransition)
	mux.HandleFunc("/api/tasks/{id}/logs", handlers.HandleTaskLogsGet)

	// Set HubRef for WebSocket broadcasting
	handlers.HubRef = hub
	handlers.HubRefDelivery = hub

	// Phase 3 - Delivery APIs
	mux.HandleFunc("/api/delivery/{task_id}/prd", handlers.HandlePRDGet)
	mux.HandleFunc("/api/delivery/{task_id}/prd/rollback", handlers.HandlePRDRollback)
	mux.HandleFunc("/api/delivery/{task_id}/github", handlers.HandleGitHubGet)
	mux.HandleFunc("/api/delivery/{task_id}/github/tree", handlers.HandleGitHubTree)
	mux.HandleFunc("/api/delivery/{task_id}/github/file", handlers.HandleGitHubFile)
	mux.HandleFunc("/api/delivery/{task_id}/github/commits", handlers.HandleGitHubCommits)
	mux.HandleFunc("/api/delivery/{task_id}/deploy", handlers.HandleDeploy)
	mux.HandleFunc("/api/delivery/{task_id}/deploy/status", handlers.HandleDeployStatus)
	mux.HandleFunc("/api/delivery/{task_id}/deployments", handlers.HandleDeployments)
	mux.HandleFunc("/api/delivery/{task_id}/rollback/logs", handlers.HandleRollbackLogs)
	mux.HandleFunc("/api/delivery/{task_id}/rollback", handlers.HandleRollback)

	// Phase 5 - Auth API
	authHandler := handlers.NewAuthHandler()
	mux.HandleFunc("/api/auth/github", authHandler.HandleGitHubCallback)

	// WebSocket endpoint
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
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
	if err := http.ListenAndServe(":"+port, mux); err != nil {
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
