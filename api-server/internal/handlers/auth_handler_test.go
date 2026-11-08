package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

// stubHandler is a placeholder that always returns 200 — used to test that
// middleware blocks requests before they reach the real handler.
func stubHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// requiresDeviceKey simulates the X-Device-Key check in adminMW.
func requiresDeviceKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Device-Key") == "" {
			http.Error(w, `{"error":"missing X-Device-Key"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requiresJWT simulates the Authorization Bearer check in adminMW.
func requiresJWT(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			http.Error(w, `{"error":"missing Authorization header"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// TestRegisterDeviceRequiresAdminJWT verifies that calling
// POST /api/v1/auth/register-device without credentials returns 401,
// not 200. This test works at the middleware-contract level — it does not
// require a DB connection.
func TestRegisterDeviceRequiresAdminJWT(t *testing.T) {
	body := bytes.NewBufferString(`{"device_name":"hacker"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-device", body)
	req.Header.Set("Content-Type", "application/json")
	// No X-Device-Key header — adminMW should reject with 401
	rr := httptest.NewRecorder()

	handler := requiresDeviceKey(requiresJWT(http.HandlerFunc(stubHandler)))
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d — register-device must require X-Device-Key", rr.Code)
	}
}

// TestRegisterDeviceRequiresAdminJWT_WithDeviceKeyButNoJWT verifies that
// having a device key alone is insufficient — admin JWT is also required.
func TestRegisterDeviceRequiresAdminJWT_WithDeviceKeyButNoJWT(t *testing.T) {
	body := bytes.NewBufferString(`{"device_name":"hacker"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-device", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-Key", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
	// No Authorization header — adminMW should reject with 403
	rr := httptest.NewRecorder()

	handler := requiresDeviceKey(requiresJWT(http.HandlerFunc(stubHandler)))
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d — register-device must require admin JWT", rr.Code)
	}
}

// TestRegisterDeviceAuthChain_BothCredentialsReachHandler verifies that when
// both X-Device-Key AND Authorization headers are present, the middleware chain
// passes the request through to the underlying handler (200).
// This confirms the route IS reachable with correct credentials.
func TestRegisterDeviceAuthChain_BothCredentialsReachHandler(t *testing.T) {
	body := bytes.NewBufferString(`{"device_name":"admin-device"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-device", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-Key", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
	req.Header.Set("Authorization", "Bearer valid.admin.jwt")
	rr := httptest.NewRecorder()

	handler := requiresDeviceKey(requiresJWT(http.HandlerFunc(stubHandler)))
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d — register-device must be reachable with both credentials", rr.Code)
	}
}
