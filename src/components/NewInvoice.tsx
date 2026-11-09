/**
 * NewInvoice — "Invoice Sub Agents" page.
 *
 * E-commerce cart-style layout with:
 *  • Agent-first workflow
 *  • Controlled unit-price selection (from lottery_games + agent_game_discounts)
 *  • Keyboard-driven entry (Enter moves through every field)
 *  • Auto-focus game picker after each item is added
 *  • "Add to Invoice" action label
 *  • No barcode fields
 *
 * All existing business logic (saveInvoice, confirmInvoice, outstanding balance,
 * discount, commission, edit-mode) is preserved unchanged.
 */

import { useEffect, useRef, useState } from "react";
import {
  AddCircle, Trash, Save2, Printer, Home2, ArrowRight2,
  GalleryAdd, TickCircle, Warning2,
} from "iconsax-react";
import TicketLogoPicker, { resolveLogoUrl } from "./TicketLogoPicker";
import { getCompanySettings, getInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE } from "../services/database";
import type { InvoiceTemplate } from "../services/database";
import type { CompanySettings, AgentGameDiscount } from "../types";
import {
  getAgents, getLotteryGames,
  getNextInvoiceNumber, resolveUniqueInvoiceNumber,
  getAgentLastOutstanding, saveInvoice, getInvoiceWithItems,
  getBatchesForGame, getAgentGameDiscounts,
} from "../services/database";
import type { Agent, LotteryGame, Invoice, InvoiceItem, View } from "../types";
import { getDrawNumber } from "../utils/drawNumbers";
import { useLanguage } from "../i18n";

interface Props {
  editInvoiceId?: number | null;
  onSaved: (id: number, view: View) => void;
}

type BatchInfo = Awaited<ReturnType<typeof getBatchesForGame>>[0];

interface PriceOption {
  label: string;
  value: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDraw(n: string | number | undefined): string {
  if (!n && n !== 0) return "";
  const s = String(n).replace(/\D/g, "");
  return s ? s.padStart(4, "0") : "";
}

const today = () => new Date().toISOString().split("T")[0];

function makeItem(
  game: LotteryGame, batch: BatchInfo, qty: number,
  discType: "pct" | "lkr", discVal: number, unitPrice: number
): InvoiceItem {
  const price   = unitPrice > 0 ? unitPrice : game.unit_price;
  const gross   = qty * price;
  const discAmt = discType === "pct"
    ? Math.round(gross * discVal / 100 * 100) / 100
    : Math.min(gross, discVal);
  const netValue = Math.round((gross - discAmt) * 100) / 100;
  return {
    ticket_name: game.name, barcode_start: "", barcode_end: "",
    qty, qty_unit: "Tickets", unit_price: price,
    value: Math.round(gross * 100) / 100,
    discount_pct: discType === "pct" ? discVal : 0,
    discount_amt: discAmt, net_value: netValue,
    purchase_batch_id: batch.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function NewInvoice({ editInvoiceId, onSaved }: Props) {
  const { t } = useLanguage();

  // ── Master data ────────────────────────────────────────────────────────────
  const [agents,          setAgents]          = useState<Agent[]>([]);
  const [games,           setGames]           = useState<LotteryGame[]>([]);
  const [agentDiscounts,  setAgentDiscounts]  = useState<AgentGameDiscount[]>([]);
  const [_company,        setCompany]         = useState<CompanySettings | null>(null);
  const [_template,       setTemplate]        = useState<InvoiceTemplate>(DEFAULT_INVOICE_TEMPLATE);

  // ── Invoice header ─────────────────────────────────────────────────────────
  const [invoiceNumber,   setInvoiceNumber]   = useState("");
  const [agentId,         setAgentId]         = useState<number | "">("");
  const [invoiceDate,     setInvoiceDate]     = useState(today());
  const [preparedBy,      setPreparedBy]      = useState("sameera");
  const [prevOutstanding, setPrevOutstanding] = useState(0);
  const [cashReceived,    setCashReceived]    = useState(0);
  const [dlbWinning,      setDlbWinning]      = useState(0);
  const [nlbWinning,      setNlbWinning]      = useState(0);
  const [deliveryRoute,   setDeliveryRoute]   = useState("");
  const [salesRep,        setSalesRep]        = useState("sameera");
  const [notes,           setNotes]           = useState("");
  const [creditWarning,   setCreditWarning]   = useState<string | null>(null);
  const [commissionPreview, setCommissionPreview] = useState(0);

  // ── Cart ───────────────────────────────────────────────────────────────────
  const [items,     setItems]     = useState<InvoiceItem[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  // pendingMode drives the mandatory confirmation dialog for Confirm and Print actions
  const [pendingMode, setPendingMode] = useState<"confirm" | "print" | null>(null);

  // ── Selector state ─────────────────────────────────────────────────────────
  const [selGameName,   setSelGameName]   = useState("");
  const [selBatches,    setSelBatches]    = useState<BatchInfo[]>([]);
  const [selBatch,      setSelBatch]      = useState<BatchInfo | null>(null);
  const [selQty,        setSelQty]        = useState(0);
  const [selUnitPrice,  setSelUnitPrice]  = useState(0);
  const [priceOptions,  setPriceOptions]  = useState<PriceOption[]>([]);
  const [selDiscType,   setSelDiscType]   = useState<"pct" | "lkr">("pct");
  const [selDiscVal,    setSelDiscVal]    = useState(0);
  const [logoPicker,    setLogoPicker]    = useState(false);
  const [stockError,    setStockError]    = useState<string | null>(null);
  const [batchLoading,  setBatchLoading]  = useState(false);

  // ── Batch lookup for cart items (edit mode) ────────────────────────────────
  const [cartBatches, setCartBatches] = useState<Record<number, BatchInfo>>({});

  // ── Keyboard navigation refs ───────────────────────────────────────────────
  const agentSelectRef = useRef<HTMLSelectElement>(null);
  const gamePickerRef  = useRef<HTMLButtonElement>(null);
  const qtyInputRef    = useRef<HTMLInputElement>(null);
  const priceInputRef  = useRef<HTMLInputElement>(null);
  const discountValRef = useRef<HTMLInputElement>(null);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [a, g, num, co, tpl, disc] = await Promise.all([
        getAgents(), getLotteryGames(), getNextInvoiceNumber(),
        getCompanySettings(), getInvoiceTemplate(), getAgentGameDiscounts(),
      ]);
      setAgents(a); setGames(g); setCompany(co); setTemplate(tpl);
      setAgentDiscounts(disc);
      if (!editInvoiceId) {
        const unique = await resolveUniqueInvoiceNumber(num);
        setInvoiceNumber(unique);
      }
    }
    init();
  }, [editInvoiceId]);

  // ── Load existing invoice for editing ──────────────────────────────────────
  useEffect(() => {
    if (!editInvoiceId) return;
    getInvoiceWithItems(editInvoiceId).then(async inv => {
      if (!inv) return;
      setInvoiceNumber(inv.invoice_number);
      setAgentId(inv.agent_id);
      setInvoiceDate(inv.invoice_date);
      setPreparedBy(inv.prepared_by);
      const live = await getAgentLastOutstanding(inv.agent_id).catch(() => inv.prev_outstanding ?? 0);
      setPrevOutstanding(Number(Math.max(0, live).toFixed(2)));
      setCashReceived(Number((inv.cash_received ?? 0).toFixed(2)));
      setDlbWinning(Number((inv.dlb_winning ?? 0).toFixed(2)));
      setNlbWinning(Number((inv.nlb_winning ?? 0).toFixed(2)));
      setDeliveryRoute(inv.delivery_route ?? "");
      setSalesRep(inv.sales_rep ?? inv.prepared_by ?? "sameera");
      const existItems = inv.items && inv.items.length > 0 ? inv.items : [];
      setItems(existItems);
      const batchMap: Record<number, BatchInfo> = {};
      for (const it of existItems) {
        if (it.purchase_batch_id) {
          const batches = await getBatchesForGame(it.ticket_name).catch(() => []);
          const b = batches.find(x => x.id === it.purchase_batch_id);
          if (b) batchMap[it.purchase_batch_id] = b;
        }
      }
      setCartBatches(batchMap);
      handleAgentChange(inv.agent_id);
    });
  }, [editInvoiceId]);

  // ── Auto-focus: qty after batch selected ──────────────────────────────────
  useEffect(() => {
    if (selBatch) setTimeout(() => qtyInputRef.current?.focus(), 60);
  }, [selBatch?.id]);

  // ── Agent change ───────────────────────────────────────────────────────────
  async function handleAgentChange(id: number) {
    setAgentId(id);
    const raw = await getAgentLastOutstanding(id);
    const outstanding = Number(Math.max(0, raw).toFixed(2));
    setPrevOutstanding(outstanding);
    const agent = agents.find(a => a.id === id);
    if (agent?.credit_limit && outstanding > agent.credit_limit * 0.9) {
      setCreditWarning(`⚠ Credit limit: Rs.${agent.credit_limit.toLocaleString()} — Outstanding Rs.${fmt(outstanding)} is ${outstanding >= agent.credit_limit ? "OVER limit" : "near limit"}`);
    } else {
      setCreditWarning(null);
    }
    // Keyboard: move focus to game picker
    setTimeout(() => gamePickerRef.current?.focus(), 80);
  }

  // ── Price options for a game + agent ──────────────────────────────────────
  function buildPriceOptions(gameName: string, forAgentId: number): PriceOption[] {
    const game = games.find(g => g.name === gameName);
    if (!game) return [];
    const opts: PriceOption[] = [
      { label: `Standard — Rs.${fmt(game.unit_price)}`, value: game.unit_price },
    ];
    const disc = agentDiscounts.find(
      d => d.agent_id === forAgentId && d.game_name === gameName
    );
    if (disc) {
      if (disc.custom_price && disc.custom_price > 0 && disc.custom_price !== game.unit_price) {
        opts.push({ label: `Agent Price — Rs.${fmt(disc.custom_price)}`, value: disc.custom_price });
      } else if (disc.discount_pct && disc.discount_pct > 0) {
        const discPrice = Math.round(game.unit_price * (1 - disc.discount_pct / 100) * 100) / 100;
        if (discPrice !== game.unit_price) {
          opts.push({ label: `${disc.discount_pct}% off — Rs.${fmt(discPrice)}`, value: discPrice });
        }
      }
    }
    return opts;
  }

  // ── Game selection ─────────────────────────────────────────────────────────
  async function selectGame(name: string) {
    setSelGameName(name);
    setSelBatch(null);
    setSelQty(0);
    setSelDiscVal(0);
    setStockError(null);
    setLogoPicker(false);
    // Compute price options
    const opts = buildPriceOptions(name, Number(agentId));
    setPriceOptions(opts);
    setSelUnitPrice(opts[0]?.value ?? 0);
    // Load batches
    setBatchLoading(true);
    try {
      const batches = await getBatchesForGame(name);
      const available = batches.filter(b => b.remaining_qty > 0);
      setSelBatches(available);
      // Auto-select if only one batch
      if (available.length === 1) {
        setSelBatch(available[0]);
        // useEffect will auto-focus qty after selBatch changes
      }
    } finally {
      setBatchLoading(false);
    }
  }

  function selectBatch(b: BatchInfo) {
    setSelBatch(b);
    setSelQty(0);
    setStockError(null);
    // Auto-focus handled by useEffect watching selBatch.id
  }

  // ── Quantity change ────────────────────────────────────────────────────────
  function handleSelQtyChange(val: number) {
    if (!selBatch) return;
    if (val > selBatch.remaining_qty) {
      setStockError(`Only ${selBatch.remaining_qty.toLocaleString()} tickets available in this batch.`);
      setSelQty(selBatch.remaining_qty);
    } else {
      setStockError(null);
      setSelQty(Math.max(0, val));
    }
  }

  // ── Add to Invoice ─────────────────────────────────────────────────────────
  function addToInvoice() {
    if (!selGameName || !selBatch) { alert("Select a game and a stock batch first."); return; }
    if (selQty <= 0) { alert("Enter a quantity greater than 0."); return; }
    if (selQty > selBatch.remaining_qty) {
      setStockError(`Only ${selBatch.remaining_qty.toLocaleString()} available.`);
      return;
    }
    const alreadyInInvoice = items
      .filter(it => it.purchase_batch_id === selBatch.id)
      .reduce((s, it) => s + it.qty, 0);
    if (alreadyInInvoice + selQty > selBatch.remaining_qty) {
      setStockError(`Adding ${selQty} to the ${alreadyInInvoice} already in invoice exceeds available stock (${selBatch.remaining_qty}).`);
      return;
    }
    const game = games.find(g => g.name === selGameName);
    if (!game) return;

    const newItem = makeItem(game, selBatch, selQty, selDiscType, selDiscVal, selUnitPrice);
    setItems(prev => [...prev, newItem]);
    setCartBatches(prev => ({ ...prev, [selBatch.id]: selBatch }));

    // Reset selector — keep agent, focus game picker for next item
    setSelGameName(""); setSelBatches([]); setSelBatch(null);
    setSelQty(0); setSelDiscVal(0); setSelDiscType("pct");
    setPriceOptions([]); setSelUnitPrice(0); setStockError(null);
    setTimeout(() => gamePickerRef.current?.focus(), 60);
  }

  // ── Update cart item ───────────────────────────────────────────────────────
  function updateCartItem(idx: number, field: "qty" | "unit_price" | "discount_pct" | "discount_amt", val: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: val };
      if (field === "qty") {
        const batchAvail = it.purchase_batch_id
          ? (cartBatches[it.purchase_batch_id]?.remaining_qty ?? Infinity)
          : Infinity;
        const otherQty = prev.filter((x, j) => j !== idx && x.purchase_batch_id === it.purchase_batch_id)
          .reduce((s, x) => s + x.qty, 0);
        next.qty = Math.min(val, Math.max(0, batchAvail - otherQty));
      }
      const gross = Math.round(next.qty * next.unit_price * 100) / 100;
      next.value = gross;
      let discAmt = 0;
      if ((next.discount_pct ?? 0) > 0) {
        discAmt = Math.round(gross * (next.discount_pct ?? 0) / 100 * 100) / 100;
      } else {
        discAmt = Math.min(gross, next.discount_amt ?? 0);
      }
      next.discount_amt = discAmt;
      next.net_value = Math.round((gross - discAmt) * 100) / 100;
      return next;
    }));
  }

  function removeCartItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Calculations ───────────────────────────────────────────────────────────
  const invoiceGross      = Number(items.reduce((s, it) => s + it.value, 0).toFixed(2));
  const discountTotal     = Number(items.reduce((s, it) => s + (it.discount_amt ?? 0), 0).toFixed(2));
  const invoiceTotal      = Number(items.reduce((s, it) => s + (it.net_value != null ? it.net_value : it.value), 0).toFixed(2));
  const totalPayable      = Number((invoiceTotal + prevOutstanding).toFixed(2));
  const totalPaid         = Number((cashReceived + dlbWinning + nlbWinning).toFixed(2));
  const rawBalance        = Number((totalPayable - totalPaid).toFixed(2));
  const outstandingBalance = Math.max(0, rawBalance);
  const totalTickets      = items.reduce((s, it) => s + Number(it.qty), 0);

  // Selector derived
  const selGross   = selQty * selUnitPrice;
  const selDiscAmt = selDiscType === "pct"
    ? Math.round(selGross * selDiscVal / 100 * 100) / 100
    : Math.min(selGross, selDiscVal);
  const selNet     = Math.round((selGross - selDiscAmt) * 100) / 100;

  // Commission preview
  useEffect(() => {
    if (!agentId) { setCommissionPreview(0); return; }
    import("../services/database").then(({ getCommissionSchemes }) =>
      getCommissionSchemes().then(schemes => {
        const s = schemes.find(x => x.agent_id === Number(agentId) && x.is_active)
                 ?? schemes.find(x => !x.agent_id && x.is_active);
        if (!s) { setCommissionPreview(0); return; }
        const rate = s.commission_type === "percentage"
          ? invoiceTotal * s.rate / 100
          : s.commission_type === "per_ticket"
          ? totalTickets * s.rate
          : s.rate;
        setCommissionPreview(Math.round(rate * 100) / 100);
      })
    );
  }, [agentId, invoiceTotal, totalTickets]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave(mode: "draft" | "confirm" | "print" = "draft") {
    setSaveError(null);
    if (!agentId) { alert("Please select an agent."); return; }
    if (!invoiceNumber.trim()) { alert("Invoice number is required."); return; }
    if (items.length === 0) { alert("Add at least one ticket line."); return; }
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (!it.ticket_name) continue;
      const batchAvail = it.purchase_batch_id
        ? cartBatches[it.purchase_batch_id]?.remaining_qty
        : undefined;
      if (batchAvail !== undefined && it.qty > batchAvail) {
        setSaveError(`Not enough stock for "${it.ticket_name}": need ${it.qty.toLocaleString()}, only ${batchAvail.toLocaleString()} available.`);
        return;
      }
      if (batchAvail === 0) {
        setSaveError(`"${it.ticket_name}" batch #${it.purchase_batch_id} is out of stock.`);
        return;
      }
    }
    setSaving(true);
    try {
      const existingStatus = editInvoiceId
        ? ((await import("../services/database").then(db => db.getInvoiceWithItems(editInvoiceId)))?.invoice_status ?? "draft")
        : undefined;
      const invoice: Invoice = {
        id: editInvoiceId ?? undefined,
        invoice_number: invoiceNumber, agent_id: Number(agentId),
        invoice_date: invoiceDate, prepared_by: preparedBy,
        invoice_total: invoiceTotal, prev_outstanding: prevOutstanding,
        total_payable: totalPayable, cash_received: cashReceived,
        dlb_winning: dlbWinning, nlb_winning: nlbWinning,
        outstanding_balance: outstandingBalance,
        delivery_route: deliveryRoute, sales_rep: salesRep,
        discount_total: discountTotal,
        invoice_status: editInvoiceId
          ? (existingStatus ?? "draft")
          : "draft",
        items: items.filter(it => it.ticket_name),
      };
      const id = await saveInvoice(invoice);
      if (mode === "confirm" || mode === "print") {
        const { confirmInvoice } = await import("../services/database");
        await confirmInvoice(id);
      }
      if (mode === "print") onSaved(id, "print" as View);
      else if (mode === "confirm") onSaved(id, "confirmed-invoices" as View);
      else onSaved(id, "draft-invoices" as View);
    } catch (e) {
      setSaveError(String(e).replace(/^Error: /, ""));
    } finally {
      setSaving(false);
    }
  }

  const selectedAgent = agents.find(a => a.id === Number(agentId));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F3F4F6", minHeight: "100%" }}>

      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home2 size={12} variant="Linear" color="currentColor" />
          <ArrowRight2 size={11} variant="Linear" color="currentColor" />
          <span>Sales</span>
          <ArrowRight2 size={11} variant="Linear" color="currentColor" />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>
            {editInvoiceId ? t("edit_invoice_title") : t("nav_new_invoice")}
          </span>
        </nav>
        <div className="flex gap-2 items-center">
          <button onClick={() => handleSave("draft")} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "#6B7280" }}>
            <Save2 size={14} variant="Linear" color="currentColor" />
            {saving ? "Saving…" : "Draft"}
          </button>
          <button onClick={() => setPendingMode("confirm")} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "#2563EB" }}>
            <TickCircle size={14} variant="Linear" color="currentColor" />
            Confirm
          </button>
          <button onClick={() => setPendingMode("print")} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "#374151" }}>
            <Printer size={14} variant="Linear" color="currentColor" /> Print
          </button>
        </div>
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="mx-6 mb-3 flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium"
          style={{ background: "#FCE8E6", border: "1px solid #FECACA", color: "#B91C1C" }}>
          <Warning2 size={16} variant="Linear" color="currentColor" className="mt-0.5 shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button className="font-bold ml-2" onClick={() => setSaveError(null)}>×</button>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-4 px-6 pb-8">

        {/* ════════ LEFT — Invoice Builder ════════ */}
        <div className="flex flex-col gap-4">

          {/* Invoice metadata */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
            <div className="px-4 py-3" style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)", borderBottom: "2px solid #4285F4" }}>
              <p className="font-bold text-sm text-white">
                {editInvoiceId ? t("edit_invoice_title") : t("nav_new_invoice")}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                {invoiceNumber || "—"} · {invoiceDate}
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Invoice #</label>
                  <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Date</label>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Prepared By</label>
                  <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Step 1 — Agent */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: `2px solid ${agentId ? "#34A853" : "#4285F4"}` }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #F3F4F6", background: agentId ? "#F0FFF4" : "#EFF6FF" }}>
              <p className="text-sm font-bold" style={{ color: agentId ? "#15803D" : "#1D4ED8" }}>
                {agentId ? `✓ Agent: ${selectedAgent?.name ?? ""}` : "Step 1 — Select Agent"}
              </p>
            </div>
            <div className="p-4">
              {/* Keyboard: Enter/change on agent → focus game picker */}
              <select ref={agentSelectRef} value={agentId}
                onChange={e => e.target.value ? handleAgentChange(Number(e.target.value)) : setAgentId("")}
                onKeyDown={e => {
                  if (e.key === "Enter" && agentId) {
                    e.preventDefault();
                    setTimeout(() => gamePickerRef.current?.focus(), 60);
                  }
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                style={{ border: `1px solid ${agentId ? "#34A853" : "#E8E8E8"}`, background: "#FAFAFA", color: "#1D1D1D" }}>
                <option value="">— Select Sub-agent —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {creditWarning && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "#FEF9C3", border: "1px solid #FDE68A", color: "#92400E" }}>
                  <Warning2 size={13} variant="Linear" color="currentColor" />
                  {creditWarning}
                </div>
              )}
            </div>
          </div>

          {/* Step 2 — Add to Invoice (visible only after agent selected) */}
          {agentId && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #4285F4" }}>
                <p className="text-sm font-bold" style={{ color: "#1D1D1D" }}>Step 2 — Add Tickets to Invoice</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                  Select game → batch → quantity → price → discount → <strong>Enter</strong>
                </p>
              </div>
              <div className="p-4 space-y-4">

                {/* Game picker — keyboard: Enter/Space opens picker */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>🎫 Game / Ticket</label>
                  {logoPicker && (
                    <TicketLogoPicker
                      currentValue={selGameName}
                      onSelect={name => selectGame(name)}
                      onClose={() => {
                        setLogoPicker(false);
                        // If a game was selected, focus will go to batch (via selectGame auto-select)
                        // Otherwise stay on game picker
                        if (!selGameName) gamePickerRef.current?.focus();
                      }} />
                  )}
                  <button ref={gamePickerRef} type="button"
                    onClick={() => setLogoPicker(true)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLogoPicker(true); }
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "8px 12px", borderRadius: 10, border: `2px solid ${selGameName ? "#2563EB" : "#E8E8E8"}`, background: selGameName ? "#EFF6FF" : "#FAFAFA", cursor: "pointer", textAlign: "left" }}>
                    {selGameName ? (
                      <>
                        <img src={resolveLogoUrl(selGameName)} alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6 }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>{selGameName}</div>
                          <div style={{ fontSize: 10, color: "#6B7280" }}>Enter or click to change</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <GalleryAdd size={18} variant="Linear" color="currentColor" style={{ color: "#9CA3AF" }} />
                        <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 600 }}>Press Enter or click to select a lottery ticket</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Batch picker */}
                {selGameName && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                      📦 Select Stock Batch
                      {batchLoading && <span style={{ marginLeft: 8, color: "#4285F4" }}>Loading…</span>}
                    </label>
                    {!batchLoading && selBatches.length === 0 ? (
                      <div className="px-4 py-3 rounded-lg text-sm font-semibold"
                        style={{ background: "#FEF9C3", border: "1px solid #FDE68A", color: "#92400E" }}>
                        ⚠ No stock available for {selGameName}. Add stock via Purchased from Nimalsiri first.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selBatches.map((b, bIdx) => {
                          const drawNo = fmtDraw(getDrawNumber(b.game_name, b.batch_date) || b.batch_number);
                          const isSel  = selBatch?.id === b.id;
                          return (
                            <button key={b.id} type="button"
                              onClick={() => selectBatch(b)}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); selectBatch(b); }
                                // Arrow keys navigate between batches
                                if (e.key === "ArrowDown" && bIdx < selBatches.length - 1) {
                                  e.preventDefault();
                                  (e.currentTarget.nextElementSibling as HTMLElement)?.focus();
                                }
                                if (e.key === "ArrowUp" && bIdx > 0) {
                                  e.preventDefault();
                                  (e.currentTarget.previousElementSibling as HTMLElement)?.focus();
                                }
                              }}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: `2px solid ${isSel ? "#4285F4" : "#E5E7EB"}`, borderRadius: 10, background: isSel ? "#EFF6FF" : "#F9FAFB", cursor: "pointer", textAlign: "left" }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 3 }}>
                                  {isSel && <span style={{ color: "#4285F4", marginRight: 5 }}>✓</span>}
                                  Batch #{b.id} · {b.batch_date}
                                  {drawNo && <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#2563EB", fontSize: 11, fontWeight: 700 }}>Draw #{drawNo}</span>}
                                </div>
                                <div style={{ fontSize: 10, color: "#6B7280" }}>
                                  {b.remaining_qty.toLocaleString()} available
                                </div>
                              </div>
                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontSize: 18, fontWeight: 900, color: b.remaining_qty < 50 ? "#EA4335" : "#16A34A" }}>
                                  {b.remaining_qty.toLocaleString()}
                                </div>
                                <div style={{ fontSize: 9, color: "#9CA3AF" }}>available</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Qty | Unit Price | Discount — compact three-column row */}
                {selBatch && (
                  <div className="grid grid-cols-3 gap-3">

                    {/* Quantity */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>
                        Qty <span style={{ fontWeight: 400 }}>/ {selBatch.remaining_qty.toLocaleString()}</span>
                      </label>
                      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${selQty > 0 ? "#34A853" : "#E8E8E8"}`, borderRadius: 8, overflow: "hidden", height: 38 }}>
                        <button onClick={() => handleSelQtyChange(Math.max(0, selQty - 1))} tabIndex={-1}
                          style={{ width: 28, height: 38, border: "none", background: selQty > 0 ? "#F0FFF4" : "#F9FAFB", color: selQty > 0 ? "#16A34A" : "#9CA3AF", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
                        <input ref={qtyInputRef} type="number" value={selQty || ""} min="0" max={selBatch.remaining_qty}
                          placeholder="0"
                          onChange={e => handleSelQtyChange(parseInt(e.target.value) || 0)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              // Qty → Unit Price
                              priceInputRef.current?.focus();
                            }
                          }}
                          style={{ flex: 1, minWidth: 0, height: 38, border: "none", borderLeft: "1px solid #E8E8E8", borderRight: "1px solid #E8E8E8", fontSize: 14, fontWeight: 800, textAlign: "center", outline: "none", background: selQty > 0 ? "#F0FFF4" : "#FFFFFF", color: selQty > 0 ? "#16A34A" : "#374151" }}
                          onFocus={e => e.target.select()} />
                        <button onClick={() => handleSelQtyChange(Math.min(selBatch.remaining_qty, selQty + 1))} tabIndex={-1}
                          style={{ width: 28, height: 38, border: "none", background: selQty > 0 ? "#F0FFF4" : "#F9FAFB", color: selQty > 0 ? "#16A34A" : "#9CA3AF", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
                      </div>
                    </div>

                    {/* Unit Price — editable numeric input */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Unit Price</label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9CA3AF", fontWeight: 600, pointerEvents: "none" as const }}>Rs.</span>
                        <input ref={priceInputRef} type="number" step="0.01" min="0"
                          value={selUnitPrice || ""}
                          placeholder={String(priceOptions[0]?.value ?? "0")}
                          onChange={e => setSelUnitPrice(parseFloat(e.target.value) || 0)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              // Unit Price → Discount
                              discountValRef.current?.focus();
                            }
                          }}
                          style={{ width: "100%", height: 38, paddingLeft: 28, paddingRight: 8, border: `1px solid ${selUnitPrice > 0 ? "#4285F4" : "#E8E8E8"}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#374151", background: selUnitPrice > 0 ? "#EFF6FF" : "#FAFAFA", outline: "none", textAlign: "right", boxSizing: "border-box" as const }}
                          onFocus={e => e.target.select()} />
                      </div>
                    </div>

                    {/* Discount */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Discount</label>
                      <div style={{ display: "flex", gap: 4 }}>
                        <select value={selDiscType}
                          onChange={e => { setSelDiscType(e.target.value as "pct" | "lkr"); setSelDiscVal(0); }}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); discountValRef.current?.focus(); } }}
                          style={{ width: 46, border: "1px solid #E8E8E8", borderRadius: 7, padding: "5px 4px", fontSize: 11, fontWeight: 600, color: "#374151", background: "#FAFAFA", outline: "none", cursor: "pointer", flexShrink: 0 }}>
                          <option value="pct">%</option>
                          <option value="lkr">Rs</option>
                        </select>
                        <input ref={discountValRef} type="number" min="0"
                          step={selDiscType === "pct" ? "0.1" : "1"}
                          max={selDiscType === "pct" ? 100 : undefined}
                          value={selDiscVal || ""}
                          placeholder="0"
                          onChange={e => setSelDiscVal(parseFloat(e.target.value) || 0)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              // Discount → Add to Invoice
                              if (selQty > 0 && selBatch && selGameName) addToInvoice();
                            }
                          }}
                          style={{ flex: 1, minWidth: 0, height: 38, border: `1px solid ${selDiscVal > 0 ? "#FBBF24" : "#E8E8E8"}`, borderRadius: 7, padding: "5px 8px", fontSize: 13, fontWeight: 700, color: "#92400E", background: selDiscVal > 0 ? "#FFFBEB" : "#FAFAFA", outline: "none", textAlign: "right" }}
                          onFocus={e => e.target.select()} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Stock error */}
                {stockError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}>
                    <Warning2 size={13} variant="Linear" color="currentColor" /> {stockError}
                  </div>
                )}

                {/* Line preview */}
                {selBatch && selQty > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                    <div className="text-xs" style={{ color: "#6B7280" }}>
                      {selQty.toLocaleString()} × Rs.{fmt(selUnitPrice)}
                      {selDiscAmt > 0 && <span style={{ color: "#D97706", marginLeft: 8 }}>− Rs.{fmt(selDiscAmt)}</span>}
                    </div>
                    <div className="text-base font-black" style={{ color: "#111827" }}>Rs.{fmt(selNet)}</div>
                  </div>
                )}

                {/* Add to Invoice — keyboard: triggered by Enter on discount field */}
                {selBatch && (
                  <button onClick={addToInvoice}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                    style={{ background: selQty > 0 ? "linear-gradient(135deg,#4285F4,#1A73E8)" : "#E5E7EB", color: selQty > 0 ? "#FFFFFF" : "#9CA3AF", cursor: selQty > 0 ? "pointer" : "not-allowed", boxShadow: selQty > 0 ? "0 4px 14px rgba(66,133,244,0.3)" : "none" }}>
                    <AddCircle size={16} variant="Linear" color="currentColor" />
                    Add to Invoice
                  </button>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ════════ RIGHT — Checkout Summary ════════ */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4" style={{ height: "fit-content", minWidth: 0 }}>
          {/* Editable invoice lines stay beside the ticket entry form, not below it. */}
          {/* Invoice items */}
          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
                <div style={{ width: 3, height: 16, borderRadius: 2, background: "#4285F4" }} />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5F6368" }}>
                  Invoice Items · {items.length} line{items.length !== 1 ? "s" : ""} · {totalTickets.toLocaleString()} tickets
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 312, overflowY: "auto", paddingRight: 3 }}>
              {items.map((it, idx) => {
                const batch  = it.purchase_batch_id ? cartBatches[it.purchase_batch_id] : undefined;
                const drawNo = batch ? fmtDraw(getDrawNumber(it.ticket_name, batch.batch_date) || batch.batch_number) : "";
                const maxQty = batch
                  ? Math.max(0, batch.remaining_qty - items.filter((x, j) => j !== idx && x.purchase_batch_id === it.purchase_batch_id).reduce((s, x) => s + x.qty, 0))
                  : Infinity;

                return (
                  <div key={idx} style={{ background: "#FFFFFF", borderRadius: 10, border: "1px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid #F3F4F6" }}>
                      <div style={{ width: 34, height: 34, borderRadius: 7, overflow: "hidden", background: "#F8FAFC", border: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img src={resolveLogoUrl(it.ticket_name)} alt="" style={{ width: 31, height: 31, objectFit: "contain" }}
                          onError={e => { (e.currentTarget as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' rx='7' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='20'%3E%F0%9F%8E%AB%3C/text%3E%3C/svg%3E"; }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>{it.ticket_name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                          {drawNo && <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 20, background: "#EFF6FF", color: "#2563EB", fontWeight: 700 }}>Draw #{drawNo}</span>}
                          {batch && <span style={{ fontSize: 10, color: "#9CA3AF" }}>Batch #{batch.id}</span>}
                        </div>
                      </div>
                      <button onClick={() => removeCartItem(idx)} tabIndex={-1}
                        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#EA4335", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <Trash size={13} variant="Linear" color="currentColor" />
                      </button>
                    </div>

                    {/* Card body */}
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,1fr) minmax(100px,1fr) minmax(106px,1fr)", alignItems: "start" }}>
                      <div style={{ padding: "9px 8px", borderRight: "1px solid #F3F4F6" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Quantity</div>
                        <div style={{ display: "flex", alignItems: "center", border: `1px solid ${it.qty > 0 ? "#34A853" : "#E5E7EB"}`, borderRadius: 8, overflow: "hidden", height: 34 }}>
                          <button onClick={() => updateCartItem(idx, "qty", Math.max(0, it.qty - 1))} tabIndex={-1}
                            style={{ width: 28, height: 34, border: "none", background: it.qty > 0 ? "#F0FFF4" : "#F9FAFB", color: it.qty > 0 ? "#34A853" : "#9AA0A6", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <input type="number" value={it.qty || ""} min="0" max={maxQty}
                            onChange={e => updateCartItem(idx, "qty", parseInt(e.target.value) || 0)}
                            style={{ width: 56, height: 34, border: "none", borderLeft: "1px solid #E8E8E8", borderRight: "1px solid #E8E8E8", fontSize: 13, fontWeight: 800, textAlign: "center", outline: "none", background: it.qty > 0 ? "#F0FFF4" : "#FFFFFF", color: it.qty > 0 ? "#16A34A" : "#374151" }}
                            onFocus={e => e.target.select()} />
                          <button onClick={() => updateCartItem(idx, "qty", Math.min(maxQty, it.qty + 1))} tabIndex={-1}
                            style={{ width: 28, height: 34, border: "none", background: it.qty > 0 ? "#F0FFF4" : "#F9FAFB", color: it.qty > 0 ? "#34A853" : "#9AA0A6", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      </div>
                      <div style={{ padding: "9px 8px", borderRight: "1px solid #F3F4F6" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Discount</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <select value={(it.discount_pct ?? 0) > 0 ? "pct" : "lkr"}
                            onChange={e => {
                              if (e.target.value === "pct") updateCartItem(idx, "discount_amt", 0);
                              else updateCartItem(idx, "discount_pct", 0);
                            }}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 6px", fontSize: 11, fontWeight: 600, color: "#374151", background: "#FAFAFA", outline: "none", cursor: "pointer" }}>
                            <option value="pct">%</option>
                            <option value="lkr">LKR</option>
                          </select>
                          <input type="number" min="0"
                            value={(it.discount_pct ?? 0) > 0 ? (it.discount_pct ?? 0) : (it.discount_amt ?? 0) || ""}
                            placeholder="0"
                            onChange={e => {
                              const v = parseFloat(e.target.value) || 0;
                              if ((it.discount_pct ?? 0) > 0) updateCartItem(idx, "discount_pct", v);
                              else updateCartItem(idx, "discount_amt", v);
                            }}
                            style={{ flex: 1, border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 6px", fontSize: 12, fontWeight: 700, color: "#92400E", background: ((it.discount_pct ?? 0) > 0 || (it.discount_amt ?? 0) > 0) ? "#FFFBEB" : "#FAFAFA", outline: "none", textAlign: "right" }}
                            onFocus={e => e.target.select()} />
                        </div>
                        {(it.discount_amt ?? 0) > 0 && (
                          <div style={{ fontSize: 9, color: "#D97706", marginTop: 3, fontWeight: 600 }}>− Rs.{fmt(it.discount_amt ?? 0)}</div>
                        )}
                      </div>
                      <div style={{ padding: "9px 8px", textAlign: "right" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Line Total</div>
                        {(it.discount_amt ?? 0) > 0 && (
                          <div style={{ fontSize: 11, color: "#9AA0A6", textDecoration: "line-through", marginBottom: 2 }}>Rs.{fmt(it.value)}</div>
                        )}
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#111827", letterSpacing: "-0.02em" }}>
                          Rs.{fmt(it.net_value != null ? it.net_value : it.value)}
                        </div>
                        {it.qty > 0 && <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 2 }}>{it.qty.toLocaleString()} × Rs.{it.unit_price}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}

              </div>

              <button onClick={() => { setSelGameName(""); setSelBatch(null); setSelQty(0); setTimeout(() => gamePickerRef.current?.focus(), 60); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px", borderRadius: 9, border: "2px dashed #DBEAFE", background: "#F8FAFF", color: "#4285F4", fontSize: 11, fontWeight: 700, cursor: "pointer", width: "100%" }}>
                <AddCircle size={16} variant="Linear" color="currentColor" /> + Add Another Game
              </button>
            </div>
          )}


          <div style={{ background: "#FFFFFF", borderRadius: 16, overflow: "hidden", border: "1px solid #E5E7EB", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>

            {/* Agent badge */}
            <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #F3F4F6", background: "linear-gradient(135deg,#F8FAFF,#EFF6FF)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1D1D1D" }}>
                {selectedAgent?.name ?? "No agent selected"}
              </div>
              <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 1 }}>Invoice #{invoiceNumber} · {invoiceDate}</div>
              {commissionPreview > 0 && (
                <div style={{ fontSize: 10, color: "#2563EB", marginTop: 2, fontWeight: 600 }}>
                  Est. commission: Rs.{fmt(commissionPreview)}
                </div>
              )}
            </div>

            {/* Totals + payment */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#6B7280" }}>Gross Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Rs.{fmt(invoiceGross)}</span>
              </div>
              {discountTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#D97706" }}>Total Discount</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#D97706" }}>− Rs.{fmt(discountTotal)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, paddingTop: 6, borderTop: "1px dashed #E5E7EB" }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>Invoice Total</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: "#111827", letterSpacing: "-0.02em" }}>Rs.{fmt(invoiceTotal)}</span>
              </div>
              {prevOutstanding > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: "#FEF9C3", border: "1px solid #FDE68A", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>+ Prev. Outstanding</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>Rs.{fmt(prevOutstanding)}</span>
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9CA3AF", marginBottom: 8 }}>Payments Received</div>
                {[
                  { label: "Cash Received", val: cashReceived, set: setCashReceived, color: "#16A34A" },
                  { label: "DLB Winning",   val: dlbWinning,   set: setDlbWinning,   color: "#2563EB" },
                  { label: "NLB Winning",   val: nlbWinning,   set: setNlbWinning,   color: "#7C3AED" },
                ].map(({ label, val, set, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "#6B7280", flex: 1 }}>{label}</span>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9CA3AF", fontWeight: 600, pointerEvents: "none" }}>Rs.</span>
                      <input type="number" step="0.01" value={val || ""} placeholder="0"
                        onChange={e => set(parseFloat(e.target.value) || 0)}
                        style={{ width: 100, paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6, border: `1px solid ${val > 0 ? color : "#E5E7EB"}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color, background: val > 0 ? `${color}10` : "#FAFAFA", outline: "none", textAlign: "right" }}
                        onFocus={e => e.target.select()} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 12px", borderRadius: 10, background: outstandingBalance > 0 ? "#FEF2F2" : "#F0FFF4", border: `1px solid ${outstandingBalance > 0 ? "#FECACA" : "#BBF7D0"}`, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: outstandingBalance > 0 ? "#B91C1C" : "#15803D", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {outstandingBalance > 0 ? "Balance Due" : "Fully Paid"}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: outstandingBalance > 0 ? "#EA4335" : "#34A853", letterSpacing: "-0.02em" }}>
                  Rs.{fmt(outstandingBalance)}
                </span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <input value={deliveryRoute} onChange={e => setDeliveryRoute(e.target.value)} placeholder="Delivery route (optional)"
                  style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#374151", background: "#FAFAFA", outline: "none", marginBottom: 6, boxSizing: "border-box" as const }} />
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
                  style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#374151", background: "#FAFAFA", outline: "none", resize: "none" as const, fontFamily: "inherit", boxSizing: "border-box" as const }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleSave("draft")} disabled={saving || items.length === 0}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: items.length === 0 ? "#E5E7EB" : "#6B7280", color: items.length === 0 ? "#9CA3AF" : "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: items.length === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Save2 size={13} variant="Linear" color="currentColor" /> Draft
                </button>
                <button onClick={() => setPendingMode("confirm")} disabled={saving || items.length === 0}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: items.length === 0 ? "#E5E7EB" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: items.length === 0 ? "#9CA3AF" : "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: items.length === 0 ? "not-allowed" : "pointer", boxShadow: items.length > 0 ? "0 3px 10px rgba(37,99,235,0.3)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <TickCircle size={13} variant="Bold" color="currentColor" /> Confirm
                </button>
                <button onClick={() => setPendingMode("print")} disabled={saving || items.length === 0}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: items.length === 0 ? "#E5E7EB" : "#374151", color: items.length === 0 ? "#9CA3AF" : "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: items.length === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Printer size={13} variant="Linear" color="currentColor" /> Print
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mandatory confirmation dialog ───────────────────────────────────────
          Shown before Confirm and Print. Satisfies the business rule:
          "Are you absolutely sure you want to confirm this invoice?"
          Cancel keeps the invoice as Draft; Yes proceeds with handleSave(mode).
      ─────────────────────────────────────────────────────────────────────────── */}
      {pendingMode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}>
          <div className="rounded-2xl shadow-2xl p-6 mx-4"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", maxWidth: 420, width: "100%" }}>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "#FEF9C3" }}>
                <Warning2 size={20} variant="Bold" color="#D97706" />
              </div>
              <div>
                <p className="font-bold text-sm mb-2" style={{ color: "#1D1D1D" }}>
                  Confirm Invoice #{invoiceNumber}?
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>
                  Once this invoice is confirmed, it <strong>cannot be edited again</strong>.
                  Stock will be deducted and the agent's outstanding balance will be updated.
                  Are you absolutely sure you want to continue?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingMode(null)}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#374151" }}>
                Cancel
              </button>
              <button
                onClick={() => { const m = pendingMode; setPendingMode(null); handleSave(m); }}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
                <TickCircle size={15} variant="Bold" color="currentColor" />
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
