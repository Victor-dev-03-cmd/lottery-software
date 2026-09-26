import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { enqueueSync } from "./syncQueue";
import type {
  CompanySettings,
  Agent,
  LotteryGame,
  Invoice,
  InvoiceItem,
  AgentSummary,
} from "../types";

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

/** Call this before a DB restore so the file can be safely overwritten. */
export async function closeAndResetDb(): Promise<void> {
  if (db) {
    try { await db.close(); } catch { /* ignore if already closed */ }
    db = null;
    initPromise = null;
  }
}

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      // Ask Rust for the correct connection string (respects user's chosen DB dir)
      let connStr = "sqlite:ajith_rohana.db"; // fallback for browser preview
      try {
        connStr = await invoke<string>("get_db_connection_string");
      } catch {
        // Running outside Tauri (browser preview) — use default relative path
      }
      const d = await Database.load(connStr);
      db = d;
      await initSchema();
      return d;
    })();
  }
  return initPromise;
}

async function initSchema() {
  const d = db!;

  await d.execute(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT DEFAULT 'Ajith Rohana Enterprise',
      address TEXT DEFAULT 'No: 26 1/1, 2nd Rohini Lane, Front Street, Colombo-11.',
      phone TEXT DEFAULT '0112-341021',
      nlb_reg TEXT DEFAULT 'NLB A143',
      dlb_reg TEXT DEFAULT 'DLB 01/7386',
      email TEXT DEFAULT 'nimalsirient@gmail.com'
    )
  `);

  // Insert default company settings if empty
  await d.execute(`
    INSERT OR IGNORE INTO company_settings (id) VALUES (1)
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nlb_reg TEXT DEFAULT '',
      dlb_reg TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT ''
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS lottery_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 32.50,
      board TEXT NOT NULL DEFAULT 'NLB'
    )
  `);

  // Remove any duplicate games, keeping the lowest id for each name
  await d.execute(`
    DELETE FROM lottery_games
    WHERE id NOT IN (
      SELECT MIN(id) FROM lottery_games GROUP BY name
    )
  `);

  // Canonical 16 NLB/DLB games with correct board assignments and prices
  const CANONICAL_GAMES: { name: string; unit_price: number; cost_price: number; board: string }[] = [
    // ── NLB — National Lottery Board ──────────────────────────────────────────
    { name: "Ada Sampatha",        unit_price: 650.00, cost_price: 650.00, board: "NLB" },
    { name: "Dhana Nidhanaya",     unit_price:  32.50, cost_price:  32.50, board: "NLB" },
    { name: "Govi Setha",          unit_price:  32.50, cost_price:  32.50, board: "NLB" },
    { name: "Hada Hana",           unit_price: 325.00, cost_price: 325.00, board: "NLB" },
    { name: "Mahajana Sampatha",   unit_price:  32.50, cost_price:  32.50, board: "NLB" },
    { name: "Mega Power",          unit_price:  32.50, cost_price:  32.50, board: "NLB" },
    { name: "NLB Jaya",            unit_price:  32.50, cost_price:  32.50, board: "NLB" },
    { name: "Suba Dasawak",        unit_price:  32.50, cost_price:  32.50, board: "NLB" },
    // ── DLB — Development Lottery Board ──────────────────────────────────────
    { name: "Ada Kotipathi",       unit_price: 325.00, cost_price: 325.00, board: "DLB" },
    { name: "Jaya Sampatha",       unit_price:  32.50, cost_price:  32.50, board: "DLB" },
    { name: "Kapruka",             unit_price: 325.00, cost_price: 325.00, board: "DLB" },
    { name: "Lagna Wasanawa",      unit_price:  32.50, cost_price:  32.50, board: "DLB" },
    { name: "Sasiri",              unit_price: 325.00, cost_price: 325.00, board: "DLB" },
    { name: "Shanida Wasanawa",    unit_price: 325.00, cost_price: 325.00, board: "DLB" },
    { name: "Super Ball",          unit_price: 325.00, cost_price: 325.00, board: "DLB" },
    { name: "Supiri Dana Sampatha",unit_price: 520.00, cost_price: 520.00, board: "DLB" },
  ];

  // Name aliases — old/incorrect names that exist in the DB → canonical name
  const NAME_ALIASES: Record<string, string> = {
    "mahajana sampatha":      "Mahajana Sampatha",
    "lagna wasanawa":         "Lagna Wasanawa",
    "nlb jaya":               "NLB Jaya",
    "kotipathi kapruka":      "Kapruka",
    "supiri dana sampatha spc":"Supiri Dana Sampatha",
  };

  // Step 1: Normalise names and correct board assignments on existing rows
  const allRows = await d.select<{ id: number; name: string; board: string }[]>(
    "SELECT id, name, board FROM lottery_games"
  );
  for (const row of allRows) {
    const lc = row.name.toLowerCase().trim();
    // Resolve alias → canonical name
    const canonicalName = NAME_ALIASES[lc] ?? CANONICAL_GAMES.find(g => g.name.toLowerCase() === lc)?.name ?? null;
    const canonicalGame = CANONICAL_GAMES.find(g =>
      g.name.toLowerCase() === (canonicalName ?? row.name).toLowerCase()
    );
    if (canonicalGame) {
      // Update name (normalise casing) and correct board
      if (row.name !== canonicalGame.name || row.board !== canonicalGame.board) {
        await d.execute(
          "UPDATE lottery_games SET name=?, board=?, unit_price=?, cost_price=? WHERE id=?",
          [canonicalGame.name, canonicalGame.board, canonicalGame.unit_price, canonicalGame.cost_price, row.id]
        );
      }
    }
  }

  // Step 2: Remove duplicates again after name normalisation
  await d.execute(`
    DELETE FROM lottery_games WHERE id NOT IN (
      SELECT MIN(id) FROM lottery_games GROUP BY LOWER(name)
    )
  `);

  // Step 3: Insert any canonical games that are still missing
  const afterNorm = await d.select<{ name: string }[]>("SELECT name FROM lottery_games");
  const existingNames = new Set(afterNorm.map(r => r.name.toLowerCase()));
  for (const g of CANONICAL_GAMES) {
    if (!existingNames.has(g.name.toLowerCase())) {
      await d.execute(
        "INSERT INTO lottery_games (name, unit_price, cost_price, board) VALUES (?, ?, ?, ?)",
        [g.name, g.unit_price, g.cost_price, g.board]
      );
    }
  }

  await d.execute(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      agent_id INTEGER NOT NULL,
      invoice_date TEXT NOT NULL,
      prepared_by TEXT DEFAULT '',
      invoice_total REAL DEFAULT 0,
      prev_outstanding REAL DEFAULT 0,
      total_payable REAL DEFAULT 0,
      cash_received REAL DEFAULT 0,
      dlb_winning REAL DEFAULT 0,
      nlb_winning REAL DEFAULT 0,
      outstanding_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      sn INTEGER,
      ticket_name TEXT NOT NULL,
      barcode_start TEXT DEFAULT '',
      barcode_end TEXT DEFAULT '',
      qty INTEGER DEFAULT 0,
      qty_unit TEXT DEFAULT 'Tickets',
      unit_price REAL NOT NULL,
      value REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_name TEXT NOT NULL,
      batch_date TEXT NOT NULL,
      barcode_start TEXT NOT NULL,
      barcode_end TEXT NOT NULL,
      total_qty INTEGER NOT NULL DEFAULT 0,
      distributed_qty INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 32.50,
      low_stock_threshold INTEGER NOT NULL DEFAULT 100,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      invoice_id INTEGER,
      payment_date TEXT NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL,
      reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS ticket_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      invoice_id INTEGER,
      return_date TEXT NOT NULL,
      game_name TEXT NOT NULL,
      barcode_start TEXT DEFAULT '',
      barcode_end TEXT DEFAULT '',
      qty INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0,
      total_value REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS daily_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_date TEXT NOT NULL,
      collector_name TEXT DEFAULT '',
      agent_id INTEGER NOT NULL,
      cash_amount REAL DEFAULT 0,
      cheque_amount REAL DEFAULT 0,
      nlb_winning REAL DEFAULT 0,
      dlb_winning REAL DEFAULT 0,
      route TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS lottery_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      game_name TEXT NOT NULL,
      board TEXT NOT NULL DEFAULT 'NLB',
      draw_number TEXT DEFAULT '',
      draw_date TEXT NOT NULL,
      winning_letter TEXT DEFAULT '',
      winning_numbers TEXT DEFAULT '[]',
      super_number TEXT DEFAULT '',
      prizes TEXT DEFAULT '[]',
      source TEXT DEFAULT 'manual',
      saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(game_slug, draw_date)
    )
  `);
  // Ensure index exists on older DBs that were created without the constraint
  try {
    await d.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lr_slug_date ON lottery_results(game_slug, draw_date)`);
  } catch { /* may already exist or table was just created with UNIQUE */ }

  await d.execute(`
    CREATE TABLE IF NOT EXISTS commission_schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER,
      scheme_name TEXT NOT NULL,
      commission_type TEXT DEFAULT 'percentage',
      rate REAL NOT NULL DEFAULT 5.0,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      is_active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  // App-wide key-value settings store
  await d.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  // ── Supplier / Purchase tables ─────────────────────────────────────────────
  await d.execute(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Nimalsiri Enterprises',
      contact_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT 'Colombo',
      notes TEXT DEFAULT ''
    )
  `);
  await d.execute(`INSERT OR IGNORE INTO suppliers (id, name) VALUES (1, 'Nimalsiri Enterprises')`);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_name TEXT NOT NULL DEFAULT 'Nimalsiri Enterprises',
      purchase_date TEXT NOT NULL,
      stock_date TEXT NOT NULL,
      invoice_total REAL DEFAULT 0,
      initial_payment REAL DEFAULT 0,
      outstanding_balance REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      game_name TEXT NOT NULL,
      barcode_start TEXT DEFAULT '',
      barcode_end TEXT DEFAULT '',
      qty INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0,
      value REAL DEFAULT 0,
      FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
    )
  `);

  await d.execute(`
    CREATE TABLE IF NOT EXISTS purchase_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL,
      reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id)
    )
  `);

  // Migrate: add credit_limit to agents if not present
  try {
    await d.execute("ALTER TABLE agents ADD COLUMN credit_limit REAL DEFAULT 0");
  } catch { /* column already exists */ }

  // Migrate: add new agent profile fields
  try { await d.execute("ALTER TABLE agents ADD COLUMN nic_number TEXT DEFAULT ''"); } catch {}
  try { await d.execute("ALTER TABLE agents ADD COLUMN bank_name TEXT DEFAULT ''"); } catch {}
  try { await d.execute("ALTER TABLE agents ADD COLUMN bank_account TEXT DEFAULT ''"); } catch {}
  try { await d.execute("ALTER TABLE agents ADD COLUMN photo TEXT DEFAULT ''"); } catch {}

  // Migrate: add is_enabled to lottery_games if not present
  try {
    await d.execute("ALTER TABLE lottery_games ADD COLUMN is_enabled INTEGER DEFAULT 1");
  } catch { /* already exists */ }
  // Migrate: add cost_price (Nimalsiri → Ajith) — defaults to same as unit_price
  try {
    await d.execute("ALTER TABLE lottery_games ADD COLUMN cost_price REAL DEFAULT 0");
    // Back-fill: set cost_price = unit_price for existing rows
    await d.execute("UPDATE lottery_games SET cost_price = unit_price WHERE cost_price = 0");
  } catch { /* already exists */ }

  // ── Offline-first sync queue ──────────────────────────────────────────────
  await d.execute(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL DEFAULT 'upsert',
      record_id INTEGER,
      payload TEXT NOT NULL DEFAULT '{}',
      on_conflict TEXT DEFAULT 'id',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT DEFAULT ''
    )
  `);

  // ── Workers & Payroll tables ──────────────────────────────────────────────
  await d.execute(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Cashier',
      basic_salary REAL DEFAULT 0,
      bank_name TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      nic_number TEXT DEFAULT '',
      photo TEXT DEFAULT '',
      work_start_date TEXT DEFAULT '',
      work_end_date TEXT DEFAULT '',
      transport_allowance REAL DEFAULT 0,
      meal_allowance REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await d.execute(`
    CREATE TABLE IF NOT EXISTS worker_salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL REFERENCES workers(id),
      month TEXT NOT NULL,
      basic_salary REAL DEFAULT 0,
      transport_allowance REAL DEFAULT 0,
      meal_allowance REAL DEFAULT 0,
      overtime_pay REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      total_earnings REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      advance_paid REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      paid_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await d.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_worker_month ON worker_salaries(worker_id, month)");
  } catch {}

  // ── Supplier Returns table ────────────────────────────────────────────────
  await d.execute(`
    CREATE TABLE IF NOT EXISTS supplier_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER,
      return_date TEXT NOT NULL,
      game_name TEXT NOT NULL,
      barcode_start TEXT DEFAULT '',
      barcode_end TEXT DEFAULT '',
      qty INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0,
      total_value REAL DEFAULT 0,
      return_reason TEXT DEFAULT 'unsold',
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id)
    )
  `);

  // ── Heal any existing negative outstanding_balance records ───────────────
  // Overpayments should be stored as 0, not negative
  await d.execute(
    "UPDATE invoices SET outstanding_balance = 0 WHERE outstanding_balance < 0"
  );

  // ── Invoice status workflow migration ────────────────────────────────────
  // Status: draft | waiting | confirmed | paid | cancelled
  try { await d.execute("ALTER TABLE invoices ADD COLUMN invoice_status TEXT DEFAULT 'paid'"); } catch {}
  // Existing invoices default to 'paid' (they were created before the workflow)
  // New invoices will start as 'draft'

  // Invoice template/model settings (stored as JSON in app_settings)
  await d.execute(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('invoice_template', '{}')`);

  // ── ERP upgrade migrations ────────────────────────────────────────────────
  // invoices — route, rep, discount
  for (const col of [
    "ALTER TABLE invoices ADD COLUMN delivery_route TEXT DEFAULT ''",
    "ALTER TABLE invoices ADD COLUMN sales_rep TEXT DEFAULT ''",
    "ALTER TABLE invoices ADD COLUMN discount_total REAL DEFAULT 0",
  ]) { try { await d.execute(col); } catch {} }

  // invoice_items — books, discount, net_value, purchase_batch_id
  for (const col of [
    "ALTER TABLE invoice_items ADD COLUMN books_qty INTEGER DEFAULT 0",
    "ALTER TABLE invoice_items ADD COLUMN tickets_per_book INTEGER DEFAULT 0",
    "ALTER TABLE invoice_items ADD COLUMN discount_pct REAL DEFAULT 0",
    "ALTER TABLE invoice_items ADD COLUMN discount_amt REAL DEFAULT 0",
    "ALTER TABLE invoice_items ADD COLUMN net_value REAL DEFAULT 0",
    "ALTER TABLE invoice_items ADD COLUMN purchase_batch_id INTEGER DEFAULT NULL",
  ]) { try { await d.execute(col); } catch {} }

  // Index for fast batch-level sales tracking
  try {
    await d.execute("CREATE INDEX IF NOT EXISTS idx_ii_batch ON invoice_items(purchase_batch_id)");
    await d.execute("CREATE INDEX IF NOT EXISTS idx_ii_barcode ON invoice_items(ticket_name, barcode_start, barcode_end)");
  } catch {}

  // inventory_batches — ERP fields
  for (const col of [
    "ALTER TABLE inventory_batches ADD COLUMN batch_number TEXT DEFAULT ''",
    "ALTER TABLE inventory_batches ADD COLUMN ticket_start_no TEXT DEFAULT ''",
    "ALTER TABLE inventory_batches ADD COLUMN ticket_end_no TEXT DEFAULT ''",
    "ALTER TABLE inventory_batches ADD COLUMN books_qty INTEGER DEFAULT 0",
    "ALTER TABLE inventory_batches ADD COLUMN tickets_per_book INTEGER DEFAULT 100",
    "ALTER TABLE inventory_batches ADD COLUMN warehouse_location TEXT DEFAULT ''",
    "ALTER TABLE inventory_batches ADD COLUMN rack_tag TEXT DEFAULT ''",
    "ALTER TABLE inventory_batches ADD COLUMN nlb_dlb_category TEXT DEFAULT ''",
  ]) { try { await d.execute(col); } catch {} }

  // ticket_returns — reason categorization
  try { await d.execute("ALTER TABLE ticket_returns ADD COLUMN return_reason TEXT DEFAULT 'unsold'"); } catch {}

  // payments — cheque / bank details
  for (const col of [
    "ALTER TABLE payments ADD COLUMN cheque_number TEXT DEFAULT ''",
    "ALTER TABLE payments ADD COLUMN bank_name TEXT DEFAULT ''",
    "ALTER TABLE payments ADD COLUMN clearance_date TEXT DEFAULT ''",
  ]) { try { await d.execute(col); } catch {} }

  // daily_collections — cheque details
  for (const col of [
    "ALTER TABLE daily_collections ADD COLUMN cheque_number TEXT DEFAULT ''",
    "ALTER TABLE daily_collections ADD COLUMN bank_name TEXT DEFAULT ''",
    "ALTER TABLE daily_collections ADD COLUMN clearance_date TEXT DEFAULT ''",
  ]) { try { await d.execute(col); } catch {} }

  // purchase_invoices — supplier ref, tax, handling, warehouse
  for (const col of [
    "ALTER TABLE purchase_invoices ADD COLUMN supplier_ref TEXT DEFAULT ''",
    "ALTER TABLE purchase_invoices ADD COLUMN tax_amount REAL DEFAULT 0",
    "ALTER TABLE purchase_invoices ADD COLUMN handling_charge REAL DEFAULT 0",
    "ALTER TABLE purchase_invoices ADD COLUMN warehouse_location TEXT DEFAULT ''",
  ]) { try { await d.execute(col); } catch {} }

  // purchase_invoice_items — batch, serial, books, draw number
  for (const col of [
    "ALTER TABLE purchase_invoice_items ADD COLUMN batch_number TEXT DEFAULT ''",
    "ALTER TABLE purchase_invoice_items ADD COLUMN ticket_start_no TEXT DEFAULT ''",
    "ALTER TABLE purchase_invoice_items ADD COLUMN ticket_end_no TEXT DEFAULT ''",
    "ALTER TABLE purchase_invoice_items ADD COLUMN books_qty INTEGER DEFAULT 0",
    "ALTER TABLE purchase_invoice_items ADD COLUMN tickets_per_book INTEGER DEFAULT 100",
    "ALTER TABLE purchase_invoice_items ADD COLUMN draw_number TEXT DEFAULT ''",
  ]) { try { await d.execute(col); } catch {} }

}

// ── Company Settings ──────────────────────────────────────────────────────────

export async function getCompanySettings(): Promise<CompanySettings> {
  const d = await getDb();
  const rows = await d.select<CompanySettings[]>("SELECT * FROM company_settings WHERE id=1");
  return rows[0] ?? {
    name: "Ajith Rohana Enterprise",
    address: "No: 26 1/1, 2nd Rohini Lane, Front Street, Colombo-11.",
    phone: "0112-341021",
    nlb_reg: "NLB A143",
    dlb_reg: "DLB 01/7386",
    email: "nimalsirient@gmail.com",
  };
}

export async function saveCompanySettings(s: CompanySettings): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO company_settings (id, name, address, phone, nlb_reg, dlb_reg, email)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    [s.name, s.address, s.phone, s.nlb_reg, s.dlb_reg, s.email]
  );
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function getAgents(): Promise<Agent[]> {
  const d = await getDb();
  return d.select<Agent[]>("SELECT * FROM agents ORDER BY name ASC");
}

export async function saveAgent(agent: Agent): Promise<number> {
  const d = await getDb();
  const cl = agent.credit_limit ?? 0;
  if (agent.id) {
    await d.execute(
      `UPDATE agents SET name=?, nlb_reg=?, dlb_reg=?, phone=?, address=?,
       nic_number=?, bank_name=?, bank_account=?, photo=?, credit_limit=? WHERE id=?`,
      [agent.name, agent.nlb_reg, agent.dlb_reg, agent.phone, agent.address,
       agent.nic_number ?? "", agent.bank_name ?? "", agent.bank_account ?? "",
       agent.photo ?? "", cl, agent.id]
    );
    enqueueSync("agents", "upsert", {
      id: agent.id, name: agent.name, nlb_reg: agent.nlb_reg, dlb_reg: agent.dlb_reg,
      phone: agent.phone, address: agent.address, nic_number: agent.nic_number ?? "",
      bank_name: agent.bank_name ?? "", bank_account: agent.bank_account ?? "",
      credit_limit: cl,
    }, "id").catch(() => {});
    return agent.id;
  }
  const r = await d.execute(
    `INSERT INTO agents (name, nlb_reg, dlb_reg, phone, address, nic_number, bank_name, bank_account, photo, credit_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agent.name, agent.nlb_reg, agent.dlb_reg, agent.phone, agent.address,
     agent.nic_number ?? "", agent.bank_name ?? "", agent.bank_account ?? "",
     agent.photo ?? "", cl]
  );
  const newId = r.lastInsertId as number;
  enqueueSync("agents", "upsert", {
    id: newId, name: agent.name, nlb_reg: agent.nlb_reg, dlb_reg: agent.dlb_reg,
    phone: agent.phone, address: agent.address, nic_number: agent.nic_number ?? "",
    bank_name: agent.bank_name ?? "", bank_account: agent.bank_account ?? "",
    credit_limit: cl,
  }, "id").catch(() => {});
  return newId;
}

export async function getAgentsWithCreditLimit(): Promise<(Agent & { credit_limit: number; outstanding_balance: number })[]> {
  const d = await getDb();
  return d.select(`
    SELECT a.*, COALESCE(a.credit_limit, 0) as credit_limit,
           COALESCE((
             SELECT ROUND(SUM(MAX(0, i.outstanding_balance)), 2)
             FROM invoices i WHERE i.agent_id=a.id
               AND COALESCE(i.invoice_status,'paid') NOT IN ('draft','cancelled')
           ), 0) as outstanding_balance
    FROM agents a ORDER BY a.name ASC
  `);
}

export async function updateAgentCreditLimit(agentId: number, limit: number): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE agents SET credit_limit=? WHERE id=?", [limit, agentId]);
  enqueueSync("agents", "upsert", { id: agentId, credit_limit: limit }, "id").catch(() => {});
}

export async function deleteAgent(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM agents WHERE id=?", [id]);
}

// ── Lottery Games ─────────────────────────────────────────────────────────────

export async function getLotteryGames(): Promise<LotteryGame[]> {
  const d = await getDb();
  return d.select<LotteryGame[]>(
    "SELECT * FROM lottery_games WHERE COALESCE(is_enabled,1) = 1 ORDER BY board ASC, name ASC"
  );
}

export async function toggleLotteryGame(id: number, enabled: boolean): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE lottery_games SET is_enabled=? WHERE id=?", [enabled ? 1 : 0, id]);
}

export async function bulkUpdateGamePrice(ids: number[], price: number): Promise<void> {
  const d = await getDb();
  for (const id of ids) {
    await d.execute("UPDATE lottery_games SET unit_price=? WHERE id=?", [price, id]);
  }
}

export async function saveLotteryGame(g: LotteryGame): Promise<number> {
  const d = await getDb();
  const cost = g.cost_price ?? g.unit_price;
  if (g.id) {
    await d.execute(
      "UPDATE lottery_games SET name=?, unit_price=?, cost_price=?, board=? WHERE id=?",
      [g.name, g.unit_price, cost, g.board, g.id]
    );
    return g.id;
  }
  const r = await d.execute(
    "INSERT INTO lottery_games (name, unit_price, cost_price, board) VALUES (?, ?, ?, ?)",
    [g.name, g.unit_price, cost, g.board]
  );
  return r.lastInsertId as number;
}

export async function deleteLotteryGame(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM lottery_games WHERE id=?", [id]);
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "waiting" | "confirmed" | "paid" | "cancelled";

export async function getInvoices(status?: InvoiceStatus | InvoiceStatus[]): Promise<Invoice[]> {
  const d = await getDb();
  let whereClause = "";
  let params: string[] = [];
  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    whereClause = `WHERE i.invoice_status IN (${statuses.map(() => "?").join(",")})`;
    params = statuses;
  }
  const rows = await d.select<Invoice[]>(`
    SELECT i.*, a.name as agent_name, a.nlb_reg as agent_nlb_reg, a.dlb_reg as agent_dlb_reg, a.phone as agent_phone, a.address as agent_address
    FROM invoices i
    LEFT JOIN agents a ON a.id = i.agent_id
    ${whereClause}
    ORDER BY i.invoice_date DESC, i.id DESC
  `, params);
  // Sanitize all monetary fields: round to 2dp, clamp outstanding to ≥ 0
  return rows.map(inv => ({
    ...inv,
    invoice_total:      Number((inv.invoice_total ?? 0).toFixed(2)),
    prev_outstanding:   Number(Math.max(0, inv.prev_outstanding ?? 0).toFixed(2)),
    total_payable:      Number((inv.total_payable ?? 0).toFixed(2)),
    cash_received:      Number((inv.cash_received ?? 0).toFixed(2)),
    dlb_winning:        Number((inv.dlb_winning ?? 0).toFixed(2)),
    nlb_winning:        Number((inv.nlb_winning ?? 0).toFixed(2)),
    outstanding_balance: Number(Math.max(0, inv.outstanding_balance ?? 0).toFixed(2)),
  }));
}

export async function getInvoiceWithItems(id: number): Promise<Invoice | null> {
  const d = await getDb();
  const rows = await d.select<Invoice[]>(`
    SELECT i.*, a.name as agent_name, a.nlb_reg as agent_nlb_reg, a.dlb_reg as agent_dlb_reg, a.phone as agent_phone, a.address as agent_address
    FROM invoices i
    LEFT JOIN agents a ON a.id = i.agent_id
    WHERE i.id=?
  `, [id]);
  if (!rows.length) return null;
  const inv = rows[0];
  inv.items = await d.select<InvoiceItem[]>(
    "SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sn ASC",
    [id]
  );
  return inv;
}

export async function saveInvoice(invoice: Invoice): Promise<number> {
  const d = await getDb();
  const items = invoice.items ?? [];

  // Recalculate totals — net_value uses discount if present
  const invoiceTotal = items.reduce((s, item) => s + (item.net_value ?? item.value), 0);
  const totalPayable = invoiceTotal + invoice.prev_outstanding;
  const totalPaid = invoice.cash_received + invoice.dlb_winning + invoice.nlb_winning;
  // Clamp to 0: overpayments / advance credits are never stored as negative receivables
  const outstandingBalance = Number(Math.max(0, totalPayable - totalPaid).toFixed(2));
  const discountTotal = items.reduce((s, it) => s + (it.discount_amt ?? 0), 0);

  const insertItem = async (invoiceId: number, item: import("../types").InvoiceItem, i: number) => {
    await d.execute(
      `INSERT INTO invoice_items
       (invoice_id, sn, ticket_name, barcode_start, barcode_end, qty, qty_unit, unit_price, value,
        books_qty, tickets_per_book, discount_pct, discount_amt, net_value, purchase_batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, i + 1, item.ticket_name, item.barcode_start, item.barcode_end,
       item.qty, item.qty_unit, item.unit_price, item.value,
       item.books_qty ?? 0, item.tickets_per_book ?? 0,
       item.discount_pct ?? 0, item.discount_amt ?? 0,
       item.net_value ?? item.value,
       item.purchase_batch_id ?? null]
    );
  };

  if (invoice.id) {
    await d.execute(
      `UPDATE invoices SET agent_id=?, invoice_date=?, prepared_by=?,
       invoice_total=?, prev_outstanding=?, total_payable=?,
       cash_received=?, dlb_winning=?, nlb_winning=?, outstanding_balance=?,
       delivery_route=?, sales_rep=?, discount_total=?
       WHERE id=?`,
      [
        invoice.agent_id, invoice.invoice_date, invoice.prepared_by,
        invoiceTotal, invoice.prev_outstanding, totalPayable,
        invoice.cash_received, invoice.dlb_winning, invoice.nlb_winning, outstandingBalance,
        invoice.delivery_route ?? "", invoice.sales_rep ?? "", discountTotal,
        invoice.id,
      ]
    );
    await d.execute("DELETE FROM invoice_items WHERE invoice_id=?", [invoice.id]);
    for (let i = 0; i < items.length; i++) await insertItem(invoice.id, items[i], i);
    return invoice.id;
  }

  const r = await d.execute(
    `INSERT INTO invoices (invoice_number, agent_id, invoice_date, prepared_by,
     invoice_total, prev_outstanding, total_payable, cash_received, dlb_winning, nlb_winning,
     outstanding_balance, delivery_route, sales_rep, discount_total, invoice_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoice.invoice_number, invoice.agent_id, invoice.invoice_date, invoice.prepared_by,
      invoiceTotal, invoice.prev_outstanding, totalPayable,
      invoice.cash_received, invoice.dlb_winning, invoice.nlb_winning, outstandingBalance,
      invoice.delivery_route ?? "", invoice.sales_rep ?? "", discountTotal,
      (invoice as any).invoice_status ?? "draft",
    ]
  );
  const invoiceId = r.lastInsertId as number;
  for (let i = 0; i < items.length; i++) await insertItem(invoiceId, items[i], i);
  // Inventory is NOT decremented here — stock only reduces when invoice is Confirmed.
  // See confirmInvoice() below.
  // Enqueue for Supabase background sync (non-blocking)
  enqueueSync("invoices", "upsert", {
    id: invoiceId, invoice_number: invoice.invoice_number, agent_id: invoice.agent_id,
    invoice_date: invoice.invoice_date, prepared_by: invoice.prepared_by,
    invoice_total: invoiceTotal, prev_outstanding: invoice.prev_outstanding,
    total_payable: totalPayable, cash_received: invoice.cash_received,
    dlb_winning: invoice.dlb_winning, nlb_winning: invoice.nlb_winning,
    outstanding_balance: outstandingBalance,
    delivery_route: invoice.delivery_route ?? "",
    sales_rep: invoice.sales_rep ?? "",
    discount_total: discountTotal,
  }, "invoice_number").catch(() => {});
  return invoiceId;
}

export async function deleteInvoice(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM invoices WHERE id=?", [id]);
  enqueueSync("invoices", "delete", { id }, "id").catch(() => {});
}

// ── Agent Summary (dashboard data) ────────────────────────────────────────────

export async function getAgentSummaries(): Promise<AgentSummary[]> {
  const d = await getDb();
  const rows = await d.select<AgentSummary[]>(`
    SELECT
      a.id as agent_id,
      a.name,
      COALESCE(SUM(ii.qty), 0) as total_tickets,
      COALESCE(SUM(i.invoice_total), 0) as total_value,
      COALESCE(SUM(i.dlb_winning + i.nlb_winning), 0) as winnings_tickets,
      COALESCE(SUM(i.cash_received), 0) as total_cash,
      COALESCE(SUM(i.cash_received), 0) as paid_cash,
      COALESCE(SUM(i.invoice_total) - SUM(i.cash_received + i.dlb_winning + i.nlb_winning), 0) as amount_over,
      -- loan_amount: total live outstanding (outstanding_balance is kept current by syncInvoiceLiveBalance)
      COALESCE((
        SELECT ROUND(SUM(MAX(0, i3.outstanding_balance)), 2)
        FROM invoices i3 WHERE i3.agent_id=a.id
          AND COALESCE(i3.invoice_status,'paid') NOT IN ('draft','cancelled')
      ), 0) as loan_amount,
      ROUND(COALESCE((
        SELECT SUM(MAX(0, ROUND(i2.outstanding_balance, 2)))
        FROM invoices i2 WHERE i2.agent_id = a.id
          AND COALESCE(i2.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
      ), 0), 2) as outstanding_balance
    FROM agents a
    LEFT JOIN invoices i ON i.agent_id = a.id
      AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
    GROUP BY a.id, a.name
    ORDER BY a.name ASC
  `);
  // JS-level sanitize: eliminate any residual float noise from SQLite REAL arithmetic
  return rows.map(r => ({
    ...r,
    total_value:       Number(r.total_value.toFixed(2)),
    total_cash:        Number(r.total_cash.toFixed(2)),
    paid_cash:         Number(r.paid_cash.toFixed(2)),
    amount_over:       Number(r.amount_over.toFixed(2)),
    outstanding_balance: Number(Math.max(0, r.outstanding_balance).toFixed(2)),
  }));
}

// ── Next invoice number ───────────────────────────────────────────────────────

export async function getNextInvoiceNumber(): Promise<string> {
  const d = await getDb();
  const rows = await d.select<{ max_num: string | null }[]>(
    "SELECT MAX(CAST(invoice_number AS INTEGER)) as max_num FROM invoices WHERE invoice_number GLOB '[0-9]*'"
  );
  const last = parseInt(rows[0]?.max_num ?? "266338", 10);
  return String(last + 1);
}

/** Resolve a unique invoice number, retrying if a collision occurs (M-10). */
export async function resolveUniqueInvoiceNumber(candidate: string): Promise<string> {
  const d = await getDb();
  let num = parseInt(candidate, 10);
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await d.select<{ cnt: number }[]>(
      "SELECT COUNT(*) as cnt FROM invoices WHERE invoice_number=?", [String(num)]
    );
    if ((rows[0]?.cnt ?? 0) === 0) return String(num);
    num++; // collision — try the next number
  }
  return String(num);
}

/** True live outstanding = sum of live balances across all invoices for the agent.
 *  Used as prev_outstanding when creating the next invoice. */
export async function getAgentLastOutstanding(agentId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ live: number }[]>(`
    -- outstanding_balance is kept current by syncInvoiceLiveBalance — just sum it directly
    SELECT ROUND(COALESCE(SUM(MAX(0, i.outstanding_balance)), 0), 2) as live
    FROM invoices i
    WHERE i.agent_id = ?
      AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
  `, [agentId]);
  return Math.max(0, Number((rows[0]?.live ?? 0).toFixed(2)));
}

/** Live balance for a single invoice — reads the maintained outstanding_balance column. */
export async function getLiveInvoiceBalance(invoiceId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ live: number }[]>(`
    SELECT ROUND(MAX(0, i.outstanding_balance), 2) as live
    FROM invoices i WHERE i.id = ?
  `, [invoiceId]);
  return Math.max(0, Number((rows[0]?.live ?? 0).toFixed(2)));
}

/** All invoices for an agent with live balance computed — all values rounded to 2dp. */
export async function getAgentInvoiceLedger(agentId: number): Promise<import("../types").InvoiceLedgerRow[]> {
  const d = await getDb();
  const rows = await d.select<import("../types").InvoiceLedgerRow[]>(`
    SELECT
      i.id as invoice_id,
      i.invoice_number,
      i.invoice_date,
      ROUND(i.invoice_total, 2) as invoice_total,
      ROUND(i.prev_outstanding, 2) as prev_outstanding,
      ROUND(i.total_payable, 2) as total_payable,
      ROUND(i.cash_received, 2) as cash_received,
      ROUND(i.dlb_winning, 2) as dlb_winning,
      ROUND(i.nlb_winning, 2) as nlb_winning,
      ROUND(i.outstanding_balance, 2) as snapshot_balance,
      ROUND(COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0), 2) as post_payments,
      ROUND(COALESCE((SELECT SUM(tr.total_value) FROM ticket_returns tr
                WHERE tr.invoice_id = i.id AND tr.status = 'settled'), 0), 2) as settled_returns,
      -- outstanding_balance is kept current by syncInvoiceLiveBalance after every payment/return.
      -- Do NOT subtract payments/returns again — that would double-count them.
      ROUND(MAX(0, i.outstanding_balance), 2) as live_balance
    FROM invoices i
    WHERE i.agent_id = ?
      AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    ORDER BY i.id DESC
  `, [agentId]);
  // JS-level sanitize as second pass
  return rows.map(r => ({
    ...r,
    invoice_total:    Number(r.invoice_total.toFixed(2)),
    prev_outstanding: Number(r.prev_outstanding.toFixed(2)),
    total_payable:    Number(r.total_payable.toFixed(2)),
    cash_received:    Number(r.cash_received.toFixed(2)),
    post_payments:    Number(r.post_payments.toFixed(2)),
    settled_returns:  Number(r.settled_returns.toFixed(2)),
    live_balance:     Number(r.live_balance.toFixed(2)),
    snapshot_balance: Number(r.snapshot_balance.toFixed(2)),
  }));
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export async function getInventoryBatches() {
  const d = await getDb();
  return d.select<(import("../types").InventoryBatch & { remaining_qty: number })[]>(`
    SELECT *, (total_qty - distributed_qty) as remaining_qty
    FROM inventory_batches
    ORDER BY batch_date DESC, id DESC
  `);
}

export async function saveInventoryBatch(batch: import("../types").InventoryBatch): Promise<number> {
  const d = await getDb();
  const erpVals = [
    batch.batch_number ?? "", batch.ticket_start_no ?? "", batch.ticket_end_no ?? "",
    batch.books_qty ?? 0, batch.tickets_per_book ?? 100,
    batch.warehouse_location ?? "", batch.rack_tag ?? "", batch.nlb_dlb_category ?? "",
  ];
  const syncBatch = (id: number) => enqueueSync("inventory_batches", "upsert", {
    id, game_name: batch.game_name, batch_date: batch.batch_date,
    barcode_start: batch.barcode_start, barcode_end: batch.barcode_end,
    total_qty: batch.total_qty, distributed_qty: batch.distributed_qty,
    unit_price: batch.unit_price, low_stock_threshold: batch.low_stock_threshold,
    notes: batch.notes, batch_number: batch.batch_number ?? "",
    ticket_start_no: batch.ticket_start_no ?? "", ticket_end_no: batch.ticket_end_no ?? "",
    books_qty: batch.books_qty ?? 0, tickets_per_book: batch.tickets_per_book ?? 100,
    warehouse_location: batch.warehouse_location ?? "", rack_tag: batch.rack_tag ?? "",
    nlb_dlb_category: batch.nlb_dlb_category ?? "",
  }, "id").catch(() => {});

  if (batch.id) {
    await d.execute(
      `UPDATE inventory_batches SET game_name=?, batch_date=?, barcode_start=?, barcode_end=?,
       total_qty=?, distributed_qty=?, unit_price=?, low_stock_threshold=?, notes=?,
       batch_number=?, ticket_start_no=?, ticket_end_no=?,
       books_qty=?, tickets_per_book=?, warehouse_location=?, rack_tag=?, nlb_dlb_category=?
       WHERE id=?`,
      [batch.game_name, batch.batch_date, batch.barcode_start, batch.barcode_end,
       batch.total_qty, batch.distributed_qty, batch.unit_price, batch.low_stock_threshold, batch.notes,
       ...erpVals, batch.id]
    );
    syncBatch(batch.id);
    return batch.id;
  }
  const r = await d.execute(
    `INSERT INTO inventory_batches
     (game_name, batch_date, barcode_start, barcode_end, total_qty, distributed_qty,
      unit_price, low_stock_threshold, notes,
      batch_number, ticket_start_no, ticket_end_no,
      books_qty, tickets_per_book, warehouse_location, rack_tag, nlb_dlb_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batch.game_name, batch.batch_date, batch.barcode_start, batch.barcode_end,
     batch.total_qty, batch.distributed_qty, batch.unit_price, batch.low_stock_threshold, batch.notes,
     ...erpVals]
  );
  const newBatchId = r.lastInsertId as number;
  syncBatch(newBatchId);
  return newBatchId;
}

export async function deleteInventoryBatch(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM inventory_batches WHERE id=?", [id]);
}

// ── Batch Sales Tracking ──────────────────────────────────────────────────────

/**
 * Returns available inventory batches for a specific game, with sales tracking.
 * Used in New Invoice to let the operator pick which batch to issue from.
 */
export async function getBatchesForGame(gameName: string): Promise<{
  id: number; game_name: string; batch_date: string;
  barcode_start: string; barcode_end: string;
  total_qty: number; distributed_qty: number; remaining_qty: number;
  sold_from_invoices: number; next_start_barcode: string;
  batch_number: string; nlb_dlb_category: string; unit_price: number;
}[]> {
  const d = await getDb();
  const batches = await d.select<{
    id: number; game_name: string; batch_date: string;
    barcode_start: string; barcode_end: string;
    total_qty: number; distributed_qty: number; unit_price: number;
    batch_number: string; nlb_dlb_category: string;
  }[]>(
    `SELECT id, game_name, batch_date, barcode_start, barcode_end,
            total_qty, distributed_qty, unit_price,
            COALESCE(batch_number,'') as batch_number,
            COALESCE(nlb_dlb_category,'') as nlb_dlb_category
     FROM inventory_batches WHERE game_name=? ORDER BY batch_date ASC`,
    [gameName]
  );
  return Promise.all(batches.map(async b => {
    // Tickets sold via confirmed/paid invoices from this batch
    const [soldRow] = await d.select<{ sold: number; max_end: string | null }[]>(`
      SELECT COALESCE(SUM(ii.qty),0) as sold,
             MAX(ii.barcode_end) as max_end
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE ii.purchase_batch_id = ?
        AND COALESCE(i.invoice_status,'paid') NOT IN ('draft','cancelled')
    `, [b.id]);
    const sold   = soldRow?.sold ?? 0;
    const maxEnd = soldRow?.max_end ?? "";
    const nextStart = maxEnd || b.barcode_start;

    // Use purchase_invoice_items to get the authoritative total for this batch
    // (avoids corrupted distributed_qty / total_qty from old sync operations)
    const [purchRow] = await d.select<{ purchased: number }[]>(
      `SELECT COALESCE(SUM(qty),0) as purchased FROM purchase_invoice_items WHERE game_name=? AND barcode_start=?`,
      [b.game_name, b.barcode_start]
    );
    const realTotal = (purchRow?.purchased ?? 0) > 0 ? purchRow!.purchased : b.total_qty;
    const remaining = realTotal - sold;
    return { ...b, total_qty: realTotal, sold_from_invoices: sold, next_start_barcode: nextStart, remaining_qty: remaining };
  }));
}

/**
 * Full sales detail for one batch: which invoices took tickets from it.
 */
export async function getBatchSalesDetail(batchId: number): Promise<{
  invoice_id: number; invoice_number: string; agent_name: string;
  invoice_date: string; invoice_status: string;
  barcode_start: string; barcode_end: string; qty: number;
}[]> {
  const d = await getDb();
  return d.select(`
    SELECT ii.invoice_id, i.invoice_number, a.name as agent_name,
           i.invoice_date, COALESCE(i.invoice_status,'paid') as invoice_status,
           ii.barcode_start, ii.barcode_end, ii.qty
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN agents a ON a.id = i.agent_id
    WHERE ii.purchase_batch_id = ?
    ORDER BY ii.barcode_start ASC
  `, [batchId]);
}

export async function getLowStockBatches() {
  const d = await getDb();
  return d.select<{ game_name: string; remaining_qty: number; low_stock_threshold: number }[]>(`
    SELECT game_name,
           (total_qty - distributed_qty) as remaining_qty,
           low_stock_threshold
    FROM inventory_batches
    WHERE (total_qty - distributed_qty) <= low_stock_threshold
    ORDER BY remaining_qty ASC
  `);
}

// ── Payments / Ledger ─────────────────────────────────────────────────────────

export async function getPayments(agentId?: number): Promise<import("../types").Payment[]> {
  const d = await getDb();
  if (agentId) {
    return d.select<import("../types").Payment[]>(`
      SELECT p.*, a.name as agent_name, i.invoice_number
      FROM payments p
      LEFT JOIN agents a ON a.id = p.agent_id
      LEFT JOIN invoices i ON i.id = p.invoice_id
      WHERE p.agent_id = ?
      ORDER BY p.payment_date DESC, p.id DESC
    `, [agentId]);
  }
  return d.select<import("../types").Payment[]>(`
    SELECT p.*, a.name as agent_name, i.invoice_number
    FROM payments p
    LEFT JOIN agents a ON a.id = p.agent_id
    LEFT JOIN invoices i ON i.id = p.invoice_id
    ORDER BY p.payment_date DESC, p.id DESC
  `);
}

/**
 * Write the live outstanding balance (snapshot minus all payments and settled returns)
 * back into invoices.outstanding_balance so every query reading the column stays accurate.
 * Also auto-advances waiting/confirmed invoices to 'paid' when balance hits zero.
 */
async function syncInvoiceLiveBalance(
  d: Awaited<ReturnType<typeof getDb>>,
  invoiceId: number | null | undefined
): Promise<void> {
  if (!invoiceId) return;

  // Compute live balance from the TRUE IMMUTABLE BASE — never from outstanding_balance.
  // outstanding_balance is a mutable column; reading it and writing back a reduced value
  // compounds deductions on every call (C-1 bug). Instead, derive from invoice_total,
  // prev_outstanding, and the at-delivery receipts — none of which change after save.
  const rows = await d.select<{ invoice_status: string; live: number }[]>(`
    SELECT invoice_status,
      ROUND(
        (invoice_total + prev_outstanding - cash_received - dlb_winning - nlb_winning)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = invoices.id), 0)
        - COALESCE((SELECT SUM(tr.total_value) FROM ticket_returns tr
                    WHERE tr.invoice_id = invoices.id AND tr.status='settled'), 0),
      2) as live
    FROM invoices WHERE id = ?
  `, [invoiceId]);
  if (!rows.length) return;
  const { invoice_status, live } = rows[0];
  const clamped = Math.max(0, live);

  // Write the idempotent value back so InvoiceList and other column-readers stay accurate.
  // This write is now safe: calling it N times always produces the same result because
  // all inputs (invoice_total, prev_outstanding, cash_received, dlb_winning, nlb_winning,
  // payments, settled_returns) are stable or accumulated — never the running balance itself.
  await d.execute("UPDATE invoices SET outstanding_balance=? WHERE id=?", [clamped, invoiceId]);

  // Auto-advance waiting/confirmed → paid when fully settled
  if ((invoice_status === "waiting" || invoice_status === "confirmed") && clamped <= 0) {
    await d.execute("UPDATE invoices SET invoice_status='paid' WHERE id=?", [invoiceId]);
    enqueueSync("invoices", "upsert", { id: invoiceId, invoice_status: "paid", outstanding_balance: 0 }, "id").catch(() => {});
  } else {
    enqueueSync("invoices", "upsert", { id: invoiceId, outstanding_balance: clamped }, "id").catch(() => {});
  }
}

// Keep old name as alias so existing call-sites (autoMarkPaidIfSettled) compile
const autoMarkPaidIfSettled = syncInvoiceLiveBalance;

export async function savePayment(payment: import("../types").Payment): Promise<number> {
  const d = await getDb();
  const r = await d.execute(
    `INSERT INTO payments (agent_id, invoice_id, payment_date, payment_type, amount, reference, notes,
     cheque_number, bank_name, clearance_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payment.agent_id, payment.invoice_id ?? null, payment.payment_date,
     payment.payment_type, payment.amount, payment.reference, payment.notes,
     payment.cheque_number ?? "", payment.bank_name ?? "", payment.clearance_date ?? ""]
  );
  const id = r.lastInsertId as number;
  enqueueSync("payments", "upsert", {
    id, agent_id: payment.agent_id, invoice_id: payment.invoice_id ?? null,
    payment_date: payment.payment_date, payment_type: payment.payment_type,
    amount: payment.amount, reference: payment.reference, notes: payment.notes,
    cheque_number: payment.cheque_number ?? "", bank_name: payment.bank_name ?? "",
    clearance_date: payment.clearance_date ?? "",
  }, "id").catch(() => {});
  // Auto-advance to 'paid' if this payment clears the invoice outstanding
  await autoMarkPaidIfSettled(d, payment.invoice_id);
  return id;
}

export async function deletePayment(id: number): Promise<void> {
  const d = await getDb();
  // Read linked invoice_id before deleting so we can resync the balance
  const rows = await d.select<{ invoice_id: number | null }[]>(
    "SELECT invoice_id FROM payments WHERE id=?", [id]
  );
  await d.execute("DELETE FROM payments WHERE id=?", [id]);
  if (rows.length) await syncInvoiceLiveBalance(d, rows[0].invoice_id);
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getDailyRevenue(days = 30): Promise<import("../types").DailyRevenue[]> {
  const d = await getDb();
  return d.select<import("../types").DailyRevenue[]>(`
    SELECT date(invoice_date) as day,
           COALESCE(SUM(invoice_total), 0) as total,
           COUNT(*) as count
    FROM invoices
    WHERE invoice_date >= date('now', '-${days} days')
      AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    GROUP BY date(invoice_date)
    ORDER BY day ASC
  `);
}

export async function getMonthlyRevenue(months = 6): Promise<import("../types").MonthlyRevenue[]> {
  const d = await getDb();
  return d.select<import("../types").MonthlyRevenue[]>(`
    SELECT strftime('%Y-%m', invoice_date) as month,
           COALESCE(SUM(invoice_total), 0) as total,
           COALESCE(SUM(
             cash_received + dlb_winning + nlb_winning
             + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = invoices.id), 0)
           ), 0) as collected
    FROM invoices
    WHERE invoice_date >= date('now', '-${months} months')
      AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    GROUP BY strftime('%Y-%m', invoice_date)
    ORDER BY month ASC
  `);
}

export async function getAgentPerformance(): Promise<import("../types").AgentPerformance[]> {
  const d = await getDb();
  return d.select<import("../types").AgentPerformance[]>(`
    SELECT
      a.name,
      COALESCE(SUM(i.invoice_total), 0) as total_value,
      COUNT(i.id) as invoice_count,
      COALESCE(SUM(CASE WHEN i.outstanding_balance > 0 THEN i.outstanding_balance ELSE 0 END), 0) as outstanding,
      CASE
        WHEN COALESCE(SUM(i.invoice_total), 0) > 0
        THEN ROUND((COALESCE(SUM(i.cash_received + i.dlb_winning + i.nlb_winning), 0) /
             COALESCE(SUM(i.invoice_total), 1)) * 100, 1)
        ELSE 0
      END as collection_rate
    FROM agents a
    LEFT JOIN invoices i ON i.agent_id = a.id
      AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    GROUP BY a.id, a.name
    ORDER BY total_value DESC
  `);
}

export async function getAgingReport(): Promise<import("../types").AgingEntry[]> {
  const d = await getDb();
  return d.select<import("../types").AgingEntry[]>(`
    SELECT
      a.id as agent_id,
      a.name,
      i.invoice_number,
      i.invoice_date,
      ROUND(MAX(0, i.outstanding_balance), 2) as outstanding_balance,
      CAST(julianday('now') - julianday(i.invoice_date) AS INTEGER) as days_old
    FROM invoices i
    JOIN agents a ON a.id = i.agent_id
    WHERE COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
      AND i.outstanding_balance > 0
    ORDER BY days_old DESC
  `);
}

export async function getGameBreakdown(): Promise<import("../types").GameBreakdown[]> {
  const d = await getDb();
  return d.select<import("../types").GameBreakdown[]>(`
    SELECT
      ii.ticket_name,
      COALESCE(SUM(ii.qty), 0)    as total_qty,
      COALESCE(SUM(ii.value), 0)  as total_value,
      COUNT(DISTINCT i.id)        as invoice_count,
      COALESCE(AVG(ii.unit_price), 0) as avg_unit_price
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE ii.ticket_name != ''
      AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    GROUP BY ii.ticket_name
    ORDER BY total_value DESC
    LIMIT 20
  `);
}

export async function getGlobalStats(): Promise<import("../types").GlobalStats> {
  const d = await getDb();
  const [inv, items] = await Promise.all([
    d.select<{
      total_invoice_value: number;
      total_cash_collected: number;
      total_winnings_returned: number;
      total_outstanding: number;
      total_invoices: number;
    }[]>(`
      SELECT
        COALESCE(SUM(invoice_total), 0)                     as total_invoice_value,
        COALESCE(SUM(cash_received), 0)                     as total_cash_collected,
        COALESCE(SUM(dlb_winning + nlb_winning), 0)         as total_winnings_returned,
        COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE 0 END), 0) as total_outstanding,
        COUNT(*)                                            as total_invoices
      FROM invoices
      WHERE COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `),
    d.select<{ total_tickets: number }[]>(`
      SELECT COALESCE(SUM(ii.qty), 0) as total_tickets
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `),
  ]);
  return {
    total_invoice_value: inv[0]?.total_invoice_value ?? 0,
    total_cash_collected: inv[0]?.total_cash_collected ?? 0,
    total_winnings_returned: inv[0]?.total_winnings_returned ?? 0,
    total_outstanding: inv[0]?.total_outstanding ?? 0,
    total_invoices: inv[0]?.total_invoices ?? 0,
    total_tickets_distributed: items[0]?.total_tickets ?? 0,
  };
}

export async function getNotifications(): Promise<{ pendingCount: number; lowStockCount: number; returnCount: number }> {
  const d = await getDb();
  const [pending, lowStock, returns] = await Promise.all([
    d.select<{ cnt: number }[]>(`
      SELECT COUNT(*) as cnt FROM invoices
      WHERE COALESCE(invoice_status,'paid') NOT IN ('draft','cancelled')
        AND outstanding_balance > 0
    `),
    d.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM inventory_batches WHERE (total_qty - distributed_qty) <= low_stock_threshold"),
    d.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM ticket_returns WHERE status='pending'"),
  ]);
  return {
    pendingCount: pending[0]?.cnt ?? 0,
    lowStockCount: lowStock[0]?.cnt ?? 0,
    returnCount: returns[0]?.cnt ?? 0,
  };
}

// ── Lottery Results (saved results) ──────────────────────────────────────────

export async function saveLotteryResult(r: import("../types").LotteryResult, gameSlug: string): Promise<void> {
  const d = await getDb();
  // Prefer r.game_slug (set by Rust) over the passed parameter — prevents slug drift
  const slug = r.game_slug || gameSlug;
  // Update if exists, else insert — compatible with all SQLite versions
  const args = [
    r.game_name, r.board, r.draw_number,
    r.winning_letter, JSON.stringify(r.winning_numbers),
    r.super_number, JSON.stringify(r.prizes),
    r.source_url === "Manual entry" ? "manual" : "fetched",
    slug, r.draw_date,
  ];
  const upd = await d.execute(
    `UPDATE lottery_results
     SET game_name=?, board=?, draw_number=?, winning_letter=?,
         winning_numbers=?, super_number=?, prizes=?, source=?,
         saved_at=CURRENT_TIMESTAMP
     WHERE game_slug=? AND draw_date=?`,
    args
  );
  if (!upd.rowsAffected) {
    await d.execute(
      `INSERT INTO lottery_results
         (game_slug, game_name, board, draw_number, draw_date,
          winning_letter, winning_numbers, super_number, prizes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug, r.game_name, r.board, r.draw_number, r.draw_date,
        r.winning_letter, JSON.stringify(r.winning_numbers),
        r.super_number, JSON.stringify(r.prizes),
        r.source_url === "Manual entry" ? "manual" : "fetched",
      ]
    );
  }
}

/** Get a result for a specific draw date (YYYY-MM-DD). Returns null if not found. */
export async function getLotteryResultByDate(gameSlug: string, date: string): Promise<import("../types").LotteryResult | null> {
  const d = await getDb();
  const rows = await d.select<{
    game_slug:string; game_name:string; board:string; draw_number:string; draw_date:string;
    winning_letter:string; winning_numbers:string; super_number:string;
    prizes:string; source:string; saved_at:string;
  }[]>(
    "SELECT * FROM lottery_results WHERE game_slug=? AND draw_date=? ORDER BY saved_at DESC LIMIT 1",
    [gameSlug, date]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    game_slug:       row.game_slug,
    game_name:       row.game_name,
    board:           row.board,
    draw_number:     row.draw_number,
    draw_date:       row.draw_date,
    winning_letter:  row.winning_letter,
    winning_numbers: JSON.parse(row.winning_numbers || "[]"),
    super_number:    row.super_number,
    prizes:          JSON.parse(row.prizes || "[]"),
    source_url:      "Database (saved)",
    fetched_at:      row.saved_at,
    error:           "",
  };
}

export async function getLatestLotteryResult(gameSlug: string): Promise<import("../types").LotteryResult | null> {
  const d = await getDb();
  const rows = await d.select<{
    game_slug:string; game_name:string; board:string; draw_number:string; draw_date:string;
    winning_letter:string; winning_numbers:string; super_number:string;
    prizes:string; source:string; saved_at:string;
  }[]>(
    "SELECT * FROM lottery_results WHERE game_slug=? ORDER BY saved_at DESC LIMIT 1",
    [gameSlug]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    game_slug:       row.game_slug,
    game_name:       row.game_name,
    board:           row.board,
    draw_number:     row.draw_number,
    draw_date:       row.draw_date,
    winning_letter:  row.winning_letter,
    winning_numbers: JSON.parse(row.winning_numbers || "[]"),
    super_number:    row.super_number,
    prizes:          JSON.parse(row.prizes || "[]"),
    source_url:      row.source === "manual" ? "Manual entry" : "Database (saved)",
    fetched_at:      row.saved_at,
    error:           "",
  };
}

export async function getAllSavedResults(): Promise<{ game_slug:string; game_name:string; board:string; draw_date:string; saved_at:string }[]> {
  const d = await getDb();
  return d.select(
    "SELECT game_slug, game_name, board, draw_date, saved_at FROM lottery_results ORDER BY saved_at DESC"
  );
}

// ── Ticket Returns ────────────────────────────────────────────────────────────

export async function getTicketReturns(agentId?: number) {
  const d = await getDb();
  if (agentId) {
    return d.select<import("../types").TicketReturn[]>(`
      SELECT r.*, a.name as agent_name, i.invoice_number
      FROM ticket_returns r
      LEFT JOIN agents a ON a.id = r.agent_id
      LEFT JOIN invoices i ON i.id = r.invoice_id
      WHERE r.agent_id = ?
      ORDER BY r.return_date DESC
    `, [agentId]);
  }
  return d.select<import("../types").TicketReturn[]>(`
    SELECT r.*, a.name as agent_name, i.invoice_number
    FROM ticket_returns r
    LEFT JOIN agents a ON a.id = r.agent_id
    LEFT JOIN invoices i ON i.id = r.invoice_id
    ORDER BY r.return_date DESC
  `);
}

export async function saveTicketReturn(ret: import("../types").TicketReturn): Promise<number> {
  const d = await getDb();
  const payload = {
    agent_id: ret.agent_id, invoice_id: ret.invoice_id ?? null, return_date: ret.return_date,
    game_name: ret.game_name, barcode_start: ret.barcode_start, barcode_end: ret.barcode_end,
    qty: ret.qty, unit_price: ret.unit_price, total_value: ret.total_value, status: ret.status,
    notes: ret.notes, return_reason: ret.return_reason ?? "unsold",
  };
  if (ret.id) {
    await d.execute(
      `UPDATE ticket_returns SET agent_id=?,invoice_id=?,return_date=?,game_name=?,
       barcode_start=?,barcode_end=?,qty=?,unit_price=?,total_value=?,status=?,notes=?,return_reason=? WHERE id=?`,
      [ret.agent_id,ret.invoice_id??null,ret.return_date,ret.game_name,
       ret.barcode_start,ret.barcode_end,ret.qty,ret.unit_price,ret.total_value,ret.status,ret.notes,
       ret.return_reason??'unsold', ret.id]
    );
    enqueueSync("ticket_returns","upsert",{ id:ret.id,...payload },"id").catch(()=>{});
    // If the status was changed to 'settled' via an edit, sync the invoice balance (H-11)
    if (ret.invoice_id) await syncInvoiceLiveBalance(d, ret.invoice_id);
    return ret.id;
  }
  const r = await d.execute(
    `INSERT INTO ticket_returns
     (agent_id,invoice_id,return_date,game_name,barcode_start,barcode_end,qty,unit_price,total_value,status,notes,return_reason)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ret.agent_id,ret.invoice_id??null,ret.return_date,ret.game_name,
     ret.barcode_start,ret.barcode_end,ret.qty,ret.unit_price,ret.total_value,ret.status,ret.notes,
     ret.return_reason??'unsold']
  );
  const id = r.lastInsertId as number;
  enqueueSync("ticket_returns","upsert",{ id,...payload },"id").catch(()=>{});
  return id;
}

export async function settleTicketReturn(id: number): Promise<void> {
  const d = await getDb();
  // Read the invoice_id before settling so we can check if it's now fully paid
  const rows = await d.select<{ invoice_id: number | null }[]>(
    "SELECT invoice_id FROM ticket_returns WHERE id=?", [id]
  );
  await d.execute("UPDATE ticket_returns SET status='settled' WHERE id=?", [id]);
  // Auto-advance invoice to 'paid' if this return clears the outstanding balance
  if (rows.length) await autoMarkPaidIfSettled(d, rows[0].invoice_id);
  // NOTE: Returned tickets are NOT automatically added back to inventory.
  // Ajith Rohana manually scans returned tickets, separates winners/cash-value tickets,
  // and discards the rest. Stock adjustments are made manually via the Inventory page
  // or via "Sync Stock" if needed.
}

export async function deleteTicketReturn(id: number): Promise<void> {
  const d = await getDb();
  // Read invoice_id before deleting so we can resync the balance afterwards (H-10)
  const rows = await d.select<{ invoice_id: number | null }[]>(
    "SELECT invoice_id FROM ticket_returns WHERE id=?", [id]
  );
  await d.execute("DELETE FROM ticket_returns WHERE id=?", [id]);
  // If the deleted return was settled, the invoice balance must go back up
  if (rows.length) await syncInvoiceLiveBalance(d, rows[0].invoice_id);
}

export async function getReturnSummary() {
  const d = await getDb();
  const rows = await d.select<{ status: string; qty: number; val: number }[]>(`
    SELECT status, COALESCE(SUM(qty),0) as qty, COALESCE(SUM(total_value),0) as val
    FROM ticket_returns GROUP BY status
  `);
  const p = rows.find((r) => r.status === "pending");
  const s = rows.find((r) => r.status === "settled");
  return { pending_qty: p?.qty??0, pending_value: p?.val??0, settled_qty: s?.qty??0, settled_value: s?.val??0 };
}

// ── Daily Collections ─────────────────────────────────────────────────────────

export async function getDailyCollections(date?: string) {
  const d = await getDb();
  const sql = date
    ? `SELECT dc.*,a.name as agent_name FROM daily_collections dc LEFT JOIN agents a ON a.id=dc.agent_id WHERE dc.collection_date=? ORDER BY dc.id ASC`
    : `SELECT dc.*,a.name as agent_name FROM daily_collections dc LEFT JOIN agents a ON a.id=dc.agent_id ORDER BY dc.collection_date DESC, dc.id ASC`;
  return d.select<import("../types").DailyCollection[]>(sql, date ? [date] : []);
}

export async function saveDailyCollection(col: import("../types").DailyCollection): Promise<number> {
  const d = await getDb();
  if (col.id) {
    await d.execute(
      `UPDATE daily_collections SET collection_date=?,collector_name=?,agent_id=?,
       cash_amount=?,cheque_amount=?,nlb_winning=?,dlb_winning=?,route=?,notes=?,
       cheque_number=?,bank_name=?,clearance_date=? WHERE id=?`,
      [col.collection_date,col.collector_name,col.agent_id,
       col.cash_amount,col.cheque_amount,col.nlb_winning,col.dlb_winning,col.route,col.notes,
       col.cheque_number??'', col.bank_name??'', col.clearance_date??'', col.id]
    );
    return col.id;
  }
  const r = await d.execute(
    `INSERT INTO daily_collections
     (collection_date,collector_name,agent_id,cash_amount,cheque_amount,nlb_winning,dlb_winning,route,notes,
      cheque_number,bank_name,clearance_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [col.collection_date,col.collector_name,col.agent_id,
     col.cash_amount,col.cheque_amount,col.nlb_winning,col.dlb_winning,col.route,col.notes,
     col.cheque_number??'', col.bank_name??'', col.clearance_date??'']
  );
  return r.lastInsertId as number;
}

export async function deleteDailyCollection(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM daily_collections WHERE id=?", [id]);
}

export async function getCollectionDates() {
  const d = await getDb();
  return d.select<{ date: string; total: number; count: number }[]>(`
    SELECT collection_date as date,
           SUM(cash_amount+cheque_amount+nlb_winning+dlb_winning) as total,
           COUNT(*) as count
    FROM daily_collections GROUP BY collection_date ORDER BY collection_date DESC LIMIT 30
  `);
}

// ── Commission Schemes ────────────────────────────────────────────────────────

export async function getCommissionSchemes() {
  const d = await getDb();
  return d.select<import("../types").CommissionScheme[]>(`
    SELECT cs.*, a.name as agent_name
    FROM commission_schemes cs
    LEFT JOIN agents a ON a.id = cs.agent_id
    ORDER BY cs.agent_id IS NULL DESC, cs.is_active DESC, a.name ASC
  `);
}

export async function saveCommissionScheme(s: import("../types").CommissionScheme): Promise<number> {
  const d = await getDb();
  if (s.id) {
    await d.execute(
      `UPDATE commission_schemes SET agent_id=?,scheme_name=?,commission_type=?,rate=?,
       effective_from=?,effective_to=?,is_active=?,notes=? WHERE id=?`,
      [s.agent_id,s.scheme_name,s.commission_type,s.rate,
       s.effective_from,s.effective_to??null,s.is_active,s.notes,s.id]
    );
    return s.id;
  }
  const r = await d.execute(
    `INSERT INTO commission_schemes (agent_id,scheme_name,commission_type,rate,effective_from,effective_to,is_active,notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [s.agent_id,s.scheme_name,s.commission_type,s.rate,
     s.effective_from,s.effective_to??null,s.is_active,s.notes]
  );
  return r.lastInsertId as number;
}

export async function deleteCommissionScheme(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM commission_schemes WHERE id=?", [id]);
}

export async function getCommissionReport(): Promise<import("../types").CommissionEntry[]> {
  const d = await getDb();
  const [invoices, schemes] = await Promise.all([
    d.select<{
      invoice_id: number; invoice_number: string; agent_id: number;
      agent_name: string; invoice_date: string; invoice_total: number; total_tickets: number;
    }[]>(`
      SELECT i.id as invoice_id, i.invoice_number, i.agent_id, a.name as agent_name,
             i.invoice_date, i.invoice_total,
             COALESCE((SELECT SUM(ii.qty) FROM invoice_items ii WHERE ii.invoice_id=i.id),0) as total_tickets
      FROM invoices i JOIN agents a ON a.id=i.agent_id
      WHERE COALESCE(i.invoice_status,'paid') NOT IN ('draft','cancelled')
      ORDER BY i.invoice_date DESC
    `),
    getCommissionSchemes(),
  ]);

  return invoices.map((inv) => {
    const scheme =
      schemes.find((s) => s.agent_id === inv.agent_id && s.is_active) ??
      schemes.find((s) => s.agent_id === null && s.is_active);
    const rate = scheme?.rate ?? 0;
    const commission_type = (scheme?.commission_type ?? "percentage") as import("../types").CommissionType;
    let commission_amount = 0;
    if (scheme) {
      if (commission_type === "percentage") commission_amount = (inv.invoice_total * rate) / 100;
      else if (commission_type === "per_ticket") commission_amount = inv.total_tickets * rate;
      else commission_amount = rate;
    }
    return { ...inv, commission_rate: rate, commission_type, commission_amount: Math.round(commission_amount * 100) / 100 };
  });
}

// ── Today Stats ───────────────────────────────────────────────────────────────

/** Aggregate stats filtered by period (days). Pass 36500 for "All". */
export async function getPeriodStats(days: number) {
  const d = await getDb();
  const since = days >= 36500
    ? "1900-01-01"
    : new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  const [inv, tickets] = await Promise.all([
    d.select<{
      invoice_count: number;
      total_invoiced: number;
      total_collected: number;
      total_outstanding: number;
    }[]>(`
      SELECT
        COUNT(*) as invoice_count,
        COALESCE(SUM(invoice_total), 0) as total_invoiced,
        COALESCE(SUM(cash_received + dlb_winning + nlb_winning), 0) as total_collected,
        COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE 0 END), 0) as total_outstanding
      FROM invoices
      WHERE invoice_date >= ?
        AND COALESCE(invoice_status,'paid') NOT IN ('draft','cancelled')
    `, [since]),
    d.select<{ qty: number }[]>(`
      SELECT COALESCE(SUM(ii.qty), 0) as qty
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.invoice_date >= ?
        AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `, [since]),
  ]);

  return {
    invoice_count:     inv[0]?.invoice_count ?? 0,
    total_invoiced:    inv[0]?.total_invoiced ?? 0,
    total_collected:   inv[0]?.total_collected ?? 0,
    total_outstanding: inv[0]?.total_outstanding ?? 0,
    total_tickets:     tickets[0]?.qty ?? 0,
  };
}

/** Recent invoices filtered by period. */
export async function getInvoicesByPeriod(days: number, limit = 6): Promise<import("../types").Invoice[]> {
  const d = await getDb();
  const since = days >= 36500
    ? "1900-01-01"
    : new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  return d.select<import("../types").Invoice[]>(`
    SELECT i.*, a.name as agent_name
    FROM invoices i
    LEFT JOIN agents a ON a.id = i.agent_id
    WHERE i.invoice_date >= ?
    ORDER BY i.id DESC
    LIMIT ?
  `, [since, limit]);
}

export async function getTodayStats() {
  const d = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const [inv, ret] = await Promise.all([
    d.select<{ cnt: number; total: number; cash: number; outstanding: number }[]>(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(invoice_total),0) as total,
             COALESCE(SUM(cash_received),0) as cash,
             COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE 0 END), 0) as outstanding
      FROM invoices WHERE invoice_date=?
        AND COALESCE(invoice_status,'paid') NOT IN ('draft','cancelled')
    `, [today]),
    d.select<{ cnt: number; val: number }[]>(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(total_value),0) as val FROM ticket_returns WHERE status='pending'
    `),
  ]);
  return {
    today_invoices: inv[0]?.cnt ?? 0,
    today_total: inv[0]?.total ?? 0,
    today_cash: inv[0]?.cash ?? 0,
    today_outstanding: inv[0]?.outstanding ?? 0,
    pending_returns: ret[0]?.cnt ?? 0,
    pending_return_value: ret[0]?.val ?? 0,
  };
}

// ── App Settings (key-value store) ───────────────────────────────────────────

export const SETTING_DEFAULTS: Record<string, string> = {
  invoice_prefix: "",
  invoice_auto_numbering: "true",
  default_prepared_by: "sameera",
  default_commission_type: "percentage",
  default_commission_rate: "5",
  credit_limits_enabled: "false",
  default_credit_limit: "500000",
  nlb_winning_validity_days: "90",
  dlb_winning_validity_days: "90",
  default_printer_type: "a4",
  show_company_logo: "false",
  show_terms: "false",
  terms_text: "All lottery tickets are sold as-is. No refunds after purchase.",
  bank_details: "",
  show_bank_details: "false",
  auto_print_on_save: "false",
  admin_pin: "",
  cashier_pin: "",
  auto_backup_enabled: "false",
  auto_backup_frequency: "daily",
};

export async function getAppSettings(): Promise<Record<string, string>> {
  const d = await getDb();
  const rows = await d.select<{ key: string; value: string }[]>("SELECT key, value FROM app_settings");
  const result: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
    [key, value]
  );
}

export async function saveSettings(settings: Record<string, string>): Promise<void> {
  const d = await getDb();
  for (const [key, value] of Object.entries(settings)) {
    await d.execute(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
      [key, value]
    );
  }
}

// ── Purchase Invoices (Nimalsiri → Ajith) ─────────────────────────────────────

export async function getPurchaseInvoices(): Promise<import("../types").PurchaseInvoice[]> {
  const d = await getDb();
  const invoices = await d.select<import("../types").PurchaseInvoice[]>(`
    SELECT pi.*,
      COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.purchase_id = pi.id), 0)
        as post_payments
    FROM purchase_invoices pi
    ORDER BY pi.purchase_date DESC, pi.id DESC
  `);

  // Load items + credited return credits for every purchase
  const withItems = await Promise.all(invoices.map(async inv => {
    const [items, returnCredits] = await Promise.all([
      d.select<import("../types").PurchaseInvoiceItem[]>(
        `SELECT id, purchase_id, game_name, barcode_start, barcode_end, qty, unit_price, value,
                draw_number, batch_number, ticket_start_no, ticket_end_no, books_qty, tickets_per_book
         FROM purchase_invoice_items WHERE purchase_id=? ORDER BY id ASC`,
        [inv.id]
      ),
      // Sum of supplier returns that were credited against this purchase
      d.select<{ credited: number }[]>(
        `SELECT COALESCE(SUM(total_value), 0) as credited
         FROM supplier_returns WHERE purchase_id=? AND status='credited'`,
        [inv.id]
      ),
    ]);
    const postPmts    = (inv as any).post_payments ?? 0;
    const returnCredit = returnCredits[0]?.credited ?? 0;
    // Live balance = invoice − cash paid − later payments − credited supplier returns
    const liveBalance  = Math.max(0, inv.invoice_total - inv.initial_payment - postPmts - returnCredit);
    return {
      ...inv,
      items,
      outstanding_balance: liveBalance,
      status: (liveBalance <= 0.005 ? "settled" : "pending") as "settled" | "pending",
    };
  }));

  return withItems;
}

export async function savePurchaseInvoice(
  inv: import("../types").PurchaseInvoice,
  items: import("../types").PurchaseInvoiceItem[]
): Promise<number> {
  const d = await getDb();
  const total = items.reduce((s, it) => s + it.value, 0);
  const balance = total - (inv.initial_payment ?? 0);
  const erpVals = [
    inv.supplier_ref ?? "", inv.tax_amount ?? 0,
    inv.handling_charge ?? 0, inv.warehouse_location ?? "",
  ];

  const insertItem = async (purchaseId: number, item: import("../types").PurchaseInvoiceItem) => {
    await d.execute(
      `INSERT INTO purchase_invoice_items
       (purchase_id,game_name,barcode_start,barcode_end,qty,unit_price,value,
        batch_number,ticket_start_no,ticket_end_no,books_qty,tickets_per_book,draw_number)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [purchaseId, item.game_name, item.barcode_start, item.barcode_end,
       item.qty, item.unit_price, item.value,
       item.batch_number ?? "", item.ticket_start_no ?? "", item.ticket_end_no ?? "",
       item.books_qty ?? 0, item.tickets_per_book ?? 100, item.draw_number ?? ""]
    );
  };

  if (inv.id) {
    await d.execute(
      `UPDATE purchase_invoices SET supplier_name=?,purchase_date=?,stock_date=?,
       invoice_total=?,initial_payment=?,outstanding_balance=?,status=?,notes=?,
       supplier_ref=?,tax_amount=?,handling_charge=?,warehouse_location=? WHERE id=?`,
      [inv.supplier_name, inv.purchase_date, inv.stock_date, total,
       inv.initial_payment, Math.max(0, balance),
       balance <= 0.005 ? 'settled' : 'pending', inv.notes,
       ...erpVals, inv.id]
    );
    await d.execute("DELETE FROM purchase_invoice_items WHERE purchase_id=?", [inv.id]);
    for (const item of items) await insertItem(inv.id, item);
    return inv.id;
  }

  const r = await d.execute(
    `INSERT INTO purchase_invoices
     (purchase_number,supplier_name,purchase_date,stock_date,
      invoice_total,initial_payment,outstanding_balance,status,notes,
      supplier_ref,tax_amount,handling_charge,warehouse_location)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [inv.purchase_number, inv.supplier_name, inv.purchase_date, inv.stock_date,
     total, inv.initial_payment, Math.max(0, balance),
     balance <= 0.005 ? 'settled' : 'pending', inv.notes,
     ...erpVals]
  );
  const newId = r.lastInsertId as number;
  for (const item of items) await insertItem(newId, item);
  // Each purchase item = its own inventory batch (never merge into existing).
  // This allows exact per-batch tracking: which invoices and returns came from which purchase.
  for (const item of items.filter(it => it.game_name && it.qty > 0)) {
    // Check if an identical batch already exists for this purchase (same game + same barcode start)
    // to avoid duplicates when re-saving the same purchase
    const duplicate = await d.select<{ id: number }[]>(
      "SELECT id FROM inventory_batches WHERE game_name=? AND barcode_start=?",
      [item.game_name, item.barcode_start ?? ""]
    );
    if (duplicate.length) {
      // Update the existing matching batch (re-save scenario)
      await d.execute(
        "UPDATE inventory_batches SET total_qty=?, barcode_end=?, unit_price=?, batch_date=? WHERE id=?",
        [item.qty, item.barcode_end ?? "", item.unit_price, inv.purchase_date, duplicate[0].id]
      );
      await enqueueBatchSync(d, duplicate[0].id);
    } else {
      // New purchase = new separate batch with its own barcode range
      const ins = await d.execute(
        `INSERT INTO inventory_batches
         (game_name, batch_date, barcode_start, barcode_end, total_qty, distributed_qty,
          unit_price, low_stock_threshold, notes)
         VALUES (?, ?, ?, ?, ?, 0, ?, 100, ?)`,
        [item.game_name, inv.purchase_date,
         item.barcode_start ?? "", item.barcode_end ?? "",
         item.qty, item.unit_price,
         `From purchase ${inv.purchase_number}`]
      );
      await enqueueBatchSync(d, ins.lastInsertId as number);
    }
  }
  return newId;
}

export async function deletePurchaseInvoice(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM purchase_invoice_items WHERE purchase_id=?", [id]);
  await d.execute("DELETE FROM purchase_payments WHERE purchase_id=?", [id]);
  await d.execute("DELETE FROM purchase_invoices WHERE id=?", [id]);
}

export async function getPurchasePayments(purchaseId?: number): Promise<import("../types").PurchasePayment[]> {
  const d = await getDb();
  if (purchaseId) {
    return d.select<import("../types").PurchasePayment[]>(
      `SELECT pp.*, pi.purchase_number FROM purchase_payments pp
       LEFT JOIN purchase_invoices pi ON pi.id = pp.purchase_id
       WHERE pp.purchase_id=? ORDER BY pp.payment_date DESC, pp.id DESC`,
      [purchaseId]
    );
  }
  return d.select<import("../types").PurchasePayment[]>(
    `SELECT pp.*, pi.purchase_number FROM purchase_payments pp
     LEFT JOIN purchase_invoices pi ON pi.id = pp.purchase_id
     ORDER BY pp.payment_date DESC, pp.id DESC`
  );
}

export async function savePurchasePayment(payment: import("../types").PurchasePayment): Promise<number> {
  const d = await getDb();
  const r = await d.execute(
    `INSERT INTO purchase_payments (purchase_id,payment_date,payment_type,amount,reference,notes)
     VALUES (?,?,?,?,?,?)`,
    [payment.purchase_id, payment.payment_date, payment.payment_type,
     payment.amount, payment.reference, payment.notes]
  );
  return r.lastInsertId as number;
}

export async function deletePurchasePayment(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM purchase_payments WHERE id=?", [id]);
}

export async function getNextPurchaseNumber(): Promise<string> {
  const d = await getDb();
  const rows = await d.select<{ max_num: string | null }[]>(
    "SELECT MAX(CAST(SUBSTR(purchase_number,3) AS INTEGER)) as max_num FROM purchase_invoices WHERE purchase_number LIKE 'PO%'"
  );
  const last = parseInt(rows[0]?.max_num ?? "0", 10);
  return `PO${String(last + 1).padStart(4, "0")}`;
}

/** Total currently owed to Nimalsiri (live, includes post-invoice payments). */
export async function getSupplierOutstanding(): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ total: number }[]>(`
    SELECT COALESCE(SUM(
      pi.invoice_total - pi.initial_payment
      - COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.purchase_id = pi.id), 0)
      - COALESCE((SELECT SUM(sr.total_value) FROM supplier_returns sr WHERE sr.purchase_id = pi.id AND sr.status = 'credited'), 0)
    ), 0) as total
    FROM purchase_invoices pi
  `);
  return Math.max(0, rows[0]?.total ?? 0);
}

// ── Supplier Aging (Nimalsiri dues by age bracket) ────────────────────────────

export interface SupplierAgingBracket {
  bracket: string;
  days_min: number;
  days_max: number;
  count: number;
  total_outstanding: number;
}

export async function getSupplierAging(): Promise<SupplierAgingBracket[]> {
  const d = await getDb();
  const rows = await d.select<{
    purchase_date: string;
    live_outstanding: number;
  }[]>(`
    SELECT
      pi.purchase_date,
      pi.invoice_total - pi.initial_payment
        - COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.purchase_id = pi.id), 0)
        - COALESCE((SELECT SUM(sr.total_value) FROM supplier_returns sr WHERE sr.purchase_id = pi.id AND sr.status = 'credited'), 0)
        as live_outstanding
    FROM purchase_invoices pi
    WHERE pi.invoice_total - pi.initial_payment
        - COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.purchase_id = pi.id), 0)
        - COALESCE((SELECT SUM(sr.total_value) FROM supplier_returns sr WHERE sr.purchase_id = pi.id AND sr.status = 'credited'), 0)
        > 0.005
  `);

  const brackets: SupplierAgingBracket[] = [
    { bracket: "0–7 days",   days_min: 0,  days_max: 7,   count: 0, total_outstanding: 0 },
    { bracket: "8–14 days",  days_min: 8,  days_max: 14,  count: 0, total_outstanding: 0 },
    { bracket: "15–30 days", days_min: 15, days_max: 30,  count: 0, total_outstanding: 0 },
    { bracket: "31–60 days", days_min: 31, days_max: 60,  count: 0, total_outstanding: 0 },
    { bracket: "60+ days",   days_min: 61, days_max: 9999, count: 0, total_outstanding: 0 },
  ];

  const now = Date.now();
  for (const row of rows) {
    const days = Math.round((now - new Date(row.purchase_date).getTime()) / 86400000);
    const b = brackets.find(b => days >= b.days_min && days <= b.days_max);
    if (b) { b.count++; b.total_outstanding += row.live_outstanding; }
  }
  return brackets.filter(b => b.count > 0);
}

// ── Profit Analytics ──────────────────────────────────────────────────────────

export interface ProfitSummary {
  period_days: number;
  total_revenue: number;        // cash collected from agents (invoices)
  total_cost: number;           // stock purchased from Nimalsiri
  gross_profit: number;
  total_commission: number;     // commission paid out to agents
  net_profit: number;
  margin_pct: number;
  invoice_count: number;
  purchase_count: number;
}

export async function getProfitSummary(days: number): Promise<ProfitSummary> {
  const d = await getDb();
  const since = days >= 36500
    ? "1900-01-01"
    : new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  const [rev, cogs, comm, purchases] = await Promise.all([
    // Revenue = invoice totals (accrual: tickets billed to agents, not just cash collected)
    // Excludes draft/cancelled so only real deliveries count
    d.select<{ total: number; collected: number; cnt: number }[]>(`
      SELECT
        COALESCE(SUM(invoice_total), 0) as total,
        COALESCE(SUM(cash_received + dlb_winning + nlb_winning), 0) as collected,
        COUNT(*) as cnt
      FROM invoices
      WHERE invoice_date >= ?
        AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `, [since]),

    // COGS = qty × Nimalsiri cost price (what Ajith actually paid per ticket)
    // Joins to lottery_games to get cost_price; falls back to unit_price if cost_price not set
    d.select<{ total: number }[]>(`
      SELECT COALESCE(SUM(
        ii.qty * COALESCE(NULLIF(lg.cost_price, 0), lg.unit_price, ii.unit_price)
      ), 0) as total
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      LEFT JOIN lottery_games lg ON lg.name = ii.ticket_name
      WHERE i.invoice_date >= ?
        AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `, [since]),

    // Commission paid out
    d.select<{ total: number }[]>(`
      SELECT COALESCE(SUM(
        CASE cs.commission_type
          WHEN 'percentage' THEN i.invoice_total * cs.rate / 100.0
          WHEN 'per_ticket' THEN (
            SELECT COALESCE(SUM(ii.qty), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id
          ) * cs.rate
          ELSE cs.rate
        END
      ), 0) as total
      FROM invoices i
      -- Correlated subquery selects exactly ONE scheme per invoice:
      -- agent-specific (agent_id = i.agent_id) wins over the NULL default.
      -- ORDER BY agent_id IS NULL ASC puts non-NULL rows first (IS NULL = 0 < 1).
      LEFT JOIN commission_schemes cs ON cs.id = (
        SELECT id FROM commission_schemes
        WHERE (agent_id = i.agent_id OR agent_id IS NULL)
          AND is_active = 1
        ORDER BY agent_id IS NULL ASC
        LIMIT 1
      )
      WHERE i.invoice_date >= ?
        AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `, [since]),

    // Purchases count — for reference display only (not used in profit formula)
    d.select<{ cnt: number; total: number }[]>(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(invoice_total), 0) as total
      FROM purchase_invoices WHERE purchase_date >= ?
    `, [since]),
  ]);

  const revenue      = rev[0]?.total ?? 0;
  const cogs_total   = cogs[0]?.total ?? 0;
  const commission   = comm[0]?.total ?? 0;
  // Gross profit = selling price to agents − cost of those same tickets to Ajith
  // Since both are at face value, gross margin shows the discount Ajith absorbed
  const gross        = revenue - cogs_total;
  const net          = gross - commission;
  const margin       = revenue > 0 ? (net / revenue) * 100 : 0;

  return {
    period_days:       days,
    total_revenue:     revenue,
    total_cost:        cogs_total,
    gross_profit:      gross,
    total_commission:  commission,
    net_profit:        net,
    margin_pct:        Math.round(margin * 10) / 10,
    invoice_count:     rev[0]?.cnt ?? 0,
    purchase_count:    purchases[0]?.cnt ?? 0,
  };
}

export async function getDailyProfitTrend(days: number): Promise<{
  day: string; revenue: number; cost: number; net: number;
}[]> {
  const d = await getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  const [rev, costs] = await Promise.all([
    // Revenue = invoice totals per day (accrual), excluding draft/cancelled
    d.select<{ day: string; revenue: number }[]>(`
      SELECT date(invoice_date) as day,
             COALESCE(SUM(invoice_total), 0) as revenue
      FROM invoices
      WHERE invoice_date >= ?
        AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
      GROUP BY date(invoice_date) ORDER BY day ASC
    `, [since]),
    // COGS = qty × Nimalsiri cost price per day
    d.select<{ day: string; cost: number }[]>(`
      SELECT date(i.invoice_date) as day,
             COALESCE(SUM(ii.qty * COALESCE(NULLIF(lg.cost_price, 0), lg.unit_price, ii.unit_price)), 0) as cost
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      LEFT JOIN lottery_games lg ON lg.name = ii.ticket_name
      WHERE i.invoice_date >= ?
        AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
      GROUP BY date(i.invoice_date) ORDER BY day ASC
    `, [since]),
  ]);

  const map = new Map<string, { revenue: number; cost: number }>();
  // M-15: seed every day in the requested range so the chart has no gaps
  for (let i = 0; i <= days; i++) {
    const d2 = new Date(Date.now() - (days - i) * 86400000).toISOString().split("T")[0];
    map.set(d2, { revenue: 0, cost: 0 });
  }
  for (const r of rev) map.set(r.day, { revenue: r.revenue, cost: map.get(r.day)?.cost ?? 0 });
  for (const c of costs) {
    const e = map.get(c.day) ?? { revenue: 0, cost: 0 };
    e.cost = c.cost;
    map.set(c.day, e);
  }
  return Array.from(map.entries())
    .map(([day, v]) => ({ day, revenue: v.revenue, cost: v.cost, net: v.revenue - v.cost }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// ── Workers & Payroll ─────────────────────────────────────────────────────────

export async function getWorkers(): Promise<import("../types").Worker[]> {
  const d = await getDb();
  return d.select<import("../types").Worker[]>(
    "SELECT * FROM workers ORDER BY is_active DESC, name ASC"
  );
}

export async function saveWorker(w: import("../types").Worker): Promise<number> {
  const d = await getDb();
  const vals = [
    w.name, w.role, w.basic_salary, w.bank_name, w.bank_account, w.nic_number,
    w.photo, w.work_start_date, w.work_end_date,
    w.transport_allowance, w.meal_allowance, w.other_allowances,
    w.is_active, w.notes,
  ];
  if (w.id) {
    await d.execute(
      `UPDATE workers SET name=?,role=?,basic_salary=?,bank_name=?,bank_account=?,nic_number=?,
       photo=?,work_start_date=?,work_end_date=?,transport_allowance=?,meal_allowance=?,
       other_allowances=?,is_active=?,notes=? WHERE id=?`,
      [...vals, w.id]
    );
    return w.id;
  }
  const r = await d.execute(
    `INSERT INTO workers (name,role,basic_salary,bank_name,bank_account,nic_number,
     photo,work_start_date,work_end_date,transport_allowance,meal_allowance,
     other_allowances,is_active,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    vals
  );
  return r.lastInsertId as number;
}

export async function deleteWorker(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM worker_salaries WHERE worker_id=?", [id]);
  await d.execute("DELETE FROM workers WHERE id=?", [id]);
}

export async function getWorkerSalaries(month?: string): Promise<import("../types").WorkerSalary[]> {
  const d = await getDb();
  const sql = month
    ? `SELECT ws.*, w.name as worker_name, w.role as worker_role
       FROM worker_salaries ws JOIN workers w ON w.id=ws.worker_id
       WHERE ws.month=? ORDER BY w.name ASC`
    : `SELECT ws.*, w.name as worker_name, w.role as worker_role
       FROM worker_salaries ws JOIN workers w ON w.id=ws.worker_id
       ORDER BY ws.month DESC, w.name ASC`;
  return d.select<import("../types").WorkerSalary[]>(sql, month ? [month] : []);
}

export async function saveWorkerSalary(s: import("../types").WorkerSalary): Promise<number> {
  const d = await getDb();
  const totalEarnings = s.basic_salary + s.transport_allowance + s.meal_allowance +
    s.overtime_pay + s.other_allowances;
  const net = totalEarnings - s.deductions - s.advance_paid;

  // Try update first (worker_id + month unique)
  const upd = await d.execute(
    `UPDATE worker_salaries SET basic_salary=?,transport_allowance=?,meal_allowance=?,
     overtime_pay=?,other_allowances=?,total_earnings=?,deductions=?,advance_paid=?,
     net_salary=?,status=?,paid_date=?,notes=? WHERE worker_id=? AND month=?`,
    [s.basic_salary, s.transport_allowance, s.meal_allowance, s.overtime_pay,
     s.other_allowances, totalEarnings, s.deductions, s.advance_paid, net,
     s.status, s.paid_date, s.notes, s.worker_id, s.month]
  );
  if (upd.rowsAffected) return s.id ?? 0;

  const r = await d.execute(
    `INSERT INTO worker_salaries
     (worker_id,month,basic_salary,transport_allowance,meal_allowance,overtime_pay,
      other_allowances,total_earnings,deductions,advance_paid,net_salary,status,paid_date,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [s.worker_id, s.month, s.basic_salary, s.transport_allowance, s.meal_allowance,
     s.overtime_pay, s.other_allowances, totalEarnings, s.deductions, s.advance_paid,
     net, s.status, s.paid_date, s.notes]
  );
  return r.lastInsertId as number;
}

export async function markSalaryPaid(workerId: number, month: string): Promise<void> {
  const d = await getDb();
  const today = new Date().toISOString().split("T")[0];
  await d.execute(
    "UPDATE worker_salaries SET status='paid', paid_date=? WHERE worker_id=? AND month=?",
    [today, workerId, month]
  );
}

/** Monthly payroll summary for cash-flow panel */
export async function getPayrollSummary(month: string): Promise<{
  total_payroll: number; pending: number; paid: number; worker_count: number;
  pending_count: number; paid_count: number;
}> {
  const d = await getDb();
  const rows = await d.select<{ status: string; total: number; cnt: number }[]>(`
    SELECT status, COALESCE(SUM(net_salary),0) as total, COUNT(*) as cnt
    FROM worker_salaries WHERE month=? GROUP BY status
  `, [month]);
  const pending = rows.find(r => r.status === "pending");
  const paid    = rows.find(r => r.status === "paid");
  return {
    total_payroll:  (pending?.total ?? 0) + (paid?.total ?? 0),
    pending:        pending?.total ?? 0,
    paid:           paid?.total    ?? 0,
    worker_count:   (pending?.cnt ?? 0) + (paid?.cnt ?? 0),
    pending_count:  pending?.cnt ?? 0,
    paid_count:     paid?.cnt    ?? 0,
  };
}

/** Prefill a payroll month from worker base salaries */
export async function generateMonthlyPayroll(month: string): Promise<void> {
  const d = await getDb();
  const workers = await getWorkers();
  for (const w of workers) {
    if (!w.is_active) continue;
    // Skip if already exists
    const exists = await d.select<{ id: number }[]>(
      "SELECT id FROM worker_salaries WHERE worker_id=? AND month=?", [w.id, month]
    );
    if (exists.length) continue;
    const total = w.basic_salary + w.transport_allowance + w.meal_allowance + w.other_allowances;
    await d.execute(
      `INSERT INTO worker_salaries
       (worker_id,month,basic_salary,transport_allowance,meal_allowance,overtime_pay,
        other_allowances,total_earnings,deductions,advance_paid,net_salary,status,paid_date,notes)
       VALUES (?,?,?,?,?,?,?,?,0,0,?,  'pending','','')`,
      [w.id, month, w.basic_salary, w.transport_allowance, w.meal_allowance, 0,
       w.other_allowances, total, total]
    );
  }
}

// ── AI Analytics data queries ─────────────────────────────────────────────────

export interface AgentRiskScore {
  agent_id: number;
  name: string;
  live_outstanding: number;
  max_days_overdue: number;
  invoice_count: number;
  risk_level: "low" | "medium" | "high" | "critical";
}

export async function getAgentRiskScores(): Promise<AgentRiskScore[]> {
  const d = await getDb();
  const rows = await d.select<{
    agent_id: number; name: string; live_outstanding: number;
    max_days: number; invoice_count: number;
  }[]>(`
    SELECT
      a.id as agent_id, a.name,
      COALESCE(SUM(
        i.outstanding_balance
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0)
        - COALESCE((SELECT SUM(tr.total_value) FROM ticket_returns tr
                    WHERE tr.invoice_id=i.id AND tr.status='settled'),0)
      ),0) as live_outstanding,
      COALESCE(MAX(CAST(julianday('now') - julianday(i.invoice_date) AS INTEGER)),0) as max_days,
      COUNT(i.id) as invoice_count
    FROM agents a
    LEFT JOIN invoices i ON i.agent_id=a.id
    WHERE i.outstanding_balance > 0
    GROUP BY a.id, a.name
    ORDER BY live_outstanding DESC
  `);
  return rows.map(r => ({
    agent_id: r.agent_id,
    name: r.name,
    live_outstanding: Math.max(0, r.live_outstanding),
    max_days_overdue: r.max_days,
    invoice_count: r.invoice_count,
    risk_level: (r.live_outstanding > 100000 || r.max_days > 30
      ? "critical" : r.live_outstanding > 50000 || r.max_days > 14
      ? "high" : r.live_outstanding > 20000 || r.max_days > 7
      ? "medium" : "low") as AgentRiskScore["risk_level"],
  }));
}

export async function getInventoryVelocity(): Promise<{
  game_name: string; total_qty: number; distributed_qty: number;
  velocity_pct: number; days_remaining: number;
}[]> {
  const d = await getDb();
  return d.select(`
    SELECT game_name,
           SUM(total_qty) as total_qty,
           SUM(distributed_qty) as distributed_qty,
           CASE WHEN SUM(total_qty)>0
             THEN ROUND(CAST(SUM(distributed_qty) AS REAL)/SUM(total_qty)*100,1)
             ELSE 0 END as velocity_pct,
           CASE WHEN SUM(distributed_qty)>0
             THEN ROUND(
               (SUM(total_qty)-SUM(distributed_qty)) /
               (CAST(SUM(distributed_qty) AS REAL) /
               CAST(MAX(CAST(julianday('now')-julianday(batch_date) AS INTEGER)+1) AS REAL))
             )
             ELSE 999 END as days_remaining
    FROM inventory_batches
    GROUP BY game_name
    ORDER BY velocity_pct DESC
  `);
}

export async function getMonthlyRevenueTrend(months = 6): Promise<{
  month: string; revenue: number; cost: number; salary: number; net: number;
}[]> {
  const d = await getDb();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().substring(0, 7);

  const [rev, costs, salaries] = await Promise.all([
    d.select<{ month: string; revenue: number }[]>(`
      SELECT strftime('%Y-%m', invoice_date) as month,
             COALESCE(SUM(invoice_total),0) as revenue
      FROM invoices WHERE strftime('%Y-%m', invoice_date) >= ?
        AND COALESCE(invoice_status,'paid') NOT IN ('draft','cancelled')
      GROUP BY month ORDER BY month ASC
    `, [sinceStr]),
    d.select<{ month: string; cost: number }[]>(`
      SELECT strftime('%Y-%m', purchase_date) as month,
             COALESCE(SUM(invoice_total),0) as cost
      FROM purchase_invoices WHERE strftime('%Y-%m', purchase_date) >= ?
      GROUP BY month ORDER BY month ASC
    `, [sinceStr]),
    d.select<{ month: string; salary: number }[]>(`
      SELECT month, COALESCE(SUM(net_salary),0) as salary
      FROM worker_salaries WHERE month >= ?
      GROUP BY month ORDER BY month ASC
    `, [sinceStr]),
  ]);

  const map = new Map<string, { revenue: number; cost: number; salary: number }>();
  for (const r of rev) map.set(r.month, { revenue: r.revenue, cost: 0, salary: 0 });
  for (const c of costs) { const e = map.get(c.month) ?? { revenue: 0, cost: 0, salary: 0 }; e.cost = c.cost; map.set(c.month, e); }
  for (const s of salaries) { const e = map.get(s.month) ?? { revenue: 0, cost: 0, salary: 0 }; e.salary = s.salary; map.set(s.month, e); }

  return Array.from(map.entries())
    .map(([month, v]) => ({ month, revenue: v.revenue, cost: v.cost, salary: v.salary, net: v.revenue - v.cost - v.salary }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── Retroactive Inventory Sync ────────────────────────────────────────────────
// Recalculates inventory_batches based on all existing transactions.
// Run this once to repair stock counts from data created before the auto-sync
// code was added, or any time the numbers look wrong.

export interface InventorySyncResult {
  gamesProcessed: number;
  batchesUpdated: number;
  errors: string[];
}

export async function syncInventoryFromTransactions(): Promise<InventorySyncResult> {
  const d = await getDb();
  const result: InventorySyncResult = { gamesProcessed: 0, batchesUpdated: 0, errors: [] };

  try {
    // Step 1: Get every distinct game that appears in purchase_invoice_items
    const purchasedGames = await d.select<{ game_name: string; total_purchased: number }[]>(`
      SELECT game_name, COALESCE(SUM(qty), 0) as total_purchased
      FROM purchase_invoice_items
      GROUP BY game_name
    `);

    for (const { game_name, total_purchased } of purchasedGames) {
      result.gamesProcessed++;
      try {
        // Step 2: How many were distributed to agents (confirmed/paid invoices only — not draft/cancelled)
        const [distRow] = await d.select<{ distributed: number }[]>(`
          SELECT COALESCE(SUM(ii.qty), 0) as distributed
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.ticket_name = ?
            AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
        `, [game_name]);
        const distributed = distRow?.distributed ?? 0;

        // Step 3: How many were returned to supplier (stock permanently removed — H-5 fix)
        // Agent returns are intentionally excluded: returned tickets need manual inspection
        // before Ajith decides whether to re-stock them. Including them here would
        // automatically put returned (possibly damaged/won) tickets back into available stock.
        const [suppRetRow] = await d.select<{ returned: number }[]>(`
          SELECT COALESCE(SUM(qty), 0) as returned
          FROM supplier_returns
          WHERE game_name = ? AND status = 'credited'
        `, [game_name]);
        const supplierReturned = suppRetRow?.returned ?? 0;

        // Step 4: Repair each batch individually using its own purchase_invoice_items data.
        // Each batch = one purchase line identified by (game_name, barcode_start).
        // Supplier returns are applied proportionally across batches (oldest first).
        const allBatches = await d.select<{ id: number; barcode_start: string }[]>(
          "SELECT id, barcode_start FROM inventory_batches WHERE game_name = ? ORDER BY batch_date ASC",
          [game_name]
        );

        if (allBatches.length > 0) {
          let remainingReturns = supplierReturned; // distribute supplier returns from oldest batch
          for (const batch of allBatches) {
            // Get purchased qty for this specific barcode range
            const [pRow] = await d.select<{ purchased: number }[]>(
              `SELECT COALESCE(SUM(qty),0) as purchased FROM purchase_invoice_items WHERE game_name=? AND barcode_start=?`,
              [game_name, batch.barcode_start]
            );
            const batchPurchased = pRow?.purchased ?? 0;

            // Apply supplier returns to oldest batch first
            const batchReturned = Math.min(remainingReturns, batchPurchased);
            remainingReturns = Math.max(0, remainingReturns - batchReturned);
            const batchTotal = Math.max(0, batchPurchased - batchReturned);

            // Sold from invoices that selected this specific batch
            const [sRow] = await d.select<{ sold: number }[]>(`
              SELECT COALESCE(SUM(ii.qty),0) as sold
              FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
              WHERE ii.purchase_batch_id=?
                AND COALESCE(i.invoice_status,'paid') NOT IN ('draft','cancelled')
            `, [batch.id]);
            const batchSold = Math.min(batchTotal, sRow?.sold ?? 0);

            await d.execute(
              "UPDATE inventory_batches SET total_qty = ?, distributed_qty = ? WHERE id = ?",
              [batchTotal, batchSold, batch.id]
            );
            await enqueueBatchSync(d, batch.id);
          }
        } else if (total_purchased > 0) {
          // No batches exist — create one canonical batch
          const correctTotal       = Math.max(0, total_purchased - supplierReturned);
          const correctDistributed = Math.max(0, Math.min(correctTotal, distributed));
          const ins = await d.execute(
            `INSERT INTO inventory_batches
             (game_name, batch_date, barcode_start, barcode_end, total_qty, distributed_qty, unit_price, low_stock_threshold, notes)
             VALUES (?, date('now'), '', '', ?, ?, 32.50, 100, 'Auto-synced from transactions')`,
            [game_name, correctTotal, correctDistributed]
          );
          await enqueueBatchSync(d, ins.lastInsertId as number);
        }
        result.batchesUpdated++;
      } catch (e) {
        result.errors.push(`${game_name}: ${String(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`Global sync error: ${String(e)}`);
  }

  return result;
}

/** Re-read a batch row and enqueue it for Supabase sync (H-9). */
async function enqueueBatchSync(d: Awaited<ReturnType<typeof getDb>>, batchId: number): Promise<void> {
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM inventory_batches WHERE id=?", [batchId]
  );
  if (rows.length) enqueueSync("inventory_batches", "upsert", rows[0], "id").catch(() => {});
}

// ── Invoice Status Workflow ───────────────────────────────────────────────────

/**
 * Reconcile ALL invoices: recompute every invoice's outstanding_balance
 * from actual payments + settled returns, write it back, and auto-advance
 * waiting/confirmed invoices to 'paid' when fully settled.
 * Run this once to fix historical data, or after any bulk import.
 * Returns the number of invoices whose status changed to 'paid'.
 */
export async function reconcilePaidInvoices(): Promise<number> {
  const d = await getDb();
  // Fetch all non-draft, non-cancelled invoices
  const invoices = await d.select<{ id: number; invoice_status: string }[]>(`
    SELECT id, invoice_status FROM invoices
    WHERE invoice_status NOT IN ('draft', 'cancelled')
  `);
  let changed = 0;
  for (const { id, invoice_status } of invoices) {
    const before = invoice_status;
    await syncInvoiceLiveBalance(d, id);
    // Check if status changed
    const after = await d.select<{ invoice_status: string }[]>(
      "SELECT invoice_status FROM invoices WHERE id=?", [id]
    );
    if (after[0]?.invoice_status === "paid" && before !== "paid") changed++;
  }
  return changed;
}

/** Move a draft invoice to Waiting — and decrement inventory stock (FIFO multi-batch) */
export async function confirmInvoice(id: number): Promise<void> {
  const d = await getDb();
  // Only confirm if currently draft
  const before = await d.select<{ invoice_status: string }[]>(
    "SELECT invoice_status FROM invoices WHERE id=?", [id]
  );
  if (!before.length || before[0].invoice_status !== "draft") return;

  await d.execute(
    "UPDATE invoices SET invoice_status='confirmed' WHERE id=? AND invoice_status='draft'", [id]
  );
  enqueueSync("invoices","upsert",{ id, invoice_status: "confirmed" },"id").catch(()=>{});

  // Decrement inventory stock: use the specific batch the user picked (purchase_batch_id),
  // or fall back to FIFO across batches when no batch was chosen.
  const items = await d.select<{ ticket_name: string; qty: number; purchase_batch_id: number | null }[]>(
    "SELECT ticket_name, qty, purchase_batch_id FROM invoice_items WHERE invoice_id=? AND ticket_name != '' AND qty > 0", [id]
  );
  for (const item of items) {
    if (item.purchase_batch_id) {
      // Deduct from the exact batch the user selected — preserves per-batch accuracy
      await d.execute(
        "UPDATE inventory_batches SET distributed_qty = distributed_qty + ? WHERE id = ?",
        [item.qty, item.purchase_batch_id]
      );
      await enqueueBatchSync(d, item.purchase_batch_id);
    } else {
      // No batch selected — fall back to FIFO across all batches for this game
      let remaining = item.qty;
      while (remaining > 0) {
        const batches = await d.select<{ id: number; available: number }[]>(`
          SELECT id, (total_qty - distributed_qty) AS available
          FROM inventory_batches
          WHERE game_name = ? AND (total_qty - distributed_qty) > 0
          ORDER BY batch_date ASC LIMIT 1
        `, [item.ticket_name]);
        if (!batches.length) break;
        const toDeduct = Math.min(remaining, batches[0].available);
        await d.execute(
          "UPDATE inventory_batches SET distributed_qty = distributed_qty + ? WHERE id = ?",
          [toDeduct, batches[0].id]
        );
        await enqueueBatchSync(d, batches[0].id);
        remaining -= toDeduct;
      }
    }
  }
}

/** Move a waiting/confirmed invoice to Paid */
export async function markInvoicePaid(id: number): Promise<void> {
  const d = await getDb();
  // 'draft' intentionally excluded — a draft must go through confirmInvoice first
  // so that inventory stock is properly decremented before being marked paid.
  await d.execute(
    "UPDATE invoices SET invoice_status='paid' WHERE id=? AND invoice_status='confirmed'", [id]
  );
  enqueueSync("invoices","upsert",{ id, invoice_status: "paid" },"id").catch(()=>{});
}

/** Cancel an invoice — if it was already confirmed/waiting/paid, restore inventory stock */
export async function cancelInvoice(id: number): Promise<void> {
  const d = await getDb();
  // Read current status before cancelling
  const before = await d.select<{ invoice_status: string }[]>(
    "SELECT invoice_status FROM invoices WHERE id=?", [id]
  );
  if (!before.length) return;
  const prevStatus = before[0].invoice_status;

  const result = await d.execute(
    "UPDATE invoices SET invoice_status='cancelled' WHERE id=? AND invoice_status != 'paid'", [id]
  );
  if ((result.rowsAffected ?? 0) > 0)
    enqueueSync("invoices","upsert",{ id, invoice_status: "cancelled" },"id").catch(()=>{});

  // Restore inventory only if the UPDATE actually changed a row (i.e., invoice was not already paid)
  // AND the previous status had stock decremented (waiting/confirmed — not draft which never decrements).
  const rowChanged = (result.rowsAffected ?? 0) > 0;
  const wasActive  = rowChanged && ["waiting", "confirmed"].includes(prevStatus);
  if (wasActive) {
    const items = await d.select<{ ticket_name: string; qty: number }[]>(
      "SELECT ticket_name, qty FROM invoice_items WHERE invoice_id=? AND ticket_name != '' AND qty > 0", [id]
    );
    // Greedy reverse-FIFO restore: confirmInvoice consumed oldest→newest, so
    // cancelInvoice restores newest→oldest. This correctly undoes whichever
    // batches were actually filled at confirmation time, even across multiple batches.
    for (const item of items) {
      let remaining = item.qty;
      while (remaining > 0) {
        // Pick the NEWEST batch that still has distributed stock to give back
        const batches = await d.select<{ id: number; distributed: number }[]>(`
          SELECT id, distributed_qty AS distributed
          FROM inventory_batches
          WHERE game_name = ? AND distributed_qty > 0
          ORDER BY batch_date DESC LIMIT 1
        `, [item.ticket_name]);

        if (!batches.length) break;

        const toRestore = Math.min(remaining, batches[0].distributed);
        await d.execute(
          "UPDATE inventory_batches SET distributed_qty = distributed_qty - ? WHERE id = ?",
          [toRestore, batches[0].id]
        );
        await enqueueBatchSync(d, batches[0].id); // H-9: sync to Supabase
        remaining -= toRestore;
      }
    }
  }
}

/** Restore a cancelled invoice back to draft */
export async function restoreInvoiceToDraft(id: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE invoices SET invoice_status='draft' WHERE id=? AND invoice_status='cancelled'", [id]
  );
  enqueueSync("invoices","upsert",{ id, invoice_status: "draft" },"id").catch(()=>{});
}

/** Update status directly (admin only) */
export async function setInvoiceStatus(id: number, status: InvoiceStatus): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE invoices SET invoice_status=? WHERE id=?", [status, id]);
  enqueueSync("invoices","upsert",{ id, invoice_status: status },"id").catch(()=>{});
}

/** Get invoice status counts for the dashboard badge */
export async function getInvoiceStatusCounts(): Promise<Record<InvoiceStatus, number>> {
  const d = await getDb();
  const rows = await d.select<{ invoice_status: string; cnt: number }[]>(
    "SELECT invoice_status, COUNT(*) as cnt FROM invoices GROUP BY invoice_status"
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.invoice_status] = r.cnt;
  return {
    draft:     counts["draft"]     ?? 0,
    waiting:   counts["waiting"]   ?? 0,
    confirmed: counts["confirmed"] ?? 0,
    paid:      counts["paid"]      ?? 0,
    cancelled: counts["cancelled"] ?? 0,
  };
}

// ── Invoice Template / Model Settings ────────────────────────────────────────

export interface InvoiceTemplate {
  primaryColor: string;       // e.g. "#CF291D"
  accentColor: string;        // e.g. "#1D1D1D"
  logoData: string;           // base64 data-URL or empty
  showBarcodes: boolean;
  showDiscount: boolean;
  showRoute: boolean;
  showSalesRep: boolean;
  showCommission: boolean;
  footerText: string;
  customHtml: string;         // optional full HTML override
  useCustomHtml: boolean;
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  primaryColor: "#CF291D",
  accentColor: "#1D1D1D",
  logoData: "",
  showBarcodes: true,
  showDiscount: true,
  showRoute: true,
  showSalesRep: true,
  showCommission: true,
  footerText: "Thank you for your business.",
  customHtml: "",
  useCustomHtml: false,
};

export async function getInvoiceTemplate(): Promise<InvoiceTemplate> {
  const d = await getDb();
  const rows = await d.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key='invoice_template' LIMIT 1"
  );
  if (!rows.length || !rows[0].value || rows[0].value === "{}") {
    return { ...DEFAULT_INVOICE_TEMPLATE };
  }
  try {
    return { ...DEFAULT_INVOICE_TEMPLATE, ...JSON.parse(rows[0].value) };
  } catch {
    return { ...DEFAULT_INVOICE_TEMPLATE };
  }
}

export async function saveInvoiceTemplate(template: InvoiceTemplate): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('invoice_template', ?)",
    [JSON.stringify(template)]
  );
}
