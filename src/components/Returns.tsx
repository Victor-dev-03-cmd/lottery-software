import React, { useEffect, useRef, useState } from "react";
import { Plus, CheckCircle, Trash2, X, Save, RefreshCw, Home, ChevronRight, RotateCcw, Zap, ShieldAlert } from "lucide-react";
import {
  getAgents, getInvoices, getLotteryGames,
  getTicketReturns, saveTicketReturn, settleTicketReturn, deleteTicketReturn, getReturnSummary,
  getBatchesForGame,
  getInvoiceWithItems,
} from "../services/database";
import type { Agent, Invoice, LotteryGame, TicketReturn, ReturnReason } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { calcEndBarcode, calcQtyFromBarcodes, isNumericBarcode, lastTicketBarcode } from "../utils/barcode";
import TicketLogoPicker, { resolveLogoUrl } from "./TicketLogoPicker";

interface ScannedItem {
  barcode_start: string;
  barcode_end: string;
  qty: number;
  value: number;
}

const RETURN_REASONS: { value: ReturnReason; label: string; color: string }[] = [
  { value: "unsold",       label: "Unsold",        color: "#6B7280" },
  { value: "damaged",      label: "Damaged",       color: "#CF291D" },
  { value: "expired_draw", label: "Expired Draw",  color: "#d97706" },
  { value: "exchange",     label: "Exchange",      color: "#2563eb" },
  { value: "other",        label: "Other",         color: "#7c3aed" },
];

const EMPTY = (agentId = 0): TicketReturn => ({
  agent_id: agentId,
  return_date: new Date().toISOString().split("T")[0],
  game_name: "",
  barcode_start: "",
  barcode_end: "",
  qty: 0,
  unit_price: 32.5,
  total_value: 0,
  status: "pending",
  notes: "",
  return_reason: "unsold",
});

export default function Returns() {
  // useAuth kept for future role-based features
  void useAuth;
  const [returns, setReturns] = useState<TicketReturn[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [games, setGames] = useState<LotteryGame[]>([]);
  const [summary, setSummary] = useState({ pending_qty: 0, pending_value: 0, settled_qty: 0, settled_value: 0 });
  const [form, setForm] = useState<TicketReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("all");
  const [authError, setAuthError] = useState<string | null>(null);

  // Logo picker + batch picker for manual form
  const [logoPicker, setLogoPicker] = useState(false);
  const [batchOptions, setBatchOptions] = useState<Awaited<ReturnType<typeof getBatchesForGame>>>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  // Quick Scan state
  const [quickScanActive, setQuickScanActive] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [scanQueue, setScanQueue] = useState<ScannedItem[]>([]);
  const [scanGameName, setScanGameName] = useState("");
  const [scanUnitPrice, setScanUnitPrice] = useState(32.5);
  const [scanAgentId, setScanAgentId] = useState<number>(0);
  const [scanInvoiceId, setScanInvoiceId] = useState<number | "">("");
  const [scanSettling, setScanSettling] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [r, a, inv, g, s] = await Promise.all([
      getTicketReturns(), getAgents(), getInvoices(), getLotteryGames(), getReturnSummary(),
    ]);
    setReturns(r);
    setAgents(a);
    setInvoices(inv);
    setGames(g);
    setSummary(s);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Auto-focus scan input when Quick Scan opens
  useEffect(() => {
    if (quickScanActive) {
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [quickScanActive]);

  // ── Manual form helpers ──────────────────────────────────────────────────────

  function setField(field: keyof TicketReturn, value: string | number) {
    if (!form) return;
    const updated = { ...form, [field]: value };
    if (field === "qty" && isNumericBarcode(updated.barcode_start))
      updated.barcode_end = calcEndBarcode(updated.barcode_start, Number(value));
    else if (field === "barcode_end" && isNumericBarcode(updated.barcode_start) && isNumericBarcode(String(value)))
      updated.qty = calcQtyFromBarcodes(updated.barcode_start, String(value));
    else if (field === "barcode_start" && isNumericBarcode(String(value))) {
      if (updated.qty > 0) updated.barcode_end = calcEndBarcode(String(value), updated.qty);
      else if (isNumericBarcode(updated.barcode_end)) updated.qty = calcQtyFromBarcodes(String(value), updated.barcode_end);
    }
    if (field === "game_name") {
      const g = games.find((x) => x.name === String(value));
      if (g) updated.unit_price = g.unit_price;
      setSelectedBatchId(null);
      setBatchOptions([]);
      if (String(value).trim()) {
        getBatchesForGame(String(value)).then(setBatchOptions).catch(() => setBatchOptions([]));
      }
    }
    updated.total_value = Math.round(updated.qty * updated.unit_price * 100) / 100;
    setForm(updated);
  }

  function resetForm() {
    setForm(null);
    setBatchOptions([]);
    setSelectedBatchId(null);
    setLogoPicker(false);
  }

  async function handleSave() {
    if (!form) return;
    if (!form.game_name.trim()) { alert("Game name required."); return; }
    if (form.qty <= 0) { alert("Quantity must be > 0."); return; }
    // Attach the selected batch so stock can be restored when settled
    await saveTicketReturn({ ...form, purchase_batch_id: selectedBatchId ?? undefined });
    resetForm();
    load();
  }

  async function handleSettle(id: number) {
    if (!confirm("Mark this return as settled? This will restore the returned quantity back to the original batch and credit the agent's outstanding balance.")) return;
    setAuthError(null);
    try {
      await settleTicketReturn(id);
      load();
    } catch (err) {
      setAuthError(`Settle failed: ${String(err)}`);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this return record?")) return;
    setAuthError(null);
    try {
      await deleteTicketReturn(id);
      load();
    } catch (err) {
      setAuthError(`Delete failed: ${String(err)}`);
    }
  }

  // ── Quick Scan helpers ───────────────────────────────────────────────────────

  function handleScanGameChange(name: string) {
    setScanGameName(name);
    const g = games.find((x) => x.name === name);
    if (g) setScanUnitPrice(g.unit_price);
  }

  function processScan(raw: string) {
    const barcode = raw.trim();
    if (!barcode || !isNumericBarcode(barcode)) return;

    if (pendingStart === null) {
      // First scan — record as start
      setPendingStart(barcode);
    } else {
      // Second scan — compute batch
      const qty = calcQtyFromBarcodes(pendingStart, barcode);
      if (qty <= 0) {
        alert(`End barcode (${barcode}) must be >= start barcode (${pendingStart}).`);
        setPendingStart(null);
        return;
      }
      const value = Math.round(qty * scanUnitPrice * 100) / 100;
      setScanQueue((prev) => [
        ...prev,
        { barcode_start: pendingStart, barcode_end: barcode, qty, value },
      ]);
      setPendingStart(null);
    }
  }

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      processScan(scanInput);
      setScanInput("");
    }
  }

  function removeScanItem(idx: number) {
    setScanQueue((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearScanQueue() {
    setScanQueue([]);
    setPendingStart(null);
    setScanInput("");
    scanInputRef.current?.focus();
  }

  async function handleSettleAllScanned() {
    if (scanQueue.length === 0) { alert("No scanned items to settle."); return; }
    if (!scanGameName) { alert("Select a game first."); return; }
    if (!scanAgentId) { alert("Select an agent first."); return; }
    if (!confirm(`Save and settle ${scanQueue.length} scanned batch(es)?`)) return;

    setAuthError(null);
    setScanSettling(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      for (const item of scanQueue) {
        const ret: TicketReturn = {
          agent_id: scanAgentId,
          return_date: today,
          game_name: scanGameName,
          barcode_start: item.barcode_start,
          barcode_end: item.barcode_end,
          qty: item.qty,
          unit_price: scanUnitPrice,
          total_value: item.value,
          status: "pending",
          notes: "Quick scan",
          invoice_id: scanInvoiceId !== "" ? (scanInvoiceId as number) : undefined,
        };
        const savedId = await saveTicketReturn(ret);
        if (savedId) await settleTicketReturn(savedId);
      }
      clearScanQueue();
      load();
    } catch (err) {
      setAuthError(`Bulk settle failed: ${String(err)}`);
    } finally {
      setScanSettling(false);
    }
  }

  const scanRunningTotal = scanQueue.reduce((s, i) => s + i.value, 0);

  // ── Formatting ───────────────────────────────────────────────────────────────

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const filtered = returns.filter((r) => filter === "all" || r.status === filter);
  const pendingCount = returns.filter((r) => r.status === "pending").length;

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Return &amp; Settlement</span>
        </nav>
      </div>

      {/* Auth error banner */}
      {authError && (
        <div className="mx-6 mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#CF291D" }}>
          <ShieldAlert size={14}/> {authError}
          <button className="ml-auto font-bold" onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      <div className="px-6 pb-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>
              Return &amp; Settlement
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              Track unsold/expired ticket returns
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => {
                setQuickScanActive((v) => !v);
                if (form) resetForm();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={
                quickScanActive
                  ? { background: "#1D4ED8", color: "#FFFFFF" }
                  : { background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8" }
              }
            >
              <Zap size={14} /> Quick Scan
            </button>
            <button
              onClick={() => { setForm(EMPTY()); setQuickScanActive(false); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
              style={{ background: "#CF291D" }}
            >
              <Plus size={14} /> Record Return
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Pending Returns"
            value={summary.pending_qty.toLocaleString()}
            sub={`Rs. ${fmt(summary.pending_value)}`}
            accent="#d97706"
          />
          <StatCard
            label="Settled Returns"
            value={summary.settled_qty.toLocaleString()}
            sub={`Rs. ${fmt(summary.settled_value)}`}
            accent="#16a34a"
          />
          <StatCard
            label="Total Returned"
            value={(summary.pending_qty + summary.settled_qty).toLocaleString()}
            sub="all tickets"
            accent="#3B82F6"
          />
          <StatCard
            label="Total Value"
            value={`Rs. ${fmt(summary.pending_value + summary.settled_value)}`}
            sub="all returns"
            accent="#6366F1"
          />
        </div>

        {/* ── Quick Scan Panel ─────────────────────────────────────────────── */}
        {quickScanActive && (
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: "#FFFFFF", border: "2px solid #1D4ED8" }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: "#1D4ED8", borderBottom: "2px solid #1E40AF" }}
            >
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-white" />
                <span className="font-semibold text-sm text-white">Quick Scan Mode</span>
              </div>
              <button
                onClick={() => { setQuickScanActive(false); clearScanQueue(); }}
                style={{ color: "#BFDBFE" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Context row: game / agent / invoice / unit price */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Game *
                  </label>
                  <FocusSelect
                    value={scanGameName}
                    onChange={(e) => handleScanGameChange(e.target.value)}
                  >
                    <option value="">— Select Game —</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </FocusSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Agent *
                  </label>
                  <FocusSelect
                    value={scanAgentId || ""}
                    onChange={(e) => { setScanAgentId(Number(e.target.value)); setScanInvoiceId(""); }}
                  >
                    <option value="">— Select Agent —</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </FocusSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Invoice (optional)
                  </label>
                  <FocusSelect
                    value={scanInvoiceId}
                    onChange={(e) => setScanInvoiceId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">— None —</option>
                    {invoices
                      .filter((i) => i.agent_id === scanAgentId)
                      .map((i) => (
                        <option key={i.id} value={i.id}>#{i.invoice_number}</option>
                      ))}
                  </FocusSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Unit Price (Rs.)
                  </label>
                  <FocusInput
                    type="number"
                    step="0.01"
                    value={scanUnitPrice}
                    onChange={(e) => setScanUnitPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Scan input */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                  Scan Barcode
                </label>
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  placeholder="Point scanner at barcode and scan…"
                  className="w-full rounded-lg px-4 py-3 text-base font-mono focus:outline-none"
                  style={{
                    border: "2px solid #1D4ED8",
                    background: "#EFF6FF",
                    color: "#1D1D1D",
                    letterSpacing: "0.08em",
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {/* Status hint */}
                {pendingStart !== null ? (
                  <p className="mt-1.5 text-xs font-semibold" style={{ color: "#d97706" }}>
                    Waiting for end barcode — batch starts at {pendingStart}…
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                    Scan the START barcode of a batch, then the END barcode.
                  </p>
                )}
              </div>

              {/* Scanned items mini-table */}
              {scanQueue.length > 0 && (
                <div>
                  <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E8E8E8" }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8E8" }}>
                          {["#", "Start Barcode", "End Barcode", "Qty", "Value (Rs.)", ""].map((h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left"
                              style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scanQueue.map((item, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-blue-50/40 transition-colors"
                            style={{ borderBottom: "1px solid #F9F9F9" }}
                          >
                            <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono text-xs" style={{ color: "#1D1D1D" }}>{item.barcode_start}</td>
                            <td className="px-3 py-2 font-mono text-xs" style={{ color: "#1D1D1D" }}>{item.barcode_end}</td>
                            <td className="px-3 py-2 text-right text-sm" style={{ color: "#1D1D1D" }}>{item.qty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-sm font-semibold" style={{ color: "#d97706" }}>{fmt(item.value)}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => removeScanItem(idx)}
                                className="p-1 rounded hover:bg-red-50 transition-colors"
                                style={{ color: "#CF291D" }}
                                title="Remove"
                              >
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Running total */}
                  <div className="flex items-center justify-end gap-3 mt-2 px-1">
                    <span className="text-xs" style={{ color: "#6B7280" }}>
                      {scanQueue.length} batch{scanQueue.length !== 1 ? "es" : ""}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#1D4ED8" }}>
                      Total: Rs. {fmt(scanRunningTotal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid #F3F4F6" }}>
                <button
                  onClick={handleSettleAllScanned}
                  disabled={scanSettling || scanQueue.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-50"
                  style={{ background: "#1D4ED8" }}
                >
                  <Zap size={14} />
                  {scanSettling ? "Settling…" : `Settle All Scanned (${scanQueue.length})`}
                </button>
                <button
                  onClick={clearScanQueue}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#6B7280" }}
                >
                  <RotateCcw size={14} /> Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Manual Add Form ──────────────────────────────────────────────── */}
        {form && (
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}
            >
              <span className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>
                New Return Entry
              </span>
              <button style={{ color: "#9CA3AF" }} onClick={() => resetForm()}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* ── Logo picker modal ── */}
              {logoPicker && (
                <TicketLogoPicker
                  onSelect={name => {
                    setField("game_name", name);
                    setLogoPicker(false);
                  }}
                  onClose={() => setLogoPicker(false)}
                />
              )}

              {/* ── Row 1: Agent + Date + Invoice ── */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Agent *</label>
                  <FocusSelect value={form.agent_id || ""} onChange={e => setField("agent_id", Number(e.target.value))}>
                    <option value="">— Select —</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </FocusSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Return Date</label>
                  <FocusInput type="date" value={form.return_date} onChange={e => setField("return_date", e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>
                    🔗 Linked Invoice <span style={{ color:"#9CA3AF", fontWeight:400 }}>(select to link)</span>
                  </label>
                  <FocusSelect value={form.invoice_id ?? ""} onChange={e => setField("invoice_id", e.target.value ? Number(e.target.value) : "")}>
                    <option value="">— None —</option>
                    {invoices.filter(i => i.agent_id === form.agent_id).map(i => (
                      <option key={i.id} value={i.id}>#{i.invoice_number} · {i.invoice_date}</option>
                    ))}
                  </FocusSelect>
                  {form.invoice_id && (() => {
                    const inv = invoices.find(i => i.id === form.invoice_id);
                    return inv ? (
                      <div style={{ marginTop:4, fontSize:10, color:"#16A34A", fontWeight:600 }}>
                        ✓ Linked to #{inv.invoice_number} · Rs. {fmt(inv.invoice_total)}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* ── Row 2: Game / Ticket with image picker ── */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>
                  🎫 Game / Ticket Name *
                </label>
                <button type="button" onClick={() => setLogoPicker(true)}
                  style={{
                    display:"flex", alignItems:"center", gap:12, width:"100%",
                    padding:"10px 14px", borderRadius:10, textAlign:"left", cursor:"pointer",
                    border:`2px solid ${form.game_name?"#2563EB":"#CF291D"}`,
                    background: form.game_name?"#EFF6FF":"#FEF2F2",
                    transition:"all 0.15s",
                  }}>
                  {form.game_name ? (
                    <>
                      <img src={resolveLogoUrl(form.game_name)} alt="" style={{ width:40, height:40, objectFit:"contain", borderRadius:6, background:"#fff" }}
                        onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}}/>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#1D4ED8" }}>{form.game_name}</div>
                        <div style={{ fontSize:10, color:"#6B7280" }}>click to change</div>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize:12, color:"#CF291D", fontWeight:600 }}>
                      🎫 Click to select ticket — choose from image picker
                    </div>
                  )}
                </button>
              </div>

              {/* ── Batch picker — shown after game is selected ── */}
              {form.game_name && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>
                    📦 Select Batch to Return From
                  </label>
                  {batchOptions.length === 0 ? (
                    <div style={{ padding:"10px 12px", background:"#FEF9C3", borderRadius:8, fontSize:11, color:"#92400E", border:"1px solid #FDE68A" }}>
                      ⚠ No stock batches found for {form.game_name}. Add stock in Stock Purchases first.
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {batchOptions.map(b => {
                        const isSelected = selectedBatchId === b.id;
                        return (
                          <button key={b.id} type="button"
                            onClick={async () => {
                              setSelectedBatchId(b.id);
                              setField("unit_price", b.unit_price);

                              // For a return we need the barcode range the agent RECEIVED,
                              // not the next-to-be-issued position.
                              // Priority: linked invoice item → batch start
                              let returnStart = b.barcode_start;

                              if (form.invoice_id) {
                                try {
                                  const inv = await getInvoiceWithItems(form.invoice_id);
                                  const matchItem = inv?.items?.find(
                                    it => it.ticket_name === form.game_name &&
                                         (it.purchase_batch_id === b.id ||
                                          // fallback: barcode_start is within this batch's range
                                          (Number(it.barcode_start) >= Number(b.barcode_start) &&
                                           Number(it.barcode_start) < Number(b.barcode_end)))
                                  );
                                  if (matchItem?.barcode_start) returnStart = matchItem.barcode_start;
                                } catch { /* use batch start as fallback */ }
                              }

                              setField("barcode_start", returnStart);
                              if (form.qty > 0) setField("barcode_end", String(Number(returnStart) + form.qty));
                            }}
                            style={{
                              display:"flex", alignItems:"center", justifyContent:"space-between",
                              padding:"10px 14px", border:`2px solid ${isSelected?"#CF291D":"#E5E7EB"}`,
                              borderRadius:10, background: isSelected?"#FEF2F2":"#F9FAFB",
                              cursor:"pointer", textAlign:"left", transition:"all 0.12s",
                            }}>
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:"#111827", marginBottom:3 }}>
                                {isSelected && <span style={{ marginRight:5, color:"#CF291D" }}>✓</span>}
                                Batch #{b.id} · {b.batch_date}
                              </div>
                              <div style={{ fontSize:10, fontFamily:"monospace", color:"#6B7280" }}>
                                <span style={{ color:"#2563EB" }}>{b.barcode_start}</span>
                                <span style={{ margin:"0 4px", color:"#9CA3AF" }}>→</span>
                                <span style={{ color:"#7C3AED" }}>{b.barcode_end}</span>
                                <span style={{ marginLeft:8, color:"#9CA3AF" }}>
                                  Last ticket: <strong style={{ color:"#374151" }}>{lastTicketBarcode(b.barcode_end)}</strong>
                                </span>
                              </div>
                              <div style={{ fontSize:9, color:"#6B7280", marginTop:2 }}>
                                Issued: <strong style={{ color:"#CF291D" }}>{b.sold_from_invoices.toLocaleString()}</strong> tickets ·
                                Remaining in stock: <strong style={{ color:"#16A34A" }}>{b.remaining_qty.toLocaleString()}</strong>
                              </div>
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontSize:14, fontWeight:900, color: b.remaining_qty < 100?"#CF291D":"#16A34A" }}>
                                {b.remaining_qty.toLocaleString()}
                              </div>
                              <div style={{ fontSize:9, color:"#9CA3AF" }}>available</div>
                              <div style={{ fontSize:10, color:"#6B7280", marginTop:2 }}>Rs. {b.unit_price}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Row 3: Barcodes + Qty + Price ── */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>
                    Barcode Start {selectedBatchId ? <span style={{ color:"#16A34A", fontWeight:600 }}>✓ auto-filled</span> : ""}
                  </label>
                  <FocusInput type="text" value={form.barcode_start}
                    onChange={e => setField("barcode_start", e.target.value)}
                    placeholder="62900474690" mono />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Barcode End (auto)</label>
                  <FocusInput type="text" value={form.barcode_end}
                    onChange={e => setField("barcode_end", e.target.value)}
                    placeholder="Auto-calculated" mono />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Qty (auto)</label>
                  <FocusInput type="number" min="0" value={form.qty || ""} placeholder="0"
                    onChange={e => setField("qty", parseInt(e.target.value) || 0)}
                    onFocus={e => e.target.select()} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Unit Price (Rs.)</label>
                  <FocusInput type="number" step="0.01" value={form.unit_price || ""} placeholder="0"
                    onChange={e => setField("unit_price", parseFloat(e.target.value) || 0)}
                    onFocus={e => e.target.select()} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Total Value</label>
                  <div className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
                    style={{ border:"1px solid #E8E8E8", background:"#F9F9F9", color:"#16a34a" }}>
                    {fmt(form.total_value)}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Return Reason</label>
                  <select value={form.return_reason ?? "unsold"} onChange={e => setField("return_reason", e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border:"1px solid #E8E8E8", background:"#FAFAFA", color:"#1D1D1D" }}
                    onFocus={e => (e.currentTarget.style.borderColor = "#CF291D")}
                    onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")}>
                    {RETURN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#9CA3AF" }}>Notes</label>
                  <FocusInput type="text" value={form.notes}
                    onChange={e => setField("notes", e.target.value)}
                    placeholder="Additional details…" />
                </div>
              </div>
              <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                  style={{ background: "#CF291D" }}
                >
                  <Save size={14} /> Save Return
                </button>
                <button
                  onClick={() => resetForm()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Returns Table ────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden shadow-sm"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}
        >
          {/* Dark table header with filter tabs */}
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}
          >
            <span className="text-sm font-semibold text-white">Returns Register</span>
            <div className="flex items-center gap-2">
              {/* Bulk settle pending */}
              {pendingCount > 0 && filter !== "settled" && (
                <button
                  onClick={async () => {
                    if (!confirm(`Settle ALL ${pendingCount} pending returns?`)) return;
                    setAuthError(null);
                    try {
                      const pending = returns.filter(r => r.status === "pending");
                      for (const r of pending) await settleTicketReturn(r.id!);
                      load();
                    } catch (err) {
                      setAuthError(`Bulk settle failed: ${String(err)}`);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all"
                  style={{ background: "#16a34a", color: "#FFFFFF" }}>
                  <CheckCircle size={11}/> Settle All ({pendingCount})
                </button>
              )}
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { key: "all" as const, label: "All" },
                    { key: "pending" as const, label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
                    { key: "settled" as const, label: "Settled" },
                  ]
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
                    style={
                      filter === key
                        ? { background: "#CF291D", color: "#FFFFFF" }
                        : { background: "#2D2D2D", color: "#9CA3AF" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: "#F3F4F6" }}
              >
                <RotateCcw size={22} style={{ color: "#BFBFBF" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>No returns found</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                {filter === "all" ? "Record a return to get started" : "Try a different filter"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                    {["Date", "Agent", "Game", "Barcode Range", "Qty", "Value (Rs.)", "Reason", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left"
                        style={{
                          fontSize: 10,
                          color: "#9CA3AF",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                    <th
                      className="px-4 py-3"
                      style={{
                        fontSize: 10,
                        color: "#9CA3AF",
                        fontWeight: 600,
                        width: 88,
                      }}
                    />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50/60 transition-colors"
                      style={{ borderBottom: "1px solid #F9F9F9" }}
                    >
                      <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>
                        {fmtDate(r.return_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1D1D1D" }}>
                        {r.agent_name}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "#1D1D1D" }}>
                        {r.game_name}
                      </td>
                      <td
                        className="px-4 py-3 text-xs font-mono"
                        style={{ color: "#6B7280" }}
                      >
                        {r.barcode_start}{r.barcode_end ? ` → ${r.barcode_end}` : ""}
                      </td>
                      <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>
                        {r.qty.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#d97706" }}>
                        {fmt(r.total_value)}
                      </td>
                      {/* Reason badge */}
                      <td className="px-4 py-3">
                        {(() => {
                          const reason = RETURN_REASONS.find(x => x.value === (r.return_reason ?? "unsold"));
                          return (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ background: `${reason?.color ?? "#6B7280"}18`, color: reason?.color ?? "#6B7280" }}>
                              {reason?.label ?? "Unsold"}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
                          style={{
                            background: r.status === "pending" ? "#d97706" : "#16a34a",
                          }}
                        >
                          {r.status === "pending" ? "Pending" : "Settled"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {r.status === "pending" && (
                            <button
                              onClick={() => handleSettle(r.id!)}
                              title="Mark Settled"
                              className="p-1.5 rounded-lg hover:opacity-80"
                              style={{ background: "#F0FDF4", color: "#16a34a" }}
                            >
                              <CheckCircle size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(r.id!)}
                            className="p-1.5 rounded-lg hover:opacity-80"
                            style={{ background: "#FFF1F0", color: "#CF291D" }}
                            title="Delete"
                          >
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

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl p-4 shadow-sm"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E8E8E8",
        borderTop: `3px solid ${accent}`,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wider mb-2"
        style={{ color: "#9CA3AF" }}
      >
        {label}
      </p>
      <p className="text-2xl font-black leading-none" style={{ color: "#1D1D1D" }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
        {sub}
      </p>
    </div>
  );
}

function FocusInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }
) {
  const { mono, onFocus, onBlur, style: propStyle, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...rest}
      className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none${mono ? " font-mono" : ""}`}
      style={{
        border: `1px solid ${focused ? "#CF291D" : "#E8E8E8"}`,
        background: "#FAFAFA",
        ...propStyle,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    />
  );
}

function FocusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...rest}
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
      style={{
        border: `1px solid ${focused ? "#CF291D" : "#E8E8E8"}`,
        background: "#FAFAFA",
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    >
      {children}
    </select>
  );
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
