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
