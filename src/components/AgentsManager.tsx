import { useEffect, useRef, useState } from "react";
import {
  Plus, Trash2, X, Save, RefreshCw, Users, Home,
  ChevronRight, Camera, User, Pencil,
} from "lucide-react";
import { getAgents, saveAgent, deleteAgent } from "../services/database";
import { usePinGuardContext } from "../App";
import type { Agent } from "../types";

const SL_BANKS = [
  "Amana Bank PLC",
  "Axis Bank Ltd",
  "Bank of Ceylon",
  "Bank of China Limited",
  "Cargills Bank PLC",
  "Citibank, N.A.",
  "Commercial Bank of Ceylon PLC",
  "Deutsche Bank AG",
  "DFCC Bank PLC",
  "Habib Bank Ltd",
  "Hatton National Bank PLC",
  "ICICI Bank Ltd",
  "Indian Bank",
  "Indian Overseas Bank",
  "MCB Bank Ltd",
  "National Development Bank PLC",
  "Nations Trust Bank PLC",
  "Pan Asia Banking Corporation PLC",
  "People's Bank",
  "Public Bank Berhad",
  "Sampath Bank PLC",
  "Seylan Bank PLC",
  "Standard Chartered Bank",
  "State Bank of India",
  "HSBC (Hongkong & Shanghai Banking Corporation)",
  "Union Bank of Colombo PLC",
];

const EMPTY_AGENT = (): Agent => ({
  name: "", nlb_reg: "", dlb_reg: "", phone: "",
  address: "", nic_number: "", bank_name: "", bank_account: "", photo: "",
});

export default function AgentsManager() {
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [form, setForm]           = useState<Agent | null>(null);
  const [loading, setLoading]     = useState(true);
  const [viewAgent, setViewAgent] = useState<Agent | null>(null);
  const { requireAdminPin }       = usePinGuardContext();
  const photoRef                  = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setAgents(await getAgents());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Photo upload ──────────────────────────────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => f ? { ...f, photo: reader.result as string } : f);
    reader.readAsDataURL(file);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form) return;
    if (!form.name.trim()) { alert("Agent name is required."); return; }
    await saveAgent(form);
    setForm(null);
    load();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id: number, name: string) {
    const ok = await requireAdminPin("Delete Agent", `Admin PIN required to delete "${name}"`);
    if (!ok) return;
    if (!confirm(`Delete agent "${name}"? Invoices will remain.`)) return;
    await deleteAgent(id);
    load();
  }

  const set = (k: keyof Agent, v: string) =>
    setForm((f) => f ? { ...f, [k]: v } : f);

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      {/* ── Toolbar: breadcrumb + Refresh + Add Agent side by side ── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} /><ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>
            Agents
          </span>
          <span className="ml-2 text-[11px] font-medium" style={{ color: "#9CA3AF" }}>
            · {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        </nav>

        {/* Side-by-side buttons */}
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#6B7280" }}
            title="Refresh">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button onClick={() => { setForm(EMPTY_AGENT()); setViewAgent(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
            style={{ background: "#CF291D" }}>
            <Plus size={14} /> Add Agent
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Agent Profiles</h1>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            Manage sub-dealer accounts, credit limits and bank details
          </p>
        </div>

        {/* ── Add / Edit form ── */}
        {form && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
              <div>
                <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>
                  {form.id ? `Edit — ${form.name}` : "New Agent"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Fill in the agent's profile details</p>
              </div>
              <button onClick={() => setForm(null)} style={{ color: "#9CA3AF" }}><X size={16} /></button>
            </div>

            <div className="p-5">
              <div className="flex gap-6">
                {/* Photo upload */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div
                    className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer relative group"
                    style={{ background: "#F3F4F6", border: "2px dashed #E8E8E8" }}
                    onClick={() => photoRef.current?.click()}>
                    {form.photo
                      ? <img src={form.photo} alt="agent" className="w-full h-full object-cover" />
                      : <User size={32} style={{ color: "#BFBFBF" }} />
                    }
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                      style={{ background: "rgba(207,41,29,0.75)" }}>
                      <Camera size={20} className="text-white" />
                    </div>
                  </div>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={handlePhotoChange} />
                  <button onClick={() => photoRef.current?.click()}
                    className="text-xs font-medium hover:underline" style={{ color: "#CF291D" }}>
                    {form.photo ? "Change Photo" : "Upload Photo"}
                  </button>
                  {form.photo && (
                    <button onClick={() => set("photo", "")}
                      className="text-xs" style={{ color: "#9CA3AF" }}>Remove</button>
                  )}
                </div>

                {/* Fields */}
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <FField label="Full Name *">
                    <FInput value={form.name} onChange={(e) => set("name", e.target.value)}
                      placeholder="e.g. Sadaruwan Perera" autoFocus />
                  </FField>
                  <FField label="Phone Number">
                    <FInput value={form.phone} onChange={(e) => set("phone", e.target.value)}
                      placeholder="077 123 4567" type="tel" />
                  </FField>
                  <FField label="NIC Number">
                    <FInput value={form.nic_number} onChange={(e) => set("nic_number", e.target.value)}
                      placeholder="200012345678 or 801234567V" />
                  </FField>
                  <FField label="Bank Name">
                    <select
                      value={form.bank_name}
                      onChange={(e) => set("bank_name", e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
                      onBlur={(e)  => (e.currentTarget.style.borderColor = "#E8E8E8")}
                    >
                      <option value="">— Select Bank —</option>
                      {SL_BANKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </FField>
                  <FField label="Account Number">
                    <FInput value={form.bank_account} onChange={(e) => set("bank_account", e.target.value)}
                      placeholder="e.g. 0012345678" />
                  </FField>
                  <FField label="Address" col2>
                    <FInput value={form.address} onChange={(e) => set("address", e.target.value)}
                      placeholder="Street, City" />
                  </FField>

                  {/* NLB / DLB optional section */}
                  <div className="col-span-2 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-3"
                      style={{ color: "#9CA3AF" }}>Board Registration (Optional)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <FField label="NLB Reg. No.">
                        <FInput value={form.nlb_reg} onChange={(e) => set("nlb_reg", e.target.value)}
                          placeholder="NLB-N011073" />
                      </FField>
                      <FField label="DLB Reg. No.">
                        <FInput value={form.dlb_reg} onChange={(e) => set("dlb_reg", e.target.value)}
                          placeholder="DLB-01/7352" />
                      </FField>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                <button onClick={handleSave}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90"
                  style={{ background: "#CF291D" }}>
                  <Save size={14} /> {form.id ? "Update Agent" : "Save Agent"}
                </button>
                <button onClick={() => setForm(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                  style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Profile detail panel ── */}
        {viewAgent && !form && (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
              <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>Agent Profile</p>
              <div className="flex gap-2">
                <button onClick={() => { setForm({ ...viewAgent }); setViewAgent(null); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => setViewAgent(null)} style={{ color: "#9CA3AF" }}><X size={16} /></button>
              </div>
            </div>
            <div className="p-5 flex gap-6">
              <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0"
                style={{ background: "#F3F4F6", border: "1px solid #E8E8E8" }}>
                {viewAgent.photo
                  ? <img src={viewAgent.photo} alt={viewAgent.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <User size={28} style={{ color: "#BFBFBF" }} />
                    </div>
                }
              </div>
              <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-3">
                <PRow label="Full Name"    value={viewAgent.name} />
                <PRow label="Phone"        value={viewAgent.phone} />
                <PRow label="NIC Number"    value={viewAgent.nic_number} />
                <PRow label="Bank"         value={viewAgent.bank_name} />
                <PRow label="Account No."  value={viewAgent.bank_account} />
                <PRow label="Address"      value={viewAgent.address} col2 />
                {(viewAgent.nlb_reg || viewAgent.dlb_reg) && (
                  <>
                    <PRow label="NLB Reg." value={viewAgent.nlb_reg} />
                    <PRow label="DLB Reg." value={viewAgent.dlb_reg} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Agents table ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div className="flex items-center justify-between px-5 py-3"
            style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
            <div className="flex items-center gap-2">
              <Users size={15} className="text-white" />
              <p className="font-bold text-sm text-white">All Agents</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
              style={{ background: "#CF291D" }}>
              {agents.length} total
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: "#F3F4F6" }}>
                <Users size={22} style={{ color: "#BFBFBF" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>No agents yet</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Click "Add Agent" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                    {["Photo","Name","Phone","NIC","Bank / Account","Reg. Numbers","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left"
                        style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => (
                    <tr key={a.id}
                      className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                      style={{ borderBottom: "1px solid #F9F9F9", background: i % 2 === 0 ? "#FFFFFF" : "#FAFAFA" }}
                      onClick={() => { setViewAgent(a); setForm(null); }}>
                      {/* Avatar */}
                      <td className="px-4 py-2.5">
                        <div className="w-10 h-10 rounded-xl overflow-hidden"
                          style={{ background: "#F3F4F6", border: "1px solid #E8E8E8" }}>
                          {a.photo
                            ? <img src={a.photo} alt={a.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center">
                                <User size={16} style={{ color: "#BFBFBF" }} />
                              </div>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: "#1D1D1D" }}>{a.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{a.phone || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{a.nic_number || "—"}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                        {a.bank_name && <div className="font-medium" style={{ color: "#374151" }}>{a.bank_name}</div>}
                        <div className="font-mono">{a.bank_account || (a.bank_name ? "—" : "—")}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1">
                          {a.nlb_reg && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                              style={{ background: "#EFF6FF", color: "#2563EB" }}>NLB: {a.nlb_reg}</span>
                          )}
                          {a.dlb_reg && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                              style={{ background: "#F5F3FF", color: "#7C3AED" }}>DLB: {a.dlb_reg}</span>
                          )}
                          {!a.nlb_reg && !a.dlb_reg && <span style={{ color: "#D1D5DB" }}>—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setForm({ ...a }); setViewAgent(null); }}
                            className="p-1.5 rounded-lg transition-all hover:opacity-80"
                            style={{ background: "#EFF6FF", color: "#2563EB" }}>
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id!, a.name)}
                            className="p-1.5 rounded-lg transition-all hover:opacity-80"
                            style={{ background: "#FFF1F0", color: "#CF291D" }}>
                            <Trash2 size={13} />
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
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FField({ label, children, col2 }: { label: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={col2 ? "col-span-2" : ""}>
      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: "#9CA3AF" }}>{label}</label>
      {children}
    </div>
  );
}

function FInput({ value, onChange, placeholder, type = "text", autoFocus = false }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={onChange}
      placeholder={placeholder} autoFocus={autoFocus}
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
      style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
      onBlur={(e)  => (e.currentTarget.style.borderColor = "#E8E8E8")}
    />
  );
}

function PRow({ label, value, col2 }: { label: string; value: string; col2?: boolean }) {
  return (
    <div className={col2 ? "col-span-2" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "#9CA3AF" }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: value ? "#1D1D1D" : "#D1D5DB" }}>
        {value || "—"}
      </p>
    </div>
  );
}
