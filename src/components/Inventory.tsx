import React, { useEffect, useState } from "react";
import { Plus, Trash2, X, Save, AlertTriangle, Package, RefreshCw, Calculator, Home, ChevronRight, Pencil, Grid, List } from "lucide-react";
import { resolveLogoUrl } from "./TicketLogoPicker";
import { calcEndBarcode, calcQtyFromBarcodes, isNumericBarcode, lastTicketBarcode } from "../utils/barcode";
import {
  getInventoryBatches,
  saveInventoryBatch,
  deleteInventoryBatch,
  getLotteryGames,
  syncInventoryFromTransactions,
  getBatchesForGame,
  getBatchSalesDetail,
  getBatchReturns,
} from "../services/database";
import type { InventoryBatch, LotteryGame } from "../types";

// ── All 16 known NLB/DLB games ────────────────────────────────────────────────
const ALL_GAMES: { name: string; board: "NLB" | "DLB" }[] = [
  { name: "Ada Sampatha",         board: "NLB" },
  { name: "Ayubo",                board: "NLB" },
  { name: "Dhana Nidhanaya",      board: "NLB" },
  { name: "Govi Setha",           board: "NLB" },
  { name: "Hada Hana",            board: "NLB" },
  { name: "Mahajana Sampatha",    board: "NLB" },
  { name: "Mega Power",           board: "NLB" },
  { name: "NLB Jaya",             board: "NLB" },
  { name: "Suba Dasawak",         board: "NLB" },
  { name: "Ada Kotipathi",        board: "DLB" },
  { name: "Jaya Sampatha",        board: "DLB" },
  { name: "Kapruka",              board: "DLB" },
  { name: "Lagna Wasanawa",       board: "DLB" },
  { name: "Sasiri",               board: "DLB" },
  { name: "Shanida Wasanawa",     board: "DLB" },
  { name: "Super Ball",           board: "DLB" },
  { name: "Supiri Dana Sampatha", board: "DLB" },
];

const NLB_DLB_CATEGORIES = [
  "NLB — Daily Draw", "NLB — Weekly Draw", "NLB — Special Draw",
  "DLB — Daily Draw", "DLB — Weekly Draw", "DLB — Saturday Special",
];

const EMPTY = (): InventoryBatch => ({
  game_name: "",
  batch_date: new Date().toISOString().split("T")[0],
  barcode_start: "",
  barcode_end: "",
  total_qty: 0,
  distributed_qty: 0,
  unit_price: 32.5,
  low_stock_threshold: 100,
  notes: "",
  batch_number: "",
  ticket_start_no: "",
  ticket_end_no: "",
  books_qty: 0,
  tickets_per_book: 100,
  warehouse_location: "",
  rack_tag: "",
  nlb_dlb_category: "",
});

export default function Inventory() {
  const [batches, setBatches] = useState<(InventoryBatch & { remaining_qty: number })[]>([]);
  const [games, setGames] = useState<LotteryGame[]>([]);
  const [form, setForm] = useState<InventoryBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [tabFilter, setTabFilter] = useState<"all" | "low" | "in">("all");
  // View mode: grid (default) or list
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  // Batch detail popup for a specific game
  const [detailGame, setDetailGame] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [b, g] = await Promise.all([getInventoryBatches(), getLotteryGames()]);
    setBatches(b);
    setGames(g);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSync() {
    if (!confirm("Recalculate all stock counts from purchases, invoices, and returns?\n\nThis fixes stock numbers that are out of sync with existing transactions.")) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncInventoryFromTransactions();
      await load();
      setSyncMsg(`✓ Synced ${r.batchesUpdated} game${r.batchesUpdated !== 1 ? "s" : ""}.${r.errors.length ? ` ${r.errors.length} error(s).` : ""}`);
      setTimeout(() => setSyncMsg(null), 5000);
    } catch (e) {
      setSyncMsg(`✗ Sync failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  function setFormField(field: keyof InventoryBatch, value: string | number) {
    if (!form) return;
    const updated = { ...form, [field]: value };

    if (field === "total_qty" && isNumericBarcode(updated.barcode_start)) {
      updated.barcode_end = calcEndBarcode(updated.barcode_start, Number(value));
    } else if (field === "barcode_end" && isNumericBarcode(updated.barcode_start) && isNumericBarcode(String(value))) {
      updated.total_qty = calcQtyFromBarcodes(updated.barcode_start, String(value));
    } else if (field === "barcode_start" && isNumericBarcode(String(value))) {
      if (updated.total_qty > 0) {
        updated.barcode_end = calcEndBarcode(String(value), updated.total_qty);
      } else if (isNumericBarcode(updated.barcode_end)) {
        updated.total_qty = calcQtyFromBarcodes(String(value), updated.barcode_end);
      }
    }

    setForm(updated);
  }

  async function handleSave() {
    if (!form) return;
    if (!form.game_name.trim()) { alert("Game name is required."); return; }
    if (!form.barcode_start.trim() || !form.barcode_end.trim()) { alert("Barcode range is required."); return; }
    await saveInventoryBatch(form);
    setForm(null);
    load();
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete batch "${name}"?`)) return;
    await deleteInventoryBatch(id);
    load();
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2 }).format(n);

  const filtered = batches.filter((b) => {
    const isLow = b.remaining_qty <= b.low_stock_threshold;
    const matchesTab =
      tabFilter === "all" ||
      (tabFilter === "low" && isLow) ||
      (tabFilter === "in" && !isLow);
    return matchesTab && (!filter || b.game_name.toLowerCase().includes(filter.toLowerCase()));
  });

  const lowStockCount = batches.filter((b) => b.remaining_qty <= b.low_stock_threshold).length;
  const totalTickets = batches.reduce((s, b) => s + b.total_qty, 0);
  const totalDistributed = batches.reduce((s, b) => s + b.distributed_qty, 0);
  const totalRemaining = batches.reduce((s, b) => s + b.remaining_qty, 0);

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Inventory</span>
        </nav>
      </div>

      {/* Sync status message */}
      {syncMsg && (
        <div className="mx-6 mt-2 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2"
          style={{
            background: syncMsg.startsWith("✓") ? "#F0FFF4" : "#FEF2F2",
            border: `1px solid ${syncMsg.startsWith("✓") ? "#BBF7D0" : "#FECACA"}`,
            color: syncMsg.startsWith("✓") ? "#16a34a" : "#CF291D",
          }}>
          {syncMsg}
        </div>
      )}

      <div className="px-6 pb-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>
              Stock Management
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              Track lottery ticket batches
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <FocusInput
              type="text"
              placeholder="Filter by game…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 150 }}
            />
            {/* Grid / List toggle */}
            <div style={{ display:"flex", borderRadius:8, border:"1px solid #E5E7EB", overflow:"hidden" }}>
              <button onClick={() => setViewMode("grid")}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", border:"none", fontSize:12, fontWeight:600, cursor:"pointer", background: viewMode==="grid"?"#CF291D":"#fff", color: viewMode==="grid"?"#fff":"#6B7280" }}>
                <Grid size={14}/> Grid
              </button>
              <button onClick={() => setViewMode("list")}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", border:"none", fontSize:12, fontWeight:600, cursor:"pointer", background: viewMode==="list"?"#CF291D":"#fff", color: viewMode==="list"?"#fff":"#6B7280" }}>
                <List size={14}/> List
              </button>
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-gray-50 disabled:opacity-50"
              style={{ background:"#FFFFFF", border:"1px solid #E8E8E8", color:"#1D1D1D" }}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""}/>
            </button>
            <button onClick={handleSync} disabled={syncing || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", color:"#2563eb" }}>
              <RefreshCw size={13} className={syncing?"animate-spin":""}/>
              Sync Stock
            </button>
            <button onClick={() => setForm(EMPTY())}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background:"#F9FAFB", border:"1px solid #E5E7EB", color:"#6B7280" }}>
              <Plus size={14}/> Add Batch
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Stock"
            value={totalTickets.toLocaleString()}
            sub="tickets in system"
            accent="#3B82F6"
          />
          <StatCard
            label="Distributed"
            value={totalDistributed.toLocaleString()}
            sub="issued to agents"
            accent="#16a34a"
          />
          <StatCard
            label="Remaining"
            value={totalRemaining.toLocaleString()}
            sub="available in stock"
            accent="#6366F1"
          />
          <StatCard
            label="Low Stock Alerts"
            value={String(lowStockCount)}
            sub={lowStockCount > 0 ? "batches need attention" : "all batches healthy"}
            accent={lowStockCount > 0 ? "#CF291D" : "#9CA3AF"}
          />
        </div>

        {/* Add / Edit Form */}
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
                {form.id ? "Edit Batch" : "New Stock Batch"}
              </span>
              <button style={{ color: "#9CA3AF" }} onClick={() => setForm(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Game Name *
                  </label>
                  <FocusInput
                    list="inv-games"
                    value={form.game_name}
                    onChange={(e) => {
                      const g = games.find((x) => x.name === e.target.value);
                      const isNLB = ["ada sampatha","dhana nidhanaya","govi setha","hada hana","mahajana sampatha","mega power","nlb jaya","suba dasawak"]
                        .some(n => e.target.value.toLowerCase().includes(n));
                      setForm({
                        ...form,
                        game_name: e.target.value,
                        unit_price: g?.unit_price ?? form.unit_price,
                        nlb_dlb_category: form.nlb_dlb_category || (isNLB ? "NLB — Daily Draw" : "DLB — Daily Draw"),
                      });
                    }}
                    placeholder="e.g. Mega Power"
                    autoFocus
                  />
                  <datalist id="inv-games">
                    {games.map((g) => <option key={g.id} value={g.name} />)}
                  </datalist>
                </div>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Batch Date
                  </label>
                  <FocusInput
                    type="date"
                    value={form.batch_date}
                    onChange={(e) => setForm({ ...form, batch_date: e.target.value })}
                  />
                </div>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Barcode Start *
                  </label>
                  <FocusInput
                    type="text"
                    value={form.barcode_start}
                    onChange={(e) => setFormField("barcode_start", e.target.value)}
                    placeholder="62900474690"
                    mono
                  />
                </div>
                <div>
                  <label
                    className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Barcode End *
                    <span title="Auto-calculated from Start + Qty">
                      <Calculator size={10} style={{ color: "#CF291D" }} />
                    </span>
                  </label>
                  <FocusInput
                    type="text"
                    value={form.barcode_end}
                    onChange={(e) => setFormField("barcode_end", e.target.value)}
                    placeholder="Auto-calculated"
                    mono
                  />
                </div>
                <div>
                  <label
                    className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Total Qty
                    <span title="Auto-calculated from barcodes">
                      <Calculator size={10} style={{ color: "#CF291D" }} />
                    </span>
                  </label>
                  <FocusInput
                    type="number"
                    min="0"
                    value={form.total_qty || ""}
                    placeholder="0"
                    onChange={(e) => setFormField("total_qty", parseInt(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Distributed Qty
                  </label>
                  <FocusInput
                    type="number"
                    min="0"
                    value={form.distributed_qty || ""}
                    placeholder="0"
                    readOnly
                    title="Distributed quantity is managed automatically by invoice confirm/cancel workflows"
                    style={{ background: "#F9FAFB", cursor: "not-allowed", opacity: 0.7 }}
                    onChange={() => {}}
                    onFocus={(e) => e.target.blur()}
                  />
                </div>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Unit Price (Rs.)
                  </label>
                  <FocusInput
                    type="number"
                    step="0.01"
                    value={form.unit_price || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, unit_price: parseFloat(e.target.value) || 0 })}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: "#9CA3AF" }}
                  >
                    Low Stock Alert (qty)
                  </label>
                  <FocusInput
                    type="number"
                    min="0"
                    value={form.low_stock_threshold || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, low_stock_threshold: parseInt(e.target.value) || 0 })}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <div className="col-span-2 lg:col-span-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                    Notes
                  </label>
                  <FocusInput type="text" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…"/>
                </div>
              </div>

              {/* ── ERP Fields ── */}
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#BFBFBF" }}>
                  ERP / Warehouse Details
                </p>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Batch No.</label>
                    <FocusInput type="text" value={form.batch_number ?? ""}
                      onChange={e => setForm({ ...form, batch_number: e.target.value })} placeholder="e.g. B2026-001"/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Category</label>
                    <select value={form.nlb_dlb_category ?? ""}
                      onChange={e => setForm({ ...form, nlb_dlb_category: e.target.value })}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}>
                      <option value="">— Category —</option>
                      {NLB_DLB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Ticket Start No.</label>
                    <FocusInput type="text" value={form.ticket_start_no ?? ""}
                      onChange={e => setForm({ ...form, ticket_start_no: e.target.value })} placeholder="e.g. A001"/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Ticket End No.</label>
                    <FocusInput type="text" value={form.ticket_end_no ?? ""}
                      onChange={e => setForm({ ...form, ticket_end_no: e.target.value })} placeholder="e.g. A500"/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Books (Bundles)</label>
                    <FocusInput type="number" value={form.books_qty || ""}
                      placeholder="0"
                      onChange={e => setForm({ ...form, books_qty: parseInt(e.target.value) || 0 })}
                      onFocus={(e) => e.target.select()}/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Tickets / Book</label>
                    <FocusInput type="number" value={form.tickets_per_book || ""}
                      placeholder="0"
                      onChange={e => setForm({ ...form, tickets_per_book: parseInt(e.target.value) || 100 })}
                      onFocus={(e) => e.target.select()}/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Warehouse</label>
                    <FocusInput type="text" value={form.warehouse_location ?? ""}
                      onChange={e => setForm({ ...form, warehouse_location: e.target.value })} placeholder="e.g. Main Store"/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Rack / Tag</label>
                    <FocusInput type="text" value={form.rack_tag ?? ""}
                      onChange={e => setForm({ ...form, rack_tag: e.target.value })} placeholder="e.g. R-A3"/>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                  style={{ background: "#CF291D" }}
                >
                  <Save size={14} /> Save Batch
                </button>
                <button
                  onClick={() => setForm(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── GRID VIEW ── */}
        {viewMode === "grid" && (
          <InventoryGridView
            batches={batches}
            filter={filter}
            onGameClick={name => setDetailGame(name)}
          />
        )}

        {/* Batch detail popup */}
        {detailGame && (
            <BatchDetailPopup
              gameName={detailGame}
              onClose={() => setDetailGame(null)}
            />
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === "list" && (
        <div
          className="rounded-2xl overflow-hidden shadow-sm"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}
        >
          {/* Dark table header with filter tabs */}
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}
          >
            <span className="text-sm font-semibold text-white">Batch Inventory</span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: "all" as const, label: "All" },
                  { key: "low" as const, label: "Low Stock" },
                  { key: "in" as const, label: "In Stock" },
                ]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTabFilter(key)}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
                  style={
                    tabFilter === key
                      ? { background: "#CF291D", color: "#FFFFFF" }
                      : { background: "#2D2D2D", color: "#9CA3AF" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "#9CA3AF" }}>
              Loading inventory…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: "#F3F4F6" }}
              >
                <Package size={22} style={{ color: "#BFBFBF" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>
                {batches.length === 0 ? "No batches yet" : "No results"}
              </p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                {batches.length === 0 ? "Add your first ticket batch to get started" : "Try adjusting the filter"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#F9FAFB", borderBottom:"2px solid #F3F4F6" }}>
                    {[
                      { label:"Game",         align:"left",   w:220 },
                      { label:"Date",          align:"center", w:100 },
                      { label:"Barcode Range", align:"left",   w:230 },
                      { label:"Total",         align:"right",  w:80  },
                      { label:"Sold",          align:"right",  w:80  },
                      { label:"Remaining",     align:"right",  w:100 },
                      { label:"Unit Price",    align:"right",  w:90  },
                      { label:"Status",        align:"center", w:100 },
                    ].map(h => (
                      <th key={h.label} style={{
                        padding:"10px 14px", textAlign: h.align as "left"|"right"|"center",
                        fontSize:10, fontWeight:700, color:"#9CA3AF",
                        textTransform:"uppercase", letterSpacing:"0.05em",
                        width: h.w, whiteSpace:"nowrap",
                      }}>{h.label}</th>
                    ))}
                    <th style={{ width:70 }}/>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const isLow = b.remaining_qty <= b.low_stock_threshold;
                    const isNLB = ["ada sampatha","dhana nidhanaya","govi setha","hada hana","mahajana sampatha","mega power","nlb jaya","suba dasawak"].some(n => b.game_name.toLowerCase().includes(n));
                    return (
                      <tr key={b.id}
                        style={{ borderBottom:"1px solid #F3F4F6", background: isLow?"#FFF8F8":undefined }}
                        onMouseEnter={e => { if (!isLow) (e.currentTarget as HTMLElement).style.background="#F9FAFB"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLow?"#FFF8F8":""; }}>

                        {/* Game — logo + name + board */}
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                            <img src={resolveLogoUrl(b.game_name)} alt=""
                              style={{ width:52, height:52, objectFit:"contain", borderRadius:8, flexShrink:0, background:"#F3F4F6", padding:2 }}
                              onError={e=>{(e.currentTarget as HTMLImageElement).src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='52'%3E%3Crect width='52' height='52' rx='8' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='24'%3E🎫%3C/text%3E%3C/svg%3E"}}/>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color:"#111827", display:"flex", alignItems:"center", gap:5 }}>
                                {isLow && <AlertTriangle size={12} style={{ color:"#CF291D" }}/>}
                                {b.game_name}
                              </div>
                              <span style={{
                                marginTop:3, display:"inline-block", padding:"1px 8px", borderRadius:20,
                                fontSize:9, fontWeight:700,
                                background: isNLB?"#DBEAFE":"#FFEDD5",
                                color: isNLB?"#1d4ed8":"#c2410c",
                              }}>
                                {isNLB?"📘 NLB":"📙 DLB"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Batch date */}
                        <td style={{ padding:"10px 14px", textAlign:"center", fontSize:12, color:"#6B7280" }}>
                          {fmtDate(b.batch_date)}
                        </td>

                        {/* Barcode range — compact with two lines */}
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ fontSize:11, fontFamily:"monospace", color:"#374151", lineHeight:1.7 }}>
                            <span style={{ color:"#2563EB", fontWeight:700 }}>{b.barcode_start}</span>
                            <span style={{ color:"#9CA3AF", margin:"0 4px" }}>→</span>
                            <span style={{ color:"#7C3AED", fontWeight:700 }}>{b.barcode_end}</span>
                          </div>
                          <div style={{ fontSize:9, color:"#9CA3AF", marginTop:1 }}>
                            {b.total_qty > 0 ? `${Math.ceil(b.total_qty / (b.tickets_per_book||100))} books × ${b.tickets_per_book||100}` : ""}
                          </div>
                        </td>

                        {/* Total */}
                        <td style={{ padding:"10px 14px", textAlign:"right", fontSize:13, fontWeight:700, color:"#111827" }}>
                          {b.total_qty.toLocaleString()}
                        </td>

                        {/* Sold (distributed) */}
                        <td style={{ padding:"10px 14px", textAlign:"right", fontSize:13, fontWeight:600, color:"#2563EB" }}>
                          {b.distributed_qty.toLocaleString()}
                        </td>

                        {/* Remaining — big green/red */}
                        <td style={{ padding:"10px 14px", textAlign:"right" }}>
                          <div style={{ fontSize:16, fontWeight:900, color: isLow?"#CF291D":"#16a34a" }}>
                            {b.remaining_qty.toLocaleString()}
                          </div>
                          {b.total_qty > 0 && (
                            <div style={{ height:4, background:"#F3F4F6", borderRadius:999, marginTop:3, overflow:"hidden" }}>
                              <div style={{ height:"100%", borderRadius:999,
                                width:`${Math.min(100,(b.remaining_qty/b.total_qty)*100)}%`,
                                background: isLow?"#CF291D":"#16a34a", transition:"width 0.3s" }}/>
                            </div>
                          )}
                        </td>

                        {/* Unit price */}
                        <td style={{ padding:"10px 14px", textAlign:"right", fontSize:12, color:"#6B7280" }}>
                          Rs. {fmt(b.unit_price)}
                        </td>

                        {/* Status */}
                        <td style={{ padding:"10px 14px", textAlign:"center" }}>
                          <span style={{
                            display:"inline-block", padding:"4px 12px", borderRadius:20,
                            fontSize:11, fontWeight:700,
                            background: isLow?"#FEE2E2":"#DCFCE7",
                            color: isLow?"#CF291D":"#16a34a",
                            border: `1px solid ${isLow?"#FECACA":"#BBF7D0"}`,
                          }}>
                            {isLow ? "⚠ Low Stock" : "✓ In Stock"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setForm({ ...b })}
                              className="p-1.5 rounded-lg hover:opacity-80"
                              style={{ background: "#F0F4FF", color: "#3B82F6" }}
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(b.id!, b.game_name)}
                              className="p-1.5 rounded-lg hover:opacity-80"
                              style={{ background: "#FFF1F0", color: "#CF291D" }}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )} {/* end list view */}
      </div>
    </div>
  );
}

// ── Inventory Grid View ────────────────────────────────────────────────────────
function InventoryGridView({
  batches, filter, onGameClick
}: {
  batches: (InventoryBatch & { remaining_qty: number })[];
  filter: string;
  onGameClick: (name: string) => void;
}) {
  const fmt = (n: number) => n.toLocaleString();

  // Aggregate by game name across all batches
  const gameMap = new Map<string, { total: number; remaining: number; distributed: number; batches: number; unit_price: number }>();

  // Start with all 16 known games at zero
  for (const g of ALL_GAMES) {
    gameMap.set(g.name, { total: 0, remaining: 0, distributed: 0, batches: 0, unit_price: 32.5 });
  }
  // Fill with actual batch data
  for (const b of batches) {
    const existing = gameMap.get(b.game_name) ?? { total: 0, remaining: 0, distributed: 0, batches: 0, unit_price: b.unit_price };
    gameMap.set(b.game_name, {
      total:       existing.total + b.total_qty,
      remaining:   existing.remaining + b.remaining_qty,
      distributed: existing.distributed + b.distributed_qty,
      batches:     existing.batches + 1,
      unit_price:  b.unit_price,
    });
  }

  // Sort: in-stock first, then low-stock, then out-of-stock/no-stock
  const sorted = [...ALL_GAMES]
    .filter(g => !filter || g.name.toLowerCase().includes(filter.toLowerCase()))
    .map(g => ({ ...g, ...gameMap.get(g.name)! }))
    .sort((a, b) => {
      const statusA = a.remaining === 0 ? 2 : a.remaining < 200 ? 1 : 0;
      const statusB = b.remaining === 0 ? 2 : b.remaining < 200 ? 1 : 0;
      if (statusA !== statusB) return statusA - statusB;
      return b.remaining - a.remaining;
    });

  return (
    <div>
      {/* Board sections */}
      {(["NLB", "DLB"] as const).map(board => {
        const boardGames = sorted.filter(g => g.board === board);
        if (boardGames.length === 0) return null;
        return (
          <div key={board} style={{ marginBottom: 20 }}>
            <div style={{
              display:"flex", alignItems:"center", gap:10, padding:"10px 16px",
              background: board==="NLB"?"#EFF6FF":"#FFF7ED",
              borderRadius:"12px 12px 0 0",
              borderBottom: `2px solid ${board==="NLB"?"#2563EB":"#EA580C"}`,
            }}>
              <span style={{ fontSize:16 }}>{board==="NLB"?"📘":"📙"}</span>
              <span style={{ fontSize:13, fontWeight:800, color: board==="NLB"?"#1d4ed8":"#c2410c" }}>
                {board} — {board==="NLB"?"National Lottery Board":"Development Lottery Board"}
              </span>
              <span style={{ marginLeft:"auto", fontSize:11, color:"#6B7280" }}>
                {boardGames.filter(g=>g.remaining>0).length}/{boardGames.length} in stock
              </span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, padding:14, background:"#fff", borderRadius:"0 0 12px 12px", border:"1px solid #E5E7EB", borderTop:"none" }}>
              {boardGames.map(g => {
                const hasStock  = g.remaining > 0;
                const isLow     = g.remaining > 0 && g.remaining < 200;
                const noStock   = g.remaining === 0 && g.batches === 0;
                const soldOut   = g.remaining === 0 && g.batches > 0;
                return (
                  <button key={g.name} type="button"
                    onClick={() => g.batches > 0 ? onGameClick(g.name) : undefined}
                    style={{
                      display:"flex", flexDirection:"column", alignItems:"center",
                      padding:"16px 12px", borderRadius:12,
                      border: `2px solid ${hasStock ? (isLow?"#FDE68A":"#BBF7D0") : noStock?"#E5E7EB":"#FECACA"}`,
                      background: hasStock ? (isLow?"#FFFBEB":"#F0FFF4") : noStock?"#F9FAFB":"#FFF1F0",
                      cursor: g.batches>0?"pointer":"default",
                      transition:"all 0.15s",
                      opacity: noStock ? 0.6 : 1,
                      position:"relative",
                    }}
                    onMouseEnter={e => { if(g.batches>0) (e.currentTarget as HTMLElement).style.transform="translateY(-2px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform="translateY(0)"; }}>

                    {/* Status badge */}
                    <span style={{
                      position:"absolute", top:8, right:8,
                      padding:"2px 6px", borderRadius:20, fontSize:9, fontWeight:700,
                      background: hasStock?(isLow?"#FDE68A":"#DCFCE7"):noStock?"#F3F4F6":"#FEE2E2",
                      color: hasStock?(isLow?"#92400E":"#16A34A"):noStock?"#9CA3AF":"#DC2626",
                    }}>
                      {noStock?"No Stock":isLow?"Low":soldOut?"Sold Out":"✓ In Stock"}
                    </span>

                    {/* Ticket logo */}
                    <img src={resolveLogoUrl(g.name)} alt={g.name}
                      style={{ width:72, height:72, objectFit:"contain", borderRadius:10, marginBottom:8,
                               filter: (noStock||soldOut)?"grayscale(60%)":"none" }}
                      onError={e=>{(e.currentTarget as HTMLImageElement).src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Crect width='72' height='72' rx='10' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='32'%3E🎫%3C/text%3E%3C/svg%3E"}}/>

                    {/* Name */}
                    <div style={{ fontSize:11, fontWeight:700, color:"#111827", textAlign:"center", lineHeight:1.3, marginBottom:6 }}>
                      {g.name}
                    </div>

                    {/* Stock numbers */}
                    {g.batches > 0 ? (
                      <>
                        <div style={{ fontSize:20, fontWeight:900, color: hasStock?(isLow?"#D97706":"#16A34A"):"#CF291D" }}>
                          {fmt(g.remaining)}
                        </div>
                        <div style={{ fontSize:9, color:"#9CA3AF", marginTop:1 }}>available</div>
                        <div style={{ width:"100%", marginTop:6 }}>
                          <div style={{ background:"#F3F4F6", borderRadius:999, height:4, overflow:"hidden" }}>
                            <div style={{ height:"100%", borderRadius:999,
                              width:`${g.total>0?Math.min(100,(g.remaining/g.total)*100):0}%`,
                              background: isLow?"#F59E0B":"#16A34A", transition:"width 0.3s" }}/>
                          </div>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#9CA3AF", marginTop:2 }}>
                            <span>Sold: {fmt(g.distributed)}</span>
                            <span>Total: {fmt(g.total)}</span>
                          </div>
                        </div>
                        <div style={{ fontSize:9, color:"#6B7280", marginTop:4 }}>
                          {g.batches} batch{g.batches!==1?"es":""}
                          {g.batches>0 && <span style={{ color:"#2563EB", marginLeft:4 }}>click for details</span>}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize:11, color:"#9CA3AF", textAlign:"center", marginTop:4 }}>
                        No stock purchased yet
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Batch Detail Popup ────────────────────────────────────────────────────────
function BatchDetailPopup({
  gameName, onClose
}: {
  gameName: string;
  onClose: () => void;
}) {
  const [batchData, setBatchData] = React.useState<Awaited<ReturnType<typeof getBatchesForGame>>>([]);
  const [salesRows,  setSalesRows]  = React.useState<Record<number, any[]>>({});
  const [returnRows, setReturnRows] = React.useState<Record<number, any[]>>({});
  const [expandedBatch, setExpandedBatch] = React.useState<number | null>(null);
  const fmt = (n: number) => n.toLocaleString();

  React.useEffect(() => {
    getBatchesForGame(gameName).then(setBatchData).catch(() => {});
  }, [gameName]);

  async function loadSales(batchId: number) {
    if (salesRows[batchId]) { setExpandedBatch(expandedBatch===batchId?null:batchId); return; }
    const [sales, returns] = await Promise.all([
      getBatchSalesDetail(batchId).catch(()=>[]),
      getBatchReturns(batchId).catch(()=>[]),
    ]);
    setSalesRows(p => ({...p, [batchId]: sales}));
    setReturnRows(p => ({...p, [batchId]: returns}));
    setExpandedBatch(batchId);
  }

  const totalStock = batchData.reduce((s,b)=>s+b.total_qty,0);
  const totalSold  = batchData.reduce((s,b)=>s+b.sold_from_invoices,0);
  const totalLeft  = batchData.reduce((s,b)=>s+b.remaining_qty,0);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"#fff", borderRadius:16, width:"min(860px, 100%)", maxHeight:"85vh", display:"flex", flexDirection:"column",
          boxShadow:"0 20px 60px rgba(0,0,0,0.3)", animation:"modalIn 0.2s ease", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"14px 20px", background:"linear-gradient(135deg,#0F172A,#1E293B)", display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
          <img src={resolveLogoUrl(gameName)} alt="" style={{ width:52, height:52, objectFit:"contain", borderRadius:8, background:"#fff", padding:3 }}
            onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#F1F5F9" }}>{gameName}</div>
            <div style={{ fontSize:11, color:"#64748B" }}>
              {batchData.length} purchase batch{batchData.length!==1?"es":""} · click a batch for invoice details
            </div>
          </div>
          {/* Summary pills */}
          <div style={{ display:"flex", gap:8 }}>
            {[
              { label:"Total", val:totalStock, color:"#94A3B8" },
              { label:"Sold",  val:totalSold,  color:"#F87171" },
              { label:"Left",  val:totalLeft,  color:"#4ADE80" },
            ].map(p => (
              <div key={p.label} style={{ textAlign:"center", padding:"6px 12px", background:"rgba(255,255,255,0.07)", borderRadius:8 }}>
                <div style={{ fontSize:9, color:"#64748B", fontWeight:600, textTransform:"uppercase" }}>{p.label}</div>
                <div style={{ fontSize:15, fontWeight:900, color:p.color }}>{fmt(p.val)}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ border:"none", background:"rgba(255,255,255,0.1)", color:"#94A3B8", cursor:"pointer", borderRadius:6, width:28, height:28, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>

        {/* Batches */}
        <div style={{ flex:1, overflowY:"auto", padding:16 }}>
          {batchData.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px", color:"#9CA3AF", fontSize:13 }}>No purchase batches found for {gameName}</div>
          ) : batchData.map(b => (
            <div key={b.id} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, marginBottom:10, overflow:"hidden" }}>
              {/* Batch row */}
              <button type="button" onClick={() => loadSales(b.id)}
                style={{ display:"flex", alignItems:"center", width:"100%", padding:"12px 16px", border:"none", background:"#F8FAFC", cursor:"pointer", textAlign:"left", gap:16 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#111827", marginBottom:2 }}>
                    📦 Batch #{b.id} · {b.batch_date}
                  </div>
                  <div style={{ fontSize:11, fontFamily:"monospace", color:"#6B7280" }}>
                    <span style={{ color:"#2563EB" }}>{b.barcode_start}</span>
                    <span style={{ margin:"0 6px", color:"#9CA3AF" }}>→</span>
                    <span style={{ color:"#7C3AED" }}>{b.barcode_end}</span>
                    <span style={{ marginLeft:8, color:"#9CA3AF" }}>
                      Last ticket: <strong style={{ color:"#374151" }}>{lastTicketBarcode(b.barcode_end)}</strong>
                    </span>
                  </div>
                </div>
                {/* Progress */}
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                    <span style={{ color:"#6B7280" }}>Sold: <strong style={{ color:"#CF291D" }}>{fmt(b.sold_from_invoices)}</strong></span>
                    <span style={{ color:"#6B7280" }}>Remaining: <strong style={{ color:"#16A34A" }}>{fmt(b.remaining_qty)}</strong></span>
                    <span style={{ color:"#6B7280" }}>Total: <strong>{fmt(b.total_qty)}</strong></span>
                  </div>
                  <div style={{ background:"#F3F4F6", borderRadius:999, height:6, overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:999,
                      width:`${b.total_qty>0?(b.sold_from_invoices/b.total_qty*100):0}%`,
                      background:"#CF291D", transition:"width 0.3s" }}/>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"#2563EB", fontWeight:600, flexShrink:0 }}>
                  {expandedBatch===b.id?"▲ Hide":"▼ Sales"}
                </div>
              </button>

              {/* Sales detail */}
              {expandedBatch === b.id && (
                <div style={{ padding:"0 16px 14px" }}>
                  {!(b.id in salesRows) ? (
                    <div style={{ fontSize:11, color:"#9CA3AF", padding:"8px 0" }}>Loading…</div>
                  ) : (salesRows[b.id] ?? []).length === 0 ? (
                    <div style={{ fontSize:11, color:"#9CA3AF", padding:"8px 0" }}>No invoices issued from this batch yet</div>
                  ) : (
                    <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F9FAFB" }}>
                          {["Invoice #","Agent","Date","Barcode Start","Barcode End","Qty","Status"].map(h => (
                            <th key={h} style={{ padding:"5px 10px", textAlign:"left", fontWeight:700, color:"#6B7280", fontSize:10, textTransform:"uppercase", borderBottom:"1px solid #E5E7EB" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(salesRows[b.id]??[]).map((r:any,i:number) => (
                          <tr key={i} style={{ borderBottom:"1px solid #F9FAFB" }}>
                            <td style={{ padding:"6px 10px", fontFamily:"monospace", fontWeight:700, color:"#CF291D" }}>#{r.invoice_number}</td>
                            <td style={{ padding:"6px 10px", fontWeight:600, color:"#111827" }}>{r.agent_name}</td>
                            <td style={{ padding:"6px 10px", color:"#6B7280" }}>{r.invoice_date}</td>
                            <td style={{ padding:"6px 10px", fontFamily:"monospace", color:"#2563EB" }}>{r.barcode_start}</td>
                            <td style={{ padding:"6px 10px", fontFamily:"monospace", color:"#7C3AED" }}>{r.barcode_end}</td>
                            <td style={{ padding:"6px 10px", fontWeight:700, color:"#16A34A" }}>{r.qty.toLocaleString()}</td>
                            <td style={{ padding:"6px 10px" }}>
                              <span style={{ padding:"1px 7px", borderRadius:20, fontSize:9, fontWeight:700,
                                background:r.invoice_status==="paid"?"#DCFCE7":r.invoice_status==="confirmed"?"#DBEAFE":"#F3F4F6",
                                color:r.invoice_status==="paid"?"#16A34A":r.invoice_status==="confirmed"?"#2563EB":"#6B7280" }}>
                                {r.invoice_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:"#F9FAFB", borderTop:"1px solid #E5E7EB" }}>
                          <td colSpan={5} style={{ padding:"6px 10px", fontSize:10, color:"#6B7280", fontWeight:700 }}>
                            TOTAL SOLD FROM THIS BATCH
                          </td>
                          <td style={{ padding:"6px 10px", fontWeight:900, color:"#CF291D" }}>
                            {fmt((salesRows[b.id]??[]).reduce((s:number,r:any)=>s+r.qty,0))}
                          </td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                  {/* ── Agent Returns for this batch ── */}
                  {expandedBatch===b.id && (returnRows[b.id]??[]).length > 0 && (
                    <div style={{ padding:"0 16px 14px" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#D97706", textTransform:"uppercase",
                        letterSpacing:"0.06em", padding:"6px 0 4px", borderTop:"1px solid #FDE68A",
                        marginTop:4, display:"flex", alignItems:"center", gap:6 }}>
                        ↩ Agent Returns from this batch
                        <span style={{ background:"#FEF9C3", border:"1px solid #FDE68A",
                          borderRadius:20, padding:"1px 8px", fontSize:9 }}>
                          {(returnRows[b.id]??[]).reduce((s:number,r:any)=>s+r.qty,0).toLocaleString()} tickets back in stock
                        </span>
                      </div>
                      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
                        <thead>
                          <tr style={{ background:"#FFFBEB" }}>
                            {["Agent","Date","Barcode Start","Barcode End","Qty","Reason","Status"].map(h => (
                              <th key={h} style={{ padding:"4px 8px", textAlign:"left", fontWeight:700,
                                color:"#92400E", fontSize:9, textTransform:"uppercase",
                                borderBottom:"1px solid #FDE68A" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(returnRows[b.id]??[]).map((r:any,i:number) => (
                            <tr key={i} style={{ borderBottom:"1px solid #FFFBEB" }}>
                              <td style={{ padding:"5px 8px", fontWeight:600, color:"#92400E" }}>{r.agent_name}</td>
                              <td style={{ padding:"5px 8px", color:"#6B7280" }}>{r.return_date}</td>
                              <td style={{ padding:"5px 8px", fontFamily:"monospace", color:"#2563EB", fontSize:10 }}>{r.barcode_start}</td>
                              <td style={{ padding:"5px 8px", fontFamily:"monospace", color:"#7C3AED", fontSize:10 }}>{r.barcode_end}</td>
                              <td style={{ padding:"5px 8px", fontWeight:700, color:"#16A34A" }}>{r.qty.toLocaleString()}</td>
                              <td style={{ padding:"5px 8px", color:"#6B7280", textTransform:"capitalize" }}>{r.return_reason}</td>
                              <td style={{ padding:"5px 8px" }}>
                                <span style={{ padding:"1px 7px", borderRadius:20, fontSize:9, fontWeight:700,
                                  background:r.status==="settled"?"#DCFCE7":"#FEF9C3",
                                  color:r.status==="settled"?"#16A34A":"#92400E" }}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}`}</style>
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

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
