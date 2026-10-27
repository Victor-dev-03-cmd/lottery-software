import { useState } from "react";
import { ShieldTick, UserSquare, Eye, EyeSlash, Login } from "iconsax-react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth, UserRole } from "../contexts/AuthContext";
import { verifyCashierPin, hashPin } from "../hooks/usePinGuard";
import { getAppSettings } from "../services/database";

interface Props {
  onSelected: () => void;
}

export default function RoleSelectModal({ onSelected }: Props) {
  const { setRole } = useAuth();
  const [picking, setPicking] = useState<UserRole | null>(null);
  const [pin, setPin]         = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSelect(role: UserRole) {
    setLoading(true);
    setError("");
    const settings = await getAppSettings();
    const hashKey = role === "admin" ? "admin_pin_hash" : "cashier_pin_hash";
    const hasPin = !!(settings[hashKey] ?? "");
    setLoading(false);

    if (!hasPin) {
      // No PIN set — grant access directly
      setRole(role);
      onSelected();
    } else {
      setPicking(role);
      setPin("");
    }
  }

  async function handlePinSubmit() {
    if (!picking) return;
    setLoading(true);
    setError("");
    try {
      if (picking === "admin") {
        // Rust-backed: send hash to Rust, get back a session token
        const pinHash = await hashPin(pin);
        const token = await invoke<string>("begin_admin_session", { pinHash });
        setRole("admin", token);
        onSelected();
      } else {
        // Cashier: JS-side verification only
        const ok = await verifyCashierPin(pin);
        if (ok) {
          setRole("cashier");
          onSelected();
        } else {
          setError("Incorrect cashier PIN.");
          setPin("");
        }
      }
    } catch (e) {
      setError(String(e).includes("Invalid") ? "Incorrect admin PIN." : `Error: ${String(e)}`);
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md mx-4">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg,#4285F4,#B50717)", boxShadow: "0 8px 32px rgba(66,133,244,0.4)" }}>
            <ShieldTick size={30} variant="Linear" color="currentColor" className="text-white"/>
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Select Access Role</h1>
          <p className="text-sm" style={{ color: "#9CA3AF" }}>Choose your access level for this session</p>
        </div>

        {!picking ? (
          /* Role cards */
          <div className="grid grid-cols-2 gap-4">
            {/* Admin */}
            <button onClick={() => handleSelect("admin")} disabled={loading}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#1D1D1D,#374151)", border: "1px solid #4B5563",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#4285F4,#B50717)" }}>
                <ShieldTick size={22} variant="Linear" color="currentColor" className="text-white"/>
              </div>
              <div className="text-center">
                <p className="font-black text-white text-base">Admin</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Full access to all modules</p>
              </div>
              <div className="flex flex-wrap gap-1 justify-center">
                {["Ledger","Reports","Settings","Purchases"].map(f => (
                  <span key={f} className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                    style={{ background: "rgba(66,133,244,0.2)", color: "#4285F4" }}>{f}</span>
                ))}
              </div>
            </button>

            {/* Cashier */}
            <button onClick={() => handleSelect("cashier")} disabled={loading}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#1D1D1D,#374151)", border: "1px solid #4B5563",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                <UserSquare size={22} variant="Linear" color="currentColor" className="text-white"/>
              </div>
              <div className="text-center">
                <p className="font-black text-white text-base">Cashier</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Daily operations only</p>
              </div>
              <div className="flex flex-wrap gap-1 justify-center">
                {["Invoices","Collections","Results","Alerts"].map(f => (
                  <span key={f} className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                    style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa" }}>{f}</span>
                ))}
              </div>
            </button>
          </div>
        ) : (
          /* PIN entry */
          <div className="rounded-2xl p-6"
            style={{ background: "linear-gradient(135deg,#1D1D1D,#374151)", border: "1px solid #4B5563" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: picking === "admin" ? "linear-gradient(135deg,#4285F4,#B50717)" : "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                {picking === "admin" ? <ShieldTick size={18} variant="Linear" color="currentColor" className="text-white"/> : <UserSquare size={18} variant="Linear" color="currentColor" className="text-white"/>}
              </div>
              <div>
                <p className="font-bold text-white capitalize">{picking} PIN Required</p>
                <p className="text-xs" style={{ color: "#9CA3AF" }}>Enter your {picking} PIN to continue</p>
              </div>
            </div>

            <div className="relative mb-4">
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g,"")); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
                placeholder="Enter PIN…"
                className="w-full rounded-xl px-4 py-3 text-white text-lg font-mono text-center tracking-widest focus:outline-none"
                style={{ background: "#111", border: `1px solid ${error ? "#4285F4" : "#374151"}`,
                  caretColor: "#4285F4" }}
                maxLength={8}
              />
              <button onClick={() => setShowPin(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#6B7280" }}>
                {showPin ? <EyeSlash size={16} variant="Linear" color="currentColor"/> : <Eye size={16} variant="Linear" color="currentColor"/>}
              </button>
            </div>

            {error && (
              <p className="text-xs text-center mb-3" style={{ color: "#4285F4" }}>{error}</p>
            )}

            <div className="flex gap-2">
              <button onClick={handlePinSubmit} disabled={loading || pin.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#4285F4,#B50717)" }}>
                <Login size={15} variant="Linear" color="currentColor"/> {loading ? "Verifying…" : "Enter"}
              </button>
              <button onClick={() => { setPicking(null); setPin(""); setError(""); }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "#374151", color: "#9CA3AF" }}>
                Back
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs mt-5" style={{ color: "#4B5563" }}>
          Ajith Rohana Enterprise · Lottery Management System
        </p>
      </div>
    </div>
  );
}
