import { useEffect, useState } from "react";
import { RefreshCw, Search, Pencil, CheckCircle, X, FileText, AlertTriangle } from "lucide-react";
import {
  getInvoices,
  confirmInvoice,
  cancelInvoice,
  getCompanySettings,
  getInvoiceWithItems,
} from "../services/database";
import type { Invoice, CompanySettings } from "../types";
import InvoiceA4Preview, { STATUS_COLORS } from "./shared/InvoiceA4Preview";

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; } catch { return d; }
}
function fmtRs(n: number) {
  return new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}


interface Props {
  onNavigate: (view: import("../types").View, id?: number) => void;
}

// ── Tri-lingual confirm dialog ────────────────────────────────────────────────
const CONFIRM_LANGS = [
  {
    code: "EN",
    title: "Confirm Invoice",
    body: "Once confirmed, this invoice cannot be edited. The agent's outstanding balance will be updated and stock will be deducted from inventory. Are you sure you want to proceed?",
    agree: "Yes, Confirm Invoice",
    cancel: "Cancel",
  },
  {
    code: "සිංහල",
    title: "ඉන්වොයිස් තහවුරු කරන්න",
    body: "තහවුරු කළ පසු, මෙම ඉන්වොයිස් සංස්කරණය කළ නොහැක. නියෝජිතයාගේ හිඟ ශේෂය යාවත්කාලීන කෙරෙන අතර ගබඩාවෙන් තොගය අඩු කෙරේ. ඔබ ඉදිරියට යාමට අදහස් කරනවාද?",
    agree: "ඔව්, ඉන්වොයිස් තහවුරු කරන්න",
    cancel: "අවලංගු කරන්න",
  },
  {
    code: "தமிழ்",
    title: "விலைப்பட்டியலை உறுதிப்படுத்தவும்",
    body: "உறுதிப்படுத்தப்பட்டால், இந்த விலைப்பட்டியலை திருத்த முடியாது. முகவரின் நிலுவைத் தொகை புதுப்பிக்கப்படும் மற்றும் சரக்கிலிருந்து பங்கு குறைக்கப்படும். தொடர விரும்புகிறீர்களா?",
    agree: "ஆம், விலைப்பட்டியலை உறுதிப்படுத்தவும்",
    cancel: "ரத்து செய்",
  },
] as const;

function ConfirmInvoiceDialog({
  invoiceNumber,
  onConfirm,
  onCancel,
}: {
  invoiceNumber: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [langIdx, setLangIdx] = useState(0);
  const lang = CONFIRM_LANGS[langIdx];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, width: 420, boxShadow: "0 16px 60px rgba(0,0,0,0.3)", overflow: "hidden", animation: "modalIn 0.2s ease" }}>
        {/* Red top bar */}
        <div style={{ height: 4, background: "linear-gradient(90deg,#2563EB,#1D4ED8)" }} />

        {/* Header */}
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} color="#2563EB" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{lang.title}</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>Invoice #{invoiceNumber}</div>
            </div>
          </div>
          {/* Language selector */}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {CONFIRM_LANGS.map((l, i) => (
              <button key={l.code} onClick={() => setLangIdx(i)}
                style={{ padding: "3px 10px", border: `1px solid ${langIdx === i ? "#2563EB" : "#E5E7EB"}`, borderRadius: 6, background: langIdx === i ? "#EFF6FF" : "#fff", color: langIdx === i ? "#2563EB" : "#6B7280", fontSize: 11, fontWeight: langIdx === i ? 700 : 500, cursor: "pointer" }}>
                {l.code}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", background: "#FAFAFA" }}>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>{lang.body}</p>
        </div>

        {/* Actions */}
        <div style={{ padding: "12px 20px 16px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel}
            style={{ padding: "8px 18px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {lang.cancel}
          </button>
          <button onClick={onConfirm}
            style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle size={14} /> {lang.agree}
          </button>
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}


// ── DraftInvoices ─────────────────────────────────────────────────────────────

export default function DraftInvoices({ onNavigate }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filtered, setFiltered] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingConfirmId, setPendingConfirmId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [data, co] = await Promise.all([
      getInvoices("draft"),
      getCompanySettings(),
    ]);
    setInvoices(data);
    setFiltered(data);
    setCompany(co);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      invoices.filter(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(q) ||
          (inv.agent_name ?? "").toLowerCase().includes(q)
      )
    );
  }, [search, invoices]);

  async function handleSelect(inv: Invoice) {
    if (!inv.id) return;
    setSelectedId(inv.id);
    const full = await getInvoiceWithItems(inv.id);
    setSelectedInvoice(full);
  }

  function handleConfirm(id: number) {
    setPendingConfirmId(id);
  }

  async function doConfirm() {
    if (!pendingConfirmId) return;
    await confirmInvoice(pendingConfirmId);
    if (selectedId === pendingConfirmId) {
      setSelectedId(null);
      setSelectedInvoice(null);
    }
    setPendingConfirmId(null);
    load();
  }

  async function handleCancel(id: number) {
    await cancelInvoice(id);
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedInvoice(null);
    }
    load();
  }

  return (
    <>
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: "#F3F4F6" }}>
      {/* ── Left Panel ── */}
      <div
        style={{
          width: "380px",
          flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid #CF291D",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "15px", color: "#111827" }}>Draft Invoices</span>
              <span
                style={{
                  background: "#F3F4F6",
                  color: "#6B7280",
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  padding: "1px 8px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {filtered.length}
              </span>
            </div>
            <button
              onClick={load}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "5px 10px",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
                background: "#fff",
                color: "#6B7280",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice # or agent…"
              style={{
                width: "100%",
                padding: "6px 8px 6px 28px",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#111827",
                background: "#F9FAFB",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Invoice list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#9CA3AF", fontSize: "13px" }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#9CA3AF" }}>
              <Pencil size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              <div style={{ fontSize: "13px" }}>No draft invoices</div>
            </div>
          ) : (
            filtered.map((inv) => {
              const isSelected = selectedId === inv.id;
              const isHovered = hoveredId === inv.id;
              return (
                <div
                  key={inv.id}
                  onClick={() => handleSelect(inv)}
                  onMouseEnter={() => setHoveredId(inv.id ?? null)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    marginBottom: "4px",
                    cursor: "pointer",
                    border: isSelected ? "1px solid #BFDBFE" : "1px solid transparent",
                    background: isSelected ? "#EFF6FF" : isHovered ? "#F9FAFB" : "#fff",
                    borderLeft: isSelected ? "3px solid #2563EB" : "3px solid transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#CF291D" }}>
                      #{inv.invoice_number}
                    </div>
                    <span
                      style={{
                        background: STATUS_COLORS.draft.bg,
                        color: STATUS_COLORS.draft.color,
                        border: `1px solid ${STATUS_COLORS.draft.border}`,
                        borderRadius: "4px",
                        padding: "1px 7px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      Draft
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827", marginTop: "2px" }}>
                    {inv.agent_name ?? "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px", fontSize: "11px", color: "#6B7280" }}>
                    <span>{fmtDate(inv.invoice_date)}</span>
                    <span style={{ fontWeight: 600 }}>Rs. {fmtRs(inv.invoice_total)}</span>
                  </div>

                  {/* Hover actions */}
                  {(isHovered || isSelected) && (
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigate("edit-invoice", inv.id); }}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          border: "1px solid #D1D5DB",
                          borderRadius: "4px",
                          background: "#F9FAFB",
                          color: "#374151",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                        }}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConfirm(inv.id!); }}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          border: "1px solid #BFDBFE",
                          borderRadius: "4px",
                          background: "#DBEAFE",
                          color: "#2563EB",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                        }}
                      >
                        <CheckCircle size={11} /> Confirm
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancel(inv.id!); }}
                        style={{
                          padding: "4px 8px",
                          border: "1px solid #FECACA",
                          borderRadius: "4px",
                          background: "#FEE2E2",
                          color: "#DC2626",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel — A4 Preview ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "#F3F4F6",
          paddingBottom: selectedInvoice ? "80px" : "0",
        }}
      >
        {!selectedInvoice ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9CA3AF",
            }}
          >
            <FileText size={48} style={{ marginBottom: "12px", opacity: 0.35 }} />
            <div style={{ fontSize: "14px" }}>Select a draft invoice to preview</div>
          </div>
        ) : (
          <>
            {/* ── TOP action bar (always visible above the invoice) ── */}
            <div style={{
              position: "sticky", top: 0, zIndex: 20,
              background: "rgba(243,244,246,0.97)",
              backdropFilter: "blur(8px)",
              borderBottom: "1px solid #E5E7EB",
              padding: "10px 24px",
              display: "flex", gap: "8px", alignItems: "center",
              justifyContent: "space-between",
            }}>
              {/* Status badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "4px 12px", borderRadius: "6px",
                background: STATUS_COLORS.draft.bg,
                border: `1px solid ${STATUS_COLORS.draft.border}`,
                color: STATUS_COLORS.draft.color,
                fontSize: "12px", fontWeight: 700,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS.draft.color, display: "inline-block" }}/>
                DRAFT · #{selectedInvoice.invoice_number}
              </div>
              {/* Action buttons */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => onNavigate("edit-invoice", selectedInvoice.id)}
                  style={{ padding: "7px 16px", border: "1px solid #D1D5DB", borderRadius: "6px", background: "#FFFFFF", color: "#374151", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => handleConfirm(selectedInvoice.id!)}
                  style={{ padding: "7px 16px", border: "none", borderRadius: "6px", background: "#2563EB", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle size={13} /> Confirm Invoice
                </button>
                <button onClick={() => handleCancel(selectedInvoice.id!)}
                  style={{ padding: "7px 16px", border: "1px solid #FECACA", borderRadius: "6px", background: "#fff", color: "#DC2626", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>

            <div style={{ padding: "24px 24px 100px" }}>
              <div style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
                <InvoiceA4Preview
                  invoice={selectedInvoice}
                  company={company}
                  status="draft"
                />
              </div>
            </div>

            {/* Sticky BOTTOM actions bar (duplicate for easy access after scrolling) */}
            <div
              style={{
                position: "fixed",
                bottom: 0,
                left: "380px",
                right: 0,
                background: "#fff",
                borderTop: "2px solid #E5E7EB",
                padding: "10px 24px",
                display: "flex",
                gap: "10px",
                alignItems: "center",
                zIndex: 10,
              }}
            >
              <button
                onClick={() => onNavigate("edit-invoice", selectedInvoice.id)}
                style={{
                  padding: "8px 18px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "6px",
                  background: "#F9FAFB",
                  color: "#374151",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Pencil size={14} /> Edit Invoice
              </button>
              <button
                onClick={() => handleConfirm(selectedInvoice.id!)}
                style={{
                  padding: "8px 18px",
                  border: "none",
                  borderRadius: "6px",
                  background: "#2563EB",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <CheckCircle size={14} /> Confirm Invoice
              </button>
              <button
                onClick={() => handleCancel(selectedInvoice.id!)}
                style={{
                  padding: "8px 18px",
                  border: "1px solid #FECACA",
                  borderRadius: "6px",
                  background: "#fff",
                  color: "#DC2626",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <X size={14} /> Cancel Invoice
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    {pendingConfirmId !== null && (() => {
      const inv = invoices.find(i => i.id === pendingConfirmId) ?? selectedInvoice;
      return (
        <ConfirmInvoiceDialog
          invoiceNumber={inv?.invoice_number ?? String(pendingConfirmId)}
          onConfirm={doConfirm}
          onCancel={() => setPendingConfirmId(null)}
        />
      );
    })()}
    </>
  );
}
