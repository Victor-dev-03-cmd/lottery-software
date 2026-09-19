/**
 * Master AI Prompt Builder — Agentic ERP Controller
 *
 * Strategy 1: Intent-specific prompts (minimal tokens per use case)
 * Strategy 2: Structured JSON for utility actions
 * Strategy 3: Bypass AI entirely for direct-DB queries
 * Strategy 4: Context window trimming per intent
 */

export type AILanguage = "en" | "si" | "ta";

// ── Intent types ──────────────────────────────────────────────────────────────

export type QueryIntent =
  | "direct_summary"      // Pure DB read → bypass AI, answer instantly from loaded state
  | "financial_analysis"  // Revenue/profit focus → inject financial slice only
  | "credit_check"        // Agent/collection focus → inject agent data only
  | "inventory_forecast"  // Stock/reorder focus → inject inventory slice only
  | "payroll_analysis"    // Payroll ratio focus → inject payroll + revenue only
  | "action_execution"    // User wants to run a system action → minimal prompt
  | "full_analysis";      // Complex reasoning → full context injection

/** Detect query intent from user text to select the optimal strategy */
export function detectIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();

  // Direct DB reads — bypass AI entirely
  if (/^(daily summary|today'?s? (revenue|summary|stats)|quick summary|what('?s| is) today)/.test(q))
    return "direct_summary";
  if (/^(list |show |how many |count )?(agents?|outstanding|overdue|credit)/.test(q) && q.length < 40)
    return "direct_summary";
  if (/^(stock|inventory) levels?$|^how much stock/.test(q))
    return "direct_summary";

  // Intent-specific topics
  if (/(revenue|profit|margin|collection rate|gross|net|financial|cash flow|income)/.test(q))
    return "financial_analysis";
  if (/(agent|credit|outstanding|overdue|collection|suspend|follow.?up|receivable)/.test(q))
    return "credit_check";
  if (/(stock|inventory|reorder|batch|ticket|game|velocity|low stock|out of stock|supply)/.test(q))
    return "inventory_forecast";
  if (/(payroll|salary|worker|staff|employee|wage|compensation)/.test(q))
    return "payroll_analysis";
  if (/(execute|run|suspend|generate|flag|restore|action|do it|apply)/.test(q))
    return "action_execution";

  return "full_analysis";
}

// ── Data interfaces ───────────────────────────────────────────────────────────

export interface AgentRiskDetail {
  id: number;
  name: string;
  outstanding: number;
  overdueDays: number;
  creditLimit: number;
  riskLevel: string;
}

export interface InventoryDetail {
  game_name: string;
  remaining: number;
  total: number;
  velocity_pct: number;
  days_remaining: number;
}

export interface AIBusinessData {
  revenue: number;
  stockCost: number;
  payroll: number;
  netProfit: number;
  margin: number;
  collectionRate: number;
  criticalAgents: AgentRiskDetail[];
  inventoryStatus: InventoryDetail[];
  payrollSummary: { totalWorkers: number; totalPayroll: number };
  supplierOwed?: number;
  periodDays?: number;
}

// ── Language instructions ─────────────────────────────────────────────────────

const LANG: Record<AILanguage, string> = {
  en: "Respond in Professional English only.",
  si: "සියලු පිළිතුරු සිංහල භාෂාවෙන් ලබා දෙන්න. Action tags stay in English.",
  ta: "அனைத்து பதில்களும் தமிழில் மட்டுமே. Action tags stay in English.",
};

// ── Action manifest (shared across all prompts that need it) ──────────────────

const ACTION_MANIFEST = `
EXECUTABLE ACTIONS — output EXACTLY as shown, on its own line:
⚡ACTION:action_type:target_id:optional_params⚡

| action_type              | target_id      | params        |
|--------------------------|----------------|---------------|
| suspend_agent_credit     | agent id       | —             |
| restore_agent_credit     | agent id       | limit (Rs.)   |
| generate_reorder_po      | game name      | —             |
| update_stock_threshold   | game name      | threshold     |
| flag_urgent_collection   | agent id       | —             |
| get_daily_summary        | summary        | —             |

Rules: Explain first → ⚡ACTION:...⚡ tag → confirm effect. Never execute without reason.`;

// ══════════════════════════════════════════════════════════════════════════════
// Strategy 1 & 4: Intent-specific prompts with context trimming
// ══════════════════════════════════════════════════════════════════════════════

/** FINANCIAL: only revenue/cost/margin slice injected */
function buildFinancialPrompt(data: AIBusinessData, lang: AILanguage, query: string): string {
  return `You are the financial controller for Ajith Rohana Enterprises (Sri Lanka lottery wholesale).
${LANG[lang]}
CONSTRAINT: Answer in ≤5 precise bullet points. No filler text. All amounts as Rs. X,XXX,XXX.00.

FINANCIAL DATA (last ${data.periodDays ?? 30} days):
• Gross Revenue: Rs. ${data.revenue.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
• Stock Cost (Nimalsiri): Rs. ${data.stockCost.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
• Payroll: Rs. ${data.payroll.toLocaleString("en-LK", { minimumFractionDigits: 2 })} (${data.payrollSummary.totalWorkers} workers)
• Net Profit: Rs. ${data.netProfit.toLocaleString("en-LK", { minimumFractionDigits: 2 })} (${data.margin.toFixed(1)}% margin)
• Collection Rate: ${data.collectionRate}%
• Supplier Owed: Rs. ${(data.supplierOwed ?? 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
• Payroll Ratio: ${data.revenue > 0 ? ((data.payroll / data.revenue) * 100).toFixed(1) : 0}% of revenue ${data.revenue > 0 && data.payroll / data.revenue > 0.3 ? "⚠ EXCEEDS 30% threshold" : "✓ within limit"}

Query: ${query}`.trim();
}

/** CREDIT CHECK: only agent data slice */
function buildCreditCheckPrompt(data: AIBusinessData, lang: AILanguage, query: string): string {
  const rows = data.criticalAgents.slice(0, 8).map(a =>
    `[ID:${a.id}] ${a.name} | Rs. ${a.outstanding.toLocaleString("en-LK", { minimumFractionDigits: 2 })} | ${a.overdueDays}d | limit Rs. ${a.creditLimit.toLocaleString()} | ${a.riskLevel.toUpperCase()}`
  ).join("\n") || "No outstanding agents.";

  return `You are the credit control officer for Ajith Rohana Enterprises (Sri Lanka lottery wholesale).
${LANG[lang]}
CONSTRAINT: Answer in ≤6 bullet points. State agent IDs for any recommended actions. All amounts as Rs. X,XXX,XXX.00.

${ACTION_MANIFEST}

AGENT CREDIT REGISTRY:
${rows}
Total outstanding: Rs. ${data.criticalAgents.reduce((s, a) => s + a.outstanding, 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
Collection rate: ${data.collectionRate}%

Query: ${query}`.trim();
}

/** INVENTORY: only stock velocity slice */
function buildInventoryPrompt(data: AIBusinessData, lang: AILanguage, query: string): string {
  const rows = data.inventoryStatus.slice(0, 10).map(i =>
    `${i.game_name}: ${i.remaining?.toLocaleString() ?? 0} remaining / ${i.total?.toLocaleString() ?? 0} total | ${i.velocity_pct ?? 0}% distributed | ~${i.days_remaining > 998 ? "∞" : i.days_remaining + "d"} left`
  ).join("\n") || "No inventory data.";

  return `You are the inventory manager for Ajith Rohana Enterprises (Sri Lanka lottery wholesale).
${LANG[lang]}
CONSTRAINT: Answer in ≤6 bullet points. Flag Critical (<7d), Low (7-14d), Sufficient (>14d).

${ACTION_MANIFEST}

INVENTORY VELOCITY:
${rows}

Query: ${query}`.trim();
}

/** PAYROLL: only payroll vs revenue slice */
function buildPayrollPrompt(data: AIBusinessData, lang: AILanguage, query: string): string {
  const ratio = data.revenue > 0 ? (data.payroll / data.revenue) * 100 : 0;
  return `You are the HR finance controller for Ajith Rohana Enterprises.
${LANG[lang]}
CONSTRAINT: Answer in ≤5 bullet points. Include payroll/revenue ratio assessment.

PAYROLL DATA:
• Workers: ${data.payrollSummary.totalWorkers} active
• Total Payroll: Rs. ${data.payroll.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
• Gross Revenue: Rs. ${data.revenue.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
• Payroll Ratio: ${ratio.toFixed(1)}% ${ratio > 30 ? "⚠ EXCEEDS 30% safe threshold" : "✓ within safe limit"}
• Net after payroll: Rs. ${(data.revenue - data.payroll).toLocaleString("en-LK", { minimumFractionDigits: 2 })}

Query: ${query}`.trim();
}

/** ACTION EXECUTION: ultra-minimal — just enough context to confirm + execute */
function buildActionPrompt(data: AIBusinessData, lang: AILanguage, query: string): string {
  const topAgents = data.criticalAgents.slice(0, 5).map(a =>
    `[ID:${a.id}] ${a.name} — Rs. ${a.outstanding.toLocaleString("en-LK", { minimumFractionDigits: 0 })} / ${a.overdueDays}d`
  ).join(", ");
  const criticalStock = data.inventoryStatus.filter(i => i.days_remaining < 14)
    .map(i => `${i.game_name}(${i.days_remaining}d)`).join(", ");

  return `You are the AI controller for Ajith Rohana Enterprises. Execute the requested action.
${LANG[lang]}
CONSTRAINT: 1-2 lines of confirmation only. Then output the action tag. No analysis.

${ACTION_MANIFEST}

CONTEXT SNAPSHOT:
• Critical agents: ${topAgents || "none"}
• Critical stock: ${criticalStock || "none"}

Command: ${query}`.trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// Strategy 2: Structured JSON prompt for utility/summary actions
// ══════════════════════════════════════════════════════════════════════════════

/** Returns a prompt that forces compact JSON output */
export function buildJsonSummaryPrompt(data: AIBusinessData): string {
  return `You are the AI controller for Ajith Rohana Enterprises (Sri Lanka lottery wholesale).
Return ONLY valid JSON matching this schema — no markdown, no extra text:
{
  "healthScore": number (0-100),
  "healthGrade": "Excellent"|"Good"|"Fair"|"Needs Attention",
  "topAlerts": [{"priority":"critical"|"high"|"medium", "message": string}] (max 4),
  "topActions": [{"action": string, "target": string, "reason": string}] (max 3),
  "financialSnapshot": {"revenue": number, "netProfit": number, "collectionRate": number, "payrollRatio": number}
}

LIVE DATA:
Revenue: ${data.revenue} | Cost: ${data.stockCost} | Payroll: ${data.payroll} | Rate: ${data.collectionRate}%
Agents overdue: ${data.criticalAgents.length} | Max days: ${Math.max(...data.criticalAgents.map(a => a.overdueDays), 0)}
Critical stock games: ${data.inventoryStatus.filter(i => i.days_remaining < 7).map(i => i.game_name).join(", ") || "none"}
Supplier owed: ${data.supplierOwed ?? 0}`.trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// Strategy 3: Direct DB responses (no AI token spend)
// ══════════════════════════════════════════════════════════════════════════════

export interface DirectResponse {
  handled: true;
  content: string;
}

/** Answer directly from already-loaded state without calling the AI API */
export function tryDirectResponse(query: string, data: AIBusinessData, lang: AILanguage): DirectResponse | null {
  const q = query.toLowerCase().trim();
  const fmtRs = (n: number) => `Rs. ${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;

  // Daily / today summary
  if (/daily summary|today'?s? (revenue|summary|stats)|quick summary/.test(q)) {
    const lines: Record<AILanguage, string[]> = {
      en: [
        "📊 **Live Business Snapshot**",
        `• Revenue collected: ${fmtRs(data.revenue)}`,
        `• Net profit (est.): ${fmtRs(data.netProfit)}`,
        `• Collection rate: ${data.collectionRate}%`,
        `• Agents overdue: ${data.criticalAgents.length}`,
        `• Supplier owed: ${fmtRs(data.supplierOwed ?? 0)}`,
        `• Critical stock games: ${data.inventoryStatus.filter(i => i.days_remaining < 7).length}`,
      ],
      si: [
        "📊 **ව්‍යාපාරික සාරාංශය**",
        `• එකතු කළ ආදායම: ${fmtRs(data.revenue)}`,
        `• ශුද්ධ ලාභය: ${fmtRs(data.netProfit)}`,
        `• එකතු කිරීමේ අනුපාතය: ${data.collectionRate}%`,
        `• කාලය ඉකුත් වූ නියෝජිතයෝ: ${data.criticalAgents.length}`,
        `• Nimalsiri ණය: ${fmtRs(data.supplierOwed ?? 0)}`,
      ],
      ta: [
        "📊 **வணிக சுருக்கம்**",
        `• வசூல் வருவாய்: ${fmtRs(data.revenue)}`,
        `• நிகர இலாபம்: ${fmtRs(data.netProfit)}`,
        `• வசூல் விகிதம்: ${data.collectionRate}%`,
        `• காலதாமத முகவர்கள்: ${data.criticalAgents.length}`,
        `• Nimalsiri நிலுவை: ${fmtRs(data.supplierOwed ?? 0)}`,
      ],
    };
    return { handled: true, content: lines[lang].join("\n") };
  }

  // Agent count / list
  if (/^(how many |count )?(agents?|outstanding agents?)$/.test(q)) {
    const topFive = data.criticalAgents.slice(0, 5)
      .map(a => `• [ID:${a.id}] ${a.name} — ${fmtRs(a.outstanding)} (${a.overdueDays}d)`)
      .join("\n");
    return {
      handled: true,
      content: `**${data.criticalAgents.length} agents** with outstanding balances:\n${topFive}`,
    };
  }

  // Stock levels
  if (/^(stock|inventory) levels?$|^show (stock|inventory)$/.test(q)) {
    const rows = data.inventoryStatus.slice(0, 8)
      .map(i => {
        const status = i.days_remaining < 7 ? "🔴 ORDER NOW" : i.days_remaining < 14 ? "🟡 Low" : "🟢 OK";
        return `• ${i.game_name}: ${i.remaining?.toLocaleString() ?? 0} left (${i.velocity_pct ?? 0}% distributed) ${status}`;
      }).join("\n");
    return { handled: true, content: `**Inventory Status:**\n${rows}` };
  }

  // Payroll quick check
  if (/^(payroll|salary) (status|total|summary)$/.test(q)) {
    const ratio = data.revenue > 0 ? ((data.payroll / data.revenue) * 100).toFixed(1) : "0";
    return {
      handled: true,
      content: `**Payroll Summary:**\n• Total payroll: ${fmtRs(data.payroll)}\n• Workers: ${data.payrollSummary.totalWorkers}\n• Ratio: ${ratio}% of revenue ${parseFloat(ratio) > 30 ? "⚠ Over 30% threshold" : "✓ Within limit"}`,
    };
  }

  return null; // needs AI
}

// ══════════════════════════════════════════════════════════════════════════════
// Master router — selects optimal strategy for each query
// ══════════════════════════════════════════════════════════════════════════════

export interface PromptDecision {
  intent: QueryIntent;
  prompt: string;
  isJson: boolean;          // Strategy 2: expect JSON back
  bypassedAi: boolean;      // Strategy 3: answered from DB
  directContent?: string;   // content when bypassedAi=true
  tokenEstimate: "minimal" | "medium" | "full";
}

export function buildOptimalPrompt(
  data: AIBusinessData,
  lang: AILanguage,
  query?: string,
): PromptDecision {
  const q = query?.trim() ?? "";

  // Strategy 3: Direct DB response — zero tokens
  if (q) {
    const direct = tryDirectResponse(q, data, lang);
    if (direct) {
      return {
        intent: "direct_summary",
        prompt: "",
        isJson: false,
        bypassedAi: true,
        directContent: direct.content,
        tokenEstimate: "minimal",
      };
    }
  }

  const intent = q ? detectIntent(q) : "full_analysis";

  // No query → structured JSON executive summary (Strategy 2)
  if (!q) {
    return {
      intent: "full_analysis",
      prompt: buildJsonSummaryPrompt(data),
      isJson: true,
      bypassedAi: false,
      tokenEstimate: "medium",
    };
  }

  // Strategy 1 & 4: Intent-specific trimmed prompts
  switch (intent) {
    case "financial_analysis":
      return { intent, prompt: buildFinancialPrompt(data, lang, q), isJson: false, bypassedAi: false, tokenEstimate: "minimal" };
    case "credit_check":
      return { intent, prompt: buildCreditCheckPrompt(data, lang, q), isJson: false, bypassedAi: false, tokenEstimate: "minimal" };
    case "inventory_forecast":
      return { intent, prompt: buildInventoryPrompt(data, lang, q), isJson: false, bypassedAi: false, tokenEstimate: "minimal" };
    case "payroll_analysis":
      return { intent, prompt: buildPayrollPrompt(data, lang, q), isJson: false, bypassedAi: false, tokenEstimate: "minimal" };
    case "action_execution":
      return { intent, prompt: buildActionPrompt(data, lang, q), isJson: false, bypassedAi: false, tokenEstimate: "minimal" };
    default:
      return { intent: "full_analysis", prompt: buildMasterAiPrompt(data, lang, q), isJson: false, bypassedAi: false, tokenEstimate: "full" };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Full master prompt (used only for full_analysis intent)
// ══════════════════════════════════════════════════════════════════════════════

export const buildMasterAiPrompt = (data: AIBusinessData, lang: AILanguage, query?: string): string => {
  const agentRows = data.criticalAgents.slice(0, 8).map(a =>
    `  • [ID:${a.id}] ${a.name} — Rs. ${a.outstanding.toLocaleString("en-LK", { minimumFractionDigits: 2 })} | ${a.overdueDays}d | limit Rs. ${a.creditLimit.toLocaleString()} | ${a.riskLevel.toUpperCase()}`
  ).join("\n") || "  None.";

  const invRows = data.inventoryStatus.slice(0, 10).map(i =>
    `  • ${i.game_name}: ${i.remaining?.toLocaleString() ?? 0} / ${i.total?.toLocaleString() ?? 0} | ${i.velocity_pct ?? 0}% | ${i.days_remaining > 998 ? "∞" : i.days_remaining + "d"}`
  ).join("\n") || "  No data.";

  return `You are the Master AI Controller for Ajith Rohana Enterprises (Sri Lanka lottery wholesale ERP).
${LANG[lang]}
${ACTION_MANIFEST}

LIVE DATA (last ${data.periodDays ?? 30} days):
Revenue: Rs. ${data.revenue.toLocaleString("en-LK", { minimumFractionDigits: 2 })} | Cost: Rs. ${data.stockCost.toLocaleString("en-LK", { minimumFractionDigits: 2 })} | Payroll: Rs. ${data.payroll.toLocaleString("en-LK", { minimumFractionDigits: 2 })} | Net: Rs. ${data.netProfit.toLocaleString("en-LK", { minimumFractionDigits: 2 })} (${data.margin.toFixed(1)}%) | Collection: ${data.collectionRate}% | Supplier: Rs. ${(data.supplierOwed ?? 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}

AGENTS:
${agentRows}

INVENTORY:
${invRows}

${query ? `USER QUERY: ${query}` : "Provide executive summary + top 3 urgent actions. Be decisive."}

FORMAT: Use bullet points, exact Rs. X,XXX,XXX.00 amounts. No filler text.`.trim();
};

// ── Action parsing utilities ──────────────────────────────────────────────────

export interface ParsedAction {
  actionType: string;
  targetId: string;
  params: string;
  raw: string;
}

export function parseAiActions(text: string): ParsedAction[] {
  const pattern = /⚡ACTION:([^:⚡]+):([^:⚡]+)(?::([^⚡]*))?⚡/g;
  const actions: ParsedAction[] = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    actions.push({ actionType: m[1].trim(), targetId: m[2].trim(), params: (m[3] ?? "").trim(), raw: m[0] });
  }
  return actions;
}

export function stripActionTags(text: string): string {
  return text.replace(/⚡ACTION:[^⚡]+⚡/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ── JSON response parser (Strategy 2) ────────────────────────────────────────

export interface AiJsonSummary {
  healthScore: number;
  healthGrade: string;
  topAlerts: { priority: string; message: string }[];
  topActions: { action: string; target: string; reason: string }[];
  financialSnapshot: { revenue: number; netProfit: number; collectionRate: number; payrollRatio: number };
}

export function tryParseJsonSummary(text: string): AiJsonSummary | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end   = clean.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1));
  } catch { return null; }
}
