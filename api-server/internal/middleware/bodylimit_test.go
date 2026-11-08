package middleware

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBodyLimitRejectsOversizedBody(t *testing.T) {
	handler := BodyLimit(10)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil && strings.Contains(err.Error(), "request body too large") {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	big := bytes.NewBufferString(strings.Repeat("x", 100))
	req := httptest.NewRequest(http.MethodPost, "/", big)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413 for body > 10 bytes, got %d", rr.Code)
	}
}

func TestBodyLimitAllowsSmallBody(t *testing.T) {
	handler := BodyLimit(1024)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"x":"y"}`))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for small body, got %d", rr.Code)
	}
}
