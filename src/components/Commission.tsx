import { useEffect, useState } from "react";
import {
  AddCircle, Trash, CloseCircle, Save2, Refresh2, PercentageCircle,
  Home2, ArrowRight2, Edit2,
} from "iconsax-react";
import { getAgents, getCommissionSchemes, saveCommissionScheme, deleteCommissionScheme, getCommissionReport } from "../services/database";
import type { Agent, CommissionScheme, CommissionEntry, CommissionType } from "../types";
import { useLanguage } from "../i18n";

const TYPES: { value: CommissionType; label: string; desc: string }[] = [
  { value: "percentage", label: "% of Invoice", desc: "e.g. 5% of invoice total" },
  { value: "per_ticket", label: "Per Ticket (Rs.)", desc: "e.g. Rs. 1.50 per ticket" },
  { value: "fixed", label: "Fixed Per Invoice", desc: "e.g. Rs. 500 per invoice" },
];

const EMPTY_SCHEME = (): CommissionScheme => ({
  agent_id: null,
  scheme_name: "",
  commission_type: "percentage",
  rate: 5,
  effective_from: new Date().toISOString().split("T")[0],
  is_active: 1,
  notes: "",
});

export default function Commission() {
  const { t, lang } = useLanguage();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [schemes, setSchemes] = useState<CommissionScheme[]>([]);
  const [report, setReport] = useState<CommissionEntry[]>([]);
  const [form, setForm] = useState<CommissionScheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"schemes" | "report">("schemes");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [a, s, r] = await Promise.all([getAgents(), getCommissionSchemes(), getCommissionReport()]);
      setAgents(a); setSchemes(s); setReport(r);
    } catch (e) { console.error("Commission load error:", e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form) return;
    if (!form.scheme_name.trim()) { alert("Scheme name required."); return; }
    await saveCommissionScheme(form);
    setForm(null); load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this scheme?")) return;
    await deleteCommissionScheme(id); load();
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const totalCommission = report.reduce((s, r) => s + r.commission_amount, 0);

  const inputStyle = (field: string) => ({
    border: `1px solid ${focusedField === field ? "#4285F4" : "#E0E3E7"}`,
    background: "#F8F9FA",
  });

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100%" }}>
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9AA0A6" }}>
          <Home2 size={12} variant="Linear" color="currentColor" />
          <ArrowRight2 size={11} variant="Linear" color="currentColor" />
          <span className={`font-semibold ${lang === "si" ? "si" : ""}`} style={{ color: "#202124" }}>{t("nav_commission")}</span>
        </nav>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
            style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", color: "#202124" }}>
            <Refresh2 size={13} variant="Linear" color="currentColor" className={loading ? "animate-spin" : ""} />
            <span className={lang === "si" ? "si" : ""}>{t("action_refresh")}</span>
          </button>
          <button onClick={() => setForm(EMPTY_SCHEME())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
            style={{ background: "#4285F4" }}>
            <AddCircle size={15} variant="Linear" color="currentColor" />
            <span className={lang === "si" ? "si" : ""}>{t("action_add")}</span>
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#202124" }}>Commission & Scheme Management</h1>
          <p className="text-xs mt-0.5" style={{ color: "#9AA0A6" }}>Track earnings per invoice</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #7c3aed" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Active Schemes</p>
            <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>{schemes.filter((s) => s.is_active).length}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>of {schemes.length} total</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #34A853" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Total Commission</p>
            <p className="text-2xl font-black" style={{ color: "#34A853" }}>Rs. {fmt(totalCommission)}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>commission due</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #4285F4" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Invoices Covered</p>
            <p className="text-2xl font-black" style={{ color: "#4285F4" }}>{report.filter((r) => r.commission_amount > 0).length}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>invoices with commission</p>
          </div>
        </div>

        {/* Form */}
        {form && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F1F3F4", borderLeft: "3px solid #4285F4" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "#202124" }}>{form.id ? "Edit Scheme" : "New Commission Scheme"}</h2>
                <button onClick={() => setForm(null)} className="p-1 rounded" style={{ color: "#9AA0A6" }}>
                  <CloseCircle size={15} variant="Linear" color="currentColor" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Scheme Name *</label>
                  <input type="text" value={form.scheme_name}
                    onChange={(e) => setForm({ ...form, scheme_name: e.target.value })}
                    placeholder="Standard 5%…" autoFocus
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("name")} onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Apply To (blank = all agents)</label>
                  <select value={form.agent_id ?? ""}
                    onChange={(e) => setForm({ ...form, agent_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("agent")} onFocus={() => setFocusedField("agent")} onBlur={() => setFocusedField(null)}>
                    <option value="">— All Agents (Default) —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Commission Type</label>
                  <select value={form.commission_type}
                    onChange={(e) => setForm({ ...form, commission_type: e.target.value as CommissionType })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("type")} onFocus={() => setFocusedField("type")} onBlur={() => setFocusedField(null)}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>
                    Rate {form.commission_type === "percentage" ? "(%)" : form.commission_type === "per_ticket" ? "(Rs./ticket)" : "(Rs./invoice)"}
                  </label>
                  <input type="number" step="0.01" value={form.rate || ""} placeholder="0"
                    onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("rate")} onFocus={(e) => { e.target.select(); setFocusedField("rate"); }} onBlur={() => setFocusedField(null)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Effective From</label>
                  <input type="date" value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("from")} onFocus={() => setFocusedField("from")} onBlur={() => setFocusedField(null)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Effective To (optional)</label>
                  <input type="date" value={form.effective_to ?? ""}
                    onChange={(e) => setForm({ ...form, effective_to: e.target.value || undefined })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("to")} onFocus={() => setFocusedField("to")} onBlur={() => setFocusedField(null)} />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input type="checkbox" id="active" checked={form.is_active === 1}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4" style={{ accentColor: "#4285F4" }} />
                  <label htmlFor="active" className="text-sm cursor-pointer" style={{ color: "#202124" }}>
                    <span className={lang === "si" ? "si" : ""}>{t("status_active")}</span>
                  </label>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>
                    <span className={lang === "si" ? "si" : ""}>{t("field_notes")}</span>
                  </label>
                  <input type="text" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional…" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("notes")} onFocus={() => setFocusedField("notes")} onBlur={() => setFocusedField(null)} />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                  style={{ background: "#4285F4" }}>
                  <Save2 size={14} variant="Linear" color="currentColor" />
                  <span className={lang === "si" ? "si" : ""}>{t("action_save")}</span>
                </button>
                <button onClick={() => setForm(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", color: "#202124" }}>
                  <span className={lang === "si" ? "si" : ""}>{t("action_cancel")}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab pills */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#F1F3F4" }}>
          {(["schemes", "report"] as const).map((tab) => {
            const active = activeTab === tab;
            const label = tab === "schemes" ? `Commission Schemes (${schemes.length})` : "Commission Report";
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: active ? "#FFFFFF" : "transparent",
                  color: active ? "#202124" : "#9AA0A6",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Schemes table */}
        {activeTab === "schemes" && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>
            <div className="px-5 py-3" style={{ background: "#374151", borderBottom: "2px solid #4285F4" }}>
              <span className="text-sm font-semibold text-white">Commission Schemes</span>
            </div>
            {loading ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9AA0A6" }}>{t("loading")}</div>
            ) : schemes.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9AA0A6" }}>No schemes. Add one above.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F1F3F4" }}>
                      {["Scheme","Agent","Type","Rate","Effective","Status",""].map((h, i) => (
                        <th key={i} className={`px-4 py-3 ${i >= 3 ? "text-right" : "text-left"} ${i === 5 ? "text-center" : ""} ${i === 6 ? "w-12" : ""}`}
                          style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schemes.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/60 transition-colors"
                        style={{ borderBottom: "1px solid #F1F3F4", opacity: s.is_active ? 1 : 0.5 }}>
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#202124" }}>{s.scheme_name}</td>
                        <td className="px-4 py-3">
                          {s.agent_id
                            ? <span className="text-sm" style={{ color: "#202124" }}>{s.agent_name}</span>
                            : <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ background: "#4285F4" }}>All Agents</span>}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#5F6368" }}>{TYPES.find((t) => t.value === s.commission_type)?.label}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#7c3aed" }}>
                          {s.commission_type === "percentage" ? `${s.rate}%` : `Rs. ${s.rate}`}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#5F6368" }}>
                          {fmtDate(s.effective_from)}{s.effective_to ? ` → ${fmtDate(s.effective_to)}` : " →"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                            style={s.is_active ? { background: "#E6F4EA", color: "#34A853" } : { background: "#F1F3F4", color: "#5F6368" }}>
                            <span className={lang === "si" ? "si" : ""}>{s.is_active ? t("status_active") : t("status_inactive")}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1.5">
                            <button onClick={() => setForm({ ...s })} className="p-1.5 rounded-lg" title="Edit scheme"
                              style={{ background: "#EAF1FB", color: "#4285F4" }}>
                              <Edit2 size={12} variant="Linear" color="currentColor" />
                            </button>
                            <button onClick={() => handleDelete(s.id!)} className="p-1.5 rounded-lg" title="Delete scheme"
                              style={{ background: "#FCE8E6", color: "#EA4335" }}>
                              <Trash size={12} variant="Linear" color="currentColor" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Commission report table */}
        {activeTab === "report" && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>
            <div className="px-5 py-3" style={{ background: "#374151", borderBottom: "2px solid #4285F4" }}>
              <span className="text-sm font-semibold text-white">Commission Report</span>
            </div>
            {loading ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9AA0A6" }}>{t("loading")}</div>
            ) : report.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9AA0A6" }}>No invoices to report.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F1F3F4" }}>
                      {["Invoice #","Agent","Date","Invoice Total","Tickets","Type","Rate","Commission (Rs.)"].map((h, i) => (
                        <th key={i} className={`px-4 py-3 ${i >= 3 ? "text-right" : "text-left"}`}
                          style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r) => (
                      <tr key={r.invoice_id} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F1F3F4" }}>
                        <td className="px-4 py-3 text-sm font-mono font-medium" style={{ color: "#4285F4" }}>#{r.invoice_number}</td>
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#202124" }}>{r.agent_name}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#5F6368" }}>{fmtDate(r.invoice_date)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#202124" }}>{fmt(r.invoice_total)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#5F6368" }}>{r.total_tickets.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {r.commission_rate > 0 ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#7c3aed" }}>
                              <PercentageCircle size={10} variant="Linear" color="currentColor" />
                              {TYPES.find((t) => t.value === r.commission_type)?.label}
                            </span>
                          ) : <span className="text-xs" style={{ color: "#9AA0A6" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#5F6368" }}>
                          {r.commission_rate > 0 ? (r.commission_type === "percentage" ? `${r.commission_rate}%` : `Rs. ${r.commission_rate}`) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: r.commission_amount > 0 ? "#34A853" : "#9AA0A6" }}>
                          {r.commission_amount > 0 ? fmt(r.commission_amount) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#374151", borderTop: "2px solid #4285F4" }}>
                      <td colSpan={7} className="px-4 py-3 text-right text-xs font-bold uppercase" style={{ color: "#9AA0A6" }}>Total Commission</td>
                      <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#34A853" }}>Rs. {fmt(totalCommission)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
