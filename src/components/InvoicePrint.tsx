import { useEffect, useState } from "react";
import { Printer, ArrowLeft, Thermometer, FileText, MessageCircle } from "lucide-react";
import { getInvoiceWithItems, getCompanySettings } from "../services/database";
import type { Invoice, CompanySettings } from "../types";

interface Props {
  invoiceId: number;
  onBack: () => void;
}

type PrintMode = "a4" | "thermal";

export default function InvoicePrint({ invoiceId, onBack }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState<PrintMode>("a4");

  useEffect(() => {
    async function load() {
      const [inv, co] = await Promise.all([
        getInvoiceWithItems(invoiceId),
        getCompanySettings(),
      ]);
      setInvoice(inv);
      setCompany(co);
      setLoading(false);
    }
    load();
  }, [invoiceId]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading invoice…</div>;
  if (!invoice || !company) return <div className="p-8 text-center text-red-500">Invoice not found.</div>;

  const totalTickets = (invoice.items ?? []).reduce((s, it) => s + Number(it.qty), 0);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar */}
      <div className="no-print flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
          <ArrowLeft size={14} /> Back
        </button>

        {/* Print mode toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button onClick={() => setPrintMode("a4")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${printMode === "a4" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            <FileText size={14} /> A4
          </button>
          <button onClick={() => setPrintMode("thermal")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${printMode === "thermal" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            <Thermometer size={14} /> Thermal 80mm
          </button>
        </div>

        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          <Printer size={15} /> {printMode === "thermal" ? "Print Receipt" : "Print / Save PDF"}
        </button>
        {/* WhatsApp share */}
        <button
          onClick={() => {
            const fmtN = (n: number) => new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2 }).format(n);
            const msg = encodeURIComponent(
              `📋 *${company!.name}*\n*Invoice #${invoice!.invoice_number}*\n\n` +
              `Agent: ${invoice!.agent_name ?? ""}\nDate: ${invoice!.invoice_date}\n\n` +
              `Invoice Total: Rs. ${fmtN(invoice!.invoice_total)}\n` +
              `Cash Paid: Rs. ${fmtN(invoice!.cash_received)}\n` +
              `*Outstanding: Rs. ${fmtN(invoice!.outstanding_balance)}*\n\n` +
              `Please settle at your earliest. Thank you 🙏\n${company!.phone}`
            );
            window.open(`https://wa.me/?text=${msg}`, "_blank");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600"
        >
          <MessageCircle size={15} /> WhatsApp
        </button>
        <span className="text-sm text-gray-400">Invoice #{invoice.invoice_number}</span>
      </div>

      {/* Print area */}
      <div className="flex justify-center py-8 no-print-wrapper">
        {printMode === "a4" ? (
          <A4Layout invoice={invoice} company={company} totalTickets={totalTickets} fmt={fmt} />
        ) : (
          <ThermalLayout invoice={invoice} company={company} totalTickets={totalTickets} fmt={fmt} />
        )}
      </div>

      {/* Dynamic print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; margin: 0; }
          .no-print-wrapper { padding: 0 !important; display: block !important; }
          ${printMode === "a4" ? `
            @page { size: A4; margin: 10mm; }
            #print-a4 { box-shadow: none !important; width: 100% !important; }
          ` : `
            @page { size: 80mm auto; margin: 2mm; }
            #print-thermal { box-shadow: none !important; width: 76mm !important; margin: 0 auto; }
          `}
        }
      `}</style>
    </div>
  );
}

// ── A4 Layout ─────────────────────────────────────────────────────────────────

function A4Layout({ invoice, company, totalTickets, fmt }: {
  invoice: Invoice;
  company: CompanySettings;
  totalTickets: number;
  fmt: (n: number) => string;
}) {
  return (
    <div
      id="print-a4"
      className="bg-white shadow-xl"
      style={{ width: "210mm", minHeight: "297mm", padding: "12mm", fontFamily: "Arial, sans-serif", fontSize: "10pt" }}
    >
      {/* Company header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "15pt", fontWeight: "bold" }}>{company.name}</div>
        <div style={{ fontSize: "9pt" }}>{company.address}</div>
        <div style={{ fontSize: "11pt", fontWeight: "bold", marginTop: "4px", textDecoration: "underline" }}>INVOICE</div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "9pt" }}>
        <div>
          <div>Tel : {company.phone}</div>
          <div>Reg No: {company.nlb_reg} / {company.dlb_reg}{company.email ? `  Email: ${company.email}` : ""}</div>
          {invoice.agent_name && (
            <div style={{ marginTop: "4px" }}>
              AGENT : <strong>{invoice.agent_name}</strong>
              {(invoice.agent_nlb_reg || invoice.agent_dlb_reg) && (
                <span style={{ color: "#555", marginLeft: "4px" }}>
                  (Reg No: {invoice.agent_nlb_reg}, {invoice.agent_dlb_reg})
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>Prepared By : {invoice.prepared_by}</div>
          <div>Invoice No : <strong>{invoice.invoice_number}</strong></div>
          <div>Invoice Date : {fmtDate(invoice.invoice_date)}</div>
        </div>
      </div>

      {/* Items table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt", borderTop: "1.5px solid #333" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #333" }}>
            {["S/N", "Ticket Name", "Barcode Start", "Barcode End", "Qty", "Unit Price (Rs.)", "Value (Rs.)"].map((h, i) => (
              <th key={i} style={{ padding: "3px 4px", textAlign: i >= 4 ? "right" : "left", borderRight: i < 6 ? "1px solid #ccc" : undefined, fontWeight: "600" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(invoice.items ?? []).map((item, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "2px 4px", textAlign: "center", borderRight: "1px solid #ccc" }}>{i + 1}</td>
              <td style={{ padding: "2px 4px", borderRight: "1px solid #ccc" }}>{item.ticket_name}</td>
              <td style={{ padding: "2px 4px", fontFamily: "monospace", fontSize: "8pt", borderRight: "1px solid #ccc" }}>{item.barcode_start}</td>
              <td style={{ padding: "2px 4px", fontFamily: "monospace", fontSize: "8pt", borderRight: "1px solid #ccc" }}>{item.barcode_end}</td>
              <td style={{ padding: "2px 4px", textAlign: "right", borderRight: "1px solid #ccc" }}>
                {item.qty.toLocaleString()} {item.qty_unit}
              </td>
              <td style={{ padding: "2px 4px", textAlign: "right", borderRight: "1px solid #ccc" }}>{fmt(item.unit_price)}</td>
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{fmt(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
        <table style={{ fontSize: "9pt", minWidth: "280px" }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ padding: "1px 0", textAlign: "right", fontSize: "8pt", color: "#555" }}>
                {totalTickets.toLocaleString()} Tickets Total
              </td>
            </tr>
            <TotRow label="INVOICE TOTAL" value={fmt(invoice.invoice_total)} bold />
            <TotRow label="Current Outstanding Balance" value={fmt(invoice.prev_outstanding)} />
            <TotRow label="TOTAL PAYABLE" value={fmt(invoice.total_payable)} bold borderTop borderBottom />
            <TotRow label="CASH" value={fmt(invoice.cash_received)} />
            <TotRow label="DLB Winning Tickets" value={fmt(invoice.dlb_winning)} />
            <TotRow label="NLB Winning Tickets" value={fmt(invoice.nlb_winning)} />
            <TotRow label="OUTSTANDING BALANCE" value={fmt(invoice.outstanding_balance)} bold borderTop />
          </tbody>
        </table>
      </div>

      {/* Signature */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px", paddingTop: "8px", borderTop: "1px solid #ccc", fontSize: "8pt" }}>
        <div>Cash / Cheque / Winning Tickets Received and Checked By :
          <span style={{ display: "inline-block", width: "120px", borderBottom: "1px solid #333", marginLeft: "4px" }}></span>
        </div>
        <div>Tickets Received By :
          <span style={{ display: "inline-block", width: "120px", borderBottom: "1px solid #333", marginLeft: "4px" }}></span>
        </div>
      </div>
    </div>
  );
}

function TotRow({ label, value, bold, borderTop, borderBottom }: {
  label: string; value: string; bold?: boolean; borderTop?: boolean; borderBottom?: boolean;
}) {
  return (
    <tr style={{ borderTop: borderTop ? "1px solid #333" : undefined, borderBottom: borderBottom ? "1px solid #333" : undefined }}>
      <td style={{ padding: "2px 12px 2px 0", textAlign: "right", fontWeight: bold ? "bold" : "normal" }}>{label}</td>
      <td style={{ padding: "2px 0", textAlign: "right", fontWeight: bold ? "bold" : "normal" }}>{value}</td>
    </tr>
  );
}

// ── Thermal 80mm Layout ───────────────────────────────────────────────────────

function ThermalLayout({ invoice, company, totalTickets, fmt }: {
  invoice: Invoice;
  company: CompanySettings;
  totalTickets: number;
  fmt: (n: number) => string;
}) {
  const sep = "─".repeat(32);
  return (
    <div
      id="print-thermal"
      className="bg-white shadow-xl"
      style={{ width: "80mm", fontFamily: "'Courier New', Courier, monospace", fontSize: "9pt", padding: "4mm 3mm" }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{company.name}</div>
        <div style={{ fontSize: "8pt" }}>{company.address}</div>
        <div style={{ fontSize: "8pt" }}>Tel: {company.phone}</div>
        <div style={{ fontSize: "8pt" }}>Reg: {company.nlb_reg} / {company.dlb_reg}</div>
      </div>

      <div style={{ textAlign: "center", fontWeight: "bold", borderTop: "1px dashed #333", borderBottom: "1px dashed #333", padding: "2px 0", marginBottom: "4px" }}>
        INVOICE
      </div>

      {/* Invoice meta */}
      <div style={{ fontSize: "8pt", marginBottom: "4px" }}>
        <div>Invoice No: <strong>{invoice.invoice_number}</strong></div>
        <div>Date: {fmtDate(invoice.invoice_date)}</div>
        <div>Prepared By: {invoice.prepared_by}</div>
        {invoice.agent_name && <div>Agent: <strong>{invoice.agent_name}</strong></div>}
      </div>

      <div style={{ borderTop: "1px dashed #333", marginBottom: "4px" }} />

      {/* Items */}
      <div style={{ fontSize: "8pt", marginBottom: "4px" }}>
        {(invoice.items ?? []).map((item, i) => (
          <div key={i} style={{ marginBottom: "4px" }}>
            <div style={{ fontWeight: "bold" }}>{i + 1}. {item.ticket_name}</div>
            <div style={{ paddingLeft: "8px" }}>
              <div>BC: {item.barcode_start}</div>
              <div>    {item.barcode_end}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Qty: {item.qty.toLocaleString()} {item.qty_unit}</span>
                <span>@{fmt(item.unit_price)}</span>
              </div>
              <div style={{ textAlign: "right", fontWeight: "bold" }}>Rs. {fmt(item.value)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px dashed #333", marginBottom: "4px" }} />

      {/* Totals */}
      <div style={{ fontSize: "9pt" }}>
        <ThermalRow label={`${totalTickets.toLocaleString()} Tickets`} value="" />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <ThermalRow label="INVOICE TOTAL" value={`Rs.${fmt(invoice.invoice_total)}`} bold />
        <ThermalRow label="Prev Outstanding" value={`Rs.${fmt(invoice.prev_outstanding)}`} />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <ThermalRow label="TOTAL PAYABLE" value={`Rs.${fmt(invoice.total_payable)}`} bold />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <ThermalRow label="CASH" value={`Rs.${fmt(invoice.cash_received)}`} />
        <ThermalRow label="DLB Winning" value={`Rs.${fmt(invoice.dlb_winning)}`} />
        <ThermalRow label="NLB Winning" value={`Rs.${fmt(invoice.nlb_winning)}`} />
        <div style={{ borderTop: "1px dashed #333", margin: "2px 0" }} />
        <ThermalRow label="OUTSTANDING" value={`Rs.${fmt(invoice.outstanding_balance)}`} bold />
      </div>

      <div style={{ borderTop: "1px dashed #333", margin: "6px 0" }} />

      {/* Signatures */}
      <div style={{ fontSize: "7.5pt", marginBottom: "4px" }}>
        <div>Received & Checked By:</div>
        <div style={{ borderBottom: "1px solid #333", marginTop: "12px", marginBottom: "4px" }}></div>
        <div>Tickets Received By:</div>
        <div style={{ borderBottom: "1px solid #333", marginTop: "12px" }}></div>
      </div>

      <div style={{ textAlign: "center", fontSize: "7.5pt", marginTop: "8px", color: "#555" }}>
        {sep}
        <div>Thank You</div>
      </div>
    </div>
  );
}

function ThermalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? "bold" : "normal", padding: "1px 0" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
}
