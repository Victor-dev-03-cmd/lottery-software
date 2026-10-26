// Package middleware provides HTTP middleware for logging, device auth, and admin auth.
package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Victor-dev-03-cmd/lottery-api/internal/auth"
)

type contextKey string

const DeviceIDKey contextKey = "device_id"

// RequestLogger logs method, path, status, and duration.
// Credentials are never logged.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rw, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rw.status, time.Since(start))
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// DeviceAuth returns a middleware that validates X-Device-Key header.
func DeviceAuth(svc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-Device-Key")
			if key == "" {
				http.Error(w, `{"error":"missing X-Device-Key"}`, http.StatusUnauthorized)
				return
			}
			deviceID, err := svc.ValidateDeviceKey(r.Context(), key)
			if err != nil {
				// Generic message — do not reveal whether key exists
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), DeviceIDKey, deviceID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// AdminAuth returns a middleware that validates Authorization: Bearer <jwt>.
// Requires device key ALSO to be present (belt-and-suspenders for admin ops).
func AdminAuth(svc *auth.Service) func(http.Handler) http.Handler {
	devMW := DeviceAuth(svc)
	return func(next http.Handler) http.Handler {
		return devMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bearer := r.Header.Get("Authorization")
			if !strings.HasPrefix(bearer, "Bearer ") {
				http.Error(w, `{"error":"missing Authorization header"}`, http.StatusForbidden)
				return
			}
			token := strings.TrimPrefix(bearer, "Bearer ")
			if err := svc.ValidateAdminToken(r.Context(), token); err != nil {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}
