import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Printer, Calculator, Home, ChevronRight, Eye, EyeOff, Building2 } from "lucide-react";
import { getCompanySettings } from "../services/database";
import type { CompanySettings } from "../types";
import {
  getAgents,
  getLotteryGames,
  getNextInvoiceNumber, resolveUniqueInvoiceNumber,
  getAgentLastOutstanding,
  saveInvoice,
  getInvoiceWithItems,
  getInventoryBatches,
} from "../services/database";
import type { Agent, LotteryGame, Invoice, InvoiceItem, View } from "../types";
import { calcEndBarcode, calcQtyFromBarcodes, isNumericBarcode } from "../utils/barcode";

interface Props {
  editInvoiceId?: number | null;
  onSaved: (id: number, view: View) => void;
}

const EMPTY_ITEM = (): InvoiceItem => ({
  ticket_name: "",
  barcode_start: "",
  barcode_end: "",
  qty: 0,
  qty_unit: "Tickets",
  unit_price: 32.5,
  value: 0,
});

export default function NewInvoice({ editInvoiceId, onSaved }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [games, setGames] = useState<LotteryGame[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({}); // game_name → available qty
  const [items, setItems] = useState<InvoiceItem[]>([EMPTY_ITEM()]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [company, setCompany] = useState<CompanySettings | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [agentId, setAgentId] = useState<number | "">("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [preparedBy, setPreparedBy] = useState("sameera");
  const [prevOutstanding, setPrevOutstanding] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);
  const [dlbWinning, setDlbWinning] = useState(0);
  const [nlbWinning, setNlbWinning] = useState(0);
  const [deliveryRoute, setDeliveryRoute] = useState("");
  const [salesRep, setSalesRep] = useState("sameera");
  const [creditWarning, setCreditWarning] = useState<string | null>(null);
  const [commissionPreview, setCommissionPreview] = useState(0);

  useEffect(() => {
    async function init() {
      const [a, g, num, co, batches] = await Promise.all([
        getAgents(),
        getLotteryGames(),
        getNextInvoiceNumber(),
        getCompanySettings(),
        getInventoryBatches(),
      ]);
      setAgents(a);
      setGames(g);
      setCompany(co);
      // Build stockMap: sum remaining_qty per game across all batches
      const sm: Record<string, number> = {};
      for (const b of batches) {
        sm[b.game_name] = (sm[b.game_name] ?? 0) + (b.remaining_qty ?? 0);
      }
      setStockMap(sm);
      if (!editInvoiceId) {
        const unique = await resolveUniqueInvoiceNumber(num);
        setInvoiceNumber(unique);
      }
    }
    init();
  }, [editInvoiceId]);

  // Load existing invoice for editing
  useEffect(() => {
    if (!editInvoiceId) return;
    getInvoiceWithItems(editInvoiceId).then(async (inv) => {
      if (!inv) return;
      setInvoiceNumber(inv.invoice_number);
      setAgentId(inv.agent_id);
      setInvoiceDate(inv.invoice_date);
      setPreparedBy(inv.prepared_by);
      // M-8: re-fetch live outstanding instead of using the stale snapshot from the DB.
      // Other invoices for this agent may have been paid/returned since this draft was saved.
      const liveOutstanding = await getAgentLastOutstanding(inv.agent_id).catch(() => inv.prev_outstanding ?? 0);
      setPrevOutstanding(Number(liveOutstanding.toFixed(2)));
      setCashReceived(Number((inv.cash_received ?? 0).toFixed(2)));
      setDlbWinning(Number((inv.dlb_winning ?? 0).toFixed(2)));
      setNlbWinning(Number((inv.nlb_winning ?? 0).toFixed(2)));
      setItems(inv.items && inv.items.length > 0 ? inv.items : [EMPTY_ITEM()]);
      setDeliveryRoute(inv.delivery_route ?? "");
      setSalesRep(inv.sales_rep ?? inv.prepared_by ?? "sameera");
      // M-11: re-run the credit limit check using the live outstanding
      handleAgentChange(inv.agent_id);
    });
  }, [editInvoiceId]);

  // Auto-fill outstanding balance when agent changes
  async function handleAgentChange(id: number) {
    setAgentId(id);
    const raw = await getAgentLastOutstanding(id);
    // Sanitize: eliminate any floating-point artifact before storing in state
    const outstanding = Number(Math.max(0, raw).toFixed(2));
    setPrevOutstanding(outstanding);
    const agent = agents.find(a => a.id === id);
    if (agent?.credit_limit && outstanding > (agent.credit_limit * 0.9)) {
      setCreditWarning(`⚠ Credit limit: Rs. ${agent.credit_limit.toLocaleString()} — Outstanding Rs. ${fmt(outstanding)} is ${outstanding >= agent.credit_limit ? "OVER limit" : "near limit"}`);
    } else {
      setCreditWarning(null);
    }
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems((prev) => {
      const next = prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        // Auto-recalculate value when qty or unit_price changes
        if (field === "qty" || field === "unit_price") {
          const qty = field === "qty" ? Number(value) : item.qty;
          const price = field === "unit_price" ? Number(value) : item.unit_price;
          updated.value = Math.round(qty * price * 100) / 100;
        }
        // Auto-fill unit price when game is selected
        if (field === "ticket_name") {
          const game = games.find((g) => g.name === value);
          if (game) {
            updated.unit_price = game.unit_price;
            updated.value = Math.round(updated.qty * game.unit_price * 100) / 100;
          }
        }
        // Stock validation: cap qty at available stock
        if (field === "qty" || field === "barcode_end" || field === "barcode_start") {
          const available = stockMap[updated.ticket_name] ?? Infinity;
          if (updated.qty > available && updated.ticket_name) {
            updated.qty = available;
            if (isNumericBarcode(updated.barcode_start) && available > 0) {
              updated.barcode_end = calcEndBarcode(updated.barcode_start, available);
            }
          }
        }

        // Discount calc: discount_pct takes priority over discount_amt
        if (field === "discount_pct" || field === "discount_amt" || field === "qty" || field === "unit_price" || field === "ticket_name") {
          const baseValue = updated.qty * updated.unit_price;
          updated.value = Math.round(baseValue * 100) / 100;
          if (updated.discount_pct && updated.discount_pct > 0) {
            updated.discount_amt = Math.round(baseValue * updated.discount_pct / 100 * 100) / 100;
          }
          updated.net_value = Math.round((updated.value - (updated.discount_amt ?? 0)) * 100) / 100;
        }

        // ── Barcode auto-calculation ─────────────────────────────────────────
        if (field === "qty" && isNumericBarcode(updated.barcode_start)) {
          // qty changed → recalculate end barcode
          updated.barcode_end = calcEndBarcode(updated.barcode_start, Number(value));
        } else if (
          field === "barcode_end" &&
          isNumericBarcode(updated.barcode_start) &&
          isNumericBarcode(String(value))
        ) {
          // end barcode changed → recalculate qty (and value)
          const newQty = calcQtyFromBarcodes(updated.barcode_start, String(value));
          updated.qty = newQty;
          updated.value = Math.round(newQty * updated.unit_price * 100) / 100;
        } else if (field === "barcode_start" && isNumericBarcode(String(value))) {
          if (updated.qty > 0) {
            // start changed, qty already set → recalculate end
            updated.barcode_end = calcEndBarcode(String(value), updated.qty);
          } else if (isNumericBarcode(updated.barcode_end)) {
            // start changed, end already set → recalculate qty
            const newQty = calcQtyFromBarcodes(String(value), updated.barcode_end);
            updated.qty = newQty;
            updated.value = Math.round(newQty * updated.unit_price * 100) / 100;
          }
        }
        // ────────────────────────────────────────────────────────────────────

        // Always recalculate net_value last — ensures barcode auto-calc also updates it
        updated.value    = Math.round(updated.qty * updated.unit_price * 100) / 100;
        const discAmt    = (updated.discount_pct ?? 0) > 0
          ? Math.round(updated.value * (updated.discount_pct ?? 0) / 100 * 100) / 100
          : (updated.discount_amt ?? 0);
        updated.discount_amt = discAmt;
        updated.net_value    = Math.round((updated.value - discAmt) * 100) / 100;

        return updated;
      });
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, EMPTY_ITEM()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Sanitize every derived figure: 2dp prevents cascading float noise
  // net_value is always set now; fall back to value only for very old items without it
  // net_value != null covers 0 (100% discount) — avoids falling back to gross price (H-16)
  const invoiceTotal      = Number(items.reduce((s, it) => s + (it.net_value != null ? it.net_value : it.value), 0).toFixed(2));
  const discountTotal     = Number(items.reduce((s, it) => s + (it.discount_amt ?? 0), 0).toFixed(2));
  const totalPayable      = Number((invoiceTotal + prevOutstanding).toFixed(2));
  const totalPaid         = Number((cashReceived + dlbWinning + nlbWinning).toFixed(2));
  const outstandingBalance = Number((totalPayable - totalPaid).toFixed(2));
  const totalTickets = items.reduce((s, it) => s + Number(it.qty), 0);

  // status = "draft" saves without confirming; "waiting" = confirm immediately
  async function handleSave(mode: "draft" | "confirm" | "print" = "draft") {
    if (!agentId) { alert("Please select an agent."); return; }
    if (!invoiceNumber.trim()) { alert("Invoice number is required."); return; }
    if (items.every((it) => !it.ticket_name)) { alert("Add at least one ticket line."); return; }
    // Stock validation — block save if any named line exceeds available stock
    for (const it of items.filter(x => x.ticket_name)) {
      const avail = stockMap[it.ticket_name];
      if (avail !== undefined && it.qty > avail) {
        alert(`Not enough stock for "${it.ticket_name}": you entered ${it.qty.toLocaleString()} but only ${avail.toLocaleString()} available.`);
        return;
      }
      if (avail === 0) {
        alert(`"${it.ticket_name}" is out of stock. Remove this line or adjust quantity.`);
        return;
      }
    }

    setSaving(true);
    try {
      const invoice: Invoice = {
        id: editInvoiceId ?? undefined,
        invoice_number: invoiceNumber,
        agent_id: Number(agentId),
        invoice_date: invoiceDate,
        prepared_by: preparedBy,
        invoice_total: invoiceTotal,
        prev_outstanding: prevOutstanding,
        total_payable: totalPayable,
        cash_received: cashReceived,
        dlb_winning: dlbWinning,
        nlb_winning: nlbWinning,
        outstanding_balance: outstandingBalance,
        delivery_route: deliveryRoute,
        sales_rep: salesRep,
        discount_total: discountTotal,
        // Keep existing status when editing; default draft for new invoices
        invoice_status: editInvoiceId
          ? ((await import("../services/database").then(db => db.getInvoiceWithItems(editInvoiceId)))?.invoice_status ?? "draft")
          : (mode === "confirm" ? "waiting" : "draft"),
        items: items.filter((it) => it.ticket_name),
      };
      const id = await saveInvoice(invoice);
      if (mode === "print") onSaved(id, "print" as View);
      else if (mode === "confirm") onSaved(id, "confirmed-invoices" as View);
      else onSaved(id, "draft-invoices" as View);
    } catch (e) {
      alert("Error saving invoice: " + String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!agentId) { setCommissionPreview(0); return; }
    import("../services/database").then(({ getCommissionSchemes }) =>
      getCommissionSchemes().then(schemes => {
        const s = schemes.find(x => x.agent_id === Number(agentId) && x.is_active)
                 ?? schemes.find(x => !x.agent_id && x.is_active);
        if (!s) { setCommissionPreview(0); return; }
        const rate = s.commission_type === "percentage"
          ? invoiceTotal * s.rate / 100
          : s.commission_type === "per_ticket"
          ? totalTickets * s.rate
          : s.rate;
        setCommissionPreview(Math.round(rate * 100) / 100);
      })
    );
  }, [agentId, invoiceTotal, totalTickets]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const selectedAgent = agents.find((a) => a.id === Number(agentId));

  return (
    <div style={{ background: "#F3F4F6", minHeight: "100%" }}>
      {/* ── Top chrome ── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span>Sales</span>
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>
            {editInvoiceId ? "Edit Invoice" : "New Invoice"}
          </span>
        </nav>

        {/* Actions row */}
        <div className="flex gap-2 flex-wrap items-center">
          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: showPreview ? "#1D1D1D" : "#FFFFFF",
              border: "1px solid #E8E8E8",
              color: showPreview ? "#FFFFFF" : "#1D1D1D",
            }}
          >
            {showPreview ? <EyeOff size={14}/> : <Eye size={14}/>}
            {showPreview ? "Hide Preview" : "Preview"}
          </button>
          {/* Save as Draft (gray) */}
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "#6B7280" }}
          >
            <Save size={15} /> {saving ? "Saving…" : "Save Draft"}
          </button>
          {/* Confirm Invoice (blue) */}
          <button
            onClick={() => handleSave("confirm")}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "#2563EB" }}
          >
            <Save size={15} /> Confirm
          </button>
          <button
            onClick={() => handleSave("print")}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-gray-50 disabled:opacity-50"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {/* ── Split-pane layout ── */}
      <div className={`px-6 pb-6 gap-5 ${showPreview ? "flex items-start" : "block space-y-5"}`}>

        {/* ── LEFT — Form ── */}
        <div className={`space-y-5 ${showPreview ? "flex-1 min-w-0" : ""}`}>

        {/* Page title */}
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>
            {editInvoiceId ? "Edit Invoice" : "New Invoice"}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            {editInvoiceId ? "Update invoice details and line items" : "Create a new delivery invoice for an agent"}
          </p>
        </div>

        {/* Invoice Details card */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}
          >
            <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Invoice Details</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {/* Invoice No */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: "#9CA3AF" }}
                >
                  Invoice No.
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: "#9CA3AF" }}
                >
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                />
              </div>

              {/* Agent */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: "#9CA3AF" }}
                >
                  Agent
                </label>
                <select
                  value={agentId}
                  onChange={(e) => handleAgentChange(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                >
                  <option value="">-- Select Agent --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {selectedAgent && (
                  <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                    Reg: {selectedAgent.nlb_reg} / {selectedAgent.dlb_reg}
                  </p>
                )}
              </div>

              {/* Prepared By */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: "#9CA3AF" }}
                >
                  Prepared By
                </label>
                <input
                  type="text"
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                />
              </div>
            </div>

            {/* Credit limit warning */}
            {creditWarning && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: creditWarning.includes("OVER") ? "#FEE2E2" : "#FEF9C3",
                  border: `1px solid ${creditWarning.includes("OVER") ? "#FECACA" : "#FDE68A"}`,
                  color: creditWarning.includes("OVER") ? "#CF291D" : "#92400e" }}>
                {creditWarning}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                  Delivery Route
                </label>
                <input type="text" value={deliveryRoute}
                  onChange={e => setDeliveryRoute(e.target.value)}
                  placeholder="e.g. Colombo North, Route A"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "#CF291D")}
                  onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")}/>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                  Sales Rep
                </label>
                <input type="text" value={salesRep}
                  onChange={e => setSalesRep(e.target.value)}
                  placeholder="Sales representative name"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "#CF291D")}
                  onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")}/>
              </div>
            </div>
          </div>
        </div>

        {/* Shared datalist for ticket name inputs — shows available stock in label */}
        <datalist id="games-list">
          {games.map((g) => {
            const avail = stockMap[g.name] ?? 0;
            return <option key={g.id} value={g.name} label={`Stock: ${avail.toLocaleString()}`} />;
          })}
        </datalist>

        {/* Ticket Lines card */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}
          >
            <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Ticket Lines</span>
            <button
              onClick={addItem}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "#CF291D" }}
            >
              <Plus size={13} /> Add Line
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
                  <th
                    className="px-4 py-3 text-left w-8"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                  >
                    #
                  </th>
                  <th
                    className="px-4 py-3 text-left"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 180 }}
                  >
                    Ticket Name
                  </th>
                  <th
                    className="px-4 py-3 text-left"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 130 }}
                  >
                    Barcode Start
                  </th>
                  <th
                    className="px-4 py-3 text-left"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 130 }}
                  >
                    <span className="flex items-center gap-1">
                      Barcode End
                      <span title="Auto-calculated from Start + Qty">
                        <Calculator size={11} style={{ color: "#BFBFBF" }} />
                      </span>
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-right"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 80 }}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Qty
                      <span title="Auto-calculated from barcodes">
                        <Calculator size={11} style={{ color: "#BFBFBF" }} />
                      </span>
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-left"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 70 }}
                  >
                    Unit
                  </th>
                  <th
                    className="px-4 py-3 text-right"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 110 }}
                  >
                    Unit Price (Rs.)
                  </th>
                  <th
                    className="px-4 py-3 text-right"
                    style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 110 }}
                  >
                    Value (Rs.)
                  </th>
                  <th className="px-4 py-3 text-right" style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", minWidth:80 }}>
                    Disc %
                  </th>
                  <th className="px-4 py-3 text-right" style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", minWidth:110 }}>
                    Net Value (Rs.)
                  </th>
                  <th className="px-4 py-3 w-10" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr
                    key={i}
                    className="hover:bg-gray-50/60 transition-colors"
                    style={{ borderBottom: "1px solid #F9F9F9" }}
                  >
                    <td className="px-4 py-2 text-xs" style={{ color: "#9CA3AF" }}>{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        list="games-list"
                        value={item.ticket_name}
                        onChange={(e) => updateItem(i, "ticket_name", e.target.value)}
                        placeholder="Ticket name…"
                        className="w-full rounded px-2 py-1 text-sm focus:outline-none"
                        style={{ border: "1px solid transparent", background: "transparent", color: "#1D1D1D" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={item.barcode_start}
                        onChange={(e) => updateItem(i, "barcode_start", e.target.value)}
                        placeholder="62900474690"
                        className="w-full rounded px-2 py-1 text-sm font-mono focus:outline-none"
                        style={{ border: "1px solid transparent", background: "transparent", color: "#1D1D1D" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={item.barcode_end}
                        onChange={(e) => updateItem(i, "barcode_end", e.target.value)}
                        placeholder="62900476939"
                        className="w-full rounded px-2 py-1 text-sm font-mono focus:outline-none"
                        style={{ border: "1px solid transparent", background: "transparent", color: "#1D1D1D" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {(() => {
                        const avail = item.ticket_name ? (stockMap[item.ticket_name] ?? null) : null;
                        const overStock = avail !== null && item.qty > avail;
                        return (
                          <>
                            <input
                              type="number"
                              min="0"
                              max={avail ?? undefined}
                              value={item.qty || ""}
                              placeholder="0"
                              onChange={(e) => updateItem(i, "qty", parseInt(e.target.value) || 0)}
                              className="w-full rounded px-2 py-1 text-sm text-right focus:outline-none"
                              style={{
                                border: `1px solid ${overStock ? "#EF4444" : "transparent"}`,
                                background: overStock ? "#FEF2F2" : "transparent",
                                color: "#1D1D1D",
                              }}
                              onFocus={(e) => { e.target.select(); e.currentTarget.style.borderColor = overStock ? "#EF4444" : "#CF291D"; }}
                              onBlur={(e) => (e.currentTarget.style.borderColor = overStock ? "#EF4444" : "transparent")}
                            />
                            {avail !== null && item.ticket_name && (
                              <div style={{
                                fontSize: "10px", textAlign: "right", marginTop: "1px",
                                color: avail === 0 ? "#EF4444" : overStock ? "#EF4444" : avail < 100 ? "#D97706" : "#16A34A",
                                fontWeight: 600,
                              }}>
                                {avail === 0 ? "No stock" : `${avail.toLocaleString()} avail`}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={item.qty_unit}
                        onChange={(e) => updateItem(i, "qty_unit", e.target.value)}
                        placeholder="Tickets"
                        className="w-full rounded px-2 py-1 text-sm focus:outline-none"
                        style={{ border: "1px solid transparent", background: "transparent", color: "#1D1D1D" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price || ""}
                        placeholder="0"
                        onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)}
                        className="w-full rounded px-2 py-1 text-sm text-right focus:outline-none"
                        style={{ border: "1px solid transparent", background: "transparent", color: "#1D1D1D" }}
                        onFocus={(e) => { e.target.select(); e.currentTarget.style.borderColor = "#CF291D"; }}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold" style={{ color: "#1D1D1D" }}>
                      {fmt(item.value)}
                    </td>
                    {/* Discount % input */}
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" max="100" step="0.1"
                        value={item.discount_pct || ""}
                        placeholder="0"
                        onChange={e => updateItem(i, "discount_pct", parseFloat(e.target.value) || 0)}
                        className="w-full rounded px-2 py-1 text-sm text-right focus:outline-none"
                        style={{ border:"1px solid transparent", background:"transparent", color:"#d97706" }}
                        onFocus={e => { e.target.select(); e.currentTarget.style.borderColor = "#CF291D"; }}
                        onBlur={e  => (e.currentTarget.style.borderColor = "transparent")}/>
                    </td>
                    {/* Net Value (computed) */}
                    <td className="px-4 py-2 text-right text-sm font-semibold" style={{ color: (item.discount_pct ?? 0) > 0 ? "#16a34a" : "#1D1D1D" }}>
                      {fmt(item.net_value ?? item.value)}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => removeItem(i)}
                        className="p-1.5 rounded-lg transition-all hover:opacity-80"
                        style={{ background: "#FFF1F0", color: "#CF291D" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                  <td colSpan={4} className="px-4 py-3 text-sm" style={{ color: "#9CA3AF" }}>
                    {totalTickets.toLocaleString()} Tickets
                    {discountTotal > 0 && <span className="ml-3" style={{ color:"#FCD34D" }}>Discount: Rs. {fmt(discountTotal)}</span>}
                  </td>
                  <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#CF291D" }}>
                    INVOICE TOTAL
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>
                    {fmt(invoiceTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Payment & Balance card */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}
          >
            <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Payment &amp; Balance</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left: input fields */}
              <div className="space-y-4">
                {/* Invoice Total (read-only) */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Invoice Total</span>
                  <span className="text-sm font-semibold" style={{ color: "#1D1D1D" }}>{fmt(invoiceTotal)}</span>
                </div>

                {/* Previous Outstanding */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Previous Outstanding
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    // toFixed(2) prevents raw floats like "13486.920000000013" in the input
                    value={Number(prevOutstanding.toFixed(2)) || ""}
                    placeholder="0"
                    onChange={(e) => setPrevOutstanding(Number((parseFloat(e.target.value) || 0).toFixed(2)))}
                    className="w-full rounded-lg px-3 py-2 text-sm text-right focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                    onFocus={(e) => { e.target.select(); e.currentTarget.style.borderColor = "#CF291D"; }}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                  />
                </div>

                {/* Total Payable (read-only) */}
                <div
                  className="flex items-center justify-between py-2"
                  style={{ borderBottom: "1px solid #F3F4F6", borderTop: "1px solid #F3F4F6" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Total Payable</span>
                  <span className="text-sm font-bold" style={{ color: "#1D1D1D" }}>{fmt(totalPayable)}</span>
                </div>

                {/* Cash */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Cash
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cashReceived || ""}
                    placeholder="0"
                    onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-right focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                    onFocus={(e) => { e.target.select(); e.currentTarget.style.borderColor = "#CF291D"; }}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                  />
                </div>

                {/* DLB Winning Tickets */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    DLB Winning Tickets
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={dlbWinning || ""}
                    placeholder="0"
                    onChange={(e) => setDlbWinning(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-right focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                    onFocus={(e) => { e.target.select(); e.currentTarget.style.borderColor = "#CF291D"; }}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                  />
                </div>

                {/* NLB Winning Tickets */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    NLB Winning Tickets
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={nlbWinning || ""}
                    placeholder="0"
                    onChange={(e) => setNlbWinning(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-right focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                    onFocus={(e) => { e.target.select(); e.currentTarget.style.borderColor = "#CF291D"; }}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
                  />
                </div>
              </div>

              {/* Right: totals summary panel */}
              <div className="flex items-stretch">
                <div className="w-full rounded-xl p-5 flex flex-col justify-between" style={{ background: "#F9F9F9", border: "1px solid #E8E8E8" }}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "#6B7280" }}>Invoice Total</span>
                      <span className="font-medium" style={{ color: "#1D1D1D" }}>{fmt(invoiceTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "#6B7280" }}>+ Previous Outstanding</span>
                      <span className="font-medium" style={{ color: "#1D1D1D" }}>{fmt(prevOutstanding)}</span>
                    </div>
                    <div
                      className="flex items-center justify-between text-sm pt-3"
                      style={{ borderTop: "1px solid #E8E8E8" }}
                    >
                      <span className="font-semibold" style={{ color: "#1D1D1D" }}>= Total Payable</span>
                      <span className="font-bold" style={{ color: "#1D1D1D" }}>{fmt(totalPayable)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "#6B7280" }}>- Total Paid</span>
                      <span className="font-medium" style={{ color: "#16a34a" }}>{fmt(totalPaid)}</span>
                    </div>
                    {/* Commission preview */}
                    {commissionPreview > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color:"#7c3aed" }}>≈ Commission (estimate)</span>
                        <span className="font-medium" style={{ color:"#7c3aed" }}>- {fmt(commissionPreview)}</span>
                      </div>
                    )}
                  </div>

                  <div
                    className="mt-5 pt-4 rounded-lg px-4 py-4 text-center"
                    style={{ background: "#FFFFFF", border: "2px solid #CF291D" }}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-widest mb-1"
                      style={{ color: "#9CA3AF" }}
                    >
                      Outstanding Balance
                    </p>
                    <p
                      className="text-3xl font-bold"
                      style={{ color: outstandingBalance > 0 ? "#CF291D" : "#16a34a" }}
                    >
                      {fmt(outstandingBalance)}
                    </p>
                    {outstandingBalance <= 0 && (
                      <span
                        className="mt-2 inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
                        style={{ background: "#16a34a" }}
                      >
                        Settled
                      </span>
                    )}
                    {outstandingBalance > 0 && (
                      <span
                        className="mt-2 inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
                        style={{ background: "#CF291D" }}
                      >
                        Outstanding
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>{/* closes last form card */}
        </div>{/* closes LEFT form wrapper */}

        {/* ── RIGHT — Live A4 Preview Panel ── */}
        {showPreview && (
          <div
            className="shrink-0 sticky top-4"
            style={{ width: 440, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye size={14} style={{ color: "#CF291D" }}/>
                <span className="text-sm font-bold" style={{ color: "#1D1D1D" }}>Live Preview</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "#FEE2E2", color: "#CF291D" }}>A4</span>
              </div>
              <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Updates as you type</span>
            </div>

            {/* A4 Document */}
            <div
              className="rounded-2xl overflow-hidden shadow-xl"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                fontFamily: "'Segoe UI', system-ui, sans-serif",
              }}
            >
              {/* Letterhead */}
              <div style={{ background: "linear-gradient(135deg,#1D1D1D,#374151)", padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "#CF291D",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Building2 size={18} color="#FFFFFF"/>
                      </div>
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", margin: 0 }}>
                          {company?.name ?? "Ajith Rohana Enterprise"}
                        </p>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", margin: 0 }}>
                          NLB: {company?.nlb_reg} &nbsp;·&nbsp; DLB: {company?.dlb_reg}
                        </p>
                      </div>
                    </div>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", margin: 0 }}>{company?.address}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", margin: 0 }}>{company?.phone}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ background: "rgba(207,41,29,0.25)", border: "1px solid rgba(207,41,29,0.4)",
                      borderRadius: 8, padding: "8px 14px" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.1em", color: "#CF291D", margin: "0 0 2px" }}>Invoice</p>
                      <p style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF", margin: 0 }}>
                        #{invoiceNumber || "—"}
                      </p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: "2px 0 0" }}>
                        {invoiceDate}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div style={{ padding: "16px 24px", borderBottom: "1px solid #F3F4F6",
                background: "#FAFAFA" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 4px" }}>Bill To</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#1D1D1D", margin: 0 }}>
                      {selectedAgent?.name ?? <span style={{ color: "#BFBFBF" }}>Select an agent</span>}
                    </p>
                    {selectedAgent && (
                      <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                        NLB: {selectedAgent.nlb_reg} · DLB: {selectedAgent.dlb_reg}
                      </p>
                    )}
                    {selectedAgent?.phone && (
                      <p style={{ fontSize: 11, color: "#6B7280", margin: "1px 0 0" }}>{selectedAgent.phone}</p>
                    )}
                  </div>
                  {(deliveryRoute || salesRep) && (
                    <div style={{ textAlign: "right" }}>
                      {deliveryRoute && (
                        <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 2px" }}>
                          Route: <strong>{deliveryRoute}</strong>
                        </p>
                      )}
                      {salesRep && (
                        <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                          Rep: <strong>{salesRep}</strong>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Line items table */}
              <div style={{ padding: "0 24px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #1D1D1D" }}>
                      {["#", "Ticket / Game", "Barcode Range", "Qty", "Unit Price", "Value"].map(h => (
                        <th key={h} style={{ padding: "10px 6px", textAlign: h === "#" || h === "Ticket / Game" ? "left" : "right",
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.06em", color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter(it => it.ticket_name).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "20px 6px", textAlign: "center",
                          color: "#BFBFBF", fontSize: 12 }}>
                          Add ticket lines to see them here
                        </td>
                      </tr>
                    ) : (
                      items.filter(it => it.ticket_name).map((it, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F5F5F5" }}>
                          <td style={{ padding: "8px 6px", color: "#9CA3AF", fontSize: 11 }}>{i + 1}</td>
                          <td style={{ padding: "8px 6px", fontWeight: 600, color: "#1D1D1D" }}>{it.ticket_name}</td>
                          <td style={{ padding: "8px 6px", color: "#6B7280", fontSize: 10, fontFamily: "monospace" }}>
                            {it.barcode_start && it.barcode_end ? `${it.barcode_start} → ${it.barcode_end}` : "—"}
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right", color: "#1D1D1D" }}>
                            {it.qty.toLocaleString()}
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right", color: "#6B7280" }}>
                            {fmt(it.unit_price)}
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, color: "#1D1D1D" }}>
                            {fmt(it.net_value ?? it.value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ padding: "12px 24px 6px", borderTop: "1px solid #F3F4F6" }}>
                {[
                  { label: "Subtotal", val: invoiceTotal, bold: false },
                  ...(discountTotal > 0 ? [{ label: "Discount", val: -discountTotal, bold: false }] : []),
                  { label: "Previous Outstanding", val: prevOutstanding, bold: false },
                  { label: "Total Payable", val: totalPayable, bold: true, separator: true },
                  { label: "Cash Received", val: cashReceived, bold: false, green: true },
                  ...(dlbWinning > 0 ? [{ label: "DLB Winnings", val: dlbWinning, bold: false, green: true }] : []),
                  ...(nlbWinning > 0 ? [{ label: "NLB Winnings", val: nlbWinning, bold: false, green: true }] : []),
                ].map((row, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "4px 0",
                    borderTop: (row as any).separator ? "1.5px solid #E8E8E8" : undefined,
                    marginTop: (row as any).separator ? 6 : undefined,
                  }}>
                    <span style={{ fontSize: 12, color: row.bold ? "#1D1D1D" : "#6B7280",
                      fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: row.bold ? 800 : 500,
                      color: (row as any).green ? "#16a34a" : row.val < 0 ? "#CF291D" : row.bold ? "#1D1D1D" : "#374151" }}>
                      {row.val < 0 ? "−" : ""}Rs. {fmt(Math.abs(row.val))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Outstanding balance highlight */}
              <div style={{ margin: "8px 24px 20px", padding: "14px 16px", borderRadius: 10,
                background: outstandingBalance > 0 ? "#FEF2F2" : "#F0FDF4",
                border: `2px solid ${outstandingBalance > 0 ? "#CF291D" : "#16a34a"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: outstandingBalance > 0 ? "#CF291D" : "#16a34a" }}>
                    Outstanding Balance
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 900,
                    color: outstandingBalance > 0 ? "#CF291D" : "#16a34a" }}>
                    Rs. {fmt(outstandingBalance)}
                  </span>
                </div>
                {outstandingBalance <= 0 && (
                  <p style={{ fontSize: 11, color: "#16a34a", margin: "4px 0 0", fontWeight: 600 }}>
                    ✓ Fully Settled
                  </p>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: "12px 24px", borderTop: "1px solid #F3F4F6",
                background: "#FAFAFA", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                  Prepared by: {preparedBy}
                </span>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                  {company?.name ?? "Ajith Rohana Enterprise"}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>{/* end split-pane */}
    </div>
  );
}

function today() {
  return new Date().toISOString().split("T")[0];
}
