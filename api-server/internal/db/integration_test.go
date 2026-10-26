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

// ── AP-04 integration tests ───────────────────────────────────────────────────

// businessTablesForGuard is the exact 20-table allowlist that receives last_queue_id.
var businessTablesForGuard = []string{
	"agents", "invoices", "invoice_items", "inventory_batches", "payments",
	"ticket_returns", "daily_collections", "suppliers", "purchase_invoices",
	"purchase_invoice_items", "purchase_payments", "lottery_games",
	"commission_schemes", "workers", "worker_salaries", "supplier_returns",
	"petty_cash_transactions", "petty_cash_closings", "lottery_results",
	"company_settings",
}

// TestAP04LastQueueIdColumnOnAllBusinessTables verifies that RunMigrations adds
// last_queue_id to every business table in the sync allowlist, on both fresh
// and pre-existing databases.
func TestAP04LastQueueIdColumnOnAllBusinessTables(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}
	ctx := context.Background()
	for _, tbl := range businessTablesForGuard {
		var exists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM information_schema.columns
				WHERE table_schema='public' AND table_name=$1 AND column_name='last_queue_id'
			)`, tbl).Scan(&exists)
		if err != nil {
			t.Errorf("table %q: query error: %v", tbl, err)
			continue
		}
		if !exists {
			t.Errorf("table %q: last_queue_id column missing after RunMigrations", tbl)
		}
	}
}

// TestAP04MigrationIdempotent verifies that running RunMigrations twice does not
// error (ALTER TABLE ADD COLUMN IF NOT EXISTS must be idempotent).
func TestAP04MigrationIdempotent(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatalf("first RunMigrations failed: %v", err)
	}
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatalf("second RunMigrations (idempotency check) failed: %v", err)
	}
}

// TestAP04GuardBlocksStaleUpsert verifies that an older queue event (_queue_id < last_queue_id)
// is silently skipped and does not overwrite a newer value.
func TestAP04GuardBlocksStaleUpsert(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	// Establish row with last_queue_id=200 (simulates a newer event that succeeded)
	_, err := pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit, last_queue_id)
		 VALUES (88001, 'GuardTest Agent', 5000, 200)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, last_queue_id=EXCLUDED.last_queue_id`)
	if err != nil {
		t.Fatalf("setup insert failed: %v", err)
	}

	// Attempt stale upsert: _queue_id=100 < last_queue_id=200 — must be a no-op
	tag, err := pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit, last_queue_id)
		 VALUES (88001, 'STALE NAME', 9999, 100)
		 ON CONFLICT (id) DO UPDATE SET
		   name=EXCLUDED.name, credit_limit=EXCLUDED.credit_limit,
		   last_queue_id=EXCLUDED.last_queue_id
		 WHERE EXCLUDED.last_queue_id >= agents.last_queue_id`)
	if err != nil {
		t.Fatalf("stale upsert failed with error: %v", err)
	}
	if tag.RowsAffected() != 0 {
		t.Errorf("stale upsert should be a no-op (0 rows affected), got %d", tag.RowsAffected())
	}

	// Verify row is unchanged
	var name string
	var qid int64
	pool.QueryRow(ctx, "SELECT name, last_queue_id FROM agents WHERE id=88001").Scan(&name, &qid)
	if name != "GuardTest Agent" {
		t.Errorf("name was overwritten by stale event: got %q", name)
	}
	if qid != 200 {
		t.Errorf("last_queue_id was changed: got %d, want 200", qid)
	}
}

// TestAP04GuardAllowsNewerUpsert verifies that a newer event (_queue_id > last_queue_id)
// is applied and updates last_queue_id.
func TestAP04GuardAllowsNewerUpsert(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit, last_queue_id)
		 VALUES (88002, 'Original', 1000, 100)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, last_queue_id=EXCLUDED.last_queue_id`)
	if err != nil {
		t.Fatalf("setup insert failed: %v", err)
	}

	// Newer event: _queue_id=300 > last_queue_id=100 — must be applied
	_, err = pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit, last_queue_id)
		 VALUES (88002, 'Updated', 2000, 300)
		 ON CONFLICT (id) DO UPDATE SET
		   name=EXCLUDED.name, credit_limit=EXCLUDED.credit_limit,
		   last_queue_id=EXCLUDED.last_queue_id
		 WHERE EXCLUDED.last_queue_id >= agents.last_queue_id`)
	if err != nil {
		t.Fatalf("newer upsert failed: %v", err)
	}

	var name string
	var qid int64
	pool.QueryRow(ctx, "SELECT name, last_queue_id FROM agents WHERE id=88002").Scan(&name, &qid)
	if name != "Updated" {
		t.Errorf("newer event not applied: name=%q", name)
	}
	if qid != 300 {
		t.Errorf("last_queue_id not updated: got %d, want 300", qid)
	}
}

// TestAP04EqualQueueIdIsIdempotent verifies that retrying the same queue ID is safe.
func TestAP04EqualQueueIdIsIdempotent(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	for attempt := 0; attempt < 3; attempt++ {
		_, err := pool.Exec(ctx,
			`INSERT INTO agents (id, name, credit_limit, last_queue_id)
			 VALUES (88003, 'Idempotent', 500, 150)
			 ON CONFLICT (id) DO UPDATE SET
			   name=EXCLUDED.name, last_queue_id=EXCLUDED.last_queue_id
			 WHERE EXCLUDED.last_queue_id >= agents.last_queue_id`)
		if err != nil {
			t.Fatalf("attempt %d failed: %v", attempt, err)
		}
	}

	var qid int64
	pool.QueryRow(ctx, "SELECT last_queue_id FROM agents WHERE id=88003").Scan(&qid)
	if qid != 150 {
		t.Errorf("last_queue_id should be 150, got %d", qid)
	}
}

// TestAP04FullSyncPathUnconditional verifies that a Full Sync upsert (no last_queue_id)
// is unconditional and does not alter existing last_queue_id values.
func TestAP04FullSyncPathUnconditional(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	// Row established by queue drain: last_queue_id=500
	_, err := pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit, last_queue_id)
		 VALUES (88004, 'QueueSet', 3000, 500)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, last_queue_id=EXCLUDED.last_queue_id`)
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	// Full Sync upsert: no last_queue_id in payload → unconditional, last_queue_id unchanged
	_, err = pool.Exec(ctx,
		`INSERT INTO agents (id, name, credit_limit)
		 VALUES (88004, 'FullSyncUpdated', 4000)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, credit_limit=EXCLUDED.credit_limit, synced_at=NOW()`)
	if err != nil {
		t.Fatalf("full sync upsert failed: %v", err)
	}

	var name string
	var qid int64
	pool.QueryRow(ctx, "SELECT name, last_queue_id FROM agents WHERE id=88004").Scan(&name, &qid)
	if name != "FullSyncUpdated" {
		t.Errorf("full sync update not applied: name=%q", name)
	}
	if qid != 500 {
		t.Errorf("full sync must not change last_queue_id: got %d, want 500", qid)
	}
}

// TestAP04CompositeKeyGuard verifies the guard works for lottery_results (composite conflict key).
func TestAP04CompositeKeyGuard(t *testing.T) {
	pool, cleanup := testDB(t)
	defer cleanup()
	if err := RunMigrations(context.Background(), pool); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	// Insert with last_queue_id=100
	_, err := pool.Exec(ctx,
		`INSERT INTO lottery_results (id, game_slug, game_name, board, draw_date, winning_numbers, last_queue_id)
		 VALUES (88010, 'ap04-test', 'AP04 Test', 'NLB', '2099-01-01', '[]', 100)
		 ON CONFLICT (game_slug, draw_date) DO UPDATE
		   SET winning_numbers=EXCLUDED.winning_numbers, last_queue_id=EXCLUDED.last_queue_id`)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}

	// Stale upsert: _queue_id=50 < 100
	tag, err := pool.Exec(ctx,
		`INSERT INTO lottery_results (id, game_slug, game_name, board, draw_date, winning_numbers, last_queue_id)
		 VALUES (88010, 'ap04-test', 'AP04 Test', 'NLB', '2099-01-01', '["STALE"]', 50)
		 ON CONFLICT (game_slug, draw_date) DO UPDATE
		   SET winning_numbers=EXCLUDED.winning_numbers, last_queue_id=EXCLUDED.last_queue_id
		 WHERE EXCLUDED.last_queue_id >= lottery_results.last_queue_id`)
	if err != nil {
		t.Fatalf("stale upsert error: %v", err)
	}
	if tag.RowsAffected() != 0 {
		t.Errorf("stale composite-key upsert should be no-op, got %d rows affected", tag.RowsAffected())
	}

	var wn string
	pool.QueryRow(ctx, "SELECT winning_numbers FROM lottery_results WHERE game_slug='ap04-test'").Scan(&wn)
	if wn != "[]" {
		t.Errorf("stale write overwrote composite-key row: winning_numbers=%q", wn)
	}
}
