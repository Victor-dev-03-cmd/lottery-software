import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen }  from "@tauri-apps/api/event";
import {
  RefreshCw, Home, ChevronRight, Wifi, WifiOff,
  Calendar, Hash, Trophy, Star, Edit3, X, Zap, CheckCircle, Database,
} from "lucide-react";
import type { LotteryResult } from "../types";
import { saveLotteryResult, getLatestLotteryResult, getLotteryResultByDate } from "../services/database";
import { pushResultToCloud, pullResultsFromCloud, subscribeToCloudUpdates } from "../services/supabase";

// ── Game catalog ──────────────────────────────────────────────────────────────

interface GameInfo {
  slug: string; name: string; nameLocal: string; days: string;
  gradient: string; glow: string; board: "NLB" | "DLB";
  hasLetter: boolean; numberCount: number; hasSuperNum: boolean;
  jackpot?: string;
}

// ── NLB games — 8 active games from nlb.lk ───────────────────────────────────
const NLB_GAMES: GameInfo[] = [
  { slug:"ada-sampatha",      name:"Ada Sampatha",      nameLocal:"අද සම්පත",    days:"Daily",   gradient:"linear-gradient(135deg,#831843,#ec4899)", glow:"#ec4899", board:"NLB", hasLetter:true, numberCount:6, hasSuperNum:false, jackpot:"Rs. 4M"   },
  { slug:"govisetha",         name:"Govisetha",         nameLocal:"ගොවිසෙත",     days:"Thu",     gradient:"linear-gradient(135deg,#14532d,#22c55e)", glow:"#22c55e", board:"NLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 3M"   },
  { slug:"mega-power",        name:"Mega Power",        nameLocal:"මෙගා පවර්",    days:"Daily",   gradient:"linear-gradient(135deg,#7f1d1d,#CF291D)",  glow:"#CF291D", board:"NLB", hasLetter:true, numberCount:5, hasSuperNum:false, jackpot:"Rs. 304M" },
  { slug:"nlb-jaya",          name:"NLB Jaya",          nameLocal:"NLB ජය",       days:"Tue",     gradient:"linear-gradient(135deg,#1f2937,#6b7280)", glow:"#9ca3af", board:"NLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 500k" },
  { slug:"handahana",         name:"Handahana",         nameLocal:"හද හන",       days:"Tue",     gradient:"linear-gradient(135deg,#78350f,#fb923c)", glow:"#fb923c", board:"NLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 2M"   },
  { slug:"mahajana-sampatha", name:"Mahajana Sampatha", nameLocal:"මහජන සම්පත",  days:"Tue/Sat", gradient:"linear-gradient(135deg,#1e40af,#3b82f6)", glow:"#3b82f6", board:"NLB", hasLetter:true, numberCount:6, hasSuperNum:true,  jackpot:"Rs. 10M"  },
  { slug:"dhana-nidhanaya",   name:"Dhana Nidhanaya",   nameLocal:"ධන නිධානය",    days:"Thu",     gradient:"linear-gradient(135deg,#92400e,#f59e0b)", glow:"#f59e0b", board:"NLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 5M"   },
  { slug:"suba-dawasak",      name:"Suba Dawasak",      nameLocal:"සුබ දවසක",    days:"Daily",   gradient:"linear-gradient(135deg,#064e3b,#34d399)", glow:"#34d399", board:"NLB", hasLetter:true, numberCount:3, hasSuperNum:false, jackpot:"Rs. 1M"   },
];

// ── DLB games — 8 active games from dlb.lk ───────────────────────────────────
const DLB_GAMES: GameInfo[] = [
  { slug:"dlb-sasiri",                name:"Sasiri",                nameLocal:"සාසිරි",          days:"Thu",     gradient:"linear-gradient(135deg,#064e3b,#22c55e)", glow:"#22c55e", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 3M"   },
  { slug:"dlb-lagna-wasana",          name:"Lagna Wasana",          nameLocal:"ලග්න වාසන",       days:"Wed",     gradient:"linear-gradient(135deg,#1e3a5f,#3b82f6)", glow:"#3b82f6", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 4M"   },
  { slug:"dlb-shanida",               name:"Shanida",               nameLocal:"ශනිද",             days:"Sat",     gradient:"linear-gradient(135deg,#4c1d95,#a78bfa)", glow:"#a78bfa", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 8M"   },
  { slug:"dlb-ada-kotipathi",         name:"Ada Kotipathi",         nameLocal:"අද කෝටිපති",      days:"Daily",   gradient:"linear-gradient(135deg,#991b1b,#ef4444)", glow:"#ef4444", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 50M"  },
  { slug:"dlb-supiri-dhana-sampatha", name:"Supiri Dhana Sampatha", nameLocal:"සුපිරි ධන සම්පත",  days:"Sat",     gradient:"linear-gradient(135deg,#831843,#ec4899)", glow:"#ec4899", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 10M"  },
  { slug:"dlb-super-ball",            name:"Super Ball",            nameLocal:"සුපර් බෝල",        days:"Sat",     gradient:"linear-gradient(135deg,#1e40af,#6366f1)", glow:"#6366f1", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 6M"   },
  { slug:"dlb-kapruka",               name:"Kapruka",               nameLocal:"කප්රුක",           days:"Tue",     gradient:"linear-gradient(135deg,#134e4a,#14b8a6)", glow:"#14b8a6", board:"DLB", hasLetter:true, numberCount:5, hasSuperNum:false, jackpot:"Rs. 5M"   },
  { slug:"dlb-jaya-sampatha",         name:"Jaya Sampatha",         nameLocal:"ජය සම්පත",         days:"Mon",     gradient:"linear-gradient(135deg,#78350f,#f59e0b)", glow:"#f59e0b", board:"DLB", hasLetter:true, numberCount:4, hasSuperNum:false, jackpot:"Rs. 2M"   },
];

const PRIZE_TABLES: Record<string, { rank: string; prize: string; match_desc: string; medal: string; highlight?: boolean }[]> = {
  "mahajana-sampatha": [
    { rank:"1st Prize",  prize:"Rs. 10,000,000", match_desc:"Letter + 4 digits + Super No.", medal:"🥇", highlight:true },
    { rank:"2nd Prize",  prize:"Rs. 250,000",    match_desc:"Letter + 4 digits",             medal:"🥈" },
    { rank:"3rd Prize",  prize:"Rs. 40,000",     match_desc:"Letter + 3 consecutive digits", medal:"🥉" },
    { rank:"4th Prize",  prize:"Rs. 10,000",     match_desc:"Letter + first/last 3 digits",  medal:"4️⃣" },
    { rank:"5th Prize",  prize:"Rs. 2,000",      match_desc:"Any 3 consecutive digits",      medal:"5️⃣" },
    { rank:"Super No.",  prize:"Rs. 40",         match_desc:"Super number match only",       medal:"⭐" },
  ],
  "dlb-ada-kotipathi": [
    { rank:"1st Prize",  prize:"Rs. 50,000,000", match_desc:"Letter + 4 digits + Super No.", medal:"🥇", highlight:true },
    { rank:"2nd Prize",  prize:"Rs. 1,000,000",  match_desc:"Letter + 4 digits",             medal:"🥈" },
    { rank:"3rd Prize",  prize:"Rs. 100,000",    match_desc:"Letter + 3 consecutive digits", medal:"🥉" },
    { rank:"4th Prize",  prize:"Rs. 20,000",     match_desc:"Any 3 consecutive digits",      medal:"4️⃣" },
    { rank:"Super No.",  prize:"Rs. 200",        match_desc:"Super number match only",       medal:"⭐" },
  ],
  "mega-power": [
    { rank:"Super Prize", prize:"Rs. 304,455,994", match_desc:"Letter + all 5 numbers",      medal:"🥇", highlight:true },
    { rank:"1st Prize",   prize:"Rs. 2,000,000",   match_desc:"Letter + any 4 of 5 numbers", medal:"🥈" },
    { rank:"2nd Prize",   prize:"Rs. 100,000",     match_desc:"Letter + any 3 of 5 numbers", medal:"🥉" },
    { rank:"3rd Prize",   prize:"Rs. 4,000",       match_desc:"Letter + any 2 of 5 numbers", medal:"4️⃣" },
    { rank:"4th Prize",   prize:"Rs. 200",         match_desc:"Letter only",                 medal:"5️⃣" },
    { rank:"5th Prize",   prize:"Rs. 100",         match_desc:"Any 2 of 5 numbers",          medal:"⭐" },
  ],
  "dlb-lagna-wasana": [
    { rank:"1st Prize",  prize:"Rs. 5,000,000",  match_desc:"Letter + 4 digits",             medal:"🥇", highlight:true },
    { rank:"2nd Prize",  prize:"Rs. 100,000",    match_desc:"Letter + 3 consecutive digits", medal:"🥈" },
    { rank:"3rd Prize",  prize:"Rs. 20,000",     match_desc:"Letter + first/last 3 digits",  medal:"🥉" },
    { rank:"4th Prize",  prize:"Rs. 2,000",      match_desc:"Any 3 consecutive digits",      medal:"4️⃣" },
  ],
};

// ── Manual entry state ────────────────────────────────────────────────────────

// ── Colour palette for auto-assigned gradients on new/unknown games ───────────
// Game lists are purely from hardcoded NLB_GAMES / DLB_GAMES — no DB override.

/** Return a deduplicated array of GameInfo by slug (keeps first occurrence). */
function dedupeBySlug(games: GameInfo[]): GameInfo[] {
  const seen = new Set<string>();
  return games.filter(g => {
    if (seen.has(g.slug)) return false;
    seen.add(g.slug);
    return true;
  });
}

// Mock data removed — all results come from live fetch → SQLite or manual entry.

// ── Manual entry state ────────────────────────────────────────────────────────

interface ManualEntry {
  letter: string;
  numbers: string[];
  superNum: string;
  drawDate: string;
  drawNumber: string;
  customPrizes: { rank: string; prize: string; match_desc: string }[];
}

function defaultManual(g: GameInfo): ManualEntry {
  const base = PRIZE_TABLES[g.slug] ?? [];
  return {
    letter: "", numbers: Array(g.numberCount).fill(""), superNum: "",
    drawDate: new Date().toISOString().split("T")[0], drawNumber: "",
    customPrizes: base.length > 0
      ? base.map(p => ({ rank:p.rank, prize:p.prize, match_desc:p.match_desc }))
      : [{ rank:"1st Prize", prize:"", match_desc:"" }],
  };
}

// ── Winning Ball Components ───────────────────────────────────────────────────

function LetterBall({ letter, gradient, glow }: { letter:string; gradient:string; glow:string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-full" style={{
          background: gradient, filter:"blur(8px)", opacity:0.5, transform:"scale(1.15)"
        }}/>
        {/* Ball */}
        <div className="relative w-20 h-20 rounded-full flex items-center justify-center font-black text-3xl text-white"
          style={{
            background: gradient,
            boxShadow: `0 0 0 3px #fff, 0 0 0 6px ${glow}80, 0 12px 32px ${glow}50`,
          }}>
          {letter || "?"}
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
        style={{ background:`${glow}18`, color:glow }}>
        Letter
      </span>
    </div>
  );
}

function NumberBall({ number, index, glow, isEmpty }: {
  number:string; index:number; glow:string; isEmpty?:boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl relative"
        style={{
          background: isEmpty ? "transparent" : "#FFFFFF",
          border: isEmpty ? `3px dashed #D1D5DB` : `4px solid ${glow}`,
          color: isEmpty ? "#D1D5DB" : glow,
          boxShadow: isEmpty ? "none" : `inset 0 2px 4px rgba(255,255,255,0.8), 0 4px 16px ${glow}25`,
        }}>
        {/* Shine effect */}
        {!isEmpty && (
          <div className="absolute top-2 left-3 w-6 h-3 rounded-full opacity-30"
            style={{ background:"linear-gradient(135deg,#fff,transparent)" }}/>
        )}
        {number || "?"}
      </div>
      <span className="text-[10px] font-semibold" style={{ color:"#BFBFBF" }}>
        #{index + 1}
      </span>
    </div>
  );
}

function SuperBall({ number }: { number:string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div className="absolute inset-0 rounded-full"
          style={{ background:"#f59e0b", filter:"blur(8px)", opacity:0.4, transform:"scale(1.15)" }}/>
        <div className="relative w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl text-white"
          style={{
            background:"linear-gradient(135deg,#92400e,#d97706,#f59e0b)",
            boxShadow:"0 0 0 3px #fff, 0 0 0 6px #f59e0b80, 0 12px 32px #f59e0b50",
          }}>
          <div className="absolute top-2 left-3 w-6 h-3 rounded-full opacity-30"
            style={{ background:"linear-gradient(135deg,#fff,transparent)" }}/>
          {number || "?"}
        </div>
      </div>
      <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full"
        style={{ background:"#fef3c7", color:"#92400e" }}>
        <Star size={9} fill="#92400e"/> Super No.
      </span>
    </div>
  );
}

function BallSeparator() {
  return <div className="w-px h-16 self-center mx-2" style={{ background:"#E8E8E8" }}/>;
}

// ── Manual Entry Modal ────────────────────────────────────────────────────────

interface ModalProps {
  game: GameInfo;
  initialResult?: LotteryResult | null; // pre-fill when editing existing result
  onSave: (r: LotteryResult) => Promise<void>;
  onClose: () => void;
}

function ManualEntryModal({ game, initialResult, onSave, onClose }: ModalProps) {
  const [entry, setEntry] = useState<ManualEntry>(() => {
    if (initialResult && !initialResult.error && initialResult.source_url !== "sample") {
      // Pre-fill from existing result
      const nums = [...initialResult.winning_numbers];
      while (nums.length < game.numberCount) nums.push("");
      return {
        letter:      initialResult.winning_letter,
        numbers:     nums,
        superNum:    initialResult.super_number,
        drawDate:    initialResult.draw_date || new Date().toISOString().split("T")[0],
        drawNumber:  initialResult.draw_number,
        customPrizes: initialResult.prizes.length > 0
          ? initialResult.prizes.map(p => ({ rank:p.rank, prize:p.prize, match_desc:p.match_desc }))
          : (PRIZE_TABLES[game.slug] ?? []).map(p => ({ rank:p.rank, prize:p.prize, match_desc:p.match_desc })),
      };
    }
    return defaultManual(game);
  });
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function setNum(i: number, v: string) {
    const nums = [...entry.numbers];
    nums[i] = v.replace(/\D/g, "").slice(0, 5);
    setEntry({ ...entry, numbers: nums });
  }

  function handleSave() {
    if (!entry.numbers.some(n => n.trim())) {
      alert("Enter at least one winning number."); return;
    }
    onSave({
      game_slug:       game.slug,   // authoritative key used for SQLite keying
      game_name:       game.name,
      board:           game.board,
      draw_number:     entry.drawNumber,
      draw_date:       entry.drawDate,
      winning_letter:  entry.letter.toUpperCase(),
      winning_numbers: entry.numbers.filter(n => n.trim()),
      super_number:    entry.superNum,
      prizes:          entry.customPrizes.filter(p => p.rank.trim()),
      source_url:      "Manual entry",
      fetched_at:      new Date().toISOString(),
      error:           "",
    });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[300] px-4"
      style={{ background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background:"#FFFFFF", border:`2px solid ${game.glow}30`,
          boxShadow:`0 0 0 1px ${game.glow}20, 0 32px 80px rgba(0,0,0,0.4)` }}>

        {/* Modal header */}
        <div className="px-5 py-4 flex items-start justify-between"
          style={{ background:game.gradient }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Trophy size={18} className="text-white/80"/>
              <span className="text-xs font-bold text-white/70 uppercase tracking-widest">
                {initialResult && initialResult.source_url !== "sample" ? "Edit Result" : "Manual Entry"}
              </span>
            </div>
            <h2 className="font-black text-lg text-white">{game.name}</h2>
            <p className="text-xs text-white/70 mt-0.5">{game.nameLocal} · {game.board}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
            style={{ background:"rgba(255,255,255,0.2)" }}>
            <X size={16} className="text-white"/>
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto" style={{ maxHeight:"calc(100vh - 200px)" }}>

          {/* Draw info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mlbl">Draw Number</label>
              <input ref={firstRef} value={entry.drawNumber}
                onChange={e => setEntry({ ...entry, drawNumber:e.target.value })}
                placeholder="e.g. 4023" className="mfld"/>
            </div>
            <div>
              <label className="mlbl">Draw Date</label>
              <input type="date" value={entry.drawDate}
                onChange={e => setEntry({ ...entry, drawDate:e.target.value })}
                className="mfld"/>
            </div>
          </div>

          {/* Winning numbers — ball-style inputs */}
          <div>
            <label className="mlbl block mb-3">Winning Result</label>
            <div className="flex items-end gap-3 flex-wrap">

              {/* Letter input */}
              {game.hasLetter && (
                <div className="flex flex-col items-center gap-1.5">
                  <input value={entry.letter}
                    onChange={e => setEntry({ ...entry, letter:e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,2) })}
                    placeholder="A"
                    className="w-14 h-14 rounded-full text-center font-black text-xl focus:outline-none transition-all"
                    style={{
                      border: `3px solid ${entry.letter ? game.glow : "#E8E8E8"}`,
                      background: entry.letter ? `${game.glow}12` : "#FAFAFA",
                      color: game.glow,
                      boxShadow: entry.letter ? `0 0 0 4px ${game.glow}18` : "none",
                    }}/>
                  <span className="text-[9px] font-bold uppercase" style={{ color:"#9CA3AF" }}>Letter</span>
                </div>
              )}

              {game.hasLetter && <div className="w-px h-10 self-center" style={{ background:"#E8E8E8" }}/>}

              {/* Number inputs */}
              {entry.numbers.map((n, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <input value={n}
                    onChange={e => setNum(i, e.target.value)}
                    placeholder={`${i+1}`}
                    className="w-14 h-14 rounded-full text-center font-black text-xl focus:outline-none transition-all"
                    style={{
                      border: `3px solid ${n ? game.glow : "#E8E8E8"}`,
                      background: n ? "#FFFFFF" : "#FAFAFA",
                      color: game.glow,
                      boxShadow: n ? `0 0 0 4px ${game.glow}18` : "none",
                    }}/>
                  <span className="text-[9px] font-bold uppercase" style={{ color:"#9CA3AF" }}>#{i+1}</span>
                </div>
              ))}

              {/* Super number */}
              {game.hasSuperNum && (
                <>
                  <div className="w-px h-10 self-center" style={{ background:"#E8E8E8" }}/>
                  <div className="flex flex-col items-center gap-1.5">
                    <input value={entry.superNum}
                      onChange={e => setEntry({ ...entry, superNum:e.target.value.replace(/\D/g,"").slice(0,3) })}
                      placeholder="★"
                      className="w-14 h-14 rounded-full text-center font-black text-xl focus:outline-none transition-all"
                      style={{
                        border: `3px solid ${entry.superNum ? "#f59e0b" : "#E8E8E8"}`,
                        background: entry.superNum ? "#fef3c7" : "#FAFAFA",
                        color: "#92400e",
                        boxShadow: entry.superNum ? "0 0 0 4px #f59e0b20" : "none",
                      }}/>
                    <span className="text-[9px] font-bold uppercase" style={{ color:"#B45309" }}>Super</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Prize amounts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="mlbl">Prize Structure</label>
              <button
                onClick={() => setEntry({
                  ...entry,
                  customPrizes:[...entry.customPrizes, { rank:"", prize:"", match_desc:"" }]
                })}
                className="text-xs font-semibold hover:underline" style={{ color:game.glow }}>
                + Add row
              </button>
            </div>
            <div className="space-y-2">
              {entry.customPrizes.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={p.rank} onChange={e => {
                    const cp=[...entry.customPrizes]; cp[i]={...cp[i],rank:e.target.value}; setEntry({...entry,customPrizes:cp});
                  }} placeholder="1st Prize" className="mfld" style={{ width:120 }}/>
                  <input value={p.prize} onChange={e => {
                    const cp=[...entry.customPrizes]; cp[i]={...cp[i],prize:e.target.value}; setEntry({...entry,customPrizes:cp});
                  }} placeholder="Rs. 10,000,000" className="mfld flex-1"/>
                  <input value={p.match_desc} onChange={e => {
                    const cp=[...entry.customPrizes]; cp[i]={...cp[i],match_desc:e.target.value}; setEntry({...entry,customPrizes:cp});
                  }} placeholder="Matching criteria" className="mfld flex-1"/>
                  {entry.customPrizes.length > 1 && (
                    <button onClick={() => {
                      setEntry({...entry,customPrizes:entry.customPrizes.filter((_,j)=>j!==i)});
                    }} style={{ color:"#CF291D" }}><X size={14}/></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2" style={{ borderTop:"1px solid #F3F4F6" }}>
            <button onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background:game.gradient,
                boxShadow:`0 4px 14px ${game.glow}35` }}>
              <CheckCircle size={16}/> Save & Display Results
            </button>
            <button onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-medium transition-all hover:bg-gray-50"
              style={{ background:"#F9F9F9", border:"1px solid #E8E8E8", color:"#374151" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .mlbl { display:block; font-size:.68rem; color:#9CA3AF; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:.3rem; }
        .mfld { border:1px solid #E8E8E8; border-radius:.6rem; padding:.4rem .65rem; font-size:.85rem; background:#FAFAFA; outline:none; transition:border-color .15s,box-shadow .15s; }
        .mfld:focus { border-color:#CF291D; box-shadow:0 0 0 3px rgba(207,41,29,.1); }
      `}</style>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LiveResults() {
  const [board, setBoard]           = useState<"NLB" | "DLB">("NLB");
  const [selectedGame, setSelected] = useState<GameInfo>(NLB_GAMES[0]);
  const [result, setResult]         = useState<LotteryResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editMode, setEditMode]     = useState(false); // true = editing existing result
  const [hoveredGame, setHovered]   = useState<string | null>(null);
  const [savedIndicator, setSaved]  = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [cloudSynced, setCloudSynced]   = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [drawNumber, setDrawNumber]     = useState("");  // optional draw number filter
  const [dateNotFound, setDateNotFound] = useState(false);
  const [nlbGames, setNlbGames]     = useState<GameInfo[]>(() => dedupeBySlug(NLB_GAMES));
  const [dlbGames, setDlbGames]     = useState<GameInfo[]>(() => dedupeBySlug(DLB_GAMES));

  const games = board === "NLB" ? nlbGames : dlbGames;

  // ── Game lists: use hardcoded NLB_GAMES / DLB_GAMES as the single source of truth.
  // DB lottery_games table tracks ticket prices for invoicing — not for live results.
  // This guarantees NLB and DLB tabs always show the correct, separated game sets.
  useEffect(() => {
    // Just ensure deduped hardcoded lists are set (already initialised in useState).
    setNlbGames(dedupeBySlug(NLB_GAMES));
    setDlbGames(dedupeBySlug(DLB_GAMES));
  }, []);

  // ── Background sync: start worker on mount + listen for pushed results ───────
  useEffect(() => {
    invoke("start_background_sync").catch(() => {});
    invoke("start_api_server").catch(() => {});

    // ── Supabase: pull cloud → local SQLite on mount (non-blocking) ────────────
    pullResultsFromCloud(async (r, slug) => {
      try { await saveLotteryResult(r, slug); } catch { /* non-fatal */ }
    }).then(n => { if (n > 0) setCloudSynced(true); }).catch(() => {});

    // ── Supabase realtime: push any cloud edits into local SQLite live ─────────
    const unsubCloud = subscribeToCloudUpdates(async (r, slug) => {
      try { await saveLotteryResult(r, slug); } catch { /* non-fatal */ }
      if (slug === selectedGame.slug) setResult(r);
    });

    // ── Rust background worker: result fetched → save local + push to cloud ────
    const unlistenResult = listen<LotteryResult>("result-fetched", async (event) => {
      const r = event.payload;
      if (!r || r.error) return;
      const slug = r.game_slug || r.game_name.toLowerCase().replace(/\s+/g, "-");
      try { await saveLotteryResult(r, slug); } catch { /* non-fatal */ }
      // Non-blocking cloud push
      pushResultToCloud(r, slug).then(() => setCloudSynced(true)).catch(() => {});
      if (slug === selectedGame.slug) {
        setResult(r);
        setSaved(true); setTimeout(() => setSaved(false), 3000);
      }
    });

    const unlistenStart  = listen("sync-started",  () => setSyncing(true));
    const unlistenFinish = listen("sync-finished", () => setSyncing(false));

    return () => {
      unsubCloud();
      unlistenResult.then(f => f());
      unlistenStart.then(f => f());
      unlistenFinish.then(f => f());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGame.slug]);

  // ── SQLite-first: load result by date on game or date change ─────────────────
  useEffect(() => {
    setResult(null);
    setDateNotFound(false);
    const today = new Date().toISOString().split("T")[0];
    const isToday = selectedDate === today;

    const load = isToday
      ? getLatestLotteryResult(selectedGame.slug)          // latest for today/any
      : getLotteryResultByDate(selectedGame.slug, selectedDate); // specific date

    load.then(saved => {
        if (saved && !saved.error) {
          setResult(saved);
        } else if (!isToday) {
          setDateNotFound(true); // historical date with no record
        }
      })
      .catch(() => {});
  }, [selectedGame.slug, selectedDate]);

  function selectGame(g: GameInfo) {
    setSelected(g);
    // Skip scratch lotteries (no draw results)
    if (g.numberCount > 0) {
      handleFetchForGame(g);
    }
  }
  function switchBoard(b: "NLB" | "DLB") {
    setBoard(b);
    const list = b === "NLB" ? nlbGames : dlbGames;
    if (list.length) {
      setSelected(list[0]);
      if (list[0].numberCount > 0) handleFetchForGame(list[0]);
    }
  }

  async function handleFetchForGame(game: GameInfo) {
    setLoading(true);
    setResult(null);
    setDateNotFound(false);
    const today = new Date().toISOString().split("T")[0];
    const specifiedDraw = drawNumber.trim();
    // When no draw number and date is today → fetch latest available (don't restrict to today's date)
    const fetchDate = (!specifiedDraw && selectedDate === today) ? undefined : selectedDate;
    try {
      const r = await invoke<LotteryResult>("fetch_single_result", {
        board:       game.board,
        gameSlug:    game.slug,
        targetDate:  fetchDate,
        drawNumber:  specifiedDraw || undefined,
      });

      const hasData = r && !r.error && (r.winning_numbers.length > 0 || r.winning_letter);
      if (hasData) {
        setResult(r);
        await saveLotteryResult(r, game.slug).catch(() => {});
        pushResultToCloud(r, game.slug).catch(() => {});
        setSaved(true); setTimeout(() => setSaved(false), 3000);
        setCloudSynced(true);
      } else {
        const saved = await getLatestLotteryResult(game.slug).catch(() => null);
        if (saved) { setResult(saved); } else { setResult(r); }
      }
    } catch {
      const saved = await getLatestLotteryResult(game.slug).catch(() => null);
      setResult(saved);
    } finally {
      setLoading(false);
    }
  }

  async function handleFetch() {
    setLoading(true);
    setResult(null);
    setDateNotFound(false);
    const today = new Date().toISOString().split("T")[0];
    const specifiedDraw = drawNumber.trim();
    const fetchDate = (!specifiedDraw && selectedDate === today) ? undefined : selectedDate;
    try {
      const r = await invoke<LotteryResult>("fetch_single_result", {
        board:       selectedGame.board,
        gameSlug:    selectedGame.slug,
        targetDate:  fetchDate,
        drawNumber:  specifiedDraw || undefined,
      });

      const hasData = r && !r.error && (r.winning_numbers.length > 0 || r.winning_letter);
      if (hasData) {
        setResult(r);
        await saveLotteryResult(r, selectedGame.slug).catch(() => {});
        pushResultToCloud(r, selectedGame.slug).catch(() => {});
        setSaved(true); setTimeout(() => setSaved(false), 3000);
        setCloudSynced(true);
      } else {
        // Live failed — load from SQLite
        const saved = await getLatestLotteryResult(selectedGame.slug).catch(() => null);
        if (saved) {
          setResult(saved);
        } else {
          // Truly no data — show the error message
          setResult(r); // shows error state
        }
      }
    } catch (e) {
      const saved = await getLatestLotteryResult(selectedGame.slug).catch(() => null);
      setResult(saved); // never leave blank if we have SQLite data
    } finally {
      setLoading(false);
    }
  }

  async function saveAndDisplay(r: LotteryResult) {
    setResult(r);
    try {
      await saveLotteryResult(r, selectedGame.slug);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { /* non-fatal */ }
    // Push to Supabase cloud (non-blocking)
    pushResultToCloud(r, selectedGame.slug).then(() => setCloudSynced(true)).catch(() => {});
  }

  const display       = result;
  const fallbackPrizes = (display?.prizes.length ? display.prizes : (PRIZE_TABLES[selectedGame.slug]??[]))
    .map((p,i) => ({ ...p, medal:["🥇","🥈","🥉","4️⃣","5️⃣","⭐"][i]??"⭐", highlight:i===0 }));

  return (
    <div style={{ background:"#F0F0F0", minHeight:"100%" }}>

      {/* Manual entry modal */}
      {showModal && (
        <ManualEntryModal
          game={selectedGame}
          initialResult={editMode ? result : null}
          onSave={async r => { await saveAndDisplay(r); setShowModal(false); setEditMode(false); }}
          onClose={() => { setShowModal(false); setEditMode(false); }}
        />
      )}

      {/* Breadcrumb */}
      <div className="flex items-center px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color:"#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span className="font-semibold" style={{ color:"#1D1D1D" }}>Live Results</span>
        </nav>
      </div>

      <div className="px-6 pb-8 space-y-5">

        {/* ── HERO HEADER ── */}
        <div className="rounded-2xl overflow-hidden shadow-xl"
          style={{ background:"linear-gradient(135deg,#0A0A0A 0%,#1A1A1A 50%,#0A0A0A 100%)",
            border:"1px solid #2A2A2A",
            boxShadow:"0 0 0 1px #CF291D22, 0 20px 60px rgba(0,0,0,0.5)" }}>
          <div className="flex items-stretch" style={{ minHeight:130 }}>
            {/* NLB */}
            <div className="flex flex-col items-center justify-center px-6 py-4 shrink-0"
              style={{ minWidth:130, background:"linear-gradient(180deg,#111 0%,#0D1A2E 100%)", borderRight:"1px solid #2A2A2A" }}>
              <div className="rounded-xl overflow-hidden flex items-center justify-center mb-2"
                style={{ width:88, height:66, background:"#fff", padding:4 }}>
                <img src="/NLB.png" alt="NLB" className="object-contain w-full h-full"
                  onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
              </div>
              <p className="text-[9px] font-semibold text-center tracking-wide" style={{ color:"#64748B" }}>
                National Lotteries Board
              </p>
            </div>
            {/* Centre */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-5 text-center">
              <p className="text-sm mb-2 font-medium" style={{ color:"#6B7280" }}>
                ජයග්‍රාහී ප්‍රතිඵල &nbsp;<span style={{color:"#4B5563"}}>·</span>&nbsp; வெற்றி முடிவுகள்
              </p>
              <h1 className="flex items-center gap-3 font-black tracking-tight"
                style={{ fontSize:26, color:"#FFFFFF", textShadow:"0 0 30px rgba(207,41,29,0.4)" }}>
                <Trophy size={24} style={{ color:"#CF291D", filter:"drop-shadow(0 0 8px #CF291D80)" }}/>
                Live Lottery Results
              </h1>
              <div className="mt-2.5 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background:"rgba(207,41,29,0.12)", border:"1px solid rgba(207,41,29,0.25)", color:"#CF291D" }}>
                {new Date().toLocaleDateString("en-LK",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}
              </div>
            </div>
            {/* DLB */}
            <div className="flex flex-col items-center justify-center px-6 py-4 shrink-0"
              style={{ minWidth:130, background:"linear-gradient(180deg,#111 0%,#1A0A0A 100%)", borderLeft:"1px solid #2A2A2A" }}>
              <div className="rounded-xl overflow-hidden flex items-center justify-center mb-2"
                style={{ width:88, height:66, background:"#fff", padding:4 }}>
                <img src="/BLB.jpeg" alt="DLB" className="object-contain w-full h-full"
                  onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
              </div>
              <p className="text-[9px] font-semibold text-center tracking-wide" style={{ color:"#64748B" }}>
                Development Lotteries Board
              </p>
            </div>
          </div>
          {/* Board tabs */}
          <div className="flex" style={{ borderTop:"1px solid #2A2A2A" }}>
            {(["NLB","DLB"] as const).map((b,i)=>(
              <button key={b} onClick={()=>switchBoard(b)}
                className="flex-1 py-2.5 text-sm font-bold transition-all"
                style={{
                  background: board===b ? "linear-gradient(90deg,#CF291D,#B50717)" : "transparent",
                  color: board===b ? "#FFFFFF" : "#6B7280",
                  borderRight: i===0 ? "1px solid #2A2A2A" : undefined,
                }}>
                {b==="NLB" ? "🇱🇰  National Lotteries Board" : "🎯  Development Lotteries Board"}
              </button>
            ))}
          </div>
        </div>

        {/* ── GAME SELECTOR — fixed 4×2 grid (8 equal slots) ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:"#9CA3AF" }}>
              Select Game · {board} · 8 Available
            </p>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: board==="NLB" ? "#FEF2F2" : "#EFF6FF",
                color: board==="NLB" ? "#CF291D" : "#2563eb" }}>
              {board==="NLB" ? "National Lotteries Board" : "Development Lotteries Board"}
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {games.map(g => {
              const isActive = selectedGame.slug===g.slug;
              const isHov    = hoveredGame===g.slug;
              return (
                <button key={g.slug} onClick={()=>selectGame(g)}
                  onMouseEnter={()=>setHovered(g.slug)} onMouseLeave={()=>setHovered(null)}
                  className="flex flex-col items-start gap-2 p-4 rounded-2xl text-left transition-all"
                  style={{
                    background:  isActive ? g.gradient : "#FFFFFF",
                    border:      `2px solid ${isActive ? "transparent" : isHov ? g.glow+"60" : "#E8E8E8"}`,
                    boxShadow:   isActive ? `0 0 0 1px ${g.glow}40,0 8px 24px ${g.glow}30` : isHov ? `0 4px 16px ${g.glow}20` : "0 1px 4px rgba(0,0,0,0.06)",
                    transform:   isActive||isHov ? "translateY(-2px)" : "none",
                    minHeight:   130,
                  }}>
                  {/* Top row: board badge + days */}
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                      style={{ background:isActive?"rgba(255,255,255,0.22)":g.glow+"18", color:isActive?"#fff":g.glow }}>
                      {g.board}
                    </span>
                    <span className="text-[9px]" style={{ color:isActive?"rgba(255,255,255,0.55)":"#BFBFBF" }}>{g.days}</span>
                  </div>
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background:isActive?"rgba(255,255,255,0.22)":g.gradient,
                      boxShadow:isActive?"none":`0 4px 12px ${g.glow}35` }}>
                    <Trophy size={18} className="text-white"/>
                  </div>
                  {/* Name */}
                  <div className="flex-1">
                    <p className="text-sm font-bold leading-tight" style={{ color:isActive?"#FFFFFF":"#1D1D1D" }}>{g.name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color:isActive?"rgba(255,255,255,0.65)":"#9CA3AF" }}>{g.nameLocal}</p>
                  </div>
                  {/* Jackpot */}
                  {g.jackpot && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full w-full text-center"
                      style={{ background:isActive?"rgba(255,255,255,0.18)":"#F5F5F5",
                        color:isActive?"#fff":"#16a34a" }}>
                      🏆 {g.jackpot}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── BACKGROUND SYNC STATUS ── */}
        {syncing && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium"
            style={{ background:"#F0FFF4", border:"1px solid #BBF7D0", color:"#16a34a" }}>
            <RefreshCw size={12} className="animate-spin"/>
            Auto-syncing results in background…
          </div>
        )}

        {/* ── ACTION BAR ── */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Step indicators */}
          <div className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color:"#9CA3AF" }}>
            <span className="px-1.5 py-0.5 rounded" style={{ background:"#CF291D", color:"#fff" }}>1</span>
            <span>Game</span>
            <span className="mx-1">→</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background:"#1D1D1D", color:"#fff" }}>2</span>
            <span>Date</span>
            <span className="mx-1">→</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background:"#1D1D1D", color:"#fff" }}>3</span>
            <span>Draw No.</span>
            <span className="mx-1">→</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background:"#1D1D1D", color:"#fff" }}>4</span>
            <span>Fetch</span>
          </div>

          <div className="w-px h-5" style={{ background:"#E8E8E8" }}/>

          {/* Step 2: Date picker */}
          <div className="flex items-center gap-1.5">
            <Calendar size={13} style={{ color:"#9CA3AF" }}/>
            <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={e => { setSelectedDate(e.target.value); setDrawNumber(""); }}
              className="rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
              style={{ border:"1px solid #E8E8E8", background:"#FFFFFF", color:"#1D1D1D" }}
              title="Select draw date"
            />
            {selectedDate !== new Date().toISOString().split("T")[0] && (
              <button onClick={() => { setSelectedDate(new Date().toISOString().split("T")[0]); setDrawNumber(""); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background:"#F3F4F6", color:"#6B7280" }}>
                Today
              </button>
            )}
          </div>

          {/* Step 3: Draw number */}
          <div className="flex items-center gap-1.5">
            <Hash size={13} style={{ color:"#9CA3AF" }}/>
            <input
              type="text"
              value={drawNumber}
              onChange={e => setDrawNumber(e.target.value.replace(/\D/g,""))}
              placeholder="Draw No. (optional)"
              className="rounded-lg px-2.5 py-1.5 text-sm focus:outline-none font-mono"
              style={{ border:"1px solid #E8E8E8", background:"#FFFFFF", width:150, color:"#1D1D1D" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#CF291D")}
              onBlur={e  => (e.currentTarget.style.borderColor = "#E8E8E8")}
              title="e.g. 0421 — leave empty for latest"
            />
          </div>

          <div className="w-px h-5" style={{ background:"#E8E8E8" }}/>

          <button onClick={handleFetch} disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
            style={{ background:loading?"#374151":"linear-gradient(135deg,#CF291D,#B50717)",
              boxShadow:loading?"none":"0 4px 14px rgba(207,41,29,0.35)" }}>
            {loading ? <><RefreshCw size={15} className="animate-spin"/> Fetching…</> : <><Zap size={15}/> Fetch Live Results</>}
          </button>
          <button onClick={()=>setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background:"#FFFFFF", border:`2px solid ${selectedGame.glow}40`, color:selectedGame.glow,
              boxShadow:`0 2px 8px ${selectedGame.glow}15` }}>
            <Edit3 size={14}/> Enter Manually
          </button>
          {savedIndicator && (
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background:"#F0FFF4", border:"1px solid #BBF7D0", color:"#16a34a" }}>
              <Database size={12}/> Saved locally ✓
              {cloudSynced && <span style={{ color:"#0ea5e9" }}>· ☁ Cloud</span>}
            </div>
          )}
          {display && !display.error && !savedIndicator && (() => {
            const src = display.source_url ?? "";
            if (src === "sample") return (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background:"#FFFBEB", border:"1px solid #FDE68A", color:"#92400e" }}>
                <Star size={11} fill="#92400e"/> Sample data — use Enter Manually for verified results
              </div>
            );
            const isSaved = src === "Manual entry" || src === "Database (saved)";
            const isLive  = src.startsWith("http");
            return (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background:"#F0FFF4", border:"1px solid #BBF7D0", color:"#16a34a" }}>
                {isSaved ? <><Database size={12}/> SQLite verified</> : isLive ? <><Wifi size={12}/> Live fetched</> : <><CheckCircle size={12}/> Verified</>}
                {display.draw_date && <span style={{ color:"#9CA3AF" }}>· {display.draw_date}</span>}
                {display.fetched_at && display.fetched_at !== "unknown" && (
                  <span style={{ color:"#9CA3AF" }}>· {new Date(Number(display.fetched_at)).toLocaleTimeString("en-LK",{hour:"2-digit",minute:"2-digit"})}</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── LOADING SKELETON ── */}
        {loading && (
          <div className="rounded-2xl overflow-hidden shadow-sm animate-pulse"
            style={{ background:"#FFFFFF", border:"1px solid #E8E8E8" }}>
            <div className="px-5 py-4" style={{ background:"#F9F9F9", borderBottom:"1px solid #F3F4F6" }}>
              <div className="h-5 w-48 rounded-lg" style={{ background:"#E8E8E8" }}/>
              <div className="h-3 w-32 rounded mt-2" style={{ background:"#F3F4F6" }}/>
            </div>
            <div className="px-6 py-7">
              <div className="h-3 w-28 rounded mb-6" style={{ background:"#F3F4F6" }}/>
              <div className="flex gap-4">
                {Array.from({length:selectedGame.hasLetter?6:5}).map((_,i)=>(
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 rounded-full" style={{ background:"#F3F4F6" }}/>
                    <div className="h-2 w-12 rounded" style={{ background:"#F9F9F9" }}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS CARD ── */}
        {display && !display.error && !loading && (
          <div className="rounded-2xl overflow-hidden shadow-lg"
            style={{ background:"#FFFFFF", border:`1px solid ${selectedGame.glow}25`,
              boxShadow:`0 0 0 1px ${selectedGame.glow}12, 0 8px 32px rgba(0,0,0,0.08)` }}>

            {/* Result header */}
            <div className="px-5 py-4 flex items-start justify-between"
              style={{ background:selectedGame.gradient }}>
              <div>
                <h2 className="font-black text-xl text-white leading-tight">{display.game_name}</h2>
                <p className="text-xs text-white/70 mt-0.5">{selectedGame.nameLocal}</p>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  {display.draw_number && (
                    <span className="flex items-center gap-1 text-xs text-white/80">
                      <Hash size={11}/> Draw #{display.draw_number}
                    </span>
                  )}
                  {display.draw_date && (
                    <span className="flex items-center gap-1 text-xs text-white/80">
                      <Calendar size={11}/> {display.draw_date}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background:"rgba(255,255,255,0.2)", color:"#fff" }}>
                    {display.board}
                  </span>
                  {display.source_url === "sample" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background:"#FEF3C7", color:"#92400e" }}>
                      ⚠ SAMPLE DATA
                    </span>
                  )}
                  {/* Show "Latest Available" badge when result is older than today */}
                  {display.draw_date && display.draw_date < new Date().toISOString().split("T")[0] && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background:"rgba(255,255,255,0.25)", color:"#fff" }}>
                      ✓ Latest Available
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditMode(true); setShowModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
                  style={{ background:"rgba(255,255,255,0.2)", color:"#FFFFFF" }}
                  title="Edit / correct this result">
                  <Edit3 size={13}/> Edit
                </button>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ background:"rgba(255,255,255,0.15)" }}>
                  <Trophy size={22} className="text-white"/>
                </div>
              </div>
            </div>

            {/* ── Winning balls ── */}
            <div className="px-6 py-8">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-6" style={{ color:"#9CA3AF" }}>
                🎯 &nbsp; Winning Result
              </p>
              <div className="flex items-end gap-4 flex-wrap">
                {display.winning_letter && (
                  <LetterBall letter={display.winning_letter}
                    gradient={selectedGame.gradient} glow={selectedGame.glow}/>
                )}
                {display.winning_letter && display.winning_numbers.length>0 && <BallSeparator/>}

                {display.winning_numbers.length>0
                  ? display.winning_numbers.map((n,i)=>(
                      <NumberBall key={i} number={n} index={i} glow={selectedGame.glow}/>
                    ))
                  : Array.from({length:selectedGame.numberCount}).map((_,i)=>(
                      <NumberBall key={i} number="" index={i} glow={selectedGame.glow} isEmpty/>
                    ))
                }

                {display.super_number && <><BallSeparator/><SuperBall number={display.super_number}/></>}
              </div>

              {/* Full result string */}
              {(display.winning_letter || display.winning_numbers.length>0) && (
                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl"
                  style={{ background:`${selectedGame.glow}10`, border:`1px solid ${selectedGame.glow}25` }}>
                  <span className="text-xs font-medium" style={{ color:"#9CA3AF" }}>Full Result:</span>
                  <span className="font-black text-base font-mono" style={{ color:selectedGame.glow }}>
                    {[display.winning_letter, ...display.winning_numbers].filter(Boolean).join(" — ")}
                    {display.super_number && ` ★ ${display.super_number}`}
                  </span>
                </div>
              )}
            </div>

            {/* ── Prize table ── */}
            {fallbackPrizes.length>0 && (
              <div style={{ borderTop:"1px solid #F3F4F6" }}>
                <div className="flex items-center gap-2 px-5 py-3"
                  style={{ background:"#FAFAFA", borderBottom:"1px solid #F3F4F6" }}>
                  <Trophy size={12} style={{ color:"#9CA3AF" }}/>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:"#9CA3AF" }}>
                    Prize Structure · {display.game_name}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background:"#FAFAFA", borderBottom:"1px solid #F3F4F6" }}>
                      {["","Rank","Prize Amount","How to Win"].map((h,i)=>(
                        <th key={i} className="px-4 py-2.5 text-left"
                          style={{ fontSize:10, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fallbackPrizes.map((p,i)=>(
                      <tr key={i} className="hover:bg-gray-50/60 transition-colors"
                        style={{ borderBottom:"1px solid #F9F9F9",
                          background: p.highlight ? `${selectedGame.glow}06` : undefined }}>
                        <td className="px-4 py-3 text-lg">{p.medal}</td>
                        <td className="px-4 py-3 font-semibold text-sm"
                          style={{ color: p.highlight ? selectedGame.glow : "#1D1D1D" }}>
                          {p.rank}
                        </td>
                        <td className="px-4 py-3 font-bold text-sm"
                          style={{ color: p.highlight ? "#16a34a" : "#374151",
                            fontSize: p.highlight ? 15 : 13 }}>
                          {p.prize}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color:"#6B7280" }}>
                          {p.match_desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-2.5"
              style={{ borderTop:"1px solid #F3F4F6", background:"#FAFAFA" }}>
              <span className="text-[10px]" style={{ color:"#9CA3AF" }}>
                {display.source_url==="sample"
                  ? "⚠ Sample data — use 'Enter Manually' to record real draw results"
                  : display.source_url==="Manual entry"
                  ? "📝 Manually entered · saved to database"
                  : display.source_url==="Database (saved)"
                  ? "💾 Loaded from local database"
                  : `🌐 ${display.board==="NLB"?"www.nlb.lk":"www.dlb.lk"}`}
              </span>
              <span className="text-[10px]" style={{ color:"#9CA3AF" }}>
                {new Date(Number(display.fetched_at)).toLocaleTimeString("en-LK")}
              </span>
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {display?.error && !loading && (
          <div className="rounded-2xl p-7 text-center shadow-sm"
            style={{ background:"#FFFFFF", border:"1px solid #FECACA" }}>
            <WifiOff size={38} className="mx-auto mb-3" style={{ color:"#FECACA" }}/>
            <p className="font-bold text-base mb-1" style={{ color:"#CF291D" }}>Could not fetch live results</p>
            <p className="text-xs mb-4 max-w-md mx-auto" style={{ color:"#9CA3AF" }}>{display.error}</p>
            <div className="text-xs p-4 rounded-xl text-left space-y-1.5 max-w-md mx-auto mb-4"
              style={{ background:"#FFF8F8", border:"1px solid #FECACA", color:"#6B7280" }}>
              <p className="font-bold mb-1" style={{ color:"#CF291D" }}>Suggestions:</p>
              <p>• Check internet and click <strong>Fetch Live Results</strong> again</p>
              <p>• Visit <strong>www.nlb.lk</strong> / <strong>www.dlb.lk</strong> directly</p>
              <p>• Use <strong>"Enter Manually"</strong> to type the winning numbers</p>
            </div>
            <button onClick={()=>setShowModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background:"linear-gradient(135deg,#CF291D,#B50717)",
                boxShadow:"0 4px 12px rgba(207,41,29,0.3)" }}>
              <Edit3 size={14}/> Enter Manually
            </button>
          </div>
        )}

        {/* ── DATE NOT FOUND STATE ── */}
        {!display && !loading && dateNotFound && (
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background:"#FFFFFF", border:"1px solid #E8E8E8" }}>
            <div className="h-1" style={{ background:"#E8E8E8" }}/>
            <div className="px-6 py-10 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background:"#F3F4F6" }}>
                <Calendar size={26} style={{ color:"#BFBFBF" }}/>
              </div>
              <p className="font-bold text-base mb-1" style={{ color:"#1D1D1D" }}>
                No results for {selectedDate}
              </p>
              <p className="text-xs mb-4" style={{ color:"#9CA3AF" }}>
                {selectedGame.name} · {selectedGame.board} · Draw results not recorded for this date.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background:"#F3F4F6", color:"#374151", border:"1px solid #E8E8E8" }}>
                  Go to Today
                </button>
                <button onClick={() => { setShowModal(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background:"#CF291D" }}>
                  <Edit3 size={13}/> Enter for This Date
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── EMPTY STATE (no mock — real empty means no data yet) ── */}
        {!display && !loading && !dateNotFound && (
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background:"#FFFFFF", border:`1px solid ${selectedGame.glow}20` }}>
            <div className="h-1.5" style={{ background:selectedGame.gradient }}/>
            <div className="px-6 py-12 text-center">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg"
                style={{ background:selectedGame.gradient, boxShadow:`0 8px 32px ${selectedGame.glow}40` }}>
                <Trophy size={34} className="text-white"/>
              </div>
              <h2 className="font-black text-xl mb-1" style={{ color:"#1D1D1D" }}>{selectedGame.name}</h2>
              <p className="text-base font-medium mb-0.5" style={{ color:selectedGame.glow }}>{selectedGame.nameLocal}</p>
              <p className="text-xs mb-2" style={{ color:"#BFBFBF" }}>{selectedGame.board} · Draw day: {selectedGame.days}</p>
              {selectedGame.jackpot && (
                <p className="text-sm font-bold mb-4" style={{ color:"#16a34a" }}>Jackpot: {selectedGame.jackpot}</p>
              )}
              {/* Status message */}
              {syncing ? (
                <div className="flex items-center justify-center gap-2 mb-5 text-sm" style={{ color:"#16a34a" }}>
                  <RefreshCw size={14} className="animate-spin"/>
                  Auto-syncing from official site…
                </div>
              ) : (
                <p className="text-xs mb-5" style={{ color:"#9CA3AF" }}>
                  No saved results yet. Fetch from the official site or enter manually.
                </p>
              )}
              <div className="flex items-center justify-center gap-3">
                <button onClick={handleFetch} disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background:selectedGame.gradient, boxShadow:`0 6px 20px ${selectedGame.glow}40` }}>
                  <Zap size={16}/> Fetch Latest Results
                </button>
                <button onClick={()=>setShowModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background:"#F9F9F9", border:`1px solid ${selectedGame.glow}30`, color:selectedGame.glow }}>
                  <Edit3 size={14}/> Enter Manually
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
