export interface CompanySettings {
  id?: number;
  name: string;
  address: string;
  phone: string;
  nlb_reg: string;
  dlb_reg: string;
  email: string;
}

export interface Agent {
  id?: number;
  name: string;
  nlb_reg: string;
  dlb_reg: string;
  phone: string;
  address: string;
  nic_number: string;
  bank_name: string;
  bank_account: string;  // account number
  photo: string;         // base64 data-url or empty string
  credit_limit?: number;
}

export interface LotteryGame {
  id?: number;
  name: string;
  cost_price: number;   // 🟠 Nimalsiri → Ajith Rohana (purchase/cost price)
  unit_price: number;   // 🟢 Ajith Rohana → Agents (selling price)
  board: "NLB" | "DLB";
  is_enabled?: number;  // 1 = active, 0 = disabled
}

export type InvoiceStatus = "draft" | "waiting" | "confirmed" | "paid" | "cancelled";

export interface Invoice {
  id?: number;
  invoice_number: string;
  agent_id: number;
  agent_name?: string;
  agent_nlb_reg?: string;
  agent_dlb_reg?: string;
  agent_phone?: string;
  agent_address?: string;
  invoice_date: string;
  prepared_by: string;
  invoice_total: number;
  prev_outstanding: number;
  total_payable: number;
  cash_received: number;
  dlb_winning: number;
  nlb_winning: number;
  outstanding_balance: number;
  created_at?: string;
  items?: InvoiceItem[];
  // ERP fields
  delivery_route?: string;
  sales_rep?: string;
  discount_total?: number;
  invoice_status?: InvoiceStatus;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  sn?: number;
  ticket_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  qty_unit: string;
  unit_price: number;
  value: number;
  // ERP fields
  books_qty?: number;
  tickets_per_book?: number;
  discount_pct?: number;    // percentage discount 0–100
  discount_amt?: number;    // fixed Rs. discount
  net_value?: number;       // value - discount (computed)
}

export interface AgentSummary {
  agent_id: number;
  name: string;
  total_tickets: number;
  total_value: number;
  winnings_tickets: number;
  total_cash: number;
  paid_cash: number;
  amount_over: number;
  loan_amount: number;
  outstanding_balance: number;
}

// ── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryBatch {
  id?: number;
  game_name: string;
  batch_date: string;
  barcode_start: string;
  barcode_end: string;
  total_qty: number;
  distributed_qty: number;
  unit_price: number;
  low_stock_threshold: number;
  notes: string;
  created_at?: string;
  remaining_qty?: number; // computed: total_qty - distributed_qty
  // ERP fields
  batch_number?: string;
  ticket_start_no?: string;
  ticket_end_no?: string;
  books_qty?: number;
  tickets_per_book?: number;
  warehouse_location?: string;
  rack_tag?: string;
  nlb_dlb_category?: string;
}

// ── Payments / Ledger ─────────────────────────────────────────────────────────

export type PaymentType = "cash" | "cheque" | "nlb_winning" | "dlb_winning";

export interface Payment {
  id?: number;
  agent_id: number;
  agent_name?: string;
  invoice_id?: number;
  invoice_number?: string;
  payment_date: string;
  payment_type: PaymentType;
  amount: number;
  reference: string;
  notes: string;
  created_at?: string;
  // ERP: cheque / bank details
  cheque_number?: string;
  bank_name?: string;
  clearance_date?: string;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface DailyRevenue {
  day: string;
  total: number;
  count: number;
}

export interface MonthlyRevenue {
  month: string;
  total: number;
  collected: number;
}

export interface AgentPerformance {
  name: string;
  total_value: number;
  invoice_count: number;
  outstanding: number;
  collection_rate: number;
}

export interface AgingEntry {
  agent_id: number;
  name: string;
  invoice_number: string;
  invoice_date: string;
  outstanding_balance: number;
  days_old: number;
}

export interface GameBreakdown {
  ticket_name: string;
  total_qty: number;
  total_value: number;
  invoice_count: number;
  avg_unit_price: number;
}

export interface GlobalStats {
  total_invoice_value: number;
  total_cash_collected: number;
  total_winnings_returned: number;
  total_outstanding: number;
  total_invoices: number;
  total_tickets_distributed: number;
}

// ── Returns ───────────────────────────────────────────────────────────────────

export type ReturnReason = "unsold" | "damaged" | "expired_draw" | "exchange" | "other";

export interface TicketReturn {
  id?: number;
  agent_id: number;
  agent_name?: string;
  invoice_id?: number;
  invoice_number?: string;
  return_date: string;
  game_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  unit_price: number;
  total_value: number;
  status: "pending" | "settled";
  notes: string;
  created_at?: string;
  return_reason?: ReturnReason;
}

// ── Daily Collections ─────────────────────────────────────────────────────────

export interface DailyCollection {
  id?: number;
  collection_date: string;
  collector_name: string;
  agent_id: number;
  agent_name?: string;
  cash_amount: number;
  cheque_amount: number;
  nlb_winning: number;
  dlb_winning: number;
  route: string;
  notes: string;
  created_at?: string;
  // ERP: cheque details
  cheque_number?: string;
  bank_name?: string;
  clearance_date?: string;
}

// ── Commission Schemes ────────────────────────────────────────────────────────

export type CommissionType = "percentage" | "per_ticket" | "fixed";

export interface CommissionScheme {
  id?: number;
  agent_id: number | null; // null = default for all agents
  agent_name?: string;
  scheme_name: string;
  commission_type: CommissionType;
  rate: number;
  effective_from: string;
  effective_to?: string;
  is_active: number; // 1 = active
  notes: string;
}

export interface CommissionEntry {
  invoice_id: number;
  invoice_number: string;
  agent_name: string;
  invoice_date: string;
  invoice_total: number;
  total_tickets: number;
  commission_rate: number;
  commission_type: CommissionType;
  commission_amount: number;
}

// ── Supplier / Purchases (Nimalsiri → Ajith) ──────────────────────────────────

export interface Supplier {
  id?: number;
  name: string;       // "Nimalsiri Enterprises"
  contact_name: string;
  phone: string;
  address: string;
  notes: string;
}

export interface PurchaseInvoiceItem {
  id?: number;
  purchase_id?: number;
  game_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  unit_price: number;
  value: number;
  draw_number?: string;
  // ERP fields
  batch_number?: string;
  ticket_start_no?: string;
  ticket_end_no?: string;
  books_qty?: number;
  tickets_per_book?: number;
}

export interface PurchaseInvoice {
  id?: number;
  purchase_number: string;
  supplier_name: string;
  purchase_date: string;
  stock_date: string;
  invoice_total: number;
  initial_payment: number;
  outstanding_balance: number;
  status: "pending" | "settled";
  notes: string;
  created_at?: string;
  items?: PurchaseInvoiceItem[];
  // ERP fields
  supplier_ref?: string;        // supplier's own invoice number
  tax_amount?: number;
  handling_charge?: number;
  warehouse_location?: string;
}

export type PurchasePaymentType = "cash" | "cheque" | "return_credit";

export interface PurchasePayment {
  id?: number;
  purchase_id: number;
  purchase_number?: string;
  payment_date: string;
  payment_type: PurchasePaymentType;
  amount: number;
  reference: string;
  notes: string;
  created_at?: string;
}

export interface InvoiceLedgerRow {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  invoice_total: number;
  prev_outstanding: number;
  total_payable: number;
  cash_received: number;         // at delivery
  dlb_winning: number;
  nlb_winning: number;
  snapshot_balance: number;      // saved at invoice creation
  post_payments: number;         // SUM of payments.amount linked to this invoice
  settled_returns: number;       // SUM of ticket_returns.total_value that are settled and linked
  live_balance: number;          // snapshot_balance - post_payments - settled_returns
}

// ── Navigation ────────────────────────────────────────────────────────────────

export interface LotteryResult {
  game_slug: string;    // unique per board+game, e.g. "dlb-shanida", "mega-power"
  game_name: string;
  board: string;
  draw_number: string;
  draw_date: string;
  winning_letter: string;
  winning_numbers: string[];
  super_number: string;
  prizes: { rank: string; prize: string; match_desc: string }[];
  source_url: string;
  fetched_at: string;
  error: string;
}

export type View =
  | "dashboard"
  | "invoices"
  | "new-invoice"
  | "edit-invoice"
  | "print"
  | "agents"
  | "inventory"
  | "returns"
  | "collections"
  | "commission"
  | "alerts"
  | "reports"
  | "ledger"
  | "live-results"
  | "settings"
  | "purchases"
  | "supplier-returns"
  | "draft-invoices"
  | "confirmed-invoices"
  | "cancelled-invoices"
  | "invoice-model"
  | "profit-analytics"
  | "distribution"
  | "payroll"
  | "ai-analytics"
  | "print-export";

// ── Payroll ───────────────────────────────────────────────────────────────────

export type WorkerRole = "Cashier" | "Driver" | "Warehouse Keeper" | "Sales Rep" | "Ticket Checker" | "Manager" | "Other";

export interface Worker {
  id?: number;
  name: string;
  role: WorkerRole;
  basic_salary: number;
  bank_name: string;
  bank_account: string;
  nic_number: string;
  photo: string;
  work_start_date: string;
  work_end_date: string;
  transport_allowance: number;
  meal_allowance: number;
  other_allowances: number;
  is_active: number;
  notes: string;
  created_at?: string;
}

export interface WorkerSalary {
  id?: number;
  worker_id: number;
  worker_name?: string;
  worker_role?: string;
  month: string;           // YYYY-MM
  basic_salary: number;
  transport_allowance: number;
  meal_allowance: number;
  overtime_pay: number;
  other_allowances: number;
  total_earnings: number;
  deductions: number;
  advance_paid: number;
  net_salary: number;
  status: "pending" | "paid";
  paid_date: string;
  notes: string;
  created_at?: string;
}

export interface SupplierAgingBracket {
  bracket: string;
  days_min: number;
  days_max: number;
  count: number;
  total_outstanding: number;
}
