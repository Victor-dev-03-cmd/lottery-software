/**
 * Sinhala / English bilingual helpers.
 * Usage:
 *   <BiLabel en="Opening Balance" si="ආරම්භක ශේෂය" />
 *   SI.openingBalance  →  "ආරම්භක ශේෂය"
 */

import React from "react";

// ── Sinhala translations ──────────────────────────────────────────────────────

export const SI = {
  // ── General ─────────────────────────────────────────────────────────────────
  dashboard:          "ප්‍රධාන දර්ශකය",
  date:               "දිනය",
  today:              "අද",
  save:               "සුරකින්න",
  cancel:             "අවලංගු කරන්න",
  delete:             "මකන්න",
  edit:               "සංස්කරණය",
  add:                "එකතු කරන්න",
  search:             "සොයන්න",
  filter:             "පෙරහන",
  notes:              "සටහන්",
  reason:             "හේතුව",
  category:           "වර්ගය",
  amount:             "මුදල",
  total:              "මුළු",
  status:             "තත්ත්වය",
  agent:              "නියෝජිතයා",
  agents:             "නියෝජිතයන්",

  // ── Money / Balance ──────────────────────────────────────────────────────────
  openingBalance:     "ආරම්භක ශේෂය",
  closingBalance:     "අවසාන ශේෂය",
  totalIncome:        "මුළු ආදායම",
  totalOutflows:      "මුළු වියදම",
  expectedCash:       "අපේක්ෂිත මුදල",
  actualCash:         "ලැබෙන මුදල (ගණන් කළ)",
  variance:           "වෙනස",
  invoiceCash:        "ඉන්වොයිස් මුදල",
  postPayments:       "පසු ගෙවීම්",
  dailyCollections:   "දෛනික එකතු",
  outstanding:        "හිඟ ශේෂය",
  totalPayable:       "ගෙවිය යුතු මුළු මුදල",
  cashReceived:       "ලැබුණු මුදල",
  invoiceTotal:       "ඉන්වොයිස් මුළු මුදල",
  fullyPaid:          "සම්පූර්ණයෙන් ගෙවා ඇත",
  revenue:            "ආදායම",
  profit:             "ලාභය",

  // ── Petty Cash ───────────────────────────────────────────────────────────────
  pettyCash:          "කුඩා මුදල් (Petty Cash)",
  dailyIncome:        "දෛනික ආදායම",
  cashOutflows:       "මුදල් යෑම",
  expense:            "වියදම",
  expenses:           "වියදම්",
  addExpense:         "වියදමක් එකතු කරන්න",
  closeDay:           "දිනය වසන්න",
  dayClosed:          "දිනය වැසී ඇත",
  dayNotes:           "දින සටහන්",
  physicalCashCount:  "ලැබෙන මුදල් ගණන",
  balanced:           "සමතුලිත",
  cashShort:          "මුදල් හිඟයි",
  cashOver:           "අතිරේක මුදල",
  reconciliation:     "ගිලන් කිරීම",
  summary:            "සාරාංශය",

  // ── Expense categories ───────────────────────────────────────────────────────
  "Salary / Wages":          "වේතනය / ගෙවීම",
  "Home / Personal":         "නිවස / පෞද්ගලික",
  "Utility / Shop Expense":  "ප්‍රයෝජ්‍ය / වෙළඳ සැල",
  "Transport":               "ගමනාගමනය",
  "Office Supplies":         "කාර්යාල සැපයුම්",
  "Maintenance / Repair":    "නඩත්තු / අලුත්වැඩියා",
  "Food / Refreshments":     "ආහාර / සතුටු",
  "Other":                   "වෙනත්",

  // ── Invoice / Status ─────────────────────────────────────────────────────────
  invoice:            "ඉන්වොයිස්",
  invoices:           "ඉන්වොයිස්",
  draft:              "කෙටුම්පත",
  confirmed:          "තහවුරු",
  paid:               "ගෙවූ",
  cancelled:          "අවලංගු",
  pending:            "බලාපොරොත්තු",
  settled:            "තේරී ඇත",
  unsettled:          "නොතේරී",

  // ── Stock ────────────────────────────────────────────────────────────────────
  stock:              "තොගය",
  available:          "ලබාගත හැකි",
  sold:               "විකුණා",
  remaining:          "ඉතිරි",

  // ── Dashboard ────────────────────────────────────────────────────────────────
  totalRevenue:       "මුළු ආදායම",
  totalOutstanding:   "මුළු හිඟ ශේෂය",
  todayRevenue:       "අද ආදායම",
  activeAgents:       "ක්‍රියාකාරී නියෝජිතයන්",
  pendingReturns:     "ආපසු ලැබීමට ඇති",
  lowStock:           "අඩු තොගය",
};

// ── BiLabel component ─────────────────────────────────────────────────────────

interface BiLabelProps {
  en: string;
  si: string;
  enStyle?: React.CSSProperties;
  siStyle?: React.CSSProperties;
  siFirst?: boolean;   // show Sinhala above English
  inline?: boolean;    // en · si on one line separated by ·
}

export function BiLabel({ en, si, enStyle, siStyle, siFirst, inline }: BiLabelProps) {
  const enEl = (
    <span style={{ fontWeight: 600, color: "#374151", ...enStyle }}>
      {en}
    </span>
  );
  const siEl = (
    <span className="si" style={{ fontSize: "0.82em", color: "#6B7280", fontWeight: 400, ...siStyle }}>
      {si}
    </span>
  );

  if (inline) {
    return (
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
        {siFirst ? siEl : enEl}
        <span style={{ color: "#D1D5DB", fontSize: "0.75em" }}>·</span>
        {siFirst ? enEl : siEl}
      </span>
    );
  }

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {siFirst ? (
        <>{siEl}{enEl}</>
      ) : (
        <>{enEl}{siEl}</>
      )}
    </span>
  );
}

/** Card stat title with Sinhala sub-label */
export function StatLabel({ en, si }: { en: string; si: string }) {
  return (
    <span style={{ display: "block" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
        {en}
      </span>
      <span className="si" style={{ display: "block", fontSize: 9, color: "#B0B8C1", marginTop: 1 }}>
        {si}
      </span>
    </span>
  );
}

/** Section header label */
export function SectionLabel({ en, si }: { en: string; si: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#1D1D1D" }}>{en}</span>
      <span className="si" style={{ fontSize: 10, color: "#9CA3AF" }}>{si}</span>
    </span>
  );
}
