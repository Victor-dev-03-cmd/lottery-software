import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Percent, RefreshCw, Home, ChevronRight, BarChart2 } from "lucide-react";
import { getProfitSummary, getDailyProfitTrend } from "../services/database";

type Period = 1 | 7 | 30 | 90;

const PERIODS: { value: Period; label: string }[] = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 Days" },
  { value: 30, label: "30 Days" },
  { value: 90, label: "90 Days" },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
  try { const [,m,dd] = d.split("-"); return `${dd}/${m}`; }
  catch { return d; }
};

export default function ProfitAnalytics() {
  const [period, setPeriod] = useState<Period>(7);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getProfitSummary>> | null>(null);
  const [trend, setTrend]     = useState<Awaited<ReturnType<typeof getDailyProfitTrend>>>([]);
  const [loading, setLoading] = useState(false);

  async function load(p: Period) {
    setLoading(true);
    const [s, t] = await Promise.all([
      getProfitSummary(p),
      getDailyProfitTrend(p),
    ]);
    setSummary(s);
    setTrend(t);
    setLoading(false);
  }

  useEffect(() => { load(period); }, [period]);

  const maxNet = Math.max(...trend.map(t => Math.abs(t.net)), 1);

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Profit Analytics</span>
        </nav>
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: period === p.value ? "#CF291D" : "#FFFFFF",
                color:      period === p.value ? "#FFFFFF" : "#6B7280",
                border:     `1px solid ${period === p.value ? "#CF291D" : "#E8E8E8"}`,
              }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => load(period)} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""}/> Refresh
          </button>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Profit & Margin Analytics</h1>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            Net profit = Invoice Revenue − Cost of Tickets Distributed (COGS) − Commissions paid
          </p>
        </div>

        {/* KPI grid */}
        {summary && (
          <div className="grid grid-cols-3 gap-4">
            {/* Revenue */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #16a34a" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>Total Revenue</p>
                  <p className="text-2xl font-black" style={{ color: "#16a34a" }}>Rs. {fmt(summary.total_revenue)}</p>
                  <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>{summary.invoice_count} invoices</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "#DCFCE7" }}>
                  <DollarSign size={18} style={{ color: "#16a34a" }}/>
                </div>
              </div>
            </div>

            {/* Stock Cost */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #CF291D" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>Cost of Tickets Distributed</p>
                  <p className="text-2xl font-black" style={{ color: "#CF291D" }}>Rs. {fmt(summary.total_cost)}</p>
                  <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>tickets actually delivered to agents</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "#FEE2E2" }}>
                  <ShoppingCart size={18} style={{ color: "#CF291D" }}/>
                </div>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #2563eb" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>Gross Profit</p>
                  <p className="text-2xl font-black" style={{ color: summary.gross_profit >= 0 ? "#2563eb" : "#CF291D" }}>
                    Rs. {fmt(summary.gross_profit)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>before commissions</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "#DBEAFE" }}>
                  {summary.gross_profit >= 0 ? <TrendingUp size={18} style={{ color: "#2563eb" }}/> : <TrendingDown size={18} style={{ color: "#CF291D" }}/>}
                </div>
              </div>
            </div>

            {/* Commission */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #7c3aed" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>Commission Paid</p>
                  <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>Rs. {fmt(summary.total_commission)}</p>
                  <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>agent commissions</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "#F3E8FF" }}>
                  <Percent size={18} style={{ color: "#7c3aed" }}/>
                </div>
              </div>
            </div>

            {/* Net Profit */}
            <div className="rounded-2xl p-5 shadow-sm col-span-2"
              style={{ background: summary.net_profit >= 0
                ? "linear-gradient(135deg,#064e3b,#16a34a)"
                : "linear-gradient(135deg,#7f1d1d,#CF291D)",
                border: "none" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Net Profit</p>
                  <p className="text-4xl font-black text-white">Rs. {fmt(summary.net_profit)}</p>
                  <p className="text-sm mt-1 text-white/70">Margin: {summary.margin_pct}%</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>Breakdown</p>
                  <div className="space-y-1 text-xs text-white/80">
                    <div className="flex justify-between gap-8">
                      <span>Revenue</span><span className="font-bold">+{fmt(summary.total_revenue)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span>Stock Cost</span><span className="font-bold">−{fmt(summary.total_cost)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span>Commission</span><span className="font-bold">−{fmt(summary.total_commission)}</span>
                    </div>
                    <div className="flex justify-between gap-8 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
                      <span className="font-black">Net</span>
                      <span className="font-black">Rs. {fmt(summary.net_profit)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Trend Chart */}
        {trend.length > 0 && (
          <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-5 py-3.5 flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#1D1D1D,#374151)", borderBottom: "2px solid #CF291D" }}>
              <BarChart2 size={15} style={{ color: "#CF291D" }}/>
              <span className="text-sm font-semibold text-white">Daily Net Profit Trend</span>
            </div>
            <div className="p-5">
              <div className="flex items-end gap-1.5" style={{ height: 120 }}>
                {trend.map((day, i) => {
                  const pct = Math.abs(day.net) / maxNet;
                  const height = Math.max(4, pct * 100);
                  const positive = day.net >= 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full flex items-end justify-center" style={{ height: 100 }}>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 whitespace-nowrap"
                          style={{ background: "#1D1D1D", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                          {fmtDate(day.day)}: Rs. {fmt(day.net)}
                        </div>
                        <div className="w-full rounded-t-sm transition-all"
                          style={{
                            height: `${height}%`,
                            background: positive
                              ? "linear-gradient(180deg,#22c55e,#16a34a)"
                              : "linear-gradient(180deg,#ef4444,#CF291D)",
                          }}/>
                      </div>
                      <span className="text-[9px]" style={{ color: "#BFBFBF" }}>{fmtDate(day.day)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: "#16a34a" }}/>
                  <span className="text-[10px]" style={{ color: "#9CA3AF" }}>Profit day</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: "#CF291D" }}/>
                  <span className="text-[10px]" style={{ color: "#9CA3AF" }}>Loss day</span>
                </div>
                <span className="text-[10px] ml-auto" style={{ color: "#9CA3AF" }}>
                  Hover bar for details
                </span>
              </div>
            </div>

            {/* Daily table */}
            <div className="overflow-x-auto" style={{ borderTop: "1px solid #F3F4F6" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#F9F9F9" }}>
                    {["Date","Revenue","Stock Cost","Net Profit"].map(h => (
                      <th key={h} className={`px-4 py-2.5 ${h==="Date"?"text-left":"text-right"}`}
                        style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...trend].reverse().map((day, i) => (
                    <tr key={i} className="hover:bg-gray-50/50" style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#6B7280" }}>{fmtDate(day.day)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-semibold" style={{ color: "#16a34a" }}>Rs. {fmt(day.revenue)}</td>
                      <td className="px-4 py-2.5 text-xs text-right" style={{ color: "#CF291D" }}>Rs. {fmt(day.cost)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-bold" style={{ color: day.net >= 0 ? "#16a34a" : "#CF291D" }}>
                        {day.net >= 0 ? "+" : ""}Rs. {fmt(day.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && trend.length === 0 && (
          <div className="rounded-2xl p-12 text-center shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <TrendingUp size={40} className="mx-auto mb-3" style={{ color: "#E8E8E8" }}/>
            <p className="text-sm font-medium" style={{ color: "#9CA3AF" }}>No data for this period</p>
            <p className="text-xs mt-1" style={{ color: "#BFBFBF" }}>Create purchase invoices and record collections to see profit analytics</p>
          </div>
        )}
      </div>
    </div>
  );
}
