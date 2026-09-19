/**
 * Shared number / currency formatters — full precision, no abbreviations.
 * Use these everywhere: dashboards, tables, KPI cards, reports.
 */

/**
 * Eliminate floating-point artifacts (e.g. 13486.920000000013 → 13486.92).
 * Use on EVERY financial value before storing in state or displaying.
 */
export const sanitize = (n: number): number => Number(n.toFixed(2));

/** Round and floor to 0 — safe outstanding balance helper */
export const sanitizeBalance = (n: number): number => Math.max(0, Number(n.toFixed(2)));

/** Rs. 685,300.00 — full currency with two decimal places */
export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace("LKR", "Rs.");

/** Rs. 685,300.00 — alias used by most components */
export const fmtRs = (n: number): string =>
  `Rs. ${new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;

/** 6,600 — whole number with commas, no decimals */
export const formatNumber = (num: number): string =>
  new Intl.NumberFormat("en-LK").format(num);

/** 685,300.00 — amount only, no currency symbol */
export const formatAmount = (n: number): string =>
  new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
