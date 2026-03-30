// WebSocket Hub
//
// Manages broadcast distribution of messages to connected clients.
// Enhanced with Temporal polling for task events.

package websocket

import (
	"context"
	"log"
	"sync"
	"time"
)

// Hub manages all connected WebSocket clients and handles message routing.
type Hub struct {
	// Registered clients by client ID
	clients map[string]*Client

	// Mutex for client map operations
	mu sync.RWMutex

	// Inbound message channel from clients
	inbound chan *Message

	// Outbound message channel to clients
	outbound chan *OutboundMessage

	// Context with cancellation for shutdown
	ctx    context.Context
	cancel context.CancelFunc

	// Register requests
	register chan *Client

	// Unregister requests
	unregister chan *Client

	// Temporal polling state
	temporalClient TemporalClient
	pollInterval   time.Duration
	lastPollTime   time.Time
}

// TemporalClient interface for Temporal workflow polling.
type TemporalClient interface {
	// PollTaskEvents fetches new task events since lastPollTime
	PollTaskEvents(ctx context.Context, since time.Time) ([]TaskEvent, error)
}

// TaskEvent represents a task event from Temporal.
type TaskEvent struct {
	EventID    string
	TaskID     string
	EventType  string // task:started, task:completed, task:failed, etc.
	State      string
	Progress   int
	AgentType  string
	Timestamp  time.Time
	Payload    interface{}
	Error      string
}

// NewHub creates a new Hub instance.
func NewHub() *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		clients:      make(map[string]*Client),
		inbound:      make(chan *Message, 256),
		outbound:     make(chan *OutboundMessage, 256),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		ctx:          ctx,
		cancel:       cancel,
		pollInterval: 3 * time.Second,
	}
}

// SetTemporalClient sets the Temporal client for polling.
func (h *Hub) SetTemporalClient(client TemporalClient) {
	h.temporalClient = client
}

// Run starts the hub's main event loop.
func (h *Hub) Run() {
	for {
		select {
		case <-h.ctx.Done():
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("Hub: client registered: %s (total: %d)", client.ID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.send)
				log.Printf("Hub: client unregistered: %s (total: %d)", client.ID, len(h.clients))
			}
			h.mu.Unlock()

		case outMsg := <-h.outbound:
			h.mu.RLock()
			if len(outMsg.TargetClientIDs) == 0 {
				// Broadcast to all clients
				for _, client := range h.clients {
					select {
					case client.send <- outMsg.Message:
					default:
						// Client send buffer full, skip
					}
				}
			} else {
				// Send to specific clients
				for _, clientID := range outMsg.TargetClientIDs {
					if client, ok := h.clients[clientID]; ok {
						select {
						case client.send <- outMsg.Message:
						default:
						}
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// RunWithTemporalPolling starts the hub with Temporal polling enabled.
func (h *Hub) RunWithTemporalPolling() {
	// Start the base hub loop
	go h.Run()

	// Start Temporal polling if client is configured
	if h.temporalClient != nil {
		go h.temporalPollingLoop()
		log.Printf("Hub: Temporal polling started (interval: %v)", h.pollInterval)
	} else {
		log.Printf("Hub: Warning - Temporal client not configured, polling disabled")
	}
}

// temporalPollingLoop polls Temporal for new events every 3 seconds.
func (h *Hub) temporalPollingLoop() {
	ticker := time.NewTicker(h.pollInterval)
	defer ticker.Stop()

	h.lastPollTime = time.Now()

	for {
		select {
		case <-h.ctx.Done():
			return
		case <-ticker.C:
			h.pollTemporal()
		}
	}
}

// pollTemporal fetches events from Temporal and broadcasts them.
func (h *Hub) pollTemporal() {
	if h.temporalClient == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	events, err := h.temporalClient.PollTaskEvents(ctx, h.lastPollTime)
	cancel()

	if err != nil {
		log.Printf("Hub: Temporal polling error: %v", err)
		return
	}

	h.lastPollTime = time.Now()

	// Convert and broadcast each event
	for _, event := range events {
		msg := h.convertTemporalEventToMessage(event)
		h.Broadcast(msg)
	}
}

// convertTemporalEventToMessage converts a Temporal event to a WebSocket message.
func (h *Hub) convertTemporalEventToMessage(event TaskEvent) Message {
	msg := Message{
		EventID:     event.EventID,
		TaskID:      event.TaskID,
		Timestamp:   event.Timestamp,
		ServerTime:  time.Now().UnixMilli(), // server_timestamp for latency measurement
		State:       TaskState(event.State),
		Progress:    event.Progress,
		Error:       event.Error,
		Payload:     event.Payload,
	}

	// Map event type to MessageType
	switch event.EventType {
	case "task:started":
		msg.Type = TaskStarted
	case "task:progress":
		msg.Type = TaskProgress
	case "task:completed":
		msg.Type = TaskCompleted
	case "task:failed":
		msg.Type = TaskFailed
	case "task:state_changed":
		msg.Type = TaskStateChange
	case "agent:heartbeat":
		msg.Type = AgentHeartbeat
	case "rollback:started":
		msg.Type = RollbackStarted
	case "rollback:step":
		msg.Type = RollbackStep
	case "rollback:done":
		msg.Type = RollbackDone
	case "rollback:failed":
		msg.Type = RollbackFailed
	case "deployment:started":
		msg.Type = DeploymentStarted
	case "deployment:updated":
		msg.Type = DeploymentUpdated
	case "deployment:done":
		msg.Type = DeploymentDone
	case "deployment:failed":
		msg.Type = DeploymentFailed
	default:
		msg.Type = Notification
	}

	// Set AgentType if present
	if event.AgentType != "" {
		msg.AgentType = AgentType(event.AgentType)
	}

	return msg
}

// Register registers a new client with the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends a message to all connected clients.
func (h *Hub) Broadcast(msg Message) {
	h.outbound <- &OutboundMessage{
		TargetClientIDs: nil, // nil means all
		Message:         msg,
	}
}

// BroadcastWithServerTime sends a message with explicit server_timestamp.
func (h *Hub) BroadcastWithServerTime(msg Message, serverTime int64) {
	msg.ServerTime = serverTime
	h.outbound <- &OutboundMessage{
		TargetClientIDs: nil,
		Message:         msg,
	}
}

// SendTo sends a message to specific client(s).
func (h *Hub) SendTo(clientIDs []string, msg Message) {
	h.outbound <- &OutboundMessage{
		TargetClientIDs: clientIDs,
		Message:         msg,
	}
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Shutdown gracefully shuts down the hub.
func (h *Hub) Shutdown() {
	h.cancel()
	h.mu.Lock()
	for _, client := range h.clients {
		close(client.send)
	}
	h.clients = make(map[string]*Client)
	h.mu.Unlock()
}

// Global hub reference for cross-package access
var globalHub *Hub

// SetGlobalHub sets the global hub instance.
func SetGlobalHub(h *Hub) {
	globalHub = h
}

// GetHubRef returns the global hub instance.
func GetHubRef() *Hub {
	return globalHub
}
