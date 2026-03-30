// WebSocket Client
//
// Represents a single WebSocket client connection.

package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait).
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 8192

	// Send channel buffer size.
	sendBufferSize = 256
)

// Client represents a WebSocket client connection.
type Client struct {
	// Unique identifier for this client
	ID string

	// Hub reference for routing messages
	hub *Hub

	// The underlying WebSocket connection
	conn *websocket.Conn

	// Buffered channel of outbound messages
	send chan Message

	// JWT token used for authentication
	token string

	// User ID extracted from JWT
	userID string

	// Agent type if this is an agent client
	agentType string
}

// NewClient creates a new WebSocket client.
func NewClient(id string, hub *Hub, conn *websocket.Conn, token string) *Client {
	return &Client{
		ID:    id,
		hub:   hub,
		conn:  conn,
		send:  make(chan Message, sendBufferSize),
		token: token,
	}
}

// ReadPump pumps messages from the WebSocket connection to the hub.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}
		// For now, we don't process inbound messages from clients
		// In the future, this could handle client-side commands
	}
}

// WritePump pumps messages from the hub to the WebSocket connection.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			// Write message
			if err := json.NewEncoder(w).Encode(message); err != nil {
				log.Printf("Failed to write WebSocket message: %v", err)
				return
			}

			// Drain queued messages for this client
			n := len(c.send)
			for i := 0; i < n; i++ {
				msg := <-c.send
				if err := json.NewEncoder(w).Encode(msg); err != nil {
					log.Printf("Failed to write queued WebSocket message: %v", err)
					return
				}
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Send sends a message to this client.
func (c *Client) Send(msg Message) {
	select {
	case c.send <- msg:
	default:
		// Buffer full, message dropped
		log.Printf("Client %s: send buffer full, dropping message", c.ID)
	}
}

// GetUserID returns the authenticated user ID.
func (c *Client) GetUserID() string {
	return c.userID
}

// GetAgentType returns the agent type if this is an agent client.
func (c *Client) GetAgentType() string {
	return c.agentType
}

// SetUserID sets the authenticated user ID.
func (c *Client) SetUserID(userID string) {
	c.userID = userID
}

// SetAgentType sets the agent type.
func (c *Client) SetAgentType(agentType string) {
	c.agentType = agentType
}
