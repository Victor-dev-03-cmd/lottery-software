import { useEffect, useState } from "react";
import { AddCircle, Printer, Trash, CloseCircle, Save2, Home2, ArrowRight2 } from "iconsax-react";

import { getAgents, getDailyCollections, saveDailyCollection, deleteDailyCollection, getCollectionDates } from "../services/database";
import type { Agent, DailyCollection } from "../types";

import { useLanguage } from "../i18n";
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
  const { t } = useLanguage();
  
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
    border: `1px solid ${focusedField === field ? "#4285F4" : "#E0E3E7"}`,
    background: "#FAFAFA",
  });

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100%" }}>
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 no-print">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9AA0A6" }}>
          <Home2 size={12} variant="Linear" color="currentColor" />
          <ArrowRight2 size={11} variant="Linear" color="currentColor" />
          <span className="font-semibold" style={{ color: "#202124" }}>{t("nav_daily_collections")}</span>
        </nav>
        <div className="flex gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: "1px solid #E0E3E7", background: "#FFFFFF" }}
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all no-print"
            style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", color: "#202124" }}
          >
            <Printer size={14} variant="Linear" color="currentColor" /> Print Sheet
          </button>
          <button
            onClick={() => setForm(EMPTY(selectedDate))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all no-print"
            style={{ background: "#4285F4" }}
          >
            <AddCircle size={15} variant="Linear" color="currentColor" /> Add Entry
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#202124" }}>{t("nav_daily_collections")}</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9AA0A6" }}>Cash collected by route and field collectors</p>
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
                    background: isSelected ? "#4285F4" : "#FFFFFF",
                    border: `1px solid ${isSelected ? "#4285F4" : "#E0E3E7"}`,
                    color: isSelected ? "#FFFFFF" : "#202124",
                  }}
                >
                  <div className="font-semibold">{fmtDate(d.date)}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.75)" : "#9AA0A6" }}>
                    Rs. {fmt(d.total)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Summary metric cards */}
        <div className="grid grid-cols-5 gap-4 no-print">
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #34A853" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Total Cash</p>
            <p className="text-2xl font-black" style={{ color: "#34A853" }}>Rs. {fmt(totalCash)}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>cash collections</p>
          </div>
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #2563eb" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Total Cheque</p>
            <p className="text-2xl font-black" style={{ color: "#2563eb" }}>Rs. {fmt(totalCheque)}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>cheque receipts</p>
          </div>
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #7c3aed" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>NLB Winnings</p>
            <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>Rs. {fmt(totalNlb)}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>NLB winning tickets</p>
          </div>
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #EA580C" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>DLB Winnings</p>
            <p className="text-2xl font-black" style={{ color: "#EA580C" }}>Rs. {fmt(totalDlb)}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>DLB winning tickets</p>
          </div>
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", borderTop: "3px solid #4285F4" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9AA0A6" }}>Grand Total</p>
            <p className="text-2xl font-black" style={{ color: "#4285F4" }}>Rs. {fmt(grandTotal)}</p>
            <p className="text-xs mt-1" style={{ color: "#9AA0A6" }}>{collections.length} entr{collections.length !== 1 ? "ies" : "y"}</p>
          </div>
        </div>

        {/* Add form */}
        {form && (
          <div className="rounded-2xl overflow-hidden shadow-sm no-print" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #4285F4" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "#202124" }}>New Collection Entry — {dateLabel}</h2>
                <button onClick={() => setForm(null)} className="p-1 rounded" style={{ color: "#9AA0A6" }}>
                  <CloseCircle size={14} variant="Linear" color="currentColor" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Agent *</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Collector Name</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Route / Area</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Cash (Rs.)</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Cheque (Rs.)</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>NLB Winning Tickets (Rs.)</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>DLB Winning Tickets (Rs.)</label>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9AA0A6" }}>Notes</label>
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
                  style={{ background: "#4285F4" }}
                >
                  <Save2 size={14} variant="Linear" color="currentColor" /> Save Entry
                </button>
                <button
                  onClick={() => setForm(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", color: "#202124" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collection table */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>
          <div className="px-5 py-3 no-print" style={{ background: "#374151", borderBottom: "2px solid #4285F4" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{dateLabel}</span>
              <span className="text-xs" style={{ color: "#9AA0A6" }}>{collections.length} entr{collections.length !== 1 ? "ies" : "y"}</span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "#9AA0A6" }}>Loading…</div>
          ) : collections.length === 0 ? (
            <div className="py-12 text-center animate-fade-in">
              <p className="text-sm font-semibold mb-1.5" style={{ color: "#5F6368" }}>No Collections for This Date</p>
              <p className="text-xs" style={{ color: "#9AA0A6" }}>Click "+ Add Entry" to record today's collections.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E0E3E7" }}>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>#</th>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent</th>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Collector</th>
                    <th className="px-4 py-3 text-left" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Route</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cash</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cheque</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>NLB Win.</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>DLB Win.</th>
                    <th className="px-4 py-3 text-right" style={{ fontSize: 10, color: "#9AA0A6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total</th>
                    <th className="px-4 py-3 w-12 no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((c, i) => {
                    const rowTotal = c.cash_amount + c.cheque_amount + c.nlb_winning + c.dlb_winning;
                    return (
                      <tr key={c.id} className="hover:bg-red-50/20 transition-colors"
                        style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                        <td className="px-4 py-3 text-sm" style={{ color: "#9AA0A6" }}>{i + 1}</td>
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#202124" }}>{c.agent_name}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#5F6368" }}>{c.collector_name || "—"}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#5F6368" }}>{c.route || "—"}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#34A853" }}>{fmt(c.cash_amount)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#2563eb" }}>{fmt(c.cheque_amount)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#7c3aed" }}>{fmt(c.nlb_winning)}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#ea580c" }}>{fmt(c.dlb_winning)}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#202124" }}>{fmt(rowTotal)}</td>
                        <td className="px-3 py-3 no-print">
                          <button
                            onClick={() => handleDelete(c.id!)}
                            className="p-1.5 rounded-lg"
                            style={{ background: "#FFF1F0", color: "#EA4335" }}
                          >
                            <Trash size={14} variant="Linear" color="currentColor" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#374151", borderTop: "2px solid #4285F4" }}>
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold uppercase" style={{ color: "#9AA0A6" }}>TOTALS</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalCash)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalCheque)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalNlb)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#FFFFFF" }}>{fmt(totalDlb)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#4285F4" }}>Rs. {fmt(grandTotal)}</td>
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
