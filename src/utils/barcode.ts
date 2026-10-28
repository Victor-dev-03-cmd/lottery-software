/**
 * Barcode utilities — NLB / DLB lottery ticket range helpers.
 *
 * Design decisions:
 * - Barcodes are strings. Leading zeros are meaningful and must be preserved.
 * - NLB barcodes: typically 11 digits. DLB barcodes: 14–16 digits.
 *   Do not assume a fixed length.
 * - All arithmetic uses BigInt to avoid JavaScript integer-precision loss
 *   for barcodes beyond 15 digits (> Number.MAX_SAFE_INTEGER).
 * - EXCLUSIVE-END convention: end barcode = first barcode of the NEXT batch.
 *   qty = end − start  (end is not part of this batch)
 */

/**
 * Clean a barcode string from scanner artifacts and accidental whitespace:
 * - Trims surrounding whitespace (accidental spaces/newlines).
 * - Strips non-digit characters (trailing CR / LF / tab / EAN suffix).
 * - Does NOT truncate: barcodes of any length are accepted.
 *   (Previous code truncated to 11 digits, breaking 14–16 digit DLB barcodes.)
 */
export function cleanBarcode(raw: string): string {
  return raw.trim().replace(/\D/g, "");
}

/**
 * Calculate the exclusive end barcode for a batch.
 *   end = start + qty   (end is NOT part of this batch)
 *
 * Uses BigInt to safely handle barcodes of any length.
 * Leading zeros are preserved: the result is padded to the same character
 * length as the cleaned start barcode.
 *
 * Example (11-digit):   start="62900476020", qty=50  → "62900476070"
 * Example (14-digit):   start="00062900476020", qty=50 → "00062900476070"
 */
export function calcEndBarcode(start: string, qty: number): string {
  const cleaned = cleanBarcode(start);
  if (!cleaned || qty <= 0) return "";
  try {
    const s = BigInt(cleaned);
    const end = s + BigInt(qty);
    const result = end.toString();
    // Pad to match the source length so leading zeros are restored.
    return result.padStart(cleaned.length, "0");
  } catch {
    return "";
  }
}

/**
 * Calculate quantity from start and end barcodes.
 *   qty = end − start   (exclusive end)
 *
 * Returns 0 when end ≤ start or when barcodes are invalid.
 * Caps at Number.MAX_SAFE_INTEGER as a safety guard; larger ranges are
 * not practically used in a single purchase.
 */
export function calcQtyFromBarcodes(start: string, end: string): number {
  const cs = cleanBarcode(start);
  const ce = cleanBarcode(end);
  if (!cs || !ce) return 0;
  try {
    const s = BigInt(cs);
    const e = BigInt(ce);
    if (e <= s) return 0;
    const qty = e - s;
    if (qty > BigInt(Number.MAX_SAFE_INTEGER)) return 0; // pathological range
    return Number(qty);
  } catch {
    return 0;
  }
}

/**
 * Returns true if the string is a valid numeric barcode (after cleaning).
 * Requires at least 6 digits so obviously wrong values (single digits,
 * accidental keypresses) are rejected.
 */
export function isNumericBarcode(val: string): boolean {
  return /^\d{6,}$/.test(cleanBarcode(val));
}

/**
 * Returns the last ticket barcode in a batch (for display / printing).
 * Last ticket = end − 1  (since end is exclusive).
 * Preserves leading zeros to match the source barcode's character length.
 */
export function lastTicketBarcode(end: string): string {
  const cleaned = cleanBarcode(end);
  if (!cleaned) return "";
  try {
    const e = BigInt(cleaned);
    if (e <= 0n) return "";
    const last = e - 1n;
    return last.toString().padStart(cleaned.length, "0");
  } catch {
    return "";
  }
}
