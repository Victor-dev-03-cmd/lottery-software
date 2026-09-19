import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Save, Plus, Trash2, RefreshCw, Database, Shield, Printer,
  DollarSign, Gamepad2, Building2, CheckCircle, AlertTriangle,
  ToggleLeft, ToggleRight, Eye, EyeOff, HardDrive, RotateCcw,
  Pencil, X, Home, ChevronRight, Cloud, FlaskConical, Lock, ShieldCheck,
} from "lucide-react";
import { testSupabaseConnection } from "../services/supabase";
import {
  getCompanySettings, saveCompanySettings,
  getLotteryGames, saveLotteryGame, deleteLotteryGame, toggleLotteryGame,
  getAgentsWithCreditLimit, updateAgentCreditLimit,
  getAppSettings, saveSettings,
} from "../services/database";
import { seedDemoData, clearDemoData } from "../services/seedData";
import ImportDataTab from "./ImportDataTab";
import SoftwareUpdateTab from "./SoftwareUpdateTab";
import type { CompanySettings, LotteryGame } from "../types";
import { useAuth } from "../contexts/AuthContext";

type Tab = "general" | "games" | "financial" | "printing" | "security" | "ai" | "updates" | "import" | "demo";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "general",   label: "General",           icon: <Building2 size={15} /> },
  { key: "games",     label: "Games",             icon: <Gamepad2 size={15} /> },
  { key: "financial", label: "Financial",         icon: <DollarSign size={15} /> },
  { key: "printing",  label: "Printing",          icon: <Printer size={15} /> },
  { key: "security",  label: "Backup & Security", icon: <Shield size={15} /> },
  { key: "ai",        label: "AI Configuration",  icon: <span style={{ fontSize: 13 }}>🧠</span> },
  { key: "updates",   label: "Software Updates",  icon: <span style={{ fontSize: 13 }}>🔄</span> },
  { key: "import",    label: "Import Data",       icon: <span style={{ fontSize: 13 }}>📥</span> },
  { key: "demo",      label: "Demo Data",         icon: <FlaskConical size={15} /> },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saved, setSaved] = useState(false);

  function showSaved() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Settings</span>
        </nav>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Settings</h1>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Application configuration & preferences</p>
        </div>

        {/* Toast */}
        {saved && (
          <div className="fixed top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-sm z-50 text-white"
            style={{ background: "#10b981" }}>
            <CheckCircle size={15} /> Settings saved
          </div>
        )}

        {/* ASROZ settings layout: left sidebar + right content */}
        <div className="flex gap-5">
          {/* Left settings nav */}
          <div className="w-52 shrink-0">
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="p-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>SETTINGS</p>
              </div>
              <nav className="p-2">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-left"
                    style={{
                      background: activeTab === t.key ? "#FFF1F0" : "transparent",
                      color: activeTab === t.key ? "#CF291D" : "#6B7280",
                      fontWeight: activeTab === t.key ? 600 : 400,
                    }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 min-w-0">
            {activeTab === "general"   && <GeneralTab onSaved={showSaved} />}
            {activeTab === "games"     && <GamesTab />}
            {activeTab === "financial" && <FinancialTab onSaved={showSaved} />}
            {activeTab === "printing"  && <PrintingTab onSaved={showSaved} />}
            {activeTab === "security"  && <SecurityTab onSaved={showSaved} />}
            {activeTab === "ai"        && <AIConfigTab />}
            {activeTab === "updates"   && <SoftwareUpdateTab />}
            {activeTab === "import"    && <ImportDataTab />}
            {activeTab === "demo"      && <DemoDataTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 1. GENERAL TAB ────────────────────────────────────────────────────────────

function GeneralTab({ onSaved }: { onSaved: () => void }) {
  const [company, setCompany] = useState<CompanySettings>({
    name: "", address: "", phone: "", nlb_reg: "", dlb_reg: "", email: "",
  });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCompanySettings(), getAppSettings()]).then(([co, s]) => {
      setCompany(co);
      setSettings(s);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    await saveCompanySettings(company);
    await saveSettings({
      invoice_prefix: settings.invoice_prefix ?? "",
      invoice_auto_numbering: settings.invoice_auto_numbering ?? "true",
      default_prepared_by: settings.default_prepared_by ?? "",
    });
    onSaved();
  }

  const set = (k: string, v: string) => setSettings((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="p-4" style={{ color: "#9CA3AF" }}>Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Company Profile</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Details printed on every invoice</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <Field label="Company Name" col2>
            <input className="inp" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
          </Field>
          <Field label="Address (Invoice Header)" col2>
            <input className="inp" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="inp" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="inp" type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
          </Field>
          <Field label="NLB Registration No.">
            <input className="inp" value={company.nlb_reg} placeholder="NLB A143" onChange={(e) => setCompany({ ...company, nlb_reg: e.target.value })} />
          </Field>
          <Field label="DLB Registration No.">
            <input className="inp" value={company.dlb_reg} placeholder="DLB 01/7386" onChange={(e) => setCompany({ ...company, dlb_reg: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Default Invoice Settings</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Applies to all new invoices</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <Field label="Invoice Number Prefix">
            <input className="inp" value={settings.invoice_prefix ?? ""} placeholder="Leave blank for plain numbers"
              onChange={(e) => set("invoice_prefix", e.target.value)} />
          </Field>
          <Field label="Default Prepared By">
            <input className="inp" value={settings.default_prepared_by ?? "sameera"} placeholder="Staff name on invoice"
              onChange={(e) => set("default_prepared_by", e.target.value)} />
          </Field>
          <Field label="Invoice Numbering" col2>
            <div className="flex items-center gap-4 mt-1">
              {["true", "false"].map((v) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="auto_num" value={v} checked={settings.invoice_auto_numbering === v}
                    onChange={() => set("invoice_auto_numbering", v)} />
                  <span className="text-sm" style={{ color: "#1D1D1D" }}>{v === "true" ? "Auto-increment" : "Manual entry"}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <SaveBtn onClick={handleSave} />
    </div>
  );
}

// ── 2. GAMES TAB ──────────────────────────────────────────────────────────────

function GamesTab() {
  const [games, setGames] = useState<(LotteryGame & { is_enabled?: number })[]>([]);
  const [newGame, setNewGame] = useState<LotteryGame>({ name: "", cost_price: 32.5, unit_price: 32.5, board: "NLB" });
  const [editing, setEditing] = useState<(LotteryGame & { is_enabled?: number }) | null>(null);
  const [filter, setFilter] = useState<"all" | "NLB" | "DLB">("all");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);

  const fmt = (n: number) => new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2 }).format(n);

  async function load() { setGames(await getLotteryGames() as (LotteryGame & { is_enabled?: number })[]); }
  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newGame.name.trim()) { alert("Game name required."); return; }
    await saveLotteryGame(newGame);
    setNewGame({ name: "", cost_price: 32.5, unit_price: 32.5, board: newGame.board });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    load();
  }

  async function handleEditSave() {
    if (!editing) return;
    await saveLotteryGame(editing);
    setEditing(null);
    load();
  }

  async function handleToggle(g: LotteryGame & { is_enabled?: number }) {
    await toggleLotteryGame(g.id!, (g.is_enabled ?? 1) === 0);
    load();
  }

  const nlb = games.filter(g => g.board === "NLB" && (!search || g.name.toLowerCase().includes(search.toLowerCase())));
  const dlb = games.filter(g => g.board === "DLB" && (!search || g.name.toLowerCase().includes(search.toLowerCase())));
  const visible = filter === "NLB" ? nlb : filter === "DLB" ? dlb : [...nlb, ...dlb];

  const GameRow = ({ g }: { g: LotteryGame & { is_enabled?: number } }) => (
    <tr key={g.id} className="hover:bg-gray-50/40 transition-colors"
      style={{ borderBottom: "1px solid #F9F9F9", opacity: (g.is_enabled ?? 1) === 0 ? 0.5 : 1 }}>
      <td className="px-3 py-2.5 text-sm font-medium" style={{ color: "#1D1D1D" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ padding: "1px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700,
            background: g.board === "NLB" ? "#dbeafe" : "#ffedd5",
            color: g.board === "NLB" ? "#1d4ed8" : "#c2410c" }}>
            {g.board}
          </span>
          {editing?.id === g.id
            ? <input className="inp py-0.5 flex-1" value={editing!.name}
                onChange={(e) => setEditing(p => p ? { ...p, name: e.target.value } : p)} autoFocus />
            : g.name}
        </div>
      </td>
      {/* 🟠 Nimalsiri → Ajith cost price */}
      <td className="px-3 py-2.5 text-sm text-right">
        {editing?.id === g.id
          ? <input type="number" step="0.01" className="inp py-0.5 w-24 text-right" value={editing!.cost_price ?? 0}
              onChange={(e) => setEditing(p => p ? { ...p, cost_price: parseFloat(e.target.value) || 0 } : p)} />
          : <span style={{ color: "#D97706", fontWeight: 600 }}>Rs. {fmt(g.cost_price ?? 0)}</span>}
      </td>
      {/* 🟢 Ajith → Agent selling price */}
      <td className="px-3 py-2.5 text-sm text-right">
        {editing?.id === g.id
          ? <input type="number" step="0.01" className="inp py-0.5 w-24 text-right" value={editing!.unit_price}
              onChange={(e) => setEditing(p => p ? { ...p, unit_price: parseFloat(e.target.value) || 0 } : p)} />
          : <span style={{ color: "#16A34A", fontWeight: 600 }}>Rs. {fmt(g.unit_price)}</span>}
      </td>
      {/* Margin */}
      <td className="px-3 py-2.5 text-sm text-right">
        {(() => {
          const margin = g.unit_price - (g.cost_price ?? 0);
          const pct = g.unit_price > 0 ? ((margin / g.unit_price) * 100).toFixed(1) : "0.0";
          return <span style={{ color: margin >= 0 ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
            Rs. {fmt(margin)} <span style={{ color: "#9CA3AF", fontWeight: 400 }}>({pct}%)</span>
          </span>;
        })()}
      </td>
      {/* Toggle */}
      <td className="px-3 py-2.5 text-center">
        <button onClick={() => handleToggle(g)}>
          {(g.is_enabled ?? 1) === 1
            ? <ToggleRight size={20} style={{ color: "#10b981" }} />
            : <ToggleLeft size={20} style={{ color: "#9CA3AF" }} />}
        </button>
      </td>
      {/* Actions */}
      <td className="px-2 py-2.5">
        {editing?.id === g.id ? (
          <div className="flex gap-1">
            <button onClick={handleEditSave} className="p-1.5 rounded hover:bg-green-50" style={{ color: "#10b981" }}><Save size={13} /></button>
            <button onClick={() => setEditing(null)} className="p-1.5 rounded hover:bg-gray-100" style={{ color: "#9CA3AF" }}><X size={13} /></button>
          </div>
        ) : (
          <div className="flex gap-1">
            <button onClick={() => setEditing({ ...g })} className="p-1.5 rounded hover:bg-gray-100" style={{ color: "#6B7280" }}><Pencil size={13} /></button>
            <button onClick={() => { if (confirm(`Delete "${g.name}"?`)) deleteLotteryGame(g.id!).then(load); }}
              className="p-1.5 rounded hover:bg-red-50" style={{ color: "#CF291D" }}><Trash2 size={13} /></button>
          </div>
        )}
      </td>
    </tr>
  );

  const TableHeader = () => (
    <thead>
      <tr style={{ background: "#F9FAFB" }}>
        <th className="px-3 py-2.5 text-left" style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Game</th>
        <th className="px-3 py-2.5 text-right" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#D97706" }}>
          🟠 Nimalsiri → Ajith
        </th>
        <th className="px-3 py-2.5 text-right" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#16A34A" }}>
          🟢 Ajith → Agent
        </th>
        <th className="px-3 py-2.5 text-right" style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Margin</th>
        <th className="px-3 py-2.5 text-center" style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Active</th>
        <th style={{ width: "5rem" }} />
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      {/* Add game */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>➕ Add New Game</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Set both the purchase price from Nimalsiri and the selling price to agents</p>
        </div>
        <div className="p-5 grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#6B7280" }}>Game Name</label>
            <input type="text" value={newGame.name} placeholder="e.g. Mega Power"
              onChange={(e) => setNewGame({ ...newGame, name: e.target.value })}
              className="inp w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#D97706" }}>🟠 Nimalsiri → Ajith (Rs.)</label>
            <input type="number" step="0.01" value={newGame.cost_price ?? ""} placeholder="Cost price"
              onChange={(e) => setNewGame({ ...newGame, cost_price: parseFloat(e.target.value) || 0 })}
              className="inp w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#16A34A" }}>🟢 Ajith → Agent (Rs.)</label>
            <input type="number" step="0.01" value={newGame.unit_price || ""} placeholder="Sell price"
              onChange={(e) => setNewGame({ ...newGame, unit_price: parseFloat(e.target.value) || 0 })}
              className="inp w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#6B7280" }}>Board</label>
            <select value={newGame.board}
              onChange={(e) => setNewGame({ ...newGame, board: e.target.value as "NLB" | "DLB" })}
              className="inp w-full">
              <option value="NLB">📘 NLB</option>
              <option value="DLB">📙 DLB</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#CF291D" }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
        {saved && <div className="px-5 pb-3 text-xs font-semibold" style={{ color: "#10b981" }}>✓ Game added successfully</div>}
      </div>

      {/* Board filter tabs + search */}
      <div className="flex items-center gap-3">
        {(["all", "NLB", "DLB"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filter === f ? "#CF291D" : "#F3F4F6",
              color: filter === f ? "#fff" : "#374151",
            }}>
            {f === "all" ? `All (${games.length})` : f === "NLB" ? `📘 NLB (${nlb.length})` : `📙 DLB (${dlb.length})`}
          </button>
        ))}
        <input type="text" value={search} placeholder="Search games…"
          onChange={(e) => setSearch(e.target.value)}
          className="inp ml-auto w-48" />
      </div>

      {/* NLB table */}
      {(filter === "all" || filter === "NLB") && nlb.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).length > 0 && (
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff", border: "1px solid #E8E8E8" }}>
          <div className="px-5 py-2.5 flex items-center gap-2"
            style={{ background: "#EFF6FF", borderBottom: "2px solid #2563EB" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>📘 NLB — National Lottery Board</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>{nlb.length} games</span>
          </div>
          <table className="w-full"><TableHeader />
            <tbody>{nlb.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).map(g => <GameRow key={g.id} g={g} />)}</tbody>
          </table>
        </div>
      )}

      {/* DLB table */}
      {(filter === "all" || filter === "DLB") && dlb.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).length > 0 && (
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff", border: "1px solid #E8E8E8" }}>
          <div className="px-5 py-2.5 flex items-center gap-2"
            style={{ background: "#FFF7ED", borderBottom: "2px solid #EA580C" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#c2410c" }}>📙 DLB — Development Lottery Board</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>{dlb.length} games</span>
          </div>
          <table className="w-full"><TableHeader />
            <tbody>{dlb.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).map(g => <GameRow key={g.id} g={g} />)}</tbody>
          </table>
        </div>
      )}

      {visible.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: "#9CA3AF" }}>No games found</div>
      )}
    </div>
  );
}

// ── 3. FINANCIAL TAB ──────────────────────────────────────────────────────────

function FinancialTab({ onSaved }: { onSaved: () => void }) {
  const { withAdminToken } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<{ id?: number; name: string; credit_limit: number; outstanding_balance: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState<{ id: number; value: string } | null>(null);
  const [authErr, setAuthErr] = useState("");

  useEffect(() => {
    Promise.all([getAppSettings(), getAgentsWithCreditLimit()]).then(([s, a]) => {
      setSettings(s);
      setAgents(a);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setAuthErr("");
    try {
      await withAdminToken(async () => {
        await saveSettings({
          default_commission_type: settings.default_commission_type ?? "percentage",
          default_commission_rate: settings.default_commission_rate ?? "5",
          credit_limits_enabled: settings.credit_limits_enabled ?? "false",
          default_credit_limit: settings.default_credit_limit ?? "500000",
          nlb_winning_validity_days: settings.nlb_winning_validity_days ?? "90",
          dlb_winning_validity_days: settings.dlb_winning_validity_days ?? "90",
        });
        onSaved();
      });
    } catch (e) { setAuthErr(friendlyAuthError(e)); }
  }

  async function saveLimit(agentId: number, value: string) {
    setAuthErr("");
    try {
      await withAdminToken(async () => {
        const limit = parseFloat(value) || 0;
        await updateAgentCreditLimit(agentId, limit);
        setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, credit_limit: limit } : a));
        setEditingLimit(null);
      });
    } catch (e) { setAuthErr(friendlyAuthError(e)); }
  }

  const set = (k: string, v: string) => setSettings((p) => ({ ...p, [k]: v }));
  const fmt = (n: number) => new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2 }).format(n);

  if (loading) return <div className="p-4" style={{ color: "#9CA3AF" }}>Loading…</div>;

  const creditEnabled = settings.credit_limits_enabled === "true";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Default Commission Rules</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Applied to agents without a specific commission scheme</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <Field label="Commission Type">
            <select className="inp" value={settings.default_commission_type ?? "percentage"}
              onChange={(e) => set("default_commission_type", e.target.value)}>
              <option value="percentage">Percentage of Invoice Total</option>
              <option value="per_ticket">Fixed per Ticket (Rs.)</option>
              <option value="fixed">Fixed per Invoice (Rs.)</option>
            </select>
          </Field>
          <Field label={`Rate (${settings.default_commission_type === "percentage" ? "%" : "Rs."})`}>
            <input type="number" step="0.01" className="inp" value={settings.default_commission_rate ?? "5"}
              onChange={(e) => set("default_commission_rate", e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Credit Limit & Loan Thresholds</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Block new invoices or show red alerts when agent exceeds limit</p>
        </div>
        <div className="p-5 space-y-3">
          <ToggleRow label="Enable credit limits" value={creditEnabled}
            onChange={(v) => set("credit_limits_enabled", v ? "true" : "false")} />
          {creditEnabled && (
            <Field label="Default credit limit (Rs.) — applies to agents without a custom limit">
              <input type="number" step="1000" className="inp w-48" value={settings.default_credit_limit ?? "500000"}
                onChange={(e) => set("default_credit_limit", e.target.value)} />
            </Field>
          )}
        </div>
      </div>

      {creditEnabled && agents.length > 0 && (
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div className="px-5 py-3" style={{ borderBottom: "2px solid #CF291D", background: "#374151" }}>
            <span className="font-semibold text-sm text-white">Per-Agent Credit Limits</span>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Credit Limit (Rs.)</th>
                <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Outstanding</th>
                <th className="px-4 py-3 text-center" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", width: "6rem" }}>Alert</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const over = creditEnabled && a.credit_limit > 0 && a.outstanding_balance > a.credit_limit;
                return (
                  <tr key={a.id} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9", background: over ? "#FFF1F0" : undefined }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: "#1D1D1D" }}>{a.name}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingLimit?.id === a.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input type="number" step="1000" className="inp py-0.5 w-28 text-right"
                            value={editingLimit!.value}
                            onChange={(e) => setEditingLimit((p) => p ? { ...p, value: e.target.value } : p)}
                            autoFocus />
                          <button onClick={() => saveLimit(a.id ?? 0, editingLimit!.value)}
                            className="p-1" style={{ color: "#10b981" }}><Save size={13} /></button>
                          <button onClick={() => setEditingLimit(null)}
                            className="p-1" style={{ color: "#9CA3AF" }}><X size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingLimit({ id: a.id ?? 0, value: String(a.credit_limit) })}
                          className="flex items-center gap-1 ml-auto hover:opacity-70" style={{ color: "#1D1D1D" }}>
                          {a.credit_limit > 0 ? fmt(a.credit_limit) : <span style={{ color: "#9CA3AF" }}>Set limit</span>}
                          <Pencil size={11} />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: over ? "#CF291D" : "#6B7280" }}>
                      {fmt(a.outstanding_balance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {over && <span title="Exceeds credit limit!"><AlertTriangle size={15} style={{ color: "#CF291D", margin: "0 auto" }} /></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Winning Ticket Claims</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Validity rules for returned NLB / DLB winning tickets</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <Field label="NLB Winning Ticket Validity (days)">
            <input type="number" min="1" className="inp" value={settings.nlb_winning_validity_days ?? "90"}
              onChange={(e) => set("nlb_winning_validity_days", e.target.value)} />
          </Field>
          <Field label="DLB Winning Ticket Validity (days)">
            <input type="number" min="1" className="inp" value={settings.dlb_winning_validity_days ?? "90"}
              onChange={(e) => set("dlb_winning_validity_days", e.target.value)} />
          </Field>
        </div>
      </div>

      {authErr && (
        <div className="px-2 pb-1 text-xs font-semibold" style={{ color: "#DC2626" }}>{authErr}</div>
      )}
      <SaveBtn onClick={handleSave} />
    </div>
  );
}

// ── 4. PRINTING TAB ───────────────────────────────────────────────────────────

function PrintingTab({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { getAppSettings().then((s) => { setSettings(s); setLoading(false); }); }, []);

  async function handleSave() {
    await saveSettings({
      default_printer_type: settings.default_printer_type ?? "a4",
      show_company_logo: settings.show_company_logo ?? "false",
      show_terms: settings.show_terms ?? "false",
      terms_text: settings.terms_text ?? "",
      bank_details: settings.bank_details ?? "",
      show_bank_details: settings.show_bank_details ?? "false",
      auto_print_on_save: settings.auto_print_on_save ?? "false",
    });
    onSaved();
  }

  const set = (k: string, v: string) => setSettings((p) => ({ ...p, [k]: v }));
  if (loading) return <div className="p-4" style={{ color: "#9CA3AF" }}>Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Printer Selection</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Default format when printing invoices</p>
        </div>
        <div className="p-5 flex gap-4">
          {[
            { val: "a4", label: "A4 / Laser Printer", desc: "Full-page Ajith Rohana invoice (210mm)" },
            { val: "thermal", label: "Thermal / POS Receipt", desc: "Compact 80mm thermal printer" },
          ].map(({ val, label, desc }) => {
            const active = settings.default_printer_type === val;
            return (
              <label key={val}
                className="flex-1 flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors"
                style={{ borderColor: active ? "#CF291D" : "#E8E8E8", background: active ? "#FFF1F0" : "#FFFFFF" }}>
                <input type="radio" name="printer" value={val} checked={active}
                  onChange={() => set("default_printer_type", val)} className="mt-0.5" />
                <div>
                  <div className="font-medium text-sm" style={{ color: "#1D1D1D" }}>{label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Invoice Template Options</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Toggle what appears on printed invoices</p>
        </div>
        <div className="p-5 space-y-3">
          <ToggleRow label="Show company logo on invoice"
            value={settings.show_company_logo === "true"}
            onChange={(v) => set("show_company_logo", v ? "true" : "false")} />
          <ToggleRow label="Show Terms & Conditions footer"
            value={settings.show_terms === "true"}
            onChange={(v) => set("show_terms", v ? "true" : "false")} />
          {settings.show_terms === "true" && (
            <Field label="Terms & Conditions text" col2>
              <textarea rows={3} className="inp resize-y" value={settings.terms_text ?? ""}
                onChange={(e) => set("terms_text", e.target.value)}
                placeholder="All lottery tickets are sold as-is…" />
            </Field>
          )}
          <ToggleRow label="Show bank account details for direct deposits"
            value={settings.show_bank_details === "true"}
            onChange={(v) => set("show_bank_details", v ? "true" : "false")} />
          {settings.show_bank_details === "true" && (
            <Field label="Bank Account Details" col2>
              <textarea rows={3} className="inp resize-y" value={settings.bank_details ?? ""}
                onChange={(e) => set("bank_details", e.target.value)}
                placeholder="Bank: People's Bank&#10;Branch: Colombo&#10;Account: 000-1-001-0-0000000" />
            </Field>
          )}
          <ToggleRow label="Auto-open print dialog after saving a new invoice"
            value={settings.auto_print_on_save === "true"}
            onChange={(v) => set("auto_print_on_save", v ? "true" : "false")} />
        </div>
      </div>

      <SaveBtn onClick={handleSave} />
    </div>
  );
}

// ── Auth error helper ─────────────────────────────────────────────────────────
function friendlyAuthError(e: unknown): string {
  const msg = String(e);
  if (msg.includes("Admin PIN is set") || msg.includes("ADMIN button")) {
    return "Admin PIN is configured — click the ADMIN button (top-right) to log in first.";
  }
  if (msg.includes("session required") || msg.includes("session expired")) {
    return "Admin session expired — click the ADMIN button (top-right) to log in again.";
  }
  return msg.replace(/^Error: /, "");
}

// ── 5. SECURITY & BACKUP TAB ──────────────────────────────────────────────────

function SecurityTab({ onSaved }: { onSaved: () => void }) {
  const { withAdminToken, adminToken } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showCashierPin, setShowCashierPin] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [cashierPinInput, setCashierPinInput] = useState("");
  const [pinStatus, setPinStatus] = useState("");

  const [dbPath, setDbPath] = useState("");
  const [dbExists, setDbExists] = useState<boolean | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [backupStatus, setBackupStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  useEffect(() => {
    getAppSettings().then((s) => { setSettings(s); setLoading(false); });
    loadBackupInfo();
  }, []);

  async function loadBackupInfo() {
    try {
      const [path, exists, bkps] = await Promise.all([
        invoke<string>("get_db_path"),
        invoke<boolean>("db_file_exists"),
        invoke<string[]>("list_backups"),
      ]);
      setDbPath(path);
      setDbExists(exists);
      setBackups(bkps);
    } catch { /* running in browser preview */ }
  }

  async function handleBackup() {
    setBackupLoading(true);
    setBackupStatus(null);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const destPath = await save({
        defaultPath: `nimalsiri_backup_${ts}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!destPath) { setBackupLoading(false); return; }
      await withAdminToken(async () => {
        await invoke("backup_db_to_path", { destPath });
      });
      setBackupStatus({ ok: true, msg: `Backup saved to: ${destPath}` });
      loadBackupInfo();
    } catch (e) {
      setBackupStatus({ ok: false, msg: friendlyAuthError(e) });
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleRestore() {
    if (!confirm(
      "⚠️ Restore will REPLACE the current database.\n" +
      "A pre-restore backup will be created automatically.\n\n" +
      "Continue?"
    )) return;

    setRestoreLoading(true);
    setBackupStatus(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const srcPath = await open({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        multiple: false,
        directory: false,
      });
      if (!srcPath) { setRestoreLoading(false); return; }

      await withAdminToken(async () => {
        const { closeAndResetDb } = await import("../services/database");
        await closeAndResetDb();

        await invoke("restore_db_from_path", {
          srcPath: typeof srcPath === "string" ? srcPath : srcPath,
        });
      });

      setBackupStatus({ ok: true, msg: "Database restored. Reloading app…" });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setBackupStatus({ ok: false, msg: friendlyAuthError(e) });
    } finally {
      setRestoreLoading(false);
    }
  }

  async function handleSavePins() {
    try {
      await withAdminToken(async () => {
        const { hashPin } = await import("../hooks/usePinGuard");
        const toSave: Record<string, string> = {
          auto_backup_enabled: settings.auto_backup_enabled ?? "false",
          auto_backup_frequency: settings.auto_backup_frequency ?? "daily",
        };

        if (adminPinInput) {
          if (adminPinInput.length < 4) { alert("Admin PIN must be at least 4 digits."); return; }
          toSave.admin_pin_hash = await hashPin(adminPinInput);
          setPinStatus("Admin PIN updated");
        }
        if (cashierPinInput) {
          if (cashierPinInput.length < 4) { alert("Cashier PIN must be at least 4 digits."); return; }
          toSave.cashier_pin_hash = await hashPin(cashierPinInput);
          setPinStatus((p) => p ? p + "  Cashier PIN updated" : "Cashier PIN updated");
        }

        await saveSettings(toSave);
        setAdminPinInput("");
        setCashierPinInput("");
        setTimeout(() => setPinStatus(""), 3000);
        onSaved();
      });
    } catch (err) {
      setPinStatus(friendlyAuthError(err));
    }
  }

  async function handleClearPin(role: "admin" | "cashier") {
    if (!confirm(`Clear ${role} PIN? Access control for ${role} will be disabled.`)) return;
    try {
      await withAdminToken(async () => {
        await saveSettings({ [`${role}_pin_hash`]: "" });
        onSaved();
      });
    } catch (err) {
      setPinStatus(friendlyAuthError(err));
    }
  }

  const set = (k: string, v: string) => setSettings((p) => ({ ...p, [k]: v }));
  if (loading) return <div className="p-4" style={{ color: "#9CA3AF" }}>Loading…</div>;

  const adminPinSet = !!(settings.admin_pin_hash);
  const cashierPinSet = !!(settings.cashier_pin_hash);

  return (
    <div className="space-y-5">

      {/* ── Admin session status banner ── */}
      {adminToken ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D" }}>
          <ShieldCheck size={16} style={{ color: "#16A34A", flexShrink: 0 }} />
          Admin session active — all security operations are unlocked.
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#92400E" }}>
          <Lock size={16} style={{ color: "#D97706", flexShrink: 0 }} />
          <div>
            <span className="font-semibold">No active admin session.</span>{" "}
            {settings.admin_pin_hash
              ? "Click the ADMIN button (top-right) and enter your PIN to unlock security operations."
              : "No admin PIN is configured yet — you can set one below. All operations are accessible until a PIN is set."}
          </div>
        </div>
      )}

      {/* PIN Protection */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>User Access & PIN Protection</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Hash-secured PINs stored in local SQLite — leave blank to disable</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: "#FFF1F0", border: "1px solid #fecaca", color: "#991b1b" }}>
            <Shield size={15} className="mt-0.5 shrink-0" style={{ color: "#CF291D" }} />
            PINs are stored as SHA-256 hashes. Setting a PIN will prompt on sensitive actions (delete invoice, modify credit limits, change settings).
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Admin PIN */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: "#1D1D1D" }}>Admin PIN</label>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: adminPinSet ? "#dcfce7" : "#F3F4F6", color: adminPinSet ? "#15803d" : "#6B7280" }}>
                  {adminPinSet ? "Set" : "Not Set"}
                </span>
              </div>
              <div className="relative">
                <input type={showAdminPin ? "text" : "password"}
                  inputMode="numeric" pattern="[0-9]*"
                  maxLength={8} value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value.replace(/\D/g, ""))}
                  className="inp pr-10" placeholder={adminPinSet ? "Enter new PIN to change" : "Set 4–8 digit PIN"} />
                <button type="button" onClick={() => setShowAdminPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }}>
                  {showAdminPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>Full access: delete, edit settings, credit limits</p>
              {adminPinSet && (
                <button onClick={() => handleClearPin("admin")} className="text-xs underline" style={{ color: "#CF291D" }}>
                  Remove admin PIN
                </button>
              )}
            </div>

            {/* Cashier PIN */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: "#1D1D1D" }}>Cashier PIN</label>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: cashierPinSet ? "#dcfce7" : "#F3F4F6", color: cashierPinSet ? "#15803d" : "#6B7280" }}>
                  {cashierPinSet ? "Set" : "Not Set"}
                </span>
              </div>
              <div className="relative">
                <input type={showCashierPin ? "text" : "password"}
                  inputMode="numeric" pattern="[0-9]*"
                  maxLength={8} value={cashierPinInput}
                  onChange={(e) => setCashierPinInput(e.target.value.replace(/\D/g, ""))}
                  className="inp pr-10" placeholder={cashierPinSet ? "Enter new PIN to change" : "Set 4–8 digit PIN"} />
                <button type="button" onClick={() => setShowCashierPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }}>
                  {showCashierPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>Limited: create invoices & collections only</p>
              {cashierPinSet && (
                <button onClick={() => handleClearPin("cashier")} className="text-xs underline" style={{ color: "#CF291D" }}>
                  Remove cashier PIN
                </button>
              )}
            </div>
          </div>

          {pinStatus && (
            <div className="text-sm px-4 py-2 rounded-xl" style={{ background: "#dcfce7", border: "1px solid #bbf7d0", color: "#15803d" }}>
              {pinStatus}
            </div>
          )}
        </div>
      </div>

      {/* Automatic Backup */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Automatic Backup</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Schedule local SQLite backups</p>
        </div>
        <div className="p-5 space-y-3">
          <ToggleRow label="Enable automatic backup on app close"
            value={settings.auto_backup_enabled === "true"}
            onChange={(v) => set("auto_backup_enabled", v ? "true" : "false")} />
          {settings.auto_backup_enabled === "true" && (
            <Field label="Backup frequency">
              <select className="inp w-48" value={settings.auto_backup_frequency ?? "daily"}
                onChange={(e) => set("auto_backup_frequency", e.target.value)}>
                <option value="daily">Daily (on app close)</option>
                <option value="weekly">Weekly</option>
                <option value="manual">Manual only</option>
              </select>
            </Field>
          )}
        </div>
      </div>

      <SaveBtn onClick={handleSavePins} label="Save PIN & Backup Settings" />

      {/* Manual Backup & Restore */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Manual Backup & Restore</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Export to any folder or USB drive; restore from a previous backup</p>
        </div>
        <div className="p-5 space-y-4">
          {/* DB status */}
          <div className="rounded-xl p-4 text-sm" style={{ background: dbExists === false ? "#FFF1F0" : "#F9FAFB", border: `1px solid ${dbExists === false ? "#fecaca" : "#E8E8E8"}` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <HardDrive size={13} style={{ color: dbExists === false ? "#CF291D" : "#9CA3AF" }} />
              <span className="text-xs font-semibold uppercase" style={{ color: "#9CA3AF" }}>Database File</span>
              {dbExists === true && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#dcfce7", color: "#15803d" }}>Found</span>}
              {dbExists === false && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fee2e2", color: "#b91c1c" }}>Not Found</span>}
            </div>
            <code className="break-all text-xs" style={{ color: "#6B7280" }}>{dbPath || "…"}</code>
            {dbExists === false && (
              <p className="text-xs mt-1.5" style={{ color: "#CF291D" }}>
                The database file is created automatically after the first data entry (agent or invoice).
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleBackup} disabled={backupLoading || dbExists === false}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-colors"
              style={{ background: "#CF291D" }}>
              <Database size={15} />
              {backupLoading ? "Choosing location…" : "Backup Now"}
            </button>

            <button onClick={handleRestore} disabled={restoreLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-colors"
              style={{ background: "#f97316" }}>
              <RotateCcw size={15} />
              {restoreLoading ? "Restoring…" : "Restore from Backup"}
            </button>

            <button onClick={loadBackupInfo}
              className="p-2.5 rounded-lg hover:bg-gray-50"
              style={{ border: "1px solid #E8E8E8", color: "#6B7280" }}>
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Status */}
          {backupStatus && (
            <div className="text-sm px-4 py-3 rounded-xl"
              style={{ background: backupStatus.ok ? "#dcfce7" : "#fee2e2", color: backupStatus.ok ? "#15803d" : "#b91c1c", border: `1px solid ${backupStatus.ok ? "#bbf7d0" : "#fecaca"}` }}>
              {backupStatus.msg}
            </div>
          )}

          {/* Backup history */}
          {backups.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E8E8E8" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8E8" }}>
                <span className="text-xs font-semibold uppercase" style={{ color: "#9CA3AF" }}>Recent Backups</span>
                <span className="text-xs" style={{ color: "#9CA3AF" }}>{backups.length} files</span>
              </div>
              {backups.slice(0, 6).map((b, i) => (
                <div key={i} className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #F9F9F9" }}>
                  <Database size={12} style={{ color: "#CF291D", flexShrink: 0 }} />
                  <code className="text-xs truncate flex-1" style={{ color: "#6B7280" }}>{b.split("/").pop()}</code>
                  <span className="text-xs shrink-0" style={{ color: "#9CA3AF" }}>{formatBackupDate(b)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 p-4 rounded-xl text-sm" style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "#f59e0b" }} />
            <span>
              <strong>Restore replaces all data.</strong> The current database is auto-backed up
              to <code className="px-1 rounded" style={{ background: "#fef3c7" }}>backups/pre_restore_*.db</code> before overwriting.
              The app will reload automatically after restore.
            </span>
          </div>
        </div>
      </div>

      {/* ── Supabase Cloud Sync ── */}
      <SupabaseConfigCard />
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────────────────────

function Field({ label, children, col2 }: { label: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={col2 ? "col-span-2" : ""}>
      <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
      <span className="text-sm" style={{ color: "#1D1D1D" }}>{label}</span>
      <button onClick={() => onChange(!value)} className="shrink-0">
        {value
          ? <ToggleRight size={26} style={{ color: "#CF291D" }} />
          : <ToggleLeft size={26} style={{ color: "#9CA3AF" }} />}
      </button>
    </div>
  );
}

// ── Supabase Config Card ──────────────────────────────────────────────────────

function SupabaseConfigCard() {
  const { withAdminToken } = useAuth();
  const [url, setUrl]       = useState("");
  const [key, setKey]       = useState("");
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [saved, setSaved]   = useState(false);

  // Load existing config from Rust
  useEffect(() => {
    invoke<{ supabase_url: string; supabase_anon_key: string }>("get_app_config")
      .then(cfg => { if (cfg.supabase_url) setUrl(cfg.supabase_url); if (cfg.supabase_anon_key) setKey(cfg.supabase_anon_key); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaved(false);
    setStatus("");
    try {
      await withAdminToken(async (token) => {
        await invoke("save_supabase_config_secure", {
          token,
          supabaseUrl: url.trim(),
          supabaseAnonymousKey: key.trim(),
        });
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setStatus(`✗ ${friendlyAuthError(err)}`);
    }
  }

  async function handleTest() {
    setTesting(true); setStatus("");
    const msg = await testSupabaseConnection();
    setStatus(msg); setTesting(false);
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #0ea5e9" }}>
        <div className="flex items-center gap-2">
          <Cloud size={16} style={{ color: "#0ea5e9" }} />
          <div>
            <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Supabase Cloud Sync</p>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Optional — keeps results synced across devices. App works fully offline without this.</p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Supabase Project URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none font-mono"
            style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }}
            onFocus={e => (e.currentTarget.style.borderColor = "#0ea5e9")}
            onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Anon Key</label>
          <input value={key} onChange={e => setKey(e.target.value)}
            placeholder="eyJhbGci..."
            type="password"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none font-mono"
            style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }}
            onFocus={e => (e.currentTarget.style.borderColor = "#0ea5e9")}
            onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")} />
        </div>
        {status && (
          <div className="text-xs px-3 py-2 rounded-lg"
            style={{ background: status.startsWith("✓") ? "#F0FFF4" : "#FFF1F0",
              border: `1px solid ${status.startsWith("✓") ? "#BBF7D0" : "#FECACA"}`,
              color:  status.startsWith("✓") ? "#16a34a" : "#CF291D" }}>
            {status}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "#0ea5e9" }}>
            <Save size={13} /> {saved ? "Saved ✓" : "Save Config"}
          </button>
          <button onClick={handleTest} disabled={testing || !url}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #E8E8E8" }}>
            <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button
            onClick={async () => {
              setStatus("Flushing sync queue…");
              try {
                await withAdminToken(async (token) => {
                  const stats = await invoke<{ flushed: number; failed: number; remaining: number }>(
                    "drain_sync_queue", { token }
                  );
                  setStatus(`✓ Synced ${stats.flushed} records. ${stats.failed} failed. ${stats.remaining} pending.`);
                });
              } catch (err) {
                setStatus(`✗ ${String(err)}`);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
          >
            ☁ Flush Sync Queue
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBtn({ onClick, label = "Save Changes" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90"
      style={{ background: "#CF291D" }}>
      <Save size={15} /> {label}
    </button>
  );
}

function formatBackupDate(path: string): string {
  const match = path.match(/backup_(\d+)\.db$/);
  if (!match) return "";
  const ts = parseInt(match[1]) * 1000;
  return new Date(ts).toLocaleString("en-LK");
}

// ── AI Configuration Tab ──────────────────────────────────────────────────────

function AIConfigTab() {
  const { withAdminToken } = useAuth();
  const [apiKey, setApiKey]     = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [status, setStatus]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);

  async function handleSave() {
    if (!apiKey.trim()) { setStatus("✗ API key cannot be empty."); return; }
    setSaving(true); setStatus("");
    try {
      await withAdminToken(async (token) => {
        await invoke("save_ai_api_key", { token, apiKey: apiKey.trim() });
      });
      setStatus("✓ AI API key saved securely.");
      setApiKey(""); // clear input after save
    } catch (e) {
      setStatus(`✗ ${friendlyAuthError(e)}`);
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setStatus("Testing Gemini connection…");
    try {
      const resp = await invoke<string>("ai_query", {
        prompt: "Reply with exactly one line: 'Ajith Rohana Gemini AI Connected ✓'"
      });
      setStatus(`✓ Gemini connected! Model responded: ${resp.slice(0, 100)}`);
    } catch (e) {
      setStatus(`✗ ${String(e)}`);
    } finally { setTesting(false); }
  }

  const isSuccess = status.startsWith("✓");
  const isError   = status.startsWith("✗");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5 flex items-center gap-2"
          style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #4f46e5" }}>
          <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>🧠 AI Configuration</span>
        </div>
        <div className="p-5 space-y-4">
          {/* Free tier badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid #bbf7d0", color: "#15803d" }}>
            <span>🎁</span>
            <span><strong>Free Tier Available!</strong> Google AI Studio offers hundreds of free requests/day with Gemini Flash — no billing required.</span>
          </div>

          <p className="text-sm" style={{ color: "#6B7280" }}>
            Enter your <strong>Google Gemini API key</strong> to enable the AI Business Consultant.
            The key is stored in your local database and routed through Rust — never exposed to the browser.
          </p>

          {/* API Key links */}
          <div className="flex items-center gap-3 p-3 rounded-xl text-xs"
            style={{ background: "#F0F4FF", border: "1px solid #C7D2FE" }}>
            <span style={{ color: "#4f46e5" }}>ℹ</span>
            <span style={{ color: "#3730a3" }}>
              Get your free API key from{" "}
              <strong>aistudio.google.com</strong> → Get API Key → Create API Key in new project.
              Uses <strong>Gemini 3.6 Flash</strong> — fast, free tier, massive context window.
            </span>
          </div>

          {/* Key input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
              Google Gemini API Key
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="AIzaSy…"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "#4f46e5")}
                  onBlur={e => (e.currentTarget.style.borderColor = "#E8E8E8")}
                />
                <button onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "#9CA3AF" }}>
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div className="rounded-xl px-4 py-2 text-xs font-medium"
              style={{
                background: isSuccess ? "#F0FFF4" : isError ? "#FEF2F2" : "#EFF6FF",
                border: `1px solid ${isSuccess ? "#BBF7D0" : isError ? "#FECACA" : "#BFDBFE"}`,
                color: isSuccess ? "#16a34a" : isError ? "#CF291D" : "#1e40af",
              }}>
              {status}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !apiKey.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              {saving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}
              {saving ? "Saving…" : "Save API Key"}
            </button>
            <button onClick={handleTest} disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
              {testing ? <RefreshCw size={13} className="animate-spin"/> : <span>🧪</span>}
              {testing ? "Testing…" : "Test Connection"}
            </button>
          </div>

          {/* Usage guidance */}
          <div className="pt-2" style={{ borderTop: "1px solid #F3F4F6" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#9CA3AF" }}>FEATURES ENABLED WHEN CONFIGURED:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                "📊 Executive business summary",
                "🚨 Critical agent follow-up alerts",
                "📦 Inventory reorder planning",
                "💰 Profit optimization recommendations",
                "👥 Payroll vs revenue analysis",
                "🌐 Tri-lingual (English / සිංහල / தமிழ்)",
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs" style={{ color: "#6B7280" }}>
                  <CheckCircle size={11} style={{ color: "#4f46e5", flexShrink: 0 }}/> {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Demo Data Tab ─────────────────────────────────────────────────────────────

function DemoDataTab() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSeed() {
    if (!confirm("Load demo data? This adds 5 agents, 13 invoices, 8 inventory batches, 7 payments, 6 returns, 14 collections, 3 purchases and 8 live results.\n\nSkips automatically if agents already exist.")) return;
    setLoading(true);
    setStatus("Seeding demo data…");
    try {
      const result = await seedDemoData();
      if (result.skipped) {
        setStatus("ℹ Demo data skipped — agents already exist. Clear first if you want to re-seed.");
      } else {
        setStatus(
          `✓ Demo data loaded successfully!\n` +
          `• ${result.agents} agents\n` +
          `• ${result.invoices} invoices\n` +
          `• ${result.inventory} inventory batches\n` +
          `• ${result.payments} payments\n` +
          `• ${result.returns} returns\n` +
          `• ${result.collections} daily collections\n` +
          `• ${result.purchases} purchase invoices\n` +
          `• ${result.results} live results\n\n` +
          `Navigate to any page to see the data.`
        );
      }
    } catch (e) {
      setStatus(`✗ Error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm("⚠ This will DELETE ALL data in the database (agents, invoices, inventory, payments, returns, collections, purchases, results). This cannot be undone. Continue?")) return;
    setLoading(true);
    setStatus("Clearing all data…");
    try {
      await clearDemoData();
      setStatus("✓ All data cleared. You can now re-seed demo data or enter real data.");
    } catch (e) {
      setStatus(`✗ Error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const isSuccess = status.startsWith("✓");
  const isError   = status.startsWith("✗");

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
        <div className="px-5 py-3.5 flex items-center gap-2"
          style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #7c3aed" }}>
          <FlaskConical size={15} style={{ color: "#7c3aed" }}/>
          <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Demo Data</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm" style={{ color: "#6B7280" }}>
            Populate the database with realistic Sri Lankan lottery distribution data to preview all pages.
            Safe to run on an empty database. Skip-safe — will not duplicate data if agents already exist.
          </p>

          {/* What's included */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "👥", label: "5 agents",              sub: "Suresh, Nimal, Chaminda, Kumari, Prasad" },
              { icon: "📋", label: "13 invoices",           sub: "Mix of settled, partial, outstanding" },
              { icon: "📦", label: "8 inventory batches",   sub: "NLB + DLB with ERP fields" },
              { icon: "💰", label: "7 payments",            sub: "Cash, cheque, NLB winning types" },
              { icon: "↩",  label: "6 ticket returns",      sub: "Unsold, damaged, expired, exchange" },
              { icon: "📝", label: "14 collections",        sub: "5 routes, 3 days, with cheque details" },
              { icon: "🛒", label: "3 purchases",           sub: "Nimalsiri invoices with payments" },
              { icon: "🎯", label: "8 live results",        sub: "NLB & DLB draw results" },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{ background: "#F9F9F9", border: "1px solid #F0F0F0" }}>
                <span className="text-base shrink-0">{item.icon}</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: "#1D1D1D" }}>{item.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Status message */}
          {status && (
            <div className="rounded-xl px-4 py-3 whitespace-pre-line text-xs font-medium"
              style={{
                background: isSuccess ? "#F0FFF4" : isError ? "#FEF2F2" : "#EFF6FF",
                border: `1px solid ${isSuccess ? "#BBF7D0" : isError ? "#FECACA" : "#BFDBFE"}`,
                color: isSuccess ? "#16a34a" : isError ? "#CF291D" : "#1e40af",
              }}>
              {status}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSeed} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}>
              {loading ? <RefreshCw size={14} className="animate-spin"/> : <FlaskConical size={14}/>}
              {loading ? "Loading…" : "Load Demo Data"}
            </button>
            <button onClick={handleClear} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "#FFFFFF", border: "1px solid #FECACA", color: "#CF291D" }}>
              <Trash2 size={14}/> Clear All Data
            </button>
          </div>

          <p className="text-[10px]" style={{ color: "#BFBFBF" }}>
            ⚠ "Clear All Data" permanently deletes all records including real business data. Use only on a test database.
          </p>
        </div>
      </div>
    </div>
  );
}

