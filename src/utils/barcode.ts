/**
 * Clean a barcode string from common scanner artifacts:
 * - Strips non-digit characters (trailing CR/LF/tab/suffix)
 * - Trims to rightmost 11 digits if scanner adds a prefix (e.g. "00" before the barcode)
 */
export function cleanBarcode(raw: string): string {
  let s = raw.replace(/\D/g, ""); // strip non-digits
  // NLB/DLB barcodes are 11 digits — if scanner adds extra prefix, keep rightmost 11
  if (s.length > 11) s = s.slice(-11);
  return s;
}

/**
 * EXCLUSIVE-END convention:
 *   end barcode = first barcode of the NEXT batch (NOT part of this batch)
 *   qty = end - start
 *
 * Example: 50 tickets starting at 62900476020
 *   end = 62900476020 + 50 = 62900476070
 *   Tickets included: 62900476020 ... 62900476069 (50 tickets)
 *   Client confirms with calculator: 476070 - 476020 = 50 ✓
 */
export function calcEndBarcode(start: string, qty: number): string {
  const s = parseInt(cleanBarcode(start), 10);
  if (isNaN(s) || qty <= 0) return "";
  return String(s + qty); // exclusive: end = start + qty
}

/**
 * Qty = end - start  (exclusive end convention)
 * end barcode is NOT included in the batch.
 */
export function calcQtyFromBarcodes(start: string, end: string): number {
  const s = parseInt(cleanBarcode(start), 10);
  const e = parseInt(cleanBarcode(end), 10);
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return e - s; // exclusive: qty = end - start
}

/** Returns true if the string looks like a numeric barcode (after cleaning) */
export function isNumericBarcode(val: string): boolean {
  return /^\d{6,}$/.test(cleanBarcode(val).trim());
}

/**
 * Returns the last ticket barcode in a batch (for display/printing).
 * Last ticket = end - 1 (since end is exclusive)
 */
export function lastTicketBarcode(end: string): string {
  const e = parseInt(cleanBarcode(end), 10);
  if (isNaN(e) || e <= 0) return "";
  return String(e - 1);
}
