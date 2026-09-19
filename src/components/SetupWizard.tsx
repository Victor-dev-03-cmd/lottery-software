import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Ticket, FolderOpen, HardDrive, CheckCircle, ArrowRight } from "lucide-react";

interface AppConfig {
  db_directory: string;
  setup_completed: boolean;
}

interface Props {
  onComplete: (config: AppConfig) => void;
  defaultDataDir: string;
}

/** Shorten a long path for display: keep last 2 segments + filename */
function shortPath(p: string): string {
  if (!p) return "";
  const sep = p.includes("\\") ? "\\" : "/";
  const parts = p.split(sep).filter(Boolean);
  if (parts.length <= 3) return p;
  return `${sep}…${sep}${parts.slice(-2).join(sep)}`;
}

export default function SetupWizard({ onComplete, defaultDataDir }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [dbChoice, setDbChoice] = useState<"default" | "custom">("default");
  const [customDir, setCustomDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function pickFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Select Database Storage Folder" });
      if (dir && typeof dir === "string") {
        setCustomDir(dir);
        setDbChoice("custom");
      }
    } catch {
      setError("Could not open folder picker.");
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError("");
    try {
      const config: AppConfig = {
        db_directory: dbChoice === "custom" && customDir ? customDir : "",
        setup_completed: true,
      };
      await invoke("save_app_config", { config });
      onComplete(config);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  const dbPath = dbChoice === "custom" && customDir
    ? `${customDir}/ajith_rohana.db`
    : `${defaultDataDir}/ajith_rohana.db`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999]"
      style={{ background: "#131313" }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 50% 35% at 50% 50%, rgba(207,41,29,0.10) 0%, transparent 70%)" }} />

      {/* Wizard card */}
      <div
        className="relative z-10 rounded-3xl overflow-hidden shadow-2xl w-[520px]"
        style={{ background: "#1D1D1D", border: "1px solid #2A2A2A" }}
      >
        {/* Card header with logo */}
        <div className="px-8 pt-8 pb-6 text-center"
          style={{ borderBottom: "1px solid #2A2A2A" }}>
          <div className="flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "#CF291D", boxShadow: "0 0 30px rgba(207,41,29,0.3)" }}>
              <Ticket size={28} className="text-white" />
            </div>
          </div>
          <h1 className="text-xl font-black text-white">Ajith Rohana Lottery Manager</h1>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>First-time Setup · Step {step} of 2</p>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: step === s ? "#CF291D" : step > s ? "#16a34a" : "#374151",
                    color: "#FFFFFF",
                  }}>
                  {step > s ? <CheckCircle size={14} /> : s}
                </div>
                {s < 2 && <div className="w-8 h-px" style={{ background: step > s ? "#16a34a" : "#374151" }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-8 py-6">

          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Welcome!</h2>
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "#9CA3AF" }}>
                  This software helps you manage lottery ticket distribution, agent accounts,
                  daily collections, invoices, and payments for your NLB/DLB lottery business.
                </p>
              </div>
              <div className="space-y-2.5">
                {[
                  "Manage unlimited agents and accounts",
                  "Create and print professional invoices",
                  "Track barcode ranges and ticket books",
                  "Daily collection sheets and payment ledger",
                  "Reports, analytics, and outstanding alerts",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <CheckCircle size={14} style={{ color: "#CF291D", flexShrink: 0 }} />
                    <span className="text-sm" style={{ color: "#9CA3AF" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(2)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 mt-2"
                style={{ background: "#CF291D" }}>
                Get Started <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ── Step 2: Database location ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Choose Database Location</h2>
                <p className="text-sm mt-1.5" style={{ color: "#9CA3AF" }}>
                  Select where the application database will be stored. You can keep the default
                  or choose a custom folder (e.g., an external drive or shared folder).
                </p>
              </div>

              {/* Default option */}
              <div
                className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all"
                style={{
                  background: dbChoice === "default" ? "rgba(207,41,29,0.08)" : "#2A2A2A",
                  border: `1.5px solid ${dbChoice === "default" ? "#CF291D" : "#374151"}`,
                }}
                onClick={() => setDbChoice("default")}>
                {/* Radio */}
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{ borderColor: dbChoice === "default" ? "#CF291D" : "#4B5563" }}>
                  {dbChoice === "default" && (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#CF291D" }} />
                  )}
                </div>
                {/* Icon */}
                <HardDrive size={18} className="shrink-0"
                  style={{ color: dbChoice === "default" ? "#CF291D" : "#6B7280" }} />
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">
                    Default Location
                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background:"rgba(207,41,29,0.2)", color:"#CF291D" }}>
                      Recommended
                    </span>
                  </p>
                  <p className="text-[11px] mt-1 truncate" style={{ color: "#6B7280" }}
                    title={`${defaultDataDir}/ajith_rohana.db`}>
                    {shortPath(defaultDataDir)}/ajith_rohana.db
                  </p>
                </div>
              </div>

              {/* Custom option */}
              <div
                className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all"
                style={{
                  background: dbChoice === "custom" ? "rgba(207,41,29,0.08)" : "#2A2A2A",
                  border: `1.5px solid ${dbChoice === "custom" ? "#CF291D" : "#374151"}`,
                }}
                onClick={() => dbChoice !== "custom" ? pickFolder() : undefined}>
                {/* Radio */}
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{ borderColor: dbChoice === "custom" ? "#CF291D" : "#4B5563" }}>
                  {dbChoice === "custom" && (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#CF291D" }} />
                  )}
                </div>
                {/* Icon */}
                <FolderOpen size={18} className="shrink-0"
                  style={{ color: dbChoice === "custom" ? "#CF291D" : "#6B7280" }} />
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">Custom Location</p>
                  <p className="text-[11px] mt-1 truncate"
                    style={{ color: customDir ? "#CF291D" : "#4B5563" }}
                    title={customDir ? `${customDir}/ajith_rohana.db` : ""}>
                    {customDir
                      ? `${shortPath(customDir)}/ajith_rohana.db`
                      : "Click to select a folder…"}
                  </p>
                </div>
                {/* Browse button */}
                <button
                  onClick={(e) => { e.stopPropagation(); pickFolder(); }}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:opacity-80"
                  style={{ background: "#374151", color: "#9CA3AF" }}>
                  Browse…
                </button>
              </div>

              {/* Selected path summary */}
              <div className="px-4 py-3 rounded-xl" style={{ background: "#2A2A2A", border: "1px solid #374151" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#6B7280" }}>
                  Database will be saved at
                </p>
                <p className="text-xs font-mono truncate" style={{ color: "#9CA3AF" }}
                  title={dbPath}>
                  {dbPath}
                </p>
              </div>

              {error && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#3A0A0A", color: "#FCA5A5" }}>
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "#2A2A2A", color: "#9CA3AF", border: "1px solid #374151" }}>
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving || (dbChoice === "custom" && !customDir)}
                  className="flex-2 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex-1"
                  style={{ background: "#CF291D" }}>
                  {saving ? "Setting up…" : "Launch App"}
                  {!saving && <ArrowRight size={15} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Asroz footer */}
        <div className="px-8 py-4 text-center" style={{ borderTop: "1px solid #2A2A2A" }}>
          <p className="text-[10px]" style={{ color: "#374151" }}>
            Powered by{" "}
            <span className="font-bold" style={{ color: "#CF291D" }}>ASROZ</span>
            {" "}Enterprise Software Solutions
          </p>
        </div>
      </div>
    </div>
  );
}
