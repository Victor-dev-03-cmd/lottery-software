import { useEffect, useState } from "react";
import {
  RefreshCw, UserPlus,
  TrendingUp, Banknote, Ticket, AlertTriangle,
  Home, ChevronRight, Download, Users, ShoppingCart, Clock,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import {
  getAgentSummaries, getInvoicesByPeriod,
  getDailyRevenue, getAgentPerformance, getPeriodStats,
  getSupplierOutstanding, getSupplierAging,
} from "../services/database";
import { invoke } from "@tauri-apps/api/core";
import type { AgentSummary, Invoice, DailyRevenue, AgentPerformance, View, SupplierAgingBracket } from "../types";

const C = {
  red:   "#CF291D", redDk: "#B50717",
  muted: "#1D1D1D", silver: "#BFBFBF",
  surf:  "#ECECEC", white: "#FFFFFF",
  bdr:   "#E8E8E8", txt2: "#6B7280", txt3: "#9CA3AF",
};

type Period = "7D" | "30D" | "All";

const PERIOD_DAYS: Record<Period, number> = { "7D": 7, "30D": 30, "All": 36500 };
const PERIOD_LABEL: Record<Period, string> = { "7D": "Last 7 Days", "30D": "Last 30 Days", "All": "All Time" };

interface PeriodStats {
  invoice_count: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  total_tickets: number;
}

interface Props { onNavigate: (view: View) => void; refreshKey: number; }

export default function AgentDashboard({ onNavigate, refreshKey }: Props) {
  const [rows,          setRows]          = useState<AgentSummary[]>([]);
  const [recent,        setRecent]        = useState<Invoice[]>([]);
  const [daily,         setDaily]         = useState<DailyRevenue[]>([]);
  const [perf,          setPerf]          = useState<AgentPerformance[]>([]);
  const [periodStats,   setPeriodStats]   = useState<PeriodStats | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [period,        setPeriod]        = useState<Period>("30D");
  const [filter,        setFilter]        = useState("");
  const [exportMsg,     setExportMsg]     = useState("");
  const [supplierOwed,  setSupplierOwed]  = useState(0);
  const [supplierAging, setSupplierAging] = useState<SupplierAgingBracket[]>([]);

  async function load(p: Period = period, isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const days = PERIOD_DAYS[p];
    try {
      const [s, inv, d, pf, ps, sOwed, sAging] = await Promise.all([
        getAgentSummaries(),
        getInvoicesByPeriod(days, 6),
        getDailyRevenue(days),
        getAgentPerformance(),
        getPeriodStats(days),
        getSupplierOutstanding(),
        getSupplierAging(),
      ]);
      setRows(s); setRecent(inv); setDaily(d);
      setPerf(pf.slice(0, 7)); setPeriodStats(ps);
      setSupplierOwed(sOwed); setSupplierAging(sAging);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  function handlePeriod(p: Period) {
    setPeriod(p);
    load(p);
  }

  function handleRefresh() { load(period, true); }

  // ── Export CSV ──────────────────────────────────────────────────────────────
  async function handleExport() {
    setExportMsg("");
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const now = new Date();
      const ts  = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const destPath = await save({
        defaultPath: `ajith_rohana_dashboard_${ts}.csv`,
        filters: [{ name: "CSV File", extensions: ["csv"] }],
      });
      if (!destPath) return; // user cancelled

      const ps  = periodStats;
      const fmt = (n: number) => n.toFixed(2);
      const lines: string[] = [];

      // Header block
      lines.push(`"Ajith Rohana Enterprise - Dashboard Export"`);
      lines.push(`"Period","${PERIOD_LABEL[period]}"`);
      lines.push(`"Generated","${now.toLocaleString("en-LK")}"`);
      lines.push("");

      // KPI summary
      lines.push(`"=== KEY METRICS ==="`);
      lines.push(`"Metric","Value"`);
      lines.push(`"Total Revenue (${period})","Rs. ${fmt(ps?.total_invoiced ?? 0)}"`);
      lines.push(`"Tickets Distributed","${(ps?.total_tickets ?? 0).toLocaleString()}"`);
      lines.push(`"Cash Collected","Rs. ${fmt(ps?.total_collected ?? 0)}"`);
      lines.push(`"Outstanding Balance","Rs. ${fmt(Math.max(0, ps?.total_outstanding ?? 0))}"`);
      lines.push(`"Invoices","${ps?.invoice_count ?? 0}"`);
      const rate = ps && ps.total_invoiced > 0 ? Math.round((ps.total_collected / ps.total_invoiced) * 100) : 0;
      lines.push(`"Collection Rate","${rate}%"`);
      lines.push(`"Supplier Dues (Nimalsiri)","Rs. ${fmt(supplierOwed)}"`);
      if (supplierAging.length > 0) {
        for (const b of supplierAging) {
          lines.push(`"  └ ${b.bracket}","Rs. ${fmt(b.total_outstanding)} (${b.count} invoices)"`);
        }
      }
      lines.push("");

      // Agent performance
      lines.push(`"=== AGENT PERFORMANCE ==="`);
      lines.push(`"Agent Name","Total Value","Outstanding","Collection Rate %"`);
      for (const a of perf) {
        lines.push(`"${a.name}","${fmt(a.total_value)}","${fmt(a.outstanding)}","${a.collection_rate}"`);
      }
      lines.push("");

      // Agent dashboard grid
      lines.push(`"=== AGENT DASHBOARD (ALL TIME) ==="`);
      lines.push(`"Name","Total Tickets","Total Value","Winnings","Total Cash","Outstanding Balance"`);
      for (const r of rows) {
        lines.push(`"${r.name}","${r.total_tickets}","${fmt(r.total_value)}","${fmt(r.winnings_tickets)}","${fmt(r.total_cash)}","${fmt(r.outstanding_balance)}"`);
      }
      lines.push("");

      // Recent invoices
      lines.push(`"=== RECENT INVOICES (${PERIOD_LABEL[period]}) ==="`);
      lines.push(`"Invoice #","Agent","Date","Invoice Total","Cash Paid","Outstanding"`);
      for (const inv of recent) {
        const paid = (inv.cash_received ?? 0) + (inv.dlb_winning ?? 0) + (inv.nlb_winning ?? 0);
        lines.push(`"${inv.invoice_number}","${inv.agent_name ?? ""}","${inv.invoice_date}","${fmt(inv.invoice_total)}","${fmt(paid)}","${fmt(inv.outstanding_balance)}"`);
      }

      const csvContent = lines.join("\n");
      await invoke("write_text_file", { path: destPath, content: csvContent });
      setExportMsg(`✓ Exported to ${destPath.split("/").pop()}`);
      setTimeout(() => setExportMsg(""), 4000);
    } catch (e) {
      setExportMsg(`✗ Export failed: ${String(e)}`);
      setTimeout(() => setExportMsg(""), 4000);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const fmt  = (n: number) => new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2 }).format(n);
  // Full precision — no abbreviations (Rs. 685,300.00 instead of Rs. 685.3k)
  const fmts = (n: number) => `Rs. ${new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

  const visible = rows.filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase()));
  const totals  = visible.reduce((a, r) => ({
    total_tickets: a.total_tickets + r.total_tickets, total_value: a.total_value + r.total_value,
    winnings_tickets: a.winnings_tickets + r.winnings_tickets, total_cash: a.total_cash + r.total_cash,
    paid_cash: a.paid_cash + r.paid_cash, amount_over: a.amount_over + r.amount_over,
    loan_amount: a.loan_amount + r.loan_amount,
  }), { total_tickets:0, total_value:0, winnings_tickets:0, total_cash:0, paid_cash:0, amount_over:0, loan_amount:0 });

  // Guard: negative balances = advance credits, not shown as debt
  const totalOut = Math.max(0, rows.reduce((s, r) => s + Math.max(0, r.outstanding_balance), 0));
  const collRate = periodStats && periodStats.total_invoiced > 0
    ? Math.round((periodStats.total_collected / periodStats.total_invoiced) * 100)
    : 0;

  const outPie = rows
    .filter(r => r.outstanding_balance > 0)          // skip advance credits (negative)
    .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
    .slice(0, 5)
    .map(r => ({ name: r.name.split(" ")[0], value: Math.max(0, Math.round(r.outstanding_balance)) }));

  const PIE_COLORS = [C.red, C.redDk, C.muted, C.silver, "#374151"];

  // KPI label changes based on period
  const kpiPeriodLabel = period === "All" ? "All-Time" : `${period} Revenue`;

  return (
    <div style={{ background: C.surf, minHeight: "100%" }}>

      {/* ── Top chrome: breadcrumb + period controls ── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: C.txt3 }}>
          <Home size={12} /><ChevronRight size={11} />
          <span className="font-semibold" style={{ color: C.muted }}>Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Period toggle */}
          {(["7D","30D","All"] as Period[]).map(p => (
            <button key={p} onClick={() => handlePeriod(p)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
              style={{
                background: period===p ? C.red : C.white,
                color:      period===p ? C.white : C.txt2,
                border:     `1px solid ${period===p ? C.red : C.bdr}`,
              }}>
              {p}
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ background: C.bdr }} />

          {/* Refresh with spinner */}
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-1.5 rounded-md transition-all hover:bg-white disabled:opacity-60"
            title="Refresh dashboard"
            style={{ color: C.txt3 }}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>

          {/* Export */}
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-all hover:bg-gray-50"
            style={{ borderColor: C.bdr, color: C.txt2, background: C.white }}
            title="Export dashboard as CSV">
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* Export status toast */}
      {exportMsg && (
        <div className="mx-6 mb-2 px-4 py-2 rounded-xl text-xs font-medium"
          style={{
            background: exportMsg.startsWith("✓") ? "#F0FFF4" : "#FFF1F0",
            border: `1px solid ${exportMsg.startsWith("✓") ? "#BBF7D0" : "#FECACA"}`,
            color: exportMsg.startsWith("✓") ? "#16a34a" : C.red,
          }}>
          {exportMsg}
        </div>
      )}

      <div className="px-6 pb-6 space-y-5">

        {/* ── Overview header + shortcuts ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.muted }}>Overview</h1>
            <p className="text-xs mt-0.5" style={{ color: C.txt3 }}>
              Ajith Rohana Enterprise ·{" "}
              {new Date().toLocaleDateString("en-LK", { month:"long", day:"numeric", year:"numeric" })}
              {" "}·{" "}
              <span className="font-semibold" style={{ color: C.red }}>{PERIOD_LABEL[period]}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {[
              { label:"+ New Invoice", view:"new-invoice" as View, primary:true  },
              { label:"Invoices",      view:"invoices"   as View, primary:false },
              { label:"Reports",       view:"reports"    as View, primary:false },
              { label:"Settings",      view:"settings"   as View, primary:false },
            ].map(({label,view,primary}) => (
              <button key={view} onClick={() => onNavigate(view)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: primary ? C.red : C.white,
                  color:      primary ? C.white : C.muted,
                  border:     `1px solid ${primary ? C.red : C.bdr}`,
                }}
                onMouseEnter={e => { if(primary) (e.currentTarget as HTMLButtonElement).style.background = C.redDk; }}
                onMouseLeave={e => { if(primary) (e.currentTarget as HTMLButtonElement).style.background = C.red; }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section label ── */}
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.silver }}>
          Admin · {PERIOD_LABEL[period]} View
        </p>

        {/* ── KPI strip (period-aware) — 5 cards ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {/* Hero — period revenue */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: loading ? "#E8B4B0" : C.red }}>
            <div className="absolute top-3 right-3 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <TrendingUp size={18} className="text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-3">
              {kpiPeriodLabel}
            </p>
            {loading ? (
              <div className="h-9 w-28 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.2)" }} />
            ) : (
              <p className="text-3xl font-black text-white leading-none mb-1">
                {fmts(periodStats?.total_invoiced ?? 0)}
              </p>
            )}
            <p className="text-xs text-white/70 mt-2">
              {periodStats?.invoice_count ?? 0} invoice{(periodStats?.invoice_count ?? 0) !== 1 ? "s" : ""}
            </p>
            {collRate > 0 && (
              <p className="text-xs font-semibold mt-1" style={{ color: "#FFD1CF" }}>
                ↑ {collRate}% collection rate
              </p>
            )}
          </div>

          {/* Total Tickets */}
          <KpiWhite
            icon={<Ticket size={17} />}
            label={`Tickets (${period})`}
            value={loading ? "…" : (periodStats?.total_tickets ?? 0).toLocaleString("en-LK")}
            sub={`${periodStats?.invoice_count ?? 0} invoices`}
            loading={loading}
          />

          {/* Cash Collected */}
          <KpiWhite
            icon={<Banknote size={17} />}
            label={`Collected (${period})`}
            value={loading ? "…" : fmts(periodStats?.total_collected ?? 0)}
            sub={`${collRate}% of invoiced`}
            trend={collRate >= 80 ? "↑ On track" : "↓ Follow up"}
            trendColor={collRate >= 80 ? "#16a34a" : C.red}
            loading={loading}
          />

          {/* Sub-agent Outstanding */}
          <KpiWhite
            icon={<AlertTriangle size={17} />}
            label={`Outstanding (${period})`}
            value={loading ? "…" : fmts(Math.max(0, periodStats?.total_outstanding ?? 0))}
            sub={`${rows.filter(r=>r.outstanding_balance>0).length} agents`}
            trend={Math.max(0, periodStats?.total_outstanding ?? 0) > 0 ? "Requires collection" : "All settled ✓"}
            trendColor={Math.max(0, periodStats?.total_outstanding ?? 0) > 0 ? C.red : "#16a34a"}
            onClick={() => onNavigate("ledger")}
            loading={loading}
          />

          {/* ── Supplier Dues (Nimalsiri) ── */}
          {(() => {
            const hasOverdue15 = supplierAging.some(b => b.days_min >= 15 && b.total_outstanding > 0);
            const hasOverdue8  = supplierAging.some(b => b.days_min >= 8  && b.total_outstanding > 0);
            const dueBg = supplierOwed <= 0
              ? "#DCFCE7"
              : hasOverdue15 ? C.red
              : hasOverdue8  ? "#d97706"
              : "#f59e0b";
            const dueColor = supplierOwed <= 0 ? "#16a34a" : "#FFFFFF";
            const dueBorder = supplierOwed <= 0 ? "#BBF7D0" : "transparent";
            return (
              <div onClick={() => onNavigate("purchases")}
                className="rounded-2xl p-5 relative overflow-hidden cursor-pointer transition-all hover:opacity-90 shadow-sm"
                style={{ background: dueBg, border: `1px solid ${dueBorder}` }}>
                <div className="absolute top-3 right-3 w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: supplierOwed > 0 ? "rgba(255,255,255,0.2)" : "rgba(22,163,74,0.15)" }}>
                  <ShoppingCart size={18} style={{ color: dueColor }}/>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3"
                  style={{ color: supplierOwed > 0 ? "rgba(255,255,255,0.75)" : "#16a34a" }}>
                  Nimalsiri Dues
                </p>
                {loading
                  ? <div className="h-9 w-24 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.2)" }}/>
                  : <p className="text-2xl font-black leading-none mb-1" style={{ color: dueColor }}>
                      {supplierOwed <= 0 ? "All Clear ✓" : fmts(supplierOwed)}
                    </p>
                }
                <p className="text-xs mt-2" style={{ color: supplierOwed > 0 ? "rgba(255,255,255,0.7)" : "#16a34a" }}>
                  {supplierOwed <= 0 ? "No balance owed" : "owed to Nimalsiri"}
                </p>
                {hasOverdue15 && !loading && (
                  <p className="text-[10px] font-bold mt-1" style={{ color: "#FFD1CF" }}>
                    ⚠ 15+ day overdue
                  </p>
                )}
                {!hasOverdue15 && hasOverdue8 && !loading && (
                  <p className="text-[10px] font-bold mt-1" style={{ color: "#FEF3C7" }}>
                    ↑ 8+ days pending
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── Supplier Aging Alert Widget ── */}
        {!loading && supplierOwed > 0 && supplierAging.length > 0 && (() => {
          const maxDays = Math.max(...supplierAging.map(b => b.days_min));
          const alertColor = maxDays >= 30 ? C.red : maxDays >= 15 ? "#ea580c" : maxDays >= 8 ? "#d97706" : "#f59e0b";
          const alertBg    = maxDays >= 30 ? "#FFF1F0" : maxDays >= 15 ? "#FFF7ED" : "#FFFBEB";
          const alertBdr   = maxDays >= 30 ? "#FECACA" : maxDays >= 15 ? "#FED7AA" : "#FDE68A";
          return (
            <div className="rounded-2xl overflow-hidden shadow-sm"
              style={{ border: `1px solid ${alertBdr}`, background: alertBg }}>
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${alertBdr}` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: alertColor, boxShadow: `0 4px 12px ${alertColor}40` }}>
                    <Clock size={15} className="text-white"/>
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#1D1D1D" }}>
                      Supplier Credit Aging — Nimalsiri Enterprises
                    </p>
                    <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                      Rs. {fmt(supplierOwed)} total outstanding · age distribution below
                    </p>
                  </div>
                </div>
                <button onClick={() => onNavigate("purchases")}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                  style={{ background: alertColor }}>
                  <ShoppingCart size={12}/> Settle Now
                </button>
              </div>
              <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
                {supplierAging.map(b => {
                  const bColor = b.days_max <= 7 ? "#16a34a" : b.days_max <= 14 ? "#d97706" : b.days_max <= 30 ? "#ea580c" : C.red;
                  const pct = supplierOwed > 0 ? Math.round((b.total_outstanding / supplierOwed) * 100) : 0;
                  return (
                    <div key={b.bracket} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: `${bColor}12`, border: `1px solid ${bColor}30`, flex: "1 1 120px" }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: bColor }}/>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: bColor }}>
                          {b.bracket}
                        </p>
                        <p className="text-sm font-black" style={{ color: "#1D1D1D" }}>
                          Rs. {fmt(b.total_outstanding)}
                        </p>
                        <p className="text-[9px]" style={{ color: "#9CA3AF" }}>
                          {b.count} invoice{b.count !== 1 ? "s" : ""} · {pct}%
                        </p>
                      </div>
                    </div>
                  );
                })}
                {/* Visual percentage bar */}
                <div className="w-full mt-1">
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {supplierAging.map(b => {
                      const bColor = b.days_max <= 7 ? "#16a34a" : b.days_max <= 14 ? "#d97706" : b.days_max <= 30 ? "#ea580c" : C.red;
                      const pct = supplierOwed > 0 ? (b.total_outstanding / supplierOwed) * 100 : 0;
                      return pct > 0 ? (
                        <div key={b.bracket} style={{ width: `${pct}%`, background: bColor }}/>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Charts row 1 ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Revenue area chart */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-sm"
            style={{ background: C.white, border:`1px solid ${C.bdr}` }}>
            <div className="flex items-start justify-between px-5 pt-4 pb-2">
              <div>
                <p className="font-semibold text-sm" style={{ color: C.muted }}>Revenue Trend</p>
                <p className="text-xs mt-0.5" style={{ color: C.txt3 }}>
                  Daily totals · {PERIOD_LABEL[period].toLowerCase()}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#FFF1F0", color: C.red }}>
                ● LIVE
              </span>
            </div>
            <div className="px-4 pb-4">
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <RefreshCw size={20} className="animate-spin" style={{ color: C.silver }} />
                </div>
              ) : daily.length === 0 ? (
                <EmptyChart h={200} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={daily} margin={{ top:4, right:4, left:-22, bottom:0 }}>
                    <defs>
                      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.red} stopOpacity={0.15}/>
                        <stop offset="95%" stopColor={C.red} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="#F3F4F6"/>
                    <XAxis dataKey="day" tick={{ fontSize:10, fill:C.txt3 }}
                      tickFormatter={v=>v.slice(5)} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize:10, fill:C.txt3 }}
                      tickFormatter={v=>`${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false}/>
                    <Tooltip
                      contentStyle={{ background:C.muted, border:"none", borderRadius:10, color:"#fff", fontSize:11, padding:"8px 12px" }}
                      formatter={v=>[`Rs. ${fmt(Number(v))}`, "Revenue"]}
                      cursor={{ stroke: C.red, strokeWidth:1, strokeDasharray:"4 4" }}
                    />
                    <Area type="monotone" dataKey="total" stroke={C.red} strokeWidth={2.5}
                      fill="url(#rg)" dot={false} activeDot={{ r:5, fill:C.red, strokeWidth:0 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Outstanding donut */}
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: C.white, border:`1px solid ${C.bdr}` }}>
            <div className="px-5 pt-4 pb-2">
              <p className="font-semibold text-sm" style={{ color: C.muted }}>Outstanding by Agent</p>
              <p className="text-xs mt-0.5" style={{ color: C.txt3 }}>Top 5 agents (all-time)</p>
            </div>
            <div className="px-4 pb-4">
              {outPie.length === 0
                ? <EmptyChart h={185} msg="No outstanding balances ✓" color="#16a34a" />
                : (
                  <>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={outPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                          dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                          {outPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]}/>)}
                        </Pie>
                        <Tooltip contentStyle={{ background:C.muted, border:"none", borderRadius:8, color:"#fff", fontSize:11 }}
                          formatter={v=>`Rs. ${fmt(Number(v))}`}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-1">
                      {outPie.slice(0,4).map((d,i) => (
                        <div key={d.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background:PIE_COLORS[i] }}/>
                            <span className="text-xs" style={{ color:C.muted }}>{d.name}</span>
                          </div>
                          <span className="text-xs font-semibold" style={{ color:C.muted }}>
                            Rs. {fmt(d.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )
              }
            </div>
          </div>
        </div>

        {/* ── Charts row 2: Agent performance + Quick actions ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-sm"
            style={{ background: C.white, border:`1px solid ${C.bdr}` }}>
            <div className="flex items-start justify-between px-5 pt-4 pb-2">
              <div>
                <p className="font-semibold text-sm" style={{ color: C.muted }}>Agent Performance</p>
                <p className="text-xs mt-0.5" style={{ color: C.txt3 }}>
                  Total vs outstanding · all agents
                </p>
              </div>
            </div>
            <div className="px-4 pb-4">
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <RefreshCw size={20} className="animate-spin" style={{ color: C.silver }} />
                </div>
              ) : perf.length === 0 ? <EmptyChart h={200} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={perf} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#F3F4F6" vertical={false}/>
                    <XAxis dataKey="name" tick={{ fontSize:10, fill:C.txt3 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v=>v.length>7 ? v.slice(0,7)+"…" : v}/>
                    <YAxis tick={{ fontSize:10, fill:C.txt3 }}
                      tickFormatter={v=>`${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ background:C.muted, border:"none", borderRadius:10, color:"#fff", fontSize:11, padding:"8px 12px" }}
                      formatter={(v,n) => [`Rs. ${fmt(Number(v))}`, n==="outstanding" ? "Outstanding" : "Total Value"]}/>
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11, paddingTop:8, color:C.txt3 }}/>
                    <Bar dataKey="total_value" name="Total Value" fill={C.red} radius={[4,4,0,0]}/>
                    <Bar dataKey="outstanding"  name="Outstanding" fill={C.silver} radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Quick actions + alert pills */}
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: C.white, border:`1px solid ${C.bdr}` }}>
            <div className="px-5 pt-4 pb-2">
              <p className="font-semibold text-sm" style={{ color: C.muted }}>Quick Actions</p>
            </div>
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l:"+ New Invoice",    v:"new-invoice"  as View, bg:C.red,     icon:"📋" },
                  { l:"Stock Purchases",  v:"purchases"    as View, bg:"#b45309",  icon:"🛒" },
                  { l:"Returns",          v:"returns"      as View, bg:C.muted,    icon:"↩" },
                  { l:"Alerts",           v:"alerts"       as View, bg:C.redDk,    icon:"🔔" },
                  { l:"Collections",      v:"collections"  as View, bg:"#374151",  icon:"💰" },
                  { l:"Inventory",        v:"inventory"    as View, bg:"#4B5563",  icon:"📦" },
                  { l:"Distribution",     v:"distribution" as View, bg:"#1e40af",  icon:"👥" },
                  { l:"Add Agent",        v:"agents"       as View, bg:"#131313",  icon:"➕" },
                ].map(({l,v,bg}) => (
                  <button key={v} onClick={()=>onNavigate(v)}
                    className="py-2 rounded-xl text-[11px] font-semibold text-white transition-all hover:opacity-90 active:scale-95 text-center"
                    style={{ background:bg }}>
                    {l}
                  </button>
                ))}
              </div>
              {perf.slice(0,3).length > 0 && (
                <div className="border-t pt-3 space-y-2" style={{ borderColor: C.surf }}>
                  <div className="text-[10px] font-bold uppercase" style={{ color: C.silver }}>Agent Collection Rate</div>
                  {perf.slice(0,3).map(a => {
                    const col = a.collection_rate>=80?"#16a34a":a.collection_rate>=50?"#d97706":C.red;
                    return (
                      <div key={a.name}>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="truncate max-w-[110px]" style={{ color:C.muted }}>{a.name}</span>
                          <span className="font-bold" style={{ color:col }}>{a.collection_rate}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background:C.surf }}>
                          <div className="h-full rounded-full"
                            style={{ width:`${Math.min(100,a.collection_rate)}%`, background:col }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Supplier dues pill */}
              {supplierOwed > 0 && (
                <button onClick={() => onNavigate("purchases")}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background:"#FFFBEB", border:`1px solid #FDE68A`, color:"#92400e" }}>
                  <ShoppingCart size={11}/> Rs. {fmt(supplierOwed)} owed to Nimalsiri
                </button>
              )}
              {/* Agent outstanding pill */}
              {totalOut > 0 && (
                <button onClick={() => onNavigate("ledger")}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background:"#FFF1F0", border:`1px solid #FECACA`, color:C.red }}>
                  <AlertTriangle size={11}/> Rs. {fmt(totalOut)} outstanding across agents
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Recent invoices (period-filtered) ── */}
        {recent.length > 0 && (
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: C.white, border:`1px solid ${C.bdr}` }}>
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom:`1px solid #F3F4F6` }}>
              <div>
                <p className="font-semibold text-sm" style={{ color: C.muted }}>Recent Invoices</p>
                <p className="text-xs mt-0.5" style={{ color: C.txt3 }}>
                  {PERIOD_LABEL[period]} · {recent.length} shown
                </p>
              </div>
              <button onClick={() => onNavigate("invoices")}
                className="text-xs font-semibold hover:underline" style={{ color: C.red }}>
                View all →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom:`1px solid #F3F4F6` }}>
                    {["Invoice #","Agent","Date","Total","Collected","Status"].map(h=>(
                      <th key={h} className="px-5 py-3 text-left font-semibold"
                        style={{ fontSize:10, color:C.txt3, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map(inv => {
                    const paid = (inv.cash_received??0) + (inv.dlb_winning??0) + (inv.nlb_winning??0);
                    return (
                      <tr key={inv.id} className="transition-colors hover:bg-gray-50/80"
                        style={{ borderBottom:`1px solid #F9F9F9` }}>
                        <td className="px-5 py-3 font-mono font-bold text-sm" style={{ color:C.red }}>
                          #{inv.invoice_number}
                        </td>
                        <td className="px-5 py-3 font-medium text-sm" style={{ color:C.muted }}>
                          {inv.agent_name}
                        </td>
                        <td className="px-5 py-3 text-xs" style={{ color:C.txt2 }}>{fmtDate(inv.invoice_date)}</td>
                        <td className="px-5 py-3 font-semibold text-sm" style={{ color:C.muted }}>
                          Rs. {fmt(inv.invoice_total)}
                        </td>
                        <td className="px-5 py-3 text-sm" style={{ color:"#16a34a" }}>Rs. {fmt(paid)}</td>
                        <td className="px-5 py-3">
                          {inv.outstanding_balance > 0
                            ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white" style={{ background:C.red }}>● Due</span>
                            : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white" style={{ background:"#16a34a" }}>✓ Settled</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Agent Dashboard Grid (all-time) ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm"
          style={{ background: C.white, border:`1px solid ${C.bdr}` }}>
          <div className="flex items-center justify-between px-5 py-3"
            style={{ background:"#374151", borderBottom:`2px solid ${C.red}` }}>
            <div className="flex items-center gap-3">
              <Users size={15} className="text-white"/>
              <div>
                <p className="font-bold text-sm text-white">Agent Dashboard</p>
                <p className="text-[10px]" style={{ color:C.silver }}>Live balance overview · all agents · all time</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Search agent…" value={filter}
                onChange={e=>setFilter(e.target.value)}
                className="rounded-lg px-3 py-1 text-xs w-36 focus:outline-none"
                style={{ background:"#4B5563", border:"1px solid #6B7280", color:"#E5E7EB" }}/>
              <button onClick={() => load(period, true)}
                className="p-1.5 rounded-lg" style={{ background:"#4B5563", color:C.silver }}>
                <RefreshCw size={11} className={refreshing ? "animate-spin" : ""}/>
              </button>
              <button onClick={() => onNavigate("agents")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background:C.red }}>
                <UserPlus size={12}/> Manage
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background:"#FAFAFA", borderBottom:`1px solid ${C.bdr}` }}>
                  {["Name","Total Tickets","Total Value","Winnings","Cash","Paid","Over Total","Outstanding"].map(h=>(
                    <th key={h} className="px-4 py-3 text-left font-semibold"
                      style={{ fontSize:10, color:C.txt3, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-xs" style={{ color:C.silver }}>
                    Loading…
                  </td></tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm" style={{ color:C.silver }}>
                    {rows.length===0
                      ? <span>No agents yet.{" "}<button onClick={()=>onNavigate("agents")} className="underline font-semibold" style={{ color:C.red }}>Add your first agent →</button></span>
                      : "No results match filter."}
                  </td></tr>
                )}
                {visible.map((r,i) => (
                  <tr key={r.agent_id}
                    className="transition-colors hover:bg-red-50/30"
                    style={{ background: r.outstanding_balance>0 ? "#FFF8F8" : i%2===0 ? C.white : "#FCFCFC",
                      borderBottom:`1px solid #F5F5F5` }}>
                    <td className="px-4 py-2.5 font-semibold text-xs" style={{ color:C.muted }}>
                      {r.outstanding_balance>0 && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                          style={{ background:C.red, verticalAlign:"middle" }}/>
                      )}
                      {r.name}
                    </td>
                    {[r.total_tickets.toLocaleString(), fmt(r.total_value), fmt(r.winnings_tickets),
                      fmt(r.total_cash), fmt(r.paid_cash), fmt(r.amount_over)].map((v,ci) => (
                      <td key={ci} className="px-4 py-2.5 text-xs" style={{ color:C.txt2 }}>{v}</td>
                    ))}
                    <td className="px-4 py-2.5 text-xs font-bold"
                      style={{ color: r.outstanding_balance > 0 ? C.red : r.outstanding_balance < 0 ? "#2563eb" : "#16a34a" }}>
                      {r.outstanding_balance < 0
                        ? <span title="Advance credit / overpayment">Cr. {fmt(Math.abs(r.outstanding_balance))}</span>
                        : fmt(Math.max(0, r.outstanding_balance))
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && visible.length > 0 && (
                <tfoot>
                  <tr style={{ background:"#374151", borderTop:`2px solid ${C.red}` }}>
                    <td className="px-4 py-3 text-xs font-bold uppercase" style={{ color:C.red }}>Total</td>
                    {[totals.total_tickets.toLocaleString(), fmt(totals.total_value),
                      fmt(totals.winnings_tickets), fmt(totals.total_cash),
                      fmt(totals.paid_cash), fmt(totals.amount_over), fmt(totals.loan_amount)].map((v,i) => (
                      <td key={i} className="px-4 py-3 text-xs font-semibold text-white">{v}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <p className="text-[10px] text-center pb-2" style={{ color: C.silver }}>
          Ajith Rohana Enterprise Lottery Manager · F2=New Invoice · F4=Search · ?=Shortcuts · Export saves as CSV
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiWhite({ icon, label, value, sub, trend, trendColor="#16a34a", onClick, loading }: {
  icon: React.ReactNode; label: string; value: string;
  sub?: string; trend?: string; trendColor?: string;
  onClick?: () => void; loading?: boolean;
}) {
  return (
    <div onClick={onClick}
      className="rounded-2xl p-5 transition-all shadow-sm"
      style={{ background:"#FFFFFF", border:`1px solid #E8E8E8`,
        borderLeft:"4px solid #CF291D", cursor: onClick?"pointer":undefined }}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:"#F4F4F4", color:"#374151" }}>
          {icon}
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color:"#9CA3AF" }}>{label}</p>
      {loading
        ? <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background:"#F3F4F6" }} />
        : <p className="text-2xl font-black leading-tight" style={{ color:"#1D1D1D" }}>{value}</p>
      }
      {sub && <p className="text-[11px] mt-1" style={{ color:"#9CA3AF" }}>{sub}</p>}
      {trend && !loading && <p className="text-[11px] font-semibold mt-1.5" style={{ color:trendColor }}>{trend}</p>}
    </div>
  );
}

function EmptyChart({ h=180, msg="No data yet", color="#BFBFBF" }: { h?:number; msg?:string; color?:string }) {
  return (
    <div className="flex items-center justify-center text-xs font-medium" style={{ height:h, color }}>
      {msg}
    </div>
  );
}

function fmtDate(d: string) {
  try { const [y,m,dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
