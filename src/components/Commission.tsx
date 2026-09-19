import { useEffect, useState } from "react";
import { Plus, Trash2, X, Save, RefreshCw, Percent, Home, ChevronRight, Pencil } from "lucide-react";
import { getAgents, getCommissionSchemes, saveCommissionScheme, deleteCommissionScheme, getCommissionReport } from "../services/database";
import type { Agent, CommissionScheme, CommissionEntry, CommissionType } from "../types";

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
      setAgents(a);
      setSchemes(s);
      setReport(r);
    } catch (e) {
      console.error("Commission load error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form) return;
    if (!form.scheme_name.trim()) { alert("Scheme name required."); return; }
    await saveCommissionScheme(form);
    setForm(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this scheme?")) return;
    await deleteCommissionScheme(id);
    load();
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const totalCommission = report.reduce((s, r) => s + r.commission_amount, 0);

  const inputStyle = (field: string) => ({
    border: `1px solid ${focusedField === field ? "#CF291D" : "#E8E8E8"}`,
    background: "#FAFAFA",
  });

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Commission</span>
        </nav>
        <div className="flex gap-2">
          <button
            onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={() => setForm(EMPTY_SCHEME())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
            style={{ background: "#CF291D" }}
          >
            <Plus size={15} /> Add Scheme
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Commission & Scheme Management</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Track earnings per invoice</p>
          </div>
        </div>

        {/* Summary metric cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #7c3aed" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Active Schemes</p>
            <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>{schemes.filter((s) => s.is_active).length}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>of {schemes.length} total</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #16a34a" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Total Commission</p>
            <p className="text-2xl font-black" style={{ color: "#16a34a" }}>Rs. {fmt(totalCommission)}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>commission due</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #2563eb" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Invoices Covered</p>
            <p className="text-2xl font-black" style={{ color: "#2563eb" }}>{report.filter((r) => r.commission_amount > 0).length}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>invoices with commission</p>
          </div>
        </div>

        {/* Add/edit scheme form */}
        {form && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "#1D1D1D" }}>{form.id ? "Edit Scheme" : "New Commission Scheme"}</h2>
                <button onClick={() => setForm(null)} className="p-1 rounded" style={{ color: "#9CA3AF" }}>
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Scheme Name *</label>
                  <input
                    type="text"
                    value={form.scheme_name}
                    onChange={(e) => setForm({ ...form, scheme_name: e.target.value })}
                    placeholder="Standard 5%…"
                    autoFocus
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("name")}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Apply To (blank = all agents)</label>
                  <select
                    value={form.agent_id ?? ""}
                    onChange={(e) => setForm({ ...form, agent_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("agent")}
                    onFocus={() => setFocusedField("agent")}
                    onBlur={() => setFocusedField(null)}
                  >
                    <option value="">— All Agents (Default) —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Commission Type</label>
                  <select
                    value={form.commission_type}
                    onChange={(e) => setForm({ ...form, commission_type: e.target.value as CommissionType })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("type")}
                    onFocus={() => setFocusedField("type")}
                    onBlur={() => setFocusedField(null)}
                  >
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Rate {form.commission_type === "percentage" ? "(%)" : form.commission_type === "per_ticket" ? "(Rs. / ticket)" : "(Rs. / invoice)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.rate || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("rate")}
                    onFocus={(e) => { e.target.select(); setFocusedField("rate"); }}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Effective From</label>
                  <input
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("from")}
                    onFocus={() => setFocusedField("from")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Effective To (optional)</label>
                  <input
                    type="date"
                    value={form.effective_to ?? ""}
                    onChange={(e) => setForm({ ...form, effective_to: e.target.value || undefined })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("to")}
                    onFocus={() => setFocusedField("to")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="active"
                    checked={form.is_active === 1}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 accent-red-600"
                  />
                  <label htmlFor="active" className="text-sm cursor-pointer" style={{ color: "#1D1D1D" }}>Active</label>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional…"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("notes")}
                    onFocus={() => setFocusedField("notes")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                  style={{ background: "#CF291D" }}
                >
                  <Save size={14} /> Save Scheme
                </button>
                <button
                  onClick={() => setForm(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab pills */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#F3F4F6" }}>
          {(["schemes", "report"] as const).map((t) => {
            const active = activeTab === t;
            const label = t === "schemes" ? `Commission Schemes (${schemes.length})` : "Commission Report";
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: active ? "#FFFFFF" : "transparent",
                  color: active ? "#1D1D1D" : "#9CA3AF",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Schemes table */}
        {activeTab === "schemes" && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-5 py-3" style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
              <span className="text-sm font-semibold text-white">Commission Schemes</span>
            </div>
            {loading ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
            ) : schemes.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>No schemes. Add one above.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F9F9F9" }}>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Scheme</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Type</th>
                      <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Rate</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Effective</th>
                      <th className="px-4 py-3 text-center" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemes.map((s) => (
                      <tr
                        key={s.id}
                        className="hover:bg-gray-50/60 transition-colors"
                        style={{ borderBottom: "1px solid #F9F9F9", opacity: s.is_active ? 1 : 0.5 }}
                      >
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1D1D1D" }}>{s.scheme_name}</td>
                        <td className="px-4 py-3">
                          {s.agent_id
                            ? <span className="text-sm" style={{ color: "#1D1D1D" }}>{s.agent_name}</span>
                            : <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ background: "#2563eb" }}>All Agents</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{TYPES.find((t) => t.value === s.commission_type)?.label}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#7c3aed" }}>
                          {s.commission_type === "percentage" ? `${s.rate}%` : `Rs. ${s.rate}`}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {fmtDate(s.effective_from)}{s.effective_to ? ` → ${fmtDate(s.effective_to)}` : " →"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                            style={s.is_active
                              ? { background: "#DCFCE7", color: "#16a34a" }
                              : { background: "#F3F4F6", color: "#6B7280" }
                            }
                          >
                            {s.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setForm({ ...s })}
                              className="p-1.5 rounded-lg"
                              title="Edit scheme"
                              style={{ background: "#EFF6FF", color: "#2563EB" }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(s.id!)}
                              className="p-1.5 rounded-lg"
                              title="Delete scheme"
                              style={{ background: "#FFF1F0", color: "#CF291D" }}
                            >
                              <Trash2 size={12} />
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
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-5 py-3" style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
              <span className="text-sm font-semibold text-white">Commission Report</span>
            </div>
            {loading ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
            ) : report.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>No invoices to report.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F9F9F9" }}>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice #</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</th>
                      <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice Total</th>
                      <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Tickets</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Type</th>
                      <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Rate</th>
                      <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Commission (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r) => (
                      <tr key={r.invoice_id} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-4 py-3 text-sm font-mono font-medium" style={{ color: "#2563eb" }}>#{r.invoice_number}</td>
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1D1D1D" }}>{r.agent_name}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{fmtDate(r.invoice_date)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>{fmt(r.invoice_total)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>{r.total_tickets.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {r.commission_rate > 0 ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#7c3aed" }}>
                              <Percent size={10} />
                              {TYPES.find((t) => t.value === r.commission_type)?.label}
                            </span>
                          ) : <span className="text-xs" style={{ color: "#9CA3AF" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>
                          {r.commission_rate > 0 ? (r.commission_type === "percentage" ? `${r.commission_rate}%` : `Rs. ${r.commission_rate}`) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: r.commission_amount > 0 ? "#16a34a" : "#9CA3AF" }}>
                          {r.commission_amount > 0 ? fmt(r.commission_amount) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                      <td colSpan={7} className="px-4 py-3 text-right text-xs font-bold uppercase" style={{ color: "#9CA3AF" }}>Total Commission</td>
                      <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#16a34a" }}>Rs. {fmt(totalCommission)}</td>
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
