import { useEffect, useState } from "react";
import {
  Home, ChevronRight, Plus, Trash2, Pencil, Save,
  TrendingUp, TrendingDown, Wallet, AlertTriangle, CheckCircle, RefreshCw,
} from "lucide-react";
import {
  getPettyCashTransactions, addPettyCashTransaction, updatePettyCashTransaction,
  deletePettyCashTransaction, getPettyCashClosing, savePettyCashClosing,
  getDailyIncome, type PettyCashTx, type PettyCashClosing,
} from "../services/database";
import { SI, StatLabel, SectionLabel } from "../utils/si";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Salary / Wages",
  "Home / Personal",
  "Utility / Shop Expense",
  "Transport",
  "Office Supplies",
  "Maintenance / Repair",
  "Food / Refreshments",
  "Other",
];

/** Category dropdown option showing English + Sinhala */
function CatOption({ cat }: { cat: string }) {
  const si = (SI as Record<string, string>)[cat];
  return <option value={cat}>{cat}{si ? ` · ${si}` : ""}</option>;
}

const today = () => new Date().toISOString().split("T")[0];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtTime = (ts: string) => {
  try {
    const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
    return d.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
  } catch { return ts?.slice(11, 16) ?? ""; }
};

// ── Empty state helpers ────────────────────────────────────────────────────────

const EMPTY_TX = (date: string): Omit<PettyCashTx, "id"> => ({
  date, category: CATEGORIES[0], amount: 0, reason: "",
});

const EMPTY_CLOSING = (date: string): PettyCashClosing => ({
  date, opening_balance: 0, actual_cash: 0, notes: "", is_closed: 0,
});

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PettyCash() {
  const [date, setDate]             = useState(today());
  const [txs, setTxs]               = useState<PettyCashTx[]>([]);
  const [income, setIncome]         = useState({ invoice_cash: 0, post_payments: 0, daily_collections: 0, total: 0 });
  const [closing, setClosing]       = useState<PettyCashClosing>(EMPTY_CLOSING(today()));
  const [loading, setLoading]       = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [editTx, setEditTx]         = useState<PettyCashTx | null>(null);
  const [form, setForm]             = useState<Omit<PettyCashTx, "id">>(EMPTY_TX(today()));
  const [saving, setSaving]         = useState(false);
  const [closingSaving, setCSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [t, inc, cl] = await Promise.all([
        getPettyCashTransactions(date),
        getDailyIncome(date),
        getPettyCashClosing(date),
      ]);
      setTxs(t);
      setIncome(inc);
      setClosing(cl ?? EMPTY_CLOSING(date));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [date]);

  // ── Derived totals ───────────────────────────────────────────────────────────
  const totalOutflow  = txs.reduce((s, t) => s + t.amount, 0);
  const expectedCash  = closing.opening_balance + income.total - totalOutflow;
  const discrepancy   = closing.actual_cash - expectedCash;
  const isBalanced    = Math.abs(discrepancy) < 0.01;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openAdd() {
    setForm(EMPTY_TX(date));
    setEditTx(null);
    setShowForm(true);
  }

  function openEdit(tx: PettyCashTx) {
    setForm({ date: tx.date, category: tx.category, amount: tx.amount, reason: tx.reason });
    setEditTx(tx);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.reason.trim()) { alert("Please enter a reason."); return; }
    if (form.amount <= 0)    { alert("Amount must be greater than 0."); return; }
    setSaving(true);
    try {
      if (editTx?.id) {
        await updatePettyCashTransaction({ ...form, id: editTx.id });
      } else {
        await addPettyCashTransaction(form);
      }
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this expense record?")) return;
    await deletePettyCashTransaction(id);
    load();
  }

  async function handleCloseDay() {
    if (!confirm("Save today's petty cash closing? This locks the day's reconciliation.")) return;
    setCSaving(true);
    try {
      await savePettyCashClosing({ ...closing, is_closed: 1, date });
      setClosing(prev => ({ ...prev, is_closed: 1, date }));
      await load();
    } finally { setCSaving(false); }
  }

  async function handleSaveOpening() {
    await savePettyCashClosing({ ...closing, date });
    load();
  }

  const isClosed = closing.is_closed === 1;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>

      {/* Add / Edit modal */}
      {showForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(3px)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#fff", borderRadius:16, width:"min(480px,100%)", boxShadow:"0 20px 60px rgba(0,0,0,0.3)", overflow:"hidden" }}>
            {/* Header */}
            <div style={{ padding:"14px 20px", background:"linear-gradient(135deg,#0F172A,#1E293B)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#F1F5F9" }}>
                {editTx ? "✏️ Edit Expense" : "➕ Add Cash Outflow"}
              </span>
              <button onClick={() => setShowForm(false)} style={{ border:"none", background:"rgba(255,255,255,0.1)", color:"#94A3B8", cursor:"pointer", borderRadius:6, width:28, height:28, fontSize:16 }}>×</button>
            </div>
            {/* Form */}
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", display:"block", marginBottom:4 }}>
                  Category <span className="si" style={{ fontWeight:400, color:"#9CA3AF" }}>· {SI.category}</span>
                </label>
                <select value={form.category} onChange={e => setForm(p=>({...p, category:e.target.value}))}
                  style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:13, background:"#FAFAFA", color:"#1D1D1D", outline:"none" }}
                  onFocus={e => e.currentTarget.style.borderColor="#CF291D"}
                  onBlur={e => e.currentTarget.style.borderColor="#E5E7EB"}>
                  {CATEGORIES.map(c => <CatOption key={c} cat={c} />)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", display:"block", marginBottom:4 }}>
                  Amount (Rs.) <span className="si" style={{ fontWeight:400, color:"#9CA3AF" }}>· {SI.amount}</span>
                </label>
                <input type="number" min="0" step="0.01" value={form.amount || ""}
                  onChange={e => setForm(p=>({...p, amount:parseFloat(e.target.value)||0}))}
                  onFocus={e => e.target.select()}
                  style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:14, fontWeight:700, background:"#FAFAFA", color:"#1D1D1D", outline:"none" }}
                  onFocusCapture={e => e.currentTarget.style.borderColor="#CF291D"}
                  onBlurCapture={e => e.currentTarget.style.borderColor="#E5E7EB"}
                  placeholder="0.00"
                  autoFocus />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", display:"block", marginBottom:4 }}>
                  Reason / Description * <span className="si" style={{ fontWeight:400, color:"#9CA3AF" }}>· {SI.reason}</span>
                </label>
                <textarea rows={2} value={form.reason}
                  onChange={e => setForm(p=>({...p, reason:e.target.value}))}
                  onKeyDown={e => { if (e.key==="Enter" && e.ctrlKey) handleSave(); }}
                  style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:13, background:"#FAFAFA", color:"#1D1D1D", outline:"none", resize:"none", fontFamily:"inherit" }}
                  onFocus={e => e.currentTarget.style.borderColor="#CF291D"}
                  onBlur={e => e.currentTarget.style.borderColor="#E5E7EB"}
                  placeholder='e.g. "Paid salary to helper Kumar"' />
                <span style={{ fontSize:10, color:"#9CA3AF" }}>Ctrl+Enter to save</span>
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4, borderTop:"1px solid #F3F4F6" }}>
                <button onClick={() => setShowForm(false)}
                  style={{ padding:"8px 18px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", color:"#6B7280", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"#CF291D", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", opacity:saving?0.6:1 }}>
                  <Save size={13} style={{ display:"inline", marginRight:4 }}/>
                  {saving ? "Saving…" : editTx ? "Update" : "Add Expense"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color:"#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span style={{ color:"#1D1D1D", fontWeight:600 }}>Petty Cash</span>
        </nav>
      </div>

      <div className="px-6 pb-8 space-y-5">
        {/* Page header + date picker */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color:"#1D1D1D" }}>
              <Wallet size={22} style={{ display:"inline", marginRight:8, verticalAlign:"middle" }}/>
              Petty Cash
            </h1>
            <p className="text-xs mt-0.5" style={{ color:"#9CA3AF" }}>
              Daily cash flow · income vs expenses · drawer reconciliation
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input type="date" value={date}
              onChange={e => setDate(e.target.value)}
              style={{ padding:"7px 12px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:13, background:"#fff", color:"#1D1D1D" }}/>
            {date !== today() && (
              <button onClick={() => setDate(today())}
                style={{ padding:"7px 12px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, background:"#fff", color:"#6B7280", cursor:"pointer" }}>
                Today
              </button>
            )}
            <button onClick={load} disabled={loading}
              style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", color:"#6B7280", cursor:"pointer" }}>
              <RefreshCw size={13} className={loading?"animate-spin":""}/>
            </button>
          </div>
        </div>

        {/* Closed banner */}
        {isClosed && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:"#F0FFF4", border:"1px solid #BBF7D0", borderRadius:10, fontSize:12, color:"#16A34A", fontWeight:600 }}>
            <CheckCircle size={15}/> This day is closed and reconciled. Records are locked.
          </div>
        )}

        {/* ── Summary cards ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:12 }}>
          {[
            { en:"Opening Balance", si:SI.openingBalance, value: closing.opening_balance, color:"#6B7280",  icon:<Wallet size={16}/> },
            { en:"Daily Income",    si:SI.dailyIncome,    value: income.total,            color:"#2563EB",  icon:<TrendingUp size={16}/> },
            { en:"Total Outflows",  si:SI.cashOutflows,   value: totalOutflow,            color:"#CF291D",  icon:<TrendingDown size={16}/> },
            { en:"Expected in Drawer", si:SI.expectedCash, value: expectedCash,           color:"#D97706",  icon:<Wallet size={16}/> },
            {
              en: isBalanced ? "✓ Balanced" : "Discrepancy",
              si: isBalanced ? SI.balanced : SI.variance,
              value: Math.abs(discrepancy),
              color: isBalanced ? "#16A34A" : "#CF291D",
              icon: isBalanced ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>,
              sub: !isBalanced ? (discrepancy > 0 ? `Rs. ${fmt(discrepancy)} over / ${SI.cashOver}` : `Rs. ${fmt(-discrepancy)} short / ${SI.cashShort}`) : "All balanced",
            },
          ].map((c, i) => (
            <div key={i} style={{ background:"#fff", borderRadius:12, padding:"14px 16px",
              border:"1px solid #E8E8E8", borderTop:`3px solid ${c.color}`,
              boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <span style={{ color:c.color }}>{c.icon}</span>
                <StatLabel en={c.en} si={c.si} />
              </div>
              <div style={{ fontSize:18, fontWeight:900, color:c.color }}>Rs. {fmt(c.value)}</div>
              {c.sub && <div style={{ fontSize:10, color:"#9CA3AF", marginTop:3 }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16, alignItems:"start" }}>

          {/* ── LEFT: Income breakdown + Outflows table ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Income breakdown */}
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8E8E8", overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #F3F4F6", borderLeft:"3px solid #2563EB", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>
                  <TrendingUp size={14} style={{ display:"inline", marginRight:6, color:"#2563EB", verticalAlign:"middle" }}/>
                  <SectionLabel en={`Cash Income — ${date}`} si={`${SI.dailyIncome} — ${date}`} />
                </span>
                <span style={{ fontSize:12, fontWeight:800, color:"#2563EB" }}>Rs. {fmt(income.total)}</span>
              </div>
              <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
                {[
                  { label:"Invoice Cash (Delivery)",     si:"ඉන්වොයිස් ගෙවීම",    value: income.invoice_cash,       color:"#2563EB" },
                  { label:"Post-Delivery Cash Payments", si:"පසු ගෙවීම්",           value: income.post_payments,      color:"#7C3AED" },
                  { label:"Daily Collections",           si:SI.dailyCollections,    value: income.daily_collections,  color:"#059669" },
                ].map(row => (
                  <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"#F9FAFB", borderRadius:8 }}>
                    <span style={{ fontSize:12, color:"#374151" }}>
                      {row.label}
                      <span className="si" style={{ display:"block", fontSize:9, color:"#9CA3AF" }}>{row.si}</span>
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color: row.value > 0 ? row.color : "#9CA3AF" }}>
                      Rs. {fmt(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Outflows table */}
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8E8E8", overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #F3F4F6", borderLeft:"3px solid #CF291D", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>
                  <TrendingDown size={14} style={{ display:"inline", marginRight:6, color:"#CF291D", verticalAlign:"middle" }}/>
                  <SectionLabel en="Cash Outflows / Expenses" si={`${SI.cashOutflows} / ${SI.expenses}`} />
                </span>
                {!isClosed && (
                  <button onClick={openAdd}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, border:"none", background:"#CF291D", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13}/> Add Expense
                    <span className="si" style={{ fontSize:10, fontWeight:400 }}>· {SI.addExpense}</span>
                  </button>
                )}
              </div>
              {txs.length === 0 ? (
                <div style={{ padding:"32px", textAlign:"center", color:"#9CA3AF", fontSize:13 }}>
                  No expenses recorded for {date}
                </div>
              ) : (
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#374151" }}>
                      {["Time","Category","Reason","Amount",""].map(h => (
                        <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:9, fontWeight:700,
                          color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx, i) => (
                      <tr key={tx.id} style={{ background:i%2===0?"#fff":"#F9FAFB", borderBottom:"1px solid #F3F4F6" }}>
                        <td style={{ padding:"8px 12px", fontSize:11, color:"#6B7280", whiteSpace:"nowrap" }}>
                          {fmtTime(tx.created_at ?? "")}
                        </td>
                        <td style={{ padding:"8px 12px", fontSize:11, fontWeight:600, color:"#374151" }}>
                          <span style={{ padding:"2px 8px", borderRadius:20, background:"#FEF2F2", color:"#CF291D", fontSize:10, fontWeight:700 }}>
                            {tx.category}
                          </span>
                        </td>
                        <td style={{ padding:"8px 12px", fontSize:12, color:"#1D1D1D" }}>{tx.reason}</td>
                        <td style={{ padding:"8px 12px", fontSize:13, fontWeight:800, color:"#CF291D", whiteSpace:"nowrap" }}>
                          Rs. {fmt(tx.amount)}
                        </td>
                        <td style={{ padding:"8px 8px", whiteSpace:"nowrap" }}>
                          {!isClosed && (
                            <div style={{ display:"flex", gap:4 }}>
                              <button onClick={() => openEdit(tx)}
                                style={{ border:"none", background:"#EFF6FF", color:"#2563EB", cursor:"pointer", borderRadius:6, padding:"4px 7px" }}>
                                <Pencil size={12}/>
                              </button>
                              <button onClick={() => handleDelete(tx.id!)}
                                style={{ border:"none", background:"#FEF2F2", color:"#CF291D", cursor:"pointer", borderRadius:6, padding:"4px 7px" }}>
                                <Trash2 size={12}/>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:"#1D1D1D" }}>
                      <td colSpan={3} style={{ padding:"8px 12px", fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase" }}>
                        Total Outflows
                      </td>
                      <td style={{ padding:"8px 12px", fontSize:14, fontWeight:900, color:"#CF291D" }}>
                        Rs. {fmt(totalOutflow)}
                      </td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* ── RIGHT: Reconciliation panel ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Opening balance */}
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8E8E8", overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", borderBottom:"1px solid #F3F4F6", borderLeft:"3px solid #6B7280" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:0 }}>
                  Opening Balance <span className="si" style={{ fontSize:11, fontWeight:400, color:"#9CA3AF" }}>· {SI.openingBalance}</span>
                </p>
                <p style={{ fontSize:10, color:"#9CA3AF", marginTop:2 }}>
                  Cash available at start of day / <span className="si">දිනය ආරම්භයේ ලැබෙන මුදල</span>
                </p>
              </div>
              <div style={{ padding:"12px 14px", display:"flex", gap:8 }}>
                <input type="number" min="0" step="0.01"
                  value={closing.opening_balance || ""}
                  onChange={e => setClosing(p=>({...p, opening_balance: parseFloat(e.target.value)||0}))}
                  onFocus={e => e.target.select()}
                  disabled={isClosed}
                  style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:14, fontWeight:700, color:"#374151", background: isClosed?"#F9FAFB":"#fff", outline:"none" }}
                  placeholder="0.00"/>
                {!isClosed && (
                  <button onClick={handleSaveOpening}
                    style={{ padding:"8px 10px", borderRadius:8, border:"none", background:"#374151", color:"#fff", cursor:"pointer", fontSize:12 }}>
                    <Save size={13}/>
                  </button>
                )}
              </div>
            </div>

            {/* Physical cash count */}
            <div style={{ background:"#fff", borderRadius:12, border:`2px solid ${isBalanced&&closing.actual_cash>0?"#BBF7D0":"#E8E8E8"}`, overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", borderBottom:"1px solid #F3F4F6", borderLeft:"3px solid #D97706" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:0 }}>
                  Physical Cash Count <span className="si" style={{ fontSize:11, fontWeight:400, color:"#9CA3AF" }}>· {SI.physicalCashCount}</span>
                </p>
                <p style={{ fontSize:10, color:"#9CA3AF", marginTop:2 }}>
                  Count cash in drawer and enter below / <span className="si">ලෙස ගණන් කරන්න</span>
                </p>
              </div>
              <div style={{ padding:"12px 14px" }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", display:"block", marginBottom:6 }}>
                  ACTUAL CASH IN DRAWER (Rs.) · <span className="si">{SI.actualCash}</span>
                </label>
                <input type="number" min="0" step="0.01"
                  value={closing.actual_cash || ""}
                  onChange={e => setClosing(p=>({...p, actual_cash: parseFloat(e.target.value)||0}))}
                  onFocus={e => e.target.select()}
                  disabled={isClosed}
                  style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"2px solid #D97706", fontSize:16, fontWeight:800, color:"#374151", background: isClosed?"#F9FAFB":"#FFFBEB", outline:"none" }}
                  placeholder="0.00"/>

                {/* Variance display */}
                {closing.actual_cash > 0 && (
                  <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8,
                    background: isBalanced ? "#F0FFF4" : "#FEF2F2",
                    border:`1px solid ${isBalanced?"#BBF7D0":"#FECACA"}` }}>
                    <div style={{ fontSize:10, color:"#6B7280", marginBottom:3 }}>VARIANCE (Actual − Expected)</div>
                    <div style={{ fontSize:16, fontWeight:900, color: isBalanced?"#16A34A":"#CF291D" }}>
                      {discrepancy >= 0 ? "+" : ""}Rs. {fmt(discrepancy)}
                    </div>
                    <div style={{ fontSize:10, color: isBalanced?"#16A34A":"#CF291D", marginTop:2 }}>
                      {isBalanced ? "✓ Perfectly balanced" : discrepancy > 0 ? "Cash over (possible unrecorded income)" : "Cash short (possible unrecorded expense)"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8E8E8", overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", borderBottom:"1px solid #F3F4F6" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:0 }}>
                  Day Notes <span className="si" style={{ fontSize:11, fontWeight:400, color:"#9CA3AF" }}>· {SI.dayNotes}</span>
                </p>
              </div>
              <div style={{ padding:"12px 14px" }}>
                <textarea rows={3} value={closing.notes}
                  onChange={e => setClosing(p=>({...p, notes:e.target.value}))}
                  disabled={isClosed}
                  style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#374151", background: isClosed?"#F9FAFB":"#fff", resize:"none", outline:"none", fontFamily:"inherit" }}
                  placeholder="Any notes for this day…"
                  onFocus={e => e.currentTarget.style.borderColor="#CF291D"}
                  onBlur={e => e.currentTarget.style.borderColor="#E5E7EB"}/>
              </div>
            </div>

            {/* Close day button */}
            {!isClosed ? (
              <button onClick={handleCloseDay} disabled={closingSaving || closing.actual_cash <= 0}
                style={{ padding:"12px", borderRadius:10, border:"none",
                  background: closing.actual_cash > 0 ? "#111827" : "#D1D5DB",
                  color:"#fff", fontSize:13, fontWeight:800, cursor: closing.actual_cash > 0 ? "pointer" : "default",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  opacity: closingSaving ? 0.6 : 1 }}>
                <CheckCircle size={16}/>
                <span>
                  {closingSaving ? "Saving…" : "Close Day & Save Reconciliation"}
                  <span className="si" style={{ display:"block", fontSize:9, fontWeight:400, opacity:0.7 }}>{SI.closeDay} · {SI.reconciliation}</span>
                </span>
              </button>
            ) : (
              <div style={{ padding:"12px 16px", borderRadius:10, background:"#F0FFF4", border:"1px solid #BBF7D0", display:"flex", alignItems:"center", gap:8, fontSize:12, fontWeight:700, color:"#16A34A" }}>
                <CheckCircle size={15}/> Day closed — Reconciliation saved
              </div>
            )}

            {/* Summary box */}
            <div style={{ background:"#F9FAFB", borderRadius:12, border:"1px solid #E8E8E8", padding:"14px 16px" }}>
              <p style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Day Summary</p>
              {[
                { label:"Opening Balance",  value: closing.opening_balance, color:"#6B7280" },
                { label:"+ Income",         value: income.total,            color:"#2563EB" },
                { label:"− Expenses",       value: totalOutflow,            color:"#CF291D" },
                { label:"= Expected Cash",  value: expectedCash,            color:"#D97706", bold:true },
                { label:"Physical Count",   value: closing.actual_cash,     color:"#374151", bold:true },
              ].map(r => (
                <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:11, color:"#6B7280", fontWeight: r.bold?700:400 }}>{r.label}</span>
                  <span style={{ fontSize:12, fontWeight: r.bold?900:600, color:r.color }}>Rs. {fmt(r.value)}</span>
                </div>
              ))}
              <div style={{ borderTop:"1px solid #E5E7EB", marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:11, fontWeight:700, color: isBalanced?"#16A34A":"#CF291D" }}>Variance</span>
                <span style={{ fontSize:13, fontWeight:900, color: isBalanced?"#16A34A":"#CF291D" }}>
                  {discrepancy >= 0 ? "+" : ""}Rs. {fmt(discrepancy)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
