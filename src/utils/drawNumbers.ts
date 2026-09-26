/**
 * Draw number calculator for NLB and DLB lottery tickets.
 * All 16 games hold a daily draw — draw number increments by 1 each day.
 *
 * Base anchored to 2026-09-27.
 */

const BASE_DATE = "2026-09-27"; // anchor date for the base draw numbers below

/**
 * Base draw numbers on 2026-09-27.
 * Key must match the canonical game name in the lottery_games table exactly.
 */
export const BASE_DRAW_NUMBERS: Record<string, number> = {
  // ── NLB ──────────────────────────────────────────────────────────────────
  "Ada Sampatha":      898,
  "Govi Setha":        4565,
  "Mega Power":        2671,
  "NLB Jaya":          591,
  "Hada Hana":         1632,
  "Mahajana Sampatha": 6323,
  "Dhana Nidhanaya":   2353,
  "Suba Dasawak":      439,
  // ── DLB ──────────────────────────────────────────────────────────────────
  "Sasiri":                 1127,
  "Lagna Wasanawa":         5009,
  "Shanida Wasanawa":       5458,
  "Ada Kotipathi":          3123,
  "Supiri Dana Sampatha":   1031,
  "Super Ball":             3297,
  "Kapruka":                2473,
  "Jaya Sampatha":          505,
};

/**
 * Returns the draw number for a given game on a given date.
 * Formula: baseDrawNo + (targetDate - baseDate) in full calendar days.
 *
 * @param gameName  Canonical game name (must match BASE_DRAW_NUMBERS key)
 * @param date      Target date as "YYYY-MM-DD"
 * @returns         Draw number string (e.g. "2672"), or "" if game not found
 */
export function getDrawNumber(gameName: string, date: string): string {
  const base = BASE_DRAW_NUMBERS[gameName];
  if (base === undefined) return "";

  const baseMs   = new Date(BASE_DATE).getTime();
  const targetMs = new Date(date).getTime();
  const daysDiff = Math.round((targetMs - baseMs) / 86_400_000);

  const drawNo = base + daysDiff;
  return drawNo > 0 ? String(drawNo) : "";
}

/**
 * React-friendly hook-less helper: returns draw number and the "previous" day's
 * number for display alongside the current date's number.
 */
export function getDrawInfo(gameName: string, date: string): {
  drawNo: string;
  prevDrawNo: string;
  nextDrawNo: string;
} {
  const base = BASE_DRAW_NUMBERS[gameName];
  if (base === undefined) return { drawNo: "", prevDrawNo: "", nextDrawNo: "" };

  const baseMs   = new Date(BASE_DATE).getTime();
  const targetMs = new Date(date).getTime();
  const daysDiff = Math.round((targetMs - baseMs) / 86_400_000);
  const n = base + daysDiff;

  return {
    drawNo:     n > 0 ? String(n)   : "",
    prevDrawNo: n > 1 ? String(n-1) : "",
    nextDrawNo: String(n+1),
  };
}
