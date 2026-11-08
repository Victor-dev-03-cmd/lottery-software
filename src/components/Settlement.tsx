/**
 * Settlement — unified two-panel page.
 *
 * LEFT:  Nimalsiri Settlement   (Ajith Rohana → Nimalsiri)
 *        Method A: Money Payment  → purchase_payments table
 *        Method B: Ticket Return  → supplier_returns table
 *
 * RIGHT: Sub-agent Settlement   (Sub-agent → Ajith Rohana)
 *        Method A: Money Payment  → payments table
 *        Method B: Ticket Return  → ticket_returns table (original invoice price)
 *
 * All accounting logic reuses existing shared database service functions.
 * No duplicate business logic introduced.
 */

import React, { useEffect, useState } from "react";
import {
  AddCircle, Trash, CloseCircle, Save2, Refresh2, Home2, ArrowRight2,
  TickCircle, Warning2, GalleryAdd, People,
  Money4, RotateLeft,
} from "iconsax-react";
import TicketLogoPicker, { resolveLogoUrl } from "./TicketLogoPicker";
import {
  getLotteryGames,
  getPurchaseInvoices,
  getPurchasePayments,
  savePurchasePayment,
  getSupplierOutstanding,
  getSupplierReturns,
  saveSupplierReturn,
  creditSupplierReturn,
  deleteSupplierReturn,
  getBatchesForGame,
  getAgents,
  getInvoices,
  getInvoiceWithItems,
  getPayments,
  savePayment,
  getAgentLastOutstanding,
  getTicketReturns,
  saveTicketReturn,
  settleTicketReturn,
  deleteTicketReturn,
  getReturnSummary,
} from "../services/database";
import type {
  SupplierReturn, PurchaseInvoice, PurchasePayment, PurchasePaymentType,
  LotteryGame, Agent, Invoice, InvoiceItem, Payment, PaymentType, TicketReturn,
} from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../i18n";
import { usePinGuardContext } from "../App";
import { EmptyInventory } from "./illustrations";

// ── Shared constants ──────────────────────────────────────────────────────────

const RETURN_REASONS = [
  { value: "unsold",       label: "Unsold",       color: "#6B7280" },
  { value: "damaged",      label: "Damaged",      color: "#EA4335" },
  { value: "expired_draw", label: "Expired Draw", color: "#d97706" },
  { value: "exchange",     label: "Exchange",     color: "#2563eb" },
  { value: "other",        label: "Other",        color: "#7c3aed" },
] as const;

const PURCHASE_PMT_LABELS: Record<PurchasePaymentType, string> = {
  cash:          "Cash",
  cheque:        "Cheque",
  return_credit: "Return Credit",
};

const AGENT_PMT_LABELS: Record<PaymentType, string> = {
  cash:        "Cash",
  cheque:      "Cheque",
  nlb_winning: "NLB Winning",
  dlb_winning: "DLB Winning",
};

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}

const today = () => new Date().toISOString().split("T")[0];

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
      style={{ color: "#9CA3AF" }}>{children}</label>
  );
}

function Fi(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  const { onFocus, onBlur, ...rest } = props;
  return (
    <input {...rest}
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
      style={{ border: `1px solid ${f ? "#4285F4" : "#E8E8E8"}`, background: "#FAFAFA", color: "#1D1D1D", ...props.style }}
      onFocus={e => { setF(true); onFocus?.(e); }}
      onBlur={e => { setF(false); onBlur?.(e); }} />
  );
}

function Fs(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [f, setF] = useState(false);
  const { onFocus, onBlur, children, ...rest } = props;
  return (
    <select {...rest}
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
      style={{ border: `1px solid ${f ? "#4285F4" : "#E8E8E8"}`, background: "#FAFAFA", color: "#1D1D1D" }}
      onFocus={e => { setF(true); onFocus?.(e); }}
      onBlur={e => { setF(false); onBlur?.(e); }}>
      {children}
    </select>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl p-3 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: `3px solid ${accent}` }}>
      <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
      <p className="text-lg font-black leading-none" style={{ color: "#1D1D1D" }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{sub}</p>
    </div>
  );
}

function MethodTab({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all"
      style={{
        background: active ? "#4285F4" : "#F3F4F6",
        color: active ? "#FFFFFF" : "#6B7280",
        border: `1px solid ${active ? "#4285F4" : "#E5E7EB"}`,
      }}>
      {icon} {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT PANEL — Nimalsiri Settlement
// ─────────────────────────────────────────────────────────────────────────────

function SupplierPanel({ games }: { games: LotteryGame[] }) {
  const { withAdminToken } = useAuth();
  const { requireAdminPin } = usePinGuardContext();

  const [method,       setMethod]      = useState<"money" | "ticket">("money");
  const [outstanding,  setOutstanding] = useState(0);
  const [invoices,     setInvoices]    = useState<PurchaseInvoice[]>([]);
  const [payments,     setPayments]    = useState<PurchasePayment[]>([]);
  const [returns,      setReturns]     = useState<SupplierReturn[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [saving,       setSaving]      = useState(false);
  const [authError,    setAuthError]   = useState<string | null>(null);

  // Money form
  const [mForm, setMForm] = useState<Omit<PurchasePayment, "id">>({
    purchase_id: 0, payment_date: today(), payment_type: "cash", amount: 0, reference: "", notes: "",
  });
  const [showMForm, setShowMForm] = useState(false);

  // Ticket return form
  const [rForm,       setRForm]     = useState<SupplierReturn>(emptyReturn());
  const [showRForm,   setShowRForm] = useState(false);
  const [logoPicker,  setLogoPicker]= useState(false);
  const [batchOptions,setBatches]   = useState<Awaited<ReturnType<typeof getBatchesForGame>>>([]);
  const [confirmCredit, setConfirm] = useState<SupplierReturn | null>(null);

  function emptyReturn(): SupplierReturn {
    return { return_date: today(), game_name: "", barcode_start: "", barcode_end: "", qty: 0, unit_price: 32.5, total_value: 0, return_reason: "unsold", status: "pending", notes: "", purchase_id: null };
  }

  async function load() {
    setLoading(true);
    try {
      const [inv, pmts, rets, owed] = await Promise.all([
        getPurchaseInvoices(),
        getPurchasePayments(),
        getSupplierReturns(),
        getSupplierOutstanding(),
      ]);
      setInvoices(inv);
      setPayments(pmts);
      setReturns(rets);
      setOutstanding(owed);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // ── Money Settlement ──────────────────────────────────────────────────────

  async function handleMoneySave() {
    if (!mForm.purchase_id) { alert("Select a purchase invoice."); return; }
    if (mForm.amount <= 0)  { alert("Amount must be greater than 0."); return; }
    const inv = invoices.find(i => i.id === mForm.purchase_id);
    if (inv && mForm.amount > inv.outstanding_balance + 0.005) {
      if (!confirm(`Amount Rs.${fmt(mForm.amount)} exceeds outstanding Rs.${fmt(inv.outstanding_balance)}. Continue?`)) return;
    }
    setSaving(true);
    try {
      await savePurchasePayment(mForm as PurchasePayment);
      setMForm({ purchase_id: 0, payment_date: today(), payment_type: "cash", amount: 0, reference: "", notes: "" });
      setShowMForm(false);
      load();
    } catch (e) { alert(`Save failed: ${String(e)}`); }
    finally { setSaving(false); }
  }

  // ── Ticket Return ─────────────────────────────────────────────────────────

  function setRFld(field: keyof SupplierReturn, value: string | number | null) {
    setRForm(prev => {
      const next = { ...prev, [field]: value } as SupplierReturn;
      if (field === "game_name") {
        const g = games.find(x => x.name === String(value));
        if (g) next.unit_price = g.cost_price ?? g.unit_price;
      }
      next.total_value = Math.round(next.qty * next.unit_price * 100) / 100;
      return next;
    });
  }

  async function handleReturnSave() {
    if (!rForm.game_name.trim()) { alert("Game / ticket name is required."); return; }
    if (rForm.qty <= 0)          { alert("Quantity must be greater than 0."); return; }
    setSaving(true);
    try {
      await saveSupplierReturn(rForm);
      setShowRForm(false);
      setRForm(emptyReturn());
      setBatches([]);
      load();
    } catch (err) { alert(`Save failed: ${String(err)}`); }
    finally { setSaving(false); }
  }

  async function confirmCreditAction() {
    if (!confirmCredit?.id) return;
    setAuthError(null);
    const id = confirmCredit.id;
    setConfirm(null);
    try { await creditSupplierReturn(id); load(); }
    catch (err) { setAuthError(`Credit failed: ${String(err)}`); }
  }

  async function handleDeleteReturn(id: number) {
    if (!(await requireAdminPin("Delete Supplier Return", "Enter the Admin PIN to delete this supplier return."))) return;
    setAuthError(null);
    try {
      await withAdminToken(async () => {
        if (!confirm("Delete this supplier return?")) return;
        await deleteSupplierReturn(id);
        load();
      });
    } catch (err) { setAuthError(String(err).includes("session") ? "Admin session required." : String(err)); }
  }

  const totalPaid    = payments.reduce((s, p) => s + p.amount, 0);
  const creditedVal  = returns.filter(r => r.status === "credited").reduce((s, r) => s + r.total_value, 0);
  const pendingRetVal= returns.filter(r => r.status === "pending").reduce((s, r) => s + r.total_value, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Panel heading */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight" style={{ color: "#1D1D1D" }}>Nimalsiri Settlement</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Ajith Rohana → Nimalsiri Enterprises</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
          <Refresh2 size={13} variant="Linear" color="currentColor" className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Outstanding balance */}
      <div className="rounded-xl p-4" style={{ background: outstanding > 0 ? "#FEF2F2" : "#F0FFF4", border: `1px solid ${outstanding > 0 ? "#FECACA" : "#BBF7D0"}` }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: outstanding > 0 ? "#B91C1C" : "#15803D" }}>
          Supplier Outstanding Balance
        </div>
        <div className="text-2xl font-black" style={{ color: outstanding > 0 ? "#EA4335" : "#34A853" }}>
          Rs. {fmt(outstanding)}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total Paid" value={`Rs.${fmt(totalPaid)}`} sub={`${payments.length} payments`} accent="#16a34a" />
        <KpiCard label="Return Credits" value={`Rs.${fmt(creditedVal)}`} sub={`${returns.filter(r=>r.status==="credited").length} credited`} accent="#3B82F6" />
      </div>

      {/* Auth error */}
      {authError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: "#FCE8E6", border: "1px solid #FECACA", color: "#EA4335" }}>
          <Warning2 size={13} variant="Linear" color="currentColor" />
          <span className="flex-1">{authError}</span>
          <button className="font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      {/* Method selector */}
      <div className="flex gap-2">
        <MethodTab label="Money Payment" icon={<Money4 size={13} variant="Linear" color="currentColor"/>} active={method === "money"} onClick={() => { setMethod("money"); setShowMForm(false); setShowRForm(false); }} />
        <MethodTab label="Ticket Return" icon={<RotateLeft size={13} variant="Linear" color="currentColor"/>} active={method === "ticket"} onClick={() => { setMethod("ticket"); setShowMForm(false); setShowRForm(false); }} />
      </div>

      {/* ── MONEY SETTLEMENT FORM ── */}
      {method === "money" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "#374151" }}>Record payment to Nimalsiri</p>
            <button onClick={() => setShowMForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: showMForm ? "#EA4335" : "#16A34A" }}>
              {showMForm ? <><CloseCircle size={12} variant="Linear" color="currentColor"/> Cancel</> : <><AddCircle size={12} variant="Linear" color="currentColor"/> New Payment</>}
            </button>
          </div>

          {showMForm && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #16A34A" }}>
                <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Payment to Nimalsiri</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Record cash/cheque paid to supplier</p>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <Lbl>🔗 Purchase Invoice *</Lbl>
                  <Fs value={mForm.purchase_id || ""} onChange={e => setMForm(p => ({ ...p, purchase_id: Number(e.target.value) }))}>
                    <option value="">— Select Purchase Invoice —</option>
                    {invoices.filter(i => i.outstanding_balance > 0.005).map(inv => (
                      <option key={inv.id} value={inv.id}>
                        #{inv.purchase_number} · {inv.purchase_date} · Owed: Rs.{fmt(inv.outstanding_balance)}
                      </option>
                    ))}
                  </Fs>
                  {mForm.purchase_id ? (() => {
                    const inv = invoices.find(i => i.id === mForm.purchase_id);
                    return inv ? <p className="text-[10px] mt-1" style={{ color: "#16A34A" }}>Outstanding: Rs.{fmt(inv.outstanding_balance)}</p> : null;
                  })() : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Lbl>Payment Date</Lbl>
                    <Fi type="date" value={mForm.payment_date} onChange={e => setMForm(p => ({ ...p, payment_date: e.target.value }))} />
                  </div>
                  <div>
                    <Lbl>Payment Type</Lbl>
                    <Fs value={mForm.payment_type} onChange={e => setMForm(p => ({ ...p, payment_type: e.target.value as PurchasePaymentType }))}>
                      {(Object.keys(PURCHASE_PMT_LABELS) as PurchasePaymentType[]).map(k => (
                        <option key={k} value={k}>{PURCHASE_PMT_LABELS[k]}</option>
                      ))}
                    </Fs>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Lbl>Amount (Rs.) *</Lbl>
                    <Fi type="number" step="0.01" min="0" value={mForm.amount || ""} placeholder="0.00"
                      onChange={e => setMForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                      onFocus={e => e.target.select()} />
                  </div>
                  <div>
                    <Lbl>Reference / Notes</Lbl>
                    <Fi type="text" value={mForm.reference} placeholder="Cheque #, receipt…"
                      onChange={e => setMForm(p => ({ ...p, reference: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleMoneySave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#16A34A" }}>
                    <Save2 size={13} variant="Linear" color="currentColor"/> {saving ? "Saving…" : "Save Payment"}
                  </button>
                  <button onClick={() => setShowMForm(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment history */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-4 py-3" style={{ background: "#374151", borderBottom: "2px solid #16A34A" }}>
              <span className="text-sm font-semibold text-white">Payment History</span>
              <span className="ml-2 text-[11px]" style={{ color: "#9CA3AF" }}>{payments.length} records</span>
            </div>
            {loading ? (
              <div className="p-6 text-center text-xs" style={{ color: "#9CA3AF" }}>Loading…</div>
            ) : payments.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: "#9CA3AF" }}>No payments recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                      {["Date", "Invoice", "Type", "Amount (Rs.)"].map(h => (
                        <th key={h} className="px-3 py-2 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-2 text-xs">
                          {p.purchase_id ? <span style={{ color: "#2563EB" }}>#{invoices.find(i=>i.id===p.purchase_id)?.purchase_number ?? p.purchase_id}</span> : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#374151" }}>{PURCHASE_PMT_LABELS[p.payment_type] ?? p.payment_type}</td>
                        <td className="px-3 py-2 text-xs text-right font-semibold" style={{ color: "#16a34a" }}>Rs.{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TICKET RETURN FORM ── */}
      {method === "ticket" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "#374151" }}>Return tickets to Nimalsiri</p>
            <button onClick={() => { setShowRForm(v => !v); setRForm(emptyReturn()); setBatches([]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: showRForm ? "#EA4335" : "#4285F4" }}>
              {showRForm ? <><CloseCircle size={12} variant="Linear" color="currentColor"/> Cancel</> : <><AddCircle size={12} variant="Linear" color="currentColor"/> Record Return</>}
            </button>
          </div>

          {showRForm && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #4285F4" }}>
                <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Record Supplier Return</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Ajith → Nimalsiri · reduces supplier payable</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Lbl>Return Date</Lbl>
                    <Fi type="date" value={rForm.return_date} onChange={e => setRFld("return_date", e.target.value)} />
                  </div>
                  <div>
                    <Lbl>Return Reason</Lbl>
                    <Fs value={rForm.return_reason} onChange={e => setRFld("return_reason", e.target.value)}>
                      {RETURN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Fs>
                  </div>
                </div>
                <div style={{ background: "#F0FFF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 12px" }}>
                  <Lbl><span style={{ color: "#15803D", fontWeight: 700 }}>🔗 Link to Purchase Invoice</span><span style={{ marginLeft: 6, fontSize: 10, color: "#9CA3AF", fontWeight: 400 }}>(required for balance credit)</span></Lbl>
                  <Fs value={rForm.purchase_id ?? ""} onChange={e => setRFld("purchase_id", e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Select Purchase Invoice —</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        #{inv.purchase_number} · {inv.purchase_date} · Rs.{fmt(inv.outstanding_balance)}
                      </option>
                    ))}
                  </Fs>
                </div>
                <div>
                  <Lbl>Game / Ticket *</Lbl>
                  {logoPicker && (
                    <TicketLogoPicker currentValue={rForm.game_name}
                      onSelect={name => { setRFld("game_name", name); setLogoPicker(false); getBatchesForGame(name).then(setBatches).catch(() => setBatches([])); }}
                      onClose={() => setLogoPicker(false)} />
                  )}
                  <button type="button" onClick={() => setLogoPicker(true)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: `1px solid ${rForm.game_name ? "#E5E7EB" : "#EA4335"}`, borderRadius: 8, background: rForm.game_name ? "#F9FAFB" : "#FCE8E6", cursor: "pointer" }}>
                    {rForm.game_name ? (
                      <>
                        <img src={resolveLogoUrl(rForm.game_name)} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 4 }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }}/>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", flex: 1 }}>{rForm.game_name}</span>
                        <span style={{ fontSize: 10, color: "#9CA3AF" }}>click to change</span>
                      </>
                    ) : (
                      <><GalleryAdd size={15} variant="Linear" color="currentColor" style={{ color: "#EA4335" }}/><span style={{ fontSize: 12, color: "#EA4335", fontWeight: 600 }}>Click to select ticket…</span></>
                    )}
                  </button>
                </div>
                {rForm.game_name && batchOptions.length > 0 && (
                  <div>
                    <Lbl>📦 Batch (auto-fills cost price)</Lbl>
                    <div className="flex flex-col gap-2">
                      {batchOptions.map(b => (
                        <button key={b.id} type="button" onClick={() => setRFld("unit_price", b.unit_price)}
                          style={{ padding: "7px 12px", border: `1px solid ${rForm.unit_price === b.unit_price ? "#4285F4" : "#E5E7EB"}`, borderRadius: 8, background: rForm.unit_price === b.unit_price ? "#EFF6FF" : "#F9FAFB", cursor: "pointer", textAlign: "left", fontSize: 11 }}>
                          Batch #{b.id} · {b.batch_date} · Rs.{b.unit_price} · {b.remaining_qty.toLocaleString()} remaining
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div><Lbl>Quantity *</Lbl><Fi type="number" min="0" value={rForm.qty || ""} placeholder="0" onChange={e => setRFld("qty", parseInt(e.target.value)||0)} onFocus={e=>e.target.select()}/></div>
                  <div><Lbl>Unit Price (Rs.)</Lbl><Fi type="number" step="0.01" min="0" value={rForm.unit_price || ""} placeholder="0" onChange={e => setRFld("unit_price", parseFloat(e.target.value)||0)} onFocus={e=>e.target.select()}/></div>
                  <div><Lbl>Total Value</Lbl><div className="w-full rounded-lg px-3 py-2 text-sm font-bold" style={{ border: "1px solid #E8E8E8", background: "#F9F9F9", color: "#16a34a" }}>Rs. {fmt(rForm.total_value)}</div></div>
                </div>
                <div><Lbl>Notes</Lbl><Fi type="text" value={rForm.notes} onChange={e => setRFld("notes", e.target.value)} placeholder="Additional details…"/></div>
                <div className="flex gap-2">
                  <button onClick={handleReturnSave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#4285F4" }}>
                    <Save2 size={13} variant="Linear" color="currentColor"/> {saving ? "Saving…" : "Save Return"}
                  </button>
                  <button onClick={() => { setShowRForm(false); setRForm(emptyReturn()); setBatches([]); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Supplier returns history */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#374151", borderBottom: "2px solid #4285F4" }}>
              <span className="text-sm font-semibold text-white">Ticket Returns Register</span>
              <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{returns.length} records</span>
            </div>
            {loading ? (
              <div className="p-6 text-center text-xs" style={{ color: "#9CA3AF" }}>Loading…</div>
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <EmptyInventory size={60} className="mb-3 opacity-90" />
                <p className="text-sm font-semibold mb-1" style={{ color: "#202124" }}>No Supplier Returns</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                      {["Date","Game","Qty","Value","Status",""].map(h => (
                        <th key={h} className="px-3 py-2 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50/60" style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{fmtDate(r.return_date)}</td>
                        <td className="px-3 py-2 text-xs font-semibold" style={{ color: "#111827" }}>{r.game_name}</td>
                        <td className="px-3 py-2 text-xs text-right" style={{ color: "#1D1D1D" }}>{r.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs text-right font-semibold" style={{ color: "#d97706" }}>Rs.{fmt(r.total_value)}</td>
                        <td className="px-3 py-2">
                          {r.status === "credited"
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#F0FDF4", color: "#16a34a" }}>Credited ✓</span>
                            : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#FFFBEB", color: "#d97706" }}>Pending</span>}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {r.status === "pending" && (
                              <button onClick={() => setConfirm(r)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold hover:opacity-80"
                                style={{ background: "#F0FDF4", color: "#16a34a", border: "1px solid #BBF7D0" }}>
                                <TickCircle size={11} variant="Linear" color="currentColor"/> Apply
                              </button>
                            )}
                            <button onClick={() => handleDeleteReturn(r.id!)}
                              className="p-1.5 rounded-lg hover:opacity-80"
                              style={{ background: "#FCE8E6", color: "#EA4335" }}>
                              <Trash size={11} variant="Linear" color="currentColor"/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 flex justify-end gap-4 text-xs" style={{ background: "#FAFAFA", borderTop: "1px solid #F3F4F6" }}>
                  <span style={{ color: "#9CA3AF" }}>Pending <strong style={{ color: "#d97706" }}>Rs.{fmt(pendingRetVal)}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credit confirmation dialog */}
      {confirmCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div className="rounded-2xl shadow-2xl p-6 mx-4" style={{ background: "#FFFFFF", maxWidth: 380, width: "100%" }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#FCE8E6" }}>
                <Warning2 size={14} variant="Linear" color="currentColor" style={{ color: "#EA4335" }}/>
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Apply Supplier Credit?</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "#6B7280" }}>
                  Reduces inventory by <strong>{confirmCredit.qty.toLocaleString()} units</strong> of <strong>{confirmCredit.game_name}</strong> and credits <strong style={{ color: "#EA4335" }}>Rs.{fmt(confirmCredit.total_value)}</strong> to supplier account.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>Cancel</button>
              <button onClick={confirmCreditAction} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#16a34a" }}>
                <TickCircle size={13} variant="Linear" color="currentColor"/> Apply Credit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT PANEL — Sub-agent Settlement
// ─────────────────────────────────────────────────────────────────────────────

function AgentPanel({ games }: { games: LotteryGame[] }) {
  const { requireAdminPin } = usePinGuardContext();
  const [method,        setMethod]       = useState<"money" | "ticket">("money");
  const [agents,        setAgents]       = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent]= useState<number | "">("");
  const [outstanding,   setOutstanding]  = useState(0);
  const [agentInvoices, setAgentInvoices]= useState<Invoice[]>([]);
  const [payments,      setPayments]     = useState<Payment[]>([]);
  const [returns,       setReturns]      = useState<TicketReturn[]>([]);
  const [summary,       setSummary]      = useState({ pending_qty: 0, pending_value: 0, settled_qty: 0, settled_value: 0 });
  const [loading,       setLoading]      = useState(true);
  const [saving,        setSaving]       = useState(false);
  const [authError,     setAuthError]    = useState<string | null>(null);

  // Money form
  const [mForm, setMForm] = useState<Omit<Payment,"id">>({
    agent_id: 0, payment_date: today(), payment_type: "cash", amount: 0, reference: "", notes: "",
  });
  const [showMForm, setShowMForm] = useState(false);

  // Ticket return form
  const [rForm,         setRForm]      = useState<TicketReturn | null>(null);
  const [showRForm,     setShowRForm]  = useState(false);
  const [logoPicker,    setLogoPicker] = useState(false);
  const [batchOptions,  setBatches]    = useState<Awaited<ReturnType<typeof getBatchesForGame>>>([]);
  const [selectedBatchId, setBatchId] = useState<number | null>(null);
  // Invoice items for original price lookup
  const [invoiceItems,  setInvoiceItems]= useState<InvoiceItem[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("all");

  function emptyReturn(agentId = 0): TicketReturn {
    return { agent_id: agentId, return_date: today(), game_name: "", barcode_start: "", barcode_end: "", qty: 0, unit_price: 32.5, total_value: 0, status: "pending", notes: "", return_reason: "unsold" };
  }

  async function loadAll() {
    setLoading(true);
    const [a, g, s] = await Promise.all([
      getAgents(), Promise.resolve([] as LotteryGame[]), getReturnSummary(),
    ]);
    void g;
    setAgents(a);
    setSummary(s);
    const [ret, pmts] = await Promise.all([getTicketReturns(), getPayments()]);
    setReturns(ret);
    setPayments(pmts);
    setLoading(false);
  }

  async function loadForAgent(agentId: number) {
    const [inv, owed] = await Promise.all([
      getInvoices(["confirmed", "paid"]),
      getAgentLastOutstanding(agentId),
    ]);
    setAgentInvoices(inv.filter(i => i.agent_id === agentId));
    setOutstanding(owed);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadForAgent(Number(selectedAgent));
      setMForm(p => ({ ...p, agent_id: Number(selectedAgent) }));
    } else {
      setAgentInvoices([]);
      setOutstanding(0);
    }
  }, [selectedAgent]);

  // ── Money Settlement ──────────────────────────────────────────────────────

  async function handleMoneySave() {
    if (!mForm.agent_id) { alert("Select an agent."); return; }
    if (mForm.amount <= 0) { alert("Amount must be greater than 0."); return; }
    setSaving(true);
    try {
      await savePayment(mForm as Payment);
      setMForm(p => ({ ...p, amount: 0, reference: "", notes: "" }));
      setShowMForm(false);
      await loadAll();
      if (selectedAgent) await loadForAgent(Number(selectedAgent));
    } catch (e) { alert(`Save failed: ${String(e)}`); }
    finally { setSaving(false); }
  }

  // ── Ticket Return ─────────────────────────────────────────────────────────

  function setRFld(field: keyof TicketReturn, value: string | number) {
    if (!rForm) return;
    const next = { ...rForm, [field]: value };
    // When invoice is selected, load its items for original price lookup
    if (field === "invoice_id" && value) {
      getInvoiceWithItems(Number(value)).then(inv => {
        setInvoiceItems(inv?.items ?? []);
      }).catch(() => setInvoiceItems([]));
    }
    // When game is selected, find original price from invoice items (NOT current game price)
    if (field === "game_name") {
      const item = invoiceItems.find(it => it.ticket_name === String(value));
      if (item) {
        next.unit_price = item.unit_price; // original invoice price
      } else {
        // Fallback to current game price only if no invoice is linked
        if (!next.invoice_id) {
          const g = games.find(x => x.name === String(value));
          if (g) next.unit_price = g.unit_price;
        }
      }
      setBatchId(null); setBatches([]);
      if (String(value).trim()) getBatchesForGame(String(value)).then(setBatches).catch(()=>setBatches([]));
    }
    next.total_value = Math.round(next.qty * next.unit_price * 100) / 100;
    setForm(next);
  }

  function setForm(next: TicketReturn) { setRForm(next); }

  function resetRForm() { setRForm(null); setBatches([]); setBatchId(null); setLogoPicker(false); setInvoiceItems([]); }

  // Validate eligible return qty for the selected invoice+game
  function maxReturnQty(): number {
    if (!rForm?.invoice_id || !rForm.game_name) return Infinity;
    const item = invoiceItems.find(it => it.ticket_name === rForm.game_name);
    if (!item) return Infinity;
    // How many have already been returned (pending or settled) for this invoice+game
    const alreadyReturned = returns
      .filter(r => r.invoice_id === rForm.invoice_id && r.game_name === rForm.game_name)
      .reduce((s, r) => s + r.qty, 0);
    return Math.max(0, item.qty - alreadyReturned);
  }

  async function handleReturnSave() {
    if (!rForm) return;
    if (!rForm.agent_id) { alert("Select an agent."); return; }
    if (!rForm.game_name.trim()) { alert("Game name required."); return; }
    if (rForm.qty <= 0) { alert("Quantity must be > 0."); return; }
    const max = maxReturnQty();
    if (rForm.qty > max && max !== Infinity) {
      alert(`Max eligible return for ${rForm.game_name} on this invoice is ${max} tickets.`);
      return;
    }
    setSaving(true);
    try {
      await saveTicketReturn({ ...rForm, purchase_batch_id: selectedBatchId ?? undefined });
      resetRForm();
      setShowRForm(false);
      await loadAll();
      if (selectedAgent) await loadForAgent(Number(selectedAgent));
    } catch (e) { alert(`Save failed: ${String(e)}`); }
    finally { setSaving(false); }
  }

  async function handleSettle(id: number) {
    if (!confirm("Settle this return? Stock will be restored and agent balance will be credited.")) return;
    setAuthError(null);
    try {
      await settleTicketReturn(id);
      await loadAll();
      if (selectedAgent) await loadForAgent(Number(selectedAgent));
    } catch (e) { setAuthError(`Settle failed: ${String(e)}`); }
  }

  async function handleDeleteReturn(id: number) {
    if (!confirm("Delete this return record?")) return;
    if (!(await requireAdminPin("Delete Agent Return", "Enter the Admin PIN to delete this return."))) return;
    setAuthError(null);
    try {
      await deleteTicketReturn(id);
      await loadAll();
      if (selectedAgent) await loadForAgent(Number(selectedAgent));
    } catch (e) { setAuthError(`Delete failed: ${String(e)}`); }
  }

  const filteredReturns = returns.filter(r => {
    if (selectedAgent && r.agent_id !== Number(selectedAgent)) return false;
    return filter === "all" || r.status === filter;
  });
  const filteredPayments = payments.filter(p => !selectedAgent || p.agent_id === Number(selectedAgent));
  const pendingCount = returns.filter(r => r.status === "pending" && (!selectedAgent || r.agent_id === Number(selectedAgent))).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Panel heading */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight" style={{ color: "#1D1D1D" }}>Sub-agent Settlement</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Sub-agent → Ajith Rohana Enterprises</p>
        </div>
        <button onClick={() => { loadAll(); if (selectedAgent) loadForAgent(Number(selectedAgent)); }} disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
          <Refresh2 size={13} variant="Linear" color="currentColor" className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Agent selector */}
      <div>
        <Lbl>Sub-agent</Lbl>
        <Fs value={selectedAgent} onChange={e => setSelectedAgent(e.target.value ? Number(e.target.value) : "")}>
          <option value="">— All agents —</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Fs>
      </div>

      {/* Outstanding balance */}
      {selectedAgent ? (
        <div className="rounded-xl p-4" style={{ background: outstanding > 0 ? "#FEF2F2" : "#F0FFF4", border: `1px solid ${outstanding > 0 ? "#FECACA" : "#BBF7D0"}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: outstanding > 0 ? "#B91C1C" : "#15803D" }}>
            {agents.find(a => a.id === Number(selectedAgent))?.name} — Outstanding Balance
          </div>
          <div className="text-2xl font-black" style={{ color: outstanding > 0 ? "#EA4335" : "#34A853" }}>
            Rs. {fmt(outstanding)}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Pending Returns" value={summary.pending_qty.toLocaleString()} sub={`Rs.${fmt(summary.pending_value)}`} accent="#d97706" />
          <KpiCard label="Settled Returns" value={summary.settled_qty.toLocaleString()} sub={`Rs.${fmt(summary.settled_value)}`} accent="#16a34a" />
        </div>
      )}

      {/* Auth error */}
      {authError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: "#FCE8E6", border: "1px solid #FECACA", color: "#EA4335" }}>
          <span className="flex-1">{authError}</span>
          <button className="font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      {/* Method selector */}
      <div className="flex gap-2">
        <MethodTab label="Money Payment" icon={<Money4 size={13} variant="Linear" color="currentColor"/>} active={method === "money"} onClick={() => { setMethod("money"); setShowMForm(false); setShowRForm(false); }} />
        <MethodTab label="Ticket Return" icon={<RotateLeft size={13} variant="Linear" color="currentColor"/>} active={method === "ticket"} onClick={() => { setMethod("ticket"); setShowMForm(false); setShowRForm(false); }} />
      </div>

      {/* ── MONEY SETTLEMENT ── */}
      {method === "money" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "#374151" }}>Record cash/cheque from sub-agent</p>
            <button onClick={() => { setShowMForm(v => !v); setMForm(p => ({ ...p, amount: 0, reference: "", notes: "", invoice_id: undefined })); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: showMForm ? "#EA4335" : "#16A34A" }}>
              {showMForm ? <><CloseCircle size={12} variant="Linear" color="currentColor"/> Cancel</> : <><AddCircle size={12} variant="Linear" color="currentColor"/> New Payment</>}
            </button>
          </div>

          {showMForm && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #16A34A" }}>
                <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Money Received from Sub-agent</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Reduces agent outstanding balance</p>
              </div>
              <div className="p-4 space-y-3">
                {!selectedAgent && (
                  <div>
                    <Lbl>Agent *</Lbl>
                    <Fs value={mForm.agent_id || ""} onChange={e => setMForm(p => ({ ...p, agent_id: Number(e.target.value), invoice_id: undefined }))}>
                      <option value="">— Select Agent —</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Fs>
                  </div>
                )}
                <div>
                  <Lbl>🔗 Invoice (optional — links payment to specific invoice)</Lbl>
                  <Fs value={mForm.invoice_id ?? ""} onChange={e => setMForm(p => ({ ...p, invoice_id: e.target.value ? Number(e.target.value) : undefined }))}>
                    <option value="">— None (general payment) —</option>
                    {agentInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        #{inv.invoice_number} · {inv.invoice_date} · Balance: Rs.{fmt(inv.outstanding_balance)}
                      </option>
                    ))}
                  </Fs>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Lbl>Payment Date</Lbl>
                    <Fi type="date" value={mForm.payment_date} onChange={e => setMForm(p => ({ ...p, payment_date: e.target.value }))} />
                  </div>
                  <div>
                    <Lbl>Payment Type</Lbl>
                    <Fs value={mForm.payment_type} onChange={e => setMForm(p => ({ ...p, payment_type: e.target.value as PaymentType }))}>
                      {(Object.keys(AGENT_PMT_LABELS) as PaymentType[]).map(k => (
                        <option key={k} value={k}>{AGENT_PMT_LABELS[k]}</option>
                      ))}
                    </Fs>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Lbl>Amount (Rs.) *</Lbl>
                    <Fi type="number" step="0.01" min="0" value={mForm.amount || ""} placeholder="0.00"
                      onChange={e => setMForm(p => ({ ...p, amount: parseFloat(e.target.value)||0 }))}
                      onFocus={e => e.target.select()} />
                  </div>
                  <div>
                    <Lbl>Reference / Notes</Lbl>
                    <Fi type="text" value={mForm.reference} placeholder="Cheque #, receipt…"
                      onChange={e => setMForm(p => ({ ...p, reference: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleMoneySave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#16A34A" }}>
                    <Save2 size={13} variant="Linear" color="currentColor"/> {saving ? "Saving…" : "Save Payment"}
                  </button>
                  <button onClick={() => setShowMForm(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment history */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-4 py-3" style={{ background: "#374151", borderBottom: "2px solid #16A34A" }}>
              <span className="text-sm font-semibold text-white">Payment History</span>
              <span className="ml-2 text-[11px]" style={{ color: "#9CA3AF" }}>{filteredPayments.length} records</span>
            </div>
            {filteredPayments.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: "#9CA3AF" }}>No payments recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                      {["Date","Agent","Invoice","Type","Amount (Rs.)"].map(h => (
                        <th key={h} className="px-3 py-2 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-2 text-xs font-semibold" style={{ color: "#111827" }}>{p.agent_name ?? agents.find(a=>a.id===p.agent_id)?.name}</td>
                        <td className="px-3 py-2 text-xs">{p.invoice_number ? <span style={{ color: "#2563EB" }}>#{p.invoice_number}</span> : <span style={{ color: "#D1D5DB" }}>—</span>}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#374151" }}>{AGENT_PMT_LABELS[p.payment_type] ?? p.payment_type}</td>
                        <td className="px-3 py-2 text-xs text-right font-semibold" style={{ color: "#16a34a" }}>Rs.{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TICKET RETURN ── */}
      {method === "ticket" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "#374151" }}>Accept ticket returns from sub-agent</p>
            <button onClick={() => { setShowRForm(v => !v); if (!rForm) setRForm(emptyReturn(selectedAgent ? Number(selectedAgent) : 0)); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: showRForm ? "#EA4335" : "#4285F4" }}>
              {showRForm ? <><CloseCircle size={12} variant="Linear" color="currentColor"/> Cancel</> : <><AddCircle size={12} variant="Linear" color="currentColor"/> Record Return</>}
            </button>
          </div>

          {showRForm && rForm && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #4285F4" }}>
                <p className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Ticket Return from Sub-agent</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Original invoice price is used — not current selling price</p>
              </div>
              <div className="p-4 space-y-3">
                {/* Agent + date + reason */}
                <div className="grid grid-cols-2 gap-3">
                  {!selectedAgent && (
                    <div>
                      <Lbl>Agent *</Lbl>
                      <Fs value={rForm.agent_id || ""} onChange={e => setRFld("agent_id", Number(e.target.value))}>
                        <option value="">— Select Agent —</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Fs>
                    </div>
                  )}
                  <div>
                    <Lbl>Return Date</Lbl>
                    <Fi type="date" value={rForm.return_date} onChange={e => setRFld("return_date", e.target.value)} />
                  </div>
                  <div>
                    <Lbl>Return Reason</Lbl>
                    <Fs value={rForm.return_reason ?? "unsold"} onChange={e => setRFld("return_reason", e.target.value)}>
                      {RETURN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Fs>
                  </div>
                </div>

                {/* Invoice — drives original price lookup */}
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 12px" }}>
                  <Lbl><span style={{ color: "#1D4ED8", fontWeight: 700 }}>🔗 Link to Sales Invoice</span><span style={{ marginLeft: 6, fontSize: 10, color: "#9CA3AF", fontWeight: 400 }}>(sets original unit price)</span></Lbl>
                  <Fs value={rForm.invoice_id ?? ""}
                    onChange={e => setRFld("invoice_id", e.target.value ? Number(e.target.value) : "")}>
                    <option value="">— Select Invoice —</option>
                    {agentInvoices
                      .filter(i => !selectedAgent || i.agent_id === Number(selectedAgent))
                      .map(inv => (
                        <option key={inv.id} value={inv.id}>
                          #{inv.invoice_number} · {inv.invoice_date} · Rs.{fmt(inv.invoice_total)}
                        </option>
                      ))}
                  </Fs>
                  {rForm.invoice_id && invoiceItems.length > 0 && (
                    <p className="text-[10px] mt-1" style={{ color: "#2563EB" }}>
                      ✓ Invoice loaded — original prices will be used for return valuation
                    </p>
                  )}
                </div>

                {/* Game picker */}
                <div>
                  <Lbl>
                    Game / Ticket *
                    {rForm.invoice_id && invoiceItems.length > 0 && (
                      <span style={{ marginLeft: 6, color: "#2563EB", fontWeight: 400 }}>
                        (choose from invoice items for original price)
                      </span>
                    )}
                  </Lbl>
                  {logoPicker && (
                    <TicketLogoPicker currentValue={rForm.game_name}
                      onSelect={name => { setRFld("game_name", name); setLogoPicker(false); }}
                      onClose={() => setLogoPicker(false)} />
                  )}
                  {rForm.invoice_id && invoiceItems.length > 0 ? (
                    // Show invoice items as selectable options
                    <div className="flex flex-col gap-2">
                      {invoiceItems.filter(it => it.ticket_name).map((it, i) => {
                        const isSel = rForm.game_name === it.ticket_name;
                        const maxQ  = maxReturnQty();
                        return (
                          <button key={i} type="button"
                            onClick={() => setRFld("game_name", it.ticket_name)}
                            style={{ padding: "8px 12px", border: `2px solid ${isSel ? "#4285F4" : "#E5E7EB"}`, borderRadius: 10, background: isSel ? "#EFF6FF" : "#F9FAFB", cursor: "pointer", textAlign: "left" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img src={resolveLogoUrl(it.ticket_name)} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 4 }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: isSel ? "#1D4ED8" : "#111827" }}>{it.ticket_name}</div>
                                <div style={{ fontSize: 10, color: "#6B7280" }}>
                                  Invoiced: {it.qty} · Original price: Rs.{it.unit_price}
                                  {isSel && maxQ < Infinity && <span style={{ marginLeft: 8, color: "#D97706" }}>Max return: {maxQ}</span>}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setLogoPicker(true)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: `1px solid ${rForm.game_name ? "#E5E7EB" : "#EA4335"}`, borderRadius: 8, background: rForm.game_name ? "#F9FAFB" : "#FCE8E6", cursor: "pointer" }}>
                      {rForm.game_name ? (
                        <><img src={resolveLogoUrl(rForm.game_name)} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 4 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }}/><span style={{ fontSize: 12, fontWeight: 700, color: "#111827", flex: 1 }}>{rForm.game_name}</span><span style={{ fontSize: 10, color: "#9CA3AF" }}>click to change</span></>
                      ) : (
                        <><GalleryAdd size={15} variant="Linear" color="currentColor" style={{ color: "#EA4335" }}/><span style={{ fontSize: 12, color: "#EA4335", fontWeight: 600 }}>Click to select ticket…</span></>
                      )}
                    </button>
                  )}
                </div>

                {/* Batch selector */}
                {rForm.game_name && batchOptions.length > 0 && (
                  <div>
                    <Lbl>📦 Batch (optional — links return to inventory batch)</Lbl>
                    <div className="flex flex-col gap-2">
                      {batchOptions.map(b => {
                        const isSel = selectedBatchId === b.id;
                        return (
                          <button key={b.id} type="button"
                            onClick={() => { setBatchId(b.id); if (!rForm.invoice_id) setRFld("unit_price", b.unit_price); }}
                            style={{ padding: "7px 12px", border: `1px solid ${isSel ? "#4285F4" : "#E5E7EB"}`, borderRadius: 8, background: isSel ? "#EFF6FF" : "#F9FAFB", cursor: "pointer", textAlign: "left", fontSize: 11 }}>
                            Batch #{b.id} · {b.batch_date} · {b.remaining_qty.toLocaleString()} remaining · Rs.{b.unit_price}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Qty + price + total */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Lbl>Quantity *</Lbl>
                    <Fi type="number" min="0" value={rForm.qty || ""} placeholder="0"
                      onChange={e => setRFld("qty", parseInt(e.target.value)||0)} onFocus={e => e.target.select()}
                      style={{ border: `1px solid ${rForm.qty > 0 && maxReturnQty() < Infinity && rForm.qty > maxReturnQty() ? "#EA4335" : "#E8E8E8"}` }}/>
                    {rForm.invoice_id && maxReturnQty() < Infinity && (
                      <p className="text-[9px] mt-0.5" style={{ color: "#6B7280" }}>Max eligible: {maxReturnQty()}</p>
                    )}
                  </div>
                  <div>
                    <Lbl>Unit Price (Rs.) {rForm.invoice_id ? "🔒 original" : ""}</Lbl>
                    <Fi type="number" step="0.01" min="0" value={rForm.unit_price || ""} placeholder="0"
                      readOnly={!!(rForm.invoice_id && invoiceItems.find(it => it.ticket_name === rForm.game_name))}
                      onChange={e => !rForm.invoice_id && setRFld("unit_price", parseFloat(e.target.value)||0)}
                      onFocus={e => e.target.select()}
                      style={{ background: rForm.invoice_id && invoiceItems.find(it=>it.ticket_name===rForm.game_name) ? "#F3F4F6" : "#FAFAFA" }}/>
                  </div>
                  <div>
                    <Lbl>Return Value</Lbl>
                    <div className="w-full rounded-lg px-3 py-2 text-sm font-bold"
                      style={{ border: "1px solid #E8E8E8", background: "#F9F9F9", color: "#16a34a" }}>
                      Rs. {fmt(rForm.total_value)}
                    </div>
                  </div>
                </div>

                <div><Lbl>Notes</Lbl><Fi type="text" value={rForm.notes} onChange={e => setRFld("notes", e.target.value)} placeholder="Additional details…"/></div>

                <div className="flex gap-2">
                  <button onClick={handleReturnSave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#4285F4" }}>
                    <Save2 size={13} variant="Linear" color="currentColor"/> {saving ? "Saving…" : "Save Return"}
                  </button>
                  <button onClick={() => { setShowRForm(false); resetRForm(); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Returns history */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#374151", borderBottom: "2px solid #4285F4" }}>
              <span className="text-sm font-semibold text-white">Agent Returns Register</span>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && filter !== "settled" && (
                  <button onClick={async () => {
                    if (!confirm(`Settle ALL ${pendingCount} pending returns?`)) return;
                    for (const r of returns.filter(x => x.status === "pending" && (!selectedAgent || x.agent_id === Number(selectedAgent)))) {
                      await settleTicketReturn(r.id!).catch(() => {});
                    }
                    await loadAll();
                    if (selectedAgent) await loadForAgent(Number(selectedAgent));
                  }} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
                    style={{ background: "#16a34a", color: "#FFFFFF" }}>
                    <TickCircle size={11} variant="Linear" color="currentColor"/> Settle All ({pendingCount})
                  </button>
                )}
                <div className="flex items-center gap-1">
                  {([["all","All"],["pending",`Pending${pendingCount>0?` (${pendingCount})`:""}`],["settled","Settled"]] as const).map(([k,lbl]) => (
                    <button key={k} onClick={() => setFilter(k)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                      style={filter===k ? { background: "#4285F4", color: "#FFFFFF" } : { background: "#2D2D2D", color: "#9CA3AF" }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {filteredReturns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <People size={44} variant="Linear" color="#E5E7EB" className="mb-3" />
                <p className="text-sm font-semibold mb-1" style={{ color: "#202124" }}>No Agent Returns</p>
                <p className="text-xs" style={{ color: "#9AA0A6" }}>{filter === "all" ? "Returns from agents will appear here." : "Try a different filter."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                      {["Date","Agent","Game","Qty","Value","Status",""].map(h => (
                        <th key={h} className="px-3 py-2 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReturns.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50/60" style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: "#6B7280" }}>{fmtDate(r.return_date)}</td>
                        <td className="px-3 py-2 text-xs font-semibold" style={{ color: "#1D1D1D" }}>{r.agent_name ?? agents.find(a=>a.id===r.agent_id)?.name}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#1D1D1D" }}>{r.game_name}</td>
                        <td className="px-3 py-2 text-xs text-right" style={{ color: "#1D1D1D" }}>{r.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs text-right font-semibold" style={{ color: "#d97706" }}>Rs.{fmt(r.total_value)}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                            style={{ background: r.status === "pending" ? "#d97706" : "#16a34a" }}>
                            {r.status === "pending" ? "Pending" : "Settled"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {r.status === "pending" && (
                              <button onClick={() => handleSettle(r.id!)} title="Settle"
                                className="p-1.5 rounded-lg hover:opacity-80" style={{ background: "#F0FDF4", color: "#16a34a" }}>
                                <TickCircle size={11} variant="Linear" color="currentColor"/>
                              </button>
                            )}
                            <button onClick={() => handleDeleteReturn(r.id!)} title="Delete"
                              className="p-1.5 rounded-lg hover:opacity-80" style={{ background: "#FCE8E6", color: "#EA4335" }}>
                              <Trash size={11} variant="Linear" color="currentColor"/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root page component
// ─────────────────────────────────────────────────────────────────────────────

export default function Settlement() {
  const { t } = useLanguage();
  const [games, setGames] = useState<LotteryGame[]>([]);

  useEffect(() => {
    getLotteryGames().then(setGames).catch(() => {});
  }, []);

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      <div className="flex items-center px-6 pt-4 pb-3">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home2 size={12} variant="Linear" color="currentColor" />
          <ArrowRight2 size={11} variant="Linear" color="currentColor" />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>{t("nav_settlement")}</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 px-6 pb-8">
        <div style={{ borderTop: "3px solid #EA4335", borderRadius: "3px 3px 0 0" }} className="pt-3">
          <SupplierPanel games={games} />
        </div>
        <div style={{ borderTop: "3px solid #4285F4", borderRadius: "3px 3px 0 0" }} className="pt-3">
          <AgentPanel games={games} />
        </div>
      </div>
    </div>
  );
}
