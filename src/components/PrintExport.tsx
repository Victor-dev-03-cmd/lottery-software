import { useEffect, useState, useRef } from "react";
import {
  Printer, FileText, Home, ChevronRight, RefreshCw,
  Building2, DollarSign, Package,
  CheckCircle, AlertTriangle,
} from "lucide-react";
import {
  getCompanySettings, getPeriodStats, getAgentSummaries,
  getPayrollSummary, getSupplierOutstanding,
  getInventoryVelocity,
} from "../services/database";
import type { CompanySettings, AgentSummary, View } from "../types";
interface Props { onNavigate?: (view: View) => void; }

type PrintMode = "a4-monthly" | "thermal-daily";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
};

const today = new Date().toISOString().split("T")[0];
const currentMonth = today.substring(0, 7);
const monthLabel = new Date(today + "T00:00:00")
  .toLocaleDateString("en-LK", { month: "long", year: "numeric" });

export default function PrintExport({ onNavigate }: Props) {
  void onNavigate; // used by parent for future navigation
  const [mode, setMode] = useState<PrintMode>("a4-monthly");
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [stats30, setStats30] = useState<any>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [payroll, setPayroll] = useState({ total_payroll: 0, paid: 0, pending: 0, worker_count: 0, paid_count: 0, pending_count: 0 });
  const [supplierOwed, setSupplierOwed] = useState(0);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [co, st, ag, pr, so, inv] = await Promise.all([
        getCompanySettings(),
        getPeriodStats(30),
        getAgentSummaries(),
        getPayrollSummary(currentMonth),
        getSupplierOutstanding(),
        getInventoryVelocity(),
      ]);
      setCompany(co);
      setStats30(st);
      setAgents(ag.slice(0, 10));
      setPayroll(pr as typeof payroll);
      setSupplierOwed(so);
      setInventory(inv.slice(0, 8));
    } catch (e) {
      console.error("PrintExport load error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handlePrint() {
    window.print();
  }

  const totalOutstanding = agents.reduce((s, a) => s + Math.max(0, a.outstanding_balance), 0);
  // Revenue minus all costs: supplier owed + payroll + estimated agent commissions (5% of invoiced)
  const netProfit = (stats30?.total_collected ?? 0)
    - supplierOwed
    - payroll.total_payroll
    - (stats30?.total_invoiced ?? 0) * 0.05;

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 no-print">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Print & Export</span>
        </nav>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", color:"#1D1D1D" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90"
            style={{ background:"#CF291D", boxShadow:"0 4px 14px rgba(207,41,29,0.35)" }}>
            <Printer size={15}/> Print Now
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color:"#1D1D1D" }}>Print & Export</h1>
            <p className="text-xs mt-0.5" style={{ color:"#9CA3AF" }}>
              A4 monthly report or thermal daily summary — click Print Now
            </p>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex gap-3 no-print">
          {[
            { key: "a4-monthly", label: "A4 Monthly Report", sub: "Full management report", icon: <FileText size={18}/> },
            { key: "thermal-daily", label: "Thermal Daily Bill", sub: "80mm thermal receipt", icon: <Printer size={18}/> },
          ].map(m => (
            <button key={m.key} onClick={() => setMode(m.key as PrintMode)}
              className="flex items-center gap-3 px-5 py-3 rounded-2xl text-left transition-all"
              style={{
                background: mode === m.key ? "#CF291D" : "#FFFFFF",
                border: `2px solid ${mode === m.key ? "#CF291D" : "#E8E8E8"}`,
                color: mode === m.key ? "#FFFFFF" : "#1D1D1D",
                minWidth: 220,
              }}>
              <span style={{ color: mode === m.key ? "#FFFFFF" : "#CF291D" }}>{m.icon}</span>
              <div>
                <p className="font-bold text-sm">{m.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: mode === m.key ? "rgba(255,255,255,0.7)" : "#9CA3AF" }}>{m.sub}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Preview notice */}
        <div className="no-print flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", color:"#1e40af" }}>
          <Printer size={13}/> The document below is exactly what will print. Click "Print Now" to send to printer or save as PDF.
        </div>

        {/* ── A4 REPORT (visible in browser + prints in A4) ── */}
        {mode === "a4-monthly" && (
          <div ref={printRef} className="print-a4 rounded-2xl shadow-sm overflow-hidden no-print-border"
            style={{ background:"#FFFFFF", border:"1px solid #E8E8E8" }}>

            {/* Company letterhead */}
            <div className="px-8 pt-8 pb-6" style={{ background:"linear-gradient(135deg,#131313,#1D1D1D)", color:"#FFFFFF" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background:"#CF291D" }}>
                      <Building2 size={20} className="text-white"/>
                    </div>
                    <div>
                      <h1 className="text-xl font-black text-white">{company?.name ?? "Ajith Rohana Enterprise"}</h1>
                      <p className="text-[11px] mt-0.5" style={{ color:"rgba(255,255,255,0.6)" }}>
                        NLB Reg: {company?.nlb_reg} · DLB Reg: {company?.dlb_reg}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color:"rgba(255,255,255,0.5)" }}>
                    {company?.address}
                  </p>
                  <p className="text-xs" style={{ color:"rgba(255,255,255,0.5)" }}>
                    {company?.phone} · {company?.email}
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-block px-4 py-2 rounded-xl" style={{ background:"rgba(207,41,29,0.2)", border:"1px solid rgba(207,41,29,0.4)" }}>
                    <p className="text-[10px] uppercase font-bold tracking-widest" style={{ color:"#CF291D" }}>Monthly Report</p>
                    <p className="text-lg font-black text-white">{monthLabel}</p>
                    <p className="text-[10px]" style={{ color:"rgba(255,255,255,0.5)" }}>Generated: {fmtDate(today)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="px-8 py-5" style={{ borderBottom:"2px solid #F3F4F6" }}>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color:"#CF291D" }}>
                Executive Summary · Last 30 Days
              </h2>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label:"Total Invoiced",    val: stats30?.total_invoiced ?? 0,    color:"#1D1D1D", icon:<DollarSign size={16}/> },
                  { label:"Cash Collected",    val: stats30?.total_collected ?? 0,   color:"#16a34a", icon:<CheckCircle size={16}/> },
                  { label:"Outstanding",       val: stats30?.total_outstanding ?? 0, color:"#CF291D", icon:<AlertTriangle size={16}/> },
                  { label:"Tickets Issued",    val: stats30?.total_tickets ?? 0,     color:"#2563eb", icon:<Package size={16}/>, isInt: true },
                ].map(c => (
                  <div key={c.label} className="rounded-xl p-3" style={{ background:"#F9F9F9", border:"1px solid #F0F0F0" }}>
                    <div className="flex items-center gap-1.5 mb-2" style={{ color: c.color }}>{c.icon}</div>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color:"#9CA3AF" }}>{c.label}</p>
                    <p className="text-lg font-black" style={{ color: c.color }}>
                      {(c as any).isInt ? (c.val as number).toLocaleString() : `Rs. ${fmt(c.val as number)}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Financials breakdown */}
            <div className="grid grid-cols-2 gap-0" style={{ borderBottom:"2px solid #F3F4F6" }}>
              {/* Revenue & Expenses */}
              <div className="px-8 py-5" style={{ borderRight:"1px solid #F3F4F6" }}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color:"#9CA3AF" }}>
                  Revenue & Expenses
                </h3>
                <table className="w-full text-xs">
                  <tbody>
                    {[
                      { label:"Gross Revenue",        val: stats30?.total_collected ?? 0,  color:"#16a34a" },
                      { label:"Supplier Cost (est.)", val: supplierOwed,                    color:"#CF291D", neg: true },
                      { label:"Monthly Payroll",      val: payroll.total_payroll,           color:"#CF291D", neg: true },
                      { label:"Agent Commissions",    val: (stats30?.total_invoiced ?? 0) * 0.05, color:"#7c3aed", neg: true },
                    ].map((r, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid #F9F9F9" }}>
                        <td className="py-2" style={{ color:"#6B7280" }}>{r.label}</td>
                        <td className="py-2 text-right font-semibold" style={{ color: r.color }}>
                          {r.neg ? "− " : "+ "}Rs. {fmt(r.val)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop:"2px solid #E8E8E8" }}>
                      <td className="py-2 font-bold" style={{ color:"#1D1D1D" }}>Net Profit (est.)</td>
                      <td className="py-2 text-right font-black" style={{ color: netProfit >= 0 ? "#16a34a" : "#CF291D" }}>
                        Rs. {fmt(Math.abs(netProfit))} {netProfit < 0 ? "(Loss)" : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payroll summary */}
              <div className="px-8 py-5">
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color:"#9CA3AF" }}>
                  Payroll Summary — {monthLabel}
                </h3>
                <table className="w-full text-xs">
                  <tbody>
                    {[
                      { label:"Total Payroll",    val: payroll.total_payroll, color:"#1D1D1D" },
                      { label:"Paid",             val: payroll.paid,          color:"#16a34a" },
                      { label:"Pending",          val: payroll.pending,       color:"#d97706" },
                      { label:`Workers (${payroll.paid_count} paid · ${payroll.pending_count} pending)`, val: payroll.worker_count, color:"#2563eb", isInt: true },
                    ].map((r, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid #F9F9F9" }}>
                        <td className="py-2" style={{ color:"#6B7280" }}>{r.label}</td>
                        <td className="py-2 text-right font-semibold" style={{ color: r.color }}>
                          {(r as any).isInt ? r.val : `Rs. ${fmt(r.val as number)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Agent outstanding table */}
            <div className="px-8 py-5" style={{ borderBottom:"2px solid #F3F4F6" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color:"#9CA3AF" }}>
                Agent Outstanding Balances
              </h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background:"#374151" }}>
                    {["Agent","Total Value","Collected","Outstanding","Status"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold"
                        style={{ fontSize:9, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.filter(a => a.outstanding_balance > 0).slice(0, 8).map((a, i) => (
                    <tr key={a.agent_id} style={{ borderBottom:"1px solid #F5F5F5", background: i%2===0 ? "#FFFFFF" : "#FAFAFA" }}>
                      <td className="px-3 py-2 font-medium" style={{ color:"#1D1D1D" }}>{a.name}</td>
                      <td className="px-3 py-2" style={{ color:"#6B7280" }}>Rs. {fmt(a.total_value)}</td>
                      <td className="px-3 py-2" style={{ color:"#16a34a" }}>Rs. {fmt(a.total_cash)}</td>
                      <td className="px-3 py-2 font-bold" style={{ color:"#CF291D" }}>Rs. {fmt(Math.max(0, a.outstanding_balance))}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                          style={{ background:"#FEE2E2", color:"#CF291D" }}>Outstanding</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:"#374151", borderTop:"2px solid #CF291D" }}>
                    <td className="px-3 py-2 font-bold text-white text-xs">TOTAL</td>
                    <td className="px-3 py-2 text-white text-xs font-semibold">Rs. {fmt(agents.reduce((s,a)=>s+a.total_value,0))}</td>
                    <td className="px-3 py-2 text-white text-xs font-semibold">Rs. {fmt(agents.reduce((s,a)=>s+a.total_cash,0))}</td>
                    <td className="px-3 py-2 font-bold text-xs" style={{ color:"#f87171" }}>Rs. {fmt(totalOutstanding)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Inventory status */}
            <div className="px-8 py-5" style={{ borderBottom:"2px solid #F3F4F6" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color:"#9CA3AF" }}>
                Inventory Status
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {inventory.map(inv => {
                  const color = inv.velocity_pct > 80 ? "#CF291D" : inv.velocity_pct > 60 ? "#d97706" : "#16a34a";
                  return (
                    <div key={inv.game_name} className="rounded-lg p-2.5" style={{ border:`1px solid ${color}30`, background:`${color}08` }}>
                      <p className="text-[10px] font-bold truncate" style={{ color:"#1D1D1D" }}>{inv.game_name}</p>
                      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background:"#F0F0F0" }}>
                        <div className="h-full rounded-full" style={{ width:`${inv.velocity_pct}%`, background: color }}/>
                      </div>
                      <p className="text-[9px] mt-1" style={{ color }}>
                        {inv.velocity_pct}% distributed · {inv.days_remaining < 999 ? `${inv.days_remaining}d left` : "Sufficient"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 flex items-center justify-between text-[10px]"
              style={{ background:"#F9F9F9", borderTop:"1px solid #E8E8E8" }}>
              <span style={{ color:"#9CA3AF" }}>{company?.name} · Confidential Business Report · {fmtDate(today)}</span>
              <span style={{ color:"#9CA3AF" }}>Generated by Lottery Manager v3</span>
            </div>
          </div>
        )}

        {/* ── THERMAL BILL ── */}
        {mode === "thermal-daily" && (
          <div className="mx-auto rounded-2xl shadow-sm overflow-hidden"
            style={{ maxWidth: 360, background:"#FFFFFF", border:"1px solid #E8E8E8", fontFamily:"'Courier New', monospace" }}>

            {/* Thermal header */}
            <div className="px-5 pt-5 pb-3 text-center" style={{ borderBottom:"2px dashed #E8E8E8" }}>
              <p className="text-xs font-bold">{company?.name ?? "Ajith Rohana Enterprise"}</p>
              <p className="text-[10px]" style={{ color:"#6B7280" }}>{company?.address}</p>
              <p className="text-[10px]" style={{ color:"#6B7280" }}>{company?.phone}</p>
              <div className="mt-2 pt-2" style={{ borderTop:"1px dashed #E8E8E8" }}>
                <p className="text-base font-black">DAILY SUMMARY</p>
                <p className="text-[11px]" style={{ color:"#6B7280" }}>{fmtDate(today)}</p>
              </div>
            </div>

            {/* Daily stats */}
            <div className="px-5 py-3" style={{ borderBottom:"1px dashed #E8E8E8" }}>
              <p className="text-[11px] font-bold mb-2">LAST 30 DAYS SUMMARY</p>
              {[
                { label:"Total Invoiced",  val: stats30?.total_invoiced ?? 0 },
                { label:"Cash Collected",  val: stats30?.total_collected ?? 0 },
                { label:"Outstanding",     val: stats30?.total_outstanding ?? 0 },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-[11px] mb-1">
                  <span style={{ color:"#6B7280" }}>{r.label}</span>
                  <span className="font-bold">Rs. {fmt(r.val)}</span>
                </div>
              ))}
            </div>

            {/* Agent summary */}
            <div className="px-5 py-3" style={{ borderBottom:"1px dashed #E8E8E8" }}>
              <p className="text-[11px] font-bold mb-2">TOP OUTSTANDING AGENTS</p>
              {agents.filter(a => a.outstanding_balance > 0).slice(0, 5).map(a => (
                <div key={a.agent_id} className="flex justify-between text-[10px] mb-1">
                  <span className="truncate max-w-[160px]" style={{ color:"#374151" }}>{a.name}</span>
                  <span className="font-bold" style={{ color:"#CF291D" }}>Rs. {new Intl.NumberFormat("en-LK",{minimumFractionDigits:2}).format(a.outstanding_balance)}</span>
                </div>
              ))}
            </div>

            {/* Payroll */}
            <div className="px-5 py-3" style={{ borderBottom:"1px dashed #E8E8E8" }}>
              <p className="text-[11px] font-bold mb-2">PAYROLL ({monthLabel.toUpperCase()})</p>
              <div className="flex justify-between text-[10px]">
                <span style={{ color:"#6B7280" }}>Total Payroll</span>
                <span className="font-bold">Rs. {fmt(payroll.total_payroll)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span style={{ color:"#6B7280" }}>Paid</span>
                <span className="font-bold" style={{ color:"#16a34a" }}>Rs. {fmt(payroll.paid)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span style={{ color:"#6B7280" }}>Pending</span>
                <span className="font-bold" style={{ color:"#d97706" }}>Rs. {fmt(payroll.pending)}</span>
              </div>
            </div>

            {/* Supplier */}
            <div className="px-5 py-3" style={{ borderBottom:"1px dashed #E8E8E8" }}>
              <p className="text-[11px] font-bold mb-2">SUPPLIER (NIMALSIRI)</p>
              <div className="flex justify-between text-[10px]">
                <span style={{ color:"#6B7280" }}>Amount Owed</span>
                <span className="font-bold" style={{ color: supplierOwed > 0 ? "#CF291D" : "#16a34a" }}>
                  Rs. {fmt(supplierOwed)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 text-center" style={{ borderTop:"2px dashed #E8E8E8" }}>
              <p className="text-[10px]" style={{ color:"#9CA3AF" }}>*** Thank You ***</p>
              <p className="text-[9px] mt-1" style={{ color:"#BFBFBF" }}>Printed: {fmtDate(today)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .no-print-border { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
          body { background: white !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
