package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/Victor-dev-03-cmd/lottery-api/internal/auth"
)

// ── Rate limiter (in-memory, single-instance) ──────────────────────────────────

type rateLimiter struct {
	mu       sync.Mutex
	attempts map[string]*attempt
}

type attempt struct {
	count    int
	lockedAt time.Time
}

var authLimiter = &rateLimiter{attempts: make(map[string]*attempt)}

const (
	maxAttempts  = 5
	lockDuration = 15 * time.Minute
)

func (rl *rateLimiter) check(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	a := rl.attempts[ip]
	if a == nil {
		rl.attempts[ip] = &attempt{count: 1}
		return true
	}
	if !a.lockedAt.IsZero() {
		if time.Since(a.lockedAt) > lockDuration {
			delete(rl.attempts, ip)
			rl.attempts[ip] = &attempt{count: 1}
			return true
		}
		return false
	}
	a.count++
	if a.count > maxAttempts {
		a.lockedAt = time.Now()
		return false
	}
	return true
}

func (rl *rateLimiter) reset(ip string) {
	rl.mu.Lock()
	delete(rl.attempts, ip)
	rl.mu.Unlock()
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

type bootstrapReq struct {
	BootstrapToken string `json:"bootstrap_token"`
	DeviceName     string `json:"device_name"`
	PIN            string `json:"pin"`
}

func Bootstrap(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !authLimiter.check(clientIP(r)) {
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req bootstrapReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.DeviceName == "" || req.PIN == "" || req.BootstrapToken == "" {
			writeError(w, "device_name, pin, and bootstrap_token are required", http.StatusBadRequest)
			return
		}

		// Check bootstrap token against stored value
		ok, err := checkBootstrapToken(r.Context(), svc, req.BootstrapToken)
		if err != nil || !ok {
			writeError(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Check not already bootstrapped
		done, err := svc.IsBootstrapped(r.Context())
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		if done {
			writeError(w, "already bootstrapped", http.StatusForbidden)
			return
		}

		// Hash PIN and store
		pinHash, err := auth.HashPIN(req.PIN)
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		if err := svc.SetBootstrapped(r.Context(), pinHash); err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}

		// Register the first device
		rawKey, keyHash, err := auth.GenerateDeviceKey()
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		if err := svc.RegisterDevice(r.Context(), req.DeviceName, keyHash); err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}

		authLimiter.reset(clientIP(r))
		writeJSON(w, map[string]string{"device_key": rawKey}, http.StatusOK)
	}
}

// ── Admin token ────────────────────────────────────────────────────────────────

type adminTokenReq struct {
	DeviceKey string `json:"device_key"`
	PIN       string `json:"pin"`
}

func AdminToken(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !authLimiter.check(clientIP(r)) {
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req adminTokenReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// Validate device key first
		if _, err := svc.ValidateDeviceKey(r.Context(), req.DeviceKey); err != nil {
			// Generic error — don't reveal which credential was wrong
			writeError(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Validate PIN
		ok, err := svc.VerifyAdminPIN(r.Context(), req.PIN)
		if err != nil || !ok {
			writeError(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		token, err := svc.IssueAdminToken(r.Context())
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}

		authLimiter.reset(clientIP(r))
		writeJSON(w, map[string]any{
			"token":      token,
			"expires_in": 3600,
		}, http.StatusOK)
	}
}

// ── Register device ────────────────────────────────────────────────────────────

type registerDeviceReq struct {
	DeviceName string `json:"device_name"`
}

func RegisterDevice(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Admin JWT required for additional device registration
		var req registerDeviceReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.DeviceName == "" {
			writeError(w, "device_name required", http.StatusBadRequest)
			return
		}

		rawKey, keyHash, err := auth.GenerateDeviceKey()
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		if err := svc.RegisterDevice(r.Context(), req.DeviceName, keyHash); err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"device_key": rawKey}, http.StatusOK)
	}
}

// ── Key rotation ───────────────────────────────────────────────────────────────

func RotateKey(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct{ DeviceKey string `json:"device_key"` }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		hash, err := auth.DeviceKeyHash(req.DeviceKey)
		if err != nil {
			writeError(w, "invalid device key", http.StatusBadRequest)
			return
		}
		rawKey, newHash, err := auth.GenerateDeviceKey()
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		_, err = svc.Pool().Exec(r.Context(),
			`UPDATE devices SET key_hash = $1 WHERE key_hash = $2 AND is_revoked = FALSE`,
			newHash, hash,
		)
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"new_device_key": rawKey}, http.StatusOK)
	}
}

// checkBootstrapToken validates the provided token against the value stored in
// app_config by main.go at startup. Uses constant-time comparison.
func checkBootstrapToken(ctx context.Context, svc *auth.Service, token string) (bool, error) {
	return svc.CheckBootstrapToken(ctx, token)
}
