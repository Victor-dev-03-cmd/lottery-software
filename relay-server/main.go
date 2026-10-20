// Lottery Mobile Relay Server
// High-performance Go WebSocket relay that bridges Flutter mobile app ↔ Tauri desktop
// across any network (WiFi, 4G, 5G — no LAN required).
//
// Architecture:
//   Mobile (Flutter) ──WebSocket──→ Relay Server ──WebSocket──→ Desktop (Tauri)
//
// Sessions:
//   Desktop creates a session → gets session_id
//   Desktop shows QR with: lottery://pair?session=XXXX&host=https://relay.example.com
//   Mobile scans QR → connects to relay with session_id
//   Desktop + Mobile share a broadcast channel keyed by session_id
//
// Deploy: single binary, no dependencies, runs on any Linux VPS
//   go build -o lottery-relay && ./lottery-relay
//   Or with Railway/Fly.io/Render free tier

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ── Config ────────────────────────────────────────────────────────────────────

var port = getEnv("PORT", "8080")
var allowedOrigins = getEnv("ALLOWED_ORIGINS", "*")

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ── Session hub ────────────────────────────────────────────────────────────────

type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	role     string // "desktop" | "mobile"
	sessionID string
}

type Session struct {
	id      string
	clients map[*Client]bool
	mu      sync.RWMutex
	created time.Time
}

type Hub struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

func newHub() *Hub {
	h := &Hub{sessions: make(map[string]*Session)}
	go h.cleanup()
	return h
}

// Remove sessions older than 4 hours with no clients
func (h *Hub) cleanup() {
	for range time.Tick(30 * time.Minute) {
		h.mu.Lock()
		for id, s := range h.sessions {
			s.mu.RLock()
			empty := len(s.clients) == 0
			old   := time.Since(s.created) > 4*time.Hour
			s.mu.RUnlock()
			if empty && old {
				delete(h.sessions, id)
				log.Printf("Cleaned up session %s", id)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) getOrCreate(sessionID string) *Session {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.sessions[sessionID]; ok {
		return s
	}
	s := &Session{id: sessionID, clients: make(map[*Client]bool), created: time.Now()}
	h.sessions[sessionID] = s
	log.Printf("New session: %s", sessionID)
	return s
}

func (s *Session) join(c *Client) {
	s.mu.Lock()
	s.clients[c] = true
	s.mu.Unlock()
	// Announce new peer to others
	s.broadcast(c, Message{Type: "peer_joined", Session: s.id, Data: map[string]any{"role": c.role}})
	log.Printf("Session %s: %s joined (peers: %d)", s.id, c.role, len(s.clients))
}

func (s *Session) leave(c *Client) {
	s.mu.Lock()
	delete(s.clients, c)
	s.mu.Unlock()
	close(c.send)
	s.broadcast(nil, Message{Type: "peer_left", Session: s.id, Data: map[string]any{"role": c.role}})
	log.Printf("Session %s: %s left (peers: %d)", s.id, c.role, len(s.clients))
}

// Broadcast to all peers except sender
func (s *Session) broadcast(sender *Client, msg Message) {
	data, _ := json.Marshal(msg)
	s.mu.RLock()
	defer s.mu.RUnlock()
	for c := range s.clients {
		if c == sender {
			continue
		}
		select {
		case c.send <- data:
		default:
			// Slow client — skip
		}
	}
}

// ── Message types ─────────────────────────────────────────────────────────────

type Message struct {
	Type    string         `json:"type"`
	Session string         `json:"session"`
	Data    map[string]any `json:"data,omitempty"`
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // handled via CORS headers
	},
}

var hub = newHub()

func wsHandler(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	role      := r.URL.Query().Get("role") // "desktop" or "mobile"
	if sessionID == "" {
		http.Error(w, "session required", http.StatusBadRequest)
		return
	}
	if role != "desktop" && role != "mobile" {
		role = "mobile"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}

	client := &Client{
		conn:      conn,
		send:      make(chan []byte, 256),
		role:      role,
		sessionID: sessionID,
	}

	session := hub.getOrCreate(sessionID)
	session.join(client)

	// Confirm connection
	welcome, _ := json.Marshal(Message{
		Type:    "connected",
		Session: sessionID,
		Data:    map[string]any{"role": role, "peers": len(session.clients) - 1},
	})
	conn.WriteMessage(websocket.TextMessage, welcome)

	// Writer goroutine
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer func() { ticker.Stop(); conn.Close() }()
		for {
			select {
			case msg, ok := <-client.send:
				if !ok {
					conn.WriteMessage(websocket.CloseMessage, nil)
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-ticker.C:
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// Reader goroutine (current goroutine)
	defer session.leave(client)
	conn.SetReadLimit(64 * 1024)
	conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))

		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		msg.Session = sessionID
		// Broadcast to all other peers in session
		session.broadcast(client, msg)
	}
}

// ── REST endpoints ────────────────────────────────────────────────────────────

func sessionInfoHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("session")
	if id == "" {
		http.Error(w, "session required", http.StatusBadRequest)
		return
	}
	hub.mu.RLock()
	s, ok := hub.sessions[id]
	hub.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if !ok {
		json.NewEncoder(w).Encode(map[string]any{"exists": false})
		return
	}
	s.mu.RLock()
	count := len(s.clients)
	s.mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]any{
		"exists":  true,
		"session": id,
		"peers":   count,
		"created": s.created.Format(time.RFC3339),
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	hub.mu.RLock()
	sessions := len(hub.sessions)
	hub.mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]any{
		"status":   "ok",
		"service":  "lottery-relay",
		"sessions": sessions,
		"time":     time.Now().Format(time.RFC3339),
	})
}

// ── CORS middleware ───────────────────────────────────────────────────────────

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigins)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws",      wsHandler)
	mux.HandleFunc("/session", sessionInfoHandler)
	mux.HandleFunc("/health",  healthHandler)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Lottery Mobile Relay — connect via /ws?session=XXXX&role=desktop|mobile")
	})

	addr := ":" + port
	log.Printf("Lottery Relay Server listening on %s", addr)
	log.Printf("WebSocket: ws://host%s/ws?session=SESSION_ID&role=desktop|mobile", addr)
	log.Printf("Health:    http://host%s/health", addr)

	if err := http.ListenAndServe(addr, cors(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
