// WebSocket Server
//
// Handles WebSocket upgrade requests with Sec-WebSocket-Protocol JWT authentication.

package websocket

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// CheckOrigin returns true for all origins in development
	// In production, implement proper origin checking
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Server is the main WebSocket server that handles connections.
type Server struct {
	hub          *Hub
	jwtSecret    string
	readTimeout  time.Duration
	writeTimeout time.Duration
}

// NewServer creates a new WebSocket server.
func NewServer(jwtSecret string) *Server {
	return &Server{
		hub:          NewHub(),
		jwtSecret:    jwtSecret,
		readTimeout:  60 * time.Second,
		writeTimeout: 10 * time.Second,
	}
}

// Hub returns the underlying Hub instance.
func (s *Server) Hub() *Hub {
	return s.hub
}

// HandleWebSocket handles WebSocket upgrade requests.
// Authentication is performed via Sec-WebSocket-Protocol header (JWT token).
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Extract JWT from Sec-WebSocket-Protocol header
	token := r.Header.Get("Sec-WebSocket-Protocol")
	if token == "" {
		// Also check query parameter as fallback (for development)
		token = r.URL.Query().Get("token")
	}

	// Validate token and extract claims
	claims, err := s.validateToken(token)
	if err != nil {
		log.Printf("WebSocket auth failed: %v", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Generate client ID
	clientID := generateClientID(claims.UserID, claims.AgentType)

	// Create client
	client := NewClient(clientID, s.hub, conn, token)
	client.SetUserID(claims.UserID)
	client.SetAgentType(claims.AgentType)

	// Register with hub
	s.hub.Register(client)

	// Start read/write pumps in goroutines
	go client.WritePump()
	go client.ReadPump()

	log.Printf("WebSocket client connected: %s (user: %s, agent: %s)", clientID, claims.UserID, claims.AgentType)
}

// ServeHTTP implements the http.Handler interface.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/ws" {
		s.HandleWebSocket(w, r)
		return
	}
	http.NotFound(w, r)
}

// Run starts the WebSocket server.
func (s *Server) Run(addr string) error {
	// Start hub in background
	go s.hub.Run()

	log.Printf("WebSocket server starting on %s", addr)
	return http.ListenAndServe(addr, s)
}

// Broadcast sends a message to all connected clients.
func (s *Server) Broadcast(msg Message) {
	s.hub.Broadcast(msg)
}

// BroadcastTaskEvent is a convenience method for broadcasting task-related events.
func (s *Server) BroadcastTaskEvent(eventType MessageType, taskID string, payload interface{}) {
	msg := Message{
		Type:       eventType,
		TaskID:     taskID,
		Timestamp:  time.Now(),
		ServerTime: time.Now().UnixMilli(),
		Payload:    payload,
	}
	s.hub.Broadcast(msg)
}

// JWTClaims represents the claims extracted from the JWT token.
// Uses jwt.RegisteredClaims for standard JWT fields.
type JWTClaims struct {
	jwt.RegisteredClaims
	UserID    string `json:"user_id"`
	AgentType string `json:"agent_type,omitempty"`
}

// validateToken validates the JWT token using HMAC-SHA256 signature verification.
// The token must be signed with the server's JWT secret.
func (s *Server) validateToken(tokenString string) (*JWTClaims, error) {
	if tokenString == "" {
		return nil, &AuthError{Message: "token is required"}
	}

	// Strip "Bearer " prefix if present
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	tokenString = strings.TrimPrefix(tokenString, "bearer ")

	// Parse and validate the token with signature verification
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method (reject "none" algorithm)
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})

	if err != nil {
		return nil, &AuthError{Message: "invalid token: " + err.Error()}
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, &AuthError{Message: "invalid token claims"}
	}

	// Verify expiration (jwt library does this automatically via RegisteredClaims.ExpiresAt,
	// but we add explicit check for clarity)
	if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, &AuthError{Message: "token has expired"}
	}

	return claims, nil
}

// AuthError represents an authentication error.
type AuthError struct {
	Message string
}

func (e *AuthError) Error() string {
	return e.Message
}

// generateClientID generates a unique client ID.
func generateClientID(userID, agentType string) string {
	return fmt.Sprintf("%s-%s-%d", userID, agentType, time.Now().UnixNano())
}
