import React, { useEffect, useState } from "react";
import {
  Plus, Trash2, X, Save, RefreshCw, Home, ChevronRight,
  RotateCcw, CheckCircle, AlertTriangle, ShoppingCart, Image,
} from "lucide-react";
import TicketLogoPicker from "./TicketLogoPicker";
import { resolveLogoUrl } from "./TicketLogoPicker";
import {
  getDb, getLotteryGames, getPurchaseInvoices,
} from "../services/database";
import { useAuth } from "../contexts/AuthContext";
import type { PurchaseInvoice, LotteryGame } from "../types";
import { calcEndBarcode, calcQtyFromBarcodes, isNumericBarcode } from "../utils/barcode";

// ── Local types ───────────────────────────────────────────────────────────────

interface SupplierReturn {
  id?: number;
  purchase_id?: number | null;
  purchase_number?: string;
  return_date: string;
  game_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  unit_price: number;
  total_value: number;
  return_reason: string;
  status: "pending" | "credited";
  notes: string;
  created_at?: string;
}

type ReturnReason = "unsold" | "damaged" | "expired_draw" | "exchange" | "other";

// ── Inline DB functions ───────────────────────────────────────────────────────

async function getSupplierReturns(): Promise<SupplierReturn[]> {
  const d = await getDb();
  return d.select<SupplierReturn[]>(`
    SELECT sr.*, pi.purchase_number
    FROM supplier_returns sr
    LEFT JOIN purchase_invoices pi ON pi.id = sr.purchase_id
    ORDER BY sr.return_date DESC, sr.id DESC
  `);
}

async function saveSupplierReturn(r: SupplierReturn): Promise<number> {
  const d = await getDb();
  const val = Number((r.qty * r.unit_price).toFixed(2));
  if (r.id) {
    await d.execute(
      `UPDATE supplier_returns SET purchase_id=?,return_date=?,game_name=?,
       barcode_start=?,barcode_end=?,qty=?,unit_price=?,total_value=?,
       return_reason=?,notes=? WHERE id=?`,
      [r.purchase_id ?? null, r.return_date, r.game_name, r.barcode_start,
       r.barcode_end, r.qty, r.unit_price, val, r.return_reason, r.notes, r.id]
    );
    return r.id;
  }
  const res = await d.execute(
    `INSERT INTO supplier_returns (purchase_id,return_date,game_name,barcode_start,barcode_end,qty,unit_price,total_value,return_reason,status,notes)
     VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`,
    [r.purchase_id ?? null, r.return_date, r.game_name, r.barcode_start,
     r.barcode_end, r.qty, r.unit_price, val, r.return_reason, r.notes]
  );
  return res.lastInsertId as number;
}

async function creditSupplierReturn(id: number): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ id: number; game_name: string; qty: number; total_value: number; purchase_id: number | null }[]>(
    "SELECT * FROM supplier_returns WHERE id=?", [id]
  );
  if (!rows.length) return;
  const ret = rows[0];
  // 1. Mark as credited
  await d.execute("UPDATE supplier_returns SET status='credited' WHERE id=?", [id]);
  // 2. Decrease inventory total_qty (FIFO — oldest batch first)
  await d.execute(
    `UPDATE inventory_batches
     SET total_qty = MAX(0, total_qty - ?),
         distributed_qty = MAX(0, MIN(distributed_qty, MAX(0, total_qty - ?)))
     WHERE id = (
       SELECT id FROM inventory_batches
       WHERE game_name = ?
       ORDER BY batch_date ASC LIMIT 1
     )`,
    [ret.qty, ret.qty, ret.game_name]
  );
  // 3. Apply credit to purchase invoice outstanding balance
  if (ret.purchase_id) {
    await d.execute(
      `UPDATE purchase_invoices
       SET outstanding_balance = MAX(0, outstanding_balance - ?)
       WHERE id = ?`,
      [ret.total_value, ret.purchase_id]
    );
  }
}

async function deleteSupplierReturn(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM supplier_returns WHERE id=?", [id]);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RETURN_REASONS: { value: ReturnReason; label: string; color: string }[] = [
  { value: "unsold",       label: "Unsold",        color: "#6B7280" },
  { value: "damaged",      label: "Damaged",       color: "#CF291D" },
  { value: "expired_draw", label: "Expired Draw",  color: "#d97706" },
  { value: "exchange",     label: "Exchange",      color: "#2563eb" },
  { value: "other",        label: "Other",         color: "#7c3aed" },
];

const EMPTY_FORM = (): SupplierReturn => ({
  return_date: new Date().toISOString().split("T")[0],
  game_name: "",
  barcode_start: "",
  barcode_end: "",
  qty: 0,
  unit_price: 32.5,
  total_value: 0,
  return_reason: "unsold",
  status: "pending",
  notes: "",
  purchase_id: null,
});

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierReturns() {
  const { withAdminToken } = useAuth();

  const [returns, setReturns]         = useState<SupplierReturn[]>([]);
  const [games, setGames]             = useState<LotteryGame[]>([]);
  const [showLogoPicker, setLogoPicker] = useState(false);
  const [invoices, setInvoices]       = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading]         = useState(true);
  const [authError, setAuthError]     = useState<string | null>(null);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [form, setForm]               = useState<SupplierReturn>(EMPTY_FORM());
  const [saving, setSaving]           = useState(false);
  const [confirmCredit, setConfirmCredit] = useState<SupplierReturn | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const [r, g, inv] = await Promise.all([
        getSupplierReturns(),
        getLotteryGames(),
        getPurchaseInvoices(),
      ]);
      setReturns(r);
      setGames(g);
      setInvoices(inv);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── Form helpers ──────────────────────────────────────────────────────────────

  function openNew() {
    setForm(EMPTY_FORM());
    setPanelOpen(true);
    setAuthError(null);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  function setField(field: keyof SupplierReturn, value: string | number | null) {
    setForm((prev) => {
      const updated = { ...prev, [field]: value } as SupplierReturn;

      // Barcode / qty cross-computation
      if (field === "qty" && isNumericBarcode(updated.barcode_start)) {
        updated.barcode_end = calcEndBarcode(updated.barcode_start, Number(value));
      } else if (field === "barcode_end" && isNumericBarcode(updated.barcode_start) && isNumericBarcode(String(value ?? ""))) {
        updated.qty = calcQtyFromBarcodes(updated.barcode_start, String(value ?? ""));
      } else if (field === "barcode_start" && isNumericBarcode(String(value ?? ""))) {
        if (updated.qty > 0) updated.barcode_end = calcEndBarcode(String(value ?? ""), updated.qty);
        else if (isNumericBarcode(updated.barcode_end)) updated.qty = calcQtyFromBarcodes(String(value ?? ""), updated.barcode_end);
      }

      // Auto-fill unit price from game
      if (field === "game_name") {
        const g = games.find((x) => x.name === String(value));
        if (g) updated.unit_price = g.unit_price;
      }

      updated.total_value = Math.round(updated.qty * updated.unit_price * 100) / 100;
      return updated;
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.game_name.trim()) { alert("Game / ticket name is required."); return; }
    if (form.qty <= 0)          { alert("Quantity must be greater than 0."); return; }
    setSaving(true);
    try {
      await saveSupplierReturn(form);
      closePanel();
      load();
    } catch (err) {
      alert(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Credit ────────────────────────────────────────────────────────────────────

  async function handleCredit(ret: SupplierReturn) {
    setConfirmCredit(ret);
  }

  async function confirmCreditAction() {
    if (!confirmCredit?.id) return;
    setAuthError(null);
    const id = confirmCredit.id;
    setConfirmCredit(null);
    try {
      await creditSupplierReturn(id);
      load();
    } catch (err) {
      setAuthError(`Credit failed: ${String(err)}`);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(id: number) {
    setAuthError(null);
    try {
      await withAdminToken(async () => {
        if (!confirm("Delete this supplier return? This action cannot be undone.")) return;
        await deleteSupplierReturn(id);
        load();
      });
    } catch (err) {
      setAuthError(
        String(err).includes("session")
          ? "Admin session required to delete supplier returns."
          : String(err)
      );
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const totalReturns   = returns.length;
  const totalValue     = returns.reduce((s, r) => s + r.total_value, 0);
  const creditedCount  = returns.filter((r) => r.status === "credited").length;
  const pendingValue   = returns.filter((r) => r.status === "pending").reduce((s, r) => s + r.total_value, 0);
  const creditedValue  = returns.filter((r) => r.status === "credited").reduce((s, r) => s + r.total_value, 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>

      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Supplier Returns</span>
        </nav>
      </div>

      {/* Auth / error banner */}
      {authError && (
        <div
          className="mx-6 mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#CF291D" }}
        >
          <AlertTriangle size={14} />
          <span>{authError}</span>
          <button className="ml-auto font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      <div className="px-6 pb-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>
              Supplier Returns
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              Ajith Rohana → Nimalsiri Enterprises · unsold / damaged ticket credits
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-gray-50 disabled:opacity-50"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
              style={{ background: "#CF291D" }}
            >
              <Plus size={14} /> Record Return
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Returns"
            value={totalReturns.toLocaleString()}
            sub="all time"
            accent="#3B82F6"
            icon={<RotateCcw size={18} />}
          />
          <StatCard
            label="Total Value"
            value={`Rs. ${fmt(totalValue)}`}
            sub="all returns"
            accent="#CF291D"
            icon={<ShoppingCart size={18} />}
          />
          <StatCard
            label="Credited"
            value={creditedCount.toLocaleString()}
            sub={`Rs. ${fmt(creditedValue)} applied`}
            accent="#16a34a"
            icon={<CheckCircle size={18} />}
          />
        </div>

        {/* Returns table */}
        <div
          className="rounded-2xl overflow-hidden shadow-sm"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}
        >
          {/* Dark table header */}
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}
          >
            <span className="text-sm font-semibold text-white">Returns Register</span>
            <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
              {returns.length} record{returns.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: "#F3F4F6" }}
              >
                <RotateCcw size={22} style={{ color: "#BFBFBF" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>No supplier returns yet</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                Click "Record Return" to register a new return
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                    {[
                      "Date", "Game", "Barcode Range", "Qty", "Value (Rs.)",
                      "Purchase Ref", "Reason", "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left"
                        style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                      >
                        {h}
                      </th>
                    ))}
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => {
                    const reason = RETURN_REASONS.find((x) => x.value === r.return_reason) ?? RETURN_REASONS[0];
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50/60 transition-colors"
                        style={{ borderBottom: "1px solid #F9F9F9" }}
                      >
                        {/* Date */}
                        <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: "#6B7280" }}>
                          {fmtDate(r.return_date)}
                        </td>
                        {/* Game — logo + name */}
                        <td className="px-4 py-3">
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <img src={resolveLogoUrl(r.game_name)} alt=""
                              style={{ width:52, height:52, objectFit:"contain", borderRadius:6, flexShrink:0, background:"#F3F4F6" }}
                              onError={e => { (e.currentTarget as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect width='36' height='36' rx='6' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='18'%3E🎫%3C/text%3E%3C/svg%3E"; }}
                            />
                            <span style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{r.game_name}</span>
                          </div>
                        </td>
                        {/* Barcode range */}
                        <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: "#6B7280" }}>
                          {r.barcode_start}{r.barcode_end ? ` → ${r.barcode_end}` : ""}
                        </td>
                        {/* Qty */}
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>
                          {r.qty.toLocaleString()}
                        </td>
                        {/* Value */}
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#d97706" }}>
                          {fmt(r.total_value)}
                        </td>
                        {/* Purchase ref */}
                        <td className="px-4 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {r.purchase_number
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#EFF6FF", color: "#2563eb" }}>
                                #{r.purchase_number}
                              </span>
                            : <span style={{ color: "#D1D5DB" }}>—</span>
                          }
                        </td>
                        {/* Reason */}
                        <td className="px-4 py-3">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: `${reason.color}18`, color: reason.color }}
                          >
                            {reason.label}
                          </span>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          {r.status === "credited" ? (
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: "#F0FDF4", color: "#16a34a" }}
                            >
                              Credited ✓
                            </span>
                          ) : (
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: "#FFFBEB", color: "#d97706" }}
                            >
                              Pending
                            </span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            {r.status === "pending" && (
                              <button
                                onClick={() => handleCredit(r)}
                                title="Apply Credit"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
                                style={{ background: "#F0FDF4", color: "#16a34a", border: "1px solid #BBF7D0" }}
                              >
                                <CheckCircle size={11} /> Apply
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(r.id!)}
                              title="Delete"
                              className="p-1.5 rounded-lg hover:opacity-80 transition-all"
                              style={{ background: "#FFF1F0", color: "#CF291D" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer summary */}
          {returns.length > 0 && (
            <div
              className="px-5 py-3 flex items-center justify-end gap-6 text-xs"
              style={{ background: "#FAFAFA", borderTop: "1px solid #F3F4F6" }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color: "#9CA3AF" }}>Pending</span>
                <span className="font-bold" style={{ color: "#d97706" }}>Rs. {fmt(pendingValue)}</span>
              </div>
              <div className="w-px h-4" style={{ background: "#E8E8E8" }} />
              <div className="flex items-center gap-1.5">
                <span style={{ color: "#9CA3AF" }}>Credited</span>
                <span className="font-bold" style={{ color: "#16a34a" }}>Rs. {fmt(creditedValue)}</span>
              </div>
              <div className="w-px h-4" style={{ background: "#E8E8E8" }} />
              <div className="flex items-center gap-1.5">
                <span style={{ color: "#9CA3AF" }}>Total</span>
                <span className="font-bold" style={{ color: "#1D1D1D" }}>Rs. {fmt(totalValue)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-in right panel ──────────────────────────────────────────────── */}

      {/* Backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.25)" }}
          onClick={closePanel}
        />
      )}

      {/* Panel — isolation:isolate blocks sidebar backdrop-filter from bleeding through */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{
          width: "min(480px, 95vw)",
          background: "#FFFFFF",
          transform: panelOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          borderLeft: "1px solid #E8E8E8",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.18)",
          isolation: "isolate",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}
        >
          <div>
            <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Record Supplier Return</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Ajith → Nimalsiri · inventory &amp; payable adjustment
            </p>
          </div>
          <button
            onClick={closePanel}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            style={{ color: "#9CA3AF" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Panel body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Return Date */}
          <div>
            <FieldLabel>Return Date</FieldLabel>
            <FocusInput
              type="date"
              value={form.return_date}
              onChange={(e) => setField("return_date", e.target.value)}
            />
          </div>

          {/* Game — logo picker */}
          <div>
            <FieldLabel>Game / Ticket Name *</FieldLabel>
            <button type="button" onClick={() => setLogoPicker(true)}
              style={{
                display:"flex", alignItems:"center", gap:10, width:"100%",
                padding:"8px 12px", border:`1px solid ${form.game_name?"#E5E7EB":"#CF291D"}`,
                borderRadius:8, background: form.game_name?"#F9FAFB":"#FEF2F2",
                cursor:"pointer", textAlign:"left",
              }}>
              {form.game_name ? (
                <>
                  <img src={resolveLogoUrl(form.game_name)} alt=""
                    style={{ width:52, height:52, objectFit:"contain", borderRadius:5, flexShrink:0 }}
                    onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}}/>
                  <span style={{ fontSize:13, fontWeight:700, color:"#111827", flex:1 }}>{form.game_name}</span>
                  <span style={{ fontSize:11, color:"#9CA3AF" }}>click to change</span>
                </>
              ) : (
                <>
                  <Image size={18} style={{ color:"#CF291D", flexShrink:0 }}/>
                  <span style={{ fontSize:13, fontWeight:600, color:"#CF291D" }}>Click to select ticket…</span>
                </>
              )}
            </button>
            {showLogoPicker && (
              <TicketLogoPicker
                currentValue={form.game_name}
                onSelect={name => { setField("game_name", name); setLogoPicker(false); }}
                onClose={() => setLogoPicker(false)}
              />
            )}
          </div>

          {/* Barcode row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Barcode Start</FieldLabel>
              <FocusInput
                type="text"
                value={form.barcode_start}
                onChange={(e) => setField("barcode_start", e.target.value)}
                placeholder="62900474690"
                mono
              />
            </div>
            <div>
              <FieldLabel>Barcode End (auto)</FieldLabel>
              <FocusInput
                type="text"
                value={form.barcode_end}
                onChange={(e) => setField("barcode_end", e.target.value)}
                placeholder="Auto-calculated"
                mono
              />
            </div>
          </div>

          {/* Qty + Unit Price + Total */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Qty</FieldLabel>
              <FocusInput
                type="number"
                min="0"
                value={form.qty || ""}
                placeholder="0"
                onChange={(e) => setField("qty", parseInt(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div>
              <FieldLabel>Unit Price (Rs.)</FieldLabel>
              <FocusInput
                type="number"
                step="0.01"
                min="0"
                value={form.unit_price || ""}
                placeholder="0"
                onChange={(e) => setField("unit_price", parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div>
              <FieldLabel>Total Value</FieldLabel>
              <div
                className="w-full rounded-lg px-3 py-2 text-sm font-bold"
                style={{ border: "1px solid #E8E8E8", background: "#F9F9F9", color: "#16a34a" }}
              >
                Rs. {fmt(form.total_value)}
              </div>
            </div>
          </div>

          {/* Return reason */}
          <div>
            <FieldLabel>Return Reason</FieldLabel>
            <FocusSelect
              value={form.return_reason}
              onChange={(e) => setField("return_reason", e.target.value)}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </FocusSelect>
          </div>

          {/* Purchase invoice (optional) */}
          <div>
            <FieldLabel>Link to Purchase Invoice (optional)</FieldLabel>
            <FocusSelect
              value={form.purchase_id ?? ""}
              onChange={(e) => setField("purchase_id", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  #{inv.purchase_number} · Outstanding: Rs. {fmt(inv.outstanding_balance)}
                </option>
              ))}
            </FocusSelect>
            <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
              When credited, this reduces the invoice's outstanding balance.
            </p>
          </div>

          {/* Notes */}
          <div>
            <FieldLabel>Notes</FieldLabel>
            <FocusInput
              type="text"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Additional details…"
            />
          </div>

        </div>

        {/* Panel footer */}
        <div
          className="flex gap-2 px-5 py-4 flex-shrink-0"
          style={{ borderTop: "1px solid #F3F4F6" }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-50"
            style={{ background: "#CF291D" }}
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save Return"}
          </button>
          <button
            onClick={closePanel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
          >
            <X size={14} /> Cancel
          </button>
        </div>
      </div>

      {/* ── Credit confirmation dialog ─────────────────────────────────────────── */}
      {confirmCredit && (
        <div className="fixed inset-0 z-60 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div
            className="rounded-2xl shadow-2xl p-6 mx-4"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", maxWidth: 400, width: "100%" }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "#FEF2F2" }}
              >
                <AlertTriangle size={18} style={{ color: "#CF291D" }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Apply Supplier Credit?</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "#6B7280" }}>
                  This will reduce inventory by{" "}
                  <span className="font-semibold" style={{ color: "#1D1D1D" }}>
                    {confirmCredit.qty.toLocaleString()} units
                  </span>{" "}
                  of <span className="font-semibold" style={{ color: "#1D1D1D" }}>{confirmCredit.game_name}</span> and
                  credit{" "}
                  <span className="font-semibold" style={{ color: "#CF291D" }}>
                    Rs. {fmt(confirmCredit.total_value)}
                  </span>{" "}
                  to the supplier account.
                  {confirmCredit.purchase_number && (
                    <> Invoice <span className="font-semibold">#{confirmCredit.purchase_number}</span> outstanding balance will be reduced.</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmCredit(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCreditAction}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                style={{ background: "#16a34a" }}
              >
                <CheckCircle size={13} /> Apply Credit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 shadow-sm flex items-start gap-3"
      style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: `3px solid ${accent}` }}
    >
      {icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${accent}12`, color: accent }}
        >
          {icon}
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>
          {label}
        </p>
        <p className="text-2xl font-black leading-none" style={{ color: "#1D1D1D" }}>
          {value}
        </p>
        <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>{sub}</p>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
      style={{ color: "#9CA3AF" }}
    >
      {children}
    </label>
  );
}

function FocusInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }
) {
  const { mono, onFocus, onBlur, style: propStyle, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...rest}
      className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none${mono ? " font-mono" : ""}`}
      style={{
        border: `1px solid ${focused ? "#CF291D" : "#E8E8E8"}`,
        background: "#FAFAFA",
        color: "#1D1D1D",
        ...propStyle,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); onBlur?.(e); }}
    />
  );
}

function FocusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...rest}
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
      style={{
        border: `1px solid ${focused ? "#CF291D" : "#E8E8E8"}`,
        background: "#FAFAFA",
        color: "#1D1D1D",
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); onBlur?.(e); }}
    >
      {children}
    </select>
  );
}
