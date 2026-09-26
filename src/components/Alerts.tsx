import { useEffect, useRef, useState } from "react";
import {
  Bell, Copy, RefreshCw, CheckCircle,
  AlertTriangle, XCircle, Clock, Home, ChevronRight, ChevronDown, ChevronUp,
  ShoppingCart, TrendingDown, MessageCircle, Send, Package, Filter,
} from "lucide-react";
import {
  getAgingReport, getLowStockBatches, getAgents,
  getCompanySettings, getSupplierAging, getSupplierOutstanding,
} from "../services/database";
import type { AgingEntry, CompanySettings, Agent, SupplierAgingBracket } from "../types";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentAlert {
  agent: Agent;
  entries: AgingEntry[];
  totalOutstanding: number;
  maxDays: number;
}

type ReminderLang = "en" | "si" | "ta";
type SectionFilter = "all" | "agents" | "stock";

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}

// ── Urgency helpers ───────────────────────────────────────────────────────────

function urgencyColor(days: number) {
  if (days <= 7)  return { color: "#16a34a", bg: "#DCFCE7", border: "#BBF7D0", label: "Current" };
  if (days <= 30) return { color: "#d97706", bg: "#FEF9C3", border: "#FDE68A", label: "Overdue" };
  if (days <= 60) return { color: "#ea580c", bg: "#FFEDD5", border: "#FED7AA", label: "High Risk" };
  return { color: "#CF291D", bg: "#FEE2E2", border: "#FECACA", label: "Critical" };
}

function urgencyIcon(days: number) {
  if (days <= 7)  return <CheckCircle size={13} />;
  if (days <= 30) return <Clock size={13} />;
  if (days <= 60) return <AlertTriangle size={13} />;
  return <XCircle size={13} />;
}

// ── Message builders (tri-lingual) ───────────────────────────────────────────

function buildMessage(alert: AgentAlert, co: CompanySettings, lang: ReminderLang): string {
  const f = (n: number) => `Rs. ${fmt(n)}`;
  const topLines = alert.entries.slice(0, 3).map(e =>
    `• Invoice #${e.invoice_number} — ${f(e.outstanding_balance)} (${e.days_old}d)`
  ).join("\n");

  if (lang === "si") {
    return [
      `📋 *${co.name}*`,
      `*ගෙවීම් සිහිකැඳවීම*`,
      ``,
      `ආදරණීය *${alert.agent.name}*,`,
      ``,
      `ඔබගේ ශේෂ ගෙවීම් සම්බන්ධයෙන් මතකයට නංවා සිටිමු:`,
      ``,
      `💰 *ශේෂය: ${f(alert.totalOutstanding)}*`,
      ``,
      topLines,
      ``,
      `කළින් ඉක්මනින් ගෙවීමට කටයුතු කරන්න.`,
      ``,
      `📞 ${co.phone}`,
      ``,
      `ස්තූතියි 🙏`,
    ].join("\n");
  }

  if (lang === "ta") {
    return [
      `📋 *${co.name}*`,
      `*கட்டண நினைவூட்டல்*`,
      ``,
      `அன்புள்ள *${alert.agent.name}*,`,
      ``,
      `உங்கள் நிலுவைத் தொகை பற்றி தெரிவிக்கிறோம்:`,
      ``,
      `💰 *நிலுவை: ${f(alert.totalOutstanding)}*`,
      ``,
      topLines,
      ``,
      `விரைவில் கட்டணம் செலுத்துமாறு கேட்டுக்கொள்கிறோம்.`,
      ``,
      `📞 ${co.phone}`,
      ``,
      `நன்றி 🙏`,
    ].join("\n");
  }

  // English (default)
  return [
    `📋 *${co.name}*`,
    `*Payment Reminder*`,
    ``,
    `Dear *${alert.agent.name}*,`,
    ``,
    `This is a reminder regarding your outstanding balance:`,
    ``,
    `💰 *Outstanding: ${f(alert.totalOutstanding)}*`,
    ``,
    topLines,
    ``,
    `Please arrange payment at your earliest convenience.`,
    ``,
    `📞 ${co.phone}`,
    ``,
    `Thank you 🙏`,
  ].join("\n");
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Alerts() {
  const [agentAlerts, setAgentAlerts]   = useState<AgentAlert[]>([]);
  const [lowStock, setLowStock]         = useState<{ game_name: string; remaining_qty: number; low_stock_threshold: number }[]>([]);
  const [company, setCompany]           = useState<CompanySettings | null>(null);
  const [loading, setLoading]           = useState(true);
  const [supplierAging, setSupplierAging] = useState<SupplierAgingBracket[]>([]);
  const [supplierOwed, setSupplierOwed]   = useState(0);

  // UI state
  const [lang, setLang]                 = useState<ReminderLang>("en");
  const [copiedId, setCopiedId]         = useState<number | null>(null);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [section, setSection]           = useState<SectionFilter>("all");
  const [batchSending, setBatchSending] = useState(false);

  // Section refs for scroll-to
  const agentsRef = useRef<HTMLDivElement>(null);
  const stockRef  = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    const [aging, stock, agentList, co, sAging, sOwed] = await Promise.all([
      getAgingReport(), getLowStockBatches(), getAgents(),
      getCompanySettings(), getSupplierAging(), getSupplierOutstanding(),
    ]);
    setSupplierAging(sAging);
    setSupplierOwed(sOwed);
    setLowStock(stock);
    setCompany(co);

    const map = new Map<number, AgentAlert>();
    for (const entry of aging) {
      if (!map.has(entry.agent_id)) {
        const agent = agentList.find(a => a.id === entry.agent_id) ?? {
          id: entry.agent_id, name: entry.name, nlb_reg: "", dlb_reg: "",
          phone: "", address: "", nic_number: "", bank_name: "", bank_account: "", photo: "",
        };
        map.set(entry.agent_id, { agent, entries: [], totalOutstanding: 0, maxDays: 0 });
      }
      const a = map.get(entry.agent_id)!;
      a.entries.push(entry);
      a.totalOutstanding += entry.outstanding_balance;
      a.maxDays = Math.max(a.maxDays, entry.days_old);
    }
    setAgentAlerts(Array.from(map.values()).sort((a, b) => b.maxDays - a.maxDays));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function sendWhatsApp(alert: AgentAlert) {
    if (!company) return;
    const msg  = encodeURIComponent(buildMessage(alert, company, lang));
    const raw  = alert.agent.phone?.replace(/\D/g, "") ?? "";
    const num  = raw.startsWith("0") ? "94" + raw.slice(1) : raw;
    window.open(num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
  }

  function copyMsg(alert: AgentAlert) {
    if (!company) return;
    navigator.clipboard.writeText(buildMessage(alert, company, lang)).then(() => {
      setCopiedId(alert.agent.id!);
      setTimeout(() => setCopiedId(null), 2500);
    });
  }

  // Batch: open WhatsApp for all critical/high overdue agents sequentially
  function sendBatchReminders() {
    setBatchSending(true);
    const targets = agentAlerts.filter(a => a.maxDays > 7);
    targets.forEach((alert, i) => {
      setTimeout(() => {
        sendWhatsApp(alert);
        if (i === targets.length - 1) setBatchSending(false);
      }, i * 800);
    });
    if (!targets.length) setBatchSending(false);
  }

  const totalAlertOutstanding = agentAlerts.reduce((s, a) => s + a.totalOutstanding, 0);
  const criticalCount = agentAlerts.filter(a => a.maxDays > 60).length;

  const LANG_LABELS: Record<ReminderLang, string> = { en: "English", si: "සිංහල", ta: "தமிழ்" };

  // ── Section scroll helper ─────────────────────────────────────────────────
  function handleSectionCard(s: SectionFilter) {
    setSection(s);
    setTimeout(() => {
      if (s === "agents") agentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (s === "stock")  stockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>

      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Alerts & Reminders</span>
        </nav>
        <div className="flex gap-2">
          {agentAlerts.filter(a => a.maxDays > 7).length > 0 && (
            <button onClick={sendBatchReminders} disabled={batchSending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-60 transition-all hover:opacity-90"
              style={{ background: "#25D366" }}>
              <Send size={13}/>
              {batchSending ? "Sending…" : `WhatsApp All (${agentAlerts.filter(a => a.maxDays > 7).length})`}
            </button>
          )}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-4">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Alerts & Reminders</h1>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Overdue balances, supplier dues, low stock, multi-lingual WhatsApp reminders</p>
        </div>

        {/* ── Supplier Dues ── */}
        {(supplierOwed > 0 || supplierAging.length > 0) && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-5 py-3.5 flex items-center gap-3"
              style={{ background: "linear-gradient(135deg,#7f1d1d,#CF291D)", borderBottom: "2px solid #B50717" }}>
              <ShoppingCart size={16} className="text-white"/>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Nimalsiri Enterprises — Supplier Dues</p>
                <p className="text-[11px] text-white/70">Outstanding balance owed for ticket stock purchases</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase text-white/60">Total Owed</p>
                <p className="text-xl font-black text-white">Rs. {fmt(supplierOwed)}</p>
              </div>
            </div>
            {supplierAging.length > 0 && (
              <div className="p-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${supplierAging.length}, 1fr)` }}>
                {supplierAging.map(b => {
                  const c = b.days_max <= 7 ? "#16a34a" : b.days_max <= 14 ? "#d97706" : b.days_max <= 30 ? "#ea580c" : "#CF291D";
                  return (
                    <div key={b.bracket} className="rounded-lg p-3 text-center"
                      style={{ background: "#FFF8F8", border: `1px solid ${c}25` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: c }}>{b.bracket}</p>
                      <p className="text-base font-black" style={{ color: c }}>Rs. {fmt(b.total_outstanding)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{b.count} inv.</p>
                    </div>
                  );
                })}
              </div>
            )}
            {supplierOwed > 50000 && (
              <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "#FEF9C3", border: "1px solid #FDE68A" }}>
                <TrendingDown size={13} style={{ color: "#d97706" }}/>
                <p className="text-xs font-medium" style={{ color: "#92400e" }}>
                  Rs. {fmt(supplierOwed)} owed to Nimalsiri — go to <strong>Stock Purchases</strong> to record payments.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Clickable metric cards ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              key: "agents" as SectionFilter,
              color: "#CF291D", bg: "#FEF2F2", border: "#FECACA",
              icon: <Bell size={15} style={{ color: "#CF291D" }}/>,
              value: agentAlerts.length,
              label: "Agents Outstanding",
              sub: `Rs. ${fmt(totalAlertOutstanding)} total`,
            },
            {
              key: "agents" as SectionFilter,
              color: "#ea580c", bg: "#FFF7ED", border: "#FED7AA",
              icon: <XCircle size={15} style={{ color: "#ea580c" }}/>,
              value: criticalCount,
              label: "Critical >60d",
              sub: "agents need urgent action",
            },
            {
              key: "stock" as SectionFilter,
              color: "#d97706", bg: "#FFFBEB", border: "#FDE68A",
              icon: <Package size={15} style={{ color: "#d97706" }}/>,
              value: lowStock.length,
              label: "Low Stock Batches",
              sub: "below minimum threshold",
            },
          ].map((c, i) => (
            <button key={i} onClick={() => handleSectionCard(c.key)}
              className="rounded-xl p-4 shadow-sm text-left transition-all hover:shadow-md active:scale-95"
              style={{ background: "#FFFFFF", border: `1px solid ${section === c.key ? c.color : "#E8E8E8"}`,
                borderTop: `3px solid ${c.color}`,
                boxShadow: section === c.key ? `0 0 0 2px ${c.color}20` : undefined }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: c.bg }}>
                {c.icon}
              </div>
              <p className="text-2xl font-black leading-tight" style={{ color: c.color }}>{c.value}</p>
              <p className="text-[10px] mt-0.5 font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{c.label}</p>
              <p className="text-xs mt-1" style={{ color: "#6B7280" }}>{c.sub}</p>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold" style={{ color: c.color }}>
                <Filter size={9}/> Click to filter
              </div>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center" style={{ color: "#9CA3AF" }}>Loading alerts…</div>
        ) : (
          <>
            {/* ── Payment Reminders ── */}
            {(section === "all" || section === "agents") && (
              <div ref={agentsRef} className="rounded-2xl overflow-hidden shadow-sm"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>

                {/* Section header with language selector */}
                <div className="px-4 py-3 flex items-center gap-3"
                  style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
                  <Bell size={14} style={{ color: "#CF291D" }}/>
                  <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Payment Reminders</span>
                  {agentAlerts.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "#FEE2E2", color: "#CF291D" }}>
                      {agentAlerts.length}
                    </span>
                  )}

                  {/* Language selector */}
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[10px] font-semibold mr-1" style={{ color: "#9CA3AF" }}>Reminder Language:</span>
                    {(["en","si","ta"] as ReminderLang[]).map(l => (
                      <button key={l} onClick={() => setLang(l)}
                        className="px-2.5 py-1 text-[11px] font-semibold transition-all"
                        style={{
                          borderRadius: 6,
                          border: `1.5px solid ${lang === l ? "#2563EB" : "#E8E8E8"}`,
                          background: lang === l ? "#2563EB" : "#FFFFFF",
                          color: lang === l ? "#FFFFFF" : "#6B7280",
                        }}>
                        {LANG_LABELS[l]}
                      </button>
                    ))}
                  </div>
                </div>

                {agentAlerts.length === 0 ? (
                  <div className="p-10 text-center">
                    <CheckCircle size={28} className="mx-auto mb-2" style={{ color: "#16a34a" }}/>
                    <p className="font-semibold text-sm" style={{ color: "#16a34a" }}>All accounts settled</p>
                    <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>No outstanding balances across all agents</p>
                  </div>
                ) : (
                  <div>
                    {/* Column headers */}
                    <div className="px-4 py-2 grid gap-3"
                      style={{ gridTemplateColumns: "2fr 1fr 1fr 1.5fr auto", borderBottom: "1px solid #F3F4F6", background: "#F9FAFB" }}>
                      {["Agent / Phone","Overdue","Invoices","Outstanding","Actions"].map(h => (
                        <p key={h} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</p>
                      ))}
                    </div>

                    {/* Compact agent rows */}
                    {agentAlerts.map(alert => {
                      const uc = urgencyColor(alert.maxDays);
                      const isExpanded = expandedId === alert.agent.id;
                      const isCopied   = copiedId   === alert.agent.id;
                      return (
                        <div key={alert.agent.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                          {/* Main compact row */}
                          <div className="px-4 py-3 grid gap-3 items-center hover:bg-gray-50/50 transition-colors"
                            style={{ gridTemplateColumns: "2fr 1fr 1fr 1.5fr auto", borderLeft: `3px solid ${uc.color}` }}>

                            {/* Agent name + phone */}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: "#1D1D1D" }}>{alert.agent.name}</p>
                              {alert.agent.phone && (
                                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{alert.agent.phone}</p>
                              )}
                            </div>

                            {/* Overdue badge */}
                            <div className="flex items-center gap-1.5">
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold"
                                style={{ background: uc.bg, color: uc.color, border: `1px solid ${uc.border}` }}>
                                {urgencyIcon(alert.maxDays)} {alert.maxDays}d
                              </span>
                            </div>

                            {/* Invoice count */}
                            <p className="text-xs font-medium" style={{ color: "#6B7280" }}>
                              {alert.entries.length} inv.
                            </p>

                            {/* Outstanding amount */}
                            <p className="text-sm font-black" style={{ color: "#CF291D" }}>
                              Rs. {fmt(alert.totalOutstanding)}
                            </p>

                            {/* Action icons */}
                            <div className="flex items-center gap-1">
                              {/* WhatsApp */}
                              <button onClick={() => sendWhatsApp(alert)} title="Send WhatsApp reminder"
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                style={{ background: "#DCFCE7", color: "#16a34a" }}>
                                <MessageCircle size={13}/>
                              </button>

                              {/* Copy */}
                              <button onClick={() => copyMsg(alert)} title="Copy message"
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                style={{
                                  background: isCopied ? "#DCFCE7" : "#F3F4F6",
                                  color: isCopied ? "#16a34a" : "#6B7280",
                                }}>
                                {isCopied ? <CheckCircle size={12}/> : <Copy size={12}/>}
                              </button>

                              {/* Expand */}
                              <button onClick={() => setExpandedId(isExpanded ? null : alert.agent.id!)}
                                title="Show invoices"
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                style={{ background: isExpanded ? "#EFF6FF" : "#F3F4F6", color: isExpanded ? "#2563EB" : "#6B7280" }}>
                                {isExpanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                              </button>
                            </div>
                          </div>

                          {/* Expanded invoice detail */}
                          {isExpanded && (
                            <div className="px-4 py-3" style={{ background: "#FAFAFA", borderTop: "1px solid #F3F4F6" }}>
                              <table className="w-full">
                                <thead>
                                  <tr>
                                    {["Invoice #","Date","Outstanding","Days Old"].map(h => (
                                      <th key={h} className={`pb-2 text-[10px] font-bold uppercase tracking-wider ${h === "Invoice #" || h === "Date" ? "text-left" : "text-right"}`}
                                        style={{ color: "#9CA3AF" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {alert.entries.map((e, i) => (
                                    <tr key={i} style={{ borderTop: "1px solid #F0F0F0" }}>
                                      <td className="py-1.5 text-xs font-mono font-semibold" style={{ color: "#CF291D" }}>#{e.invoice_number}</td>
                                      <td className="py-1.5 text-xs" style={{ color: "#6B7280" }}>{fmtDate(e.invoice_date)}</td>
                                      <td className="py-1.5 text-xs text-right font-semibold" style={{ color: "#CF291D" }}>Rs. {fmt(e.outstanding_balance)}</td>
                                      <td className="py-1.5 text-xs text-right font-semibold"
                                        style={{ color: e.days_old > 30 ? "#CF291D" : "#6B7280" }}>{e.days_old}d</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Footer totals row */}
                    <div className="px-4 py-2.5 flex items-center justify-between"
                      style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                        {agentAlerts.length} agents · {agentAlerts.reduce((s,a)=>s+a.entries.length,0)} invoices
                      </span>
                      <span className="text-sm font-black" style={{ color: "#f87171" }}>
                        Total: Rs. {fmt(totalAlertOutstanding)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Low Stock Alerts ── */}
            {lowStock.length > 0 && (section === "all" || section === "stock") && (
              <div ref={stockRef} className="rounded-2xl overflow-hidden shadow-sm"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #d97706" }}>
                  <AlertTriangle size={14} style={{ color: "#d97706" }}/>
                  <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Low Stock Alerts</span>
                  <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "#FEF9C3", color: "#d97706" }}>{lowStock.length}</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Game","Remaining","Threshold","Status"].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider ${h==="Game"?"text-left":"text-right last:text-left"}`}
                          style={{ color: "#9CA3AF" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map(s => (
                      <tr key={s.game_name} className="hover:bg-gray-50/50 transition-colors"
                        style={{ borderTop: "1px solid #F3F4F6" }}>
                        <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "#1D1D1D" }}>{s.game_name}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-bold"
                          style={{ color: s.remaining_qty === 0 ? "#CF291D" : "#ea580c" }}>
                          {s.remaining_qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right" style={{ color: "#6B7280" }}>
                          {s.low_stock_threshold.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold"
                            style={{
                              background: s.remaining_qty === 0 ? "#FEE2E2" : "#FEF9C3",
                              color: s.remaining_qty === 0 ? "#b91c1c" : "#a16207",
                            }}>
                            {s.remaining_qty === 0 ? "⚠ Out of Stock" : "Low Stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reset filter */}
            {section !== "all" && (
              <div className="text-center">
                <button onClick={() => setSection("all")}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#6B7280" }}>
                  ✕ Clear filter — show all
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
