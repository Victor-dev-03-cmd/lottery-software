package handlers

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestClientIPNoTrustedProxy verifies that when TRUSTED_PROXY is not set,
// X-Forwarded-For is ignored and RemoteAddr (without port) is returned.
func TestClientIPNoTrustedProxy(t *testing.T) {
	// Ensure TRUSTED_PROXY is empty — XFF must be ignored.
	t.Setenv("TRUSTED_PROXY", "")

	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "203.0.113.1:54321"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")

	ip := clientIP(req)
	if ip == "1.2.3.4" {
		t.Error("clientIP must not return X-Forwarded-For value when TRUSTED_PROXY is unset — this allows rate-limit bypass")
	}
	if ip != "203.0.113.1" {
		t.Errorf("expected 203.0.113.1 (RemoteAddr without port), got %q", ip)
	}
}

// TestClientIPTrustedProxyFromTrustedSource verifies that when TRUSTED_PROXY
// is set and the request originates from that proxy IP, the leftmost XFF IP
// is returned as the real client address.
func TestClientIPTrustedProxyFromTrustedSource(t *testing.T) {
	t.Setenv("TRUSTED_PROXY", "10.0.0.1")

	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")

	ip := clientIP(req)
	if ip != "1.2.3.4" {
		t.Errorf("expected XFF value 1.2.3.4 from trusted proxy, got %q", ip)
	}
}

// TestClientIPTrustedProxyFromUntrustedSource verifies that when TRUSTED_PROXY
// is configured but the request comes from a different host, XFF is ignored
// and RemoteAddr is used instead.
func TestClientIPTrustedProxyFromUntrustedSource(t *testing.T) {
	t.Setenv("TRUSTED_PROXY", "10.0.0.1")

	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "203.0.113.99:54321" // NOT the trusted proxy
	req.Header.Set("X-Forwarded-For", "1.2.3.4")

	ip := clientIP(req)
	if ip != "203.0.113.99" {
		t.Errorf("expected RemoteAddr 203.0.113.99 (XFF must be ignored for untrusted source), got %q", ip)
	}
}

// TestClientIPSpoofedXFFLeftmost verifies that when an XFF header contains
// multiple IPs (e.g. an attacker pre-injected one), only the leftmost IP is
// used. When going through a real trusted proxy the leftmost entry is the real
// client IP set by the proxy — it is not attacker-controllable.
func TestClientIPSpoofedXFFLeftmost(t *testing.T) {
	t.Setenv("TRUSTED_PROXY", "10.0.0.1")

	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	// The real client is "1.2.3.4" (set by our trusted proxy as leftmost).
	// "5.6.7.8" was injected by the attacker in the original request.
	req.Header.Set("X-Forwarded-For", "1.2.3.4, 5.6.7.8")

	ip := clientIP(req)
	if ip != "1.2.3.4" {
		t.Errorf("expected leftmost XFF IP 1.2.3.4, got %q", ip)
	}
	if strings.Contains(ip, "5.6.7.8") {
		t.Error("must not return the attacker-injected rightmost IP")
	}
}

// TestRateLimiterCleanupEvictsExpiredEntries verifies that cleanup() removes
// entries whose lock period has long expired, preventing unbounded memory growth.
func TestRateLimiterCleanupEvictsExpiredEntries(t *testing.T) {
	rl := &rateLimiter{attempts: make(map[string]*attempt)}

	// Insert a locked entry that is already well past lockDuration.
	past := time.Now().Add(-(lockDuration + 5*time.Minute))
	rl.mu.Lock()
	rl.attempts["old-ip"] = &attempt{count: 10, lockedAt: past}
	rl.mu.Unlock()

	rl.cleanup()

	rl.mu.Lock()
	_, exists := rl.attempts["old-ip"]
	rl.mu.Unlock()

	if exists {
		t.Error("cleanup() must remove entries whose lockDuration has passed")
	}
}

// TestRateLimiterCleanupKeepsActiveEntry verifies that a currently-locked
// entry (lock still within its window) is NOT removed by cleanup().
func TestRateLimiterCleanupKeepsActiveEntry(t *testing.T) {
	rl := &rateLimiter{attempts: make(map[string]*attempt)}

	// Entry locked just now — still within lockDuration.
	rl.mu.Lock()
	rl.attempts["active-ip"] = &attempt{count: 10, lockedAt: time.Now()}
	rl.mu.Unlock()

	rl.cleanup()

	rl.mu.Lock()
	_, exists := rl.attempts["active-ip"]
	rl.mu.Unlock()

	if !exists {
		t.Error("cleanup() must not remove entries that are still within their lock window")
	}
}

// TestRateLimiterCleanupConcurrently verifies that concurrent calls to check()
// and cleanup() produce no data race. Run with: go test -race ./...
func TestRateLimiterCleanupConcurrently(t *testing.T) {
	rl := &rateLimiter{attempts: make(map[string]*attempt)}

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			ip := fmt.Sprintf("10.0.0.%d", n%255)
			rl.check(ip)
		}(i)
	}
	// Run cleanup concurrently with all the check() calls.
	go rl.cleanup()
	wg.Wait()
}
