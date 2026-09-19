import { useEffect, useState } from "react";
import { Users, TrendingUp, Package, RotateCcw, RefreshCw, Home, ChevronRight, CreditCard } from "lucide-react";
import { getDb } from "../services/database";

interface AgentDistribution {
  agent_id: number;
  name: string;
  phone: string;
  total_invoiced: number;
  total_collected: number;
  collection_rate: number;
  invoice_count: number;
  return_value: number;
  settled_returns: number;
  commission_amount: number;
  live_outstanding: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

async function getDistributionSummary(): Promise<AgentDistribution[]> {
  const d = await getDb();
  return d.select<AgentDistribution[]>(`
    SELECT
      a.id as agent_id,
      a.name,
      a.phone,
      COALESCE(SUM(i.invoice_total), 0) as total_invoiced,
      COALESCE(SUM(i.cash_received + i.dlb_winning + i.nlb_winning), 0) as total_collected,
      CASE WHEN COALESCE(SUM(i.invoice_total), 0) > 0
        THEN ROUND(COALESCE(SUM(i.cash_received + i.dlb_winning + i.nlb_winning), 0)
             / COALESCE(SUM(i.invoice_total), 1) * 100, 1)
        ELSE 0
      END as collection_rate,
      COUNT(DISTINCT i.id) as invoice_count,
      COALESCE((SELECT SUM(tr.total_value) FROM ticket_returns tr WHERE tr.agent_id = a.id), 0) as return_value,
      COALESCE((SELECT SUM(tr.total_value) FROM ticket_returns tr WHERE tr.agent_id = a.id AND tr.status='settled'), 0) as settled_returns,
      COALESCE((
        SELECT SUM(
          CASE cs.commission_type
            WHEN 'percentage' THEN i2.invoice_total * cs.rate / 100.0
            WHEN 'per_ticket' THEN (SELECT COALESCE(SUM(ii.qty),0) FROM invoice_items ii WHERE ii.invoice_id=i2.id) * cs.rate
            ELSE cs.rate
          END
        )
        FROM invoices i2
        LEFT JOIN commission_schemes cs ON (cs.agent_id = a.id OR cs.agent_id IS NULL) AND cs.is_active=1
        WHERE i2.agent_id = a.id
      ), 0) as commission_amount,
      COALESCE((
        SELECT SUM(
          i3.outstanding_balance
          - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i3.id), 0)
          - COALESCE((SELECT SUM(tr.total_value) FROM ticket_returns tr
                      WHERE tr.invoice_id=i3.id AND tr.status='settled'), 0)
        )
        FROM invoices i3 WHERE i3.agent_id = a.id
          AND COALESCE(i3.invoice_status,'paid') NOT IN ('draft','cancelled')
      ), 0) as live_outstanding
    FROM agents a
    LEFT JOIN invoices i ON i.agent_id = a.id
    GROUP BY a.id, a.name, a.phone
    ORDER BY total_invoiced DESC
  `);
}

export default function DistributionSummary() {
  const [data, setData]     = useState<AgentDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setData(await getDistributionSummary());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = data.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce((acc, a) => ({
    invoiced: acc.invoiced + a.total_invoiced,
    collected: acc.collected + a.total_collected,
    returns: acc.returns + a.return_value,
    outstanding: acc.outstanding + Math.max(0, a.live_outstanding),
    commission: acc.commission + a.commission_amount,
  }), { invoiced: 0, collected: 0, returns: 0, outstanding: 0, commission: 0 });

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Distribution Summary</span>
        </nav>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh
        </button>
      </div>

      <div className="px-6 pb-8 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Sub-Agent Distribution</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              Per-agent stock, collections, returns, commission and outstanding balance
            </p>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agent…"
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", width: 200 }}/>
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label:"Total Invoiced",  val: totals.invoiced,    color:"#2563eb", icon:<Package size={16}/> },
            { label:"Collected",       val: totals.collected,   color:"#16a34a", icon:<TrendingUp size={16}/> },
            { label:"Returns",         val: totals.returns,     color:"#7c3aed", icon:<RotateCcw size={16}/> },
            { label:"Commission",      val: totals.commission,  color:"#d97706", icon:<CreditCard size={16}/> },
            { label:"Outstanding",     val: totals.outstanding, color:"#CF291D", icon:<Users size={16}/> },
          ].map(c => (
            <div key={c.label} className="rounded-xl p-4 shadow-sm"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: `3px solid ${c.color}` }}>
              <div className="flex items-center gap-2 mb-1.5" style={{ color: c.color }}>{c.icon}</div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>{c.label}</p>
              <p className="text-lg font-black" style={{ color: c.color }}>Rs. {fmt(c.val)}</p>
            </div>
          ))}
        </div>

        {/* Agent table */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ background: "linear-gradient(135deg,#1D1D1D,#374151)", borderBottom: "2px solid #CF291D" }}>
            <span className="text-sm font-semibold text-white">Agent Performance & Balance</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>
              {filtered.length} agents
            </span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Users size={36} className="mx-auto mb-2" style={{ color: "#E8E8E8" }}/>
              <p className="text-sm" style={{ color: "#9CA3AF" }}>No agents found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#F9F9F9" }}>
                    {["Agent","Invoices","Total Invoiced","Collected","Coll. Rate","Returns","Commission","Live Balance","Status"].map(h => (
                      <th key={h} className={`px-4 py-3 ${h==="Agent"?"text-left":"text-right"} last:text-center`}
                        style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => {
                    const live = Math.max(0, a.live_outstanding);
                    const rate = a.collection_rate;
                    const rateColor = rate >= 90 ? "#16a34a" : rate >= 70 ? "#d97706" : "#CF291D";
                    return (
                      <tr key={a.agent_id} className="hover:bg-gray-50/60 transition-colors"
                        style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold" style={{ color: "#1D1D1D" }}>{a.name}</p>
                          {a.phone && <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{a.phone}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>{a.invoice_count}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#1D1D1D" }}>Rs. {fmt(a.total_invoiced)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#16a34a" }}>Rs. {fmt(a.total_collected)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={{ background: `${rateColor}18`, color: rateColor }}>
                            {rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#7c3aed" }}>
                          {a.return_value > 0 ? `Rs. ${fmt(a.return_value)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#d97706" }}>
                          {a.commission_amount > 0 ? `Rs. ${fmt(a.commission_amount)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold"
                          style={{ color: live > 0 ? "#CF291D" : "#16a34a" }}>
                          Rs. {fmt(live)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{
                              background: live <= 0 ? "#DCFCE7" : "#FEE2E2",
                              color:      live <= 0 ? "#16a34a" : "#CF291D",
                            }}>
                            {live <= 0 ? "Settled" : "Owing"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                    <td className="px-4 py-3 text-xs font-semibold uppercase text-right" style={{ color: "#9CA3AF" }} colSpan={2}>Totals</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-white">{fmt(totals.invoiced)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#4ade80" }}>{fmt(totals.collected)}</td>
                    <td/>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#c4b5fd" }}>{fmt(totals.returns)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#fde68a" }}>{fmt(totals.commission)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#f87171" }}>{fmt(totals.outstanding)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
