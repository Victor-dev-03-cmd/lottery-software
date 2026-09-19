import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";

type CheckState = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

interface ReleaseInfo {
  version: string;
  body: string | null;
  date?: string;
}

export default function SoftwareUpdateTab() {
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [currentVersion, setCurrentVersion] = useState("—");
  const [release, setRelease]     = useState<ReleaseInfo | null>(null);
  const [progress, setProgress]   = useState(0);
  const [errMsg, setErrMsg]       = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getVersion().then(v => setCurrentVersion(v)).catch(() => {});
  }, []);

  async function checkForUpdate() {
    setCheckState("checking");
    setRelease(null);
    setErrMsg("");
    setDismissed(false);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setRelease({ version: update.version, body: update.body ?? null, date: update.date ?? undefined });
        setCheckState("available");
      } else {
        setCheckState("up-to-date");
      }
    } catch (e) {
      setErrMsg(`Could not check for updates: ${String(e)}`);
      setCheckState("error");
    }
  }

  async function installUpdate() {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      setCheckState("downloading");
      setProgress(0);
      const update = await check();
      if (!update?.available) return;
      let downloaded = 0, total = 0;
      await update.downloadAndInstall((e: DownloadEvent) => {
        if (e.event === "Started")  { total = e.data.contentLength ?? 0; }
        if (e.event === "Progress") { downloaded += e.data.chunkLength; setProgress(total > 0 ? Math.round(downloaded / total * 100) : 50); }
        if (e.event === "Finished") { setCheckState("ready"); }
      });
      // Short pause to show success state, then relaunch
      setTimeout(() => relaunch(), 1500);
    } catch (e) {
      setErrMsg(`Installation failed: ${String(e)}`);
      setCheckState("error");
    }
  }

  // Format release notes (markdown-lite: bold headers, bullet lines)
  function formatNotes(body: string) {
    return body.split("\n").map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith("## "))  return <p key={i} style={{ fontWeight: 700, fontSize: 12, color: "#111827", margin: "10px 0 4px" }}>{trimmed.slice(3)}</p>;
      if (trimmed.startsWith("# "))   return <p key={i} style={{ fontWeight: 800, fontSize: 13, color: "#111827", margin: "10px 0 4px" }}>{trimmed.slice(2)}</p>;
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) return (
        <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "#374151", marginBottom: 3 }}>
          <span style={{ color: "#CF291D", flexShrink: 0 }}>•</span>
          <span>{trimmed.slice(2)}</span>
        </div>
      );
      return <p key={i} style={{ fontSize: 12, color: "#374151", marginBottom: 3 }}>{trimmed}</p>;
    }).filter(Boolean);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Current Version Card ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#1D1D1D", margin: 0 }}>🔄 Software Updates</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>
            Ajith Rohana Enterprise — Lottery Manager
          </p>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* App icon placeholder */}
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#CF291D,#B50717)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 22 }}>🎫</span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Lottery Manager</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  Current version: <strong style={{ color: "#374151" }}>v{currentVersion}</strong>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                  Powered by Ajith Rohana Enterprise · Asroz
                </div>
              </div>
            </div>
          </div>

          {/* Check / spinner */}
          {(() => {
            const s = checkState as string;
            if (s === "checking") return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6B7280" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Checking for updates…
              </div>
            );
            if (["idle","up-to-date","error"].includes(s)) return (
              <button onClick={checkForUpdate}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", border: "none", borderRadius: 8, background: "#CF291D", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🔍 Check for Updates
              </button>
            );
            return null;
          })()}
        </div>

        {/* Status row */}
        {checkState === "up-to-date" && (
          <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>You're up to date!</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>Version v{currentVersion} is the latest release.</div>
            </div>
            <button onClick={checkForUpdate} style={{ marginLeft: "auto", padding: "4px 12px", border: "1px solid #BBF7D0", borderRadius: 6, background: "#fff", color: "#16A34A", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Check again
            </button>
          </div>
        )}

        {checkState === "error" && (
          <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>Update check failed</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>{errMsg}</div>
            </div>
            <button onClick={checkForUpdate} style={{ padding: "4px 12px", border: "1px solid #FECACA", borderRadius: 6, background: "#fff", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Update Available Card ── */}
      {checkState === "available" && release && !dismissed && (
        <div style={{ background: "#fff", border: "2px solid #CF291D", borderRadius: 14, overflow: "hidden", animation: "fadeIn 0.3s ease" }}>
          {/* Red top bar */}
          <div style={{ height: 4, background: "linear-gradient(90deg,#CF291D,#B50717)" }} />

          <div style={{ padding: "14px 20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  🚀
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>
                    New Update Available
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    Version <strong style={{ color: "#CF291D" }}>v{release.version}</strong>
                    {release.date && <span> · {new Date(release.date).toLocaleDateString("en-LK", { year: "numeric", month: "long", day: "numeric" })}</span>}
                    <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 20, background: "#FEF2F2", color: "#CF291D", fontSize: 10, fontWeight: 700, border: "1px solid #FECACA" }}>NEW</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setDismissed(true)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>

            {/* Release Notes */}
            {release.body && (
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px", marginBottom: 14, maxHeight: 260, overflowY: "auto" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  📋 What's New in v{release.version}
                </p>
                {formatNotes(release.body)}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={installUpdate}
                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 8, background: "#CF291D", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                ⬇ Install Update Now
              </button>
              <button onClick={() => setDismissed(true)}
                style={{ padding: "10px 20px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Later
              </button>
            </div>
            <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
              The app will restart automatically after the update is installed.
            </p>
          </div>
        </div>
      )}

      {/* ── Downloading Card ── */}
      {checkState === "downloading" && (
        <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              ⬇
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Downloading update…</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Please don't close the app. Installing v{release?.version}.</div>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ background: "#F3F4F6", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#CF291D,#B50717)", borderRadius: 999, width: `${progress}%`, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF" }}>
            <span>Downloading…</span>
            <span style={{ fontWeight: 700, color: "#CF291D" }}>{progress}%</span>
          </div>
        </div>
      )}

      {/* ── Ready / Restarting Card ── */}
      {checkState === "ready" && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 14, padding: "20px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#15803D", marginBottom: 4 }}>Update installed!</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>The app is restarting with the new version…</div>
        </div>
      )}

      {/* ── Version History Note ── */}
      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 16px" }}>
        <p style={{ fontSize: 11, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>
          📦 <strong>Auto-update endpoint:</strong> github.com/Victor-dev-03-cmd/lottery-software/releases<br />
          🔑 Updates are cryptographically signed and verified before installation.<br />
          🕐 The app automatically checks for updates in the background every 4 hours.
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
