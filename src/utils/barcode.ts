/**
 * Clean a barcode string from common barcode-scanner artifacts:
 * - Strips leading zeros beyond the standard NLB/DLB length (11 digits)
 * - Strips non-digit characters (trailing CR/LF/tab from some scanners)
 * - Trims extra digits at the end if too long
 */
export function cleanBarcode(raw: string): string {
  // Remove all non-digit characters (scanner suffix, CR, LF, spaces)
  let s = raw.replace(/\D/g, "");
  // NLB/DLB barcodes are 11 digits. If longer, keep the rightmost 11
  // (some scanners add a 2-digit prefix like "00")
  if (s.length > 11) s = s.slice(-11);
  return s;
}

/**
 * Given a numeric barcode string and a quantity, returns the ending barcode (inclusive).
 * e.g. start="62900474690", qty=2250 → "62900476939"
 */
export function calcEndBarcode(start: string, qty: number): string {
  const startNum = parseInt(cleanBarcode(start), 10);
  if (isNaN(startNum) || qty <= 0) return "";
  return String(startNum + qty - 1);
}

/**
 * Given a start and end barcode (inclusive range), returns the quantity.
 * e.g. start="62900474690", end="62900476939" → 2250
 */
export function calcQtyFromBarcodes(start: string, end: string): number {
  const s = parseInt(cleanBarcode(start), 10);
  const e = parseInt(cleanBarcode(end), 10);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return e - s + 1;
}

/** Returns true if the string looks like a numeric barcode (after cleaning) */
export function isNumericBarcode(val: string): boolean {
  return /^\d{6,}$/.test(cleanBarcode(val).trim());
}
