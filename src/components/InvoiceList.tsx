import { useEffect, useState } from "react";
import { Printer, RefreshCw, Plus, Home, ChevronRight, FileText, Lock } from "lucide-react";
import { getInvoices } from "../services/database";
import type { Invoice, View } from "../types";

interface Props {
  onNavigate: (view: View, invoiceId?: number) => void;
  refreshKey: number;
}

export default function InvoiceList({ onNavigate, refreshKey }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "outstanding" | "settled">("");

  async function load() {
    setLoading(true);
    try {
      // Show paid invoices on this page (draft/confirmed/cancelled have their own pages)
      setInvoices(await getInvoices("paid"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  function handleDeleteAttempt(invoiceNumber: string) {
    alert(
      `🔒 Invoice #${invoiceNumber} is PAID and permanently locked.\n\n` +
      `Paid invoices cannot be deleted — they are protected financial records ` +
      `needed for audits, balance history, and agent statements.\n\n` +
      `If you need to reverse this invoice, use Cancel instead of Delete.`
    );
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const filtered = invoices.filter((inv) => {
    const textMatch =
      !filter ||
      inv.invoice_number.toLowerCase().includes(filter.toLowerCase()) ||
      (inv.agent_name ?? "").toLowerCase().includes(filter.toLowerCase());
    const statusMatch =
      !statusFilter ||
      (statusFilter === "outstanding" && inv.outstanding_balance > 0) ||
      (statusFilter === "settled" && inv.outstanding_balance <= 0);
    return textMatch && statusMatch;
  });

  // Only sum actual receivables (≥0); negative = overpayment, not a debt
  const totalOutstanding = Number(
    filtered.reduce((s, inv) => s + Math.max(0, inv.outstanding_balance), 0).toFixed(2)
  );

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Invoices</span>
        </nav>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Page header row */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>Invoices</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>All delivery invoices</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#1D1D1D" }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={() => onNavigate("new-invoice")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "#CF291D" }}
            >
              <Plus size={14} /> New Invoice
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search invoice # or agent…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none w-56"
            style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "outstanding" | "settled")}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#CF291D")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#E8E8E8")}
          >
            <option value="">All Statuses</option>
            <option value="outstanding">Outstanding</option>
            <option value="settled">Settled</option>
          </select>
          {!loading && (
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              <span className="font-semibold" style={{ color: "#1D1D1D" }}>{filtered.length}</span> invoices
              {totalOutstanding > 0 && (
                <> &nbsp;·&nbsp; Outstanding:{" "}
                  <span className="font-semibold" style={{ color: "#CF291D" }}>{fmt(totalOutstanding)}</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Table card */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "#F3F4F6" }}>
                <RefreshCw size={22} style={{ color: "#BFBFBF" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>Loading invoices…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "#F3F4F6" }}>
                <FileText size={22} style={{ color: "#BFBFBF" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>No invoices found</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                {filter || statusFilter
                  ? "Try adjusting your search or filter"
                  : "Create your first invoice to get started"}
              </p>
              {!filter && !statusFilter && (
                <button
                  onClick={() => onNavigate("new-invoice")}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "#CF291D" }}
                >
                  <Plus size={14} /> New Invoice
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: "#374151", borderBottom: "2px solid #CF291D" }}>
                    {[
                      { label: "Invoice #", cls: "text-left" },
                      { label: "Date", cls: "text-left" },
                      { label: "Agent", cls: "text-left" },
                      { label: "Invoice Total", cls: "text-right" },
                      { label: "Prev Outstanding", cls: "text-right" },
                      { label: "Total Payable", cls: "text-right" },
                      { label: "Cash Paid", cls: "text-right" },
                      { label: "Outstanding", cls: "text-right" },
                      { label: "Status", cls: "text-center" },
                      { label: "Actions", cls: "text-center" },
                    ].map(({ label, cls }) => (
                      <th
                        key={label}
                        className={`px-4 py-3 ${cls}`}
                        style={{
                          fontSize: 10,
                          color: "#9CA3AF",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50/60 transition-colors"
                      style={{ borderBottom: "1px solid #F9F9F9" }}
                    >
                      <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#CF291D" }}>
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "#1D1D1D" }}>
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium" style={{ color: "#1D1D1D" }}>
                        {inv.agent_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right" style={{ color: "#1D1D1D" }}>
                        {fmt(inv.invoice_total)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right" style={{ color: "#6B7280" }}>
                        {fmt(inv.prev_outstanding)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: "#1D1D1D" }}>
                        {fmt(inv.total_payable)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right" style={{ color: "#16a34a" }}>
                        {fmt(inv.cash_received)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold"
                        style={{ color: inv.outstanding_balance > 0 ? "#CF291D" : "#16a34a" }}>
                        {fmt(Math.max(0, inv.outstanding_balance))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
                          style={{ background: inv.outstanding_balance > 0 ? "#CF291D" : "#16a34a" }}
                        >
                          {inv.outstanding_balance > 0 ? "Outstanding" : "Settled"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onNavigate("print" as View, inv.id)}
                            title="Print"
                            className="p-1.5 rounded-lg transition-all hover:opacity-80"
                            style={{ background: "#FFF1F0", color: "#CF291D" }}
                          >
                            <Printer size={14} />
                          </button>
                          {/* Paid invoices are fully locked — no deletion allowed */}
                          <button
                            onClick={() => handleDeleteAttempt(inv.invoice_number)}
                            title="Paid invoices are locked and cannot be deleted"
                            className="p-1.5 rounded-lg transition-all"
                            style={{ background: "#F3F4F6", color: "#9CA3AF", cursor: "not-allowed" }}
                          >
                            <Lock size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#374151", borderTop: "2px solid #CF291D" }}>
                    <td
                      colSpan={7}
                      className="px-4 py-3 text-sm font-semibold"
                      style={{ color: "#CF291D" }}
                    >
                      TOTAL
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold"
                      style={{ color: totalOutstanding > 0 ? "#CF291D" : "#4ade80" }}>
                      {totalOutstanding > 0
                        ? fmt(totalOutstanding)
                        : <span style={{ color: "#4ade80" }}>All Settled ✓</span>
                      }
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
}
