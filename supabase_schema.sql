-- ═══════════════════════════════════════════════════════════════════
-- Ajith Rohana Enterprise — Lottery Manager
-- Complete Supabase Schema v3 (ERP upgrade — mirrors local SQLite)
-- Run this ONCE in your Supabase SQL editor.
-- Safe to re-run: all DDL uses IF NOT EXISTS / IF NOT EXISTS guards.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. company_settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  name        TEXT DEFAULT 'Ajith Rohana Enterprise',
  address     TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  nlb_reg     TEXT DEFAULT '',
  dlb_reg     TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_settings' AND policyname='rls_company') THEN
    CREATE POLICY "rls_company" ON company_settings FOR ALL USING (true);
  END IF;
END $$;

-- ── 2. agents ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  nlb_reg       TEXT DEFAULT '',
  dlb_reg       TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  nic_number    TEXT DEFAULT '',
  bank_name     TEXT DEFAULT '',
  bank_account  TEXT DEFAULT '',
  photo         TEXT DEFAULT '',
  credit_limit  REAL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agents' AND policyname='rls_agents') THEN
    CREATE POLICY "rls_agents" ON agents FOR ALL USING (true);
  END IF;
END $$;

-- ── 3. lottery_games ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lottery_games (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  unit_price  REAL NOT NULL DEFAULT 32.50,
  board       TEXT NOT NULL DEFAULT 'NLB',
  is_enabled  INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lottery_games ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lottery_games' AND policyname='rls_games') THEN
    CREATE POLICY "rls_games" ON lottery_games FOR ALL USING (true);
  END IF;
END $$;

-- ── 4. invoices (ERP upgrade) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                  BIGSERIAL PRIMARY KEY,
  invoice_number      TEXT NOT NULL UNIQUE,
  agent_id            BIGINT REFERENCES agents(id),
  invoice_date        TEXT NOT NULL,
  prepared_by         TEXT DEFAULT '',
  invoice_total       REAL DEFAULT 0,
  prev_outstanding    REAL DEFAULT 0,
  total_payable       REAL DEFAULT 0,
  cash_received       REAL DEFAULT 0,
  dlb_winning         REAL DEFAULT 0,
  nlb_winning         REAL DEFAULT 0,
  outstanding_balance REAL DEFAULT 0,
  -- ERP fields
  delivery_route      TEXT DEFAULT '',
  sales_rep           TEXT DEFAULT '',
  discount_total      REAL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='rls_invoices') THEN
    CREATE POLICY "rls_invoices" ON invoices FOR ALL USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_invoices_agent ON invoices(agent_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date  ON invoices(invoice_date);

-- ── 5. invoice_items (ERP upgrade) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id               BIGSERIAL PRIMARY KEY,
  invoice_id       BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sn               INTEGER,
  ticket_name      TEXT NOT NULL,
  barcode_start    TEXT DEFAULT '',
  barcode_end      TEXT DEFAULT '',
  qty              INTEGER DEFAULT 0,
  qty_unit         TEXT DEFAULT 'Tickets',
  unit_price       REAL NOT NULL,
  value            REAL NOT NULL,
  -- ERP fields
  books_qty        INTEGER DEFAULT 0,
  tickets_per_book INTEGER DEFAULT 0,
  discount_pct     REAL DEFAULT 0,
  discount_amt     REAL DEFAULT 0,
  net_value        REAL DEFAULT 0
);
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_items' AND policyname='rls_items') THEN
    CREATE POLICY "rls_items" ON invoice_items FOR ALL USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);

-- ── 6. inventory_batches (ERP upgrade) ───────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_batches (
  id                   BIGSERIAL PRIMARY KEY,
  game_name            TEXT NOT NULL,
  batch_date           TEXT NOT NULL,
  barcode_start        TEXT NOT NULL,
  barcode_end          TEXT NOT NULL,
  total_qty            INTEGER NOT NULL DEFAULT 0,
  distributed_qty      INTEGER NOT NULL DEFAULT 0,
  unit_price           REAL NOT NULL DEFAULT 32.50,
  low_stock_threshold  INTEGER NOT NULL DEFAULT 100,
  notes                TEXT DEFAULT '',
  -- ERP fields
  batch_number         TEXT DEFAULT '',
  ticket_start_no      TEXT DEFAULT '',
  ticket_end_no        TEXT DEFAULT '',
  books_qty            INTEGER DEFAULT 0,
  tickets_per_book     INTEGER DEFAULT 100,
  warehouse_location   TEXT DEFAULT '',
  rack_tag             TEXT DEFAULT '',
  nlb_dlb_category     TEXT DEFAULT '',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_batches' AND policyname='rls_inventory') THEN
    CREATE POLICY "rls_inventory" ON inventory_batches FOR ALL USING (true);
  END IF;
END $$;

-- ── 7. payments (ERP upgrade) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             BIGSERIAL PRIMARY KEY,
  agent_id       BIGINT NOT NULL REFERENCES agents(id),
  invoice_id     BIGINT REFERENCES invoices(id),
  payment_date   TEXT NOT NULL,
  payment_type   TEXT NOT NULL DEFAULT 'cash',
  amount         REAL NOT NULL,
  reference      TEXT DEFAULT '',
  notes          TEXT DEFAULT '',
  -- ERP: cheque details
  cheque_number  TEXT DEFAULT '',
  bank_name      TEXT DEFAULT '',
  clearance_date TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='rls_payments') THEN
    CREATE POLICY "rls_payments" ON payments FOR ALL USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_payments_agent ON payments(agent_id);

-- ── 8. ticket_returns (ERP upgrade) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_returns (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      BIGINT NOT NULL REFERENCES agents(id),
  invoice_id    BIGINT REFERENCES invoices(id),
  return_date   TEXT NOT NULL,
  game_name     TEXT NOT NULL,
  barcode_start TEXT DEFAULT '',
  barcode_end   TEXT DEFAULT '',
  qty           INTEGER DEFAULT 0,
  unit_price    REAL DEFAULT 0,
  total_value   REAL DEFAULT 0,
  status        TEXT DEFAULT 'pending',
  notes         TEXT DEFAULT '',
  -- ERP field
  return_reason TEXT DEFAULT 'unsold',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ticket_returns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_returns' AND policyname='rls_returns') THEN
    CREATE POLICY "rls_returns" ON ticket_returns FOR ALL USING (true);
  END IF;
END $$;

-- ── 9. daily_collections (ERP upgrade) ───────────────────────────────
CREATE TABLE IF NOT EXISTS daily_collections (
  id               BIGSERIAL PRIMARY KEY,
  collection_date  TEXT NOT NULL,
  collector_name   TEXT DEFAULT '',
  agent_id         BIGINT NOT NULL REFERENCES agents(id),
  cash_amount      REAL DEFAULT 0,
  cheque_amount    REAL DEFAULT 0,
  nlb_winning      REAL DEFAULT 0,
  dlb_winning      REAL DEFAULT 0,
  route            TEXT DEFAULT '',
  notes            TEXT DEFAULT '',
  -- ERP: cheque details
  cheque_number    TEXT DEFAULT '',
  bank_name        TEXT DEFAULT '',
  clearance_date   TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE daily_collections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_collections' AND policyname='rls_collections') THEN
    CREATE POLICY "rls_collections" ON daily_collections FOR ALL USING (true);
  END IF;
END $$;

-- ── 10. commission_schemes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_schemes (
  id               BIGSERIAL PRIMARY KEY,
  agent_id         BIGINT REFERENCES agents(id),
  scheme_name      TEXT NOT NULL,
  commission_type  TEXT DEFAULT 'percentage',
  rate             REAL NOT NULL DEFAULT 5.0,
  effective_from   TEXT NOT NULL,
  effective_to     TEXT,
  is_active        INTEGER DEFAULT 1,
  notes            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE commission_schemes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commission_schemes' AND policyname='rls_commission') THEN
    CREATE POLICY "rls_commission" ON commission_schemes FOR ALL USING (true);
  END IF;
END $$;

-- ── 11. lottery_results ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lottery_results (
  id               BIGSERIAL PRIMARY KEY,
  game_slug        TEXT NOT NULL,
  game_name        TEXT,
  board            TEXT DEFAULT 'NLB',
  draw_number      TEXT DEFAULT '',
  draw_date        TEXT NOT NULL,
  winning_letter   TEXT DEFAULT '',
  winning_numbers  JSONB DEFAULT '[]',
  super_number     TEXT DEFAULT '',
  prizes           JSONB DEFAULT '[]',
  source           TEXT DEFAULT 'manual',
  saved_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_slug, draw_date)
);
ALTER TABLE lottery_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lottery_results' AND policyname='rls_results') THEN
    CREATE POLICY "rls_results" ON lottery_results FOR ALL USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_results_game_date ON lottery_results(game_slug, draw_date);

-- ── 12. app_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_settings' AND policyname='rls_settings') THEN
    CREATE POLICY "rls_settings" ON app_settings FOR ALL USING (true);
  END IF;
END $$;

-- ── 13. suppliers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT 'Nimalsiri Enterprises',
  contact_name  TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  address       TEXT DEFAULT 'Colombo',
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='suppliers' AND policyname='rls_suppliers') THEN
    CREATE POLICY "rls_suppliers" ON suppliers FOR ALL USING (true);
  END IF;
END $$;

-- ── 14. purchase_invoices (Nimalsiri → Ajith) ────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id                  BIGSERIAL PRIMARY KEY,
  purchase_number     TEXT NOT NULL UNIQUE,
  supplier_name       TEXT NOT NULL DEFAULT 'Nimalsiri Enterprises',
  purchase_date       TEXT NOT NULL,
  stock_date          TEXT NOT NULL,
  invoice_total       REAL DEFAULT 0,
  initial_payment     REAL DEFAULT 0,
  outstanding_balance REAL DEFAULT 0,
  status              TEXT DEFAULT 'pending',
  notes               TEXT DEFAULT '',
  -- ERP fields
  supplier_ref        TEXT DEFAULT '',
  tax_amount          REAL DEFAULT 0,
  handling_charge     REAL DEFAULT 0,
  warehouse_location  TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_invoices' AND policyname='rls_purchases') THEN
    CREATE POLICY "rls_purchases" ON purchase_invoices FOR ALL USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_purchase_date ON purchase_invoices(purchase_date);

-- ── 15. purchase_invoice_items ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id               BIGSERIAL PRIMARY KEY,
  purchase_id      BIGINT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  game_name        TEXT NOT NULL,
  barcode_start    TEXT DEFAULT '',
  barcode_end      TEXT DEFAULT '',
  qty              INTEGER DEFAULT 0,
  unit_price       REAL DEFAULT 0,
  value            REAL DEFAULT 0,
  -- ERP fields
  batch_number     TEXT DEFAULT '',
  ticket_start_no  TEXT DEFAULT '',
  ticket_end_no    TEXT DEFAULT '',
  books_qty        INTEGER DEFAULT 0,
  tickets_per_book INTEGER DEFAULT 100
);
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_invoice_items' AND policyname='rls_pi_items') THEN
    CREATE POLICY "rls_pi_items" ON purchase_invoice_items FOR ALL USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pi_items ON purchase_invoice_items(purchase_id);

-- ── 16. purchase_payments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_payments (
  id            BIGSERIAL PRIMARY KEY,
  purchase_id   BIGINT NOT NULL REFERENCES purchase_invoices(id),
  payment_date  TEXT NOT NULL,
  payment_type  TEXT NOT NULL DEFAULT 'cash',
  amount        REAL NOT NULL,
  reference     TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_payments' AND policyname='rls_pp') THEN
    CREATE POLICY "rls_pp" ON purchase_payments FOR ALL USING (true);
  END IF;
END $$;

-- ── Migration guard: add new columns to existing tables ───────────────
-- Safe to run even if columns already exist (DO $$ EXCEPTION WHEN handled)

DO $$ BEGIN
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_route TEXT DEFAULT '';
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_rep TEXT DEFAULT '';
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_total REAL DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS books_qty INTEGER DEFAULT 0;
  ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tickets_per_book INTEGER DEFAULT 0;
  ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_pct REAL DEFAULT 0;
  ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_amt REAL DEFAULT 0;
  ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS net_value REAL DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '';
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS ticket_start_no TEXT DEFAULT '';
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS ticket_end_no TEXT DEFAULT '';
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS books_qty INTEGER DEFAULT 0;
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS tickets_per_book INTEGER DEFAULT 100;
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS warehouse_location TEXT DEFAULT '';
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS rack_tag TEXT DEFAULT '';
  ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS nlb_dlb_category TEXT DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ticket_returns ADD COLUMN IF NOT EXISTS return_reason TEXT DEFAULT 'unsold';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS cheque_number TEXT DEFAULT '';
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS clearance_date TEXT DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE daily_collections ADD COLUMN IF NOT EXISTS cheque_number TEXT DEFAULT '';
  ALTER TABLE daily_collections ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
  ALTER TABLE daily_collections ADD COLUMN IF NOT EXISTS clearance_date TEXT DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- Total tables: 16 (company_settings, agents, lottery_games, invoices,
--   invoice_items, inventory_batches, payments, ticket_returns,
--   daily_collections, commission_schemes, lottery_results, app_settings,
--   suppliers, purchase_invoices, purchase_invoice_items, purchase_payments)
-- ════════════════════════════════════════════════════════════════════
