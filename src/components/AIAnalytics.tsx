import { useEffect, useState, useRef } from "react";
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  RefreshCw, Home, ChevronRight, Lightbulb,
  Users, Package, ShoppingCart, Send, Copy, ArrowRight,
  Zap, ShieldAlert, X, Play,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  getPeriodStats, getAgentRiskScores, getInventoryVelocity,
  getMonthlyRevenueTrend, getSupplierOutstanding,
  getPayrollSummary, getWorkers, getAgents,
} from "../services/database";
import type { AgentRiskScore } from "../services/database";
import type { View, Worker } from "../types";
import {
  buildOptimalPrompt, parseAiActions, stripActionTags,
  tryParseJsonSummary,
  type AILanguage, type ParsedAction, type AiJsonSummary,
} from "../utils/aiPrompt";
import { useAuth } from "../contexts/AuthContext";

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtMonth = (m: string) => {
  try {
    const [y, mo] = m.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
  } catch { return m; }
};

// ── Types ─────────────────────────────────────────────────────────────────────

type PeriodStats = {
  invoice_count: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  total_tickets: number;
};
type TrendRow    = { month: string; revenue: number; cost: number; salary: number; net: number };
type VelocityRow = { game_name: string; total_qty: number; distributed_qty: number; velocity_pct: number; days_remaining: number };
type PayrollSummary = { total_payroll: number; pending: number; paid: number; worker_count: number };

interface ChatMessage {
  role: "user" | "assistant" | "action-pending" | "action-result";
  content: string;
  timestamp: Date;
  actions?: ParsedAction[];   // parsed from assistant message
  actionResult?: string;       // result of executed action
}

interface Props { onNavigate: (view: View) => void; }

// ── Risk helpers ──────────────────────────────────────────────────────────────

const RISK_COLOR: Record<AgentRiskScore["risk_level"], string> = {
  critical: "#DC2626", high: "#EA580C", medium: "#D97706", low: "#16A34A",
};
const RISK_BG: Record<AgentRiskScore["risk_level"], string> = {
  critical: "#FEE2E2", high: "#FFEDD5", medium: "#FEF9C3", low: "#DCFCE7",
};

// ── Quick prompt definitions ──────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { icon: "📊", label: "Executive summary",       text: "Provide an executive business summary" },
  { icon: "🚨", label: "Critical agent alerts",   text: "Show critical agent follow-up alerts" },
  { icon: "📦", label: "Inventory reorder plan",  text: "Give me an inventory reorder plan" },
  { icon: "💰", label: "Profit tips",             text: "How can I improve profitability?" },
  { icon: "👥", label: "Payroll analysis",        text: "Analyze payroll vs revenue ratio" },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SK({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return (
    <div className="animate-pulse"
      style={{ height: h, width: w, borderRadius: 4, background: "#E5E7EB" }}/>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AIAnalytics({ onNavigate }: Props) {
  const { adminToken, withAdminToken } = useAuth();
  const [loading, setLoading]         = useState(true);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [agentRisks, setAgentRisks]   = useState<AgentRiskScore[]>([]);
  const [velocity, setVelocity]       = useState<VelocityRow[]>([]);
  const [trend, setTrend]             = useState<TrendRow[]>([]);
  const [supplierOB, setSupplierOB]   = useState(0);
  const [payroll, setPayroll]         = useState<PayrollSummary | null>(null);
  const [workers, setWorkers]         = useState<Worker[]>([]);
  const [allAgents, setAllAgents]     = useState<{ id: number; name: string; credit_limit: number; outstanding_balance: number }[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Chat state
  const [aiLanguage, setAiLanguage]     = useState<AILanguage>("en");
  const [chatInput, setChatInput]       = useState("");
  const [chatHistory, setChatHistory]   = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiError, setAiError]           = useState<string | null>(null);
  const [executingAction, setExecuting] = useState<string | null>(null);
  const [lastTokenSaving, setTokenSaving] = useState<"minimal" | "medium" | "full" | "direct" | null>(null);
  const [, setJsonSummary]   = useState<AiJsonSummary | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const month = new Date().toISOString().substring(0, 7);
      const [ps, ar, iv, mt, so, pay, ws, ag] = await Promise.all([
        getPeriodStats(30), getAgentRiskScores(), getInventoryVelocity(),
        getMonthlyRevenueTrend(6), getSupplierOutstanding(),
        getPayrollSummary(month), getWorkers(), getAgents(),
      ]);
      setPeriodStats(ps); setAgentRisks(ar); setVelocity(iv);
      setTrend(mt); setSupplierOB(so); setPayroll(pay);
      setWorkers(ws);
      setAllAgents(ag.map(a => ({
        id: a.id ?? 0,
        name: a.name,
        credit_limit: a.credit_limit ?? 0,
        outstanding_balance: 0, // will be from agentRisks
      })));
      setLastUpdated(new Date());
    } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  async function sendAiQuery(query?: string) {
    const userText = (query ?? chatInput).trim();
    setAiError(null);

    // ── Build business data snapshot ──────────────────────────────────────────
    const collRate = periodStats && periodStats.total_invoiced > 0
      ? Math.round((periodStats.total_collected / periodStats.total_invoiced) * 100) : 0;

    const businessData = {
      revenue:    periodStats?.total_collected ?? 0,
      stockCost:  supplierOB,
      payroll:    payroll?.total_payroll ?? 0,
      netProfit:  (periodStats?.total_collected ?? 0) - supplierOB - (payroll?.total_payroll ?? 0),
      margin: periodStats && periodStats.total_collected > 0
        ? ((periodStats.total_collected - supplierOB - (payroll?.total_payroll ?? 0)) / periodStats.total_collected) * 100 : 0,
      collectionRate: collRate,
      supplierOwed: supplierOB,
      periodDays: 30,
      criticalAgents: agentRisks.map(a => ({
        id: a.agent_id,
        name: a.name,
        outstanding: a.live_outstanding,
        overdueDays: a.max_days_overdue,
        creditLimit: allAgents.find(ag => ag.id === a.agent_id)?.credit_limit ?? 0,
        riskLevel: a.risk_level,
      })),
      inventoryStatus: velocity.map(v => ({
        game_name: v.game_name,
        remaining: v.total_qty - v.distributed_qty,
        total: v.total_qty,
        velocity_pct: v.velocity_pct,
        days_remaining: v.days_remaining > 998 ? 999 : v.days_remaining,
      })),
      payrollSummary: {
        totalWorkers: workers.filter(w => w.is_active).length,
        totalPayroll: payroll?.total_payroll ?? 0,
      },
    };

    // ── Strategy 1-4: Smart routing via buildOptimalPrompt ────────────────────
    const decision = buildOptimalPrompt(businessData, aiLanguage, userText || undefined);
    setTokenSaving(decision.bypassedAi ? "direct" : decision.tokenEstimate);

    setChatHistory(h => [...h, {
      role: "user",
      content: userText || "📊 Generate autonomous executive summary",
      timestamp: new Date(),
    }]);
    setChatInput("");

    // ── Strategy 3: Direct DB response — no AI token spend ────────────────────
    if (decision.bypassedAi && decision.directContent) {
      setChatHistory(h => [...h, {
        role: "assistant",
        content: `⚡ Direct DB Response (0 tokens)\n\n${decision.directContent}`,
        timestamp: new Date(),
      }]);
      return;
    }

    setAiLoading(true);
    try {
      const response = await invoke<string>("ai_query", { prompt: decision.prompt });

      // ── Strategy 2: Parse JSON summary if expected ─────────────────────────
      if (decision.isJson) {
        const parsed = tryParseJsonSummary(response);
        if (parsed) {
          setJsonSummary(parsed);
          setChatHistory(h => [...h, {
            role: "assistant",
            content: `📊 **Executive Summary** (structured)\n• Health Score: ${parsed.healthScore}/100 — ${parsed.healthGrade}\n• Revenue: Rs. ${parsed.financialSnapshot.revenue.toLocaleString("en-LK", { minimumFractionDigits: 2 })}\n• Net Profit: Rs. ${parsed.financialSnapshot.netProfit.toLocaleString("en-LK", { minimumFractionDigits: 2 })}\n• Collection Rate: ${parsed.financialSnapshot.collectionRate}%\n\n**Top Alerts:**\n${parsed.topAlerts.map(a => `• [${a.priority.toUpperCase()}] ${a.message}`).join("\n")}\n\n**Recommended Actions:**\n${parsed.topActions.map(a => `• ${a.action} → ${a.target}: ${a.reason}`).join("\n")}`,
            timestamp: new Date(),
          }]);
          return;
        }
      }

      // ── Standard response with action tag parsing ──────────────────────────
      const actions = parseAiActions(response);
      const cleanContent = stripActionTags(response);

      setChatHistory(h => [...h, {
        role: "assistant",
        content: cleanContent,
        timestamp: new Date(),
        actions: actions.length > 0 ? actions : undefined,
      }]);
    } catch (err) {
      const msg = String(err);
      setAiError(msg);
      setChatHistory(h => [...h, { role: "assistant", content: `⚠ ${msg}`, timestamp: new Date() }]);
    } finally { setAiLoading(false); }
  }

  // ── Execute an AI-triggered action (requires admin token) ─────────────────
  async function executeAction(action: ParsedAction, msgIdx: number) {
    setExecuting(action.raw);
    try {
      await withAdminToken(async (token) => {
        const result = await invoke<{ success: boolean; message: string }>("execute_ai_action", {
          token,
          actionType: action.actionType,
          targetId:   action.targetId,
          params:     action.params || null,
        });
        // Append result as a new chat message
        setChatHistory(h => [...h, {
          role: "action-result",
          content: result.message,
          timestamp: new Date(),
          actionResult: action.actionType,
        }]);
        // Clear the action from the parent message
        setChatHistory(h => h.map((m, i) =>
          i === msgIdx ? { ...m, actions: m.actions?.filter(a => a.raw !== action.raw) } : m
        ));
        // Reload data so metrics reflect the change
        loadData();
      });
    } catch (err) {
      setChatHistory(h => [...h, {
        role: "action-result",
        content: `⚠ Action failed: ${String(err)}`,
        timestamp: new Date(),
        actionResult: "error",
      }]);
    } finally {
      setExecuting(null);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const collRate = periodStats && periodStats.total_invoiced > 0
    ? Math.round((periodStats.total_collected / periodStats.total_invoiced) * 100) : 0;
  const netProfit = (periodStats?.total_collected ?? 0) - supplierOB - (payroll?.total_payroll ?? 0);

  // Health score
  let score = 0;
  if (collRate >= 80)                 score += 30;
  else if (collRate >= 60)            score += 15;
  if (supplierOB < 100000)            score += 20;
  else if (supplierOB < 300000)       score += 10;
  if (!agentRisks.some(a => a.risk_level === "critical")) score += 20;
  else if (!agentRisks.some(a => a.risk_level === "high")) score += 10;
  if (velocity.every(v => v.velocity_pct < 80))           score += 15;
  else if (velocity.every(v => v.velocity_pct < 90))      score += 8;
  if (netProfit > 0) score += 15;
  score = Math.min(100, score);
  const grade = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Attention";
  const scoreColor = score >= 80 ? "#16A34A" : score >= 60 ? "#2563EB" : score >= 40 ? "#D97706" : "#DC2626";

  const maxTrend = Math.max(...trend.map(t => t.revenue), 1);

  // ── Shared card style ─────────────────────────────────────────────────────

  const card = {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  } as const;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: "#F5F5F5", overflow: "hidden" }}>

      {/* ═══════════════════ LEFT PANEL — Data ═══════════════════ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Breadcrumb + refresh */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#9CA3AF" }}>
            <Home size={12}/><ChevronRight size={11}/>
            <span style={{ fontWeight: 600, color: "#1D1D1D" }}>AI Analytics</span>
          </nav>
          <button onClick={loadData} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              border: "1px solid #E8E8E8", borderRadius: 6, background: "#FFFFFF",
              fontSize: 12, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", color: "#1D1D1D" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""}/>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}` : "Refresh"}
          </button>
        </div>

        {/* Title */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1D1D1D", margin: 0 }}>AI Business Intelligence</h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>
            Real-time insights powered by your live data — Ajith Rohana Enterprise
          </p>
        </div>

        {/* Row 1: Health Score + Revenue Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>

          {/* Business Health Score */}
          <div style={card}>
            <div style={{ borderLeft: "3px solid #CF291D", paddingLeft: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#374151", margin: 0 }}>Business Health Score</p>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 0" }}>
                <SK h={80} w={80}/>
                <SK h={14} w={80}/>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                {/* SVG gauge circle */}
                <svg width={100} height={100} viewBox="0 0 100 100">
                  <circle cx={50} cy={50} r={40} fill="none" stroke="#F3F4F6" strokeWidth={8}/>
                  <circle cx={50} cy={50} r={40} fill="none" stroke={scoreColor} strokeWidth={8}
                    strokeDasharray={`${2 * Math.PI * 40 * score / 100} ${2 * Math.PI * 40 * (1 - score / 100)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dasharray 0.6s ease" }}/>
                  <text x={50} y={46} textAnchor="middle" fontSize={20} fontWeight={800} fill={scoreColor}>{score}</text>
                  <text x={50} y={59} textAnchor="middle" fontSize={8} fill="#9CA3AF">/100</text>
                </svg>
                <p style={{ fontWeight: 700, fontSize: 13, color: scoreColor, margin: "4px 0 0" }}>{grade}</p>
                {/* Score factors */}
                <div style={{ width: "100%", marginTop: 10, fontSize: 10, color: "#6B7280" }}>
                  {[
                    { label: "Collection Rate", val: collRate >= 80 ? "+30" : collRate >= 60 ? "+15" : "+0", ok: collRate >= 80 },
                    { label: "Supplier Balance", val: supplierOB < 100000 ? "+20" : "+10", ok: supplierOB < 100000 },
                    { label: "Agent Risk",       val: !agentRisks.some(a => a.risk_level === "critical") ? "+20" : "+10", ok: !agentRisks.some(a => a.risk_level === "critical") },
                    { label: "Stock Levels",     val: "+15", ok: velocity.every(v => v.velocity_pct < 80) },
                    { label: "Monthly Profit",   val: "+15", ok: netProfit > 0 },
                  ].map(f => (
                    <div key={f.label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid #F9F9F9" }}>
                      <span>{f.ok ? "✓" : "✗"} {f.label}</span>
                      <span style={{ fontWeight: 600, color: f.ok ? "#16A34A" : "#DC2626" }}>{f.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Revenue & Profit Breakdown */}
          <div style={card}>
            <div style={{ borderLeft: "3px solid #CF291D", paddingLeft: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#374151", margin: 0 }}>Revenue & Profit Breakdown — Last 30 Days</p>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1,2,3,4].map(i => <SK key={i} h={44}/>)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Gross Revenue",    val: periodStats?.total_collected ?? 0, color: "#16A34A", icon: <TrendingUp size={14}/> },
                  { label: "Stock Cost",       val: supplierOB,                         color: "#DC2626", icon: <ShoppingCart size={14}/> },
                  { label: "Monthly Payroll",  val: payroll?.total_payroll ?? 0,        color: "#7C3AED", icon: <Users size={14}/> },
                  { label: "Net Profit (est)", val: Math.abs(netProfit),               color: netProfit >= 0 ? "#2563EB" : "#DC2626",
                    icon: netProfit >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>,
                    prefix: netProfit < 0 ? "−" : "" },
                ].map(m => (
                  <div key={m.label} style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: m.color }}>
                      {m.icon}
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#9CA3AF" }}>{m.label}</span>
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 800, color: m.color, margin: 0 }}>
                      {(m as any).prefix ?? ""}Rs. {fmt(m.val)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {/* Collection rate bar */}
            {!loading && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: "#9CA3AF" }}>30-Day Collection Rate</span>
                  <span style={{ fontWeight: 700, color: collRate >= 80 ? "#16A34A" : "#DC2626" }}>{collRate}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#F3F4F6", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${collRate}%`, borderRadius: 3,
                    background: collRate >= 80 ? "#16A34A" : collRate >= 60 ? "#D97706" : "#DC2626",
                    transition: "width 0.6s ease" }}/>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Collection Priority */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderLeft: "3px solid #CF291D", paddingLeft: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} color="#DC2626"/>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#374151", margin: 0 }}>Collection Priority — Urgent Follow-ups</p>
            </div>
            {agentRisks.some(a => a.risk_level === "critical") && (
              <span style={{ padding: "2px 8px", borderRadius: 4, background: "#FEE2E2", color: "#DC2626", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                CRITICAL
              </span>
            )}
          </div>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => <SK key={i} h={52}/>)}
            </div>
          ) : agentRisks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF", fontSize: 13 }}>
              <CheckCircle size={24} color="#16A34A" style={{ margin: "0 auto 6px" }}/>
              No outstanding balances — all agents settled ✓
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {agentRisks.slice(0, 5).map(a => (
                <div key={a.agent_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: 6, border: `1px solid ${RISK_BG[a.risk_level]}`, background: RISK_BG[a.risk_level] }}>
                  <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: "50%", background: RISK_COLOR[a.risk_level] }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1D", margin: 0 }}>{a.name}</p>
                    <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                      {a.risk_level === "critical" ? "Immediate collection call required. Consider suspending further credit."
                        : a.risk_level === "high" ? "Follow up within 24 hours. Send WhatsApp reminder."
                        : a.risk_level === "medium" ? "Schedule collection visit this week."
                        : "Monitor — within normal terms."}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: RISK_COLOR[a.risk_level], margin: 0 }}>Rs. {fmt(a.live_outstanding)}</p>
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0" }}>{a.max_days_overdue}d overdue</p>
                  </div>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", background: RISK_COLOR[a.risk_level], color: "#FFFFFF", flexShrink: 0 }}>
                    {a.risk_level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Row 3: Inventory Velocity */}
        <div style={card}>
          <div style={{ borderLeft: "3px solid #CF291D", paddingLeft: 10, marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#374151", margin: 0 }}>Demand Forecast — Ticket Inventory Velocity</p>
          </div>
          {loading ? <SK h={120}/> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#374151" }}>
                    {["Game","Total","Distributed","Velocity","Days Left","Status"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: h === "Game" ? "left" : "right",
                        fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {velocity.slice(0, 8).map((v, i) => {
                    const statusColor = v.velocity_pct > 80 ? "#DC2626" : v.velocity_pct > 60 ? "#D97706" : "#16A34A";
                    const statusLabel = v.days_remaining < 7 ? "Order Now" : v.days_remaining < 14 ? "Reorder Soon" : "Sufficient";
                    return (
                      <tr key={v.game_name} style={{ borderBottom: "1px solid #F9F9F9", background: i % 2 === 0 ? "#FFFFFF" : "#FAFAFA" }}>
                        <td style={{ padding: "7px 8px", fontWeight: 500, color: "#1D1D1D" }}>{v.game_name}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#6B7280" }}>{v.total_qty.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#2563EB" }}>{v.distributed_qty.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#F3F4F6", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${v.velocity_pct}%`, background: statusColor, borderRadius: 2 }}/>
                            </div>
                            <span style={{ fontWeight: 600, color: statusColor }}>{v.velocity_pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#6B7280" }}>
                          {v.days_remaining > 998 ? "∞" : `${v.days_remaining}d`}
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: `${statusColor}15`, color: statusColor }}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Row 4: 6-month trend */}
        {trend.length > 0 && (
          <div style={card}>
            <div style={{ borderLeft: "3px solid #CF291D", paddingLeft: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#374151", margin: 0 }}>6-Month Revenue Trend</p>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {trend.map(t => {
                const h = Math.max(4, (t.revenue / maxTrend) * 72);
                const netH = Math.max(2, (Math.abs(t.net) / maxTrend) * 72);
                const pos = t.net >= 0;
                return (
                  <div key={t.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 60, gap: 1 }}>
                      <div style={{ width: "60%", height: netH, background: pos ? "#DBEAFE" : "#FEE2E2", borderRadius: "2px 2px 0 0" }}/>
                      <div style={{ width: "100%", height: Math.max(4, (t.cost / maxTrend) * 40), background: "#E5E7EB", borderRadius: "2px 2px 0 0" }}/>
                      <div style={{ width: "100%", height: h, background: "#2563EB", borderRadius: "2px 2px 0 0" }}/>
                    </div>
                    <span style={{ fontSize: 9, color: "#9CA3AF" }}>{fmtMonth(t.month)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: "#6B7280" }}>
              {[
                { color: "#2563EB", label: "Revenue" },
                { color: "#E5E7EB", label: "Cost" },
                { color: "#DBEAFE", label: "Net Profit" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: "1px solid #E8E8E8" }}/>
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 5: AI Recommendations */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, borderLeft: "3px solid #CF291D", paddingLeft: 10, marginBottom: 10 }}>
            <Lightbulb size={14} color="#D97706"/>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#374151", margin: 0 }}>AI Recommendations</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ...(agentRisks.some(a => a.risk_level === "critical") ? [{
                color: "#DC2626", bg: "#FEF2F2", icon: "🚨",
                title: `${agentRisks.filter(a => a.risk_level === "critical").length} critical agent(s) need immediate action`,
                sub: "High receivables risk — call and consider credit suspension",
                view: "ledger" as View,
              }] : []),
              ...(velocity.some(v => v.days_remaining < 7) ? [{
                color: "#DC2626", bg: "#FEF2F2", icon: "📦",
                title: "Critical stock running out in <7 days",
                sub: "Place emergency order with Nimalsiri Enterprises immediately",
                view: "purchases" as View,
              }] : []),
              ...(supplierOB > 300000 ? [{
                color: "#D97706", bg: "#FFFBEB", icon: "🏦",
                title: `Supplier balance Rs. ${fmt(supplierOB)} — settle before next order`,
                sub: "High supplier debt may delay next stock delivery",
                view: "purchases" as View,
              }] : []),
              ...(payroll && periodStats && periodStats.total_collected > 0 && (payroll.total_payroll / periodStats.total_collected) > 0.3 ? [{
                color: "#7C3AED", bg: "#F5F3FF", icon: "👥",
                title: `Payroll ratio ${Math.round((payroll.total_payroll / periodStats.total_collected) * 100)}% — exceeds 30% threshold`,
                sub: "Review staffing costs or increase collection targets",
                view: "payroll" as View,
              }] : []),
              ...(collRate >= 85 ? [{
                color: "#16A34A", bg: "#F0FDF4", icon: "✅",
                title: `Excellent collection rate: ${collRate}% — above benchmark`,
                sub: "Strong cash flow — consider expanding stock volume",
                view: "distribution" as View,
              }] : []),
              ...(!agentRisks.some(a => a.risk_level === "critical") && supplierOB < 100000 ? [{
                color: "#2563EB", bg: "#EFF6FF", icon: "📈",
                title: "Business health strong — consider scaling operations",
                sub: "Low risk, healthy supplier balance, no critical agents",
                view: "ai-analytics" as View,
              }] : []),
            ].slice(0, 5).map((rec, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 6, border: `1px solid ${rec.bg}`, background: rec.bg }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{rec.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#1D1D1D", margin: 0 }}>{rec.title}</p>
                  <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>{rec.sub}</p>
                </div>
                <button onClick={() => onNavigate(rec.view)}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                    borderRadius: 4, border: `1px solid ${rec.color}30`, background: "#FFFFFF",
                    fontSize: 11, fontWeight: 600, color: rec.color, cursor: "pointer", flexShrink: 0 }}>
                  View <ArrowRight size={11}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick stats footer */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { icon: <Users size={14}/>, label: "Active Agents",   val: agentRisks.length,    color: "#2563EB" },
            { icon: <Users size={14}/>, label: "Active Workers",  val: workers.filter(w => w.is_active).length, color: "#7C3AED" },
            { icon: <Package size={14}/>, label: "Stock Batches", val: velocity.length,       color: "#D97706" },
            { icon: <Brain size={14}/>, label: "Months Tracked",  val: trend.length,          color: "#16A34A" },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderTop: `3px solid ${s.color}` }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: `${s.color}12`,
                display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.val}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0" }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════ RIGHT PANEL — AI Chat ═══════════════════ */}
      <div style={{
        width: 380, flexShrink: 0,
        background: "#FFFFFF",
        borderLeft: "1px solid #E8E8E8",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Chat header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #E8E8E8", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "#EFF6FF",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={16} color="#2563EB"/>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1D1D1D", margin: 0 }}>AI Business Assistant</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                Gemini 3.6 Flash · {aiLoading ? "Typing…" : "Ready"}
                {lastTokenSaving && !aiLoading && (
                  <span style={{
                    marginLeft: 6, padding: "1px 5px", borderRadius: 3,
                    fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                    background: lastTokenSaving === "direct" ? "rgba(16,163,74,0.25)"
                      : lastTokenSaving === "minimal" ? "rgba(37,99,235,0.25)"
                      : lastTokenSaving === "medium"  ? "rgba(217,119,6,0.25)"
                      : "rgba(124,58,237,0.25)",
                    color: lastTokenSaving === "direct" ? "#4ade80"
                      : lastTokenSaving === "minimal"  ? "#60a5fa"
                      : lastTokenSaving === "medium"   ? "#fbbf24" : "#c4b5fd",
                  }}>
                    {lastTokenSaving === "direct" ? "⚡ 0 tokens" : lastTokenSaving === "minimal" ? "↓ slim" : lastTokenSaving === "medium" ? "○ medium" : "● full"}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Language selector */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["en","si","ta"] as AILanguage[]).map(lang => (
              <button key={lang} onClick={() => setAiLanguage(lang)}
                style={{
                  flex: 1, padding: "6px 4px",
                  borderRadius: 6,
                  border: `1.5px solid ${aiLanguage === lang ? "#2563EB" : "#E8E8E8"}`,
                  background: aiLanguage === lang ? "#2563EB" : "#FFFFFF",
                  color: aiLanguage === lang ? "#FFFFFF" : "#6B7280",
                  fontWeight: 600, fontSize: 12, cursor: "pointer",
                  transition: "all 0.15s",
                }}>
                {lang === "en" ? "English" : lang === "si" ? "සිංහල" : "தமிழ்"}
              </button>
            ))}
          </div>
        </div>

        {/* Quick prompts — only shown before first message */}
        {chatHistory.length === 0 && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
              color: "#9CA3AF", marginBottom: 8 }}>Quick Prompts</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {QUICK_PROMPTS.map(p => (
                <button key={p.text} onClick={() => sendAiQuery(p.text)} disabled={aiLoading}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 4, padding: "8px 6px",
                    border: "1px solid #E8E8E8", borderRadius: 6,
                    background: "#FAFAFA", cursor: "pointer",
                    fontSize: 10, fontWeight: 500, color: "#374151",
                    textAlign: "center", lineHeight: 1.3,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#EFF6FF")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#FAFAFA")}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages — flex-1 scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {chatHistory.length === 0 && !aiLoading && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "20px 0", color: "#9CA3AF", textAlign: "center" }}>
              <Brain size={32} color="#E5E7EB" style={{ marginBottom: 10 }}/>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>Ask anything about your business</p>
              <p style={{ fontSize: 11, margin: "4px 0 0" }}>
                {aiLanguage === "si" ? "සිංහල · English · தமிழ் supported" : aiLanguage === "ta" ? "தமிழ் · English · සිංහල supported" : "English · සිංහල · தமிழ் supported"}
              </p>
            </div>
          )}

          {chatHistory.map((msg, msgIdx) => {
            // ── Action result message ───────────────────────────────────────
            if (msg.role === "action-result") {
              const isErr = msg.content.startsWith("⚠");
              return (
                <div key={msgIdx} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 2,
                    background: isErr ? "#FEE2E2" : "#DCFCE7",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isErr ? <ShieldAlert size={11} color="#DC2626"/> : <CheckCircle size={11} color="#16A34A"/>}
                  </div>
                  <div style={{ flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.55,
                    background: isErr ? "#FEF2F2" : "#F0FDF4",
                    border: `1px solid ${isErr ? "#FECACA" : "#BBF7D0"}`,
                    color: isErr ? "#DC2626" : "#166534",
                    whiteSpace: "pre-wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase",
                      letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>
                      {isErr ? "⚡ Action Failed" : "⚡ Action Executed"}
                    </span>
                    {msg.content}
                  </div>
                </div>
              );
            }

            // ── Regular message ─────────────────────────────────────────────
            return (
              <div key={msgIdx} style={{ display: "flex", flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 4 }}>
                {msg.role === "assistant" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: "#EFF6FF",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Brain size={10} color="#2563EB"/>
                    </div>
                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                      AI Controller · {msg.timestamp.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button onClick={() => navigator.clipboard.writeText(msg.content)} title="Copy"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                      <Copy size={11} color="#6B7280"/>
                    </button>
                  </div>
                )}
                <div style={{
                  maxWidth: "88%",
                  padding: "8px 12px",
                  borderRadius: msg.role === "user" ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                  background: msg.role === "user" ? "#DBEAFE" : "#F9FAFB",
                  border: `1px solid ${msg.role === "user" ? "#BFDBFE" : "#E8E8E8"}`,
                  fontSize: 13,
                  color: msg.content.startsWith("⚠") ? "#DC2626" : "#1D1D1D",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.content}
                </div>

                {/* ── Action confirmation cards ─────────────────────────────── */}
                {msg.actions && msg.actions.length > 0 && (
                  <div style={{ maxWidth: "88%", display: "flex", flexDirection: "column", gap: 6 }}>
                    {msg.actions.map((action, ai) => {
                      const isExecuting = executingAction === action.raw;
                      const needsAdmin  = !adminToken;
                      const actionColor = action.actionType.includes("suspend") ? "#DC2626"
                        : action.actionType.includes("reorder") ? "#D97706"
                        : action.actionType.includes("flag") ? "#EA580C"
                        : "#2563EB";
                      const actionLabel: Record<string, string> = {
                        suspend_agent_credit: "🚫 Suspend Agent Credit",
                        restore_agent_credit: "✅ Restore Agent Credit",
                        generate_reorder_po:  "📦 Generate Reorder PO",
                        update_stock_threshold: "⚙ Update Stock Threshold",
                        flag_urgent_collection: "🚨 Flag Urgent Collection",
                        get_daily_summary:    "📊 Get Daily Summary",
                      };
                      return (
                        <div key={ai} style={{
                          padding: "10px 12px", borderRadius: 8,
                          background: "#FFFFFF", border: `1px solid ${actionColor}30`,
                          boxShadow: `0 2px 8px ${actionColor}15`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <Zap size={12} color={actionColor}/>
                            <span style={{ fontSize: 11, fontWeight: 700, color: actionColor }}>
                              AI ACTION READY
                            </span>
                          </div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#1D1D1D", margin: "0 0 2px" }}>
                            {actionLabel[action.actionType] ?? action.actionType}
                          </p>
                          <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 8px" }}>
                            Target: <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 3 }}>{action.targetId}</code>
                            {action.params && <> · Params: <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 3 }}>{action.params}</code></>}
                          </p>
                          {needsAdmin && (
                            <p style={{ fontSize: 11, color: "#D97706", marginBottom: 6 }}>
                              ⚠ Requires admin session — log in as Admin to execute.
                            </p>
                          )}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => executeAction(action, msgIdx)}
                              disabled={isExecuting || needsAdmin}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "5px 12px", borderRadius: 6,
                                background: isExecuting || needsAdmin ? "#F3F4F6" : actionColor,
                                color: isExecuting || needsAdmin ? "#9CA3AF" : "#FFFFFF",
                                border: "none", fontSize: 12, fontWeight: 600,
                                cursor: isExecuting || needsAdmin ? "not-allowed" : "pointer",
                              }}>
                              {isExecuting
                                ? <><RefreshCw size={11} className="animate-spin"/> Executing…</>
                                : <><Play size={11}/> Execute</>}
                            </button>
                            <button onClick={() => setChatHistory(h => h.map((m, idx) =>
                              idx === msgIdx ? { ...m, actions: m.actions?.filter((_, j) => j !== ai) } : m
                            ))}
                              style={{ display: "flex", alignItems: "center", gap: 4,
                                padding: "5px 10px", borderRadius: 6,
                                background: "#F9FAFB", border: "1px solid #E8E8E8",
                                color: "#6B7280", fontSize: 12, cursor: "pointer" }}>
                              <X size={11}/> Dismiss
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {msg.role === "user" && (
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                    {msg.timestamp.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            );
          })}

          {/* AI typing indicator */}
          {aiLoading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: "#EFF6FF",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Brain size={10} color="#2563EB"/>
                </div>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>AI is typing…</span>
              </div>
              <div style={{ padding: "10px 14px", borderRadius: "8px 8px 8px 2px",
                background: "#F9FAFB", border: "1px solid #E8E8E8", display: "flex", gap: 4, alignItems: "center" }}>
                {[0,1,2].map(i => (
                  <div key={i} className="animate-bounce"
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF",
                      animationDelay: `${i * 0.15}s` }}/>
                ))}
              </div>
            </div>
          )}

          <div ref={chatEndRef}/>
        </div>

        {/* Error notice */}
        {aiError && (
          <div style={{ padding: "8px 16px", background: "#FEF2F2", borderTop: "1px solid #FECACA",
            fontSize: 11, color: "#DC2626", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }}/>
            <span>
              {aiError.includes("API key") || aiError.includes("not configured")
                ? <>API key missing — go to <strong>Settings → AI Configuration</strong> and add your free Gemini key from aistudio.google.com</>
                : aiError}
            </span>
          </div>
        )}

        {/* Input area */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #E8E8E8", flexShrink: 0, background: "#FFFFFF" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !aiLoading) { e.preventDefault(); sendAiQuery(); }}}
              disabled={aiLoading}
              placeholder={
                aiLanguage === "si" ? "ඔබේ ප්‍රශ්නය ලියන්න…"
                : aiLanguage === "ta" ? "கேள்வி கேளுங்கள்…"
                : "Ask about your business…"
              }
              style={{
                flex: 1, padding: "8px 12px",
                borderRadius: 6, border: "1.5px solid #E8E8E8",
                fontSize: 13, color: "#1D1D1D", background: "#FAFAFA",
                outline: "none",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "#2563EB")}
              onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")}
            />
            <button onClick={() => sendAiQuery()} disabled={aiLoading || !chatInput.trim()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 6,
                background: aiLoading || !chatInput.trim() ? "#F3F4F6" : "#2563EB",
                color: aiLoading || !chatInput.trim() ? "#9CA3AF" : "#FFFFFF",
                border: "none", fontWeight: 600, fontSize: 13,
                cursor: aiLoading || !chatInput.trim() ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}>
              <Send size={14}/>
              Send
            </button>
          </div>
          {chatHistory.length > 0 && (
            <button onClick={() => { setChatHistory([]); setAiError(null); }}
              style={{ marginTop: 6, background: "none", border: "none", fontSize: 11,
                color: "#9CA3AF", cursor: "pointer", padding: 0, display: "block" }}>
              Clear conversation
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
