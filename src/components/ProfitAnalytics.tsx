import { useEffect, useState } from "react";
import {
  TrendUp, TrendDown, DollarCircle, ShoppingCart, PercentageCircle,
  Refresh2, Home2, ArrowRight2, Chart21,
} from "iconsax-react";
import { getProfitSummary, getDailyProfitTrend } from "../services/database";
import { useLanguage } from "../i18n";

type Period = 1 | 7 | 30 | 90;

const PERIODS: { value: Period; label: string }[] = [
  { value: 1,  label: "Today"   },
  { value: 7,  label: "7 Days"  },
  { value: 30, label: "30 Days" },
  { value: 90, label: "90 Days" },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
  try { const [,m,dd] = d.split("-"); return `${dd}/${m}`; }
  catch { return d; }
};

const BRAND = "#4285F4";
const DANGER  = "#EA4335";
const SUCCESS = "#34A853";

export default function ProfitAnalytics() {
  const { t, lang } = useLanguage();
  const [period, setPeriod] = useState<Period>(7);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getProfitSummary>> | null>(null);
  const [trend, setTrend]     = useState<Awaited<ReturnType<typeof getDailyProfitTrend>>>([]);
  const [loading, setLoading] = useState(false);

  async function load(p: Period) {
    setLoading(true);
    const [s, tr] = await Promise.all([getProfitSummary(p), getDailyProfitTrend(p)]);
    setSummary(s);
    setTrend(tr);
    setLoading(false);
  }

  useEffect(() => { load(period); }, [period]);

  const maxNet = Math.max(...trend.map(t => Math.abs(t.net)), 1);

  return (
    <div className="animate-fade-in" style={{ background: "var(--color-surface-dim, #F8F9FA)", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9AA0A6" }}>
          <Home2 size={12} variant="Linear" color="#9AA0A6" />
          <ArrowRight2 size={11} variant="Linear" color="#9AA0A6" />
          <span className={`font-semibold ${lang === "si" ? "si" : ""}`} style={{ color: "#202124" }}>
            {t("nav_profit")}
          </span>
        </nav>
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: period === p.value ? BRAND : "#FFFFFF",
                color:      period === p.value ? "#FFFFFF" : "#5F6368",
                border:     `1px solid ${period === p.value ? BRAND : "#E0E3E7"}`,
              }}
              onMouseEnter={e => { if (period !== p.value) e.currentTarget.style.borderColor = BRAND; }}
              onMouseLeave={e => { if (period !== p.value) e.currentTarget.style.borderColor = "#E0E3E7"; }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => load(period)} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", color: "#202124" }}>
            <Refresh2 size={12} variant="Linear" color="currentColor" className={loading ? "animate-spin" : ""} />
            <span className={lang === "si" ? "si" : ""}>{t("action_refresh")}</span>
          </button>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-5">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${lang === "si" ? "si" : ""}`} style={{ color: "#202124" }}>
            {t("nav_profit")}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#9AA0A6" }}>
            Net profit = Invoice Revenue − Cost of Tickets Distributed (COGS) − Commissions paid
          </p>
        </div>

        {/* KPI grid */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
            {/* Revenue */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: `3px solid ${SUCCESS}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${lang === "si" ? "si" : ""}`} style={{ color: "#9AA0A6" }}>
                    {t("total_revenue")}
                  </p>
                  <p className="text-2xl font-black" style={{ color: SUCCESS }}>Rs. {fmt(summary.total_revenue)}</p>
                  <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>{summary.invoice_count} invoices</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#E6F4EA" }}>
                  <DollarCircle size={18} variant="Linear" color={SUCCESS} />
                </div>
              </div>
            </div>

            {/* Stock Cost — financial expense: semantic danger */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: `3px solid ${DANGER}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9AA0A6" }}>Cost of Tickets Distributed</p>
                  <p className="text-2xl font-black" style={{ color: DANGER }}>Rs. {fmt(summary.total_cost)}</p>
                  <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>tickets actually delivered to agents</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#FCE8E6" }}>
                  <ShoppingCart size={18} variant="Linear" color={DANGER} />
                </div>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: `3px solid ${BRAND}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9AA0A6" }}>Gross Profit</p>
                  <p className="text-2xl font-black" style={{ color: summary.gross_profit >= 0 ? BRAND : DANGER }}>
                    Rs. {fmt(summary.gross_profit)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>before commissions</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EAF1FB" }}>
                  {summary.gross_profit >= 0
                    ? <TrendUp   size={18} variant="Linear" color={BRAND} />
                    : <TrendDown size={18} variant="Linear" color={DANGER} />}
                </div>
              </div>
            </div>

            {/* Commission */}
            <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #7c3aed" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9AA0A6" }}>Commission Paid</p>
                  <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>Rs. {fmt(summary.total_commission)}</p>
                  <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>agent commissions</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#F3E8FF" }}>
                  <PercentageCircle size={18} variant="Linear" color="#7c3aed" />
                </div>
              </div>
            </div>

            {/* Net Profit — financial result: positive=success, negative=danger */}
            <div className="rounded-2xl p-5 sm:col-span-2"
              style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", boxShadow: "0 1px 4px rgba(32,33,36,0.06)", borderTop: `3px solid ${summary.net_profit >= 0 ? SUCCESS : DANGER}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${lang === "si" ? "si" : ""}`} style={{ color: "#9AA0A6" }}>
                    {t("net_profit")}
                  </p>
                  <p className="text-4xl font-black" style={{ color: summary.net_profit >= 0 ? SUCCESS : DANGER }}>
                    Rs. {fmt(summary.net_profit)}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "#9AA0A6" }}>Margin: {summary.margin_pct}%</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Breakdown</p>
                  <div className="space-y-1 text-xs" style={{ color: "#5F6368" }}>
                    <div className="flex justify-between gap-8">
                      <span>Revenue</span><span className="font-bold">+{fmt(summary.total_revenue)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span>Stock Cost</span><span className="font-bold" style={{ color: DANGER }}>−{fmt(summary.total_cost)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span>Commission</span><span className="font-bold" style={{ color: DANGER }}>−{fmt(summary.total_commission)}</span>
                    </div>
                    <div className="flex justify-between gap-8 pt-1" style={{ borderTop: "1px solid #E0E3E7" }}>
                      <span className="font-black" style={{ color: "#202124" }}>Net</span>
                      <span className="font-black" style={{ color: summary.net_profit >= 0 ? SUCCESS : DANGER }}>
                        Rs. {fmt(summary.net_profit)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Trend Chart */}
        {trend.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", boxShadow: "0 1px 4px rgba(32,33,36,0.06)" }}>
            <div className="px-5 py-3 flex items-center gap-2"
              style={{ background: "#FFFFFF", borderBottom: "1px solid #E0E3E7", borderLeft: `3px solid ${BRAND}` }}>
              <Chart21 size={15} variant="Linear" color={BRAND} />
              <span className="text-sm font-semibold" style={{ color: "#202124" }}>Daily Net Profit Trend</span>
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
                        <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 whitespace-nowrap"
                          style={{ background: "#202124", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                          {fmtDate(day.day)}: Rs. {fmt(day.net)}
                        </div>
                        <div className="w-full rounded-t-sm transition-all"
                          style={{
                            height: `${height}%`,
                            background: positive
                              ? `linear-gradient(180deg,#4ade80,${SUCCESS})`
                              : `linear-gradient(180deg,#f87171,${DANGER})`,
                          }}/>
                      </div>
                      <span className="text-[9px]" style={{ color: "#BDC1C6" }}>{fmtDate(day.day)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid #F1F3F4" }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: SUCCESS }}/>
                  <span className="text-[10px]" style={{ color: "#9AA0A6" }}>Profit day</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: DANGER }}/>
                  <span className="text-[10px]" style={{ color: "#9AA0A6" }}>Loss day</span>
                </div>
                <span className="text-[10px] ml-auto" style={{ color: "#9AA0A6" }}>Hover bar for details</span>
              </div>
            </div>

            {/* Daily table */}
            <div className="overflow-x-auto" style={{ borderTop: "1px solid #F1F3F4" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#374151" }}>
                    {["Date","Revenue","Stock Cost","Net Profit"].map(h => (
                      <th key={h} className={`px-4 py-2.5 ${h==="Date"?"text-left":"text-right"}`}
                        style={{ fontSize:10, color:"rgba(255,255,255,0.7)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...trend].reverse().map((day, i) => (
                    <tr key={i} className="hover:bg-gray-50/50" style={{ borderTop: "1px solid #F1F3F4" }}>
                      <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#5F6368" }}>{fmtDate(day.day)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-semibold" style={{ color: SUCCESS }}>Rs. {fmt(day.revenue)}</td>
                      <td className="px-4 py-2.5 text-xs text-right" style={{ color: DANGER }}>Rs. {fmt(day.cost)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-bold" style={{ color: day.net >= 0 ? SUCCESS : DANGER }}>
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
          <div className="rounded-2xl p-12 text-center shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>
            <TrendUp size={40} variant="Linear" color="#E0E3E7" className="mx-auto mb-3" />
            <p className={`text-sm font-medium ${lang === "si" ? "si" : ""}`} style={{ color: "#9AA0A6" }}>{t("empty_state")}</p>
            <p className="text-xs mt-1" style={{ color: "#BDC1C6" }}>
              Create purchase invoices and record collections to see profit analytics
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
