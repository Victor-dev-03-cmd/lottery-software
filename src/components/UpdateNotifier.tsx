import { useEffect, useState } from "react";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";

interface UpdateInfo {
  version: string;
  body: string | null;
}

type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export default function UpdateNotifier() {
  const [state, setState]    = useState<UpdateState>("idle");
  const [info, setInfo]      = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError]    = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check for updates 5 seconds after app launch, then every 4 hours
    const check = () => checkForUpdate();
    const timer = setTimeout(check, 5_000);
    const interval = setInterval(check, 4 * 60 * 60 * 1000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  async function checkForUpdate() {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      setState("checking");
      const update = await check();
      if (update?.available) {
        setInfo({ version: update.version, body: update.body ?? null });
        setState("available");
        setDismissed(false);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle"); // Silent fail — no internet or no release yet
    }
  }

  async function installUpdate() {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      setState("downloading");
      setProgress(0);
      const update = await check();
      if (!update?.available) return;
      let downloaded = 0, total = 0;
      await update.downloadAndInstall((e: DownloadEvent) => {
        if (e.event === "Started")  { total = e.data.contentLength ?? 0; }
        if (e.event === "Progress") { downloaded += e.data.chunkLength; setProgress(total > 0 ? Math.round(downloaded / total * 100) : 50); }
        if (e.event === "Finished") { setState("ready"); }
      });
      await relaunch();
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  if (dismissed || state === "idle" || state === "checking") return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 99999,
      width: 340, background: "#fff", borderRadius: 14,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: "1px solid #E5E7EB",
      overflow: "hidden", animation: "slideUp 0.3s ease",
    }}>
      {/* Top accent */}
      <div style={{ height: 3, background: "linear-gradient(90deg,#CF291D,#B50717)" }} />

      <div style={{ padding: "14px 16px" }}>
        {state === "available" && (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                  🚀
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>New Update Available</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>Version {info?.version} is ready to install</div>
                </div>
              </div>
              <button onClick={() => setDismissed(true)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16, padding: "0 2px", lineHeight: 1 }}>×</button>
            </div>

            {info?.body && (
              <div style={{ marginBottom: 10, padding: "8px 10px", background: "#F9FAFB", borderRadius: 7, fontSize: 11, color: "#374151", lineHeight: 1.5, maxHeight: 80, overflowY: "auto" }}>
                {info.body}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDismissed(true)}
                style={{ flex: 1, padding: "7px 0", border: "1px solid #E5E7EB", borderRadius: 7, background: "#F9FAFB", color: "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Later
              </button>
              <button onClick={installUpdate}
                style={{ flex: 2, padding: "7px 0", border: "none", borderRadius: 7, background: "#CF291D", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                ⬇ Update Now
              </button>
            </div>
          </>
        )}

        {state === "downloading" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 20 }}>⬇</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Downloading Update…</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>Please don't close the app</div>
              </div>
            </div>
            <div style={{ background: "#F3F4F6", borderRadius: 999, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#CF291D", borderRadius: 999, width: `${progress}%`, transition: "width 0.3s" }} />
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{progress}%</div>
          </div>
        )}

        {state === "ready" && (
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Update installed!</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>Relaunching app…</div>
          </div>
        )}

        {state === "error" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <div style={{ fontSize: 20 }}>⚠️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Update Failed</div>
            </div>
            <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 10, wordBreak: "break-word" }}>{error}</div>
            <button onClick={() => setDismissed(true)}
              style={{ padding: "6px 16px", border: "1px solid #E5E7EB", borderRadius: 7, background: "#F9FAFB", color: "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
