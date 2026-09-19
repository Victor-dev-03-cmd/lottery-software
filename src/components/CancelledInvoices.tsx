import { useEffect, useState, useContext } from "react";
import { RefreshCw, Eye, RotateCcw, Trash2, Search } from "lucide-react";
import {
  getInvoices,
  deleteInvoice,
  getCompanySettings,
  getInvoiceWithItems,
} from "../services/database";
import { restoreInvoiceToDraft } from "../services/database";
import type { Invoice, InvoiceStatus, CompanySettings } from "../types";
import InvoiceA4Preview, { STATUS_COLORS } from "./shared/InvoiceA4Preview";
import { PinGuardContext } from "../App";

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; } catch { return d; }
}
function fmtRs(n: number) {
  return new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── CancelledInvoices ─────────────────────────────────────────────────────────

export default function CancelledInvoices() {
  const { requireAdminPin } = useContext(PinGuardContext);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filtered, setFiltered] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [data, co] = await Promise.all([
      getInvoices("cancelled"),
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

  async function openPreview(inv: Invoice) {
    if (!inv.id) return;
    setPreviewLoading(true);
    setPreviewInvoice(inv);
    const full = await getInvoiceWithItems(inv.id);
    if (full) setPreviewInvoice(full);
    setPreviewLoading(false);
  }

  async function handleRestore(id: number) {
    await restoreInvoiceToDraft(id);
    load();
  }

  async function handleDelete(id: number) {
    const ok = await requireAdminPin(
      "Admin PIN Required",
      "Permanently deleting an invoice requires administrator verification."
    );
    if (!ok) return;
    await deleteInvoice(id);
    if (previewInvoice?.id === id) setPreviewInvoice(null);
    setConfirmDelete(null);
    load();
  }

  return (
    <div style={{ background: "#F3F4F6", minHeight: "100%", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
              Cancelled Invoices
            </h1>
            <p style={{ fontSize: "13px", color: "#6B7280", margin: "3px 0 0" }}>
              Voided invoices — read-only archive
            </p>
          </div>
          <button
            onClick={load}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "7px 14px",
              border: "1px solid #E5E7EB",
              borderRadius: "6px",
              background: "#fff",
              color: "#374151",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginTop: "12px", maxWidth: "320px" }}>
          <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice # or agent…"
            style={{
              width: "100%",
              padding: "7px 10px 7px 30px",
              border: "1px solid #E5E7EB",
              borderRadius: "6px",
              fontSize: "13px",
              color: "#111827",
              background: "#fff",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: "8px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["Invoice #", "Date", "Agent", "Invoice Total", "Status", "Cancelled Date", "Actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: h === "Actions" ? "center" : "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "#9CA3AF" }}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>
                  No cancelled invoices
                </td>
              </tr>
            ) : (
              filtered.map((inv, idx) => {
                const sc = STATUS_COLORS.cancelled;
                const cancelledDate = inv.created_at ? fmtDate(inv.created_at.split("T")[0] ?? inv.created_at) : "—";
                return (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? "1px solid #F3F4F6" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#CF291D" }}>
                        #{inv.invoice_number}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{fmtDate(inv.invoice_date)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111827" }}>
                      {inv.agent_name ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>Rs. {fmtRs(inv.invoice_total)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "3px 9px",
                          background: sc.bg,
                          color: sc.color,
                          border: `1px solid ${sc.border}`,
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        ✕ Cancelled
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6B7280", fontSize: "12px" }}>
                      {cancelledDate}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                        {/* Preview */}
                        <button
                          onClick={() => openPreview(inv)}
                          title="Preview"
                          style={{
                            padding: "5px 8px",
                            border: "1px solid #E5E7EB",
                            borderRadius: "5px",
                            background: "#F9FAFB",
                            color: "#374151",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Eye size={14} />
                        </button>

                        {/* Restore to draft */}
                        <button
                          onClick={() => handleRestore(inv.id!)}
                          title="Restore to draft"
                          style={{
                            padding: "5px 8px",
                            border: "1px solid #BFDBFE",
                            borderRadius: "5px",
                            background: "#EFF6FF",
                            color: "#2563EB",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <RotateCcw size={14} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setConfirmDelete(inv.id!)}
                          title="Delete permanently"
                          style={{
                            padding: "5px 8px",
                            border: "1px solid #FECACA",
                            borderRadius: "5px",
                            background: "#FEE2E2",
                            color: "#DC2626",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Preview Modal */}
      {previewInvoice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            padding: "24px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewInvoice(null); }}
        >
          <div style={{ background: "#F3F4F6", borderRadius: "8px", overflow: "hidden", maxWidth: "230mm", width: "100%" }}>
            <div
              style={{
                background: "#fff",
                borderBottom: "1px solid #E5E7EB",
                padding: "10px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#111827" }}>
                Invoice #{previewInvoice.invoice_number}
                <span
                  style={{
                    marginLeft: "8px",
                    padding: "2px 8px",
                    background: "#FEE2E2",
                    color: "#DC2626",
                    border: "1px solid #FECACA",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}
                >
                  ✕ Cancelled
                </span>
              </span>
              <button
                onClick={() => setPreviewInvoice(null)}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "6px",
                  background: "#F9FAFB",
                  color: "#374151",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
            {previewLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>Loading…</div>
            ) : (
              <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}>
                <div style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <InvoiceA4Preview
                    invoice={previewInvoice}
                    company={company}
                    status={"cancelled" as InvoiceStatus}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "380px",
              width: "100%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#FEE2E2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={18} color="#DC2626" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "15px", color: "#111827" }}>
                  Permanently Delete Invoice
                </div>
                <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>
                  This action cannot be undone.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: "7px 16px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "6px",
                  background: "#F9FAFB",
                  color: "#374151",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{
                  padding: "7px 16px",
                  border: "none",
                  borderRadius: "6px",
                  background: "#DC2626",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Trash2 size={14} /> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
