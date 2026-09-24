import { useEffect, useState } from "react";
import {
  Plus, Trash2, X, Save, RefreshCw, ShoppingCart,
  Home, ChevronRight, Package,
  CreditCard, ChevronDown, ChevronUp, ShieldAlert, Image,
} from "lucide-react";
import {
  getPurchaseInvoices, savePurchaseInvoice, deletePurchaseInvoice,
  getPurchasePayments, savePurchasePayment, deletePurchasePayment,
  getNextPurchaseNumber, getSupplierOutstanding, getLotteryGames,
} from "../services/database";
import type {
  PurchaseInvoice, PurchaseInvoiceItem, PurchasePayment, PurchasePaymentType,
} from "../types";
import { useAuth } from "../contexts/AuthContext";
import { cleanBarcode, calcEndBarcode, calcQtyFromBarcodes, isNumericBarcode, lastTicketBarcode } from "../utils/barcode";
import TicketLogoPicker, { resolveLogoUrl } from "./TicketLogoPicker";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}

const today = () => new Date().toISOString().split("T")[0];

const PAYMENT_TYPE_LABELS: Record<PurchasePaymentType, string> = {
  cash:          "Cash",
  cheque:        "Cheque",
  return_credit: "Return Credit (Tickets)",
};

const PAYMENT_TYPE_COLORS: Record<PurchasePaymentType, { bg: string; color: string }> = {
  cash:          { bg: "#DCFCE7", color: "#16a34a" },
  cheque:        { bg: "#DBEAFE", color: "#2563eb" },
  return_credit: { bg: "#F3E8FF", color: "#7c3aed" },
};

// resolveLogoUrl is imported from TicketLogoPicker

// ── Empty state helpers ───────────────────────────────────────────────────────

const EMPTY_ITEM = (): PurchaseInvoiceItem => ({
  game_name: "", barcode_start: "", barcode_end: "", qty: 0, unit_price: 0, value: 0, draw_number: "",
});

const EMPTY_PURCHASE = (num: string): PurchaseInvoice => ({
  purchase_number: num,
  supplier_name:   "Nimalsiri Enterprises",
  purchase_date:   today(),
  stock_date:      today(),
  invoice_total:   0,
  initial_payment: 0,
  outstanding_balance: 0,
  status:          "pending",
  notes:           "",
});

const EMPTY_PAYMENT = (purchaseId: number): PurchasePayment => ({
  purchase_id:  purchaseId,
  payment_date: today(),
  payment_type: "cash",
  amount:       0,
  reference:    "",
  notes:        "",
});

// ── Main component ────────────────────────────────────────────────────────────

export default function Purchases() {
  const { withAdminToken } = useAuth();
  const [purchases, setPurchases]     = useState<PurchaseInvoice[]>([]);
  const [totalOwed, setTotalOwed]     = useState(0);
  const [_games, setGames]            = useState<string[]>([]);
  const [gameCostMap, setGameCostMap] = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editPurchase, setEdit]       = useState<PurchaseInvoice | null>(null);
  const [formItems, setFormItems]     = useState<PurchaseInvoiceItem[]>([EMPTY_ITEM()]);
  const [focusedField, setFocused]    = useState<string | null>(null);
  const [expandedId, setExpanded]     = useState<number | null>(null);
  const [paymentsMap, setPaymentsMap] = useState<Record<number, PurchasePayment[]>>({});
  const [paymentForm, setPaymentForm] = useState<PurchasePayment | null>(null);
  const [authError, setAuthError]     = useState<string | null>(null);
  // Logo picker state: which row is currently picking a ticket logo
  const [pickerRow, setPickerRow]     = useState<number | null>(null);
  // Barcode correction: scanner reads one barcode before the actual start
  const [barcodeOffset, setBarcodeOffset] = useState(false);

  useEffect(() => {
    load();
    getLotteryGames().then(gs => {
      setGames(gs.map(g => g.name));
      // Store cost_price per game for auto-fill on game select
      const cp: Record<string, number> = {};
      gs.forEach(g => { cp[g.name] = g.cost_price ?? g.unit_price; });
      setGameCostMap(cp);
    });
  }, []);

  async function load() {
    setLoading(true);
    const [list, owed] = await Promise.all([
      getPurchaseInvoices(),
      getSupplierOutstanding(),
    ]);
    setPurchases(list);
    setTotalOwed(owed);
    setLoading(false);
  }

  async function openNew() {
    const num = await getNextPurchaseNumber();
    setEdit(EMPTY_PURCHASE(num));
    setFormItems([EMPTY_ITEM()]);
    setShowForm(true);
  }

  function openEdit(p: PurchaseInvoice) {
    setEdit({ ...p });
    setFormItems(p.items?.length ? [...p.items] : [EMPTY_ITEM()]);
    setShowForm(true);
  }

  async function handleSave() {
    if (!editPurchase) return;
    const validItems = formItems.filter(it => it.game_name && it.qty > 0 && it.unit_price > 0);
    if (!validItems.length) { alert("Add at least one item with game name, qty and price."); return; }
    if (editPurchase.initial_payment < 0) { alert("Initial payment cannot be negative."); return; }
    await savePurchaseInvoice(editPurchase, validItems);
    setShowForm(false);
    setEdit(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this purchase invoice? All linked payments will also be deleted.")) return;
    setAuthError(null);
    try {
      await withAdminToken(async () => {
        await deletePurchaseInvoice(id!);
        load();
      });
    } catch (err) {
      setAuthError(String(err).includes("session") ? "Admin session required to delete purchase invoices." : String(err));
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) { setExpanded(null); return; }
    setExpanded(id);
    const pmts = await getPurchasePayments(id);
    setPaymentsMap(prev => ({ ...prev, [id]: pmts }));
  }

  async function handleAddPayment() {
    if (!paymentForm) return;
    if (paymentForm.amount <= 0) { alert("Amount must be greater than 0."); return; }
    await savePurchasePayment(paymentForm);
    const pmts = await getPurchasePayments(paymentForm.purchase_id);
    setPaymentsMap(prev => ({ ...prev, [paymentForm.purchase_id]: pmts }));
    setPaymentForm(null);
    load();
  }

  async function handleDeletePayment(id: number, purchaseId: number) {
    if (!confirm("Delete this payment record?")) return;
    setAuthError(null);
    try {
      await withAdminToken(async () => {
        await deletePurchasePayment(id);
        const pmts = await getPurchasePayments(purchaseId);
        setPaymentsMap(prev => ({ ...prev, [purchaseId]: pmts }));
        load();
      });
    } catch (err) {
      setAuthError(String(err).includes("session") ? "Admin session required to delete payment records." : String(err));
    }
  }

  // ── Item helpers ─────────────────────────────────────────────────────────────

  function updateItem(index: number, field: keyof PurchaseInvoiceItem, val: string | number) {
    const updated = formItems.map((it, i) => {
      if (i !== index) return it;
      let next = { ...it, [field]: val };

      // Auto-fill cost price when game is selected
      if (field === "game_name" && gameCostMap[val as string]) {
        next.unit_price = gameCostMap[val as string];
      }

      // Barcode cleaning + auto-calc
      if (field === "barcode_start") {
        let cleaned = cleanBarcode(String(val));
        // Apply scanner offset correction (+1 to start if scanner reads one before actual start)
        if (barcodeOffset && cleaned && !isNaN(Number(cleaned))) {
          cleaned = String(Number(cleaned) + 1);
        }
        next.barcode_start = cleaned;
        // Auto-calculate end from start + qty
        if (next.qty > 0 && isNumericBarcode(cleaned)) {
          next.barcode_end = calcEndBarcode(cleaned, next.qty);
        }
        // Auto-calculate qty from start + end
        if (next.barcode_end && isNumericBarcode(next.barcode_end)) {
          next.qty = calcQtyFromBarcodes(cleaned, next.barcode_end);
        }
      }

      if (field === "barcode_end") {
        const cleaned = cleanBarcode(String(val));
        next.barcode_end = cleaned;
        // Auto-calculate qty from start + end (exclusive convention: qty = end - start)
        if (next.barcode_start && isNumericBarcode(next.barcode_start) && isNumericBarcode(cleaned)) {
          const calculatedQty = calcQtyFromBarcodes(next.barcode_start, cleaned);
          if (calculatedQty > 0) next.qty = calculatedQty;
        }
      }

      if (field === "qty") {
        const q = Number(val);
        next.qty = q;
        // Auto-calculate end from start + qty
        if (next.barcode_start && isNumericBarcode(next.barcode_start) && q > 0) {
          next.barcode_end = calcEndBarcode(next.barcode_start, q);
        }
      }

      // Recalculate value
      next.value = Number(next.qty) * Number(next.unit_price);
      return next;
    });
    setFormItems(updated);
    if (editPurchase) {
      const total = updated.reduce((s, it) => s + it.value, 0);
      setEdit({ ...editPurchase, invoice_total: total });
    }
  }

  const formTotal = formItems.reduce((s, it) => s + it.value, 0);
  const formBalance = formTotal - (editPurchase?.initial_payment ?? 0);

  const inputCls = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";
  const inputStyle = (f: string) => ({
    border: `1px solid ${focusedField === f ? "#CF291D" : "#E8E8E8"}`,
    background: "#FAFAFA",
  });

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>

      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Stock Purchases</span>
        </nav>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", color:"#1D1D1D" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90"
            style={{ background:"#CF291D" }}>
            <Plus size={15}/> New Purchase
          </button>
        </div>
      </div>

      {/* Auth error banner */}
      {authError && (
        <div className="mx-6 mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#CF291D" }}>
          <ShieldAlert size={14}/>
          <span>{authError}</span>
          <button className="ml-auto font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      <div className="px-6 pb-8 space-y-5">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color:"#1D1D1D" }}>Stock Purchases</h1>
          <p className="text-xs mt-0.5" style={{ color:"#9CA3AF" }}>
            Track ticket stock bought from Nimalsiri Enterprises — partial payments &amp; return settlements
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 shadow-sm" style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", borderTop:"3px solid #CF291D" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:"#9CA3AF" }}>Owed to Nimalsiri</p>
            <p className="text-2xl font-black" style={{ color: totalOwed > 0 ? "#CF291D" : "#16a34a" }}>
              Rs. {fmt(totalOwed)}
            </p>
            <p className="text-xs mt-1" style={{ color:"#9CA3AF" }}>live outstanding balance</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", borderTop:"3px solid #2563eb" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:"#9CA3AF" }}>Total Purchases</p>
            <p className="text-2xl font-black" style={{ color:"#1D1D1D" }}>{purchases.length}</p>
            <p className="text-xs mt-1" style={{ color:"#9CA3AF" }}>purchase invoices</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", borderTop:"3px solid #16a34a" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:"#9CA3AF" }}>Settled</p>
            <p className="text-2xl font-black" style={{ color:"#16a34a" }}>
              {purchases.filter(p => p.status === "settled").length}
            </p>
            <p className="text-xs mt-1" style={{ color:"#9CA3AF" }}>fully paid invoices</p>
          </div>
        </div>

        {/* ── New/Edit Purchase Form ── */}
        {showForm && editPurchase && (
          <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background:"#FFFFFF", border:"1px solid #E8E8E8" }}>
            <div className="px-5 py-3.5 flex items-center justify-between"
              style={{ background:"linear-gradient(135deg,#1D1D1D,#374151)", borderBottom:"2px solid #CF291D" }}>
              <h2 className="text-sm font-bold text-white">
                {editPurchase.id ? `Edit Purchase — ${editPurchase.purchase_number}` : `New Purchase — ${editPurchase.purchase_number}`}
              </h2>
              <button onClick={() => { setShowForm(false); setEdit(null); }}
                className="p-1 rounded" style={{ color:"#9CA3AF" }}>
                <X size={15}/>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Header fields */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Purchase No.</label>
                  <input value={editPurchase.purchase_number} readOnly
                    className={inputCls} style={{ ...inputStyle("pno"), background:"#F5F5F5", color:"#6B7280" }}/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Supplier</label>
                  <input value={editPurchase.supplier_name}
                    onChange={e => setEdit({ ...editPurchase, supplier_name: e.target.value })}
                    className={inputCls} style={inputStyle("sup")}
                    onFocus={() => setFocused("sup")} onBlur={() => setFocused(null)}/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Purchase Date</label>
                  <input type="date" value={editPurchase.purchase_date}
                    onChange={e => setEdit({ ...editPurchase, purchase_date: e.target.value })}
                    className={inputCls} style={inputStyle("pd")}
                    onFocus={() => setFocused("pd")} onBlur={() => setFocused(null)}/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Stock / Draw Date</label>
                  <input type="date" value={editPurchase.stock_date}
                    onChange={e => setEdit({ ...editPurchase, stock_date: e.target.value })}
                    className={inputCls} style={inputStyle("sd")}
                    onFocus={() => setFocused("sd")} onBlur={() => setFocused(null)}/>
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4">
                    <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color:"#9CA3AF" }}>Stock Items</label>
                    {/* Scanner offset toggle */}
                    <label className="flex items-center gap-2 cursor-pointer" title="Enable if your barcode scanner reads one ticket before the actual starting barcode">
                      <div onClick={() => setBarcodeOffset(v => !v)}
                        style={{ width:28, height:16, borderRadius:8, background: barcodeOffset?"#CF291D":"#D1D5DB", position:"relative", cursor:"pointer", transition:"background 0.2s" }}>
                        <div style={{ width:12, height:12, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left: barcodeOffset?14:2, transition:"left 0.2s" }}/>
                      </div>
                      <span style={{ fontSize:10, color:"#6B7280" }}>Scanner +1 fix</span>
                    </label>
                  </div>
                  <button onClick={() => setFormItems([...formItems, EMPTY_ITEM()])}
                    className="text-xs font-semibold hover:underline" style={{ color:"#CF291D" }}>
                    + Add Row (Enter)
                  </button>
                </div>

                {barcodeOffset && (
                  <div style={{ padding:"6px 12px", background:"#FEF9C3", borderRadius:8, fontSize:11, color:"#92400E", marginBottom:8, border:"1px solid #FDE68A" }}>
                    ⚡ Scanner +1 correction ON — start barcode automatically incremented by 1
                  </div>
                )}

                <div className="rounded-xl overflow-hidden" style={{ border:"1px solid #E8E8E8" }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ background:"#1D1D1D" }}>
                        {["🎫 Ticket (click to pick)","Draw No.","▶ First Ticket Barcode","▷ Next Batch Starts","Qty","Unit Price (Rs.)","Total (Rs.)",""].map((h,i) => (
                          <th key={i} className="px-3 py-2 text-left"
                            style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((it, idx) => {
                        const barcodeWarn = it.barcode_start && it.barcode_start.length !== 11;
                        const qtyOk = it.qty > 0;
                        return (
                          <tr key={idx} style={{ borderTop:"1px solid #F3F4F6", background: idx % 2 === 0 ? "#fff" : "#FAFAFA" }}>

                            {/* Ticket logo picker */}
                            <td className="px-2 py-2" style={{ minWidth:170 }}>
                              <button type="button" onClick={() => setPickerRow(idx)}
                                style={{
                                  display:"flex", alignItems:"center", gap:8, width:"100%",
                                  padding:"6px 8px", border:`1px solid ${it.game_name?"#E5E7EB":"#CF291D"}`,
                                  borderRadius:8, background: it.game_name?"#F9FAFB":"#FEF2F2",
                                  cursor:"pointer", textAlign:"left",
                                }}>
                                {it.game_name ? (
                                  <>
                                    <img src={resolveLogoUrl(it.game_name)}
                                      alt="" style={{ width:28, height:28, objectFit:"contain", borderRadius:4 }}
                                      onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}}/>
                                    <span style={{ fontSize:11, fontWeight:600, color:"#111827" }}>{it.game_name}</span>
                                  </>
                                ) : (
                                  <>
                                    <Image size={16} style={{ color:"#CF291D" }}/>
                                    <span style={{ fontSize:11, color:"#CF291D", fontWeight:600 }}>Select Ticket…</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Draw number */}
                            <td className="px-2 py-2" style={{ width:90 }}>
                              <input value={it.draw_number ?? ""}
                                onChange={e => updateItem(idx, "draw_number", e.target.value)}
                                onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); setFormItems(p=>[...p,EMPTY_ITEM()]); }}}
                                placeholder="e.g. 4521"
                                className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center font-mono"
                                style={{ border:"1px solid #E8E8E8", background:"#FAFAFA" }}/>
                            </td>

                            {/* Barcode Start — first physical ticket */}
                            <td className="px-2 py-2" style={{ width:130 }}>
                              <input value={it.barcode_start}
                                onChange={e => updateItem(idx, "barcode_start", e.target.value)}
                                onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); (e.currentTarget.parentElement?.parentElement?.nextElementSibling?.querySelector("input") as HTMLElement)?.focus(); }}}
                                placeholder="First ticket barcode"
                                className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none font-mono"
                                style={{ border:`1px solid ${barcodeWarn&&it.barcode_start?"#F59E0B":"#2563EB"}`, background:"#EFF6FF", color:"#1d4ed8" }}
                                onFocus={e => e.target.select()}/>
                              {barcodeWarn && it.barcode_start && (
                                <div style={{ fontSize:9, color:"#D97706", marginTop:1 }}>⚠ {it.barcode_start.length} digits (expect 11)</div>
                              )}
                            </td>

                            {/* Barcode End — EXCLUSIVE: first ticket of NEXT batch */}
                            <td className="px-2 py-2" style={{ width:140 }}>
                              <input value={it.barcode_end}
                                onChange={e => updateItem(idx, "barcode_end", e.target.value)}
                                onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); (e.currentTarget.parentElement?.parentElement?.nextElementSibling?.querySelector("input") as HTMLElement)?.focus(); }}}
                                placeholder="Next batch start"
                                className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none font-mono"
                                style={{ border:"1px solid #7C3AED", background:"#F5F3FF", color:"#6d28d9" }}
                                onFocus={e => e.target.select()}/>
                              {it.barcode_end && it.barcode_start && (
                                <div style={{ fontSize:9, color:"#6B7280", marginTop:1 }}>
                                  Last ticket: <span style={{ fontFamily:"monospace", fontWeight:700, color:"#7C3AED" }}>{lastTicketBarcode(it.barcode_end)}</span>
                                </div>
                              )}
                            </td>

                            {/* Qty */}
                            <td className="px-2 py-2" style={{ width:80 }}>
                              <input type="number" value={it.qty || ""}
                                placeholder="0"
                                onChange={e => updateItem(idx, "qty", parseInt(e.target.value) || 0)}
                                onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); (e.currentTarget.parentElement?.parentElement?.nextElementSibling?.querySelector("input") as HTMLElement)?.focus(); }}}
                                className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none text-right font-bold"
                                style={{ border:`1px solid ${qtyOk?"#BBF7D0":"#E8E8E8"}`, background: qtyOk?"#F0FFF4":"#FAFAFA", color: qtyOk?"#16A34A":"#111827" }}
                                onFocus={e => e.target.select()}/>
                            </td>

                            {/* Unit price */}
                            <td className="px-2 py-2" style={{ width:100 }}>
                              <input type="number" step="0.01" value={it.unit_price || ""}
                                placeholder="0.00"
                                onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                                onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); setFormItems(p=>[...p,EMPTY_ITEM()]); }}}
                                className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none text-right"
                                style={{ border:"1px solid #E8E8E8", background:"#FAFAFA" }}
                                onFocus={e => e.target.select()}/>
                              {gameCostMap[it.game_name] && (
                                <div style={{ fontSize:9, color:"#6B7280", marginTop:1, textAlign:"right" }}>
                                  Nimalsiri: Rs.{gameCostMap[it.game_name]}
                                </div>
                              )}
                            </td>

                            {/* Value */}
                            <td className="px-3 py-2 text-xs text-right font-bold" style={{ color:"#1D1D1D", minWidth:100 }}>
                              Rs. {fmt(it.value)}
                            </td>

                            {/* Remove */}
                            <td className="px-2 py-2">
                              {formItems.length > 1 && (
                                <button onClick={() => setFormItems(formItems.filter((_,i) => i !== idx))}
                                  className="p-1 rounded hover:bg-red-50" style={{ color:"#CF291D" }}>
                                  <X size={12}/>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"#F9FAFB", borderTop:"2px solid #CF291D" }}>
                        <td colSpan={6} className="px-3 py-2 text-right text-xs font-bold" style={{ color:"#6B7280" }}>
                          {formItems.reduce((s,it)=>s+it.qty,0).toLocaleString()} tickets · {formItems.filter(it=>it.game_name).length} lines
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-black" style={{ color:"#CF291D" }}>
                          Rs. {fmt(formItems.reduce((s,it)=>s+it.value,0))}
                        </td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ── Live barcode verification panel ── */}
                {formItems.some(it => it.barcode_start && it.barcode_end && it.qty > 0) && (
                  <div style={{ marginTop:8, padding:"10px 14px", background:"#F0FFF4", border:"1px solid #BBF7D0", borderRadius:8 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:"#15803D", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
                      ✅ Barcode Verification
                    </p>
                    {formItems.filter(it => it.barcode_start && it.barcode_end && it.qty > 0).map((it, i) => {
                      const calcQty = calcQtyFromBarcodes(it.barcode_start, it.barcode_end);
                      const match = calcQty === it.qty;
                      const lastTicket = lastTicketBarcode(it.barcode_end);
                      return (
                        <div key={i} style={{
                          display:"flex", alignItems:"center", gap:10, marginBottom:4,
                          padding:"5px 8px", borderRadius:6,
                          background: match ? "rgba(22,163,74,0.06)" : "#FEF2F2",
                          border: `1px solid ${match ? "#BBF7D0" : "#FECACA"}`,
                        }}>
                          <span style={{ fontSize:12 }}>{match ? "✅" : "❌"}</span>
                          <span style={{ fontSize:11, fontWeight:700, color:"#111827", minWidth:120 }}>{it.game_name || "—"}</span>
                          <span style={{ fontSize:11, fontFamily:"monospace", color:"#374151" }}>{it.barcode_start}</span>
                          <span style={{ fontSize:11, color:"#6B7280" }}>→</span>
                          <span style={{ fontSize:11, fontFamily:"monospace", color:"#374151" }}>{it.barcode_end}</span>
                          <span style={{ fontSize:11, color:"#6B7280" }}>·</span>
                          <span style={{ fontSize:11, color:"#6B7280" }}>Last ticket: <strong style={{ fontFamily:"monospace", color:"#111827" }}>{lastTicket}</strong></span>
                          <span style={{ fontSize:11, color:"#6B7280" }}>·</span>
                          <span style={{ fontSize:11, fontWeight:700, color: match?"#16A34A":"#DC2626" }}>
                            {it.barcode_end} − {it.barcode_start} = {calcQty} {match ? "✓" : `≠ ${it.qty} ✗`}
                          </span>
                        </div>
                      );
                    })}
                    <p style={{ fontSize:10, color:"#6B7280", marginTop:4 }}>
                      Convention: End barcode is the <strong>first barcode of the next batch</strong> (not included). QTY = End − Start.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button onClick={() => setFormItems([...formItems, EMPTY_ITEM()])}
                    style={{ padding:"5px 14px", border:"1px dashed #CF291D", borderRadius:8, background:"#FEF2F2", color:"#CF291D", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    + Add Another Ticket
                  </button>
                  <span style={{ fontSize:11, color:"#9CA3AF", alignSelf:"center" }}>
                    Press Enter in the last field to add a row automatically
                  </span>
                </div>
              </div>

              {/* Logo picker modal */}
              {pickerRow !== null && (
                <TicketLogoPicker
                  currentValue={formItems[pickerRow]?.game_name}
                  onSelect={name => { updateItem(pickerRow, "game_name", name); setPickerRow(null); }}
                  onClose={() => setPickerRow(null)}
                />
              )}

              {/* Payment summary */}
              <div className="grid grid-cols-3 gap-4 p-4 rounded-xl" style={{ background:"#F9F9F9", border:"1px solid #E8E8E8" }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Invoice Total</p>
                  <p className="text-xl font-black" style={{ color:"#1D1D1D" }}>Rs. {fmt(formTotal)}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Cash Paid at Delivery</label>
                  <input type="number" step="0.01"
                    value={editPurchase.initial_payment || ""}
                    onChange={e => setEdit({ ...editPurchase, initial_payment: parseFloat(e.target.value) || 0 })}
                    onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                    className="w-full rounded-lg px-3 py-2 text-sm font-bold focus:outline-none"
                    style={{ border:`1px solid ${focusedField==="ip" ? "#CF291D" : "#E8E8E8"}`, background:"#FFFFFF", color:"#16a34a" }}
                    onFocus={(e) => { e.target.select(); setFocused("ip"); }} onBlur={() => setFocused(null)}
                    placeholder="e.g. 400000"/>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Balance Remaining</p>
                  <p className="text-xl font-black" style={{ color: formBalance > 0 ? "#CF291D" : "#16a34a" }}>
                    Rs. {fmt(Math.max(0, formBalance))}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color:"#9CA3AF" }}>to be settled by cash / returns</p>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Notes</label>
                <input value={editPurchase.notes}
                  onChange={e => setEdit({ ...editPurchase, notes: e.target.value })}
                  placeholder="Optional notes…"
                  className={inputCls} style={inputStyle("notes")}
                  onFocus={() => setFocused("notes")} onBlur={() => setFocused(null)}/>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90"
                  style={{ background:"linear-gradient(135deg,#CF291D,#B50717)", boxShadow:"0 4px 14px rgba(207,41,29,0.3)" }}>
                  <Save size={14}/> Save Purchase
                </button>
                <button onClick={() => { setShowForm(false); setEdit(null); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
                  style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", color:"#1D1D1D" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Purchase Invoices List ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background:"#FFFFFF", border:"1px solid #E8E8E8" }}>
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ background:"linear-gradient(135deg,#1D1D1D,#374151)", borderBottom:"2px solid #CF291D" }}>
            <div className="flex items-center gap-2">
              <ShoppingCart size={15} style={{ color:"#CF291D" }}/>
              <span className="text-sm font-semibold text-white">Purchase Invoices — Nimalsiri Enterprises</span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background:"rgba(255,255,255,0.15)", color:"#fff" }}>
              {purchases.length} record{purchases.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color:"#9CA3AF" }}>Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={40} className="mx-auto mb-3" style={{ color:"#E8E8E8" }}/>
              <p className="text-sm font-medium mb-1" style={{ color:"#9CA3AF" }}>No purchases recorded yet</p>
              <p className="text-xs" style={{ color:"#BFBFBF" }}>Click "New Purchase" to record stock bought from Nimalsiri Enterprises</p>
            </div>
          ) : (
            <div>
              {purchases.map(pur => {
                const isExpanded = expandedId === pur.id;
                const pmts = paymentsMap[pur.id!] ?? [];
                const paidAfter    = pmts.reduce((s, p) => s + p.amount, 0);
                // Return credits are already baked into pur.outstanding_balance by getPurchaseInvoices
                // Compute them for display purposes
                const returnCredit = Math.max(0,
                  pur.invoice_total - pur.initial_payment - paidAfter - pur.outstanding_balance
                );
                const live = Math.max(0, pur.outstanding_balance);
                const isSettled = live < 0.005;

                return (
                  <div key={pur.id} style={{ borderBottom:"1px solid #F3F4F6" }}>
                    {/* Summary row */}
                    <div className="px-5 py-4 flex items-center gap-4">
                      {/* Status dot */}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: isSettled ? "#16a34a" : "#CF291D",
                          boxShadow: isSettled ? "0 0 6px #16a34a60" : "0 0 6px #CF291D60" }}/>

                      {/* Purchase number + date */}
                      <div className="w-32">
                        <p className="text-sm font-bold font-mono" style={{ color:"#1D1D1D" }}>{pur.purchase_number}</p>
                        <p className="text-[10px]" style={{ color:"#9CA3AF" }}>{fmtDate(pur.purchase_date)}</p>
                      </div>

                      {/* Supplier + ticket summary */}
                      <div className="flex-1">
                        <p className="text-xs font-semibold" style={{ color:"#1D1D1D" }}>{pur.supplier_name}</p>
                        <p className="text-[10px]" style={{ color:"#9CA3AF" }}>
                          Stock date: {fmtDate(pur.stock_date)}
                          {pur.items && pur.items.length > 0 && (
                            <span style={{ marginLeft:8, color:"#CF291D", fontWeight:600 }}>
                              · {pur.items.reduce((s,it)=>s+it.qty,0).toLocaleString()} tickets
                              · {pur.items.length} game{pur.items.length!==1?"s":""}
                              {pur.items.some(it=>it.draw_number) && ` · Draw #${[...new Set(pur.items.map(it=>it.draw_number).filter(Boolean))].join(", ")}`}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Financials */}
                      <div className="text-right w-28">
                        <p className="text-[10px] font-semibold uppercase" style={{ color:"#9CA3AF" }}>Invoice</p>
                        <p className="text-sm font-bold" style={{ color:"#1D1D1D" }}>Rs. {fmt(pur.invoice_total)}</p>
                      </div>
                      <div className="text-right w-28">
                        <p className="text-[10px] font-semibold uppercase" style={{ color:"#9CA3AF" }}>Paid at Delivery</p>
                        <p className="text-sm font-semibold" style={{ color:"#16a34a" }}>Rs. {fmt(pur.initial_payment)}</p>
                      </div>
                      {paidAfter > 0 && (
                        <div className="text-right w-28">
                          <p className="text-[10px] font-semibold uppercase" style={{ color:"#9CA3AF" }}>Later Paid</p>
                          <p className="text-sm font-semibold" style={{ color:"#2563eb" }}>Rs. {fmt(paidAfter)}</p>
                        </div>
                      )}
                      <div className="text-right w-32">
                        <p className="text-[10px] font-semibold uppercase" style={{ color:"#9CA3AF" }}>Balance Owed</p>
                        <p className="text-base font-black" style={{ color: live > 0 ? "#CF291D" : "#16a34a" }}>
                          Rs. {fmt(live)}
                        </p>
                      </div>

                      {/* Status badge */}
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold w-20 text-center"
                        style={{ background: isSettled ? "#DCFCE7" : "#FEE2E2",
                          color: isSettled ? "#16a34a" : "#CF291D" }}>
                        {isSettled ? "✓ Settled" : "Pending"}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => toggleExpand(pur.id!)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{ background: isExpanded ? "#F3F4F6" : "#FFFFFF",
                            border:"1px solid #E8E8E8", color:"#1D1D1D" }}>
                          {isExpanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                        <button onClick={() => openEdit(pur)}
                          className="p-1.5 rounded-lg" style={{ background:"#EFF6FF", color:"#2563eb" }}
                          title="Edit">
                          <Package size={12}/>
                        </button>
                        <button onClick={() => handleDelete(pur.id!)}
                          className="p-1.5 rounded-lg" style={{ background:"#FFF1F0", color:"#CF291D" }}
                          title="Delete">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </div>

                    {/* ── Expanded Full History Panel ── */}
                    {isExpanded && (
                      <div style={{ borderTop:"2px solid #CF291D", background:"#F8FAFC" }}>

                        {/* ── HEADER: Invoice identity ── */}
                        <div style={{ padding:"16px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                            <div style={{ background:"linear-gradient(135deg,#CF291D,#B50717)", borderRadius:10, padding:"8px 14px", color:"#fff" }}>
                              <div style={{ fontSize:10, fontWeight:600, opacity:0.8, marginBottom:2 }}>PURCHASE INVOICE</div>
                              <div style={{ fontSize:16, fontWeight:900, fontFamily:"monospace" }}>{pur.purchase_number}</div>
                            </div>
                            <div>
                              <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Purchase Date</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{fmtDate(pur.purchase_date)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Stock / Draw Date</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{fmtDate(pur.stock_date)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Supplier</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{pur.supplier_name}</div>
                                </div>
                                {pur.notes && (
                                  <div>
                                    <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Notes</div>
                                    <div style={{ fontSize:12, color:"#6B7280" }}>{pur.notes}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <span style={{ padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:800,
                            background: isSettled ? "#DCFCE7" : "#FEE2E2",
                            color: isSettled ? "#16A34A" : "#CF291D",
                            border: `1px solid ${isSettled?"#BBF7D0":"#FECACA"}` }}>
                            {isSettled ? "✅ Fully Settled" : "⏳ Payment Pending"}
                          </span>
                        </div>

                        {/* ── Financial summary strip ── */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, padding:"14px 20px" }}>
                          {[
                            { label:"Invoice Total",      val:pur.invoice_total,                          color:"#111827", bg:"#fff",     border:"#E5E7EB" },
                            { label:"Cash at Delivery",   val:pur.initial_payment,                         color:"#16A34A", bg:"#F0FFF4",  border:"#BBF7D0" },
                            { label:"Later Payments",     val:paidAfter,                                   color:"#2563EB", bg:"#EFF6FF",  border:"#BFDBFE" },
                            ...(returnCredit > 0 ? [{ label:"Return Credits", val:returnCredit, color:"#7C3AED", bg:"#F5F3FF", border:"#DDD6FE" }] : []),
                            { label:"Total Settled",      val:pur.initial_payment+paidAfter+returnCredit,  color:"#059669", bg:"#F0FDF4",  border:"#A7F3D0" },
                            { label:"Balance Owed",       val:live,                                         color: live>0?"#CF291D":"#16A34A", bg: live>0?"#FEF2F2":"#F0FFF4", border: live>0?"#FECACA":"#BBF7D0" },
                          ].map(c => (
                            <div key={c.label} style={{ padding:"10px 14px", borderRadius:10, background:c.bg, border:`1px solid ${c.border}` }}>
                              <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{c.label}</div>
                              <div style={{ fontSize:15, fontWeight:900, color:c.color }}>Rs. {fmt(c.val)}</div>
                            </div>
                          ))}
                        </div>

                        {/* ── Ticket batch details ── */}
                        {pur.items && pur.items.length > 0 && (
                          <div style={{ padding:"0 20px 14px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                              <div style={{ width:3, height:16, borderRadius:2, background:"#CF291D" }}/>
                              <span style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                                🎫 Ticket Batches — {pur.items.reduce((s,it)=>s+it.qty,0).toLocaleString()} tickets · Rs. {fmt(pur.items.reduce((s,it)=>s+it.value,0))}
                              </span>
                            </div>
                            {pur.items.map((item, ii) => {
                              const lastTk = lastTicketBarcode(item.barcode_end);
                              return (
                                <div key={ii} style={{
                                  display:"flex", alignItems:"stretch", gap:0,
                                  background:"#fff", border:"1px solid #E5E7EB", borderRadius:10,
                                  marginBottom:8, overflow:"hidden",
                                }}>
                                  {/* Ticket logo + name */}
                                  <div style={{ width:130, flexShrink:0, background:"#F8FAFC", borderRight:"1px solid #E5E7EB", padding:"12px 14px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                                    <img src={resolveLogoUrl(item.game_name)} alt=""
                                      style={{ width:44, height:44, objectFit:"contain", borderRadius:6 }}
                                      onError={e=>{(e.currentTarget as HTMLImageElement).src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' rx='6' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='20'%3E🎫%3C/text%3E%3C/svg%3E"}}/>
                                    <span style={{ fontSize:11, fontWeight:700, color:"#111827", textAlign:"center", lineHeight:1.3 }}>{item.game_name}</span>
                                    {item.draw_number && (
                                      <span style={{ fontSize:10, padding:"2px 8px", background:"#FEF3C7", color:"#92400E", borderRadius:20, fontWeight:700, border:"1px solid #FDE68A" }}>
                                        Draw #{item.draw_number}
                                      </span>
                                    )}
                                  </div>

                                  {/* Barcode details */}
                                  <div style={{ flex:1, padding:"12px 16px" }}>
                                    {/* Barcode visual strip */}
                                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, padding:"8px 12px", background:"#F8FAFC", borderRadius:8, border:"1px solid #E5E7EB" }}>
                                      <div style={{ textAlign:"center" }}>
                                        <div style={{ fontSize:8, fontWeight:700, color:"#2563EB", textTransform:"uppercase", marginBottom:2 }}>▶ FIRST TICKET</div>
                                        <div style={{ fontSize:13, fontWeight:900, fontFamily:"monospace", color:"#2563EB", letterSpacing:"0.02em" }}>{item.barcode_start}</div>
                                      </div>
                                      <div style={{ flex:1, height:2, background:"linear-gradient(90deg,#2563EB,#7C3AED)", borderRadius:1, position:"relative" }}>
                                        <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#16A34A", color:"#fff", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:900, whiteSpace:"nowrap" }}>
                                          {item.qty.toLocaleString()} tickets
                                        </div>
                                      </div>
                                      <div style={{ textAlign:"center" }}>
                                        <div style={{ fontSize:8, fontWeight:700, color:"#7C3AED", textTransform:"uppercase", marginBottom:2 }}>LAST TICKET ▶</div>
                                        <div style={{ fontSize:13, fontWeight:900, fontFamily:"monospace", color:"#7C3AED", letterSpacing:"0.02em" }}>{lastTk}</div>
                                      </div>
                                    </div>

                                    {/* Calculation proof */}
                                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                      <div style={{ fontSize:10, color:"#6B7280", fontFamily:"monospace" }}>
                                        <span style={{ color:"#9CA3AF" }}>Verify: </span>
                                        <span style={{ color:"#7C3AED" }}>{item.barcode_end}</span>
                                        <span style={{ color:"#9CA3AF" }}> − </span>
                                        <span style={{ color:"#2563EB" }}>{item.barcode_start}</span>
                                        <span style={{ color:"#9CA3AF" }}> = </span>
                                        <span style={{ fontWeight:800, color:"#16A34A" }}>{item.qty.toLocaleString()} ✓</span>
                                        <span style={{ marginLeft:8, color:"#9CA3AF" }}>(end barcode = first ticket of NEXT batch = {item.barcode_end})</span>
                                      </div>
                                      <div style={{ textAlign:"right" }}>
                                        <div style={{ fontSize:9, color:"#9CA3AF", marginBottom:2 }}>@ Rs. {fmt(item.unit_price)} each</div>
                                        <div style={{ fontSize:15, fontWeight:900, color:"#CF291D" }}>Rs. {fmt(item.value)}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Payment/Settlement history ── */}
                        <div style={{ padding:"0 20px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ width:3, height:16, borderRadius:2, background:"#16A34A" }}/>
                              <span style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                                💰 Settlement History
                              </span>
                            </div>
                            {!isSettled && !paymentForm && (
                              <button onClick={() => setPaymentForm(EMPTY_PAYMENT(pur.id!))}
                                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 16px", border:"none", borderRadius:8, background:"#CF291D", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                <Plus size={13}/> Record Payment
                              </button>
                            )}
                          </div>

                          {/* Delivery cash as first history entry */}
                          <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:10, overflow:"hidden" }}>
                            <table className="w-full" style={{ fontSize:12 }}>
                              <thead>
                                <tr style={{ background:"#F9FAFB" }}>
                                  {["#","Date","Type","Amount (Rs.)","Reference / Notes","Action"].map((h,i) => (
                                    <th key={i} style={{ padding:"8px 14px", textAlign:i>=3?"right":"left", fontSize:10, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #E5E7EB" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Delivery payment row */}
                                <tr style={{ background:"#F0FFF4" }}>
                                  <td style={{ padding:"10px 14px", color:"#9CA3AF", fontWeight:700 }}>0</td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <div style={{ fontWeight:700, color:"#111827" }}>{fmtDate(pur.purchase_date)}</div>
                                    <div style={{ fontSize:10, color:"#6B7280" }}>At delivery</div>
                                  </td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#DCFCE7", color:"#16A34A" }}>Cash at Delivery</span>
                                  </td>
                                  <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:14, color:"#16A34A" }}>Rs. {fmt(pur.initial_payment)}</td>
                                  <td style={{ padding:"10px 14px", color:"#9CA3AF", fontSize:11 }}>Paid when stock received</td>
                                  <td style={{ padding:"10px 14px" }}/>
                                </tr>

                                {/* Post-delivery payments */}
                                {pmts.map((p, pi) => {
                                  const tc = PAYMENT_TYPE_COLORS[p.payment_type];
                                  return (
                                    <tr key={p.id} style={{ borderTop:"1px solid #F3F4F6" }}>
                                      <td style={{ padding:"10px 14px", color:"#9CA3AF", fontWeight:700 }}>{pi+1}</td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <div style={{ fontWeight:700, color:"#111827" }}>{fmtDate(p.payment_date)}</div>
                                      </td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:tc.bg, color:tc.color }}>
                                          {PAYMENT_TYPE_LABELS[p.payment_type]}
                                        </span>
                                      </td>
                                      <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:14, color:"#2563EB" }}>Rs. {fmt(p.amount)}</td>
                                      <td style={{ padding:"10px 14px", color:"#6B7280", fontSize:11 }}>{p.notes || "—"}</td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <button onClick={() => handleDeletePayment(p.id!, pur.id!)} style={{ border:"none", background:"#FFF1F0", borderRadius:6, padding:"3px 8px", color:"#CF291D", cursor:"pointer" }}>
                                          <Trash2 size={11}/>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {/* Total row */}
                                {/* Return credits row — shown if any credited supplier returns */}
                                {returnCredit > 0 && (
                                  <tr style={{ background:"#F5F3FF", borderTop:"1px solid #DDD6FE" }}>
                                    <td style={{ padding:"10px 14px", color:"#7C3AED", fontWeight:700 }}>R</td>
                                    <td style={{ padding:"10px 14px" }}>
                                      <div style={{ fontWeight:700, color:"#111827" }}>Supplier Returns</div>
                                      <div style={{ fontSize:10, color:"#6B7280" }}>Tickets returned & credited</div>
                                    </td>
                                    <td style={{ padding:"10px 14px" }}>
                                      <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#EDE9FE", color:"#7C3AED" }}>Return Credit</span>
                                    </td>
                                    <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:14, color:"#7C3AED" }}>Rs. {fmt(returnCredit)}</td>
                                    <td colSpan={2} style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>
                                      See Return to Supplier page for details
                                    </td>
                                  </tr>
                                )}
                                <tr style={{ background:"#374151", borderTop:"2px solid #CF291D" }}>
                                  <td colSpan={3} style={{ padding:"10px 14px", color:"#9CA3AF", fontSize:11, fontWeight:700 }}>
                                    TOTAL SETTLED ({1 + pmts.length + (returnCredit>0?1:0)} entries)
                                  </td>
                                  <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:15, color:"#fff" }}>
                                    Rs. {fmt(pur.initial_payment + paidAfter + returnCredit)}
                                  </td>
                                  <td colSpan={2} style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:13, color: live>0?"#FCA5A5":"#86EFAC" }}>
                                    {live > 0 ? `Balance: Rs. ${fmt(live)} remaining` : "✅ Fully Settled"}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Payment form */}
                        {paymentForm && paymentForm.purchase_id === pur.id && (
                          <div style={{ margin:"0 20px 14px", padding:16, background:"#fff", border:"1px solid #E5E7EB", borderRadius:10 }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                              <span style={{ fontWeight:700, fontSize:13, color:"#111827" }}>💳 Record Payment to Nimalsiri</span>
                              <button onClick={() => setPaymentForm(null)} style={{ border:"none", background:"none", cursor:"pointer", color:"#9CA3AF" }}><X size={15}/></button>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Date</label>
                                <input type="date" value={paymentForm.payment_date}
                                  onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                                  className={inputCls} style={inputStyle("pp-date")}
                                  onFocus={() => setFocused("pp-date")} onBlur={() => setFocused(null)}/>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Payment Type</label>
                                <select value={paymentForm.payment_type}
                                  onChange={e => setPaymentForm({ ...paymentForm, payment_type: e.target.value as PurchasePaymentType })}
                                  className={inputCls} style={inputStyle("pp-type")}
                                  onFocus={() => setFocused("pp-type")} onBlur={() => setFocused(null)}>
                                  {(Object.keys(PAYMENT_TYPE_LABELS) as PurchasePaymentType[]).map(t => (
                                    <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Amount (Rs.) — Balance: {fmt(live)}</label>
                                <input type="number" step="0.01" value={paymentForm.amount || ""}
                                  onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                                  onKeyDown={e => { if (e.key==="Enter") handleAddPayment(); }}
                                  placeholder={`Enter amount (max ${fmt(live)})`}
                                  className={inputCls} style={{ ...inputStyle("pp-amt"), color:"#16a34a", fontWeight:700 }}
                                  onFocus={(e) => { e.target.select(); setFocused("pp-amt"); }} onBlur={() => setFocused(null)}/>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Reference / Notes</label>
                                <input value={paymentForm.notes}
                                  onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                  placeholder="e.g. Cheque #12345"
                                  className={inputCls} style={inputStyle("pp-notes")}
                                  onFocus={() => setFocused("pp-notes")} onBlur={() => setFocused(null)}/>
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:8, marginTop:12 }}>
                              <button onClick={handleAddPayment}
                                style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 20px", border:"none", borderRadius:8, background:"#CF291D", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                                <Save size={13}/> Save Payment (Enter)
                              </button>
                              <button onClick={() => setPaymentForm(null)}
                                style={{ padding:"8px 16px", border:"1px solid #E5E7EB", borderRadius:8, background:"#F9FAFB", color:"#6B7280", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background:"#EFF6FF", border:"1px solid #BFDBFE" }}>
          <CreditCard size={16} style={{ color:"#2563eb", flexShrink:0, marginTop:2 }}/>
          <div>
            <p className="text-xs font-bold mb-1" style={{ color:"#1e40af" }}>How settlement works</p>
            <p className="text-xs leading-relaxed" style={{ color:"#3730a3" }}>
              Record the full invoice from Nimalsiri. Enter the <strong>initial cash paid at delivery</strong>.
              The remaining balance shows in red. Use <strong>Record Settlement Payment</strong> to pay it off later —
              either as <strong>cash</strong>, <strong>cheque</strong>, or <strong>return credit</strong>
              (unsold tickets handed back to Nimalsiri). The live balance updates instantly.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
