import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Search, PlusCircle, Bell, Database, X,
  FileText, Users, Calculator, Delete,
  AlertTriangle, Package, RotateCcw, ExternalLink, CheckCircle,
  ShieldCheck, User, LogOut, ChevronDown, Brain, Settings,
} from "lucide-react";
import type { View } from "../../types";
import { getInvoices, getAgents, getNotifications } from "../../services/database";
import { useAuth } from "../../contexts/AuthContext";

interface Props {
  onNavigate: (view: View, id?: number) => void;
  dbReady: boolean;
  refreshKey: number;
  onSearchFocusRef?: React.MutableRefObject<() => void>;
}

interface SearchResult {
  type: "invoice" | "agent";
  label: string;
  sub: string;
  id: number;
  view: View;
}

// ── Date/Time hook ─────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const DAY   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Calculator logic ───────────────────────────────────────────────────────────
// ── Calculator state machine ────────────────────────────────────────────────

type CalcOp = "+" | "-" | "×" | "÷" | null;

interface CalcState {
  display: string;
  accumulator: number | null;
  operator: CalcOp;
  waitingForOperand: boolean; // next digit press starts a fresh number
  expression: string;
  activeOp: CalcOp; // highlights the active operator button
}

const CALC_INIT: CalcState = {
  display: "0",
  accumulator: null,
  operator: null,
  waitingForOperand: false,
  expression: "",
  activeOp: null,
};

function calcEval(a: number, b: number, op: CalcOp): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b !== 0 ? a / b : NaN;
    default:  return b;
  }
}

function calcFmt(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "Error";
  // Avoid floating-point noise like 0.1+0.2 = 0.30000000004
  const rounded = parseFloat(n.toPrecision(12));
  const s = rounded.toString();
  return s.length > 13 ? rounded.toExponential(6) : s;
}

function calcReduce(s: CalcState, action: string): CalcState {
  const { display, accumulator, operator, waitingForOperand } = s;

  // ── Clear ──
  if (action === "C") return CALC_INIT;

  // ── Backspace ──
  if (action === "⌫") {
    if (waitingForOperand || display === "Error") return s;
    if (display.length <= 1) return { ...s, display: "0" };
    return { ...s, display: display.slice(0, -1) };
  }

  // ── Toggle sign ──
  if (action === "+/-") {
    if (display === "0" || display === "Error") return s;
    const v = parseFloat(display) * -1;
    return { ...s, display: calcFmt(v) };
  }

  // ── Percentage ──
  if (action === "%") {
    if (display === "Error") return s;
    const base = accumulator !== null ? accumulator : 0;
    // If an op is pending, % means "percent of the accumulated value"
    const v = operator && accumulator !== null
      ? base * (parseFloat(display) / 100)
      : parseFloat(display) / 100;
    return { ...s, display: calcFmt(v), waitingForOperand: false };
  }

  // ── Decimal point ──
  if (action === ".") {
    if (display === "Error") return s;
    if (waitingForOperand) return { ...s, display: "0.", waitingForOperand: false };
    if (display.includes(".")) return s;
    return { ...s, display: display + ".", waitingForOperand: false };
  }

  // ── Digit ──
  if ("0123456789".includes(action)) {
    if (display === "Error") return { ...s, display: action, waitingForOperand: false };
    if (waitingForOperand) {
      // Start fresh number after operator or equals
      return { ...s, display: action === "0" ? "0" : action, waitingForOperand: false };
    }
    if (display === "0") return { ...s, display: action };
    if (display.length >= 13) return s;
    return { ...s, display: display + action };
  }

  // ── Operator (+, -, ×, ÷) ──
  if (["+", "-", "×", "÷"].includes(action)) {
    if (display === "Error") return s;
    const current = parseFloat(display);

    // Chain: 5 + 3 × → evaluate 5+3=8, then set acc=8, op=×
    if (accumulator !== null && operator && !waitingForOperand) {
      const result = calcEval(accumulator, current, operator);
      if (!isFinite(result) || isNaN(result)) {
        return { ...CALC_INIT, display: "Error", expression: "Error" };
      }
      const rs = calcFmt(result);
      return {
        display: rs,
        accumulator: result,
        operator: action as CalcOp,
        waitingForOperand: true,
        expression: `${rs} ${action}`,
        activeOp: action as CalcOp,
      };
    }

    return {
      display,
      accumulator: current,
      operator: action as CalcOp,
      waitingForOperand: true,
      expression: `${display} ${action}`,
      activeOp: action as CalcOp,
    };
  }

  // ── Equals ──
  if (action === "=") {
    if (display === "Error") return CALC_INIT;
    if (accumulator === null || operator === null) {
      return { ...s, waitingForOperand: true, expression: `${display} =`, activeOp: null };
    }
    const current = parseFloat(display);
    const result = calcEval(accumulator, current, operator);
    if (!isFinite(result) || isNaN(result)) {
      return { ...CALC_INIT, display: "Error", expression: "Error" };
    }
    const rs = calcFmt(result);
    return {
      display: rs,
      accumulator: null,
      operator: null,
      waitingForOperand: true,
      expression: `${accumulator} ${operator} ${display} =`,
      activeOp: null,
    };
  }

  return s;
}

// ── Calculator UI ─────────────────────────────────────────────────────────────

const CALC_KEYS = [
  ["C", "+/-", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["⌫", "0", ".", "="],
];

function DraggableCalc({ onClose }: { onClose: () => void }) {
  const [calc, setCalc] = useState<CalcState>(CALC_INIT);
  const dispatch = (k: string) => setCalc((s) => calcReduce(s, k));

  // null = use CSS right/top anchoring; set on first drag to left/top px values
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  function handleDragStart(e: React.MouseEvent) {
    // Read actual pixel position from DOM so we can switch to left/top coords
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = true;
    setPos({ x: rect.left, y: rect.top });
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 312, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 120, e.clientY - dragOffset.current.y)),
      });
    }
    function onUp() { dragging.current = false; }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Keyboard support — only fires when NOT typing in an input/textarea
  useEffect(() => {
    function kd(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const map: Record<string, string> = {
        "/": "÷", "*": "×", Enter: "=", Backspace: "⌫", Escape: "C",
      };
      const k = map[e.key] ?? e.key;
      const valid = "0123456789.".includes(k) ||
        ["+", "-", "÷", "×", "=", "⌫", "C", "%"].includes(k);
      if (valid) { e.stopPropagation(); dispatch(k); }
    }
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  }, []);

  const isOp   = (k: string) => ["÷","×","-","+"].includes(k);
  const isEq   = (k: string) => k === "=";
  const isCtrl = (k: string) => ["C","+/-","%"].includes(k);
  const isBack = (k: string) => k === "⌫";
  const dLen = calc.display.length;
  const displaySize = dLen <= 8 ? "text-4xl" : dLen <= 11 ? "text-3xl" : "text-2xl";

  return (
    <div
      ref={panelRef}
      className="select-none shadow-2xl rounded-2xl overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed",
        ...(pos ? { left: pos.x, top: pos.y } : { right: 20, top: 64 }),
        zIndex: 9999, width: 310,
        border: "1px solid #2A2A2A",
      }}
    >
      {/* ── Drag handle ── */}
      <div
        onMouseDown={handleDragStart}
        style={{
          background: "#0D0D0D", padding: "7px 12px",
          cursor: "grab", display: "flex", alignItems: "center",
          justifyContent: "space-between", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
            <rect x="3" y="3" width="3" height="3"/><rect x="10.5" y="3" width="3" height="3"/>
            <rect x="18" y="3" width="3" height="3"/><rect x="3" y="10.5" width="3" height="3"/>
            <rect x="10.5" y="10.5" width="3" height="3"/><rect x="18" y="10.5" width="3" height="3"/>
            <rect x="3" y="18" width="3" height="3"/><rect x="10.5" y="18" width="3" height="3"/>
            <rect x="18" y="18" width="3" height="3"/>
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.06em" }}>
            CALCULATOR
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            border: "none", background: "rgba(255,255,255,0.08)", color: "#9CA3AF",
            cursor: "pointer", borderRadius: "4px", width: "20px", height: "20px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(207,41,29,0.4)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#9CA3AF"; }}
        >
          ×
        </button>
      </div>

      {/* ── Display ── */}
      <div className="px-5 pt-4 pb-3" style={{ background: "#131313" }}>
        <div className="text-xs text-right h-5 truncate leading-relaxed" style={{ color: "#6B7280" }}>
          {calc.expression || " "}
        </div>
        <div className={`text-white text-right font-mono ${displaySize} font-light mt-1 truncate leading-none`}>
          {calc.display}
        </div>
        <div className="flex justify-end mt-2 gap-1 h-4">
          {["÷","×","-","+"].map((op) => (
            <span key={op} className="text-xs font-bold transition-all"
              style={{ color: calc.activeOp === op ? "#CF291D" : "transparent" }}>
              {op}
            </span>
          ))}
        </div>
      </div>

      {/* ── Keys ── */}
      <div className="grid grid-cols-4 gap-px" style={{ background: "#374151" }}>
        {CALC_KEYS.flat().map((k) => {
          const isActiveOp = isOp(k) && calc.activeOp === k && calc.waitingForOperand;
          let bg = "#FFFFFF", color = "#1D1D1D", hoverBg = "#F5F5F5";
          if (isEq(k))      { bg = "#CF291D"; color = "#FFFFFF"; hoverBg = "#B50717"; }
          else if (isActiveOp) { bg = "#B50717"; color = "#FFFFFF"; hoverBg = "#CF291D"; }
          else if (isOp(k)) { bg = "#1D1D1D"; color = "#FFFFFF"; hoverBg = "#374151"; }
          else if (isCtrl(k)){ bg = "#374151"; color = "#FFFFFF"; hoverBg = "#4B5563"; }
          else if (isBack(k)){ bg = "#F3F4F6"; color = "#374151"; hoverBg = "#E5E7EB"; }
          return (
            <button key={k} onClick={() => dispatch(k)}
              className="h-14 flex items-center justify-center text-sm font-semibold transition-all duration-75 active:scale-95 cursor-pointer"
              style={{ background: bg, color }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = bg)}
            >
              {k === "⌫" ? <Delete size={15} /> : (
                <span className={isEq(k) || isOp(k) ? "text-lg" : ""}>{k}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main TopBar ────────────────────────────────────────────────────────────────

export default function TopBar({ onNavigate, dbReady, refreshKey, onSearchFocusRef }: Props) {
  const now = useClock();
  const { role, clearRole } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState({ pendingCount: 0, lowStockCount: 0, returnCount: 0 });
  // Badge hides once the user has opened the dropdown; resets when counts change
  const [seen, setSeen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  // ── Cloud sync state ─────────────────────────────────────────────────────
  const [syncOpen, setSyncOpen]           = useState(false);
  const [syncStatus, setSyncStatus]       = useState<"idle" | "checking" | "syncing" | "ok" | "error">("idle");
  const [connStatus, setConnStatus]       = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [syncLogs, setSyncLogs]           = useState<{ time: string; msg: string; type: "info" | "ok" | "error" | "warn" }[]>([]);
  const [pendingItems, setPendingItems]   = useState(0);
  const syncRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string, type: "info" | "ok" | "error" | "warn" = "info") {
    const time = new Date().toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setSyncLogs(l => [{ time, msg, type }, ...l.slice(0, 49)]);
  }

  async function checkConnection() {
    setSyncStatus("checking");
    addLog("Checking Supabase connection…", "info");
    try {
      const result = await invoke<string>("test_supabase_connection");
      if (result.includes("✓") || result.toLowerCase().includes("success") || result.toLowerCase().includes("connected") || result.toLowerCase().includes("ok")) {
        setConnStatus("connected");
        addLog(`✓ ${result}`, "ok");
      } else {
        setConnStatus("disconnected");
        addLog(`✗ ${result}`, "error");
      }
    } catch (e) {
      setConnStatus("disconnected");
      addLog(`✗ ${String(e)}`, "error");
    } finally { setSyncStatus("idle"); }
  }

  async function runSync() {
    setSyncStatus("syncing");
    addLog("Pushing local records to Supabase…", "info");
    try {
      const stats = await invoke<{ flushed: number; failed: number; remaining: number }>(
        "drain_sync_queue", { token: null }
      );
      if (stats.flushed > 0)  addLog(`✓ Pushed ${stats.flushed} record${stats.flushed !== 1 ? "s" : ""}`, "ok");
      if (stats.failed > 0)   addLog(`⚠ ${stats.failed} failed — will retry`, "warn");
      if (stats.remaining > 0) addLog(`ℹ ${stats.remaining} pending in queue`, "info");
      if (stats.flushed === 0 && stats.failed === 0) addLog("✓ Up to date — nothing to push", "ok");
      setPendingItems(stats.remaining);
      setSyncStatus("ok");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e) {
      addLog(`✗ ${String(e).includes("not configured") ? "Supabase not configured — check Settings" : String(e)}`, "error");
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 4000);
    }
  }

  async function runFullSync() {
    setSyncStatus("syncing");
    addLog("Starting full sync — reading all local tables…", "info");
    try {
      const stats = await invoke<{ flushed: number; failed: number; remaining: number }>(
        "full_sync_all_tables"
      );
      if (stats.flushed > 0) addLog(`✓ Full sync complete — ${stats.flushed} records pushed`, "ok");
      if (stats.failed > 0)  addLog(`⚠ ${stats.failed} records failed to push`, "warn");
      if (stats.flushed === 0 && stats.failed === 0) addLog("✓ All tables are already up to date", "ok");
      setSyncStatus("ok");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e) {
      addLog(`✗ Full sync failed: ${String(e)}`, "error");
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 4000);
    }
  }

  // Expose search focus for F4 shortcut
  useEffect(() => {
    if (onSearchFocusRef) {
      onSearchFocusRef.current = () => { inputRef.current?.focus(); inputRef.current?.select(); };
    }
  }, [onSearchFocusRef]);

  useEffect(() => {
    if (!dbReady) return;
    getNotifications().then(n => {
      setNotifications(n);
      // New notifications came in — reset seen so badge reappears
      const newTotal = n.pendingCount + n.lowStockCount + n.returnCount;
      if (newTotal > 0) setSeen(false);
    }).catch(() => {});
  }, [dbReady, refreshKey]);

  useEffect(() => {
    if (!query.trim() || !dbReady) { setResults([]); return; }
    const q = query.toLowerCase();
    let cancelled = false;
    Promise.all([getInvoices(), getAgents()]).then(([invoices, agents]) => {
      if (cancelled) return;
      const inv: SearchResult[] = invoices
        .filter((i) => i.invoice_number.toLowerCase().includes(q) || (i.agent_name ?? "").toLowerCase().includes(q))
        .slice(0, 5)
        .map((i) => ({ type: "invoice", label: `Invoice #${i.invoice_number}`, sub: `${i.agent_name ?? ""} — ${fmtDate(i.invoice_date)}`, id: i.id!, view: "invoices" as View }));
      const ag: SearchResult[] = agents
        .filter((a) => a.name.toLowerCase().includes(q))
        .slice(0, 3)
        .map((a) => ({ type: "agent", label: a.name, sub: `${a.nlb_reg || ""} ${a.dlb_reg || ""}`.trim() || "Agent", id: a.id!, view: "agents" as View }));
      setResults([...inv, ...ag]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [query, dbReady]);

  // Close dropdowns on outside click — each dropdown has its own ref
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setRoleMenuOpen(false);
      }
      if (syncRef.current && !syncRef.current.contains(e.target as Node)) {
        setSyncOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalNotifs = notifications.pendingCount + notifications.lowStockCount + notifications.returnCount;

  // Date/time strings
  const hours   = now.getHours();
  const mins    = String(now.getMinutes()).padStart(2, "0");
  const secs    = String(now.getSeconds()).padStart(2, "0");
  const ampm    = hours >= 12 ? "PM" : "AM";
  const h12     = String(hours % 12 || 12).padStart(2, "0");
  const timeStr = `${h12}:${mins}:${secs} ${ampm}`;

  // ── TopBar clean professional tokens ─────────────────────────────────────
  const TB = {
    text:    "#111827",
    muted:   "#6B7280",
    border:  "#E5E7EB",
    chipBg:  "#F9FAFB",
    chipBdr: "#E5E7EB",
  };

  return (
    <header
      className="h-14 flex items-center px-4 shrink-0 no-print z-10"
      style={{
        background: "#FFFFFF",
        borderBottom: "2px solid #CF291D",
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}
    >

      {/* LEFT — Date & Time + Quick nav icons */}
      <div className="flex-1 flex items-center gap-2.5 min-w-0">
        {/* Date/Time widget */}
        <div
          className="flex items-center gap-2.5 rounded-xl px-3 py-1.5"
          style={{
            background: "#F9FAFB",
            border: `1px solid ${TB.border}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          {/* Calendar day */}
          <div className="flex flex-col items-center leading-none shrink-0">
            <span
              className="text-[9px] font-black uppercase rounded-sm px-1.5 w-full text-center leading-snug text-white"
              style={{ background: "#CF291D" }}
            >
              {MONTH[now.getMonth()].toUpperCase()}
            </span>
            <span className="text-xl font-black leading-none" style={{ color: TB.text }}>
              {String(now.getDate()).padStart(2, "0")}
            </span>
          </div>
          {/* Divider */}
          <div className="w-px h-7" style={{ background: TB.border }} />
          {/* Day + Time */}
          <div className="flex flex-col leading-none">
            <span className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: TB.muted }}>
              {DAY[now.getDay()]} · {now.getFullYear()}
            </span>
            <span className="text-sm font-black font-mono tracking-tight mt-0.5" style={{ color: "#CF291D" }}>
              {timeStr}
            </span>
          </div>
        </div>

        {/* Quick nav: AI Analytics */}
        <button
          onClick={() => onNavigate("ai-analytics")}
          title="AI Intelligence"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: "#F0F0FF", border: "1px solid rgba(79,70,229,0.22)", color: "#4f46e5" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(79,70,229,0.10)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F0F0FF"; }}>
          <Brain size={14}/>
          <span className="hidden lg:inline">AI</span>
        </button>

        {/* Quick nav: Settings */}
        <button
          onClick={() => onNavigate("settings")}
          title="Settings"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: TB.chipBg, border: `1px solid ${TB.chipBdr}`, color: TB.muted }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(207,41,29,0.10)"; e.currentTarget.style.color = "#CF291D"; }}
          onMouseLeave={e => { e.currentTarget.style.background = TB.chipBg; e.currentTarget.style.color = TB.muted; }}>
          <Settings size={14}/>
          <span className="hidden lg:inline">Settings</span>
        </button>
      </div>

      {/* CENTER — Search */}
      <div ref={searchRef} className="relative w-[400px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TB.muted }}/>
        <input
          type="text"
          placeholder="Search invoices, barcodes, agents…  (F4)"
          value={query}
          ref={inputRef}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={(e) => { setShowResults(true); e.currentTarget.style.borderColor = "#CF291D"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(207,41,29,0.10)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = TB.border; e.currentTarget.style.boxShadow = "none"; }}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-xl focus:outline-none transition-all"
          style={{
            background: "#F9FAFB",
            border: `1.5px solid ${TB.border}`,
            color: TB.text,
          }}
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        )}
        {showResults && results.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50">
            {results.map((r, i) => (
              <button key={i}
                onClick={() => { onNavigate(r.view, r.type === "invoice" ? r.id : undefined); setQuery(""); setShowResults(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left">
                <span className="text-blue-500 shrink-0">
                  {r.type === "invoice" ? <FileText size={15} /> : <Users size={15} />}
                </span>
                <div>
                  <div className="text-sm font-medium text-gray-800">{r.label}</div>
                  <div className="text-xs text-gray-400">{r.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT — Actions */}
      <div className="flex-1 flex items-center justify-end gap-2">

        {/* New Invoice */}
        <button onClick={() => onNavigate("new-invoice")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors whitespace-nowrap"
          style={{ background: "#CF291D" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#B50717")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#CF291D")}>
          <PlusCircle size={15} /> New Invoice
        </button>

        {/* Calculator — floating draggable */}
        <button
          onClick={e => { e.stopPropagation(); setCalcOpen(v => !v); }}
          title="Calculator — drag to move anywhere"
          className="relative p-2 rounded-lg transition-all"
          style={{ color: calcOpen ? "#CF291D" : TB.muted, background: calcOpen ? "rgba(207,41,29,0.10)" : "transparent" }}
        >
          <Calculator size={18} />
        </button>
        {calcOpen && createPortal(
          <DraggableCalc onClose={() => setCalcOpen(false)} />,
          document.body
        )}

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => {
              setNotifOpen((v) => {
                if (!v) setSeen(true); // mark as seen when opening
                return !v;
              });
            }}
            className="relative p-2 rounded-lg transition-all"
            style={{ color: notifOpen ? "#CF291D" : TB.muted, background: notifOpen ? "rgba(207,41,29,0.10)" : "transparent" }}>
            <Bell size={18} />
            {totalNotifs > 0 && !seen && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {totalNotifs > 9 ? "9+" : totalNotifs}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden"
              style={{ width: 320, background: "#FFFFFF", border: "1px solid #E8E8E8" }}>

              {/* Dropdown header */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid #F3F4F6" }}>
                <div className="flex items-center gap-2">
                  <Bell size={15} style={{ color: "#CF291D" }} />
                  <span className="font-bold text-sm" style={{ color: "#1D1D1D" }}>Notifications</span>
                  {totalNotifs > 0 && (
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: "#CF291D" }}>
                      {totalNotifs > 9 ? "9+" : totalNotifs}
                    </span>
                  )}
                </div>
                <button onClick={() => setNotifOpen(false)}
                  className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>

              {/* Alert items */}
              {totalNotifs === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle size={28} className="mx-auto mb-2" style={{ color: "#16a34a" }} />
                  <p className="text-sm font-medium" style={{ color: "#374151" }}>All clear!</p>
                  <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>No pending alerts at this time.</p>
                </div>
              ) : (
                <div>
                  {notifications.pendingCount > 0 && (
                    <button
                      onClick={() => { onNavigate("ledger"); setNotifOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{ borderBottom: "1px solid #F9F9F9" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#FFF8F8")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "#FFF1F0" }}>
                        <AlertTriangle size={16} style={{ color: "#CF291D" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "#1D1D1D" }}>
                          {notifications.pendingCount} Outstanding Invoice{notifications.pendingCount > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                          Agents with unpaid balances — action required
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "#FEE2E2", color: "#CF291D" }}>
                        Overdue
                      </span>
                    </button>
                  )}
                  {notifications.lowStockCount > 0 && (
                    <button
                      onClick={() => { onNavigate("inventory"); setNotifOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{ borderBottom: "1px solid #F9F9F9" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#FFFBF0")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "#FFFBEB" }}>
                        <Package size={16} style={{ color: "#D97706" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "#1D1D1D" }}>
                          {notifications.lowStockCount} Low-Stock Alert{notifications.lowStockCount > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                          Ticket batches below minimum threshold
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "#FEF3C7", color: "#D97706" }}>
                        Warning
                      </span>
                    </button>
                  )}
                  {notifications.returnCount > 0 && (
                    <button
                      onClick={() => { onNavigate("returns"); setNotifOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{ borderBottom: "1px solid #F9F9F9" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#FFFDF0")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "#FFFBEB" }}>
                        <RotateCcw size={16} style={{ color: "#D97706" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "#1D1D1D" }}>
                          {notifications.returnCount} Pending Return{notifications.returnCount > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                          Unsettled ticket returns awaiting settlement
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "#FEF9C3", color: "#A16207" }}>
                        Pending
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Footer — View All Alerts */}
              <div className="px-4 py-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                <button
                  onClick={() => { onNavigate("alerts"); setNotifOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors"
                  style={{ background: "#CF291D", color: "#FFFFFF" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#B50717")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#CF291D")}
                >
                  <ExternalLink size={14} /> View All Alerts & Reminders
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DB status */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{
            background: dbReady ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${dbReady ? "rgba(22,163,74,0.28)" : "rgba(239,68,68,0.28)"}`,
          }}>
          <Database size={13} style={{ color: dbReady ? "#16a34a" : "#ef4444" }} />
          <span style={{ color: dbReady ? "#16a34a" : "#ef4444" }}>
            {dbReady ? "SQLite Online" : "Offline"}
          </span>
        </div>

        {/* ── Cloud Sync ── */}
        <div ref={syncRef} style={{ position: "relative" }}>
          <button
            onClick={() => setSyncOpen(v => !v)}
            title="Supabase Cloud Sync"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 10px",
              borderRadius: "8px",
              border: `1px solid ${
                syncStatus === "ok"    ? "rgba(22,163,74,0.35)"  :
                syncStatus === "error" ? "rgba(220,38,38,0.35)"  :
                syncStatus === "syncing" || syncStatus === "checking" ? "rgba(37,99,235,0.35)" :
                connStatus === "connected"    ? "rgba(22,163,74,0.28)"   :
                connStatus === "disconnected" ? "rgba(220,38,38,0.28)"   :
                "rgba(107,114,128,0.28)"
              }`,
              background: syncOpen ? "rgba(37,99,235,0.07)" : (
                syncStatus === "ok"    ? "#F0FDF4" :
                syncStatus === "error" ? "#FEF2F2" :
                syncStatus === "syncing" || syncStatus === "checking" ? "#EFF6FF" :
                connStatus === "connected"    ? "#F0FDF4" :
                connStatus === "disconnected" ? "#FEF2F2" :
                "#F9FAFB"
              ),
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
              color: syncStatus === "ok" ? "#16A34A" : syncStatus === "error" ? "#DC2626" :
                     syncStatus === "syncing" || syncStatus === "checking" ? "#2563EB" :
                     connStatus === "connected" ? "#16A34A" :
                     connStatus === "disconnected" ? "#DC2626" : "#6B7280",
              transition: "all 0.15s",
            }}
          >
            {(syncStatus === "syncing" || syncStatus === "checking") ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ animation: "spin 0.8s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : connStatus === "disconnected" || syncStatus === "error" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/><line x1="2" y1="2" x2="22" y2="22"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
              </svg>
            )}
            <span style={{ display: pendingItems > 0 ? "inline" : "none",
              background: "#EF4444", color: "#fff", borderRadius: "10px",
              padding: "0 5px", fontSize: "10px", fontWeight: 700 }}>
              {pendingItems}
            </span>
          </button>

          {/* ── Sync Panel Dropdown ── */}
          {syncOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: "480px", background: "#fff",
              border: "1px solid #E5E7EB", borderRadius: "14px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.16)",
              zIndex: 100, overflow: "hidden",
            }}>
              {/* Panel header */}
              <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #F3F4F6",
                display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CF291D" strokeWidth="2.5">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
                  </svg>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#111827" }}>Supabase Cloud Sync</span>
                </div>
                <button onClick={() => setSyncOpen(false)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "#9CA3AF", fontSize: "16px", padding: "0 2px", lineHeight: 1 }}>
                  ×
                </button>
              </div>

              {/* Connection status row */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6",
                display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: "50%", display: "inline-block",
                    background: connStatus === "connected" ? "#16A34A" : connStatus === "disconnected" ? "#DC2626" : "#D1D5DB",
                    boxShadow: connStatus === "connected" ? "0 0 0 3px rgba(22,163,74,0.2)" : undefined,
                    flexShrink: 0,
                  }}/>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                    {connStatus === "connected" ? "Connected" : connStatus === "disconnected" ? "Disconnected" : "Unknown"}
                  </span>
                  {syncStatus === "checking" && (
                    <span style={{ fontSize: "11px", color: "#6B7280" }}>Checking…</span>
                  )}
                </div>
                <button
                  onClick={checkConnection}
                  disabled={syncStatus === "checking" || syncStatus === "syncing"}
                  style={{
                    padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: "6px",
                    background: "#F9FAFB", color: "#374151", fontSize: "12px", fontWeight: 600,
                    cursor: syncStatus === "checking" ? "not-allowed" : "pointer", opacity: syncStatus === "checking" ? 0.6 : 1,
                  }}>
                  Test Connection
                </button>
              </div>

              {/* Push Now */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6",
                display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>Push to Cloud</div>
                  {pendingItems > 0 ? (
                    <div style={{ fontSize: "11px", color: "#D97706", marginTop: "2px" }}>
                      {pendingItems} record{pendingItems !== 1 ? "s" : ""} pending
                    </div>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>
                      Sync local database to Supabase
                    </div>
                  )}
                </div>
                <button
                  onClick={runSync}
                  disabled={syncStatus === "syncing" || syncStatus === "checking"}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 14px", border: "none", borderRadius: "6px",
                    background: syncStatus === "syncing" ? "#9CA3AF" : "#CF291D",
                    color: "#fff", fontSize: "12px", fontWeight: 700,
                    cursor: syncStatus === "syncing" ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                  }}>
                  {syncStatus === "syncing" ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ animation: "spin 0.8s linear infinite" }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Pushing…
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                      </svg>
                      Push Now
                    </>
                  )}
                </button>
              </div>

              {/* Full Sync */}
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#FAFAFA" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>Full Sync All Tables</div>
                  <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>
                    Push every local record — agents, inventory, invoices…
                  </div>
                </div>
                <button
                  onClick={runFullSync}
                  disabled={syncStatus === "syncing" || syncStatus === "checking"}
                  style={{
                    display: "flex", alignItems: "center", gap: "5px",
                    padding: "5px 12px", border: "1px solid #D1D5DB", borderRadius: "6px",
                    background: syncStatus === "syncing" ? "#F3F4F6" : "#FFFFFF",
                    color: "#374151", fontSize: "12px", fontWeight: 600,
                    cursor: syncStatus === "syncing" ? "not-allowed" : "pointer",
                    opacity: syncStatus === "syncing" ? 0.6 : 1,
                  }}>
                  {syncStatus === "syncing" ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      style={{ animation: "spin 0.8s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
                    </svg>
                  )}
                  Full Sync
                </button>
              </div>

              {/* Logs */}
              <div style={{ padding: "8px 0" }}>
                <div style={{ padding: "4px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Activity Log
                  </span>
                  {syncLogs.length > 0 && (
                    <button onClick={() => setSyncLogs([])}
                      style={{ border: "none", background: "none", cursor: "pointer", fontSize: "11px", color: "#9CA3AF", padding: 0 }}>
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: "260px", overflowY: "auto", padding: "0 16px" }}>
                  {syncLogs.length === 0 ? (
                    <div style={{ padding: "12px 0", textAlign: "center", fontSize: "12px", color: "#D1D5DB" }}>
                      No activity yet — test connection or push to see logs
                    </div>
                  ) : (
                    syncLogs.map((log, i) => (
                      <div key={i} style={{
                        display: "flex", gap: "8px", padding: "4px 0",
                        borderBottom: i < syncLogs.length - 1 ? "1px solid #F9FAFB" : undefined,
                        alignItems: "flex-start",
                      }}>
                        <span style={{ fontSize: "10px", color: "#9CA3AF", whiteSpace: "nowrap", marginTop: "1px", flexShrink: 0 }}>
                          {log.time}
                        </span>
                        <span style={{
                          fontSize: "12px", lineHeight: 1.4,
                          color: log.type === "ok" ? "#16A34A" : log.type === "error" ? "#DC2626" :
                                 log.type === "warn" ? "#D97706" : "#374151",
                        }}>
                          {log.msg}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Role switcher ── */}
        <div ref={roleRef} className="relative">
          <button
            onClick={() => setRoleMenuOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: role === "admin" ? "rgba(207,41,29,0.10)" : "rgba(37,99,235,0.08)",
              border: `1px solid ${role === "admin" ? "rgba(207,41,29,0.25)" : "rgba(37,99,235,0.20)"}`,
              color: role === "admin" ? "#CF291D" : "#2563eb",
              boxShadow: roleMenuOpen ? `0 0 0 3px ${role === "admin" ? "rgba(207,41,29,0.12)" : "rgba(37,99,235,0.10)"}` : "none",
            }}>
            {role === "admin"
              ? <ShieldCheck size={13}/>
              : <User size={13}/>}
            <span className="uppercase tracking-wider">
              {role === "admin" ? "Admin" : role === "cashier" ? "Cashier" : "Guest"}
            </span>
            <ChevronDown size={11} className={`transition-transform ${roleMenuOpen ? "rotate-180" : ""}`}/>
          </button>

          {/* Role dropdown — glass panel */}
          {roleMenuOpen && (
            <div
              className="absolute right-0 top-full mt-2 rounded-2xl overflow-hidden z-50"
              style={{
                width: 210,
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
              }}
            >
              {/* Current role info */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(207,41,29,0.08)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "rgba(61,26,24,0.4)" }}>
                  Signed in as
                </p>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: role === "admin" ? "rgba(207,41,29,0.12)" : "rgba(37,99,235,0.10)" }}>
                    {role === "admin"
                      ? <ShieldCheck size={15} style={{ color: "#CF291D" }}/>
                      : <User size={15} style={{ color: "#2563eb" }}/>}
                  </div>
                  <div>
                    <p className="text-sm font-black capitalize" style={{ color: "#3D1A18" }}>{role ?? "Guest"}</p>
                    <p className="text-[10px] font-medium" style={{ color: "rgba(61,26,24,0.45)" }}>
                      {role === "admin" ? "Full access" : "Limited access"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Switch role */}
              <button
                onClick={() => { clearRole(); setRoleMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-left transition-all"
                style={{ color: "#3D1A18", borderBottom: "1px solid rgba(207,41,29,0.06)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(207,41,29,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(61,26,24,0.08)" }}>
                  {role === "admin" ? <User size={13} style={{ color: "#3D1A18" }}/> : <ShieldCheck size={13} style={{ color: "#3D1A18" }}/>}
                </div>
                <span>Switch to {role === "admin" ? "Cashier" : "Admin"}</span>
              </button>

              {/* Logout */}
              <button
                onClick={() => { clearRole(); setRoleMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-left transition-all"
                style={{ color: "#CF291D" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(207,41,29,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(207,41,29,0.10)" }}>
                  <LogOut size={13} style={{ color: "#CF291D" }}/>
                </div>
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>

      </div>

    </header>
  );
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
