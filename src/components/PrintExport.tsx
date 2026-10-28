/**
 * Print & Export — Report and PDF Center
 *
 * Three report types:
 *   1. Paid Invoices  — date-range filter on invoice_date, status = 'paid'
 *   2. Daily Summary  — single date filter on invoice_date
 *   3. Monthly Summary — year/month selector on invoice_date
 *
 * Date semantics: all reports use invoice_date (creation / delivery date).
 * Payment date (payments table) is a separate concept and is not mixed here.
 *
 * PDF: html2pdf.js (already bundled) via dynamic import — same pattern as InvoicePrint.tsx.
 * Print: window.print() with @media print CSS.
 */

import { useEffect, useRef, useState } from "react";
import {
  DocumentDownload, Printer, Home2, ArrowRight2, Refresh2,
  Warning2,
} from "iconsax-react";
import { getDb, getCompanySettings } from "../services/database";
import type { CompanySettings } from "../types";
import { useLanguage } from "../i18n";
import { EmptyReports } from "./illustrations";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = "paid-invoices" | "daily" | "monthly";

interface PaidInvoiceRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  agent_name: string | null;
  invoice_total: number;
  cash_received: number;
  dlb_winning: number;
  nlb_winning: number;
  outstanding_balance: number;
  discount_total: number;
}

interface DailySummary {
  date: string;
  invoice_count: number;
  invoice_total: number;
  collected: number;    // cash_received + dlb_winning + nlb_winning
  outstanding: number;
  discount_total: number;
  invoices: DailyInvoiceRow[];
}

interface DailyInvoiceRow {
  invoice_number: string;
  agent_name: string | null;
  invoice_total: number;
  collected: number;
  outstanding_balance: number;
  invoice_status: string;
}

interface MonthlySummary {
  month: string;         // "YYYY-MM"
  invoice_count: number;
  invoice_total: number;
  collected: number;
  outstanding: number;
  discount_total: number;
  daily: DailyBreakdown[];
}

interface DailyBreakdown {
  day: string;           // "YYYY-MM-DD"
  invoice_count: number;
  invoice_total: number;
  collected: number;
  outstanding: number;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  catch { return d; }
};

const fmtMonth = (ym: string) => {
  try {
    return new Date(ym + "-01T00:00:00")
      .toLocaleDateString("en-LK", { month: "long", year: "numeric" });
  } catch { return ym; }
};

// ── Database queries ──────────────────────────────────────────────────────────

async function fetchPaidInvoices(from: string, to: string): Promise<PaidInvoiceRow[]> {
  const d = await getDb();
  return d.select<PaidInvoiceRow[]>(`
    SELECT
      i.id,
      i.invoice_number,
      i.invoice_date,
      a.name AS agent_name,
      ROUND(i.invoice_total, 2)      AS invoice_total,
      ROUND(i.cash_received, 2)      AS cash_received,
      ROUND(i.dlb_winning, 2)        AS dlb_winning,
      ROUND(i.nlb_winning, 2)        AS nlb_winning,
      ROUND(MAX(0, i.outstanding_balance), 2) AS outstanding_balance,
      ROUND(COALESCE(i.discount_total, 0), 2) AS discount_total
    FROM invoices i
    LEFT JOIN agents a ON a.id = i.agent_id
    WHERE i.invoice_status = 'paid'
      AND i.invoice_date >= ?
      AND i.invoice_date <= ?
    ORDER BY i.invoice_date DESC, i.id DESC
  `, [from, to]);
}

async function fetchDailySummary(date: string): Promise<DailySummary | null> {
  const d = await getDb();
  const [totals, rows] = await Promise.all([
    d.select<{
      invoice_count: number;
      invoice_total: number;
      collected: number;
      outstanding: number;
      discount_total: number;
    }[]>(`
      SELECT
        COUNT(*)                                                      AS invoice_count,
        ROUND(COALESCE(SUM(invoice_total), 0), 2)                   AS invoice_total,
        ROUND(COALESCE(SUM(cash_received + dlb_winning + nlb_winning), 0), 2) AS collected,
        ROUND(COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE 0 END), 0), 2) AS outstanding,
        ROUND(COALESCE(SUM(COALESCE(discount_total, 0)), 0), 2)     AS discount_total
      FROM invoices
      WHERE date(invoice_date) = ?
        AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `, [date]),

    d.select<DailyInvoiceRow[]>(`
      SELECT
        i.invoice_number,
        a.name AS agent_name,
        ROUND(i.invoice_total, 2) AS invoice_total,
        ROUND(i.cash_received + i.dlb_winning + i.nlb_winning, 2) AS collected,
        ROUND(MAX(0, i.outstanding_balance), 2) AS outstanding_balance,
        COALESCE(i.invoice_status, 'paid') AS invoice_status
      FROM invoices i
      LEFT JOIN agents a ON a.id = i.agent_id
      WHERE date(i.invoice_date) = ?
        AND COALESCE(i.invoice_status, 'paid') NOT IN ('draft', 'cancelled')
      ORDER BY i.id ASC
    `, [date]),
  ]);

  if (!totals[0]) return null;
  return { date, ...totals[0], invoices: rows };
}

async function fetchMonthlySummary(ym: string): Promise<MonthlySummary | null> {
  const d = await getDb();
  const [totals, daily] = await Promise.all([
    d.select<{
      invoice_count: number;
      invoice_total: number;
      collected: number;
      outstanding: number;
      discount_total: number;
    }[]>(`
      SELECT
        COUNT(*)                                                      AS invoice_count,
        ROUND(COALESCE(SUM(invoice_total), 0), 2)                   AS invoice_total,
        ROUND(COALESCE(SUM(cash_received + dlb_winning + nlb_winning), 0), 2) AS collected,
        ROUND(COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE 0 END), 0), 2) AS outstanding,
        ROUND(COALESCE(SUM(COALESCE(discount_total, 0)), 0), 2)     AS discount_total
      FROM invoices
      WHERE strftime('%Y-%m', invoice_date) = ?
        AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
    `, [ym]),

    d.select<DailyBreakdown[]>(`
      SELECT
        date(invoice_date)                                                      AS day,
        COUNT(*)                                                                AS invoice_count,
        ROUND(COALESCE(SUM(invoice_total), 0), 2)                             AS invoice_total,
        ROUND(COALESCE(SUM(cash_received + dlb_winning + nlb_winning), 0), 2) AS collected,
        ROUND(COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE 0 END), 0), 2) AS outstanding
      FROM invoices
      WHERE strftime('%Y-%m', invoice_date) = ?
        AND COALESCE(invoice_status, 'paid') NOT IN ('draft', 'cancelled')
      GROUP BY date(invoice_date)
      ORDER BY day ASC
    `, [ym]),
  ]);

  if (!totals[0]) return null;
  return { month: ym, ...totals[0], daily };
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { onNavigate?: (view: import("../types").View) => void; }

export default function PrintExport({ onNavigate }: Props) {
  void onNavigate;
  void useLanguage(); // i18n infrastructure available; label wiring deferred

  const today      = new Date().toISOString().split("T")[0];
  const thisMonth  = today.substring(0, 7);

  const [report,     setReport]     = useState<ReportType>("paid-invoices");
  const [company,    setCompany]    = useState<CompanySettings | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [pdfBusy,    setPdfBusy]    = useState(false);

  // Paid Invoices filters
  const [piFrom, setPiFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [piTo,   setPiTo]   = useState(today);
  const [piData, setPiData] = useState<PaidInvoiceRow[] | null>(null);

  // Daily Summary filters
  const [dailyDate, setDailyDate] = useState(today);
  const [dailyData, setDailyData] = useState<DailySummary | null>(null);

  // Monthly Summary filters
  const [month,     setMonth]     = useState(thisMonth);
  const [monthData, setMonthData] = useState<MonthlySummary | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCompanySettings().then(setCompany).catch(() => {});
  }, []);

  // ── Load report ─────────────────────────────────────────────────────────────
  async function runReport() {
    setError("");
    setLoading(true);
    try {
      if (report === "paid-invoices") {
        const rows = await fetchPaidInvoices(piFrom, piTo);
        setPiData(rows);
      } else if (report === "daily") {
        const data = await fetchDailySummary(dailyDate);
        setDailyData(data);
      } else {
        const data = await fetchMonthlySummary(month);
        setMonthData(data);
      }
    } catch (e) {
      setError(`Failed to load report: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // Auto-load when filters change
  useEffect(() => { runReport(); }, [report, piFrom, piTo, dailyDate, month]);

  // ── PDF Download ─────────────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    if (!previewRef.current) return;
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      let filename = "report.pdf";
      if (report === "paid-invoices") filename = `paid-invoices-${piFrom}-to-${piTo}.pdf`;
      else if (report === "daily")    filename = `daily-summary-${dailyDate}.pdf`;
      else                            filename = `monthly-summary-${month}.pdf`;

      await html2pdf()
        .set({
          margin:   [10, 10, 10, 10],
          filename,
          image:    { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF:    { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(previewRef.current)
        .save();
    } catch (e) {
      alert(`PDF generation failed: ${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  }

  // ── Derived totals ───────────────────────────────────────────────────────────
  const piTotals = piData ? {
    count:       piData.length,
    invoiced:    piData.reduce((s, r) => s + r.invoice_total, 0),
    collected:   piData.reduce((s, r) => s + r.cash_received + r.dlb_winning + r.nlb_winning, 0),
    outstanding: piData.reduce((s, r) => s + r.outstanding_balance, 0),
    discount:    piData.reduce((s, r) => s + r.discount_total, 0),
  } : null;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const BRAND = "#4285F4";
  const hasData =
    (report === "paid-invoices" && piData && piData.length > 0) ||
    (report === "daily"         && dailyData) ||
    (report === "monthly"       && monthData && (monthData.invoice_count > 0));

  const reportLabel =
    report === "paid-invoices" ? "Paid Invoices" :
    report === "daily"         ? "Daily Summary" : "Monthly Summary";

  const reportSubtitle =
    report === "paid-invoices" ? `${fmtDate(piFrom)} – ${fmtDate(piTo)}` :
    report === "daily"         ? fmtDate(dailyDate) :
    fmtMonth(month);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F8F9FA", minHeight: "100%" }}>

      {/* ── Breadcrumb ── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9AA0A6" }}>
          <Home2 size={12} variant="Linear" color="#9AA0A6"/>
          <ArrowRight2 size={11} variant="Linear" color="#9AA0A6"/>
          <span className="font-semibold" style={{ color: "#202124" }}>Print & Export</span>
        </nav>
        <div className="flex gap-2">
          {hasData && (
            <>
              <button onClick={() => window.print()}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "#FFFFFF", border: "1px solid #E0E3E7", color: "#202124" }}>
                <Printer size={13} variant="Linear" color="currentColor"/> Print
              </button>
              <button onClick={handleDownloadPdf} disabled={pdfBusy}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: pdfBusy ? "#9CA3AF" : BRAND, color: "#fff", border: "none", cursor: pdfBusy ? "wait" : "pointer" }}>
                <DocumentDownload size={13} variant="Linear" color="currentColor"/>
                {pdfBusy ? "Generating…" : "Download PDF"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-6 pb-8 space-y-5">

        {/* ── Page heading ── */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#202124" }}>Print & Export</h1>
          <p className="text-xs mt-0.5" style={{ color: "#9AA0A6" }}>
            Select a report type, apply filters, then preview or download as PDF.
            All dates use the invoice date (delivery date).
          </p>
        </div>

        {/* ── Report selector + Filters ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm no-print"
          style={{ background: "#FFFFFF", border: "1px solid #E0E3E7" }}>

          {/* Report type tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #E0E3E7", gap: 0, padding: "0 8px" }}>
            {([
              { id: "paid-invoices", label: "Paid Invoices" },
              { id: "daily",         label: "Daily Summary"   },
              { id: "monthly",       label: "Monthly Summary" },
            ] as { id: ReportType; label: string }[]).map(tab => (
              <button key={tab.id} onClick={() => setReport(tab.id as ReportType)}
                className="flex items-center gap-1.5 text-sm transition-all whitespace-nowrap"
                style={{
                  padding: "11px 18px", border: "none", background: "transparent",
                  borderBottom: report === tab.id ? `2px solid ${BRAND}` : "2px solid transparent",
                  color: report === tab.id ? BRAND : "#5F6368",
                  fontWeight: report === tab.id ? 700 : 400,
                  cursor: "pointer", marginBottom: -1,
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="px-5 py-4 flex items-end gap-4 flex-wrap">
            {report === "paid-invoices" && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#9AA0A6" }}>
                    From (invoice date)
                  </label>
                  <input type="date" value={piFrom} onChange={e => setPiFrom(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border: `1.5px solid ${BRAND}`, background: "#EAF1FB", color: "#202124", fontWeight: 500 }}/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#9AA0A6" }}>
                    To (invoice date)
                  </label>
                  <input type="date" value={piTo} min={piFrom} onChange={e => setPiTo(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border: `1.5px solid ${BRAND}`, background: "#EAF1FB", color: "#202124", fontWeight: 500 }}/>
                </div>
              </>
            )}

            {report === "daily" && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#9AA0A6" }}>
                  Date (invoice date)
                </label>
                <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: `1.5px solid ${BRAND}`, background: "#EAF1FB", color: "#202124", fontWeight: 500 }}/>
              </div>
            )}

            {report === "monthly" && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#9AA0A6" }}>
                  Month
                </label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: `1.5px solid ${BRAND}`, background: "#EAF1FB", color: "#202124", fontWeight: 500 }}/>
              </div>
            )}

            <button onClick={runReport} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: loading ? "#E0E3E7" : BRAND, color: loading ? "#9AA0A6" : "#fff", border: "none", cursor: loading ? "not-allowed" : "pointer" }}>
              <Refresh2 size={14} variant="Linear" color="currentColor" className={loading ? "animate-spin" : ""}/>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl no-print"
            style={{ background: "#FCE8E6", border: "1px solid #F5C6C2", color: "#EA4335" }}>
            <Warning2 size={16} variant="Linear" color="#EA4335"/>
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* ── Loading state ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 animate-fade-in no-print">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-3"
              style={{ borderColor: `${BRAND} transparent ${BRAND} ${BRAND}` }}/>
            <p className="text-sm" style={{ color: "#9AA0A6" }}>Loading report…</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !hasData && (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in no-print">
            <EmptyReports size={100} className="mb-5 opacity-90"/>
            <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#202124" }}>No Data for This Period</h3>
            <p className="text-xs max-w-xs leading-relaxed" style={{ color: "#9AA0A6" }}>
              {report === "paid-invoices"
                ? "No paid invoices found in the selected date range."
                : report === "daily"
                ? `No invoices recorded for ${fmtDate(dailyDate)}.`
                : `No invoices recorded for ${fmtMonth(month)}.`}
            </p>
          </div>
        )}

        {/* ══ REPORT PREVIEW (also used by html2pdf) ══════════════════════════ */}
        {!loading && !error && hasData && (
          <div ref={previewRef}
            style={{ background: "#FFFFFF", fontFamily: "'Inter Variable','Inter','Segoe UI',system-ui,sans-serif" }}>

            {/* ── Report Header ── */}
            <div style={{ borderBottom: "2px solid #E0E3E7", padding: "20px 24px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#202124", marginBottom: 2 }}>
                    {company?.name ?? "Ajith Rohana Enterprise"}
                  </div>
                  <div style={{ fontSize: 11, color: "#5F6368" }}>
                    {company?.address && <span>{company.address} · </span>}
                    {company?.phone && <span>Tel: {company.phone}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: BRAND }}>{reportLabel}</div>
                  <div style={{ fontSize: 12, color: "#5F6368", marginTop: 2 }}>{reportSubtitle}</div>
                  <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 2 }}>
                    Generated: {new Date().toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── PAID INVOICES REPORT ── */}
            {report === "paid-invoices" && piData && piTotals && (
              <div style={{ padding: "16px 24px" }}>

                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Total Invoices",   value: String(piTotals.count),          color: BRAND },
                    { label: "Invoice Amount",    value: `Rs. ${fmt(piTotals.invoiced)}`,  color: "#202124" },
                    { label: "Collected",         value: `Rs. ${fmt(piTotals.collected)}`, color: "#34A853" },
                    { label: "Outstanding",       value: `Rs. ${fmt(piTotals.outstanding)}`, color: piTotals.outstanding > 0 ? "#EA4335" : "#34A853" },
                  ].map(c => (
                    <div key={c.label} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E3E7", background: "#F8F9FA" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{c.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* Invoices table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: BRAND }}>
                      {["Invoice #", "Date", "Agent", "Invoice Total", "Collected", "Outstanding", "Discount"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 10px", color: "#fff", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i >= 3 ? "right" : "left" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {piData.map((inv, i) => {
                      const collected = inv.cash_received + inv.dlb_winning + inv.nlb_winning;
                      return (
                        <tr key={inv.id} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FA", borderBottom: "1px solid #F1F3F4" }}>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: BRAND, fontFamily: "monospace", fontSize: 10 }}>#{inv.invoice_number}</td>
                          <td style={{ padding: "7px 10px", color: "#5F6368" }}>{fmtDate(inv.invoice_date)}</td>
                          <td style={{ padding: "7px 10px", color: "#202124", fontWeight: 500 }}>{inv.agent_name ?? "—"}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: "#202124", fontWeight: 600 }}>Rs. {fmt(inv.invoice_total)}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: "#34A853", fontWeight: 600 }}>Rs. {fmt(collected)}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: inv.outstanding_balance > 0 ? "#EA4335" : "#34A853", fontWeight: 600 }}>
                            {inv.outstanding_balance > 0 ? `Rs. ${fmt(inv.outstanding_balance)}` : "—"}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: "#5F6368" }}>
                            {inv.discount_total > 0 ? `Rs. ${fmt(inv.discount_total)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#374151", borderTop: `2px solid ${BRAND}` }}>
                      <td colSpan={3} style={{ padding: "8px 10px", color: "#E5E7EB", fontSize: 10, fontWeight: 700 }}>
                        TOTAL — {piTotals.count} invoice{piTotals.count !== 1 ? "s" : ""}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#fff", fontWeight: 800, fontSize: 12 }}>Rs. {fmt(piTotals.invoiced)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#86EFAC", fontWeight: 800, fontSize: 12 }}>Rs. {fmt(piTotals.collected)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: piTotals.outstanding > 0 ? "#FCA5A5" : "#86EFAC", fontWeight: 800, fontSize: 12 }}>
                        Rs. {fmt(piTotals.outstanding)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#E5E7EB", fontWeight: 700 }}>
                        {piTotals.discount > 0 ? `Rs. ${fmt(piTotals.discount)}` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── DAILY SUMMARY ── */}
            {report === "daily" && dailyData && (
              <div style={{ padding: "16px 24px" }}>

                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Invoices",      value: String(dailyData.invoice_count),          color: BRAND },
                    { label: "Invoice Total", value: `Rs. ${fmt(dailyData.invoice_total)}`,     color: "#202124" },
                    { label: "Collected",     value: `Rs. ${fmt(dailyData.collected)}`,         color: "#34A853" },
                    { label: "Outstanding",   value: `Rs. ${fmt(dailyData.outstanding)}`,       color: dailyData.outstanding > 0 ? "#EA4335" : "#34A853" },
                  ].map(c => (
                    <div key={c.label} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E3E7", background: "#F8F9FA" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{c.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {dailyData.discount_total > 0 && (
                  <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 6, background: "#FEF9E0", border: "1px solid #FDE68A", fontSize: 11, color: "#92400E" }}>
                    Total discounts applied: <strong>Rs. {fmt(dailyData.discount_total)}</strong>
                  </div>
                )}

                {/* Invoice breakdown */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: BRAND }}>
                      {["Invoice #", "Agent", "Invoice Total", "Collected", "Outstanding", "Status"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 10px", color: "#fff", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i >= 2 ? "right" : "left" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyData.invoices.map((row, i) => (
                      <tr key={row.invoice_number} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FA", borderBottom: "1px solid #F1F3F4" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 700, color: BRAND, fontFamily: "monospace", fontSize: 10 }}>#{row.invoice_number}</td>
                        <td style={{ padding: "7px 10px", color: "#202124" }}>{row.agent_name ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#202124", fontWeight: 600 }}>Rs. {fmt(row.invoice_total)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#34A853", fontWeight: 600 }}>Rs. {fmt(row.collected)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: row.outstanding_balance > 0 ? "#EA4335" : "#34A853", fontWeight: 600 }}>
                          {row.outstanding_balance > 0 ? `Rs. ${fmt(row.outstanding_balance)}` : "—"}
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>
                          <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                            background: row.invoice_status === "paid" ? "#E6F4EA" : row.invoice_status === "confirmed" ? "#EAF1FB" : "#FEF9E0",
                            color: row.invoice_status === "paid" ? "#34A853" : row.invoice_status === "confirmed" ? BRAND : "#D97706" }}>
                            {row.invoice_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#374151", borderTop: `2px solid ${BRAND}` }}>
                      <td colSpan={2} style={{ padding: "8px 10px", color: "#E5E7EB", fontSize: 10, fontWeight: 700 }}>
                        DAILY TOTAL — {dailyData.invoice_count} invoice{dailyData.invoice_count !== 1 ? "s" : ""}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#fff", fontWeight: 800, fontSize: 12 }}>Rs. {fmt(dailyData.invoice_total)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#86EFAC", fontWeight: 800, fontSize: 12 }}>Rs. {fmt(dailyData.collected)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: dailyData.outstanding > 0 ? "#FCA5A5" : "#86EFAC", fontWeight: 800, fontSize: 12 }}>
                        Rs. {fmt(dailyData.outstanding)}
                      </td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── MONTHLY SUMMARY ── */}
            {report === "monthly" && monthData && (
              <div style={{ padding: "16px 24px" }}>

                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Total Invoices", value: String(monthData.invoice_count),         color: BRAND },
                    { label: "Invoice Total",  value: `Rs. ${fmt(monthData.invoice_total)}`,   color: "#202124" },
                    { label: "Collected",      value: `Rs. ${fmt(monthData.collected)}`,        color: "#34A853" },
                    { label: "Outstanding",    value: `Rs. ${fmt(monthData.outstanding)}`,      color: monthData.outstanding > 0 ? "#EA4335" : "#34A853" },
                  ].map(c => (
                    <div key={c.label} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E3E7", background: "#F8F9FA" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{c.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {monthData.discount_total > 0 && (
                  <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 6, background: "#FEF9E0", border: "1px solid #FDE68A", fontSize: 11, color: "#92400E" }}>
                    Total discounts for the month: <strong>Rs. {fmt(monthData.discount_total)}</strong>
                  </div>
                )}

                {/* Daily breakdown table */}
                <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Daily Breakdown
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: BRAND }}>
                      {["Date", "Invoices", "Invoice Total", "Collected", "Outstanding"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 10px", color: "#fff", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i >= 2 ? "right" : "left" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthData.daily.map((row, i) => (
                      <tr key={row.day} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FA", borderBottom: "1px solid #F1F3F4" }}>
                        <td style={{ padding: "7px 10px", color: "#202124", fontWeight: 500 }}>{fmtDate(row.day)}</td>
                        <td style={{ padding: "7px 10px", color: "#5F6368" }}>{row.invoice_count}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#202124", fontWeight: 600 }}>Rs. {fmt(row.invoice_total)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#34A853", fontWeight: 600 }}>Rs. {fmt(row.collected)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: row.outstanding > 0 ? "#EA4335" : "#9AA0A6", fontWeight: row.outstanding > 0 ? 600 : 400 }}>
                          {row.outstanding > 0 ? `Rs. ${fmt(row.outstanding)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#374151", borderTop: `2px solid ${BRAND}` }}>
                      <td style={{ padding: "8px 10px", color: "#E5E7EB", fontSize: 10, fontWeight: 700 }}>MONTHLY TOTAL</td>
                      <td style={{ padding: "8px 10px", color: "#E5E7EB", fontWeight: 700 }}>{monthData.invoice_count}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#fff", fontWeight: 800, fontSize: 12 }}>Rs. {fmt(monthData.invoice_total)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#86EFAC", fontWeight: 800, fontSize: 12 }}>Rs. {fmt(monthData.collected)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: monthData.outstanding > 0 ? "#FCA5A5" : "#86EFAC", fontWeight: 800, fontSize: 12 }}>
                        Rs. {fmt(monthData.outstanding)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── Report Footer ── */}
            <div style={{ padding: "10px 24px 14px", borderTop: "1px solid #E0E3E7", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 9, color: "#9AA0A6" }}>
                {company?.name ?? "Ajith Rohana Enterprise"} · Lottery Management System
              </div>
              <div style={{ fontSize: 9, color: "#9AA0A6" }}>
                All dates reflect invoice date · Includes confirmed, waiting, and paid invoices unless noted
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
