/**
 * Given a numeric barcode string and a quantity, returns the ending barcode.
 * e.g. start="62900474690", qty=2250 → "62900476939"
 */
export function calcEndBarcode(start: string, qty: number): string {
  const startNum = parseInt(start.replace(/\s/g, ""), 10);
  if (isNaN(startNum) || qty <= 0) return "";
  return String(startNum + qty - 1);
}

/**
 * Given a start and end barcode, returns the quantity (inclusive range).
 * e.g. start="62900474690", end="62900476939" → 2250
 */
export function calcQtyFromBarcodes(start: string, end: string): number {
  const s = parseInt(start.replace(/\s/g, ""), 10);
  const e = parseInt(end.replace(/\s/g, ""), 10);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return e - s + 1;
}

/** Returns true if the string looks like a numeric barcode */
export function isNumericBarcode(val: string): boolean {
  return /^\d+$/.test(val.trim());
}
