/**
 * Barcode verification pipeline — value-level temporal consistency.
 *
 * Acceptance pipeline:
 *   Decode → Format validation → Dominant-length filter
 *   → Dominant-VALUE verification → Consecutive-streak check
 *   → Debounce → Accept
 *
 * Key invariants:
 *   • Each frame is an independent complete candidate (never concatenated).
 *   • Dominant value = the complete normalized string appearing in the
 *     majority of valid frames in the rolling window.
 *   • Acceptance requires BOTH dominant-value consensus AND consecutive streak.
 *   • No fuzzy matching, trimming, appending, or mutating of digit strings.
 */

// ── Debug logger ───────────────────────────────────────────────────────────────
const DEBUG = __DEV__;
export function dbg(stage: string, ...args: unknown[]) {
  if (DEBUG) console.log(`[Scanner:${stage}]`, ...args);
}

// ── Clean raw decoder output ───────────────────────────────────────────────────
/** Strip non-digits. Never truncate. Used for normalization only. */
export function cleanDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

// ── Format specifications ──────────────────────────────────────────────────────
export interface FormatSpec {
  fixedLength:    number | null;
  lengthRange:    [number, number];
  mustBeEven:     boolean;
  hasGs1Checksum: boolean;
  description:    string;
}

export const FORMAT_SPECS: Record<string, FormatSpec> = {
  ean13:      { fixedLength:13, lengthRange:[13,13], mustBeEven:false, hasGs1Checksum:true,  description:'EAN-13'    },
  ean8:       { fixedLength:8,  lengthRange:[8,8],   mustBeEven:false, hasGs1Checksum:true,  description:'EAN-8'     },
  upc_a:      { fixedLength:12, lengthRange:[12,12], mustBeEven:false, hasGs1Checksum:true,  description:'UPC-A'     },
  upc_e:      { fixedLength:null,lengthRange:[6,8],  mustBeEven:false, hasGs1Checksum:false, description:'UPC-E'     },
  itf14:      { fixedLength:14, lengthRange:[14,14], mustBeEven:true,  hasGs1Checksum:true,  description:'ITF-14'    },
  code128:    { fixedLength:null,lengthRange:[1,48], mustBeEven:false, hasGs1Checksum:false, description:'Code 128'  },
  code39:     { fixedLength:null,lengthRange:[1,43], mustBeEven:false, hasGs1Checksum:false, description:'Code 39'   },
  code93:     { fixedLength:null,lengthRange:[1,48], mustBeEven:false, hasGs1Checksum:false, description:'Code 93'   },
  codabar:    { fixedLength:null,lengthRange:[4,20], mustBeEven:false, hasGs1Checksum:false, description:'Codabar'   },
  pdf417:     { fixedLength:null,lengthRange:[1,2710],mustBeEven:false,hasGs1Checksum:false, description:'PDF 417'   },
  datamatrix: { fixedLength:null,lengthRange:[1,3116],mustBeEven:false,hasGs1Checksum:false, description:'DataMatrix'},
  qr:         { fixedLength:null,lengthRange:[1,7089],mustBeEven:false,hasGs1Checksum:false, description:'QR Code'   },
  aztec:      { fixedLength:null,lengthRange:[1,3067],mustBeEven:false,hasGs1Checksum:false, description:'Aztec'     },
};
const FALLBACK_SPEC: FormatSpec = {
  fixedLength:null, lengthRange:[6,48], mustBeEven:false, hasGs1Checksum:false, description:'Unknown',
};
export function getSpec(type: string): FormatSpec {
  return FORMAT_SPECS[type.toLowerCase()] ?? FALLBACK_SPEC;
}

// ── GS1 mod-10 checksum ────────────────────────────────────────────────────────
export function validateGs1Checksum(digits: string): boolean {
  if (digits.length < 2) return false;
  const d = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < d.length - 1; i++) {
    sum += d[i] * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === d[d.length - 1];
}

// ── Single-candidate validation ────────────────────────────────────────────────
export interface ValidationResult {
  valid:       boolean;
  reason:      string | null;
  normalised:  string;
  checksumOk:  boolean | null;
}

export function validateCandidate(raw: string, type: string): ValidationResult {
  const digits = cleanDigits(raw);
  const spec   = getSpec(type);

  if (!digits) return { valid:false, reason:'Empty after digit extraction', normalised:'', checksumOk:null };

  if (spec.fixedLength !== null && digits.length !== spec.fixedLength) {
    return { valid:false, reason:`${spec.description}: expected ${spec.fixedLength} digits, got ${digits.length}`, normalised:digits, checksumOk:null };
  }

  const [lo, hi] = spec.lengthRange;
  if (digits.length < lo || digits.length > hi) {
    return { valid:false, reason:`${spec.description}: length ${digits.length} out of [${lo},${hi}]`, normalised:digits, checksumOk:null };
  }

  if (spec.mustBeEven && digits.length % 2 !== 0) {
    return { valid:false, reason:`ITF requires even digit count, got ${digits.length}`, normalised:digits, checksumOk:null };
  }

  if (spec.hasGs1Checksum) {
    const ok = validateGs1Checksum(digits);
    if (!ok) return { valid:false, reason:`${spec.description}: checksum invalid`, normalised:digits, checksumOk:false };
    return { valid:true, reason:null, normalised:digits, checksumOk:true };
  }

  return { valid:true, reason:null, normalised:digits, checksumOk:null };
}

// ── Frame record (full debug record for every frame) ──────────────────────────
export interface FrameRecord {
  frameIndex:       number;
  rawValue:         string;
  normalizedValue:  string;
  format:           string;
  length:           number;
  timestampMs:      number;
  validationResult: ValidationResult;
  isValid:          boolean;
  rejectedReason:   string | null;
  verificationCount:number;       // how many times this value seen in window
  finalAcceptedValue: string | null;
}

// ── FrameVerifier ─────────────────────────────────────────────────────────────
export interface FeedResult {
  confidence:    number;
  ready:         boolean;
  acceptedCode:  string | null;
  rejectedReason:string | null;
  record:        FrameRecord;
}

const REQUIRED_STREAK     = 3;
const WINDOW_SIZE         = 10;   // rolling window of recent frames
const DOMINANT_THRESHOLD  = 0.5;  // a value must appear in >50% of valid frames
const MIN_WINDOW_FOR_DOM  = 4;    // minimum valid frames before dominant-value check fires
const DEBOUNCE_MS         = 2000; // ignore re-scan of same barcode within 2s

export class FrameVerifier {
  private window:       FrameRecord[] = [];
  private frameIndex    = 0;
  private streak        = 0;
  private streakValue   = '';
  private lastAcceptedValue = '';
  private lastAcceptedMs    = 0;

  feed(raw: string, type: string): FeedResult {
    const idx  = ++this.frameIndex;
    const now  = Date.now();
    const v    = validateCandidate(raw, type);

    dbg('frame', {
      idx, raw, type,
      normalised: v.normalised,
      valid: v.valid,
      reason: v.reason,
      checksumOk: v.checksumOk,
      streak: this.streak,
      streakValue: this.streakValue,
    });

    // ── Step 1: Format validation ──────────────────────────────────────────
    if (!v.valid) {
      this.streak = 0; this.streakValue = '';
      const rec = this.record(idx, raw, v, false, v.reason, now, 0);
      this.addToWindow(rec);
      return { confidence:0, ready:false, acceptedCode:null, rejectedReason:v.reason, record:rec };
    }

    // ── Step 2: Dominant-length filter (variable-length formats only) ──────
    const spec = getSpec(type);
    if (spec.fixedLength === null) {
      const domLen = this.dominantLength();
      if (domLen !== null && v.normalised.length !== domLen) {
        const reason = `Length outlier: got ${v.normalised.length} digits, window dominant=${domLen}`;
        dbg('reject:length-outlier', reason);
        this.streak = 0; this.streakValue = '';
        const rec = this.record(idx, raw, v, false, reason, now, 0);
        this.addToWindow(rec);
        return { confidence:0, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
      }
    }

    // ── Step 3: Add valid frame to window for value-frequency analysis ─────
    const verCount = this.countInWindow(v.normalised) + 1; // +1 includes this frame
    const rec = this.record(idx, raw, v, true, null, now, verCount);
    this.addToWindow(rec);

    // ── Step 4: Dominant-VALUE filter ──────────────────────────────────────
    // Only fires once we have enough valid frames to judge
    const validFrames = this.window.filter(f => f.isValid);
    if (validFrames.length >= MIN_WINDOW_FOR_DOM) {
      const domVal = this.dominantValue();
      if (domVal !== null && v.normalised !== domVal) {
        const reason = `Value outlier: '${v.normalised}' ≠ dominant '${domVal}' (seen ${verCount} vs ${this.countInWindow(domVal)} times)`;
        dbg('reject:value-outlier', reason);
        // Reset streak — this value is not the consensus
        if (this.streakValue === v.normalised) { this.streak = 0; this.streakValue = ''; }
        return { confidence:0, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
      }
    }

    // ── Step 5: Consecutive-streak check ──────────────────────────────────
    if (v.normalised === this.streakValue) {
      this.streak++;
    } else {
      this.streak     = 1;
      this.streakValue = v.normalised;
    }

    const confidence = Math.min(1, this.streak / REQUIRED_STREAK);
    const ready      = this.streak >= REQUIRED_STREAK;

    dbg('streak', { streak: this.streak, value: this.streakValue, confidence });

    if (!ready) {
      return { confidence, ready:false, acceptedCode:null, rejectedReason:null, record:rec };
    }

    // ── Step 6: Dominant-value consistency gate before final accept ────────
    // The consecutive streak must agree with the window dominant (or window too small)
    const domVal = this.dominantValue();
    if (domVal !== null && v.normalised !== domVal) {
      const reason = `Streak matches '${v.normalised}' but window dominant is '${domVal}' — scan is ambiguous`;
      dbg('reject:streak-dom-mismatch', reason);
      return { confidence, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
    }

    // ── Step 7: Debounce ──────────────────────────────────────────────────
    if (v.normalised === this.lastAcceptedValue && (now - this.lastAcceptedMs) < DEBOUNCE_MS) {
      const reason = `Debounce: '${v.normalised}' was accepted ${now - this.lastAcceptedMs}ms ago`;
      dbg('debounce', reason);
      return { confidence:1, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
    }

    // ── Accept ─────────────────────────────────────────────────────────────
    this.lastAcceptedValue = v.normalised;
    this.lastAcceptedMs    = now;
    rec.finalAcceptedValue = v.normalised;
    dbg('ACCEPTED', { code: v.normalised, streak: this.streak, verCount });

    return { confidence:1, ready:true, acceptedCode:v.normalised, rejectedReason:null, record:rec };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private addToWindow(r: FrameRecord) {
    this.window.push(r);
    if (this.window.length > WINDOW_SIZE) this.window.shift();
  }

  private validFrames(): FrameRecord[] {
    return this.window.filter(f => f.isValid && f.normalizedValue !== '');
  }

  /** Length that appears in >50% of valid window frames. */
  private dominantLength(): number | null {
    const vf = this.validFrames();
    if (vf.length < 2) return null;
    const counts = new Map<number, number>();
    vf.forEach(f => counts.set(f.length, (counts.get(f.length) ?? 0) + 1));
    let topLen = 0, topCnt = 0;
    counts.forEach((c, l) => { if (c > topCnt) { topCnt = c; topLen = l; } });
    return topCnt / vf.length >= DOMINANT_THRESHOLD ? topLen : null;
  }

  /** Complete normalized value that appears in >50% of valid window frames. */
  private dominantValue(): string | null {
    const vf = this.validFrames();
    if (vf.length < MIN_WINDOW_FOR_DOM) return null;
    const counts = new Map<string, number>();
    vf.forEach(f => counts.set(f.normalizedValue, (counts.get(f.normalizedValue) ?? 0) + 1));
    let topVal = '', topCnt = 0;
    counts.forEach((c, val) => { if (c > topCnt) { topCnt = c; topVal = val; } });
    return topCnt / vf.length >= DOMINANT_THRESHOLD ? topVal : null;
  }

  private countInWindow(value: string): number {
    return this.window.filter(f => f.isValid && f.normalizedValue === value).length;
  }

  private record(
    idx: number, raw: string, v: ValidationResult,
    isValid: boolean, reason: string | null, ts: number, verCount: number,
  ): FrameRecord {
    return {
      frameIndex: idx, rawValue: raw, normalizedValue: v.normalised,
      format: '', length: v.normalised.length, timestampMs: ts,
      validationResult: v, isValid, rejectedReason: reason,
      verificationCount: verCount, finalAcceptedValue: null,
    };
  }

  reset() {
    this.window = []; this.frameIndex = 0;
    this.streak = 0; this.streakValue = '';
    dbg('reset', 'FrameVerifier cleared');
  }

  get currentStreak()  { return this.streak; }
  get currentCode()    { return this.streakValue; }
  get windowSnapshot() { return [...this.window]; }
}

// ── Unit tests ──────────────────────────────────────────────────────────────────
const BASE = '3125130631350209';  // 16-digit Code 128

function makeEan13(first12: string): string {
  let s = 0;
  for (let i = 0; i < 12; i++) s += +first12[i] * (i % 2 === 0 ? 1 : 3);
  return first12 + ((10 - (s % 10)) % 10);
}
const VALID_EAN = makeEan13('690123456789');

interface TestCase {
  name:         string;
  inputs:       { raw: string; type: string }[];
  expectedCode: string | null;  // null = must never accept
}

function run(tc: TestCase): { ok: boolean; msg: string } {
  const v = new FrameVerifier();
  let accepted: string | null = null;
  for (const inp of tc.inputs) {
    const { ready, acceptedCode } = v.feed(inp.raw, inp.type);
    if (ready && acceptedCode !== null) { accepted = acceptedCode; break; }
  }
  const ok = accepted === tc.expectedCode;
  return {
    ok,
    msg: ok
      ? `✅ ${tc.name}`
      : `❌ ${tc.name}  expected=${JSON.stringify(tc.expectedCode)}  got=${JSON.stringify(accepted)}`,
  };
}

export function runBarcodeTests(): { passed: number; failed: number; lines: string[] } {
  const CASES: TestCase[] = [
    // A. Correct value 3+ times
    { name:'A_correct_3frames',
      inputs: [{raw:BASE,type:'code128'},{raw:BASE,type:'code128'},{raw:BASE,type:'code128'}],
      expectedCode: BASE },

    // B. Extra digit — 17 vs 16-digit dominant
    { name:'B_extra_1digit_mixed',
      inputs: [
        {raw:BASE,       type:'code128'},
        {raw:BASE,       type:'code128'},
        {raw:BASE+'1',   type:'code128'},  // outlier — 17d, dominant=16d
        {raw:BASE,       type:'code128'},  // streak resumes
        {raw:BASE,       type:'code128'},  // streak=3 → accept
      ],
      expectedCode: BASE },

    // C. Two extra digits mixed in
    { name:'C_extra_2digits_mixed',
      inputs: [
        {raw:BASE,       type:'code128'},
        {raw:BASE+'12',  type:'code128'},  // 18d outlier
        {raw:BASE,       type:'code128'},
        {raw:BASE+'9',   type:'code128'},  // 17d outlier
        {raw:BASE,       type:'code128'},
        {raw:BASE,       type:'code128'},  // streak=3
      ],
      expectedCode: BASE },

    // D. Wrong digit, same length — dominant-value filters it
    { name:'D_wrong_digit_same_length',
      inputs: [
        {raw:BASE,                    type:'code128'},
        {raw:BASE,                    type:'code128'},
        {raw:'3125130631350299',       type:'code128'}, // different digit at position 14
        {raw:BASE,                    type:'code128'},  // dominant=BASE now (3/4), value outlier
        {raw:BASE,                    type:'code128'},
        {raw:BASE,                    type:'code128'},  // streak=3, dominant=BASE
      ],
      expectedCode: BASE },

    // E. Alternating two values — must NOT accept either until one dominates
    { name:'E_alternating_never_accept',
      inputs: [
        {raw:BASE,                   type:'code128'},
        {raw:'3125130631350299',      type:'code128'},
        {raw:BASE,                   type:'code128'},
        {raw:'3125130631350299',      type:'code128'},
        // Neither dominates (50/50) — no acceptance in 4 frames
      ],
      expectedCode: null },

    // F. Garbage frames then correct value
    { name:'F_garbage_then_correct',
      inputs: [
        {raw:'abc!!!',              type:'code128'},  // invalid → rejected by validation
        {raw:'99',                  type:'code128'},  // too short
        {raw:BASE,                  type:'code128'},
        {raw:BASE,                  type:'code128'},
        {raw:BASE,                  type:'code128'},
      ],
      expectedCode: BASE },

    // G. EAN-13 — valid
    { name:'G_ean13_valid',
      inputs: [
        {raw:VALID_EAN, type:'ean13'},
        {raw:VALID_EAN, type:'ean13'},
        {raw:VALID_EAN, type:'ean13'},
      ],
      expectedCode: VALID_EAN },

    // H. EAN-13 extra digit — rejected by fixed-length rule (never accepted)
    { name:'H_ean13_extra_digit_rejected',
      inputs: [
        {raw:VALID_EAN+'5', type:'ean13'},
        {raw:VALID_EAN+'5', type:'ean13'},
        {raw:VALID_EAN+'5', type:'ean13'},
      ],
      expectedCode: null },

    // I. EAN-13 bad checksum — rejected by checksum rule
    { name:'I_ean13_bad_checksum',
      inputs: Array(3).fill({
        raw: VALID_EAN.slice(0,-1) + ((+VALID_EAN.slice(-1)+1)%10),
        type:'ean13',
      }),
      expectedCode: null },

    // J. Correct value after several wrong-digit frames (same length)
    { name:'J_correct_after_wrong_digit_frames',
      inputs: [
        {raw:'3125130631350299', type:'code128'},  // wrong digit
        {raw:'3125130631350201', type:'code128'},  // another wrong digit
        {raw:BASE,               type:'code128'},
        {raw:BASE,               type:'code128'},
        {raw:BASE,               type:'code128'},  // BASE dominates 3/5=60% → streak=3 → accept
      ],
      expectedCode: BASE },
  ];

  let passed = 0, failed = 0;
  const lines: string[] = [];
  for (const tc of CASES) {
    const { ok, msg } = run(tc);
    ok ? passed++ : failed++;
    lines.push(msg);
  }
  console.log('\n=== Barcode Tests ===');
  lines.forEach(l => console.log(l));
  console.log(`\n${passed}/${passed+failed} passed\n`);
  return { passed, failed, lines };
}
