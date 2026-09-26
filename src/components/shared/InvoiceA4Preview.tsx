/**
 * Professional A4 Invoice Preview
 * Design: Modern clean layout with Outfit font + Ajith Rohana branding
 * Used by: DraftInvoices, ConfirmedInvoices, CancelledInvoices
 */

import type { Invoice, InvoiceStatus, CompanySettings } from "../../types";

// ── Status palette ────────────────────────────────────────────────────────────
export const STATUS_COLORS: Record<InvoiceStatus, { bg: string; color: string; border: string; label: string }> = {
  draft:     { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB", label: "Draft"     },
  waiting:   { bg: "#FEF9C3", color: "#D97706", border: "#FDE68A", label: "Waiting"   },
  confirmed: { bg: "#DBEAFE", color: "#2563EB", border: "#BFDBFE", label: "Confirmed" },
  paid:      { bg: "#DCFCE7", color: "#16A34A", border: "#BBF7D0", label: "Paid"      },
  cancelled: { bg: "#FEE2E2", color: "#DC2626", border: "#FECACA", label: "Cancelled" },
};

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}

function fmtRs(n: number) {
  return new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── Totals row helper ─────────────────────────────────────────────────────────
function TRow({
  label, labelSi, value, bold, separator, accent, green,
}: {
  label: string; labelSi?: string; value: string;
  bold?: boolean; separator?: boolean; accent?: boolean; green?: boolean;
}) {
  const color = accent ? "#CF291D" : green ? "#16A34A" : bold ? "#111827" : "#4B5563";
  return (
    <tr style={{ borderTop: separator ? "1.5px solid #1A1A1A" : undefined }}>
      <td style={{
        padding: "3px 12px 3px 0", textAlign: "right",
        fontWeight: bold ? 700 : 400,
        fontSize: bold ? "9.5pt" : "9pt", color,
      }}>
        {label}
        {labelSi && (
          <span style={{ display: "block", fontSize: "8pt", fontWeight: 400, color: "#9CA3AF", lineHeight: 1.2 }}>
            {labelSi}
          </span>
        )}
      </td>
      <td style={{
        padding: "3px 0", textAlign: "right", minWidth: "120px",
        fontWeight: bold ? 800 : 500,
        fontSize: bold ? "10pt" : "9pt", color,
      }}>{value}</td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceA4Preview({
  invoice,
  company,
  status,
  primaryColor,
  logoSrc,
  postPayments = 0,
  settledReturns = 0,
}: {
  invoice: Invoice;
  company: CompanySettings | null;
  status: InvoiceStatus;
  primaryColor?: string;
  logoSrc?: string;
  postPayments?: number;
  settledReturns?: number;
}) {
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  const totalTickets = (invoice.items ?? []).reduce((s, it) => s + Number(it.qty), 0);
  const isDraft     = status === "draft";
  const isCancelled = status === "cancelled";
  const watermark   = isDraft ? "DRAFT" : isCancelled ? "CANCELLED" : null;
  const watermarkColor = isDraft ? "#9CA3AF" : "#DC2626";

  const ACCENT = primaryColor ?? "#CF291D";

  return (
    <div style={{
      width: "210mm",
      minHeight: "297mm",
      background: "#FFFFFF",
      fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif",
      fontSize: "10pt",
      color: "#111827",
      position: "relative",
      boxSizing: "border-box",
    }}>
      {/* Outfit font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');`}</style>

      {/* Diagonal watermark */}
      {watermark && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%) rotate(-30deg)",
          fontSize: "100px", fontWeight: 900, color: watermarkColor,
          opacity: 0.06, pointerEvents: "none", userSelect: "none",
          whiteSpace: "nowrap", zIndex: 0, letterSpacing: "0.12em",
        }}>
          {watermark}
        </div>
      )}

      {/* ── Red top accent bar ── */}
      <div style={{ height: "5px", background: `linear-gradient(90deg, ${ACCENT} 0%, #B50717 100%)` }} />

      <div style={{ padding: "16px 22px 20px", position: "relative", zIndex: 1 }}>

        {/* ── Row 1: Logo (right) + Company name (left) ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <div>
            <div style={{ fontSize: "20pt", fontWeight: 900, color: "#111827", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              {company?.name ?? "Ajith Rohana Enterprise"}
            </div>
            <div style={{ fontSize: "8pt", color: "#6B7280", marginTop: "5px", lineHeight: 1.6 }}>
              {company?.address && <div>{company.address}</div>}
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {company?.nlb_reg && <span><span style={{ color: "#9CA3AF" }}>NLB Reg: </span>{company.nlb_reg}</span>}
                {company?.dlb_reg && <span><span style={{ color: "#9CA3AF" }}>DLB Reg: </span>{company.dlb_reg}</span>}
                {company?.phone  && <span><span style={{ color: "#9CA3AF" }}>Tel: </span>{company.phone}</span>}
              </div>
            </div>
          </div>
          {/* Logo */}
          <img
            src={logoSrc ?? "/ajith_rohana_logo.png"}
            alt="Ajith Rohana"
            style={{ width: "130px", objectFit: "contain", maxHeight: "85px" }}
            onError={e => (e.currentTarget.style.display = "none")}
          />
        </div>

        {/* ── Row 2: Date + Invoice No (right) + Status (left) ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "14px", paddingBottom: "12px", borderBottom: `2px solid #F3F4F6` }}>
          {/* Status badge */}
          <span style={{
            padding: "5px 14px", borderRadius: "5px",
            background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`,
            fontSize: "9pt", fontWeight: 800, letterSpacing: "0.08em",
            display: "inline-flex", alignItems: "center", gap: "6px",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.color, display: "inline-block" }}/>
            {sc.label.toUpperCase()}
          </span>

          {/* Date + Invoice # */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "8pt", color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>DATE</div>
            <div style={{ fontSize: "11pt", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
              {fmtDate(invoice.invoice_date)}
            </div>
            <div style={{ fontSize: "8pt", color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>INVOICE NO</div>
            <div style={{ fontSize: "14pt", fontWeight: 900, color: ACCENT }}>
              #{invoice.invoice_number}
            </div>
          </div>
        </div>

        {/* ── Row 3: Bill To (left) + Delivery Info (right) ── */}
        <div style={{ display: "flex", gap: "24px", marginBottom: "14px" }}>
          {/* Bill To — includes name, address, phone, NLB/DLB reg */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "8pt", fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "5px" }}>
              Bill To
            </div>
            <div style={{ fontSize: "12pt", fontWeight: 800, color: "#111827", marginBottom: "3px" }}>
              {invoice.agent_name ?? "—"}
            </div>
            <div style={{ fontSize: "8.5pt", color: "#4B5563", lineHeight: 1.7 }}>
              {invoice.agent_address && (
                <div><span style={{ color: "#9CA3AF" }}>Address: </span>{invoice.agent_address}</div>
              )}
              {invoice.agent_phone && (
                <div><span style={{ color: "#9CA3AF" }}>Phone: </span><strong>{invoice.agent_phone}</strong></div>
              )}
              {invoice.agent_nlb_reg && (
                <div><span style={{ color: "#9CA3AF" }}>NLB Reg: </span>{invoice.agent_nlb_reg}</div>
              )}
              {invoice.agent_dlb_reg && (
                <div><span style={{ color: "#9CA3AF" }}>DLB Reg: </span>{invoice.agent_dlb_reg}</div>
              )}
            </div>
          </div>

          {/* Delivery / Sales Info */}
          {(invoice.delivery_route || invoice.sales_rep || invoice.prepared_by) && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "8pt", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "5px" }}>
                Delivery Info
              </div>
              {invoice.delivery_route && (
                <div style={{ fontSize: "8.5pt", color: "#4B5563", marginBottom: "2px" }}>
                  <span style={{ color: "#9CA3AF" }}>Route: </span>
                  <strong>{invoice.delivery_route}</strong>
                </div>
              )}
              {invoice.sales_rep && (
                <div style={{ fontSize: "8.5pt", color: "#4B5563", marginBottom: "2px" }}>
                  <span style={{ color: "#9CA3AF" }}>Sales Rep: </span>
                  <strong>{invoice.sales_rep}</strong>
                </div>
              )}
              {invoice.prepared_by && (
                <div style={{ fontSize: "8.5pt", color: "#4B5563" }}>
                  <span style={{ color: "#9CA3AF" }}>Prepared by: </span>
                  <strong>{invoice.prepared_by}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Items Table ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
          <thead>
            <tr style={{ background: ACCENT }}>
              {["NO", "DESCRIPTION", "BARCODE RANGE", "Q-TY", "UNIT PRICE", "SUBTOTAL"].map((h, i) => (
                <th key={h} style={{
                  padding: "8px 10px",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: "8pt",
                  letterSpacing: "0.06em",
                  textAlign: i >= 3 ? "right" : i === 0 ? "center" : "left",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#9CA3AF", fontSize: "9pt" }}>
                  No line items
                </td>
              </tr>
            ) : (
              (invoice.items ?? []).map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#FAFAFA" : "#FFFFFF", borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "7px 10px", textAlign: "center", fontSize: "9pt", fontWeight: 600, color: "#6B7280" }}>{i + 1}</td>
                  <td style={{ padding: "7px 10px", fontSize: "9pt", fontWeight: 600, color: "#111827" }}>{item.ticket_name}</td>
                  <td style={{ padding: "7px 10px", fontSize: "7.5pt", fontFamily: "monospace", color: "#6B7280" }}>
                    {item.barcode_start && item.barcode_end
                      ? <>{item.barcode_start}<br/>{item.barcode_end}</>
                      : "—"}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontSize: "9pt", color: "#374151" }}>
                    {item.qty.toLocaleString()} {item.qty_unit}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontSize: "9pt", color: "#374151" }}>
                    Rs. {fmtRs(item.unit_price)}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontSize: "9pt", fontWeight: 700, color: "#111827" }}>
                    Rs. {fmtRs(item.net_value ?? item.value)}
                  </td>
                </tr>
              ))
            )}
            {/* Ticket count row */}
            <tr style={{ background: "#F3F4F6" }}>
              <td colSpan={3} />
              <td colSpan={2} style={{ padding: "6px 10px", textAlign: "right", fontSize: "8pt", color: "#6B7280", fontWeight: 600 }}>
                {totalTickets.toLocaleString()} Tickets Total
              </td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* ── Totals (with Sinhala labels) ── */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <table style={{ minWidth: "300px" }}>
            <tbody>
              <TRow
                label="INVOICE TOTAL" labelSi="ඉන්වොයිස් මුළු මුදල"
                value={`Rs. ${fmtRs(invoice.invoice_total)}`} bold />
              {invoice.prev_outstanding > 0 && (
                <TRow
                  label="Previous Outstanding" labelSi="පෙර ශේෂ මුදල"
                  value={`Rs. ${fmtRs(invoice.prev_outstanding)}`} />
              )}
              <TRow
                label="TOTAL PAYABLE" labelSi="ගෙවිය යුතු මුළු මුදල"
                value={`Rs. ${fmtRs(invoice.total_payable)}`} bold separator />
              {invoice.cash_received > 0 && (
                <TRow
                  label="Cash Received (Delivery)" labelSi="බෙදාහැරීමේදී ලැබූ මුදල"
                  value={`Rs. ${fmtRs(invoice.cash_received)}`} />
              )}
              {invoice.dlb_winning > 0 && (
                <TRow
                  label="DLB Winning Tickets" labelSi="DLB ජයග්‍රාහී ටිකට්"
                  value={`Rs. ${fmtRs(invoice.dlb_winning)}`} />
              )}
              {invoice.nlb_winning > 0 && (
                <TRow
                  label="NLB Winning Tickets" labelSi="NLB ජයග්‍රාහී ටිකට්"
                  value={`Rs. ${fmtRs(invoice.nlb_winning)}`} />
              )}
              {postPayments > 0 && (
                <TRow
                  label="Settle Outstanding" labelSi="හිඟ මුදල් ගෙවීම"
                  value={`Rs. ${fmtRs(postPayments)}`} green />
              )}
              {settledReturns > 0 && (
                <TRow
                  label="Agent Return Amount" labelSi="නියෝජිත ආපසු ලබා දීම"
                  value={`Rs. ${fmtRs(settledReturns)}`} green />
              )}
              <TRow
                label={invoice.outstanding_balance <= 0 ? "FULLY PAID" : "OUTSTANDING BALANCE"}
                labelSi={invoice.outstanding_balance <= 0 ? "සම්පූර්ණයෙන් ගෙවා ඇත" : "හිඟ ශේෂ මුදල"}
                value={invoice.outstanding_balance <= 0 ? "Rs. 0.00" : `Rs. ${fmtRs(invoice.outstanding_balance)}`}
                bold accent separator />
            </tbody>
          </table>
        </div>

        {/* ── Signature line ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: "28px",
          paddingTop: "10px", borderTop: "1px solid #E5E7EB",
          fontSize: "8pt", color: "#6B7280",
        }}>
          <div>
            Cash / Cheque / Winning Tickets Received and Checked By:
            <span style={{ display: "inline-block", width: "90px", borderBottom: "1px solid #374151", marginLeft: "6px" }} />
          </div>
          <div>
            Tickets Received By:
            <span style={{ display: "inline-block", width: "90px", borderBottom: "1px solid #374151", marginLeft: "6px" }} />
          </div>
        </div>
      </div>

      {/* ── Bottom status ribbon ── */}
      <div style={{
        background: sc.bg, borderTop: `2px solid ${sc.border}`,
        padding: "7px 22px", display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: "8.5pt", fontWeight: 700, color: sc.color,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.color, display: "inline-block" }}/>
          {sc.label.toUpperCase()} · Invoice #{invoice.invoice_number}
        </div>
        <span style={{ fontSize: "8pt", fontWeight: 400, opacity: 0.7 }}>
          {company?.name ?? "Ajith Rohana Enterprise"} · Lottery Management System
        </span>
      </div>
    </div>
  );
}
