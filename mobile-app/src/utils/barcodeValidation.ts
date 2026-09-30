/**
 * Production-grade barcode verification pipeline.
 *
 * Acceptance pipeline (in order):
 *   Decode → Format validation → Image-quality / bounds gate
 *   → Dominant-length filter → Window ingestion
 *   → Dominant-VALUE filter (outlier rejection, NOT correctness guarantee)
 *   → Consecutive-streak (3/3) → Final dominant gate → Debounce → Accept
 *
 * Invariants:
 *   • Raw decoder value is NEVER modified, trimmed, or concatenated.
 *   • Normalized value strips non-digit chars only (no length limit).
 *   • dominantValue() is an outlier-rejection heuristic, not a proof of correctness.
 *   • Acceptance means: "3 consecutive matching reads, format-valid, spatially consistent,
 *     passed all gates." NOT "mathematically 100% correct."
 *
 * Root-cause note for extra trailing digits on DLB Ada Kotipathi:
 *   Code 128 barcodes have a symbology check character that most decoders strip.
 *   When the camera captures the barcode at a slight angle or the quiet zone is
 *   narrow, some frames include the raw check symbol (a numeric digit) in the
 *   decoded output. This produces N+1 digit results on some frames.
 *   Fix: dominant-value windowing treats length-consistent but value-inconsistent
 *   frames as outliers and rejects them. A frame returning 17 digits when dominant
 *   is 16 is caught by the dominant-length gate first.
 */

// ── Debug logger ────────────────────────────────────────────────────────────────
const DEBUG = __DEV__;
export function dbg(stage: string, ...args: unknown[]) {
  if (DEBUG) console.log(`[Scanner:${stage}]`, ...args);
}

// ── Normalise raw decoder value ─────────────────────────────────────────────────
/** Strip non-digits. NEVER truncate. rawValue and normalizedValue kept separate. */
export function cleanDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

// ── Format specs ────────────────────────────────────────────────────────────────
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
export function getSpec(t: string): FormatSpec {
  return FORMAT_SPECS[t.toLowerCase()] ?? FALLBACK_SPEC;
}

// ── GS1 mod-10 checksum ─────────────────────────────────────────────────────────
export function validateGs1Checksum(digits: string): boolean {
  if (digits.length < 2) return false;
  const d = digits.split('').map(Number);
  let s = 0;
  for (let i = 0; i < d.length - 1; i++) s += d[i] * (i % 2 === 0 ? 1 : 3);
  return (10 - (s % 10)) % 10 === d[d.length - 1];
}

// ── Single-candidate validation ─────────────────────────────────────────────────
export interface ValidationResult {
  valid:      boolean;
  reason:     string | null;
  normalised: string;   // cleanDigits(raw), exact — never trimmed
  checksumOk: boolean | null;
}

export function validateCandidate(raw: string, type: string): ValidationResult {
  const digits = cleanDigits(raw);
  const spec   = getSpec(type);

  if (!digits)
    return { valid:false, reason:'Empty after normalisation', normalised:'', checksumOk:null };

  if (spec.fixedLength !== null && digits.length !== spec.fixedLength)
    return { valid:false, reason:`${spec.description}: need ${spec.fixedLength}d got ${digits.length}d`, normalised:digits, checksumOk:null };

  const [lo, hi] = spec.lengthRange;
  if (digits.length < lo || digits.length > hi)
    return { valid:false, reason:`${spec.description}: length ${digits.length} outside [${lo},${hi}]`, normalised:digits, checksumOk:null };

  if (spec.mustBeEven && digits.length % 2 !== 0)
    return { valid:false, reason:`ITF: digit count must be even, got ${digits.length}`, normalised:digits, checksumOk:null };

  if (spec.hasGs1Checksum) {
    const ok = validateGs1Checksum(digits);
    if (!ok) return { valid:false, reason:`${spec.description}: GS1 checksum invalid`, normalised:digits, checksumOk:false };
    return { valid:true, reason:null, normalised:digits, checksumOk:true };
  }

  return { valid:true, reason:null, normalised:digits, checksumOk:null };
}

// ── ROI bounds (from native decoder) ────────────────────────────────────────────
export interface RoiBounds {
  x: number; y: number; w: number; h: number;
  /** Normalised centre (0-1) relative to frame */
  cx: number; cy: number;
}

/** Euclidean distance between two ROI centres (normalised 0-1 space). */
function roiDistance(a: RoiBounds, b: RoiBounds): number {
  return Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
}

/** Quality heuristic from bounding-box size.
 *  A barcode whose ROI is < 4% of frame area is probably too far / blurry. */
function roiAreaFraction(roi: RoiBounds): number {
  return roi.w * roi.h;  // cx/cy already normalised to [0,1]
}

// ── Quality gate ────────────────────────────────────────────────────────────────
const MIN_ROI_AREA_FRACTION = 0.004;  // 0.4% of frame — if barcode is smaller, reject
const MAX_ROI_DISPLACEMENT  = 0.35;   // 35% frame diagonal — if ROI jumps this much, suspect

export interface QualityResult {
  ok:     boolean;
  reason: string | null;
}

function qualityGate(roi: RoiBounds | null, prevRoi: RoiBounds | null): QualityResult {
  if (!roi) return { ok:true, reason:null };  // no bounds info — pass through

  const area = roiAreaFraction(roi);
  if (area < MIN_ROI_AREA_FRACTION) {
    return { ok:false, reason:`ROI too small (${(area*100).toFixed(2)}% < ${(MIN_ROI_AREA_FRACTION*100).toFixed(2)}% frame) — barcode too far or blurry` };
  }

  if (prevRoi) {
    const dist = roiDistance(roi, prevRoi);
    if (dist > MAX_ROI_DISPLACEMENT) {
      return { ok:false, reason:`ROI centre jumped ${(dist*100).toFixed(1)}% of frame — camera moved or different barcode` };
    }
  }

  return { ok:true, reason:null };
}

// ── FrameRecord ─────────────────────────────────────────────────────────────────
export interface FrameRecord {
  frameIndex:         number;
  rawValue:           string;     // EXACT decoder output, never modified
  normalizedValue:    string;     // cleanDigits(rawValue), never trimmed
  format:             string;
  length:             number;
  timestampMs:        number;
  roi:                RoiBounds | null;
  qualityStatus:      QualityResult;
  validationResult:   ValidationResult;
  isValid:            boolean;
  rejectedReason:     string | null;  // first rejection reason
  verificationCount:  number;
  dominantValueAtFrame: string | null;
  streakAtFrame:      number;
  decision:           'pass' | 'reject_format' | 'reject_quality' | 'reject_length_outlier' | 'reject_value_outlier' | 'accept';
  finalAcceptedValue: string | null;
}

// ── FeedResult ──────────────────────────────────────────────────────────────────
export interface FeedResult {
  confidence:     number;
  ready:          boolean;
  acceptedCode:   string | null;
  rejectedReason: string | null;
  record:         FrameRecord;
}

// ── FrameVerifier ────────────────────────────────────────────────────────────────
const REQUIRED_STREAK    = 3;
const WINDOW_SIZE        = 10;
const DOMINANT_THRESHOLD = 0.5;  // >50% of valid frames
const MIN_DOM_WINDOW     = 4;    // wait for 4 valid frames before dominant-value gate fires
const DEBOUNCE_MS        = 2000;

export class FrameVerifier {
  private window:             FrameRecord[] = [];
  private frameIndex          = 0;
  private streak              = 0;
  private streakValue         = '';
  private prevValidRoi:       RoiBounds | null = null;
  private lastAcceptedValue   = '';
  private lastAcceptedMs      = 0;

  feed(
    raw:    string,
    type:   string,
    bounds: { origin?: { x?: number; y?: number }; size?: { width?: number; height?: number } } | null = null,
  ): FeedResult {
    const idx = ++this.frameIndex;
    const now = Date.now();

    // ── Build normalised ROI from native bounds ────────────────────────────
    let roi: RoiBounds | null = null;
    if (bounds?.origin && bounds?.size) {
      const x = bounds.origin.x  ?? 0;
      const y = bounds.origin.y  ?? 0;
      const w = bounds.size.width  ?? 0;
      const h = bounds.size.height ?? 0;
      // Normalise to [0,1] assuming expo-camera returns bounds in 0-1 space
      roi = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    }

    // ── Step 1: Format validation ─────────────────────────────────────────
    const v = validateCandidate(raw, type);

    dbg('frame', {
      idx, raw, type,
      normalised: v.normalised,
      valid: v.valid, reason: v.reason, checksumOk: v.checksumOk,
      roi, streak: this.streak, streakValue: this.streakValue,
    });

    if (!v.valid) {
      const rec = this.makeRecord(idx, raw, type, v, false, 'reject_format', v.reason, roi, now, 0, null, 0, null);
      this.addToWindow(rec);
      this.streak = 0; this.streakValue = '';
      return { confidence:0, ready:false, acceptedCode:null, rejectedReason:v.reason, record:rec };
    }

    // ── Step 2: Image-quality / ROI gate ─────────────────────────────────
    const quality = qualityGate(roi, this.prevValidRoi);
    if (!quality.ok) {
      dbg('reject:quality', quality.reason);
      const rec = this.makeRecord(idx, raw, type, v, false, 'reject_quality', quality.reason, roi, now, 0, null, this.streak, null);
      this.addToWindow(rec);
      // Don't reset streak — quality issue doesn't imply wrong value
      return { confidence: this.streak / REQUIRED_STREAK, ready:false, acceptedCode:null, rejectedReason:quality.reason, record:rec };
    }
    this.prevValidRoi = roi ?? this.prevValidRoi;

    // ── Step 3: Dominant-length filter (variable-length formats only) ─────
    const spec = getSpec(type);
    if (spec.fixedLength === null) {
      const domLen = this.dominantLength();
      if (domLen !== null && v.normalised.length !== domLen) {
        const reason = `Length outlier: got ${v.normalised.length}d, window dominant=${domLen}d`;
        dbg('reject:length-outlier', reason);
        const rec = this.makeRecord(idx, raw, type, v, false, 'reject_length_outlier', reason, roi, now, 0, null, 0, null);
        this.addToWindow(rec);
        this.streak = 0; this.streakValue = '';
        return { confidence:0, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
      }
    }

    // ── Step 4: Add valid frame to window ────────────────────────────────
    const verCount = this.countInWindow(v.normalised) + 1;
    const domValNow = this.dominantValue(); // capture BEFORE adding this frame
    const rec = this.makeRecord(idx, raw, type, v, true, 'pass', null, roi, now, verCount, domValNow, this.streak + 1, null);
    this.addToWindow(rec);

    // ── Step 5: Dominant-VALUE filter (outlier rejection, not correctness) ─
    const validCount = this.validFrameCount();
    if (validCount >= MIN_DOM_WINDOW) {
      const domVal = this.dominantValue();
      if (domVal !== null && v.normalised !== domVal) {
        const cnt    = this.countInWindow(v.normalised);
        const domCnt = this.countInWindow(domVal);
        const reason = `Value outlier: '${v.normalised}' (${cnt}×) ≠ dominant '${domVal}' (${domCnt}×)`;
        dbg('reject:value-outlier', reason);
        rec.rejectedReason = reason;
        rec.decision       = 'reject_value_outlier';
        rec.isValid        = false;
        if (this.streakValue === v.normalised) { this.streak = 0; this.streakValue = ''; }
        return { confidence:0, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
      }
    }

    // ── Step 6: Consecutive streak ───────────────────────────────────────
    if (v.normalised === this.streakValue) {
      this.streak++;
    } else {
      this.streak     = 1;
      this.streakValue = v.normalised;
    }
    rec.streakAtFrame = this.streak;

    const confidence = Math.min(1, this.streak / REQUIRED_STREAK);
    const ready      = this.streak >= REQUIRED_STREAK;

    dbg('streak', { streak: this.streak, value: this.streakValue, confidence });

    if (!ready) {
      return { confidence, ready:false, acceptedCode:null, rejectedReason:null, record:rec };
    }

    // ── Step 7: Final dominant gate (streak must agree with consensus) ────
    const finalDom = this.dominantValue();
    if (finalDom !== null && v.normalised !== finalDom) {
      const reason = `Streak '${v.normalised}' ≠ window dominant '${finalDom}' — scan ambiguous`;
      dbg('reject:final-dom-mismatch', reason);
      rec.rejectedReason = reason;
      return { confidence, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
    }

    // ── Step 8: Debounce ─────────────────────────────────────────────────
    if (v.normalised === this.lastAcceptedValue && (now - this.lastAcceptedMs) < DEBOUNCE_MS) {
      const reason = `Debounce: '${v.normalised}' accepted ${now - this.lastAcceptedMs}ms ago`;
      dbg('debounce', reason);
      return { confidence:1, ready:false, acceptedCode:null, rejectedReason:reason, record:rec };
    }

    // ── Accept ────────────────────────────────────────────────────────────
    this.lastAcceptedValue = v.normalised;
    this.lastAcceptedMs    = now;
    rec.finalAcceptedValue = v.normalised;
    rec.decision           = 'accept';
    dbg('ACCEPT', { code: v.normalised, streak: this.streak, verCount, roi });

    return { confidence:1, ready:true, acceptedCode:v.normalised, rejectedReason:null, record:rec };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  private addToWindow(r: FrameRecord) {
    this.window.push(r);
    if (this.window.length > WINDOW_SIZE) this.window.shift();
  }
  private validFrames()  { return this.window.filter(f => f.isValid && f.normalizedValue); }
  private validFrameCount() { return this.validFrames().length; }

  private dominantLength(): number | null {
    const vf = this.validFrames();
    if (vf.length < 2) return null;
    const c = new Map<number,number>();
    vf.forEach(f => c.set(f.length, (c.get(f.length)??0)+1));
    let top=0, tl=0; c.forEach((n,l)=>{ if(n>top){top=n;tl=l;} });
    return top/vf.length >= DOMINANT_THRESHOLD ? tl : null;
  }

  /** dominantValue() is an outlier-rejection heuristic, NOT a correctness guarantee. */
  private dominantValue(): string | null {
    const vf = this.validFrames();
    if (vf.length < MIN_DOM_WINDOW) return null;
    const c = new Map<string,number>();
    vf.forEach(f => c.set(f.normalizedValue, (c.get(f.normalizedValue)??0)+1));
    let top=0, tv=''; c.forEach((n,v)=>{ if(n>top){top=n;tv=v;} });
    return top/vf.length >= DOMINANT_THRESHOLD ? tv : null;
  }

  private countInWindow(v: string) { return this.window.filter(f=>f.isValid&&f.normalizedValue===v).length; }

  private makeRecord(
    idx:number, raw:string, type:string, v:ValidationResult,
    isValid:boolean, decision:FrameRecord['decision'], reason:string|null,
    roi:RoiBounds|null, ts:number, verCount:number,
    domVal:string|null, streak:number, finalAccepted:string|null,
  ): FrameRecord {
    return {
      frameIndex:idx, rawValue:raw, normalizedValue:v.normalised,
      format:type, length:v.normalised.length, timestampMs:ts, roi,
      qualityStatus:{ok:isValid||decision==='reject_format', reason:null},
      validationResult:v, isValid, rejectedReason:reason,
      verificationCount:verCount, dominantValueAtFrame:domVal,
      streakAtFrame:streak, decision, finalAcceptedValue:finalAccepted,
    };
  }

  reset() {
    this.window=[]; this.frameIndex=0; this.streak=0; this.streakValue='';
    this.prevValidRoi=null;
    dbg('reset','FrameVerifier cleared');
  }

  /** Print a full diagnostic table of the current window (for real-device debugging). */
  dumpWindow() {
    if (!DEBUG) return;
    console.log('\n── Barcode Window Dump ──────────────────────────────────');
    console.log('F#  | RAW                       | NORM             | FMT     | ROI-cx,cy  | DECISION            | STK | DOM');
    console.log('────|───────────────────────────|──────────────────|─────────|────────────|─────────────────────|─────|──────────────────');
    this.window.forEach(r => {
      const cx  = r.roi ? r.roi.cx.toFixed(2) : ' n/a';
      const cy  = r.roi ? r.roi.cy.toFixed(2) : ' n/a';
      const dom = r.dominantValueAtFrame ?? '---';
      console.log(
        String(r.frameIndex).padEnd(3),
        '|', (r.rawValue       ).padEnd(25),
        '|', (r.normalizedValue).padEnd(16),
        '|', (r.format         ).padEnd(7),
        '|', `${cx},${cy}`.padEnd(10),
        '|', (r.decision       ).padEnd(21),
        '|', String(r.streakAtFrame).padEnd(3),
        '|', dom,
      );
    });
    console.log('──────────────────────────────────────────────────────────\n');
  }

  get currentStreak()  { return this.streak; }
  get currentCode()    { return this.streakValue; }
  get windowSnapshot() { return [...this.window]; }
}

// ── Unit tests ───────────────────────────────────────────────────────────────────
const BASE     = '3125130631350209';
const WRONG_D  = '3125130631350299';  // same length, one different digit
const EXTRA1   = BASE + '1';          // 17 digits
const EXTRA2   = BASE + '12';         // 18 digits
const EXTRA3   = BASE + '123';        // 19 digits
const TYPE     = 'code128';

function makeEan13(first12: string): string {
  let s = 0;
  for (let i = 0; i < 12; i++) s += +first12[i] * (i % 2 === 0 ? 1 : 3);
  return first12 + ((10 - (s % 10)) % 10);
}
const VALID_EAN = makeEan13('690123456789');

interface TestCase { name:string; inputs:{raw:string;type:string}[]; expected:string|null }

function runOne(tc: TestCase): { ok:boolean; msg:string } {
  const v = new FrameVerifier();
  let accepted: string|null = null;
  for (const i of tc.inputs) {
    const {ready,acceptedCode} = v.feed(i.raw, i.type);
    if (ready && acceptedCode) { accepted = acceptedCode; break; }
  }
  const ok = accepted === tc.expected;
  return { ok, msg: ok
    ? `✅ ${tc.name}`
    : `❌ ${tc.name}  expected=${JSON.stringify(tc.expected)}  got=${JSON.stringify(accepted)}` };
}

export function runBarcodeTests(): {passed:number;failed:number;lines:string[]} {
  const CASES: TestCase[] = [
    // A. Correct value 3 frames → accept
    { name:'A_correct_3frames',
      inputs:[{raw:BASE,type:TYPE},{raw:BASE,type:TYPE},{raw:BASE,type:TYPE}],
      expected:BASE },

    // B. Extra trailing digit mixed in — length-outlier gate blocks it
    { name:'B_extra_1digit_mixed',
      inputs:[
        {raw:BASE,  type:TYPE},{raw:BASE,  type:TYPE},
        {raw:EXTRA1,type:TYPE},   // 17d → length outlier
        {raw:BASE,  type:TYPE},{raw:BASE,  type:TYPE},
      ],
      expected:BASE },

    // C. Two extra trailing digits mixed in
    { name:'C_extra_2digits_mixed',
      inputs:[
        {raw:BASE,  type:TYPE},{raw:BASE,  type:TYPE},
        {raw:EXTRA2,type:TYPE},{raw:EXTRA1,type:TYPE},
        {raw:BASE,  type:TYPE},{raw:BASE,  type:TYPE},
      ],
      expected:BASE },

    // D. Three extra trailing digits mixed in
    { name:'D_extra_3digits_mixed',
      inputs:[
        {raw:BASE,  type:TYPE},{raw:EXTRA3,type:TYPE},
        {raw:BASE,  type:TYPE},{raw:EXTRA2,type:TYPE},
        {raw:BASE,  type:TYPE},{raw:BASE,  type:TYPE},
      ],
      expected:BASE },

    // E. One wrong digit, same length — value-outlier gate blocks it
    { name:'E_wrong_digit_same_length',
      inputs:[
        {raw:BASE,   type:TYPE},{raw:BASE,   type:TYPE},
        {raw:WRONG_D,type:TYPE},
        {raw:BASE,   type:TYPE},{raw:BASE,   type:TYPE},{raw:BASE,type:TYPE},
      ],
      expected:BASE },

    // F. Alternating two values — neither dominates (50/50), no accept in 6 frames
    { name:'F_alternating_no_accept',
      inputs:[
        {raw:BASE,   type:TYPE},{raw:WRONG_D,type:TYPE},
        {raw:BASE,   type:TYPE},{raw:WRONG_D,type:TYPE},
        {raw:BASE,   type:TYPE},{raw:WRONG_D,type:TYPE},
      ],
      expected:null },

    // G. Intermittent garbage frames (format-invalid) between correct
    { name:'G_garbage_intermittent',
      inputs:[
        {raw:'!!!',  type:TYPE},{raw:BASE,  type:TYPE},
        {raw:'99',   type:TYPE},{raw:BASE,  type:TYPE},
        {raw:'???',  type:TYPE},{raw:BASE,  type:TYPE},
      ],
      expected:BASE },

    // H. Correct value after multiple bad frames
    { name:'H_correct_after_bad',
      inputs:[
        {raw:WRONG_D,type:TYPE},{raw:EXTRA1,type:TYPE},{raw:WRONG_D,type:TYPE},
        {raw:BASE,   type:TYPE},{raw:BASE,  type:TYPE},{raw:BASE,   type:TYPE},
      ],
      expected:BASE },

    // I. EAN-13 valid
    { name:'I_ean13_valid',
      inputs:Array(3).fill({raw:VALID_EAN,type:'ean13'}),
      expected:VALID_EAN },

    // J. EAN-13 extra digit — fixed-length rejects all frames
    { name:'J_ean13_extra_digit',
      inputs:Array(3).fill({raw:VALID_EAN+'5',type:'ean13'}),
      expected:null },

    // K. EAN-13 bad checksum
    { name:'K_ean13_bad_checksum',
      inputs:Array(3).fill({
        raw:VALID_EAN.slice(0,-1)+(( +VALID_EAN.slice(-1)+1)%10),
        type:'ean13',
      }),
      expected:null },

    // L. Multiple barcodes scenario — first stable one wins
    { name:'L_two_barcodes_alternating_then_stable',
      inputs:[
        {raw:'111111111',type:TYPE},{raw:BASE,type:TYPE},
        {raw:'111111111',type:TYPE},
        {raw:BASE,type:TYPE},{raw:BASE,type:TYPE},{raw:BASE,type:TYPE},
      ],
      expected:BASE },
  ];

  let passed=0, failed=0;
  const lines: string[] = [];
  for (const tc of CASES) {
    const {ok,msg} = runOne(tc);
    ok ? passed++ : failed++;
    lines.push(msg);
  }
  console.log('\n=== Barcode Tests ===');
  lines.forEach(l=>console.log(l));
  console.log(`\n${passed}/${passed+failed} passed\n`);
  return {passed,failed,lines};
}
