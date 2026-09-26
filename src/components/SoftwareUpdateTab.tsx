/**
 * Software Update Tab — in-app auto-updater using Tauri's official updater plugin.
 *
 * Flow:
 *  1. Check for update  → tauri-plugin-updater check()
 *  2. If available      → show version, release notes, Download & Install button
 *  3. Downloading       → progress bar + bytes transferred
 *  4. Installed         → relaunch() to run the new version
 *
 * The Rust backend + tauri.conf.json are already wired:
 *   endpoint: https://github.com/Victor-dev-03-cmd/lottery-software/releases/latest/download/latest.json
 *   pubkey: present (signature verification enabled)
 *   The CI workflow (tauri-action) generates and uploads latest.json automatically.
 */

import { useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { RefreshCw, Download, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";

type Phase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "done"
  | "error";

function ReleaseNotes({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;
        if (t.startsWith("## ")) return <p key={i} style={{ fontWeight: 700, fontSize: 12, color: "#111827", margin: "10px 0 4px" }}>{t.slice(3)}</p>;
        if (t.startsWith("# "))  return <p key={i} style={{ fontWeight: 800, fontSize: 13, color: "#111827", margin: "10px 0 4px" }}>{t.slice(2)}</p>;
        if (t.startsWith("- ") || t.startsWith("• ")) return (
          <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "#374151", marginBottom: 3 }}>
            <span style={{ color: "#CF291D", flexShrink: 0 }}>•</span>
            <span>{t.slice(2)}</span>
          </div>
        );
        return <p key={i} style={{ fontSize: 12, color: "#374151", margin: "2px 0" }}>{t}</p>;
      })}
    </div>
  );
}

export default function SoftwareUpdateTab() {
  const [phase, setPhase]         = useState<Phase>("idle");
  const [currentVer, setCurrentVer] = useState("");
  const [update, setUpdate]       = useState<Update | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal]         = useState(0);
  const [errMsg, setErrMsg]       = useState("");

  const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

  async function handleCheck() {
    setPhase("checking");
    setUpdate(null);
    setErrMsg("");
    try {
      const ver = await getVersion();
      setCurrentVer(ver);
      const u = await check();
      if (u?.available) {
        setUpdate(u);
        setPhase("available");
      } else {
        setPhase("up-to-date");
      }
    } catch (e) {
      console.error("Update check failed:", e);
      setErrMsg(
        String(e).includes("404") || String(e).includes("latest.json")
          ? "Could not reach the update server. Check your internet connection or try again later."
          : String(e)
      );
      setPhase("error");
    }
  }

  async function handleInstall() {
    if (!update) return;
    setPhase("downloading");
    setDownloaded(0);
    setTotal(0);
    try {
      await update.downloadAndInstall((progress) => {
        if (progress.event === "Started") {
          setTotal(progress.data.contentLength ?? 0);
        } else if (progress.event === "Progress") {
          setDownloaded(prev => prev + (progress.data.chunkLength ?? 0));
        } else if (progress.event === "Finished") {
          setPhase("installing");
        }
      });
      setPhase("done");
      // Short delay so user sees the "installing" message, then relaunch
      setTimeout(() => relaunch(), 1500);
    } catch (e) {
      console.error("Update install failed:", e);
      setErrMsg(String(e));
      setPhase("error");
    }
  }

  const card = {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: 16,
    overflow: "hidden" as const,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  return (
    <div className="space-y-5">

      {/* Current version + check button */}
      <div style={{ ...card }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "#1D1D1D", margin: 0 }}>
            Software Updates
          </p>
          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
            In-app auto-updater — downloads and installs without leaving the app
          </p>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {/* Current version badge */}
            <div style={{ padding: "8px 16px", background: "#F3F4F6", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}>
              Current version: <strong style={{ color: "#1D1D1D" }}>{currentVer || "—"}</strong>
            </div>

            {/* Check button */}
            <button
              onClick={handleCheck}
              disabled={phase === "checking" || phase === "downloading" || phase === "installing"}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 20px", borderRadius: 9, border: "none",
                background: (phase === "checking" || phase === "downloading") ? "#9CA3AF" : "#CF291D",
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                transition: "opacity 0.15s",
              }}>
              <RefreshCw size={14} className={phase === "checking" ? "animate-spin" : ""} />
              {phase === "checking" ? "Checking…" : "Check for Updates"}
            </button>
          </div>
        </div>
      </div>

      {/* ── State panels ── */}

      {/* Up to date */}
      {phase === "up-to-date" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
          background: "#F0FFF4", border: "1px solid #BBF7D0", borderRadius: 12,
          fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          <CheckCircle size={18} />
          You are running the latest version ({currentVer}). No updates available.
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div style={{ padding: "14px 20px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#CF291D", marginBottom: 6 }}>
            <AlertTriangle size={16} /> Update check failed
          </div>
          <p style={{ fontSize: 12, color: "#374151", margin: 0 }}>{errMsg}</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, margin: "8px 0 0" }}>
            If this persists, download manually from{" "}
            <a href="https://github.com/Victor-dev-03-cmd/lottery-software/releases/latest"
              target="_blank" rel="noreferrer"
              style={{ color: "#2563EB", textDecoration: "underline" }}>
              GitHub Releases
            </a>
          </p>
        </div>
      )}

      {/* Update available */}
      {(phase === "available" || phase === "downloading" || phase === "installing" || phase === "done") && update && (
        <div style={{ ...card }}>
          {/* Header */}
          <div style={{ padding: "14px 20px", background: "linear-gradient(135deg,#0F172A,#1E293B)",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>
                🎉 New Version Available
              </p>
              <p style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                v{currentVer} → <strong style={{ color: "#4ADE80" }}>v{update.version}</strong>
                {update.date && <span style={{ marginLeft: 8, color: "#94A3B8" }}>· Released {new Date(update.date).toLocaleDateString("en-LK")}</span>}
              </p>
            </div>
            <a href="https://github.com/Victor-dev-03-cmd/lottery-software/releases/latest"
              target="_blank" rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748B", textDecoration: "none" }}>
              <ExternalLink size={12} /> View on GitHub
            </a>
          </div>

          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Release notes */}
            {update.body && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase",
                  letterSpacing: "0.06em", margin: "0 0 8px" }}>
                  What's New
                </p>
                <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 14px",
                  maxHeight: 220, overflowY: "auto", border: "1px solid #E5E7EB" }}>
                  <ReleaseNotes body={update.body} />
                </div>
              </div>
            )}

            {/* Download progress */}
            {(phase === "downloading" || phase === "installing" || phase === "done") && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>
                    {phase === "downloading" ? "Downloading update…" :
                     phase === "installing"  ? "Installing — please wait…" :
                     "✓ Update installed — restarting…"}
                  </span>
                  <span style={{ color: "#6B7280" }}>
                    {phase === "downloading" && total > 0
                      ? `${(downloaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`
                      : `${pct}%`}
                  </span>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 999, height: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 999, transition: "width 0.3s",
                    width: phase === "installing" || phase === "done" ? "100%" : `${pct}%`,
                    background: phase === "done" ? "#16A34A" : "linear-gradient(90deg,#CF291D,#991B1B)",
                  }}/>
                </div>
                {phase === "downloading" && total > 0 && (
                  <div style={{ textAlign: "right", fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{pct}%</div>
                )}
              </div>
            )}

            {/* Action button */}
            {phase === "available" && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={handleInstall}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 24px",
                    borderRadius: 10, border: "none", background: "#CF291D", color: "#fff",
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(207,41,29,0.35)" }}>
                  <Download size={15} /> Download &amp; Install Now
                </button>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                  The app will restart automatically after installation.
                </p>
              </div>
            )}

            {(phase === "installing" || phase === "done") && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                background: "#F0FFF4", borderRadius: 8, border: "1px solid #BBF7D0",
                fontSize: 12, fontWeight: 700, color: "#16A34A" }}>
                <CheckCircle size={15} />
                Update installed successfully — restarting Lottery Manager…
              </div>
            )}
          </div>
        </div>
      )}

      {/* How it works info box */}
      {phase === "idle" && (
        <div style={{ ...card }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6" }}>
            <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>How Updates Work</p>
          </div>
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { step: "1", icon: "🔍", title: "Check",    desc: "The app queries the update server for the latest version" },
              { step: "2", icon: "📋", title: "Review",   desc: "See what's new in the release notes before installing" },
              { step: "3", icon: "⬇️", title: "Download", desc: "The update downloads securely in the background" },
              { step: "4", icon: "🔄", title: "Install",  desc: "The app installs and restarts — no manual steps needed" },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>{s.title}</p>
                  <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #F3F4F6" }}>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
              Updates are digitally signed and verified. Manual download:{" "}
              <a href="https://github.com/Victor-dev-03-cmd/lottery-software/releases/latest"
                target="_blank" rel="noreferrer"
                style={{ color: "#2563EB", textDecoration: "underline" }}>
                GitHub Releases
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
