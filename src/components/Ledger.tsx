import { useEffect, useState } from "react";
import { Plus, Trash2, X, Save, RefreshCw, CreditCard, AlertTriangle, Home, ChevronRight, ArrowDownCircle, ShieldAlert } from "lucide-react";
import { getAgents, getPayments, savePayment, deletePayment, getAgentInvoiceLedger } from "../services/database";
import type { Agent, Payment, PaymentType, InvoiceLedgerRow } from "../types";
import { useAuth } from "../contexts/AuthContext";

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "nlb_winning", label: "NLB Winning Ticket" },
  { value: "dlb_winning", label: "DLB Winning Ticket" },
];

const TYPE_COLORS: Record<PaymentType, { bg: string; color: string }> = {
  cash: { bg: "#DCFCE7", color: "#16a34a" },
  cheque: { bg: "#DBEAFE", color: "#2563eb" },
  nlb_winning: { bg: "#F3E8FF", color: "#7c3aed" },
  dlb_winning: { bg: "#FFEDD5", color: "#ea580c" },
};

const SRI_LANKA_BANKS = [
  "Bank of Ceylon", "People's Bank", "Commercial Bank", "Hatton National Bank",
  "Sampath Bank", "Seylan Bank", "Nations Trust Bank", "NDB Bank",
  "DFCC Bank", "Pan Asia Banking Corporation", "Amana Bank", "MCB Bank",
  "Cargills Bank", "State Mortgage Bank", "HDFC Bank", "Sanasa Development Bank",
];

const EMPTY_PAYMENT = (agentId: number): Payment => ({
  agent_id: agentId,
  payment_date: new Date().toISOString().split("T")[0],
  payment_type: "cash",
  amount: 0,
  reference: "",
  notes: "",
  cheque_number: "",
  bank_name: "",
  clearance_date: "",
});

// A split row for multi-mode payment entry
interface PaymentSplit {
  payment_type: PaymentType;
  amount: number;
  cheque_number: string;
  bank_name: string;
  clearance_date: string;
  notes: string;
}

const EMPTY_SPLIT = (): PaymentSplit => ({
  payment_type: "cash", amount: 0,
  cheque_number: "", bank_name: "", clearance_date: "", notes: "",
});

export default function Ledger() {
  const { withAdminToken } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | "">("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ledger, setLedger] = useState<InvoiceLedgerRow[]>([]);
  const [form, setForm] = useState<Payment | null>(null);
  const [splits, setSplits] = useState<PaymentSplit[]>([EMPTY_SPLIT()]);
  const [multiMode, setMultiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"payments" | "invoices">("payments");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {});
  }, []);

  async function loadData(agentId: number) {
    setLoading(true);
    const [p, rows] = await Promise.all([
      getPayments(agentId),
      getAgentInvoiceLedger(agentId),
    ]);
    setPayments(p);
    setLedger(rows);
    setLoading(false);
  }

  function handleAgentChange(id: number) {
    setSelectedAgent(id);
    setForm(null);
    loadData(id);
  }

  async function handleSave() {
    if (!form) return;
    if (multiMode) {
      // Multi-split: save one payment record per split row
      const validSplits = splits.filter(s => s.amount > 0);
      if (!validSplits.length) { alert("Add at least one payment split with amount > 0."); return; }
      for (const split of validSplits) {
        await savePayment({
          ...form,
          payment_type: split.payment_type,
          amount: split.amount,
          cheque_number: split.cheque_number,
          bank_name: split.bank_name,
          clearance_date: split.clearance_date,
          notes: split.notes || form.notes,
        });
      }
    } else {
      if (form.amount <= 0) { alert("Amount must be greater than 0."); return; }
      await savePayment(form);
    }
    setForm(null);
    setSplits([EMPTY_SPLIT()]);
    setMultiMode(false);
    if (selectedAgent) loadData(Number(selectedAgent));
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this payment record?")) return;
    setAuthError(null);
    try {
      await withAdminToken(async () => {
        await deletePayment(id);
        if (selectedAgent) loadData(Number(selectedAgent));
      });
    } catch (err) {
      setAuthError(String(err).includes("session") ? "Admin session required to delete payment records." : String(err));
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalInvoiced = ledger.reduce((s, r) => s + r.invoice_total, 0);
  // Live outstanding = sum of all per-invoice live balances (accounts for post-invoice payments + returns)
  const currentOutstanding = ledger.reduce((s, r) => s + Math.max(0, r.live_balance), 0);
  const lastRow = ledger[0];

  const daysSinceLastInvoice = lastRow
    ? Math.round((Date.now() - new Date(lastRow.invoice_date).getTime()) / 86400000)
    : null;

  const agingBand = daysSinceLastInvoice === null || currentOutstanding <= 0
    ? null
    : daysSinceLastInvoice <= 7
    ? { label: "Current (0–7d)", bg: "#DCFCE7", color: "#16a34a", borderColor: "#16a34a" }
    : daysSinceLastInvoice <= 30
    ? { label: "Overdue 8–30d", bg: "#FEF9C3", color: "#d97706", borderColor: "#d97706" }
    : daysSinceLastInvoice <= 60
    ? { label: "High Risk 31–60d", bg: "#FFEDD5", color: "#ea580c", borderColor: "#ea580c" }
    : { label: "Critical >60d", bg: "#FEE2E2", color: "#CF291D", borderColor: "#CF291D" };

  const agent = agents.find((a) => a.id === Number(selectedAgent));

  const inputStyle = (field: string) => ({
    border: `1px solid ${focusedField === field ? "#CF291D" : "#E8E8E8"}`,
    background: "#FAFAFA",
  });

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Payment Ledger</span>
        </nav>
        <div className="flex gap-2">
          {selectedAgent !== "" && (
            <button
              onClick={() => loadData(Number(selectedAgent))} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          )}
        </div>
      </div>

      {authError && (
        <div className="mx-6 mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#CF291D" }}>
          <ShieldAlert size={14}/> {authError}
          <button className="ml-auto font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      <div className="px-6 pb-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Payment Ledger</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Cash, cheque & winning ticket tracking per agent</p>
          </div>
        </div>

        {/* Agent selector card */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div className="p-5 flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                Select Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => handleAgentChange(Number(e.target.value))}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }}
              >
                <option value="">— Select Agent —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {selectedAgent !== "" && (
              <button
                onClick={() => setForm(EMPTY_PAYMENT(Number(selectedAgent)))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                style={{ background: "#CF291D" }}
              >
                <Plus size={15} /> Record Payment
              </button>
            )}
          </div>
        </div>

        {!selectedAgent ? (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div style={{ padding:"36px 40px", textAlign:"center" }}>
              <CreditCard size={44} className="mx-auto mb-4" style={{ color: "#E8E8E8" }} />
              <p style={{ color:"#6B7280", fontSize:14, fontWeight:600, marginBottom:16 }}>
                Select an agent above to view their ledger.
              </p>
              {/* Sinhala explanation of outstanding balance */}
              <div style={{
                maxWidth:560, margin:"0 auto", padding:"18px 24px",
                background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12,
                textAlign:"left",
              }}>
                <p style={{ fontSize:13, fontWeight:700, color:"#92400E", marginBottom:10 }}>
                  💡 හිඟ ශේෂ ගැන දැනගත යුතු දේ
                </p>
                <p style={{ fontSize:12, color:"#78350F", lineHeight:1.8, marginBottom:8 }}>
                  නියෝජිතයෙකුගේ <strong>හිඟ ශේෂය</strong> (Outstanding Balance) ඇති විය හැකි හේතු:
                </p>
                <ul style={{ fontSize:11, color:"#92400E", lineHeight:2, paddingLeft:18, margin:0 }}>
                  <li>📦 නිකුත් කළ ටිකට් සඳහා සම්පූර්ණ මුදල් ගෙවා නොමැති නිසා</li>
                  <li>💰 බෙදාහැරීමේදී ලැබූ මුදල ප්‍රමාණවත් නොවීම</li>
                  <li>↩ ටිකට් ආපසු ලැබ නොතිබීම (Agent Return pending)</li>
                  <li>🏆 NLB / DLB ජයග්‍රාහී ටිකට් ණය ලෙස ශේෂ ගත වී ඇත</li>
                  <li>📋 පෙර ඉන්වොයිස් වල හිඟ ශේෂ ඉදිරියට ගෙන ගිය නිසා</li>
                </ul>
                <p style={{ fontSize:11, color:"#92400E", marginTop:10, fontStyle:"italic" }}>
                  නියෝජිතයෙකු තේරීමෙන් ඔවුන්ගේ සම්පූර්ණ ගෙවීම් ඉතිහාසය, ශේෂ හා ඉන්වොයිස් ලේජරය බැලිය හැක.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Summary metric cards */}
            <div className="grid grid-cols-3 gap-4">
              {/* Total Invoiced */}
              <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #2563eb" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Total Invoiced</p>
                <p className="text-2xl font-black" style={{ color: "#1D1D1D" }}>Rs. {fmt(totalInvoiced)}</p>
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>{ledger.length} invoice{ledger.length !== 1 ? "s" : ""}</p>
              </div>
              {/* Payments Recorded */}
              <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #16a34a" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Payments Recorded</p>
                <p className="text-2xl font-black" style={{ color: "#16a34a" }}>Rs. {fmt(totalPaid)}</p>
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>{payments.length} record{payments.length !== 1 ? "s" : ""}</p>
              </div>
              {/* Current Outstanding */}
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E8",
                  borderTop: `3px solid ${currentOutstanding <= 0 ? "#16a34a" : agingBand?.borderColor ?? "#CF291D"}`,
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Current Outstanding</p>
                    <p className="text-2xl font-black" style={{ color: currentOutstanding > 0 ? "#CF291D" : "#16a34a" }}>
                      Rs. {fmt(currentOutstanding)}
                    </p>
                    {agent && (
                      <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                        {agent.nlb_reg && `NLB: ${agent.nlb_reg}`}
                        {agent.dlb_reg && ` / DLB: ${agent.dlb_reg}`}
                      </p>
                    )}
                    {daysSinceLastInvoice !== null && currentOutstanding > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                        Last invoice: {daysSinceLastInvoice}d ago
                      </p>
                    )}
                  </div>
                  {agingBand && (
                    <span
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: agingBand.bg, color: agingBand.color }}
                    >
                      <AlertTriangle size={10} /> {agingBand.label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Add payment form */}
            {form && (
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold" style={{ color: "#1D1D1D" }}>Record Payment</h2>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setMultiMode(m => !m); setSplits([EMPTY_SPLIT()]); }}
                        className="text-xs px-3 py-1 rounded-lg font-semibold transition-all"
                        style={{ background: multiMode ? "#CF291D" : "#F3F4F6",
                          color: multiMode ? "#fff" : "#6B7280" }}>
                        {multiMode ? "Multi-Split ON" : "Split Payment"}
                      </button>
                      <button onClick={() => { setForm(null); setMultiMode(false); setSplits([EMPTY_SPLIT()]); }}
                        className="p-1 rounded" style={{ color: "#9CA3AF" }}>
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  {/* Shared fields: date, invoice link, notes */}
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-4">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Date</label>
                      <input type="date" value={form.payment_date}
                        onChange={e => setForm({ ...form, payment_date: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={inputStyle("date")} onFocus={() => setFocusedField("date")} onBlur={() => setFocusedField(null)}/>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Linked Invoice</label>
                      <select value={form.invoice_id ?? ""}
                        onChange={e => setForm({ ...form, invoice_id: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={inputStyle("invoice")} onFocus={() => setFocusedField("invoice")} onBlur={() => setFocusedField(null)}>
                        <option value="">— None —</option>
                        {ledger.map(r => (
                          <option key={r.invoice_id} value={r.invoice_id}>
                            #{r.invoice_number} ({fmtDate(r.invoice_date)}) — Bal: Rs.{fmt(Math.max(0,r.live_balance))}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Notes</label>
                      <input type="text" value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        placeholder="Optional…" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={inputStyle("notes")} onFocus={() => setFocusedField("notes")} onBlur={() => setFocusedField(null)}/>
                    </div>
                  </div>

                  {/* Single payment mode */}
                  {!multiMode && (
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 p-4 rounded-xl" style={{ background:"#F9F9F9", border:"1px solid #E8E8E8" }}>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Type</label>
                        <select value={form.payment_type}
                          onChange={e => setForm({ ...form, payment_type: e.target.value as PaymentType })}
                          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                          style={inputStyle("type")} onFocus={() => setFocusedField("type")} onBlur={() => setFocusedField(null)}>
                          {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Amount (Rs.)</label>
                        <input type="number" step="0.01" value={form.amount || ""}
                          placeholder="0"
                          onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg px-3 py-2 text-sm font-bold focus:outline-none"
                          style={{ ...inputStyle("amount"), color:"#16a34a" }}
                          onFocus={(e) => { e.target.select(); setFocusedField("amount"); }} onBlur={() => setFocusedField(null)}/>
                      </div>
                      {form.payment_type === "cheque" && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Cheque No.</label>
                            <input type="text" value={form.cheque_number ?? ""}
                              onChange={e => setForm({ ...form, cheque_number: e.target.value })}
                              placeholder="e.g. CHQ-12345" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                              style={inputStyle("chqno")} onFocus={() => setFocusedField("chqno")} onBlur={() => setFocusedField(null)}/>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Bank</label>
                            <select value={form.bank_name ?? ""}
                              onChange={e => setForm({ ...form, bank_name: e.target.value })}
                              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                              style={inputStyle("bank")} onFocus={() => setFocusedField("bank")} onBlur={() => setFocusedField(null)}>
                              <option value="">— Select Bank —</option>
                              {SRI_LANKA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Clearance Date</label>
                            <input type="date" value={form.clearance_date ?? ""}
                              onChange={e => setForm({ ...form, clearance_date: e.target.value })}
                              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                              style={inputStyle("clrd")} onFocus={() => setFocusedField("clrd")} onBlur={() => setFocusedField(null)}/>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Multi-split mode */}
                  {multiMode && (
                    <div className="rounded-xl overflow-hidden" style={{ border:"1px solid #E8E8E8" }}>
                      <div className="px-4 py-2 flex items-center justify-between" style={{ background:"#374151" }}>
                        <span className="text-xs font-bold text-white">Payment Splits</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]" style={{ color:"#9CA3AF" }}>
                            Total: Rs. {fmt(splits.reduce((s,x)=>s+x.amount,0))}
                          </span>
                          <button onClick={() => setSplits(s => [...s, EMPTY_SPLIT()])}
                            className="text-[10px] px-2 py-0.5 rounded font-bold"
                            style={{ background:"#CF291D", color:"#fff" }}>+ Row</button>
                        </div>
                      </div>
                      {splits.map((split, si) => (
                        <div key={si} className="p-3 grid grid-cols-2 gap-3 lg:grid-cols-5"
                          style={{ borderTop: si > 0 ? "1px solid #F3F4F6" : undefined, background: si%2===0?"#FAFAFA":"#FFFFFF" }}>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Type</label>
                            <select value={split.payment_type}
                              onChange={e => setSplits(s => s.map((x,i)=>i===si?{...x,payment_type:e.target.value as PaymentType}:x))}
                              className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                              style={{ border:"1px solid #E8E8E8", background:"#fff" }}>
                              {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Amount (Rs.)</label>
                            <input type="number" step="0.01" value={split.amount || ""}
                              onChange={e => setSplits(s => s.map((x,i)=>i===si?{...x,amount:parseFloat(e.target.value)||0}:x))}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none"
                              style={{ border:"1px solid #E8E8E8", background:"#fff", color:"#16a34a" }}/>
                          </div>
                          {split.payment_type === "cheque" && (
                            <>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Cheque No.</label>
                                <input type="text" value={split.cheque_number}
                                  onChange={e => setSplits(s => s.map((x,i)=>i===si?{...x,cheque_number:e.target.value}:x))}
                                  placeholder="CHQ-12345" className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                                  style={{ border:"1px solid #E8E8E8", background:"#fff" }}/>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>Bank</label>
                                <select value={split.bank_name}
                                  onChange={e => setSplits(s => s.map((x,i)=>i===si?{...x,bank_name:e.target.value}:x))}
                                  className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                                  style={{ border:"1px solid #E8E8E8", background:"#fff" }}>
                                  <option value="">— Bank —</option>
                                  {SRI_LANKA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                              </div>
                            </>
                          )}
                          <div className="flex items-end">
                            {splits.length > 1 && (
                              <button onClick={() => setSplits(s => s.filter((_,i) => i !== si))}
                                className="p-1.5 rounded" style={{ color:"#CF291D" }}>
                                <X size={12}/>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 mt-5">
                    <button onClick={handleSave}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                      style={{ background: "#CF291D" }}>
                      <Save size={14} /> Save Payment
                    </button>
                    <button
                      onClick={() => setForm(null)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                      style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab pills */}
            <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#F3F4F6" }}>
              {(["payments", "invoices"] as const).map((t) => {
                const active = activeTab === t;
                const label = t === "payments" ? `Payments (${payments.length})` : `Invoice History (${ledger.length})`;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: active ? "#FFFFFF" : "transparent",
                      color: active ? "#1D1D1D" : "#9CA3AF",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Payments table */}
            {activeTab === "payments" && (
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="px-5 py-3" style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
                  <span className="text-sm font-semibold text-white">Payment History</span>
                </div>
                {loading ? (
                  <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
                ) : payments.length === 0 ? (
                  <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>No payment records yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: "1px solid #F9F9F9" }}>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Type</th>
                          <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Amount (Rs.)</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Linked Invoice</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Reference</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Notes</th>
                          <th className="px-4 py-3 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => {
                          const tc = TYPE_COLORS[p.payment_type];
                          return (
                            <tr key={p.id} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                              <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{fmtDate(p.payment_date)}</td>
                              <td className="px-4 py-3">
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tc.bg, color: tc.color }}>
                                  {PAYMENT_TYPES.find((t) => t.value === p.payment_type)?.label ?? p.payment_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#16a34a" }}>{fmt(p.amount)}</td>
                              <td className="px-4 py-3 text-sm font-mono" style={{ color: "#2563eb" }}>{p.invoice_number ? `#${p.invoice_number}` : "—"}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{p.reference || "—"}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: "#9CA3AF" }}>{p.notes || "—"}</td>
                              <td className="px-3 py-3">
                                <button
                                  onClick={() => handleDelete(p.id!)}
                                  className="p-1.5 rounded-lg"
                                  style={{ background: "#FFF1F0", color: "#CF291D" }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                          <td colSpan={2} className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: "#9CA3AF" }}>Total</td>
                          <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>Rs. {fmt(totalPaid)}</td>
                          <td colSpan={4}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Invoice history table — live balance per invoice */}
            {activeTab === "invoices" && (
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="px-5 py-3 flex items-center justify-between" style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
                  <span className="text-sm font-semibold text-white">Invoice Ledger — Live Balances</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background:"rgba(255,255,255,0.15)", color:"#fff" }}>
                    Includes post-invoice payments &amp; return credits
                  </span>
                </div>
                {loading ? (
                  <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
                ) : ledger.length === 0 ? (
                  <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>No invoices found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ background:"#F9F9F9", borderBottom: "1px solid #F0F0F0" }}>
                          {["Invoice #","Date","Total","At Delivery","Post Payments","Return Credits","Live Balance","Status"].map(h => (
                            <th key={h} className={`px-4 py-3 ${h==="Invoice #"||h==="Date"||h==="Status"?"text-left":"text-right"}`}
                              style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((row) => {
                          const live = Math.max(0, row.live_balance);
                          const days = Math.round((Date.now() - new Date(row.invoice_date).getTime()) / 86400000);
                          const status =
                            live <= 0.005
                              ? { label: "Settled", bg: "#DCFCE7", color: "#16a34a" }
                              : days <= 7
                              ? { label: "Current", bg: "#DCFCE7", color: "#16a34a" }
                              : days <= 30
                              ? { label: "Overdue", bg: "#FEF9C3", color: "#d97706" }
                              : days <= 60
                              ? { label: "High Risk", bg: "#FFEDD5", color: "#ea580c" }
                              : { label: "Critical", bg: "#FEE2E2", color: "#CF291D" };
                          const atDelivery = row.cash_received + row.dlb_winning + row.nlb_winning;
                          return (
                            <tr key={row.invoice_id} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                              <td className="px-4 py-3 text-sm font-mono font-medium" style={{ color: "#2563eb" }}>#{row.invoice_number}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{fmtDate(row.invoice_date)}</td>
                              <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>{fmt(row.total_payable)}</td>
                              <td className="px-4 py-3 text-sm text-right" style={{ color: "#16a34a" }}>{fmt(atDelivery)}</td>
                              <td className="px-4 py-3 text-sm text-right" style={{ color: row.post_payments > 0 ? "#2563eb" : "#D1D5DB" }}>
                                {row.post_payments > 0 ? <><ArrowDownCircle size={11} className="inline mr-1"/>{fmt(row.post_payments)}</> : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm text-right" style={{ color: row.settled_returns > 0 ? "#7c3aed" : "#D1D5DB" }}>
                                {row.settled_returns > 0 ? fmt(row.settled_returns) : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: live > 0 ? "#CF291D" : "#16a34a" }}>
                                {fmt(live)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: status.bg, color: status.color }}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                          <td colSpan={6} className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: "#9CA3AF" }}>Total Live Outstanding</td>
                          <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: currentOutstanding > 0 ? "#CF291D" : "#4ade80" }}>
                            Rs. {fmt(currentOutstanding)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
