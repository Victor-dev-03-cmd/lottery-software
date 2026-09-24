import React, { useEffect, useState } from "react";
import { Plus, Trash2, X, Save, AlertTriangle, Package, RefreshCw, Calculator, Home, ChevronRight, Pencil } from "lucide-react";
import { resolveLogoUrl } from "./TicketLogoPicker";
import { calcEndBarcode, calcQtyFromBarcodes, isNumericBarcode } from "../utils/barcode";
import {
  getInventoryBatches,
  saveInventoryBatch,
  deleteInventoryBatch,
  getLotteryGames,
  syncInventoryFromTransactions,
} from "../services/database";
import type { InventoryBatch, LotteryGame } from "../types";

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
              style={{ width: 160 }}
            />
            <button
              onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
              title="Refresh">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            {/* Sync inventory from all transactions — fixes stale stock counts */}
            <button
              onClick={handleSync} disabled={syncing || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563eb" }}
              title="Recalculate stock from purchases, invoices & returns">
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""}/>
              Sync Stock
            </button>
            <button
              onClick={() => setForm(EMPTY())}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-all"
              style={{ background:"#F9FAFB", border:"1px solid #E5E7EB", color:"#6B7280" }}
              title="Manually add a batch — stock normally comes automatically from Stock Purchases"
            >
              <Plus size={14} /> Add Batch
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

        {/* Table card */}
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
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                    {["Game", "Batch No.", "Category", "Batch Date", "Barcode Range", "Ticket Range", "Books", "Total", "Distributed", "Remaining", "Warehouse", "Unit Price", "Status"].map((h) => (
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
                        width: 72,
                      }}
                    />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const isLow = b.remaining_qty <= b.low_stock_threshold;
                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-gray-50/60 transition-colors"
                        style={{
                          borderBottom: "1px solid #F9F9F9",
                          background: isLow ? "#FFF8F8" : undefined,
                        }}
                      >
                        <td className="px-3 py-2.5">
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <img src={resolveLogoUrl(b.game_name)} alt=""
                              style={{ width:52, height:52, objectFit:"contain", borderRadius:7, flexShrink:0, background:"#F3F4F6" }}
                              onError={e=>{(e.currentTarget as HTMLImageElement).src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38'%3E%3Crect width='38' height='38' rx='7' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='18'%3E🎫%3C/text%3E%3C/svg%3E"}}/>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color:"#111827", display:"flex", alignItems:"center", gap:5 }}>
                                {isLow && <AlertTriangle size={11} style={{ color:"#CF291D", flexShrink:0 }}/>}
                                {b.game_name}
                              </div>
                              <div style={{ fontSize:10, color:"#9CA3AF", marginTop:1 }}>
                                {b.game_name.toLowerCase().includes("nlb") || ["ada sampatha","dhana nidhanaya","govi setha","hada hana","mahajana sampatha","mega power","nlb jaya","suba dasawak"].some(n => b.game_name.toLowerCase().includes(n))
                                  ? <span style={{ color:"#1d4ed8", fontWeight:600 }}>📘 NLB</span>
                                  : <span style={{ color:"#c2410c", fontWeight:600 }}>📙 DLB</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: "#2563eb" }}>
                          {b.batch_number || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#7c3aed" }}>
                          {b.nlb_dlb_category
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background:"#F3E8FF", color:"#7c3aed" }}>{b.nlb_dlb_category}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>
                          {fmtDate(b.batch_date)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: "#6B7280" }}>
                          {b.barcode_start} → {b.barcode_end}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: "#9CA3AF" }}>
                          {b.ticket_start_no && b.ticket_end_no
                            ? `${b.ticket_start_no} → ${b.ticket_end_no}`
                            : b.barcode_start && b.barcode_end
                            ? <span style={{ color:"#6B7280" }}>{b.barcode_start} → {b.barcode_end}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-right" style={{ color: "#6B7280" }}>
                          {b.books_qty ? `${b.books_qty} × ${b.tickets_per_book ?? 100}` : (
                            b.total_qty > 0 && (b.tickets_per_book ?? 100) > 0
                              ? <span style={{ color:"#9CA3AF" }}>{Math.ceil(b.total_qty / (b.tickets_per_book ?? 100))} est.</span>
                              : "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>
                          {b.total_qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#3B82F6" }}>
                          {b.distributed_qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: isLow ? "#CF291D" : "#16a34a" }}>
                          {b.remaining_qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {b.warehouse_location
                            ? <span className="flex items-center gap-1">
                                <span>{b.warehouse_location}</span>
                                {b.rack_tag && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                  style={{ background:"#F3F4F6", color:"#6B7280" }}>{b.rack_tag}</span>}
                              </span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>
                          {fmt(b.unit_price)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
                            style={{ background: isLow ? "#CF291D" : "#16a34a" }}>
                            {isLow ? "Low Stock" : "In Stock"}
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

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
