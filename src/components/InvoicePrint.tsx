import { useEffect, useRef, useState } from "react";
import { Printer, ArrowLeft, Thermometer, FileText, MessageCircle } from "lucide-react";
import {
  getInvoiceWithItems, getCompanySettings, getInvoicePaymentSummary,
  getInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE,
} from "../services/database";
import type { InvoiceTemplate } from "../services/database";
import type { Invoice, CompanySettings, InvoiceStatus } from "../types";
import InvoiceA4Preview from "./shared/InvoiceA4Preview";

interface Props {
  invoiceId: number;
  onBack: () => void;
}

type PrintMode = "a4" | "thermal";

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}

export default function InvoicePrint({ invoiceId, onBack }: Props) {
  const [invoice,  setInvoice]  = useState<Invoice | null>(null);
  const [company,  setCompany]  = useState<CompanySettings | null>(null);
  const [paySum,   setPaySum]   = useState({ post_payments: 0, settled_returns: 0 });
  const [template, setTemplate] = useState<InvoiceTemplate>(DEFAULT_INVOICE_TEMPLATE);
  const [loading,  setLoading]  = useState(true);
  const [printMode, setPrintMode] = useState<PrintMode>("a4");
  const [pdfBusy, setPdfBusy]   = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [inv, co, ps, tpl] = await Promise.all([
          getInvoiceWithItems(invoiceId),
          getCompanySettings(),
          getInvoicePaymentSummary(invoiceId),
          getInvoiceTemplate(),
        ]);
        setInvoice(inv);
        setCompany(co);
        setPaySum(ps);
        setTemplate(tpl);
      } finally { setLoading(false); }
    }
    load();
  }, [invoiceId]);

  async function handleDownloadPdf() {
    if (!previewRef.current || !invoice) return;
    setPdfBusy(true);
    try {
      // Dynamic import keeps html2pdf.js out of the main bundle until needed
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin:   [8, 8, 8, 8],
          filename: `invoice-${invoice.invoice_number}.pdf`,
          image:    { type: "jpeg", quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF:    { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(previewRef.current)
        .save();
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert("PDF download failed. Try Print / Save PDF from the browser dialog instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (loading) return <div className="p-8 text-center" style={{ color: "#9CA3AF" }}>Loading invoice…</div>;
  if (!invoice || !company) return <div className="p-8 text-center" style={{ color: "#CF291D" }}>Invoice not found.</div>;

  // Always show balance ≥ 0 — negative means overpayment (advance credit)
  const liveBalance = Math.max(0, invoice.outstanding_balance ?? 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9" }}>
      {/* ── Toolbar ── */}
      <div className="no-print flex items-center gap-3 px-5 py-2.5 bg-white border-b border-gray-200 shadow-sm">
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <ArrowLeft size={14} /> Back
        </button>

        {/* Mode toggle */}
        <div style={{ display: "flex", borderRadius: 8, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          {([["a4", "A4", <FileText size={13}/>], ["thermal", "Thermal 80mm", <Thermometer size={13}/>]] as const).map(([mode, label, icon]) => (
            <button key={mode} onClick={() => setPrintMode(mode as PrintMode)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: printMode === mode ? "#4285F4" : "#fff", color: printMode === mode ? "#fff" : "#6B7280" }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Download PDF — genuine A4 PDF using html2pdf.js */}
        {printMode === "a4" && (
          <button onClick={handleDownloadPdf} disabled={pdfBusy}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", border: "none", borderRadius: 8, background: pdfBusy ? "#9CA3AF" : "#4285F4", color: "#fff", fontSize: 13, fontWeight: 700, cursor: pdfBusy ? "wait" : "pointer" }}>
            {pdfBusy ? "Generating…" : "⬇ Download PDF"}
          </button>
        )}

        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Printer size={15} /> Print
        </button>

        {/* WhatsApp share */}
        <button
          onClick={() => {
            const msg = encodeURIComponent(
              `📋 *${company!.name}*\n*Invoice #${invoice!.invoice_number}*\n\n` +
              `Agent: ${invoice!.agent_name ?? ""}\nDate: ${fmtDate(invoice!.invoice_date)}\n\n` +
              `Invoice Total: Rs. ${fmt(invoice!.invoice_total)}\n` +
              `Cash Paid: Rs. ${fmt(invoice!.cash_received)}\n` +
              (liveBalance > 0
                ? `*Outstanding Balance: Rs. ${fmt(liveBalance)}*\n\nPlease settle at your earliest. Thank you 🙏`
                : `*Fully Settled ✅*\n\nThank you for your payment 🙏`) +
              `\n${company!.phone}`
            );
            window.open(`https://wa.me/?text=${msg}`, "_blank");
          }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "none", borderRadius: 8, background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <MessageCircle size={15} /> WhatsApp
        </button>

        <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>Invoice #{invoice.invoice_number}</span>

        {/* Live balance indicator */}
        <div style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: liveBalance > 0 ? "#FCE8E6" : "#E6F4EA",
          color: liveBalance > 0 ? "#EA4335" : "#34A853",
          border: `1px solid ${liveBalance > 0 ? "#F5C6C2" : "#CEEAD6"}` }}>
          {liveBalance > 0 ? `⚠ Balance: Rs. ${fmt(liveBalance)}` : "✓ Fully Paid"}
        </div>
      </div>

      {/* ── Print area ── */}
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
        {printMode === "a4" ? (
          <div ref={previewRef} style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}>
            <InvoiceA4Preview
              invoice={{ ...invoice, outstanding_balance: liveBalance }}
              company={company}
              status={(invoice.invoice_status ?? "paid") as InvoiceStatus}
              primaryColor={template.primaryColor}
              logoSrc={template.logoData || "/ajith_rohana_logo.png"}
              postPayments={paySum.post_payments}
              settledReturns={paySum.settled_returns}
              showBarcodes={template.showBarcodes}
              showDiscount={template.showDiscount}
              showRoute={template.showRoute}
              showSalesRep={template.showSalesRep}
              showCommission={template.showCommission}
              footerText={template.footerText}
            />
          </div>
        ) : (
          <ThermalLayout invoice={invoice} company={company} fmt={fmt} liveBalance={liveBalance} />
        )}
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          ${printMode === "a4" ? `
            @page { size: A4; margin: 8mm; }
          ` : `
            @page { size: 80mm auto; margin: 2mm; }
          `}
        }
      `}</style>
    </div>
  );
}

// ── Thermal 80mm Layout ───────────────────────────────────────────────────────

function ThermalLayout({ invoice, company, fmt, liveBalance }: {
  invoice: Invoice; company: CompanySettings;
  fmt: (n: number) => string; liveBalance: number;
}) {
  const totalTickets = (invoice.items ?? []).reduce((s, it) => s + Number(it.qty), 0);
  return (
    <div id="print-thermal" className="bg-white shadow-xl"
      style={{ width: "80mm", fontFamily: "'Courier New', Courier, monospace", fontSize: "9pt", padding: "4mm 3mm" }}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{company.name}</div>
        <div style={{ fontSize: "8pt" }}>{company.address}</div>
        <div style={{ fontSize: "8pt" }}>Tel: {company.phone}</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: "bold", borderTop: "1px dashed #333", borderBottom: "1px dashed #333", padding: "2px 0", marginBottom: 4 }}>INVOICE</div>
      <div style={{ fontSize: "8pt", marginBottom: 4 }}>
        <div>No: <strong>{invoice.invoice_number}</strong></div>
        <div>Date: {fmtDate(invoice.invoice_date)}</div>
        <div>Prepared: {invoice.prepared_by}</div>
        {invoice.agent_name && <div>Agent: <strong>{invoice.agent_name}</strong></div>}
      </div>
      <div style={{ borderTop: "1px dashed #333", marginBottom: 4 }} />
      <div style={{ fontSize: "8pt", marginBottom: 4 }}>
        {(invoice.items ?? []).map((item, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div style={{ fontWeight: "bold" }}>{i + 1}. {item.ticket_name}</div>
            <div style={{ paddingLeft: 8 }}>
              <div>BC: {item.barcode_start}</div>
              <div>    {item.barcode_end}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Qty: {item.qty.toLocaleString()} {item.qty_unit}</span>
                <span>@{fmt(item.unit_price)}</span>
              </div>
              <div style={{ textAlign: "right", fontWeight: "bold" }}>Rs. {fmt(item.net_value ?? item.value)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px dashed #333", marginBottom: 4 }} />
      <div style={{ fontSize: "9pt" }}>
        <TR l={`${totalTickets.toLocaleString()} Tickets`} v="" />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <TR l="INVOICE TOTAL"    v={`Rs.${fmt(invoice.invoice_total)}`}  bold />
        <TR l="Prev Outstanding" v={`Rs.${fmt(invoice.prev_outstanding)}`} />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <TR l="TOTAL PAYABLE"    v={`Rs.${fmt(invoice.total_payable)}`}   bold />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <TR l="CASH"             v={`Rs.${fmt(invoice.cash_received)}`} />
        <TR l="DLB Winning"      v={`Rs.${fmt(invoice.dlb_winning)}`} />
        <TR l="NLB Winning"      v={`Rs.${fmt(invoice.nlb_winning)}`} />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <TR l="OUTSTANDING" v={liveBalance > 0 ? `Rs.${fmt(liveBalance)}` : "FULLY PAID"} bold />
      </div>
      <div style={{ borderTop: "1px dashed #333", margin: "6px 0" }} />
      <div style={{ fontSize: "7.5pt", marginBottom: 4 }}>
        <div>Received & Checked By:</div>
        <div style={{ borderBottom: "1px solid #333", marginTop: 12, marginBottom: 4 }}></div>
        <div>Tickets Received By:</div>
        <div style={{ borderBottom: "1px solid #333", marginTop: 12 }}></div>
      </div>
      <div style={{ textAlign: "center", fontSize: "7.5pt", marginTop: 8, color: "#555" }}>
        {"─".repeat(32)}<div>Thank You</div>
      </div>
    </div>
  );
}

function TR({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? "bold" : "normal", padding: "1px 0" }}>
      <span>{l}</span><span>{v}</span>
    </div>
  );
}
