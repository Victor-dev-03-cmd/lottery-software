import { useEffect, useState } from "react";
import { RefreshCw, Eye, CheckCircle, X, Sparkles } from "lucide-react";
import {
  getInvoices,
  cancelInvoice,
  markInvoicePaid,
  getCompanySettings,
  getInvoiceWithItems,
  reconcilePaidInvoices,
} from "../services/database";
import type { Invoice, InvoiceStatus, CompanySettings } from "../types";
import InvoiceA4Preview, { STATUS_COLORS } from "./shared/InvoiceA4Preview";

interface Props { onNavigate: (view: import("../types").View, id?: number) => void; }
type TabFilter = "all" | "confirmed";

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; } catch { return d; }
}
function fmtRs(n: number) {
  return new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── ConfirmedInvoices ─────────────────────────────────────────────────────────

export default function ConfirmedInvoices({ onNavigate }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tab, setTab] = useState<TabFilter>("all");
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [data, co] = await Promise.all([
      getInvoices(["confirmed"]),
      getCompanySettings(),
    ]);
    setInvoices(data);
    setCompany(co);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function openPreview(inv: Invoice) {
    if (!inv.id) return;
    setPreviewLoading(true);
    setPreviewInvoice(inv);
    const full = await getInvoiceWithItems(inv.id);
    if (full) setPreviewInvoice(full);
    setPreviewLoading(false);
  }

  async function handleMarkPaid(id: number) {
    await markInvoicePaid(id);
    setPreviewInvoice(null);
    // Navigate to Paid Invoices page after marking paid
    onNavigate("invoices");
  }

  async function handleCancel(id: number) {
    await cancelInvoice(id);
    if (previewInvoice?.id === id) setPreviewInvoice(null);
    load();
  }

  const displayed = invoices.filter((inv) => {
    if (tab === "all") return true;
    return inv.invoice_status === tab;
  });

  const confirmedCount = invoices.length;

  // tabStyle removed — replaced with inline styles in the new split-screen layout

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: "#F3F4F6", overflow: "hidden" }}>

      {/* ── LEFT PANEL — Invoice List (380px) ── */}
      <div style={{
        width: "380px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        borderRight: "1px solid #CF291D",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", margin: 0 }}>
                Confirm / Waiting
              </h2>
              <p style={{ fontSize: "11px", color: "#9CA3AF", margin: "2px 0 0" }}>
                {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={async () => { await reconcilePaidInvoices(); load(); }}
                title="Auto-mark invoices as Paid if their outstanding balance is zero"
                style={{ padding: "5px 10px", border: "1px solid #BBF7D0", borderRadius: "6px", background: "#F0FDF4", color: "#16A34A", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                <Sparkles size={12} /> Auto-Reconcile
              </button>
              <button onClick={load} disabled={loading}
                style={{ padding: "5px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", background: "#F9FAFB", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>
          {/* Tab pills */}
          <div style={{ display: "flex", gap: "5px" }}>
            {[
              { key: "all" as TabFilter,       label: `All (${invoices.length})`,      color: "#374151" },
              { key: "confirmed" as TabFilter, label: `✓ Confirmed (${confirmedCount})`, color: "#2563EB" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 600,
                  cursor: "pointer", border: tab === t.key ? "none" : "1px solid #E5E7EB",
                  background: tab === t.key ? t.color : "#F9FAFB",
                  color: tab === t.key ? "#FFFFFF" : t.color,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable invoice list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Loading…</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No invoices found</div>
          ) : displayed.map((inv) => {
            const st = (inv.invoice_status ?? "confirmed") as InvoiceStatus;
            const sc = STATUS_COLORS[st] ?? STATUS_COLORS.confirmed;
            const outstanding = inv.outstanding_balance ?? 0;
            const isSelected = previewInvoice?.id === inv.id;
            return (
              <div key={inv.id}
                onClick={() => openPreview(inv)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #F3F4F6",
                  cursor: "pointer",
                  borderLeft: isSelected ? "4px solid #2563EB" : "4px solid transparent",
                  background: isSelected ? "#EFF6FF" : "transparent",
                  transition: "background 0.1s",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#CF291D", fontSize: "13px" }}>
                      #{inv.invoice_number}
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827", marginTop: "2px" }}>
                      {inv.agent_name ?? "—"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
                      {fmtDate(inv.invoice_date)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700,
                      background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, display: "inline-block" }}>
                      ✓ {sc.label}
                    </span>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: outstanding > 0 ? "#DC2626" : "#16A34A", marginTop: "4px" }}>
                      Rs. {fmtRs(outstanding)}
                    </div>
                  </div>
                </div>
                {/* Row actions on hover via separate button row */}
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }} onClick={e => e.stopPropagation()}>
                  {outstanding > 0 ? (
                    <button onClick={() => handleMarkPaid(inv.id!)}
                      style={{ flex: 1, padding: "5px 8px", border: "none", borderRadius: "5px", background: "#16A34A", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <CheckCircle size={11} /> Mark Paid
                    </button>
                  ) : (
                    <span style={{ flex: 1, padding: "5px 8px", borderRadius: "5px", background: "#DCFCE7", color: "#16A34A", fontSize: "11px", fontWeight: 700, textAlign: "center" }}>
                      Paid ✓
                    </span>
                  )}
                  <button onClick={() => handleCancel(inv.id!)}
                    style={{ padding: "5px 10px", border: "1px solid #FECACA", borderRadius: "5px", background: "#FEE2E2", color: "#DC2626", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL — Live A4 Preview ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!previewInvoice ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}>
            <Eye size={48} style={{ marginBottom: "12px", opacity: 0.3 }} />
            <div style={{ fontSize: "14px" }}>Select an invoice to preview</div>
            <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.7 }}>Click any invoice on the left</div>
          </div>
        ) : (
          <>
            {/* Top action bar — sticky */}
            <div style={{
              position: "sticky", top: 0, zIndex: 20,
              background: "rgba(243,244,246,0.97)", backdropFilter: "blur(8px)",
              borderBottom: "1px solid #E5E7EB", padding: "10px 24px",
              display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
            }}>
              {/* Status badge */}
              {(() => {
                const st = (previewInvoice.invoice_status ?? "confirmed") as InvoiceStatus;
                const sc = STATUS_COLORS[st] ?? STATUS_COLORS.confirmed;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 12px", borderRadius: "6px",
                    background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color, fontSize: "12px", fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.color, display: "inline-block" }}/>
                    {st === "waiting" ? "⏳ " : "✓ "}{sc.label} · #{previewInvoice.invoice_number}
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: "8px" }}>
                {(previewInvoice.outstanding_balance ?? 0) > 0 ? (
                  <button onClick={() => handleMarkPaid(previewInvoice.id!)}
                    style={{ padding: "7px 18px", border: "none", borderRadius: "6px", background: "#16A34A", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle size={14} /> Mark as Paid
                  </button>
                ) : (
                  <span style={{ padding: "7px 14px", borderRadius: "6px", background: "#DCFCE7", color: "#16A34A", fontSize: "13px", fontWeight: 700, border: "1px solid #BBF7D0" }}>
                    ✓ Fully Paid
                  </span>
                )}
                <button onClick={() => handleCancel(previewInvoice.id!)}
                  style={{ padding: "7px 16px", border: "1px solid #FECACA", borderRadius: "6px", background: "#fff", color: "#DC2626", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <X size={13} /> Cancel Invoice
                </button>
              </div>
            </div>

            {/* Full A4 preview — scrollable */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 40px", display: "flex", justifyContent: "center" }}>
              {previewLoading ? (
                <div style={{ padding: "60px", color: "#9CA3AF", fontSize: "14px" }}>Loading preview…</div>
              ) : (
                <div style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
                  <InvoiceA4Preview
                    invoice={previewInvoice}
                    company={company}
                    status={(previewInvoice.invoice_status ?? "confirmed") as InvoiceStatus}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── OLD TABLE (now replaced — keeping dummy tbody to close JSX correctly) ── */}
      {false && <table><tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "#9CA3AF" }}>
                  Loading…
                </td>
              </tr>
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "#9CA3AF" }}>
                  No invoices found
                </td>
              </tr>
            ) : (
              displayed.map((inv, idx) => {
                const st = (inv.invoice_status ?? "confirmed") as InvoiceStatus;
                const sc = STATUS_COLORS[st] ?? STATUS_COLORS.confirmed;
                const outstanding = inv.outstanding_balance ?? 0;
                return (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: idx < displayed.length - 1 ? "1px solid #F3F4F6" : undefined,
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
                    <td style={{ padding: "10px 14px", color: "#374151" }}>Rs. {fmtRs(inv.total_payable)}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>Rs. {fmtRs(inv.cash_received)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: outstanding > 0 ? 700 : 400, color: outstanding > 0 ? "#DC2626" : "#16A34A" }}>
                      Rs. {fmtRs(outstanding)}
                    </td>
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
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✓ {sc.label}
                      </span>
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

                        {/* Mark Paid */}
                        {outstanding > 0 ? (
                          <button
                            onClick={() => handleMarkPaid(inv.id!)}
                            style={{
                              padding: "5px 10px",
                              border: "1px solid #BBF7D0",
                              borderRadius: "5px",
                              background: "#DCFCE7",
                              color: "#16A34A",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <CheckCircle size={12} /> Mark Paid
                          </button>
                        ) : (
                          <span
                            style={{
                              padding: "5px 10px",
                              background: "#DCFCE7",
                              color: "#16A34A",
                              fontSize: "11px",
                              fontWeight: 600,
                              borderRadius: "5px",
                              border: "1px solid #BBF7D0",
                            }}
                          >
                            Paid ✓
                          </span>
                        )}

                        {/* Cancel */}
                        <button
                          onClick={() => handleCancel(inv.id!)}
                          title="Cancel invoice"
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
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody></table>}
    </div>
  );
}
