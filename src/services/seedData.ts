/**
 * Demo seed data for Ajith Rohana Enterprise Lottery Manager.
 * Populates all pages with realistic Sri Lankan lottery distribution data.
 * Safe to run multiple times — checks for existing records first.
 */

import {
  getDb,
  saveAgent, getAgents,
  saveInvoice,
  saveInventoryBatch,
  savePayment,
  saveTicketReturn, settleTicketReturn,
  saveDailyCollection,
  saveCommissionScheme,
  saveLotteryResult,
  savePurchaseInvoice, savePurchasePayment,
} from "./database";

// ── Helpers ───────────────────────────────────────────────────────────────────

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().split("T")[0];

const fmt2 = (n: number) => Math.round(n * 100) / 100;

export interface SeedResult {
  agents:      number;
  invoices:    number;
  inventory:   number;
  payments:    number;
  returns:     number;
  collections: number;
  purchases:   number;
  results:     number;
  skipped:     boolean;
}

export async function seedDemoData(): Promise<SeedResult> {
  const result: SeedResult = {
    agents: 0, invoices: 0, inventory: 0, payments: 0,
    returns: 0, collections: 0, purchases: 0, results: 0, skipped: false,
  };

  // Guard: skip if agents already exist
  const existing = await getAgents();
  if (existing.length >= 3) {
    result.skipped = true;
    return result;
  }

  // ── 1. Agents ─────────────────────────────────────────────────────────────

  const AGENTS = [
    { name: "Suresh Perera",       nlb_reg: "NLB A145", dlb_reg: "DLB 01/7388", phone: "0771234567", address: "45 Galle Rd, Colombo 03", nic_number: "197804501234", bank_name: "Bank of Ceylon",      bank_account: "12345678",  credit_limit: 150000 },
    { name: "Nimal Fernando",      nlb_reg: "NLB A146", dlb_reg: "DLB 01/7389", phone: "0712345678", address: "12 High Level Rd, Nugegoda", nic_number: "198203201234", bank_name: "People's Bank",    bank_account: "87654321",  credit_limit: 100000 },
    { name: "Chaminda Silva",      nlb_reg: "NLB A147", dlb_reg: "DLB 01/7390", phone: "0756789012", address: "78 Station Rd, Maharagama", nic_number: "199001101234", bank_name: "Sampath Bank",       bank_account: "11223344",  credit_limit: 200000 },
    { name: "Kumari Jayawardena",  nlb_reg: "NLB A148", dlb_reg: "DLB 01/7391", phone: "0763456789", address: "33 Kandy Rd, Kelaniya",    nic_number: "198612301234", bank_name: "Commercial Bank",    bank_account: "55667788",  credit_limit: 80000  },
    { name: "Prasad Bandara",      nlb_reg: "NLB A149", dlb_reg: "DLB 01/7392", phone: "0723456789", address: "19 Colombo Rd, Gampaha",   nic_number: "199205201234", bank_name: "Hatton National Bank", bank_account: "99887766", credit_limit: 120000 },
  ];

  const agentIds: number[] = [];
  for (const a of AGENTS) {
    const id = await saveAgent({ ...a, photo: "" });
    agentIds.push(id);
    result.agents++;
  }

  // ── 2. Commission Schemes ─────────────────────────────────────────────────

  await saveCommissionScheme({
    agent_id: null, scheme_name: "Standard Commission", commission_type: "percentage",
    rate: 5.0, effective_from: daysAgo(365), is_active: 1, notes: "5% on all invoices",
  });
  await saveCommissionScheme({
    agent_id: agentIds[2], scheme_name: "Chaminda Premium", commission_type: "percentage",
    rate: 7.5, effective_from: daysAgo(180), is_active: 1, notes: "High-volume agent",
  });

  // ── 3. Inventory Batches ──────────────────────────────────────────────────

  const BATCHES = [
    { game_name: "MEGA POWER",         batch_date: daysAgo(5),  barcode_start: "62900474690", barcode_end: "62900476939", total_qty: 2250, distributed_qty: 1800, unit_price: 32.50,  low_stock_threshold: 200, notes: "Sep batch A",  batch_number: "MP-2026-09A", nlb_dlb_category: "NLB — Daily Draw",    ticket_start_no: "MP001", ticket_end_no: "MP2250", books_qty: 22, tickets_per_book: 100, warehouse_location: "Main Store", rack_tag: "R-A1" },
    { game_name: "MAHAJANA SAMPATHA",  batch_date: daysAgo(4),  barcode_start: "73100212000", barcode_end: "73100214000", total_qty: 2001, distributed_qty: 1200, unit_price: 32.50,  low_stock_threshold: 150, notes: "Tue draw",    batch_number: "MS-2026-09A", nlb_dlb_category: "NLB — Weekly Draw",   ticket_start_no: "MS001", ticket_end_no: "MS2001", books_qty: 20, tickets_per_book: 100, warehouse_location: "Main Store", rack_tag: "R-A2" },
    { game_name: "SUBA DAWASAK",       batch_date: daysAgo(3),  barcode_start: "84200330000", barcode_end: "84200331500", total_qty: 1500, distributed_qty: 900,  unit_price: 32.50,  low_stock_threshold: 100, notes: "Daily draw",  batch_number: "SD-2026-09A", nlb_dlb_category: "NLB — Daily Draw",    ticket_start_no: "SD001", ticket_end_no: "SD1500", books_qty: 15, tickets_per_book: 100, warehouse_location: "Main Store", rack_tag: "R-A3" },
    { game_name: "ADA SAMPATHA",       batch_date: daysAgo(7),  barcode_start: "95300440000", barcode_end: "95300441000", total_qty: 1000, distributed_qty: 950,  unit_price: 32.50,  low_stock_threshold: 50,  notes: "Low stock",  batch_number: "AS-2026-09A", nlb_dlb_category: "NLB — Daily Draw",    ticket_start_no: "AS001", ticket_end_no: "AS1000", books_qty: 10, tickets_per_book: 100, warehouse_location: "Branch 1",   rack_tag: "R-B1" },
    { game_name: "DHANA NIDHANAYA",    batch_date: daysAgo(6),  barcode_start: "11100550000", barcode_end: "11100551500", total_qty: 1500, distributed_qty: 600,  unit_price: 32.50,  low_stock_threshold: 200, notes: "Thu draw",   batch_number: "DN-2026-09A", nlb_dlb_category: "NLB — Weekly Draw",   ticket_start_no: "DN001", ticket_end_no: "DN1500", books_qty: 15, tickets_per_book: 100, warehouse_location: "Main Store", rack_tag: "R-A4" },
    { game_name: "Ada Kotipathi",      batch_date: daysAgo(5),  barcode_start: "22200660000", barcode_end: "22200661600", total_qty: 1600, distributed_qty: 1400, unit_price: 325.00, low_stock_threshold: 100, notes: "DLB daily",  batch_number: "AK-2026-09A", nlb_dlb_category: "DLB — Daily Draw",    ticket_start_no: "AK001", ticket_end_no: "AK1600", books_qty: 16, tickets_per_book: 100, warehouse_location: "Main Store", rack_tag: "R-C1" },
    { game_name: "Kapruka",            batch_date: daysAgo(8),  barcode_start: "33300770000", barcode_end: "33300771000", total_qty: 1000, distributed_qty: 700,  unit_price: 325.00, low_stock_threshold: 100, notes: "DLB batch",  batch_number: "KP-2026-09A", nlb_dlb_category: "DLB — Weekly Draw",   ticket_start_no: "KP001", ticket_end_no: "KP1000", books_qty: 10, tickets_per_book: 100, warehouse_location: "Main Store", rack_tag: "R-C2" },
    { game_name: "HANDAHANA",          batch_date: daysAgo(10), barcode_start: "44400880000", barcode_end: "44400881200", total_qty: 1200, distributed_qty: 30,   unit_price: 32.50,  low_stock_threshold: 100, notes: "Very low!",  batch_number: "HH-2026-09A", nlb_dlb_category: "NLB — Weekly Draw",   ticket_start_no: "HH001", ticket_end_no: "HH1200", books_qty: 12, tickets_per_book: 100, warehouse_location: "Branch 2",   rack_tag: "R-D1" },
  ];
  for (const b of BATCHES) {
    await saveInventoryBatch(b as any);
    result.inventory++;
  }

  // ── 4. Purchase Invoices (Nimalsiri → Ajith) ──────────────────────────────

  const PO1_ITEMS = [
    { game_name: "MEGA POWER",        barcode_start: "62900474690", barcode_end: "62900476939", qty: 2250, unit_price: 32.50, value: 73125, batch_number: "MP-2026-09A", ticket_start_no: "MP001", ticket_end_no: "MP2250", books_qty: 22, tickets_per_book: 100 },
    { game_name: "MAHAJANA SAMPATHA", barcode_start: "73100212000", barcode_end: "73100214000", qty: 2001, unit_price: 32.50, value: 65032.5, batch_number: "MS-2026-09A", ticket_start_no: "MS001", ticket_end_no: "MS2001", books_qty: 20, tickets_per_book: 100 },
  ];
  const po1Total = PO1_ITEMS.reduce((s, i) => s + i.value, 0);
  const po1Id = await savePurchaseInvoice({
    purchase_number: "PO0001", supplier_name: "Nimalsiri Enterprises",
    purchase_date: daysAgo(5), stock_date: daysAgo(4),
    invoice_total: po1Total, initial_payment: 100000,
    outstanding_balance: fmt2(po1Total - 100000), status: "pending",
    notes: "September batch A - Mega Power + Mahajana",
    supplier_ref: "NE-INV-2026-0891", tax_amount: 0, handling_charge: 500,
    warehouse_location: "Main Store",
  }, PO1_ITEMS as any);
  // Partial settlement payment
  await savePurchasePayment({
    purchase_id: po1Id, payment_date: daysAgo(3), payment_type: "cash",
    amount: 50000, reference: "", notes: "2nd installment - cash",
  });
  result.purchases++;

  const PO2_ITEMS = [
    { game_name: "ADA SAMPATHA",    barcode_start: "95300440000", barcode_end: "95300441000", qty: 1000, unit_price: 32.50, value: 32500, batch_number: "AS-2026-09A", ticket_start_no: "AS001", ticket_end_no: "AS1000", books_qty: 10, tickets_per_book: 100 },
    { game_name: "Ada Kotipathi",   barcode_start: "22200660000", barcode_end: "22200661600", qty: 1600, unit_price: 325.00, value: 520000, batch_number: "AK-2026-09A", ticket_start_no: "AK001", ticket_end_no: "AK1600", books_qty: 16, tickets_per_book: 100 },
    { game_name: "Kapruka",         barcode_start: "33300770000", barcode_end: "33300771000", qty: 1000, unit_price: 325.00, value: 325000, batch_number: "KP-2026-09A", ticket_start_no: "KP001", ticket_end_no: "KP1000", books_qty: 10, tickets_per_book: 100 },
  ];
  const po2Total = PO2_ITEMS.reduce((s, i) => s + i.value, 0);
  const po2Id = await savePurchaseInvoice({
    purchase_number: "PO0002", supplier_name: "Nimalsiri Enterprises",
    purchase_date: daysAgo(8), stock_date: daysAgo(7),
    invoice_total: po2Total, initial_payment: 500000,
    outstanding_balance: fmt2(po2Total - 500000), status: "pending",
    notes: "DLB September batch + Ada Sampatha",
    supplier_ref: "NE-INV-2026-0887", tax_amount: 0, handling_charge: 1000,
    warehouse_location: "Main Store",
  }, PO2_ITEMS as any);
  await savePurchasePayment({
    purchase_id: po2Id, payment_date: daysAgo(6), payment_type: "cheque",
    amount: 100000, reference: "CHQ-45892", notes: "Cheque partial settlement - Bank of Ceylon",
  });
  result.purchases++;

  // Fully settled purchase
  const PO3_ITEMS = [
    { game_name: "SUBA DAWASAK", barcode_start: "84200330000", barcode_end: "84200331500", qty: 1500, unit_price: 32.50, value: 48750, batch_number: "SD-2026-09A", ticket_start_no: "SD001", ticket_end_no: "SD1500", books_qty: 15, tickets_per_book: 100 },
  ];
  await savePurchaseInvoice({
    purchase_number: "PO0003", supplier_name: "Nimalsiri Enterprises",
    purchase_date: daysAgo(15), stock_date: daysAgo(14),
    invoice_total: 48750, initial_payment: 48750,
    outstanding_balance: 0, status: "settled",
    notes: "Suba Dawasak - fully paid at delivery",
    supplier_ref: "NE-INV-2026-0880", tax_amount: 0, handling_charge: 250,
    warehouse_location: "Main Store",
  }, PO3_ITEMS as any);
  result.purchases++;

  // ── 5. Invoices (Ajith → Agents) ─────────────────────────────────────────

  type InvDef = {
    agent_idx: number; days: number; cash: number; dlb: number; nlb: number;
    items: { ticket_name: string; barcode_start: string; barcode_end: string; qty: number; unit_price: number }[];
  };

  const INVOICES: InvDef[] = [
    // Suresh Perera — 3 invoices
    { agent_idx: 0, days: 30, cash: 60000, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "MEGA POWER",        barcode_start: "62900474690", barcode_end: "62900475000", qty: 311,  unit_price: 32.50 },
        { ticket_name: "MAHAJANA SAMPATHA", barcode_start: "73100212000", barcode_end: "73100212500", qty: 501,  unit_price: 32.50 },
      ]
    },
    { agent_idx: 0, days: 15, cash: 32500, dlb: 5000, nlb: 0,
      items: [
        { ticket_name: "MEGA POWER",        barcode_start: "62900475100", barcode_end: "62900475600", qty: 501,  unit_price: 32.50 },
        { ticket_name: "SUBA DAWASAK",      barcode_start: "84200330000", barcode_end: "84200330300", qty: 301,  unit_price: 32.50 },
      ]
    },
    { agent_idx: 0, days: 3, cash: 20000, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "ADA SAMPATHA",      barcode_start: "95300440000", barcode_end: "95300440300", qty: 301,  unit_price: 32.50 },
      ]
    },
    // Nimal Fernando — 3 invoices
    { agent_idx: 1, days: 25, cash: 50000, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "Ada Kotipathi",     barcode_start: "22200660000", barcode_end: "22200660200", qty: 201,  unit_price: 325.00 },
        { ticket_name: "SUBA DAWASAK",      barcode_start: "84200330400", barcode_end: "84200330700", qty: 301,  unit_price: 32.50  },
      ]
    },
    { agent_idx: 1, days: 10, cash: 65000, dlb: 10000, nlb: 5000,
      items: [
        { ticket_name: "Ada Kotipathi",     barcode_start: "22200660300", barcode_end: "22200660600", qty: 301,  unit_price: 325.00 },
      ]
    },
    { agent_idx: 1, days: 1, cash: 0, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "MAHAJANA SAMPATHA", barcode_start: "73100212600", barcode_end: "73100213000", qty: 401,  unit_price: 32.50 },
        { ticket_name: "MEGA POWER",        barcode_start: "62900475700", barcode_end: "62900476000", qty: 301,  unit_price: 32.50 },
      ]
    },
    // Chaminda Silva — 3 invoices
    { agent_idx: 2, days: 20, cash: 130000, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "Ada Kotipathi",     barcode_start: "22200660700", barcode_end: "22200661000", qty: 301,  unit_price: 325.00 },
        { ticket_name: "Kapruka",           barcode_start: "33300770000", barcode_end: "33300770300", qty: 301,  unit_price: 325.00 },
      ]
    },
    { agent_idx: 2, days: 8, cash: 32500, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "MEGA POWER",        barcode_start: "62900476100", barcode_end: "62900476400", qty: 301,  unit_price: 32.50 },
        { ticket_name: "DHANA NIDHANAYA",   barcode_start: "11100550000", barcode_end: "11100550500", qty: 501,  unit_price: 32.50 },
      ]
    },
    { agent_idx: 2, days: 2, cash: 0, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "Kapruka",           barcode_start: "33300770400", barcode_end: "33300770700", qty: 301,  unit_price: 325.00 },
      ]
    },
    // Kumari Jayawardena — 2 invoices
    { agent_idx: 3, days: 12, cash: 19500, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "SUBA DAWASAK",      barcode_start: "84200330800", barcode_end: "84200331000", qty: 201,  unit_price: 32.50 },
        { ticket_name: "MAHAJANA SAMPATHA", barcode_start: "73100213100", barcode_end: "73100213300", qty: 201,  unit_price: 32.50 },
      ]
    },
    { agent_idx: 3, days: 4, cash: 16250, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "HANDAHANA",         barcode_start: "44400880000", barcode_end: "44400880200", qty: 201,  unit_price: 32.50 },
        { ticket_name: "ADA SAMPATHA",      barcode_start: "95300440400", barcode_end: "95300440600", qty: 201,  unit_price: 32.50 },
      ]
    },
    // Prasad Bandara — 2 invoices
    { agent_idx: 4, days: 18, cash: 32500, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "DHANA NIDHANAYA",   barcode_start: "11100550600", barcode_end: "11100550900", qty: 301,  unit_price: 32.50 },
        { ticket_name: "MEGA POWER",        barcode_start: "62900476500", barcode_end: "62900476700", qty: 201,  unit_price: 32.50 },
      ]
    },
    { agent_idx: 4, days: 5, cash: 0, dlb: 0, nlb: 0,
      items: [
        { ticket_name: "Ada Kotipathi",     barcode_start: "22200661100", barcode_end: "22200661300", qty: 201,  unit_price: 325.00 },
      ]
    },
  ];

  let invoiceNum = 266340;
  const savedInvoiceIds: number[] = [];

  for (const inv of INVOICES) {
    const items = inv.items.map((it, idx) => ({
      sn: idx + 1,
      ticket_name: it.ticket_name,
      barcode_start: it.barcode_start,
      barcode_end: it.barcode_end,
      qty: it.qty,
      qty_unit: "Tickets",
      unit_price: it.unit_price,
      value: fmt2(it.qty * it.unit_price),
      net_value: fmt2(it.qty * it.unit_price),
      discount_pct: 0,
      discount_amt: 0,
    }));
    const total = items.reduce((s, i) => s + i.value, 0);
    const totalPaid = inv.cash + inv.dlb + inv.nlb;
    const id = await saveInvoice({
      invoice_number: String(invoiceNum++),
      agent_id: agentIds[inv.agent_idx],
      invoice_date: daysAgo(inv.days),
      prepared_by: "sameera",
      invoice_total: fmt2(total),
      prev_outstanding: 0,
      total_payable: fmt2(total),
      cash_received: inv.cash,
      dlb_winning: inv.dlb,
      nlb_winning: inv.nlb,
      outstanding_balance: fmt2(total - totalPaid),
      delivery_route: ["Colombo South", "Nugegoda", "Maharagama", "Kelaniya", "Gampaha"][inv.agent_idx],
      sales_rep: "sameera",
      discount_total: 0,
      items,
    });
    savedInvoiceIds.push(id);
    result.invoices++;
  }

  // ── 6. Payments (post-invoice settlements) ────────────────────────────────

  const PAYMENTS = [
    { agent_idx: 0, inv_idx: 0,  amount: 12000, type: "cash",        date: daysAgo(27), ref: "",           notes: "Route collection" },
    { agent_idx: 0, inv_idx: 1,  amount: 10000, type: "cash",        date: daysAgo(12), ref: "",           notes: "Partial settlement" },
    { agent_idx: 1, inv_idx: 3,  amount: 15000, type: "cheque",      date: daysAgo(22), ref: "CHQ-22145",  notes: "People's Bank cheque" },
    { agent_idx: 1, inv_idx: 4,  amount: 20000, type: "cash",        date: daysAgo(7),  ref: "",           notes: "" },
    { agent_idx: 2, inv_idx: 6,  amount: 50000, type: "cheque",      date: daysAgo(17), ref: "CHQ-33278",  notes: "Sampath Bank" },
    { agent_idx: 2, inv_idx: 7,  amount: 16250, type: "nlb_winning", date: daysAgo(5),  ref: "NLB-0574",   notes: "Winning ticket settlement" },
    { agent_idx: 4, inv_idx: 11, amount: 16250, type: "cash",        date: daysAgo(15), ref: "",           notes: "First installment" },
  ];

  for (const p of PAYMENTS) {
    await savePayment({
      agent_id: agentIds[p.agent_idx],
      invoice_id: savedInvoiceIds[p.inv_idx],
      payment_date: p.date,
      payment_type: p.type as any,
      amount: p.amount,
      reference: p.ref,
      notes: p.notes,
      cheque_number: p.type === "cheque" ? p.ref : "",
      bank_name: p.type === "cheque" ? (p.agent_idx === 1 ? "People's Bank" : "Sampath Bank") : "",
      clearance_date: p.type === "cheque" ? daysAgo(p.date === daysAgo(22) ? 19 : 14) : "",
    });
    result.payments++;
  }

  // ── 7. Ticket Returns ─────────────────────────────────────────────────────

  const RETURNS = [
    { agent_idx: 0, inv_idx: 0,  game: "MEGA POWER",        bs: "62900474990", be: "62900475010", qty: 21,  up: 32.50,  status: "settled"  as const, reason: "unsold"       as const, notes: "End of draw period" },
    { agent_idx: 1, inv_idx: 4,  game: "Ada Kotipathi",     bs: "22200660390", be: "22200660400", qty: 11,  up: 325.00, status: "settled"  as const, reason: "expired_draw" as const, notes: "Expired Oct draw" },
    { agent_idx: 2, inv_idx: 6,  game: "Kapruka",           bs: "33300770250", be: "33300770270", qty: 21,  up: 325.00, status: "pending"  as const, reason: "unsold"       as const, notes: "" },
    { agent_idx: 2, inv_idx: 7,  game: "MEGA POWER",        bs: "62900476200", be: "62900476210", qty: 11,  up: 32.50,  status: "pending"  as const, reason: "damaged"      as const, notes: "Water damaged" },
    { agent_idx: 3, inv_idx: 9,  game: "SUBA DAWASAK",      bs: "84200330900", be: "84200330910", qty: 11,  up: 32.50,  status: "settled"  as const, reason: "unsold"       as const, notes: "" },
    { agent_idx: 4, inv_idx: 11, game: "DHANA NIDHANAYA",   bs: "11100550700", be: "11100550720", qty: 21,  up: 32.50,  status: "pending"  as const, reason: "exchange"     as const, notes: "Wrong draw batch exchanged" },
  ];

  for (const r of RETURNS) {
    const id = await saveTicketReturn({
      agent_id: agentIds[r.agent_idx],
      invoice_id: savedInvoiceIds[r.inv_idx],
      return_date: daysAgo(r.status === "settled" ? 5 : 1),
      game_name: r.game,
      barcode_start: r.bs,
      barcode_end: r.be,
      qty: r.qty,
      unit_price: r.up,
      total_value: fmt2(r.qty * r.up),
      status: "pending",
      notes: r.notes,
      return_reason: r.reason,
    });
    if (r.status === "settled") await settleTicketReturn(id);
    result.returns++;
  }

  // ── 8. Daily Collections ──────────────────────────────────────────────────

  const COLLECTIONS = [
    { agent_idx: 0, days: 1,  cash: 25000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Colombo South", col: "sameera" },
    { agent_idx: 1, days: 1,  cash: 18000, cheque: 10000, nlb: 0,    dlb: 0,    route: "Nugegoda",      col: "sameera",  chq: "CHQ-11234", bank: "People's Bank" },
    { agent_idx: 2, days: 1,  cash: 32000, cheque: 0,     nlb: 5000, dlb: 0,    route: "Maharagama",    col: "sameera" },
    { agent_idx: 3, days: 1,  cash: 12000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Kelaniya",      col: "pradeep" },
    { agent_idx: 4, days: 1,  cash: 15000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Gampaha",       col: "pradeep" },
    { agent_idx: 0, days: 2,  cash: 30000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Colombo South", col: "sameera" },
    { agent_idx: 1, days: 2,  cash: 22000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Nugegoda",      col: "sameera" },
    { agent_idx: 2, days: 2,  cash: 45000, cheque: 0,     nlb: 0,    dlb: 8000, route: "Maharagama",    col: "sameera" },
    { agent_idx: 0, days: 3,  cash: 28000, cheque: 15000, nlb: 0,    dlb: 0,    route: "Colombo South", col: "sameera",  chq: "CHQ-22890", bank: "Bank of Ceylon" },
    { agent_idx: 3, days: 3,  cash: 9000,  cheque: 0,     nlb: 3000, dlb: 0,    route: "Kelaniya",      col: "pradeep" },
    { agent_idx: 4, days: 3,  cash: 20000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Gampaha",       col: "pradeep" },
    { agent_idx: 0, days: 4,  cash: 35000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Colombo South", col: "sameera" },
    { agent_idx: 2, days: 5,  cash: 40000, cheque: 0,     nlb: 0,    dlb: 0,    route: "Maharagama",    col: "sameera" },
    { agent_idx: 1, days: 5,  cash: 25000, cheque: 0,     nlb: 0,    dlb: 5000, route: "Nugegoda",      col: "sameera" },
  ];

  for (const c of COLLECTIONS) {
    await saveDailyCollection({
      collection_date: daysAgo(c.days),
      collector_name: c.col,
      agent_id: agentIds[c.agent_idx],
      cash_amount: c.cash,
      cheque_amount: c.cheque,
      nlb_winning: c.nlb,
      dlb_winning: c.dlb,
      route: c.route,
      notes: "",
      cheque_number: (c as any).chq ?? "",
      bank_name: (c as any).bank ?? "",
      clearance_date: (c as any).chq ? daysAgo(c.days - 2) : "",
    });
    result.collections++;
  }

  // ── 9. Lottery Results ────────────────────────────────────────────────────

  const RESULTS = [
    { slug: "mega-power",       name: "Mega Power",       board: "NLB", draw: "2654", date: daysAgo(1),  letter: "F", nums: ["20","11","22","32","48"] },
    { slug: "suba-dawasak",     name: "Suba Dawasak",     board: "NLB", draw: "0422", date: daysAgo(1),  letter: "LIBRA", nums: ["27","38","64","7","1","2","7"] },
    { slug: "mahajana-sampatha",name: "Mahajana Sampatha",board: "NLB", draw: "6306", date: daysAgo(2),  letter: "K", nums: ["9","8","9","6","6","6"] },
    { slug: "ada-kotipathi",    name: "Ada Kotipathi",    board: "DLB", draw: "3106", date: daysAgo(1),  letter: "C", nums: ["20","21","64","66"] },
    { slug: "kapruka",          name: "Kapruka",          board: "DLB", draw: "2456", date: daysAgo(1),  letter: "Q", nums: ["08","09","34","57","07"] },
    { slug: "dhana-nidhanaya",  name: "Dhana Nidhanaya",  board: "NLB", draw: "2336", date: daysAgo(2),  letter: "M", nums: ["17","22","31","82"] },
    { slug: "govisetha",        name: "Govisetha",        board: "NLB", draw: "4548", date: daysAgo(3),  letter: "P", nums: ["20","45","50","74"] },
    { slug: "nlb-jaya",         name: "NLB Jaya",         board: "NLB", draw: "0574", date: daysAgo(1),  letter: "B", nums: ["2","3","2","4"] },
  ];

  for (const r of RESULTS) {
    await saveLotteryResult({
      game_slug: r.slug, game_name: r.name, board: r.board,
      draw_number: r.draw, draw_date: r.date,
      winning_letter: r.letter, winning_numbers: r.nums,
      super_number: "", prizes: [],
      source_url: "fetched", fetched_at: Date.now().toString(), error: "",
    }, r.slug);
    result.results++;
  }

  return result;
}

export async function clearDemoData(): Promise<void> {
  const d = await getDb();
  // Delete in dependency order
  await d.execute("DELETE FROM purchase_payments");
  await d.execute("DELETE FROM purchase_invoice_items");
  await d.execute("DELETE FROM purchase_invoices");
  await d.execute("DELETE FROM sync_queue");
  await d.execute("DELETE FROM daily_collections");
  await d.execute("DELETE FROM ticket_returns");
  await d.execute("DELETE FROM payments");
  await d.execute("DELETE FROM invoice_items");
  await d.execute("DELETE FROM invoices");
  await d.execute("DELETE FROM inventory_batches");
  await d.execute("DELETE FROM commission_schemes");
  await d.execute("DELETE FROM lottery_results");
  await d.execute("DELETE FROM agents");
}
