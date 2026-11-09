import React, { useEffect, useState } from "react";
import { AddCircle, Trash, CloseCircle, Save2, Refresh2, ShoppingCart, Home2, ArrowRight2, Box1, Card, ArrowDown2, ArrowUp, ShieldSlash } from "iconsax-react";
import {
  getPurchaseInvoices, savePurchaseInvoice, deletePurchaseInvoice,
  getPurchasePayments, savePurchasePayment, deletePurchasePayment,
  getNextPurchaseNumber, getSupplierOutstanding, getLotteryGames,
  getBatchesForGame, getBatchSalesDetail,
} from "../services/database";
import type {
  PurchaseInvoice, PurchaseInvoiceItem, PurchasePayment, PurchasePaymentType,
} from "../types";
import { useAuth } from "../contexts/AuthContext";
import { lastTicketBarcode } from "../utils/barcode";
import { getDrawNumber, getDrawInfo } from "../utils/drawNumbers";
import TicketLogoPicker, { resolveLogoUrl } from "./TicketLogoPicker";

import { useLanguage } from "../i18n";
import { usePinGuardContext } from "../App";
import { EmptyInventory } from "./illustrations";
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
  cash:          { bg: "#E6F4EA", color: "#34A853" },
  cheque:        { bg: "#DBEAFE", color: "#2563eb" },
  return_credit: { bg: "#F3E8FF", color: "#7c3aed" },
};

// resolveLogoUrl is imported from TicketLogoPicker

// ── Batch Sales Tracker sub-component ────────────────────────────────────────
function BatchSalesTracker({ items }: { items: import("../types").PurchaseInvoiceItem[] }) {
  const [open, setOpen] = React.useState<Record<number,boolean>>({});
// fmt used in BatchDetailView

  return (
    <div style={{ padding:"0 20px 14px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <div style={{ width:3, height:16, borderRadius:2, background:"#2563EB" }}/>
        <span style={{ fontSize:11, fontWeight:700, color:"#5F6368", textTransform:"uppercase", letterSpacing:"0.06em" }}>
          📊 Sales Tracking — Invoices Issued From This Purchase
        </span>
      </div>
      {items.map((item, idx) => (
        <div key={idx} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:10, marginBottom:8, overflow:"hidden" }}>
          <button type="button" onClick={() => {
            setOpen(p=>({...p,[idx]:!p[idx]}));
          }} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"10px 14px", border:"none", background:"#F8FAFC", cursor:"pointer", textAlign:"left" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <img src={resolveLogoUrl(item.game_name)} alt="" style={{ width:32, height:32, objectFit:"contain", borderRadius:5, background:"#F3F4F6" }}
                onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}}/>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#111827" }}>{item.game_name}</div>
                <div style={{ fontSize:10, color:"#5F6368", fontFamily:"monospace" }}>
                  {item.barcode_start} → {item.barcode_end} · {item.qty.toLocaleString()} tickets
                  {item.draw_number && <span style={{ marginLeft:8, color:"#D97706" }}>Draw #{item.draw_number}</span>}
                </div>
              </div>
            </div>
            <span style={{ fontSize:18, color:"#9AA0A6" }}>{open[idx]?"▲":"▼"}</span>
          </button>
          {open[idx] && (
            <BatchDetailView gameName={item.game_name} barcodeStart={item.barcode_start} totalQty={item.qty}/>
          )}
        </div>
      ))}
    </div>
  );
}

function BatchDetailView({ gameName, barcodeStart, totalQty }: {
  gameName: string; barcodeStart: string; totalQty: number;
}) {
  const [batches, setBatches] = React.useState<Awaited<ReturnType<typeof getBatchesForGame>>>([]);
  const [salesRows, setSalesRows] = React.useState<any[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    getBatchesForGame(gameName).then(b => {
      setBatches(b);
      // Find the matching batch by barcode range
      const match = b.find(x => x.barcode_start === barcodeStart);
      if (match) {
        getBatchSalesDetail(match.id).then(rows => { setSalesRows(rows); setLoaded(true); });
      } else setLoaded(true);
    });
  }, [gameName, barcodeStart]);

  const batch = batches.find(x => x.barcode_start === barcodeStart);
  const soldQty = salesRows.reduce((s,r) => s+r.qty, 0);
  const remaining = totalQty - soldQty;

  if (!loaded) return <div style={{ padding:"12px 14px", fontSize:11, color:"#9AA0A6" }}>Loading…</div>;

  return (
    <div style={{ padding:"10px 14px" }}>
      {/* Mini progress bar */}
      <div style={{ display:"flex", gap:12, marginBottom:10 }}>
        {[
          { label:"Total", val:totalQty, color:"#5F6368" },
          { label:"Sold to Agents", val:soldQty, color:"#EA4335" },
          { label:"Remaining", val:remaining, color:"#34A853" },
          { label:"Next Start", val:batch?.next_start_barcode ?? barcodeStart, color:"#2563EB", isStr:true },
        ].map(c => (
          <div key={c.label} style={{ flex:1, padding:"8px 10px", background:"#F9FAFB", borderRadius:8, border:"1px solid #E5E7EB" }}>
            <div style={{ fontSize:9, color:"#9AA0A6", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>{c.label}</div>
            <div style={{ fontSize:(c as any).isStr?11:15, fontWeight:900, color:c.color, fontFamily:(c as any).isStr?"monospace":"inherit" }}>
              {(c as any).isStr ? c.val : (c.val as number).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      {/* Progress bar */}
      <div style={{ background:"#F3F4F6", borderRadius:999, height:6, overflow:"hidden", marginBottom:8 }}>
        <div style={{ height:"100%", width:`${totalQty>0?(soldQty/totalQty*100):0}%`, background:"linear-gradient(90deg,#EA4335,#1A73E8)", borderRadius:999, transition:"width 0.3s" }}/>
      </div>
      <div style={{ fontSize:10, color:"#5F6368", marginBottom:salesRows.length?10:0 }}>
        {soldQty.toLocaleString()} / {totalQty.toLocaleString()} tickets issued ({totalQty>0?Math.round(soldQty/totalQty*100):0}%)
      </div>
      {/* Sales rows */}
      {salesRows.length > 0 && (
      <div className="overflow-x-auto">
        <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F9FAFB" }}>
              {["Invoice #","Agent","Date","Barcode Start","Barcode End","Qty","Status"].map(h => (
                <th key={h} style={{ padding:"5px 8px", textAlign:"left", fontWeight:700, color:"#5F6368", fontSize:9, textTransform:"uppercase", borderBottom:"1px solid #E5E7EB" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salesRows.map((r,i) => (
              <tr key={i} style={{ borderBottom:"1px solid #F9FAFB" }}>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", fontWeight:700, color:"#EA4335" }}>#{r.invoice_number}</td>
                <td style={{ padding:"5px 8px", color:"#111827", fontWeight:600 }}>{r.agent_name}</td>
                <td style={{ padding:"5px 8px", color:"#5F6368" }}>{r.invoice_date}</td>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", color:"#2563EB" }}>{r.barcode_start}</td>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", color:"#7C3AED" }}>{r.barcode_end}</td>
                <td style={{ padding:"5px 8px", textAlign:"right", fontWeight:700, color:"#34A853" }}>{r.qty.toLocaleString()}</td>
                <td style={{ padding:"5px 8px" }}>
                  <span style={{ padding:"1px 7px", borderRadius:20, fontSize:9, fontWeight:700,
                    background: r.invoice_status==="paid"?"#E6F4EA":r.invoice_status==="confirmed"?"#DBEAFE":"#F3F4F6",
                    color: r.invoice_status==="paid"?"#34A853":r.invoice_status==="confirmed"?"#2563EB":"#5F6368" }}>
                    {r.invoice_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {salesRows.length === 0 && <div style={{ fontSize:11, color:"#9AA0A6", textAlign:"center", padding:"8px 0" }}>No invoices issued from this batch yet</div>}
    </div>
  );
}

// ── Empty state helpers ───────────────────────────────────────────────────────

const EMPTY_ITEM = (): PurchaseInvoiceItem => ({
  game_name: "", barcode_start: "", barcode_end: "", qty: 0, unit_price: 0,
  value: 0, draw_number: "", draw_date: "",
  discount_type: "pct", discount_pct: 0, discount_amt: 0, net_value: 0,
});

/** Format draw number as exactly 4 digits, e.g. 935 → "0935" */
function fmtDraw(n: string | number | undefined): string {
  if (!n && n !== 0) return "";
  const s = String(n).replace(/\D/g, "");
  if (!s) return "";
  return s.padStart(4, "0");
}


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

interface PurchasesProps {
  onNavigate?: (view: import("../types").View) => void;
}

export default function Purchases({ onNavigate }: PurchasesProps) {
  const { t } = useLanguage();
  const { requireAdminPin } = usePinGuardContext();
  const { withAdminToken } = useAuth();
  const [purchases, setPurchases]     = useState<PurchaseInvoice[]>([]);
  const [totalOwed, setTotalOwed]     = useState(0);
  const [_games, setGames]            = useState<string[]>([]);
  const [gameCostMap, setGameCostMap] = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(false);
  const [editPurchase, setEdit]       = useState<PurchaseInvoice | null>(null);
  const [formItems, setFormItems]     = useState<PurchaseInvoiceItem[]>([EMPTY_ITEM()]);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [focusedField, setFocused]    = useState<string | null>(null);
  const [expandedId, setExpanded]     = useState<number | null>(null);
  const [paymentsMap, setPaymentsMap] = useState<Record<number, PurchasePayment[]>>({});
  const [paymentForm, setPaymentForm] = useState<PurchasePayment | null>(null);
  const [authError, setAuthError]     = useState<string | null>(null);
  // Logo picker state: which row is currently picking a ticket logo
  const [pickerRow, setPickerRow]     = useState<number | null>(null);
  // Always uses cost_price (Nimalsiri→Ajith). Agent-to-sub-agent direction is not supported here.

  useEffect(() => {
    load();
    getLotteryGames().then(gs => {
      setGames(gs.map(g => g.name));
      // cost_price = Nimalsiri→Ajith purchase price (the only price type used here)
      const cost: Record<string, number> = {};
      gs.forEach(g => { cost[g.name] = g.cost_price ?? g.unit_price; });
      setGameCostMap(cost);
    });
    // Auto-initialise the checkout form immediately on page open — no button click needed
    getNextPurchaseNumber().then(num => setEdit(EMPTY_PURCHASE(num)));
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

  async function resetToNewOrder() {
    const num = await getNextPurchaseNumber();
    setEdit(EMPTY_PURCHASE(num));
    setFormItems([EMPTY_ITEM()]);
  }

  function openEdit(p: PurchaseInvoice) {
    setEdit({ ...p });
    setFormItems(p.items?.length ? [...p.items] : [EMPTY_ITEM()]);
    // Scroll back to the top so the checkout form is visible
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    if (!editPurchase) return;
    const validItems = formItems.filter(it => it.game_name && it.qty > 0 && it.unit_price > 0);
    if (!validItems.length) { alert(t("pur_error_no_items")); return; }
    if (editPurchase.initial_payment < 0) { alert(t("pur_error_neg_payment")); return; }
    const savedNum = editPurchase.purchase_number;
    await savePurchaseInvoice(editPurchase, validItems);
    load();
    resetToNewOrder();
    setSavedBanner(`✓ ${savedNum} — ${t("pur_save")}`);
    setTimeout(() => setSavedBanner(null), 4000);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this purchase invoice? All linked payments will also be deleted.")) return;
    if (!(await requireAdminPin("Delete Purchase Invoice", "Enter the Admin PIN to delete this purchase."))) return;
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
    if (!(await requireAdminPin("Delete Purchase Payment", "Enter the Admin PIN to delete this payment."))) return;
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

  /** Re-compute discount_amt and net_value from the current item state */
  function recalcDiscount(it: PurchaseInvoiceItem): PurchaseInvoiceItem {
    const gross = Number(it.qty) * Number(it.unit_price);
    let discAmt = 0;
    if (it.discount_type === "pct") {
      const pct = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
      discAmt = gross * pct / 100;
    } else {
      discAmt = Math.min(gross, Math.max(0, Number(it.discount_amt) || 0));
    }
    return { ...it, value: gross, discount_amt: discAmt, net_value: Math.max(0, gross - discAmt) };
  }

  function updateItem(index: number, field: keyof PurchaseInvoiceItem, val: string | number) {
    const updated = formItems.map((it, i) => {
      if (i !== index) return it;
      let next = { ...it, [field]: val };

      if (field === "game_name") {
        if (gameCostMap[val as string]) next.unit_price = gameCostMap[val as string];
        const date = editPurchase?.purchase_date ?? today();
        const auto = getDrawNumber(val as string, date);
        if (auto) next.draw_number = auto;
      }
      if (field === "qty") next.qty = Number(val);
      if (field === "unit_price") next.unit_price = Number(val);
      if (field === "discount_type") next.discount_type = val as "pct" | "lkr";
      if (field === "discount_pct") next.discount_pct = Number(val);

      return recalcDiscount(next);
    });
    setFormItems(updated);
    if (editPurchase) {
      const total = updated.reduce((s, it) => s + (it.net_value ?? it.value), 0);
      setEdit({ ...editPurchase, invoice_total: total });
    }
  }

const formGross    = formItems.reduce((s, it) => s + it.value, 0);
  const formDiscount = formItems.reduce((s, it) => s + (it.discount_amt ?? 0), 0);
  const formTotal    = formItems.reduce((s, it) => s + (it.net_value ?? it.value), 0);
  const formBalance  = formTotal - (editPurchase?.initial_payment ?? 0);

  const inputCls = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";
  const inputStyle = (f: string) => ({
    border: `1px solid ${focusedField === f ? "#4285F4" : "#E0E3E7"}`,
    background: "#FAFAFA",
  });

  const isEditingExisting = !!editPurchase?.id;

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100%" }}>

      {/* Breadcrumb + status row */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9AA0A6" }}>
          <Home2 size={12} variant="Linear" color="currentColor"/>
          <ArrowRight2 size={11} variant="Linear" color="currentColor"/>
          <span className="font-semibold" style={{ color: "#202124" }}>{t("nav_purchases")}</span>
        </nav>
        {/* Compact KPI strip */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs">
            <span style={{ color:"#9AA0A6" }}>{t("pur_owed_label")}:</span>
            <span className="font-black" style={{ color: totalOwed > 0 ? "#EA4335" : "#34A853" }}>Rs.{fmt(totalOwed)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span style={{ color:"#9AA0A6" }}>{t("pur_total_orders")}:</span>
            <span className="font-bold" style={{ color:"#202124" }}>{purchases.length}</span>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            style={{ background:"#FFFFFF", border:"1px solid #E0E3E7", color:"#202124" }}>
            <Refresh2 size={13} variant="Linear" color="currentColor" className={loading ? "animate-spin" : ""}/>
            {t("pur_refresh")}
          </button>
        </div>
      </div>

      {/* Auth error banner */}
      {authError && (
        <div className="mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: "#FCE8E6", border: "1px solid #FECACA", color: "#EA4335" }}>
          <ShieldSlash size={14} variant="Linear" color="currentColor"/>
          <span>{authError}</span>
          <button className="ml-auto font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      {/* Saved confirmation banner */}
      {savedBanner && (
        <div className="mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background:"#F0FFF4", border:"1px solid #BBF7D0", color:"#15803D" }}>
          <span>{savedBanner}</span>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="px-6 pb-8">

        {/* ── Split-screen checkout — rendered directly in the page, always visible ── */}
        {editPurchase && (
          <div style={{ marginBottom:24 }}>
            {/* ── Header bar ── */}
            <div style={{
              background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)",
              padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between",
              borderBottom:"2px solid #4285F4", borderRadius:"16px 16px 0 0",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"rgba(66,133,244,0.2)", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid rgba(66,133,244,0.35)" }}>
                  <ShoppingCart size={18} variant="Bold" color="#4285F4"/>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:"#FFFFFF", letterSpacing:"-0.02em" }}>
                    {isEditingExisting ? t("pur_edit_title") : t("pur_page_title")}
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", fontFamily:"monospace", marginTop:1 }}>
                    {editPurchase.purchase_number} · Nimalsiri Enterprises
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {/* Price type selector */}
                {isEditingExisting && (
                  <button onClick={resetToNewOrder} style={{ padding:"6px 14px", borderRadius:8, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    {t("pur_new_order")}
                  </button>
                )}
              </div>
            </div>

            {/* ── Split body ── */}
            <div style={{ display:"flex", background:"#F8FAFC", borderRadius:"0 0 16px 16px", overflow:"hidden", border:"1px solid #E5E7EB", borderTop:"none", boxShadow:"0 4px 24px rgba(0,0,0,0.07)" }}>

              {/* ════════ LEFT PANEL ════════ */}
              <div style={{ flex:"1 1 0%", minWidth:0, overflowY:"auto", padding:"20px 20px 24px 20px", display:"flex", flexDirection:"column", gap:16 }}>

                {/* Metadata row */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#9AA0A6", marginBottom:5 }}>{t("pur_order_number")}</label>
                    <input value={editPurchase.purchase_number} readOnly
                      style={{ width:"100%", border:"1px solid #E5E7EB", borderRadius:8, padding:"8px 10px", fontSize:13, fontFamily:"monospace", fontWeight:700, color:"#5F6368", background:"#F3F4F6", outline:"none", boxSizing:"border-box" as const }}/>
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#9AA0A6", marginBottom:5 }}>{t("pur_purchase_date")}</label>
                    <input type="date" value={editPurchase.purchase_date}
                      onChange={e => {
                        const newDate = e.target.value;
                        setEdit({ ...editPurchase, purchase_date: newDate });
                        setFormItems(prev => prev.map(it => {
                          if (!it.game_name) return it;
                          const auto = getDrawNumber(it.game_name, newDate);
                          return auto ? recalcDiscount({ ...it, draw_number: auto }) : it;
                        }));
                      }}
                      style={{ width:"100%", border:`1px solid ${focusedField==="pd"?"#4285F4":"#E5E7EB"}`, borderRadius:8, padding:"8px 10px", fontSize:13, color:"#111827", background:"#FFFFFF", outline:"none", boxSizing:"border-box" as const }}
                      onFocus={() => setFocused("pd")} onBlur={() => setFocused(null)}/>
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#9AA0A6", marginBottom:5 }}>{t("pur_stock_date")}</label>
                    <input type="date" value={editPurchase.stock_date}
                      onChange={e => setEdit({ ...editPurchase, stock_date: e.target.value })}
                      style={{ width:"100%", border:`1px solid ${focusedField==="sd"?"#4285F4":"#E5E7EB"}`, borderRadius:8, padding:"8px 10px", fontSize:13, color:"#111827", background:"#FFFFFF", outline:"none", boxSizing:"border-box" as const }}
                      onFocus={() => setFocused("sd")} onBlur={() => setFocused(null)}/>
                  </div>
                </div>

                {/* Section heading + buttons */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:3, height:16, borderRadius:2, background:"#4285F4" }}/>
                    <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"#5F6368" }}>
                      {t("pur_ticket_items")} · {formItems.filter(it => it.game_name).length} {t("pur_games_selected")}
                    </span>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setPickerRow(formItems.length)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, border:"1px solid #4285F4", background:"#EFF6FF", color:"#4285F4", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      <AddCircle size={14} variant="Linear" color="currentColor"/> {t("pur_add_game")}
                    </button>
                    {onNavigate && (
                      <button onClick={() => onNavigate("settings")} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, border:"1px solid #E5E7EB", background:"#F9FAFB", color:"#374151", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        ⚙ {t("pur_edit_games")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Empty state */}
                {formItems.filter(it => it.game_name).length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 20px", background:"#FFFFFF", borderRadius:14, border:"2px dashed #E5E7EB" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🎫</div>
                    <p style={{ fontSize:14, fontWeight:700, color:"#374151", marginBottom:4 }}>{t("pur_no_games_title")}</p>
                    <p style={{ fontSize:12, color:"#9AA0A6", marginBottom:16 }}>{t("pur_no_games_desc")}</p>
                    <button onClick={() => setPickerRow(0)} style={{ padding:"10px 24px", borderRadius:10, background:"#4285F4", color:"#FFFFFF", fontSize:13, fontWeight:700, border:"none", cursor:"pointer" }}>
                      {t("pur_browse_games")}
                    </button>
                  </div>
                )}

                {/* Game item cards */}
                {formItems.filter(it => it.game_name).map((it, visIdx) => {
                  const realIdx = formItems.indexOf(it);
                  const date = editPurchase.purchase_date ?? today();
                  const info = getDrawInfo(it.game_name, date);
                  const gross = it.value;
                  const discAmt = it.discount_amt ?? 0;
                  const net = it.net_value ?? gross;
                  return (
                    <div key={realIdx} style={{ background:"#FFFFFF", borderRadius:14, border:"1px solid #E5E7EB", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", overflow:"hidden" }}>
                      {/* Card header */}
                      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderBottom:"1px solid #F3F4F6" }}>
                        <div style={{ width:52, height:52, borderRadius:10, overflow:"hidden", background:"#F8FAFC", border:"1px solid #E5E7EB", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <img src={resolveLogoUrl(it.game_name)} alt={it.game_name}
                            style={{ width:48, height:48, objectFit:"contain" }}
                            onError={e => { (e.currentTarget as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' rx='8' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='22'%3E%F0%9F%8E%AB%3C/text%3E%3C/svg%3E"; }}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:800, color:"#111827", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{it.game_name}</div>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
                            <span style={{ fontSize:10, color:"#9AA0A6", fontWeight:600 }}>{t("pur_draw")}</span>
                            <input value={fmtDraw(it.draw_number) || ""}
                              onChange={e => updateItem(realIdx, "draw_number", e.target.value)}
                              placeholder={fmtDraw(info?.drawNo) || "—"}
                              style={{ width:72, border:"1px solid #DBEAFE", borderRadius:6, padding:"2px 8px", fontSize:12, fontFamily:"monospace", fontWeight:700, color:"#1D4ED8", background:"#EFF6FF", outline:"none", textAlign:"center" }}/>
                            {info?.drawNo && !it.draw_number && (
                              <span style={{ fontSize:10, color:"#6B7280" }}>{t("pur_draw_auto")} #{fmtDraw(info.drawNo)}</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => setPickerRow(realIdx)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #E5E7EB", background:"#F9FAFB", color:"#6B7280", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                          {t("pur_change")}
                        </button>
                        <button onClick={() => setFormItems(prev => prev.filter((_, i) => i !== realIdx))} style={{ width:28, height:28, borderRadius:6, border:"1px solid #FECACA", background:"#FEF2F2", color:"#EA4335", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                          <CloseCircle size={14} variant="Linear" color="currentColor"/>
                        </button>
                      </div>

                      {/* Card body — qty / price / discount */}
                      <div style={{ display:"grid", gridTemplateColumns:"160px 160px 1fr auto", alignItems:"start", gap:0 }}>
                        {/* Qty */}
                        <div style={{ padding:"14px 14px 14px 16px", borderRight:"1px solid #F3F4F6" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{t("pur_quantity")}</div>
                          <div style={{ display:"flex", alignItems:"center", border:`1px solid ${it.qty>0?"#34A853":"#E5E7EB"}`, borderRadius:8, overflow:"hidden", height:36 }}>
                            <button onClick={() => updateItem(realIdx, "qty", Math.max(0, it.qty - 1))} style={{ width:32, height:36, border:"none", background: it.qty>0?"#F0FFF4":"#F9FAFB", color: it.qty>0?"#34A853":"#9AA0A6", fontSize:18, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                            <input type="number" value={it.qty || ""} placeholder="0"
                              onChange={e => updateItem(realIdx, "qty", parseInt(e.target.value) || 0)}
                              style={{ width:64, height:36, border:"none", borderLeft:"1px solid #E5E7EB", borderRight:"1px solid #E5E7EB", background: it.qty>0?"#F0FFF4":"#FFFFFF", color: it.qty>0?"#16A34A":"#374151", fontSize:14, fontWeight:800, textAlign:"center", outline:"none" }}
                              onFocus={e => e.target.select()}/>
                            <button onClick={() => updateItem(realIdx, "qty", it.qty + 1)} style={{ width:32, height:36, border:"none", background: it.qty>0?"#F0FFF4":"#F9FAFB", color: it.qty>0?"#34A853":"#9AA0A6", fontSize:18, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                          </div>
                        </div>

                        {/* Unit price */}
                        <div style={{ padding:"14px 14px", borderRight:"1px solid #F3F4F6" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
                            {t("pur_unit_price_nimalsiri")}
                          </div>
                          <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                            <span style={{ fontSize:10, color:"#9AA0A6", fontWeight:600 }}>LKR</span>
                            <input type="number" step="0.01" value={it.unit_price || ""}
                              onChange={e => updateItem(realIdx, "unit_price", parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              style={{ width:80, border:`1px solid ${focusedField===`up${realIdx}`?"#4285F4":"#E5E7EB"}`, borderRadius:8, padding:"7px 8px", fontSize:13, fontWeight:700, color:"#374151", background:"#FAFAFA", outline:"none", textAlign:"right" }}
                              onFocus={e => { e.target.select(); setFocused(`up${realIdx}`); }}
                              onBlur={() => setFocused(null)}/>
                          </div>
                          <div style={{ fontSize:9, color:"#9AA0A6", marginTop:3 }}>
                            {t("pur_nimalsiri_price_hint")}: LKR {gameCostMap[it.game_name] ?? "—"}
                          </div>
                        </div>

                        {/* Discount */}
                        <div style={{ padding:"14px 14px", borderRight:"1px solid #F3F4F6" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{t("pur_discount")}</div>
                          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                            <select value={it.discount_type ?? "pct"}
                              onChange={e => updateItem(realIdx, "discount_type", e.target.value)}
                              style={{ border:"1px solid #E5E7EB", borderRadius:7, padding:"6px 8px", fontSize:12, fontWeight:600, color:"#374151", background:"#FAFAFA", outline:"none", cursor:"pointer" }}>
                              <option value="pct">%</option>
                              <option value="lkr">LKR</option>
                            </select>
                            <input type="number" min="0"
                              max={it.discount_type === "pct" ? 100 : undefined}
                              step={it.discount_type === "pct" ? "0.1" : "1"}
                              value={it.discount_type === "pct" ? (it.discount_pct || "") : (it.discount_amt || "")}
                              placeholder="0"
                              onChange={e => {
                                const v = parseFloat(e.target.value) || 0;
                                if (it.discount_type === "pct") updateItem(realIdx, "discount_pct", v);
                                else updateItem(realIdx, "discount_amt", v);
                              }}
                              style={{ width:72, border:`1px solid ${focusedField===`dc${realIdx}`?"#FBBC05":"#E5E7EB"}`, borderRadius:7, padding:"7px 8px", fontSize:13, fontWeight:700, color:"#92400E", background: discAmt>0?"#FFFBEB":"#FAFAFA", outline:"none", textAlign:"right" }}
                              onFocus={e => { e.target.select(); setFocused(`dc${realIdx}`); }}
                              onBlur={() => setFocused(null)}/>
                          </div>
                          {discAmt > 0 && (
                            <div style={{ fontSize:9, color:"#D97706", marginTop:3, fontWeight:600 }}>
                              - LKR {fmt(discAmt)}
                            </div>
                          )}
                        </div>

                        {/* Line totals */}
                        <div style={{ padding:"14px 16px", textAlign:"right" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{t("pur_line_total")}</div>
                          {discAmt > 0 && (
                            <div style={{ fontSize:11, color:"#9AA0A6", textDecoration:"line-through", marginBottom:2 }}>LKR {fmt(gross)}</div>
                          )}
                          <div style={{ fontSize:20, fontWeight:900, color: net > 0 ? "#111827" : "#D1D5DB", letterSpacing:"-0.02em" }}>
                            LKR {fmt(net)}
                          </div>
                          {it.qty > 0 && it.unit_price > 0 && (
                            <div style={{ fontSize:10, color:"#9AA0A6", marginTop:3 }}>
                              {it.qty.toLocaleString()} × LKR {fmt(it.unit_price)}
                            </div>
                          )}
                        </div>
                      </div>

                      {visIdx < formItems.filter(i => i.game_name).length - 1 && <div style={{ height:1, background:"#F3F4F6" }}/>}
                    </div>
                  );
                })}

                {/* Add another game */}
                {formItems.filter(it => it.game_name).length > 0 && (
                  <button onClick={() => setPickerRow(formItems.length)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px", borderRadius:14, border:"2px dashed #DBEAFE", background:"#F8FAFF", color:"#4285F4", fontSize:13, fontWeight:700, cursor:"pointer", width:"100%" }}>
                    <AddCircle size={16} variant="Linear" color="currentColor"/> {t("pur_add_another_game")}
                  </button>
                )}

                {/* Logo picker */}
                {pickerRow !== null && (
                  <TicketLogoPicker
                    currentValue={formItems[pickerRow]?.game_name ?? ""}
                    onSelect={name => {
                      if (pickerRow >= formItems.length) {
                        const newItem: PurchaseInvoiceItem = {
                          game_name: name, barcode_start: "", barcode_end: "",
                          qty: 0, unit_price: gameCostMap[name] ?? 0, value: 0,
                          draw_number: getDrawNumber(name, editPurchase?.purchase_date ?? today()) || "",
                          draw_date: "", discount_type: "pct", discount_pct: 0, discount_amt: 0, net_value: 0,
                        };
                        setFormItems(prev => [...prev, recalcDiscount(newItem)]);
                      } else {
                        updateItem(pickerRow, "game_name", name);
                      }
                      setPickerRow(null);
                    }}
                    onClose={() => setPickerRow(null)}
                  />
                )}
              </div>

              {/* ════════ RIGHT PANEL — Checkout Summary ════════ */}
              <div style={{ width:320, flexShrink:0, background:"#FFFFFF", borderLeft:"1px solid #E5E7EB", display:"flex", flexDirection:"column" }}>
                {/* Supplier badge */}
                <div style={{ padding:"16px 20px 14px", borderBottom:"1px solid #F3F4F6", background:"linear-gradient(135deg,#F8FAFF 0%,#EFF6FF 100%)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"#4285F4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Box1 size={18} variant="Bold" color="#FFFFFF"/>
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:"#1D1D1D" }}>Nimalsiri Enterprises</div>
                      <div style={{ fontSize:10, color:"#9AA0A6", fontWeight:500 }}>
                        {t("pur_price_type_nimalsiri")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order items list */}
                <div style={{ flex:1, overflowY:"auto", padding:"14px 20px" }}>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"#9AA0A6", marginBottom:10 }}>{t("pur_order_summary")}</div>
                  {formItems.filter(it => it.game_name && it.qty > 0).length === 0 ? (
                    <div style={{ fontSize:12, color:"#D1D5DB", textAlign:"center", padding:"20px 0" }}>{t("pur_no_items_yet")}</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {formItems.filter(it => it.game_name && it.qty > 0).map((it, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:"#F8FAFC", border:"1px solid #F1F3F4" }}>
                          <img src={resolveLogoUrl(it.game_name)} alt=""
                            style={{ width:28, height:28, objectFit:"contain", borderRadius:5, flexShrink:0 }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:"#111827", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{it.game_name}</div>
                            <div style={{ fontSize:10, color:"#9AA0A6" }}>
                              {it.qty.toLocaleString()} × LKR {fmt(it.unit_price)}
                              {it.draw_number && <span style={{ marginLeft:6, color:"#2563EB", fontWeight:600 }}>#{fmtDraw(it.draw_number)}</span>}
                            </div>
                            {(it.discount_amt ?? 0) > 0 && (
                              <div style={{ fontSize:9, color:"#D97706", fontWeight:600 }}>- LKR {fmt(it.discount_amt ?? 0)}</div>
                            )}
                          </div>
                          <div style={{ fontSize:12, fontWeight:800, color:"#374151", flexShrink:0 }}>
                            LKR {fmt(it.net_value ?? it.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals + payment */}
                <div style={{ padding:"16px 20px", borderTop:"1px solid #E5E7EB" }}>
                  {/* Gross total */}
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:"#6B7280" }}>{t("pur_gross_total")}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>LKR {fmt(formGross)}</span>
                  </div>
                  {/* Total discount */}
                  {formDiscount > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:11, color:"#D97706" }}>{t("pur_total_discount")}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:"#D97706" }}>- LKR {fmt(formDiscount)}</span>
                    </div>
                  )}
                  {/* Net order total */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12, paddingTop:6, borderTop:"1px dashed #E5E7EB" }}>
                    <span style={{ fontSize:11, color:"#6B7280", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>{t("pur_order_total")}</span>
                    <span style={{ fontSize:20, fontWeight:900, color:"#111827", letterSpacing:"-0.02em" }}>LKR {fmt(formTotal)}</span>
                  </div>

                  {/* Cash paid input */}
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#9AA0A6", marginBottom:5 }}>{t("pur_cash_paid")}</label>
                    <div style={{ position:"relative" }}>
                      <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"#9AA0A6", fontWeight:600, pointerEvents:"none" as const }}>LKR</span>
                      <input type="number" step="0.01"
                        value={editPurchase.initial_payment || ""}
                        onChange={e => setEdit({ ...editPurchase, initial_payment: parseFloat(e.target.value) || 0 })}
                        onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                        placeholder="0.00"
                        style={{ width:"100%", paddingLeft:40, paddingRight:12, paddingTop:10, paddingBottom:10, border:`2px solid ${focusedField==="ip" ? "#34A853" : "#E5E7EB"}`, borderRadius:10, fontSize:16, fontWeight:800, color:"#16A34A", background:"#F0FFF4", outline:"none", boxSizing:"border-box" as const, transition:"border-color 0.15s" }}
                        onFocus={e => { e.target.select(); setFocused("ip"); }}
                        onBlur={() => setFocused(null)}/>
                    </div>
                  </div>

                  {/* Balance pill */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"10px 12px", borderRadius:10, background: formBalance > 0 ? "#FEF2F2" : "#F0FFF4", border: `1px solid ${formBalance > 0 ? "#FECACA" : "#BBF7D0"}`, marginBottom:14 }}>
                    <span style={{ fontSize:11, fontWeight:700, color: formBalance > 0 ? "#B91C1C" : "#15803D", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                      {formBalance > 0 ? t("pur_balance_due") : t("pur_fully_paid")}
                    </span>
                    <span style={{ fontSize:18, fontWeight:900, color: formBalance > 0 ? "#EA4335" : "#34A853", letterSpacing:"-0.02em" }}>
                      LKR {fmt(Math.max(0, formBalance))}
                    </span>
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#9AA0A6", marginBottom:5 }}>{t("pur_notes")}</label>
                    <textarea value={editPurchase.notes}
                      onChange={e => setEdit({ ...editPurchase, notes: e.target.value })}
                      placeholder={t("pur_notes_placeholder")}
                      rows={2}
                      style={{ width:"100%", border:`1px solid ${focusedField==="notes"?"#4285F4":"#E5E7EB"}`, borderRadius:8, padding:"8px 10px", fontSize:12, color:"#374151", background:"#FAFAFA", outline:"none", resize:"none" as const, boxSizing:"border-box" as const, fontFamily:"inherit" }}
                      onFocus={() => setFocused("notes")} onBlur={() => setFocused(null)}/>
                  </div>

                  {/* Save CTA */}
                  <button onClick={handleSave} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#4285F4,#1A73E8)", color:"#FFFFFF", fontSize:14, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 14px rgba(66,133,244,0.35)", display:"flex", alignItems:"center", justifyContent:"center", gap:8, letterSpacing:"-0.01em" }}>
                    <Save2 size={16} variant="Bold" color="currentColor"/>
                    {t("pur_save")}
                  </button>
                  {isEditingExisting && (
                    <button onClick={resetToNewOrder} style={{ width:"100%", marginTop:8, padding:"10px", borderRadius:10, border:"1px solid #DBEAFE", background:"#EFF6FF", color:"#4285F4", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      {t("pur_discard")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ── Purchase Invoices List ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background:"#FFFFFF", border:"1px solid #E0E3E7" }}>
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ background:"linear-gradient(135deg,#1D1D1D,#374151)", borderBottom:"2px solid #4285F4" }}>
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} variant="Linear" color="currentColor" style={{ color:"#4285F4" }}/>
              <span className="text-sm font-semibold text-white">{t("pur_history_title")}</span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background:"rgba(255,255,255,0.15)", color:"#fff" }}>
              {purchases.length} record{purchases.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color:"#9AA0A6" }}>Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
              <EmptyInventory size={90} className="mb-5 opacity-90" />
              <h3 className="text-sm font-semibold mb-1.5" style={{ color:"#202124" }}>{t("pur_no_purchases_title")}</h3>
              <p className="text-xs max-w-xs leading-relaxed" style={{ color:"#9AA0A6" }}>{t("pur_no_purchases_desc")}</p>
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
                        style={{ background: isSettled ? "#34A853" : "#EA4335",
                          boxShadow: isSettled ? "0 0 6px #34A85360" : "0 0 6px #EA433560" }}/>

                      {/* Purchase number + date */}
                      <div className="w-32">
                        <p className="text-sm font-bold font-mono" style={{ color:"#202124" }}>{pur.purchase_number}</p>
                        <p className="text-[10px]" style={{ color:"#9AA0A6" }}>{fmtDate(pur.purchase_date)}</p>
                      </div>

                      {/* Supplier + ticket summary */}
                      <div className="flex-1">
                        <p className="text-xs font-semibold" style={{ color:"#202124" }}>{pur.supplier_name}</p>
                        <p className="text-[10px]" style={{ color:"#9AA0A6" }}>
                          {t("pur_stock_date_label")}: {fmtDate(pur.stock_date)}
                          {pur.items && pur.items.length > 0 && (
                            <span style={{ marginLeft:8, color:"#EA4335", fontWeight:600 }}>
                              · {pur.items.reduce((s,it)=>s+it.qty,0).toLocaleString()} tickets
                              · {pur.items.length} game{pur.items.length!==1?"s":""}
                              {pur.items.some(it=>it.draw_number) && ` · Draw #${[...new Set(pur.items.map(it=>it.draw_number).filter(Boolean))].join(", ")}`}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Financials */}
                      <div className="text-right w-28">
                        <p className="text-[10px] font-semibold uppercase" style={{ color:"#9AA0A6" }}>{t("pur_invoice_col")}</p>
                        <p className="text-sm font-bold" style={{ color:"#202124" }}>Rs. {fmt(pur.invoice_total)}</p>
                      </div>
                      <div className="text-right w-28">
                        <p className="text-[10px] font-semibold uppercase" style={{ color:"#9AA0A6" }}>{t("pur_paid_col")}</p>
                        <p className="text-sm font-semibold" style={{ color:"#34A853" }}>Rs. {fmt(pur.initial_payment)}</p>
                      </div>
                      {paidAfter > 0 && (
                        <div className="text-right w-28">
                          <p className="text-[10px] font-semibold uppercase" style={{ color:"#9AA0A6" }}>{t("pur_later_paid_col")}</p>
                          <p className="text-sm font-semibold" style={{ color:"#2563eb" }}>Rs. {fmt(paidAfter)}</p>
                        </div>
                      )}
                      <div className="text-right w-32">
                        <p className="text-[10px] font-semibold uppercase" style={{ color:"#9AA0A6" }}>{t("pur_balance_col")}</p>
                        <p className="text-base font-black" style={{ color: live > 0 ? "#EA4335" : "#34A853" }}>
                          Rs. {fmt(live)}
                        </p>
                      </div>

                      {/* Status badge */}
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold w-20 text-center"
                        style={{ background: isSettled ? "#E6F4EA" : "#FEE2E2",
                          color: isSettled ? "#34A853" : "#EA4335" }}>
                        {isSettled ? t("pur_status_settled") : t("pur_status_pending")}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => toggleExpand(pur.id!)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{ background: isExpanded ? "#F3F4F6" : "#FFFFFF",
                            border:"1px solid #E0E3E7", color:"#202124" }}>
                          {isExpanded ? <ArrowUp size={14} variant="Linear" color="currentColor"/> : <ArrowDown2 size={14} variant="Linear" color="currentColor"/>}
                          {isExpanded ? t("pur_hide") : t("pur_details")}
                        </button>
                        <button onClick={() => openEdit(pur)}
                          className="p-1.5 rounded-lg" style={{ background:"#EFF6FF", color:"#2563eb" }}
                          title={t("pur_change")}>
                          <Box1 size={14} variant="Linear" color="currentColor"/>
                        </button>
                        <button onClick={() => handleDelete(pur.id!)}
                          className="p-1.5 rounded-lg" style={{ background:"#FCE8E6", color:"#EA4335" }}
                          title={t("confirm_delete_title")}>
                          <Trash size={13} variant="Linear" color="currentColor"/>
                        </button>
                      </div>
                    </div>

                    {/* ── Expanded Full History Panel ── */}
                    {isExpanded && (
                      <div style={{ borderTop:"2px solid #4285F4", background:"#F8FAFC" }}>

                        {/* ── HEADER: Invoice identity ── */}
                        <div style={{ padding:"16px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                            <div style={{ background:"linear-gradient(135deg,#4285F4,#1A73E8)", borderRadius:10, padding:"8px 14px", color:"#fff" }}>
                              <div style={{ fontSize:10, fontWeight:600, opacity:0.8, marginBottom:2 }}>PURCHASE INVOICE</div>
                              <div style={{ fontSize:16, fontWeight:900, fontFamily:"monospace" }}>{pur.purchase_number}</div>
                            </div>
                            <div>
                              <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.08em" }}>Purchase Date</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{fmtDate(pur.purchase_date)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.08em" }}>Stock / Draw Date</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{fmtDate(pur.stock_date)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.08em" }}>Supplier</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{pur.supplier_name}</div>
                                </div>
                                {pur.notes && (
                                  <div>
                                    <div style={{ fontSize:9, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.08em" }}>Notes</div>
                                    <div style={{ fontSize:12, color:"#5F6368" }}>{pur.notes}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <span style={{ padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:800,
                            background: isSettled ? "#E6F4EA" : "#FEE2E2",
                            color: isSettled ? "#34A853" : "#EA4335",
                            border: `1px solid ${isSettled?"#CEEAD6":"#FECACA"}` }}>
                            {isSettled ? "✅ Fully Settled" : "⏳ Payment Pending"}
                          </span>
                        </div>

                        {/* ── Financial summary strip ── */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, padding:"14px 20px" }}>
                          {[
                            { label:"Invoice Total",      val:pur.invoice_total,                          color:"#111827", bg:"#fff",     border:"#E5E7EB" },
                            { label:"Cash at Delivery",   val:pur.initial_payment,                         color:"#34A853", bg:"#F0FFF4",  border:"#CEEAD6" },
                            { label:"Later Payments",     val:paidAfter,                                   color:"#2563EB", bg:"#EFF6FF",  border:"#BFDBFE" },
                            ...(returnCredit > 0 ? [{ label:"Return Credits", val:returnCredit, color:"#7C3AED", bg:"#F5F3FF", border:"#DDD6FE" }] : []),
                            { label:"Total Settled",      val:pur.initial_payment+paidAfter+returnCredit,  color:"#059669", bg:"#F0FDF4",  border:"#A7F3D0" },
                            { label:"Balance Owed",       val:live,                                         color: live>0?"#EA4335":"#34A853", bg: live>0?"#FCE8E6":"#F0FFF4", border: live>0?"#FECACA":"#CEEAD6" },
                          ].map(c => (
                            <div key={c.label} style={{ padding:"10px 14px", borderRadius:10, background:c.bg, border:`1px solid ${c.border}` }}>
                              <div style={{ fontSize:9, fontWeight:700, color:"#9AA0A6", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{c.label}</div>
                              <div style={{ fontSize:15, fontWeight:900, color:c.color }}>Rs. {fmt(c.val)}</div>
                            </div>
                          ))}
                        </div>

                        {/* ── Ticket batch details ── */}
                        {pur.items && pur.items.length > 0 && (
                          <div style={{ padding:"0 20px 14px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                              <div style={{ width:3, height:16, borderRadius:2, background:"#4285F4" }}/>
                              <span style={{ fontSize:11, fontWeight:700, color:"#5F6368", textTransform:"uppercase", letterSpacing:"0.06em" }}>
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
                                      style={{ width:56, height:56, objectFit:"contain", borderRadius:6 }}
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
                                        <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#34A853", color:"#fff", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:900, whiteSpace:"nowrap" }}>
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
                                      <div style={{ fontSize:10, color:"#5F6368", fontFamily:"monospace" }}>
                                        <span style={{ color:"#9AA0A6" }}>Verify: </span>
                                        <span style={{ color:"#7C3AED" }}>{item.barcode_end}</span>
                                        <span style={{ color:"#9AA0A6" }}> − </span>
                                        <span style={{ color:"#2563EB" }}>{item.barcode_start}</span>
                                        <span style={{ color:"#9AA0A6" }}> = </span>
                                        <span style={{ fontWeight:800, color:"#34A853" }}>{item.qty.toLocaleString()} ✓</span>
                                        <span style={{ marginLeft:8, color:"#9AA0A6" }}>(end barcode = first ticket of NEXT batch = {item.barcode_end})</span>
                                      </div>
                                      <div style={{ textAlign:"right" }}>
                                        <div style={{ fontSize:9, color:"#9AA0A6", marginBottom:2 }}>@ Rs. {fmt(item.unit_price)} each</div>
                                        <div style={{ fontSize:15, fontWeight:900, color:"#4285F4" }}>Rs. {fmt(item.value)}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Sales Tracking per batch ── */}
                        {pur.items && pur.items.length > 0 && (
                          <BatchSalesTracker items={pur.items} />
                        )}

                        {/* ── Payment/Settlement history ── */}
                        <div style={{ padding:"0 20px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ width:3, height:16, borderRadius:2, background:"#34A853" }}/>
                              <span style={{ fontSize:11, fontWeight:700, color:"#5F6368", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                                💰 Settlement History
                              </span>
                            </div>
                            {!isSettled && !paymentForm && (
                              <button onClick={() => setPaymentForm(EMPTY_PAYMENT(pur.id!))}
                                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 16px", border:"none", borderRadius:8, background:"#4285F4", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                <AddCircle size={15} variant="Linear" color="currentColor"/> Record Payment
                              </button>
                            )}
                          </div>

                          {/* Delivery cash as first history entry */}
                          <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:10, overflow:"hidden" }}>
                            <table className="w-full" style={{ fontSize:12 }}>
                              <thead>
                                <tr style={{ background:"#F9FAFB" }}>
                                  {["#", t("pur_payment_date"), t("pur_payment_type"), t("pur_payment_amount"), t("pur_payment_ref"), ""].map((h,i) => (
                                    <th key={i} style={{ padding:"8px 14px", textAlign:i>=3?"right":"left", fontSize:10, fontWeight:700, color:"#5F6368", textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #E5E7EB" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Delivery payment row */}
                                <tr style={{ background:"#F0FFF4" }}>
                                  <td style={{ padding:"10px 14px", color:"#9AA0A6", fontWeight:700 }}>0</td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <div style={{ fontWeight:700, color:"#111827" }}>{fmtDate(pur.purchase_date)}</div>
                                    <div style={{ fontSize:10, color:"#5F6368" }}>At delivery</div>
                                  </td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#E6F4EA", color:"#34A853" }}>Cash at Delivery</span>
                                  </td>
                                  <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:14, color:"#34A853" }}>Rs. {fmt(pur.initial_payment)}</td>
                                  <td style={{ padding:"10px 14px", color:"#9AA0A6", fontSize:11 }}>Paid when stock received</td>
                                  <td style={{ padding:"10px 14px" }}/>
                                </tr>

                                {/* Post-delivery payments */}
                                {pmts.map((p, pi) => {
                                  const tc = PAYMENT_TYPE_COLORS[p.payment_type];
                                  return (
                                    <tr key={p.id} style={{ borderTop:"1px solid #F3F4F6" }}>
                                      <td style={{ padding:"10px 14px", color:"#9AA0A6", fontWeight:700 }}>{pi+1}</td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <div style={{ fontWeight:700, color:"#111827" }}>{fmtDate(p.payment_date)}</div>
                                      </td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:tc.bg, color:tc.color }}>
                                          {PAYMENT_TYPE_LABELS[p.payment_type]}
                                        </span>
                                      </td>
                                      <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:14, color:"#2563EB" }}>Rs. {fmt(p.amount)}</td>
                                      <td style={{ padding:"10px 14px", color:"#5F6368", fontSize:11 }}>{p.notes || "—"}</td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <button onClick={() => handleDeletePayment(p.id!, pur.id!)} style={{ border:"none", background:"#FCE8E6", borderRadius:6, padding:"3px 8px", color:"#EA4335", cursor:"pointer" }}>
                                          <Trash size={13} variant="Linear" color="currentColor"/>
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
                                      <div style={{ fontSize:10, color:"#5F6368" }}>Tickets returned & credited</div>
                                    </td>
                                    <td style={{ padding:"10px 14px" }}>
                                      <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#EDE9FE", color:"#7C3AED" }}>Return Credit</span>
                                    </td>
                                    <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:900, fontSize:14, color:"#7C3AED" }}>Rs. {fmt(returnCredit)}</td>
                                    <td colSpan={2} style={{ padding:"10px 14px", fontSize:11, color:"#5F6368" }}>
                                      See Return to Supplier page for details
                                    </td>
                                  </tr>
                                )}
                                <tr style={{ background:"#374151", borderTop:"2px solid #4285F4" }}>
                                  <td colSpan={3} style={{ padding:"10px 14px", color:"#9AA0A6", fontSize:11, fontWeight:700 }}>
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
                              <span style={{ fontWeight:700, fontSize:13, color:"#111827" }}>💳 {t("pur_record_payment")}</span>
                              <button onClick={() => setPaymentForm(null)} style={{ border:"none", background:"none", cursor:"pointer", color:"#9AA0A6" }}><CloseCircle size={14} variant="Linear" color="currentColor"/></button>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9AA0A6" }}>{t("pur_payment_date")}</label>
                                <input type="date" value={paymentForm.payment_date}
                                  onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                                  className={inputCls} style={inputStyle("pp-date")}
                                  onFocus={() => setFocused("pp-date")} onBlur={() => setFocused(null)}/>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9AA0A6" }}>{t("pur_payment_type")}</label>
                                <select value={paymentForm.payment_type}
                                  onChange={e => setPaymentForm({ ...paymentForm, payment_type: e.target.value as PurchasePaymentType })}
                                  className={inputCls} style={inputStyle("pp-type")}
                                  onFocus={() => setFocused("pp-type")} onBlur={() => setFocused(null)}>
                                  {(Object.keys(PAYMENT_TYPE_LABELS) as PurchasePaymentType[]).map(pt => (
                                    <option key={pt} value={pt}>{PAYMENT_TYPE_LABELS[pt]}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9AA0A6" }}>{t("pur_payment_amount")} — {t("pur_balance_col")}: {fmt(live)}</label>
                                <input type="number" step="0.01" value={paymentForm.amount || ""}
                                  onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                                  onKeyDown={e => { if (e.key==="Enter") handleAddPayment(); }}
                                  placeholder={`${fmt(live)}`}
                                  className={inputCls} style={{ ...inputStyle("pp-amt"), color:"#34A853", fontWeight:700 }}
                                  onFocus={(e) => { e.target.select(); setFocused("pp-amt"); }} onBlur={() => setFocused(null)}/>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9AA0A6" }}>{t("pur_payment_ref")}</label>
                                <input value={paymentForm.notes}
                                  onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                  placeholder="e.g. Cheque #12345"
                                  className={inputCls} style={inputStyle("pp-notes")}
                                  onFocus={() => setFocused("pp-notes")} onBlur={() => setFocused(null)}/>
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:8, marginTop:12 }}>
                              <button onClick={handleAddPayment}
                                style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 20px", border:"none", borderRadius:8, background:"#4285F4", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                                <Save2 size={14} variant="Linear" color="currentColor"/> {t("pur_save_payment")}
                              </button>
                              <button onClick={() => setPaymentForm(null)}
                                style={{ padding:"8px 16px", border:"1px solid #E5E7EB", borderRadius:8, background:"#F9FAFB", color:"#5F6368", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                                {t("pur_cancel")}
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
          <Card size={14} variant="Linear" color="currentColor" style={{ color:"#2563eb", flexShrink:0, marginTop:2 }}/>
          <div>
            <p className="text-xs font-bold mb-1" style={{ color:"#1e40af" }}>{t("pur_how_settlement")}</p>
            <p className="text-xs leading-relaxed" style={{ color:"#3730a3" }}>
              {t("pur_settlement_desc")}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
