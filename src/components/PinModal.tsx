import { useState, useEffect, useCallback } from "react";
import { Delete } from "lucide-react";
import { verifyAdminPinWithStatus } from "../hooks/usePinGuard";

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS    = 5;
const LOCKOUT_SECONDS = 59;
const PIN_LENGTH      = 4;
const KEYS            = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];

// ── Module-level lockout state (survives modal unmount/remount — C-6 fix) ────
// Storing these inside React state allowed the lockout to be bypassed by closing
// and reopening the modal. Module scope persists for the entire app session.
let _attempts     = 0;
let _lockUntil    = 0;   // epoch ms when lockout expires (0 = not locked)
let _lockInterval: ReturnType<typeof setInterval> | null = null;

// ── Animated Lock SVG ────────────────────────────────────────────────────────
function LockIcon({ status }: { status: "idle" | "checking" | "success" | "error" | "locked" }) {
  const isOpen    = status === "success";
  const isLocked  = status === "locked";
  const isError   = status === "error";
  const isChecking = status === "checking";

  const bodyColor   = isOpen ? "#16A34A" : isLocked || isError ? "#DC2626" : isChecking ? "#2563EB" : "#CF291D";
  const glowColor   = isOpen ? "rgba(22,163,74,0.3)" : isLocked || isError ? "rgba(220,38,38,0.3)" : "rgba(207,41,29,0.25)";

  return (
    <div style={{
      width: 72, height: 72, borderRadius: "50%",
      background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.4s ease",
    }}>
      <svg
        width="42" height="42" viewBox="0 0 24 24" fill="none"
        style={{ overflow: "visible", transition: "all 0.3s" }}
      >
        {/* Lock body */}
        <rect
          x="3" y="11" width="18" height="11" rx="2"
          fill={bodyColor}
          style={{ transition: "fill 0.4s ease" }}
        />
        {/* Keyhole */}
        <circle cx="12" cy="16" r="1.5" fill="white" opacity={isOpen ? 0 : 1}
          style={{ transition: "opacity 0.3s" }} />
        <rect x="11" y="16.5" width="2" height="2.5" rx="0.5" fill="white"
          opacity={isOpen ? 0 : 1} style={{ transition: "opacity 0.3s" }} />
        {/* Check on success */}
        {isOpen && (
          <path d="M8 16.5 L11 19.5 L16 13.5"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: "drawCheck 0.35s ease forwards" }}
          />
        )}
        {/* Shackle */}
        <path
          d={isOpen
            ? "M8 11 L8 6.5 Q8 3 12 3 Q16 3 16 6.5 L16 9"   // open — raised & angled
            : "M8 11 L8 7 Q8 3 12 3 Q16 3 16 7 L16 11"       // closed
          }
          stroke={isOpen ? "#16A34A" : isLocked || isError ? "#DC2626" : "#CF291D"}
          strokeWidth="2.5" strokeLinecap="round" fill="none"
          style={{ transition: "all 0.45s cubic-bezier(0.34,1.56,0.64,1)", transformOrigin: "16px 11px" }}
        />
      </svg>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
  verify?: (pin: string) => Promise<boolean>;
  verifyWithStatus?: (pin: string) => Promise<{ ok: boolean; noPinConfigured: boolean }>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PinModal({
  title    = "Admin Verification",
  subtitle = "Enter your admin PIN to continue",
  onSuccess,
  onCancel,
  verify,
  verifyWithStatus,
}: Props) {
  const [digits,   setDigits]   = useState<string[]>([]);
  const [error,    setError]    = useState("");
  const [noPinMsg, setNoPinMsg] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [status,   setStatus]   = useState<"idle"|"checking"|"success"|"error"|"locked">("idle");

  // UI-only mirror of the module-level lockout — drives the countdown display.
  // Module-level _lockUntil/_attempts are the source of truth and survive unmount.
  const [lockSecs, setLockSecs] = useState(() =>
    _lockUntil > Date.now() ? Math.ceil((_lockUntil - Date.now()) / 1000) : 0
  );
  const [attempts, setAttempts] = useState(() => _attempts);

  const isLocked  = lockSecs > 0;
  const remaining = MAX_ATTEMPTS - attempts;

  // ── Sync module-level lockout into UI on mount (modal reopened mid-lockout) ─
  useEffect(() => {
    if (_lockUntil <= Date.now()) return;
    setStatus("locked");
    const tick = () => {
      const secs = Math.ceil((_lockUntil - Date.now()) / 1000);
      if (secs <= 0) {
        clearInterval(_lockInterval!);
        _lockInterval = null;
        _attempts = 0;
        _lockUntil = 0;
        setAttempts(0);
        setLockSecs(0);
        setStatus("idle");
        setError("");
      } else {
        setLockSecs(secs);
      }
    };
    tick();
    _lockInterval = setInterval(tick, 500);
    return () => { if (_lockInterval) { clearInterval(_lockInterval); _lockInterval = null; } };
  }, []);

  // ── Lockout countdown ──────────────────────────────────────────────────────
  function startLockout() {
    _lockUntil = Date.now() + LOCKOUT_SECONDS * 1000;
    setStatus("locked");
    setLockSecs(LOCKOUT_SECONDS);
    if (_lockInterval) clearInterval(_lockInterval);
    _lockInterval = setInterval(() => {
      const secs = Math.ceil((_lockUntil - Date.now()) / 1000);
      if (secs <= 0) {
        clearInterval(_lockInterval!);
        _lockInterval = null;
        _attempts = 0;
        _lockUntil = 0;
        setAttempts(0);
        setLockSecs(0);
        setStatus("idle");
        setError("");
      } else {
        setLockSecs(secs);
      }
    }, 500);
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isLocked || loading) return;
      if (e.key >= "0" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") pressBackspace();
      else if (e.key === "Enter")    pressConfirm();
      else if (e.key === "Escape")   onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [digits, isLocked, loading]);

  // ── Input handlers ─────────────────────────────────────────────────────────
  function pressDigit(d: string) {
    if (isLocked || loading || digits.length >= PIN_LENGTH) return;
    setError(""); setNoPinMsg(false); setStatus("idle");
    setDigits(prev => [...prev, d]);
  }

  function pressBackspace() {
    if (isLocked || loading) return;
    setDigits(prev => prev.slice(0, -1));
    setError("");
  }

  const pressConfirm = useCallback(async () => {
    if (isLocked || loading || digits.length < PIN_LENGTH) return;
    setLoading(true);
    setStatus("checking");

    let ok = false;
    let noCfg = false;

    try {
      if (verifyWithStatus) {
        const res = await verifyWithStatus(digits.join(""));
        ok    = res.ok;
        noCfg = res.noPinConfigured;
      } else if (verify) {
        ok = await verify(digits.join(""));
      } else {
        const res = await verifyAdminPinWithStatus(digits.join(""));
        ok    = res.ok;
        noCfg = res.noPinConfigured;
      }
    } catch {
      ok = false;
    }

    if (ok) {
      // Successful auth — reset the module-level counters
      _attempts = 0;
      setAttempts(0);
      setStatus("success");
      setTimeout(() => { onSuccess(); }, 700);
    } else {
      _attempts += 1;
      const newAttempts = _attempts;
      setAttempts(newAttempts);
      setDigits([]);
      setStatus("error");

      if (noCfg) {
        setNoPinMsg(true);
        setError("");
      } else if (newAttempts >= MAX_ATTEMPTS) {
        setTimeout(() => startLockout(), 400);
      } else {
        setError(`Incorrect PIN — ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} remaining`);
        setTimeout(() => setStatus("idle"), 800);
      }
      setLoading(false);
    }
  }, [digits, isLocked, loading, verify, verifyWithStatus, onSuccess]);

  function handleKey(k: string) {
    if (k === "⌫") pressBackspace();
    else if (k === "✓") pressConfirm();
    else pressDigit(k);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 340, background: "#FFFFFF", borderRadius: 20,
          overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          animation: "modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {/* ── Top brand bar ── */}
        <div style={{
          height: 5,
          background: status === "success" ? "linear-gradient(90deg,#16A34A,#22C55E)"
                    : status === "locked"  ? "linear-gradient(90deg,#DC2626,#EF4444)"
                    : "linear-gradient(90deg,#CF291D,#B50717)",
          transition: "background 0.4s",
        }} />

        {/* ── Lock icon + title ── */}
        <div style={{
          background: "linear-gradient(180deg,#0F172A 0%,#1E293B 100%)",
          padding: "24px 24px 20px", textAlign: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              onClick={onCancel}
              style={{
                border: "none", background: "rgba(255,255,255,0.08)",
                color: "#94A3B8", cursor: "pointer", borderRadius: 6,
                width: 26, height: 26, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, lineHeight: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,38,38,0.35)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#94A3B8"; }}
            >×</button>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <LockIcon status={status} />
          </div>

          <div style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
            {status === "success" ? "Access Granted" : status === "locked" ? "Account Locked" : title}
          </div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>
            {status === "locked"
              ? `Too many failed attempts. Try again in ${lockSecs}s`
              : status === "success"
              ? "Identity verified successfully"
              : subtitle}
          </div>
        </div>

        {/* ── Input area ── */}
        <div style={{ padding: "20px 24px 8px", background: "#F8FAFC" }}>
          {/* Dot indicators */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 12 }}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < digits.length;
              const dotColor = status === "success" ? "#16A34A"
                             : status === "error"   ? "#DC2626"
                             : filled ? "#CF291D" : undefined;
              return (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `2.5px solid ${filled ? dotColor ?? "#CF291D" : "#CBD5E1"}`,
                  background: filled ? (dotColor ?? "#CF291D") : "transparent",
                  transform: filled ? "scale(1.1)" : "scale(1)",
                  transition: "all 0.15s ease",
                  boxShadow: filled ? `0 0 8px ${dotColor ?? "#CF291D"}60` : "none",
                }} />
              );
            })}
          </div>

          {/* Status message */}
          <div style={{ minHeight: 40, textAlign: "center" }}>
            {noPinMsg ? (
              <div style={{
                background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8,
                padding: "8px 12px", fontSize: 12, color: "#92400E", fontWeight: 600,
              }}>
                No admin PIN configured — go to Settings → Security to set one
              </div>
            ) : error ? (
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
                padding: "8px 12px", fontSize: 12, color: "#DC2626", fontWeight: 600,
                animation: status === "error" ? "shake 0.45s ease" : undefined,
              }}>
                {error}
              </div>
            ) : status === "locked" ? (
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
                padding: "8px 12px", textAlign: "center",
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#DC2626", fontVariantNumeric: "tabular-nums" }}>
                  {String(lockSecs).padStart(2, "0")}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>seconds until unlock</div>
              </div>
            ) : attempts > 0 ? (
              <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
                {remaining} of {MAX_ATTEMPTS} attempts remaining
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Number pad ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1,
          background: "#E2E8F0", borderTop: "1px solid #E2E8F0",
          opacity: isLocked || status === "success" ? 0.35 : 1,
          pointerEvents: isLocked || status === "success" ? "none" : "auto",
          transition: "opacity 0.3s",
        }}>
          {KEYS.map(k => {
            const isConfirm = k === "✓";
            const isBack    = k === "⌫";
            const disabled  = loading
              || (isConfirm && digits.length < PIN_LENGTH)
              || (!isBack && !isConfirm && digits.length >= PIN_LENGTH);
            return (
              <button
                key={k}
                onClick={() => handleKey(k)}
                disabled={disabled}
                style={{
                  height: 58, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isConfirm ? 22 : 20, fontWeight: isConfirm ? 800 : 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  border: "none", transition: "background 0.1s",
                  background: isConfirm
                    ? (status === "success" ? "#16A34A" : "#CF291D")
                    : isBack ? "#F1F5F9" : "#FFFFFF",
                  color: isConfirm ? "#FFFFFF" : isBack ? "#64748B" : "#1E293B",
                  opacity: disabled ? 0.35 : 1,
                }}
                onMouseEnter={e => {
                  if (!disabled) e.currentTarget.style.background =
                    isConfirm ? "#B50717" : isBack ? "#E2E8F0" : "#F8FAFC";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background =
                    isConfirm ? (status === "success" ? "#16A34A" : "#CF291D") : isBack ? "#F1F5F9" : "#FFFFFF";
                }}
              >
                {isBack ? <Delete size={18} /> : k}
              </button>
            );
          })}
        </div>

        {/* ── Footer hint ── */}
        <div style={{
          background: "#F8FAFC", padding: "10px 24px",
          borderTop: "1px solid #E2E8F0", textAlign: "center",
          fontSize: 11, color: "#9CA3AF",
        }}>
          {isLocked
            ? "Account locked due to too many failed attempts"
            : "Press Escape to cancel · Enter to confirm"}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity:0; transform:scale(0.88) translateY(12px); }
          to   { opacity:1; transform:scale(1)    translateY(0);    }
        }
        @keyframes shake {
          0%,100% { transform:translateX(0); }
          18%,54% { transform:translateX(-7px); }
          36%,72% { transform:translateX(7px); }
        }
        @keyframes drawCheck {
          from { stroke-dasharray:20; stroke-dashoffset:20; }
          to   { stroke-dasharray:20; stroke-dashoffset:0;  }
        }
      `}</style>
    </div>
  );
}
