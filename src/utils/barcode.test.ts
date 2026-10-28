/**
 * Regression tests for barcode utility functions.
 * Run with:  bun test src/utils/barcode.test.ts
 *
 * Covers the requirements from the Phase 5 specification:
 *  - 10-digit, 11-digit, 16-digit, and longer barcodes
 *  - Barcodes with leading zeros
 *  - Manual entry and scanned entry treated identically
 *  - Start shorter/equal/longer than end
 *  - Invalid characters
 *  - Missing required values
 *  - Values beyond JavaScript MAX_SAFE_INTEGER
 *  - Range generation and stock quantity consistency
 */

import { describe, test, expect } from "bun:test";
import {
  cleanBarcode,
  calcEndBarcode,
  calcQtyFromBarcodes,
  isNumericBarcode,
  lastTicketBarcode,
} from "./barcode";

// ── cleanBarcode ───────────────────────────────────────────────────────────────

describe("cleanBarcode", () => {
  test("strips non-digit chars from scanner suffix", () => {
    expect(cleanBarcode("62900476020\r")).toBe("62900476020");
    expect(cleanBarcode("62900476020\n")).toBe("62900476020");
    expect(cleanBarcode("62900476020\t")).toBe("62900476020");
  });

  test("trims surrounding whitespace", () => {
    expect(cleanBarcode("  62900476020  ")).toBe("62900476020");
    expect(cleanBarcode(" 0001234567890 ")).toBe("0001234567890");
  });

  test("preserves leading zeros", () => {
    expect(cleanBarcode("00062900476020")).toBe("00062900476020");
    expect(cleanBarcode("0001001")).toBe("0001001");
  });

  test("does NOT truncate barcodes longer than 11 digits", () => {
    const dlb16 = "1234567890123456";
    expect(cleanBarcode(dlb16)).toBe(dlb16);
  });

  test("does NOT truncate 14-digit DLB barcodes", () => {
    const dlb14 = "00062900476020";
    expect(cleanBarcode(dlb14)).toBe(dlb14);
  });

  test("strips all letters and symbols", () => {
    expect(cleanBarcode("ABC123")).toBe("123");
    expect(cleanBarcode("12-34-56")).toBe("123456");
  });

  test("returns empty string for empty input", () => {
    expect(cleanBarcode("")).toBe("");
    expect(cleanBarcode("   ")).toBe("");
  });
});

// ── isNumericBarcode ───────────────────────────────────────────────────────────

describe("isNumericBarcode", () => {
  test("accepts 10-digit barcode", () => {
    expect(isNumericBarcode("1234567890")).toBe(true);
  });

  test("accepts 11-digit NLB barcode", () => {
    expect(isNumericBarcode("62900476020")).toBe(true);
  });

  test("accepts 16-digit DLB barcode", () => {
    expect(isNumericBarcode("1234567890123456")).toBe(true);
  });

  test("accepts barcode longer than 16 digits", () => {
    expect(isNumericBarcode("12345678901234567890")).toBe(true);
  });

  test("accepts barcode with leading zeros", () => {
    expect(isNumericBarcode("00062900476020")).toBe(true);
  });

  test("rejects 5-digit barcode (too short)", () => {
    expect(isNumericBarcode("12345")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isNumericBarcode("")).toBe(false);
  });

  test("accepts mixed string that cleans to ≥6 digits (cleanBarcode runs first)", () => {
    // isNumericBarcode cleans the input before testing, by design.
    // "ABC12345678" → cleanBarcode → "12345678" → 8 digits → valid
    expect(isNumericBarcode("ABC12345678")).toBe(true);
  });

  test("rejects string that cleans to fewer than 6 digits", () => {
    expect(isNumericBarcode("A1B2C3")).toBe(false); // → "123" — only 3 digits
  });

  test("rejects whitespace-only", () => {
    expect(isNumericBarcode("   ")).toBe(false);
  });
});

// ── calcEndBarcode ─────────────────────────────────────────────────────────────

describe("calcEndBarcode", () => {
  test("11-digit NLB barcode, 50 tickets", () => {
    expect(calcEndBarcode("62900476020", 50)).toBe("62900476070");
  });

  test("10-digit barcode, 100 tickets", () => {
    expect(calcEndBarcode("1234567890", 100)).toBe("1234567990");
  });

  test("16-digit DLB barcode, 200 tickets", () => {
    expect(calcEndBarcode("1234567890123456", 200)).toBe("1234567890123656");
  });

  test("barcode longer than 16 digits", () => {
    expect(calcEndBarcode("12345678901234567", 10)).toBe("12345678901234577");
  });

  test("preserves leading zeros — 14-digit barcode", () => {
    // "00062900476020" has 3 leading zeros; end must also have them
    expect(calcEndBarcode("00062900476020", 50)).toBe("00062900476070");
  });

  test("preserves leading zeros — short barcode", () => {
    expect(calcEndBarcode("0001001", 30)).toBe("0001031");
  });

  test("returns empty for qty = 0", () => {
    expect(calcEndBarcode("62900476020", 0)).toBe("");
  });

  test("returns empty for negative qty", () => {
    expect(calcEndBarcode("62900476020", -5)).toBe("");
  });

  test("returns empty for empty start", () => {
    expect(calcEndBarcode("", 50)).toBe("");
  });

  test("single ticket: end = start + 1", () => {
    expect(calcEndBarcode("62900476020", 1)).toBe("62900476021");
  });
});

// ── calcQtyFromBarcodes ────────────────────────────────────────────────────────

describe("calcQtyFromBarcodes", () => {
  test("basic range, 50 tickets", () => {
    expect(calcQtyFromBarcodes("62900476020", "62900476070")).toBe(50);
  });

  test("10-digit range", () => {
    expect(calcQtyFromBarcodes("1234567890", "1234567990")).toBe(100);
  });

  test("16-digit DLB range", () => {
    expect(calcQtyFromBarcodes("1234567890123456", "1234567890123656")).toBe(200);
  });

  test("barcode with leading zeros", () => {
    expect(calcQtyFromBarcodes("00062900476020", "00062900476070")).toBe(50);
  });

  test("start === end → 0 (empty range)", () => {
    expect(calcQtyFromBarcodes("62900476020", "62900476020")).toBe(0);
  });

  test("start > end → 0 (invalid range)", () => {
    expect(calcQtyFromBarcodes("62900476070", "62900476020")).toBe(0);
  });

  test("empty start → 0", () => {
    expect(calcQtyFromBarcodes("", "62900476070")).toBe(0);
  });

  test("empty end → 0", () => {
    expect(calcQtyFromBarcodes("62900476020", "")).toBe(0);
  });

  test("range consistency with calcEndBarcode", () => {
    const start = "62900476020";
    const qty = 300;
    const end = calcEndBarcode(start, qty);
    expect(calcQtyFromBarcodes(start, end)).toBe(qty);
  });

  test("roundtrip: 14-digit barcode with leading zeros", () => {
    const start = "00062900476020";
    const qty = 50;
    const end = calcEndBarcode(start, qty);
    expect(calcQtyFromBarcodes(start, end)).toBe(qty);
  });

  test("large barcode beyond MAX_SAFE_INTEGER — arithmetic still correct", () => {
    // 18-digit barcode; individual values exceed Number.MAX_SAFE_INTEGER
    const start = "900719925474099201";
    const end   = "900719925474099251"; // +50
    expect(calcQtyFromBarcodes(start, end)).toBe(50);
  });
});

// ── lastTicketBarcode ──────────────────────────────────────────────────────────

describe("lastTicketBarcode", () => {
  test("11-digit: last = end - 1", () => {
    expect(lastTicketBarcode("62900476070")).toBe("62900476069");
  });

  test("preserves leading zeros", () => {
    expect(lastTicketBarcode("00062900476070")).toBe("00062900476069");
  });

  test("single ticket batch: last = end - 1", () => {
    // start=62900476020, qty=1 → end=62900476021 → last=62900476020
    const end = calcEndBarcode("62900476020", 1);
    expect(lastTicketBarcode(end)).toBe("62900476020");
  });

  test("empty input → empty string", () => {
    expect(lastTicketBarcode("")).toBe("");
  });

  test("end = 0 → empty string (pathological)", () => {
    expect(lastTicketBarcode("0")).toBe("");
  });
});

// ── Integration: range generation and stock quantity consistency ───────────────

describe("range consistency", () => {
  test("qty matches actual barcode count for 11-digit NLB", () => {
    const start = "62900476020";
    const qty = 500;
    const end = calcEndBarcode(start, qty);
    expect(calcQtyFromBarcodes(start, end)).toBe(qty);
  });

  test("qty matches for 14-digit DLB with leading zeros", () => {
    const start = "00099990000001";
    const qty = 1000;
    const end = calcEndBarcode(start, qty);
    expect(end).toBe("00099990001001");
    expect(calcQtyFromBarcodes(start, end)).toBe(qty);
  });

  test("manually entered and scanned barcodes are treated identically", () => {
    const scanned  = cleanBarcode("62900476020\r\n");   // scanner suffix
    const typed    = cleanBarcode("  62900476020  ");   // manual with spaces
    expect(scanned).toBe(typed);
    expect(calcEndBarcode(scanned, 50)).toBe(calcEndBarcode(typed, 50));
  });

  test("barcode beyond MAX_SAFE_INTEGER: no precision loss", () => {
    // Number.MAX_SAFE_INTEGER = 9007199254740991 (16 digits)
    // This 17-digit barcode exceeds it
    const start = "90071992547409910";
    const qty = 100;
    const end = calcEndBarcode(start, qty);
    expect(end).toBe("90071992547410010");
    expect(calcQtyFromBarcodes(start, end)).toBe(qty);
  });

  test("invalid characters rejected: non-numeric input returns 0 qty", () => {
    expect(calcQtyFromBarcodes("ABC", "DEF")).toBe(0);
  });
});
