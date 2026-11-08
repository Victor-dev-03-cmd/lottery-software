package handlers

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
	"unsafe"
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

// TestRateLimiterStaleNonLockedEntriesEvicted verifies that entries with 1–4
// failed attempts (never locked) are evicted after staleTTL elapses. This
// bounds memory under a low-volume probing attack from many unique IPs.
func TestRateLimiterStaleNonLockedEntriesEvicted(t *testing.T) {
	rl := &rateLimiter{attempts: make(map[string]*attempt)}

	// Simulate 200 unique IPs each making 3 attempts (below maxAttempts=5).
	for i := 0; i < 200; i++ {
		ip := fmt.Sprintf("192.168.%d.%d", i/256, i%256)
		for j := 0; j < 3; j++ {
			rl.check(ip)
		}
	}
	rl.mu.Lock()
	before := len(rl.attempts)
	rl.mu.Unlock()
	if before != 200 {
		t.Fatalf("expected 200 entries before cleanup, got %d", before)
	}

	// Back-date lastSeen to simulate staleTTL elapsed.
	rl.mu.Lock()
	stale := time.Now().Add(-(staleTTL + time.Minute))
	for _, a := range rl.attempts {
		a.lastSeen = stale
	}
	rl.mu.Unlock()

	rl.cleanup()

	rl.mu.Lock()
	after := len(rl.attempts)
	rl.mu.Unlock()

	if after != 0 {
		t.Errorf("expected 0 stale entries after cleanup, got %d", after)
	}
}

// TestRateLimiterActiveLockNotEvictedByStale verifies that an active (still
// within lockDuration) locked entry is NOT evicted by the stale-entry path,
// even if its lastSeen is old.
func TestRateLimiterActiveLockNotEvictedByStale(t *testing.T) {
	rl := &rateLimiter{attempts: make(map[string]*attempt)}

	// Create a locked entry with an old lastSeen — lock is still active.
	rl.mu.Lock()
	rl.attempts["locked-ip"] = &attempt{
		count:    maxAttempts + 1,
		lockedAt: time.Now(),                               // locked just now
		lastSeen: time.Now().Add(-(staleTTL + time.Minute)), // lastSeen is stale
	}
	rl.mu.Unlock()

	rl.cleanup()

	rl.mu.Lock()
	_, exists := rl.attempts["locked-ip"]
	rl.mu.Unlock()

	if !exists {
		t.Error("active lock must not be evicted by the stale-entry path")
	}
}

// TestRateLimiterMemoryBoundedUnderManyUniqueIPs verifies that the map size
// stabilises after cleanup once entries age past staleTTL, demonstrating that
// memory is bounded even with continuous unique-IP probing.
func TestRateLimiterMemoryBoundedUnderManyUniqueIPs(t *testing.T) {
	rl := &rateLimiter{attempts: make(map[string]*attempt)}

	// Round 1: add 100 unique IPs with 2 attempts each (below lock threshold).
	for i := 0; i < 100; i++ {
		ip := fmt.Sprintf("10.1.%d.%d", i/256, i%256)
		rl.check(ip)
		rl.check(ip)
	}

	// Back-date all entries past staleTTL.
	rl.mu.Lock()
	stale := time.Now().Add(-(staleTTL + time.Minute))
	for _, a := range rl.attempts {
		a.lastSeen = stale
	}
	rl.mu.Unlock()

	// Round 2: add 50 NEW unique IPs — these have fresh lastSeen.
	for i := 100; i < 150; i++ {
		ip := fmt.Sprintf("10.1.%d.%d", i/256, i%256)
		rl.check(ip)
	}

	// Force cleanup.
	rl.cleanup()

	rl.mu.Lock()
	count := len(rl.attempts)
	rl.mu.Unlock()

	// Only the 50 fresh entries should remain; the 100 stale ones are gone.
	if count != 50 {
		t.Errorf("expected 50 entries after cleanup (stale evicted), got %d", count)
	}
}

// TestAttemptStructHasLastSeen is a compile-time size check confirming the
// lastSeen field was actually added to the attempt struct.
func TestAttemptStructHasLastSeen(t *testing.T) {
	var a attempt
	// time.Time is 24 bytes; attempt should be at least count(8) + lockedAt(24) + lastSeen(24) = 56 bytes.
	if sz := unsafe.Sizeof(a); sz < 56 {
		t.Errorf("attempt struct size %d < 56: lastSeen field may be missing", sz)
	}
}
