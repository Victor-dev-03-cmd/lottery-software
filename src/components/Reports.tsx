import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  RefreshCw, TrendingUp, AlertTriangle,
  Ticket, Trophy, Banknote, BarChart2, Home, ChevronRight,
} from "lucide-react";
import {
  getDailyRevenue,
  getMonthlyRevenue,
  getAgentPerformance,
  getAgingReport,
  getGameBreakdown,
  getGlobalStats,
} from "../services/database";
import type {
  DailyRevenue, MonthlyRevenue, AgentPerformance,
  AgingEntry, GameBreakdown, GlobalStats,
} from "../types";

export default function Reports() {
  const [daily, setDaily] = useState<DailyRevenue[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRevenue[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [aging, setAging] = useState<AgingEntry[]>([]);
  const [games, setGames] = useState<GameBreakdown[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30>(30);
  const [activeTab, setActiveTab] = useState<"overview" | "games" | "agents" | "aging">("overview");

  async function load() {
    setLoading(true);
    const [d, m, a, ag, g, s] = await Promise.all([
      getDailyRevenue(period),
      getMonthlyRevenue(6),
      getAgentPerformance(),
      getAgingReport(),
      getGameBreakdown(),
      getGlobalStats(),
    ]);
    setDaily(d);
    setMonthly(m);
    setAgents(a);
    setAging(ag);
    setGames(g);
    setStats(s);
    setLoading(false);
  }

  useEffect(() => { load(); }, [period]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtFull = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const pieData = [
    { name: "Collected", value: Math.max(0, (stats?.total_cash_collected ?? 0) + (stats?.total_winnings_returned ?? 0)) },
    { name: "Outstanding", value: Math.max(0, stats?.total_outstanding ?? 0) },
  ];

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "games", label: "Game Breakdown" },
    { key: "agents", label: "Agent Performance" },
    { key: "aging", label: "Aging Report" },
  ] as const;

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb + toolbar row */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Reports</span>
        </nav>
        <div className="flex gap-2">
          {/* period pills */}
          <div className="flex gap-1">
            {([7, 30] as const).map((d) => (
              <button key={d} onClick={() => setPeriod(d)}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: period === d ? "#CF291D" : "#FFFFFF",
                  color: period === d ? "#FFFFFF" : "#6B7280",
                  border: `1px solid ${period === d ? "#CF291D" : "#E8E8E8"}`,
                }}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Reports & Analytics</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Revenue, agent performance, aging analysis</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color: "#9CA3AF" }}>Loading analytics…</div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              <KpiCard label="Tickets Distributed" value={fmt(stats?.total_tickets_distributed ?? 0)} icon={<Ticket size={14} style={{ color: "#CF291D" }} />} />
              <KpiCard label="Total Invoiced" value={`Rs. ${fmt(stats?.total_invoice_value ?? 0)}`} icon={<BarChart2 size={14} style={{ color: "#CF291D" }} />} />
              <KpiCard label="Cash Collected" value={`Rs. ${fmt(stats?.total_cash_collected ?? 0)}`} icon={<Banknote size={14} style={{ color: "#CF291D" }} />} />
              <KpiCard label="Winnings Returned" value={`Rs. ${fmt(stats?.total_winnings_returned ?? 0)}`} icon={<Trophy size={14} style={{ color: "#CF291D" }} />} />
              <KpiCard label="Outstanding" value={`Rs. ${fmt(stats?.total_outstanding ?? 0)}`} icon={<AlertTriangle size={14} style={{ color: "#CF291D" }} />} />
              <KpiCard label="Total Invoices" value={String(stats?.total_invoices ?? 0)} icon={<TrendingUp size={14} style={{ color: "#CF291D" }} />} />
            </div>

            {/* ASROZ tab bar */}
            <div className="flex border-b" style={{ borderColor: "#F3F4F6" }}>
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors"
                  style={{
                    borderColor: activeTab === t.key ? "#CF291D" : "transparent",
                    color: activeTab === t.key ? "#CF291D" : "#9CA3AF",
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  {/* Daily bar chart */}
                  <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                    <div className="flex items-start justify-between px-5 pt-4 pb-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Daily Revenue</p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>last {period} days</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FFF1F0", color: "#CF291D" }}>{period}D</span>
                    </div>
                    <div className="px-4 pb-4">
                      {daily.length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={daily} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v) => [`Rs. ${fmt(Number(v))}`, "Revenue"]} labelFormatter={(l) => `Date: ${l}`} />
                            <Bar dataKey="total" fill="#CF291D" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Collection pie */}
                  <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                    <div className="flex items-start justify-between px-5 pt-4 pb-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Collection Status</p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>collected vs outstanding</p>
                      </div>
                    </div>
                    <div className="px-4 pb-4">
                      {(stats?.total_invoice_value ?? 0) === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                              labelLine={false} fontSize={11}>
                              <Cell fill="#10b981" />
                              <Cell fill="#CF291D" />
                            </Pie>
                            <Tooltip formatter={(v) => `Rs. ${fmt(Number(v))}`} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* Monthly trend */}
                <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                  <div className="flex items-start justify-between px-5 pt-4 pb-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Monthly Revenue vs Collection</p>
                      <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>6-month trend</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FFF1F0", color: "#CF291D" }}>6M</span>
                  </div>
                  <div className="px-4 pb-4">
                    {monthly.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={monthly} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v) => `Rs. ${fmt(Number(v))}`} />
                          <Legend />
                          <Line type="monotone" dataKey="total" name="Invoiced" stroke="#CF291D" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── GAME BREAKDOWN TAB ── */}
            {activeTab === "games" && (
              <div className="space-y-5">
                {games.length === 0 ? (
                  <div className="rounded-2xl p-8 text-center shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#9CA3AF" }}>No invoice data yet.</div>
                ) : (
                  <>
                    <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                      <div className="flex items-start justify-between px-5 pt-4 pb-2">
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Top Games by Distribution Value</p>
                          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Rs. value breakdown</p>
                        </div>
                      </div>
                      <div className="px-4 pb-4">
                        <ResponsiveContainer width="100%" height={Math.max(220, games.length * 32)}>
                          <BarChart data={games.slice(0, 12)} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="ticket_name" tick={{ fontSize: 11 }} width={140} />
                            <Tooltip formatter={(v) => [`Rs. ${fmt(Number(v))}`, "Value"]} />
                            <Bar dataKey="total_value" fill="#CF291D" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                      <div className="px-5 py-3" style={{ borderBottom: "2px solid #CF291D", background: "#374151" }}>
                        <span className="font-semibold text-sm text-white">Game-Wise Breakdown</span>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>#</th>
                            <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Game / Ticket</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Qty</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Avg Price</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Value</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoices</th>
                            <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", width: "10rem" }}>Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {games.map((g, i) => {
                            const totalValue = games.reduce((s, x) => s + x.total_value, 0);
                            const share = totalValue > 0 ? (g.total_value / totalValue) * 100 : 0;
                            return (
                              <tr key={g.ticket_name} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                                <td className="px-4 py-3 text-sm" style={{ color: "#9CA3AF", fontWeight: 700, fontSize: 11 }}>{i + 1}</td>
                                <td className="px-4 py-3 text-sm font-medium" style={{ color: "#1D1D1D" }}>{g.ticket_name}</td>
                                <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>{g.total_qty.toLocaleString()}</td>
                                <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>{fmtFull(g.avg_unit_price)}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#CF291D" }}>{fmtFull(g.total_value)}</td>
                                <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>{g.invoice_count}</td>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                                      <div className="h-full rounded-full" style={{ width: `${share}%`, background: "#CF291D" }} />
                                    </div>
                                    <span className="text-xs w-10 text-right" style={{ color: "#9CA3AF" }}>{share.toFixed(1)}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── AGENT PERFORMANCE TAB ── */}
            {activeTab === "agents" && (
              <div className="space-y-5">
                {agents.length === 0 ? (
                  <div className="rounded-2xl p-8 text-center shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#9CA3AF" }}>No agent data.</div>
                ) : (
                  <>
                    <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                      <div className="flex items-start justify-between px-5 pt-4 pb-2">
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Top Agents by Distribution Value</p>
                          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>top 10 by invoice value</p>
                        </div>
                      </div>
                      <div className="px-4 pb-4">
                        <ResponsiveContainer width="100%" height={Math.max(200, agents.slice(0, 10).length * 36)}>
                          <BarChart data={agents.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 90, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                            <Tooltip formatter={(v) => [`Rs. ${fmt(Number(v))}`, "Value"]} />
                            <Bar dataKey="total_value" fill="#CF291D" name="Invoiced" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                      <div className="px-5 py-3" style={{ borderBottom: "2px solid #CF291D", background: "#374151" }}>
                        <span className="font-semibold text-sm text-white">Agent Performance Table</span>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", width: "2rem" }}>#</th>
                            <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Value</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoices</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Outstanding</th>
                            <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Collection %</th>
                            <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", width: "11rem" }}>Progress</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agents.map((a, i) => (
                            <tr key={a.name} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                              <td className="px-4 py-3 text-sm" style={{ color: "#9CA3AF", fontWeight: 700, fontSize: 11 }}>{i + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium" style={{ color: "#1D1D1D" }}>{a.name}</td>
                              <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>Rs. {fmt(a.total_value)}</td>
                              <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>{a.invoice_count}</td>
                              <td className={`px-4 py-3 text-sm text-right font-medium`} style={{ color: a.outstanding > 0 ? "#CF291D" : "#10b981" }}>
                                Rs. {fmt(a.outstanding)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: a.collection_rate >= 90 ? "#10b981" : a.collection_rate >= 60 ? "#f59e0b" : "#CF291D" }}>
                                {a.collection_rate}%
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                                  <div className="h-full rounded-full" style={{
                                    width: `${Math.min(100, a.collection_rate)}%`,
                                    background: a.collection_rate >= 90 ? "#10b981" : a.collection_rate >= 60 ? "#f59e0b" : "#CF291D",
                                  }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── AGING REPORT TAB ── */}
            {activeTab === "aging" && (
              <div className="space-y-5">
                {aging.length > 0 && (
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: "0–7 days", filter: (d: number) => d <= 7, color: "#10b981", light: "#f0fdf4", border: "#bbf7d0" },
                      { label: "8–30 days", filter: (d: number) => d > 7 && d <= 30, color: "#f59e0b", light: "#fffbeb", border: "#fde68a" },
                      { label: "31–60 days", filter: (d: number) => d > 30 && d <= 60, color: "#f97316", light: "#fff7ed", border: "#fed7aa" },
                      { label: ">60 days", filter: (d: number) => d > 60, color: "#CF291D", light: "#FFF1F0", border: "#fecaca" },
                    ].map(({ label, filter, color, light, border }) => {
                      const band = aging.filter((a) => filter(a.days_old));
                      const total = band.reduce((s, a) => s + a.outstanding_balance, 0);
                      return (
                        <div key={label} className="rounded-xl p-4 shadow-sm" style={{ background: light, border: `1px solid ${border}` }}>
                          <div className="text-xs font-medium mb-1" style={{ color }}>{label}</div>
                          <div className="text-xl font-bold" style={{ color }}>Rs. {fmt(total)}</div>
                          <div className="text-xs mt-0.5" style={{ color, opacity: 0.7 }}>{band.length} invoice{band.length !== 1 ? "s" : ""}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                  {aging.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="font-semibold text-sm" style={{ color: "#10b981" }}>All invoices settled — no outstanding balances.</div>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice #</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice Date</th>
                          <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Outstanding (Rs.)</th>
                          <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Days Old</th>
                          <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Age Band</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aging.map((a, i) => {
                          const band =
                            a.days_old <= 7 ? { label: "0–7 days", bg: "#dcfce7", color: "#15803d" }
                            : a.days_old <= 30 ? { label: "8–30 days", bg: "#fef9c3", color: "#a16207" }
                            : a.days_old <= 60 ? { label: "31–60 days", bg: "#ffedd5", color: "#c2410c" }
                            : { label: ">60 days", bg: "#fee2e2", color: "#b91c1c" };
                          return (
                            <tr key={i} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                              <td className="px-4 py-3 text-sm font-medium" style={{ color: "#1D1D1D" }}>{a.name}</td>
                              <td className="px-4 py-3 text-sm font-mono" style={{ color: "#CF291D" }}>{a.invoice_number}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{fmtDate(a.invoice_date)}</td>
                              <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#CF291D" }}>{fmtFull(a.outstanding_balance)}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: a.days_old > 30 ? "#CF291D" : "#6B7280" }}>{a.days_old}</td>
                              <td className="px-4 py-3 text-sm">
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: band.bg, color: band.color }}>{band.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase font-semibold" style={{ color: "#9CA3AF" }}>Total Outstanding</td>
                          <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: "#CF291D" }}>
                            Rs. {fmtFull(aging.reduce((s, a) => s + a.outstanding_balance, 0))}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #CF291D" }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: "#FFF1F0" }}>
        {icon}
      </div>
      <p className="text-xl font-black leading-tight truncate" style={{ color: "#1D1D1D" }}>{value}</p>
      <p className="text-[10px] mt-0.5 font-semibold uppercase" style={{ color: "#9CA3AF" }}>{label}</p>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-48 flex items-center justify-center text-sm" style={{ color: "#9CA3AF" }}>No data yet</div>;
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
