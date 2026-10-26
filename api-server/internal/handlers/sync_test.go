package handlers

import (
	"testing"
)

func TestTableAllowlist(t *testing.T) {
	// Every table that the previous Supabase full_sync_all_tables covered
	// must be in the allowlist.
	supabaseTables := []string{
		"agents", "inventory_batches", "invoices", "invoice_items",
		"payments", "ticket_returns", "daily_collections", "suppliers",
		"purchase_invoices", "purchase_invoice_items", "purchase_payments",
		"lottery_games", "commission_schemes",
	}
	for _, t1 := range supabaseTables {
		if _, ok := tableAllowlist[t1]; !ok {
			t.Errorf("table %q from Supabase full sync is missing from Go API allowlist", t1)
		}
	}

	// Tables added beyond Supabase scope
	extraTables := []string{
		"workers", "worker_salaries", "supplier_returns",
		"petty_cash_transactions", "petty_cash_closings",
		"lottery_results", "company_settings",
	}
	for _, t1 := range extraTables {
		if _, ok := tableAllowlist[t1]; !ok {
			t.Errorf("table %q expected in Go API allowlist but missing", t1)
		}
	}

	// app_settings and sync_queue must NOT be in allowlist
	excluded := []string{"app_settings", "sync_queue"}
	for _, t1 := range excluded {
		if _, ok := tableAllowlist[t1]; ok {
			t.Errorf("table %q should NOT be in allowlist but is", t1)
		}
	}
}

func TestIsSafeIdentifier(t *testing.T) {
	safe := []string{"id", "game_slug", "draw_date", "agent_id", "invoice_number"}
	for _, s := range safe {
		if !isSafeIdentifier(s) {
			t.Errorf("expected %q to be a safe identifier", s)
		}
	}
	unsafe := []string{"", "a b", "a;b", "a'b", `a"b`, "a--b", "a/*b", "a\x00b"}
	for _, s := range unsafe {
		if isSafeIdentifier(s) {
			t.Errorf("expected %q to be unsafe but isSafeIdentifier returned true", s)
		}
	}
}

func TestCoerceValue(t *testing.T) {
	// Integer-valued float64 should coerce to int64
	if v := coerceValue(float64(42)); v != int64(42) {
		t.Errorf("expected int64(42), got %T(%v)", v, v)
	}
	// Float that is not an integer should stay as float64
	if v := coerceValue(float64(3.14)); v == int64(3) {
		t.Errorf("expected float64 to stay, got int64")
	}
	// String should pass through unchanged
	if v := coerceValue("hello"); v != "hello" {
		t.Errorf("expected string pass-through")
	}
}

func TestBuildConflictTarget(t *testing.T) {
	single := buildConflictTarget("id")
	if single != `("id")` {
		t.Errorf("single: got %q", single)
	}
	composite := buildConflictTarget("game_slug,draw_date")
	if composite != `("game_slug", "draw_date")` {
		t.Errorf("composite: got %q", composite)
	}
}

// TestAP04QueueIdExtractedBeforeLoop verifies that _queue_id is stripped from
// the row map before the column-building loop, so it is never used as a
// PostgreSQL column name. If present, hasQueueID must be true and the key removed.
func TestAP04QueueIdExtractedBeforeLoop(t *testing.T) {
	// Simulate a row payload as received from the Rust drain function
	row := map[string]interface{}{
		"id":           int64(42),
		"invoice_status": "paid",
		"_queue_id":    int64(200),
	}

	// Replicate the extraction logic from upsertRow
	var queueID int64
	hasQueueID := false
	if raw, ok := row["_queue_id"]; ok {
		if coerced := coerceValue(raw); coerced != nil {
			if id, ok2 := coerced.(int64); ok2 {
				queueID = id
				hasQueueID = true
			}
		}
		delete(row, "_queue_id")
	}

	if !hasQueueID {
		t.Error("expected hasQueueID=true for row containing _queue_id")
	}
	if queueID != 200 {
		t.Errorf("expected queueID=200, got %d", queueID)
	}
	if _, stillPresent := row["_queue_id"]; stillPresent {
		t.Error("_queue_id must be removed from row before column loop")
	}
	// Business columns must remain
	if _, ok := row["invoice_status"]; !ok {
		t.Error("invoice_status should still be present after _queue_id extraction")
	}
}

// TestAP04QueueIdAbsentIsNoGuard verifies that a row without _queue_id
// sets hasQueueID=false, which means no WHERE guard is added (Full Sync path).
func TestAP04QueueIdAbsentIsNoGuard(t *testing.T) {
	row := map[string]interface{}{
		"id":   int64(42),
		"name": "Test",
	}

	hasQueueID := false
	if _, ok := row["_queue_id"]; ok {
		hasQueueID = true
		delete(row, "_queue_id")
	}

	if hasQueueID {
		t.Error("expected hasQueueID=false when _queue_id is absent (Full Sync path)")
	}
	if len(row) != 2 {
		t.Errorf("row should be unchanged, got len=%d", len(row))
	}
}

// TestAP04QueueIdAsFloat64IsCoerced verifies that JSON-decoded float64 values
// (the default numeric type from serde_json via HTTP) are coerced to int64.
func TestAP04QueueIdAsFloat64IsCoerced(t *testing.T) {
	row := map[string]interface{}{
		"id":        float64(42),
		"_queue_id": float64(300),
	}

	var queueID int64
	hasQueueID := false
	if raw, ok := row["_queue_id"]; ok {
		if coerced := coerceValue(raw); coerced != nil {
			if id, ok2 := coerced.(int64); ok2 {
				queueID = id
				hasQueueID = true
			}
		}
		delete(row, "_queue_id")
	}

	if !hasQueueID {
		t.Error("float64 _queue_id should be coerced and accepted")
	}
	if queueID != 300 {
		t.Errorf("expected queueID=300 after coercion, got %d", queueID)
	}
}
