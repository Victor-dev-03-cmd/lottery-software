// Package db provides the PostgreSQL connection pool and schema migrations.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect opens and validates a pgxpool connection.
func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	cfg.MaxConns = 10
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}

// RunMigrations applies all schema DDL idempotently.
// Safe to call on every startup.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, schemaDDL)
	return err
}

// schemaDDL creates all tables used by the API server.
// All primary keys are BIGINT matching SQLite's integer IDs.
// No ON DELETE actions — mirrors SQLite's permissive FK behavior.
const schemaDDL = `
-- ── Infrastructure ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS devices (
	id          BIGSERIAL PRIMARY KEY,
	name        TEXT      NOT NULL,
	key_hash    CHAR(64)  NOT NULL UNIQUE, -- sha256(device_key) hex
	is_revoked  BOOLEAN   NOT NULL DEFAULT FALSE,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_config (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
-- Rows: ('admin_pin_argon2', '$argon2id$...')
--       ('bootstrap_used',   'true')

CREATE TABLE IF NOT EXISTS revoked_tokens (
	jti        UUID PRIMARY KEY,
	revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Business tables (mirrors SQLite schema, BIGINT PKs from SQLite IDs) ──────

CREATE TABLE IF NOT EXISTS company_settings (
	id       BIGINT PRIMARY KEY DEFAULT 1,
	name     TEXT NOT NULL DEFAULT '',
	address  TEXT NOT NULL DEFAULT '',
	phone    TEXT NOT NULL DEFAULT '',
	nlb_reg  TEXT NOT NULL DEFAULT '',
	dlb_reg  TEXT NOT NULL DEFAULT '',
	email    TEXT NOT NULL DEFAULT '',
	synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
	id             BIGINT PRIMARY KEY,
	name           TEXT    NOT NULL,
	nlb_reg        TEXT    NOT NULL DEFAULT '',
	dlb_reg        TEXT    NOT NULL DEFAULT '',
	phone          TEXT    NOT NULL DEFAULT '',
	address        TEXT    NOT NULL DEFAULT '',
	credit_limit   NUMERIC(10,2) NOT NULL DEFAULT 0,
	nic_number     TEXT    NOT NULL DEFAULT '',
	bank_name      TEXT    NOT NULL DEFAULT '',
	bank_account   TEXT    NOT NULL DEFAULT '',
	photo          TEXT    NOT NULL DEFAULT '',
	synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lottery_games (
	id          BIGINT PRIMARY KEY,
	name        TEXT          NOT NULL,
	unit_price  NUMERIC(10,2) NOT NULL DEFAULT 32.50,
	cost_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
	board       TEXT          NOT NULL DEFAULT 'NLB',
	is_enabled  BOOLEAN       NOT NULL DEFAULT TRUE,
	synced_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lottery_games_name ON lottery_games(name);

CREATE TABLE IF NOT EXISTS invoices (
	id                  BIGINT PRIMARY KEY,
	invoice_number      TEXT          NOT NULL,
	agent_id            BIGINT        NOT NULL,
	invoice_date        DATE          NOT NULL,
	prepared_by         TEXT          NOT NULL DEFAULT '',
	invoice_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
	prev_outstanding    NUMERIC(14,2) NOT NULL DEFAULT 0,
	total_payable       NUMERIC(14,2) NOT NULL DEFAULT 0,
	cash_received       NUMERIC(14,2) NOT NULL DEFAULT 0,
	dlb_winning         NUMERIC(14,2) NOT NULL DEFAULT 0,
	nlb_winning         NUMERIC(14,2) NOT NULL DEFAULT 0,
	outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
	invoice_status      TEXT          NOT NULL DEFAULT 'paid',
	delivery_route      TEXT          NOT NULL DEFAULT '',
	sales_rep           TEXT          NOT NULL DEFAULT '',
	discount_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
	created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

-- invoice_items: snapshot-only in Phase 1. Ongoing sync deferred (AP-02 pending).
-- New/edited invoices after migration will have stale or absent items in cloud.
CREATE TABLE IF NOT EXISTS invoice_items (
	id                BIGINT PRIMARY KEY,
	invoice_id        BIGINT        NOT NULL,
	sn                INTEGER,
	ticket_name       TEXT          NOT NULL,
	barcode_start     TEXT          NOT NULL DEFAULT '',
	barcode_end       TEXT          NOT NULL DEFAULT '',
	qty               INTEGER       NOT NULL DEFAULT 0,
	qty_unit          TEXT          NOT NULL DEFAULT 'Tickets',
	unit_price        NUMERIC(10,2) NOT NULL,
	value             NUMERIC(14,2) NOT NULL,
	books_qty         INTEGER       NOT NULL DEFAULT 0,
	tickets_per_book  INTEGER       NOT NULL DEFAULT 0,
	discount_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,
	discount_amt      NUMERIC(14,2) NOT NULL DEFAULT 0,
	net_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
	purchase_batch_id BIGINT,
	synced_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
	id                   BIGINT PRIMARY KEY,
	game_name            TEXT          NOT NULL,
	batch_date           DATE          NOT NULL,
	barcode_start        TEXT          NOT NULL,
	barcode_end          TEXT          NOT NULL,
	total_qty            INTEGER       NOT NULL DEFAULT 0,
	distributed_qty      INTEGER       NOT NULL DEFAULT 0,
	unit_price           NUMERIC(10,2) NOT NULL DEFAULT 32.50,
	low_stock_threshold  INTEGER       NOT NULL DEFAULT 100,
	notes                TEXT          NOT NULL DEFAULT '',
	batch_number         TEXT          NOT NULL DEFAULT '',
	nlb_dlb_category     TEXT          NOT NULL DEFAULT '',
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
	id               BIGINT PRIMARY KEY,
	agent_id         BIGINT        NOT NULL,
	invoice_id       BIGINT,
	payment_date     DATE          NOT NULL,
	payment_type     TEXT          NOT NULL DEFAULT 'cash',
	amount           NUMERIC(14,2) NOT NULL,
	reference        TEXT          NOT NULL DEFAULT '',
	notes            TEXT          NOT NULL DEFAULT '',
	cheque_number    TEXT          NOT NULL DEFAULT '',
	bank_name        TEXT          NOT NULL DEFAULT '',
	clearance_date   DATE,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_returns (
	id                 BIGINT PRIMARY KEY,
	agent_id           BIGINT        NOT NULL,
	invoice_id         BIGINT,
	return_date        DATE          NOT NULL,
	game_name          TEXT          NOT NULL,
	barcode_start      TEXT          NOT NULL DEFAULT '',
	barcode_end        TEXT          NOT NULL DEFAULT '',
	qty                INTEGER       NOT NULL DEFAULT 0,
	unit_price         NUMERIC(10,2) NOT NULL DEFAULT 0,
	total_value        NUMERIC(14,2) NOT NULL DEFAULT 0,
	status             TEXT          NOT NULL DEFAULT 'pending',
	return_reason      TEXT          NOT NULL DEFAULT 'unsold',
	purchase_batch_id  BIGINT,
	notes              TEXT          NOT NULL DEFAULT '',
	created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_collections (
	id               BIGINT PRIMARY KEY,
	collection_date  DATE          NOT NULL,
	collector_name   TEXT          NOT NULL DEFAULT '',
	agent_id         BIGINT        NOT NULL,
	cash_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
	cheque_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
	nlb_winning      NUMERIC(14,2) NOT NULL DEFAULT 0,
	dlb_winning      NUMERIC(14,2) NOT NULL DEFAULT 0,
	route            TEXT          NOT NULL DEFAULT '',
	notes            TEXT          NOT NULL DEFAULT '',
	cheque_number    TEXT          NOT NULL DEFAULT '',
	bank_name        TEXT          NOT NULL DEFAULT '',
	clearance_date   DATE,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lottery_results (
	id               BIGINT PRIMARY KEY,
	game_slug        TEXT          NOT NULL,
	game_name        TEXT          NOT NULL,
	board            TEXT          NOT NULL DEFAULT 'NLB',
	draw_number      TEXT          NOT NULL DEFAULT '',
	draw_date        DATE          NOT NULL,
	winning_letter   TEXT          NOT NULL DEFAULT '',
	winning_numbers  JSONB         NOT NULL DEFAULT '[]',
	super_number     TEXT          NOT NULL DEFAULT '',
	prizes           JSONB         NOT NULL DEFAULT '[]',
	source           TEXT          NOT NULL DEFAULT 'manual',
	saved_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lr_slug_date ON lottery_results(game_slug, draw_date);

CREATE TABLE IF NOT EXISTS commission_schemes (
	id               BIGINT PRIMARY KEY,
	agent_id         BIGINT,
	scheme_name      TEXT          NOT NULL,
	commission_type  TEXT          NOT NULL DEFAULT 'percentage',
	rate             NUMERIC(8,4)  NOT NULL DEFAULT 5.0,
	effective_from   DATE          NOT NULL,
	effective_to     DATE,
	is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
	notes            TEXT          NOT NULL DEFAULT '',
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
	id            BIGINT PRIMARY KEY DEFAULT 1,
	name          TEXT NOT NULL DEFAULT 'Nimalsiri Enterprises',
	contact_name  TEXT NOT NULL DEFAULT '',
	phone         TEXT NOT NULL DEFAULT '',
	address       TEXT NOT NULL DEFAULT '',
	notes         TEXT NOT NULL DEFAULT '',
	synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
	id                   BIGINT PRIMARY KEY,
	purchase_number      TEXT          NOT NULL,
	supplier_name        TEXT          NOT NULL DEFAULT 'Nimalsiri Enterprises',
	purchase_date        DATE          NOT NULL,
	stock_date           DATE          NOT NULL,
	invoice_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
	initial_payment      NUMERIC(14,2) NOT NULL DEFAULT 0,
	outstanding_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
	status               TEXT          NOT NULL DEFAULT 'pending',
	notes                TEXT          NOT NULL DEFAULT '',
	supplier_ref         TEXT          NOT NULL DEFAULT '',
	tax_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
	handling_charge      NUMERIC(14,2) NOT NULL DEFAULT 0,
	warehouse_location   TEXT          NOT NULL DEFAULT '',
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_number ON purchase_invoices(purchase_number);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
	id               BIGINT PRIMARY KEY,
	purchase_id      BIGINT        NOT NULL,
	game_name        TEXT          NOT NULL,
	barcode_start    TEXT          NOT NULL DEFAULT '',
	barcode_end      TEXT          NOT NULL DEFAULT '',
	qty              INTEGER       NOT NULL DEFAULT 0,
	unit_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
	value            NUMERIC(14,2) NOT NULL DEFAULT 0,
	batch_number     TEXT          NOT NULL DEFAULT '',
	books_qty        INTEGER       NOT NULL DEFAULT 0,
	tickets_per_book INTEGER       NOT NULL DEFAULT 100,
	draw_number      TEXT          NOT NULL DEFAULT '',
	draw_date        DATE,
	synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_payments (
	id            BIGINT PRIMARY KEY,
	purchase_id   BIGINT        NOT NULL,
	payment_date  DATE          NOT NULL,
	payment_type  TEXT          NOT NULL DEFAULT 'cash',
	amount        NUMERIC(14,2) NOT NULL,
	reference     TEXT          NOT NULL DEFAULT '',
	notes         TEXT          NOT NULL DEFAULT '',
	created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_returns (
	id              BIGINT PRIMARY KEY,
	purchase_id     BIGINT,
	return_date     DATE          NOT NULL,
	game_name       TEXT          NOT NULL,
	barcode_start   TEXT          NOT NULL DEFAULT '',
	barcode_end     TEXT          NOT NULL DEFAULT '',
	qty             INTEGER       NOT NULL DEFAULT 0,
	unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
	total_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
	return_reason   TEXT          NOT NULL DEFAULT 'unsold',
	status          TEXT          NOT NULL DEFAULT 'pending',
	notes           TEXT          NOT NULL DEFAULT '',
	created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workers (
	id                    BIGINT PRIMARY KEY,
	name                  TEXT          NOT NULL,
	role                  TEXT          NOT NULL DEFAULT 'Cashier',
	basic_salary          NUMERIC(10,2) NOT NULL DEFAULT 0,
	bank_name             TEXT          NOT NULL DEFAULT '',
	bank_account          TEXT          NOT NULL DEFAULT '',
	nic_number            TEXT          NOT NULL DEFAULT '',
	photo                 TEXT          NOT NULL DEFAULT '',
	work_start_date       DATE,
	work_end_date         DATE,
	transport_allowance   NUMERIC(10,2) NOT NULL DEFAULT 0,
	meal_allowance        NUMERIC(10,2) NOT NULL DEFAULT 0,
	other_allowances      NUMERIC(10,2) NOT NULL DEFAULT 0,
	is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
	notes                 TEXT          NOT NULL DEFAULT '',
	salary_type           TEXT          NOT NULL DEFAULT 'monthly',
	daily_rate            NUMERIC(10,2) NOT NULL DEFAULT 0,
	created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_salaries (
	id                    BIGINT PRIMARY KEY,
	worker_id             BIGINT        NOT NULL,
	month                 TEXT          NOT NULL, -- 'YYYY-MM'
	basic_salary          NUMERIC(10,2) NOT NULL DEFAULT 0,
	transport_allowance   NUMERIC(10,2) NOT NULL DEFAULT 0,
	meal_allowance        NUMERIC(10,2) NOT NULL DEFAULT 0,
	overtime_pay          NUMERIC(10,2) NOT NULL DEFAULT 0,
	other_allowances      NUMERIC(10,2) NOT NULL DEFAULT 0,
	total_earnings        NUMERIC(10,2) NOT NULL DEFAULT 0,
	deductions            NUMERIC(10,2) NOT NULL DEFAULT 0,
	advance_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,
	net_salary            NUMERIC(10,2) NOT NULL DEFAULT 0,
	status                TEXT          NOT NULL DEFAULT 'pending',
	paid_date             DATE,
	notes                 TEXT          NOT NULL DEFAULT '',
	salary_type           TEXT          NOT NULL DEFAULT 'monthly',
	days_worked           INTEGER       NOT NULL DEFAULT 0,
	daily_rate            NUMERIC(10,2) NOT NULL DEFAULT 0,
	created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_worker_month ON worker_salaries(worker_id, month);

CREATE TABLE IF NOT EXISTS petty_cash_transactions (
	id          BIGINT PRIMARY KEY,
	date        DATE          NOT NULL,
	category    TEXT          NOT NULL,
	amount      NUMERIC(10,2) NOT NULL,
	reason      TEXT          NOT NULL DEFAULT '',
	created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS petty_cash_closings (
	id               BIGINT PRIMARY KEY,
	date             DATE          NOT NULL,
	opening_balance  NUMERIC(10,2) NOT NULL DEFAULT 0,
	actual_cash      NUMERIC(10,2) NOT NULL DEFAULT 0,
	notes            TEXT          NOT NULL DEFAULT '',
	is_closed        BOOLEAN       NOT NULL DEFAULT FALSE,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcc_date ON petty_cash_closings(date);

-- ── Sync tracking ─────────────────────────────────────────────────────────────
-- Records the last successful full-sync timestamp per table.
CREATE TABLE IF NOT EXISTS sync_log (
	table_name   TEXT        PRIMARY KEY,
	last_full_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	row_count    BIGINT      NOT NULL DEFAULT 0
);
`
