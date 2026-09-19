import { useEffect, useState } from "react";
import { Plus, Printer, Trash2, X, Save, Home, ChevronRight } from "lucide-react";
import { getAgents, getDailyCollections, saveDailyCollection, deleteDailyCollection, getCollectionDates } from "../services/database";
import type { Agent, DailyCollection } from "../types";

const EMPTY = (date: string): DailyCollection => ({
  collection_date: date,
  collector_name: "",
  agent_id: 0,
  cash_amount: 0,
  cheque_amount: 0,
  nlb_winning: 0,
  dlb_winning: 0,
  route: "",
  notes: "",
  cheque_number: "",
  bank_name: "",
  clearance_date: "",
});

export default function DailyCollectionView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [dates, setDates] = useState<{ date: string; total: number; count: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [collections, setCollections] = useState<DailyCollection[]>([]);
  const [form, setForm] = useState<DailyCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAgents(), getCollectionDates()]).then(([a, d]) => {
      setAgents(a);
      setDates(d);
    });
  }, []);

  useEffect(() => { loadDate(selectedDate); }, [selectedDate]);

  async function loadDate(date: string) {
    setLoading(true);
    setCollections(await getDailyCollections(date));
    setLoading(false);
  }

  async function handleSave() {
    if (!form) return;
    if (!form.agent_id) { alert("Select an agent."); return; }
    await saveDailyCollection(form);
    setForm(null);
    loadDate(selectedDate);
    const d = await getCollectionDates();
    setDates(d);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this entry?")) return;
    await deleteDailyCollection(id);
    loadDate(selectedDate);
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const totalCash = collections.reduce((s, c) => s + c.cash_amount, 0);
  const totalCheque = collections.reduce((s, c) => s + c.cheque_amount, 0);
  const totalNlb = collections.reduce((s, c) => s + c.nlb_winning, 0);
  const totalDlb = collections.reduce((s, c) => s + c.dlb_winning, 0);
  const grandTotal = totalCash + totalCheque + totalNlb + totalDlb;

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-LK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const inputStyle = (field: string) => ({
    border: `1px solid ${focusedField === field ? "#CF291D" : "#E8E8E8"}`,
    background: "#FAFAFA",
  });

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 no-print">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Daily Collections</span>
        </nav>
        <div className="flex gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: "1px solid #E8E8E8", background: "#FFFFFF" }}
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all no-print"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
          >
            <Printer size={14} /> Print Sheet
          </button>
          <button
            onClick={() => setForm(EMPTY(selectedDate))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all no-print"
            style={{ background: "#CF291D" }}
          >
            <Plus size={15} /> Add Entry
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Daily Collections</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Cash collected by route and field collectors</p>
            <p className="text-xs mt-1 font-medium" style={{ color: "#D97706" }}>
              ⚠ Collection entries here are an operational log only. To update an agent's outstanding balance, record a payment in the Payment Ledger.
            </p>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block text-center mb-4">
          <div className="text-xl font-bold">Ajith Rohana Enterprise</div>
          <div className="text-sm font-medium">DAILY COLLECTION SHEET</div>
          <div className="text-sm">{dateLabel}</div>
        </div>

        {/* Date quick tabs */}
        {dates.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-print">
            {dates.slice(0, 7).map((d) => {
              const isSelected = d.date === selectedDate;
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d.date)}
                  className="flex-shrink-0 px-3 py-2 rounded-lg text-xs text-left transition-all"
                  style={{
                    background: isSelected ? "#CF291D" : "#FFFFFF",
                    border: `1px solid ${isSelected ? "#CF291D" : "#E8E8E8"}`,
                    color: isSelected ? "#FFFFFF" : "#1D1D1D",
                  }}
                >
                  <div className="font-semibold">{fmtDate(d.date)}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.75)" : "#9CA3AF" }}>
                    Rs. {fmt(d.total)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Summary metric cards */}
        <div className="grid grid-cols-5 gap-4 no-print">
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #16a34a" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Total Cash</p>
            <p className="text-2xl font-black" style={{ color: "#16a34a" }}>Rs. {fmt(totalCash)}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>cash collections</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #2563eb" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Total Cheque</p>
            <p className="text-2xl font-black" style={{ color: "#2563eb" }}>Rs. {fmt(totalCheque)}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>cheque receipts</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #7c3aed" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>NLB Winnings</p>
            <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>Rs. {fmt(totalNlb)}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>NLB winning tickets</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #EA580C" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>DLB Winnings</p>
            <p className="text-2xl font-black" style={{ color: "#EA580C" }}>Rs. {fmt(totalDlb)}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>DLB winning tickets</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #CF291D" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Grand Total</p>
            <p className="text-2xl font-black" style={{ color: "#CF291D" }}>Rs. {fmt(grandTotal)}</p>
            <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>{collections.length} entr{collections.length !== 1 ? "ies" : "y"}</p>
          </div>
        </div>

        {/* Add form */}
        {form && (
          <div className="rounded-2xl overflow-hidden shadow-sm no-print" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "#1D1D1D" }}>New Collection Entry — {dateLabel}</h2>
                <button onClick={() => setForm(null)} className="p-1 rounded" style={{ color: "#9CA3AF" }}>
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Agent *</label>
                  <select
                    value={form.agent_id || ""}
                    onChange={(e) => setForm({ ...form, agent_id: Number(e.target.value) })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("agent")}
                    onFocus={() => setFocusedField("agent")}
                    onBlur={() => setFocusedField(null)}
                  >
                    <option value="">— Select —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Collector Name</label>
                  <input
                    type="text"
                    value={form.collector_name}
                    onChange={(e) => setForm({ ...form, collector_name: e.target.value })}
                    placeholder="Sameera / Nimal…"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("collector")}
                    onFocus={() => setFocusedField("collector")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Route / Area</label>
                  <input
                    type="text"
                    value={form.route}
                    onChange={(e) => setForm({ ...form, route: e.target.value })}
                    placeholder="Colombo 11…"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("route")}
                    onFocus={() => setFocusedField("route")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Cash (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cash_amount || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, cash_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("cash")}
                    onFocus={(e) => { e.target.select(); setFocusedField("cash"); }}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Cheque (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cheque_amount || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, cheque_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("cheque")}
                    onFocus={(e) => { e.target.select(); setFocusedField("cheque"); }}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>NLB Winning Tickets (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.nlb_winning || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, nlb_winning: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("nlb")}
                    onFocus={(e) => { e.target.select(); setFocusedField("nlb"); }}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>DLB Winning Tickets (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.dlb_winning || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, dlb_winning: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("dlb")}
                    onFocus={(e) => { e.target.select(); setFocusedField("dlb"); }}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                {/* Cheque details — shown when cheque_amount > 0 */}
                {(form.cheque_amount ?? 0) > 0 && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#2563eb" }}>Cheque No.</label>
                      <input type="text" value={form.cheque_number ?? ""}
                        onChange={e => setForm({ ...form, cheque_number: e.target.value })}
                        placeholder="e.g. CHQ-12345"
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={inputStyle("chqno")}
                        onFocus={() => setFocusedField("chqno")} onBlur={() => setFocusedField(null)}/>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#2563eb" }}>Bank</label>
                      <select value={form.bank_name ?? ""}
                        onChange={e => setForm({ ...form, bank_name: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={inputStyle("bank")}
                        onFocus={() => setFocusedField("bank")} onBlur={() => setFocusedField(null)}>
                        <option value="">— Select Bank —</option>
                        {["Bank of Ceylon","People's Bank","Commercial Bank","Hatton National Bank",
                          "Sampath Bank","Seylan Bank","Nations Trust Bank","NDB Bank",
                          "DFCC Bank","Pan Asia Banking Corporation","Cargills Bank"].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#2563eb" }}>Clearance Date</label>
                      <input type="date" value={form.clearance_date ?? ""}
                        onChange={e => setForm({ ...form, clearance_date: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={inputStyle("clrd")}
                        onFocus={() => setFocusedField("clrd")} onBlur={() => setFocusedField(null)}/>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Notes</label>
                  <input type="text" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional…"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle("notes")}
                    onFocus={() => setFocusedField("notes")} onBlur={() => setFocusedField(null)}/>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                  style={{ background: "#CF291D" }}
                >
                  <Save size={14} /> Save Entry
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

        {/* Collection table */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <div className="px-5 py-3 no-print" style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{dateLabel}</span>
              <span className="text-xs" style={{ color: "#9CA3AF" }}>{collections.length} entr{collections.length !== 1 ? "ies" : "y"}</span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>No entries for this date. Click "+ Add Entry" to start.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F9F9F9" }}>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>#</th>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Collector</th>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Route</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cash</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cheque</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>NLB Win.</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>DLB Win.</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total</th>
                    <th className="px-4 py-3 w-12 no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((c, i) => {
                    const rowTotal = c.cash_amount + c.cheque_amount + c.nlb_winning + c.dlb_winning;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/60 transition-colors" style={{ borderBottom: "1px solid #F9F9F9" }}>
                        <td className="px-4 py-3 text-sm" style={{ color: "#9CA3AF" }}>{i + 1}</td>
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1D1D1D" }}>{c.agent_name}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{c.collector_name || "—"}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{c.route || "—"}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#16a34a" }}>{fmt(c.cash_amount)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#2563eb" }}>{fmt(c.cheque_amount)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#7c3aed" }}>{fmt(c.nlb_winning)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#ea580c" }}>{fmt(c.dlb_winning)}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#1D1D1D" }}>{fmt(rowTotal)}</td>
                        <td className="px-3 py-3 no-print">
                          <button
                            onClick={() => handleDelete(c.id!)}
                            className="p-1.5 rounded-lg"
                            style={{ background: "#FFF1F0", color: "#CF291D" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold uppercase" style={{ color: "#9CA3AF" }}>TOTALS</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalCash)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalCheque)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalNlb)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalDlb)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#CF291D" }}>Rs. {fmt(grandTotal)}</td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Print signature row */}
        <div className="hidden print:flex justify-between mt-10 text-sm">
          <div>Prepared By: <span style={{ display: "inline-block", width: "120px", borderBottom: "1px solid #333" }}></span></div>
          <div>Verified By: <span style={{ display: "inline-block", width: "120px", borderBottom: "1px solid #333" }}></span></div>
          <div>Date: {fmtDate(selectedDate)}</div>
        </div>
      </div>

      <style>{`@media print{.no-print{display:none!important}}`}</style>
    </div>
  );
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
