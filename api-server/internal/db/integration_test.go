//go:build integration
// +build integration

// Integration tests for PostgreSQL connectivity, schema, and sync behavior.
// Build tag 'integration' prevents these from running with `go test ./...`.
// Run with: go test -tags integration ./internal/db/ -v
//
// Requires: TEST_DATABASE_URL environment variable pointing to an isolated
// test PostgreSQL database (NEVER production).
//
// Example setup:
//   createdb lottery_test_integration
//   export TEST_DATABASE_URL="postgres://postgres:@localhost:5432/lottery_test_integration"
//   go test -tags integration ./internal/db/ -v

package db

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testDB(t *testing.T) (*pgxpool.Pool, func()) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping integration test")
	}
	pool, err := Connect(context.Background(), dsn)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	cleanup := func() {
		// Drop all test tables to leave DB clean
		pool.Exec(context.Background(), `
			DROP TABLE IF EXISTS sync_log, agents, invoices, invoice_items,
			inventory_batches, payments, ticket_returns, daily_collections,
			lottery_results, commission_schemes, suppliers, purchase_invoices,
			purchase_invoice_items, purchase_payments, supplier_returns,
			workers, worker_salaries, petty_cash_transactions, petty_cash_closings,
			lottery_games, company_settings, devices, app_config, revoked_tokens CASCADE
		`)
		pool.Close()
	}
	return pool, cleanup
}

// TestConnectivity verifies basic PostgreSQL connection.
func TestConnectivity(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	var one int
	err := pool.QueryRow(context.Background(), "SELECT 1").Scan(&one)
	if err != nil || one != 1 {
		t.Fatalf("basic query failed: %v", err)
	}
}

// TestSchemaInitialization verifies RunMigrations creates all expected tables.
func TestSchemaInitialization(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}
	// Verify key tables exist
	tables := []string{"agents", "invoices", "inventory_batches", "payments",
		"ticket_returns", "lottery_results", "devices", "app_config", "sync_log"}
	for _, tbl := range tables {
		var exists bool
		err := pool.QueryRow(context.Background(),
			`SELECT EXISTS(SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name=$1)`, tbl).Scan(&exists)
		if err != nil || !exists {
			t.Errorf("table %q missing after migrations (err=%v)", tbl, err)
		}
	}
}

// TestIdempotentUpsert verifies ON CONFLICT DO UPDATE is safe to run multiple times.
func TestIdempotentUpsert(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	// First insert
	_, err := pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit)
		 VALUES (99001, 'Integration Test Agent', 5000)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, synced_at=NOW()`)
	if err != nil {
		t.Fatalf("first upsert failed: %v", err)
	}
	// Second insert — must succeed (idempotent)
	_, err = pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit)
		 VALUES (99001, 'Integration Test Agent Updated', 5000)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, synced_at=NOW()`)
	if err != nil {
		t.Fatalf("second upsert failed: %v", err)
	}
	var name string
	pool.QueryRow(ctx, "SELECT name FROM agents WHERE id=99001").Scan(&name)
	if name != "Integration Test Agent Updated" {
		t.Errorf("expected updated name, got %q", name)
	}
}

// TestLotteryResultCompositeKey verifies UNIQUE(game_slug, draw_date) upsert.
func TestLotteryResultCompositeKey(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		_, err := pool.Exec(ctx,
			`INSERT INTO lottery_results
			   (id, game_slug, game_name, board, draw_date, winning_numbers)
			 VALUES ($1, 'mega-power', 'Mega Power', 'NLB', '2026-01-01', '["1","2","3"]')
			 ON CONFLICT (game_slug, draw_date) DO UPDATE
			   SET winning_numbers=EXCLUDED.winning_numbers, synced_at=NOW()`,
			99000+i)
		if err != nil {
			t.Fatalf("upsert %d failed: %v", i, err)
		}
	}
	var count int
	pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM lottery_results WHERE game_slug='mega-power'").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 row, got %d (composite key not working)", count)
	}
}
