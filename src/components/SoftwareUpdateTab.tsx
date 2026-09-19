import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

type CheckState = "idle" | "checking" | "up-to-date" | "available" | "error";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}
interface GithubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

const GITHUB_API = "https://api.github.com/repos/Victor-dev-03-cmd/lottery-software/releases/latest";
const RELEASES_PAGE = "https://github.com/Victor-dev-03-cmd/lottery-software/releases/latest";

function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Markdown-lite renderer
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
  const [state, setState]       = useState<CheckState>("idle");
  const [current, setCurrent]   = useState("—");
  const [release, setRelease]   = useState<GithubRelease | null>(null);
  const [errMsg, setErrMsg]     = useState("");
  const [dismissed, setDismiss] = useState(false);

  useEffect(() => { getVersion().then(v => setCurrent(v)).catch(() => {}); }, []);

  async function checkForUpdate() {
    setState("checking");
    setRelease(null);
    setErrMsg("");
    setDismiss(false);
    try {
      const res = await fetch(GITHUB_API, {
        headers: { "Accept": "application/vnd.github.v3+json" },
      });
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}. Make sure the repository is public and has at least one release.`);
      const data: GithubRelease = await res.json();
      if (semverGt(data.tag_name, current)) {
        setRelease(data);
        setState("available");
      } else {
        setState("up-to-date");
      }
    } catch (e) {
      setErrMsg(String(e).replace("TypeError: ", "").replace("Error: ", ""));
      setState("error");
    }
  }

  function openReleasePage() {
    window.open(RELEASES_PAGE, "_blank");
  }

  // Pick best download assets for current platform
  const winAsset  = release?.assets.find(a => a.name.endsWith(".exe") || a.name.endsWith(".msi"));
  const debAsset  = release?.assets.find(a => a.name.endsWith(".deb"));
  const appImage  = release?.assets.find(a => a.name.endsWith(".AppImage"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Current version card ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#1D1D1D", margin: 0 }}>🔄 Software Updates</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>
            Ajith Rohana Enterprise — Lottery Manager
          </p>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#CF291D,#B50717)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>
              🎫
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Lottery Manager</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                Installed version: <strong style={{ color: "#374151" }}>v{current}</strong>
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                Powered by Ajith Rohana Enterprise · Asroz
              </div>
            </div>
          </div>

          {/* Action button */}
          {state !== "checking" && state !== "available" && (
            <button onClick={checkForUpdate}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", border: "none", borderRadius: 8, background: "#CF291D", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              🔍 Check for Updates
            </button>
          )}
          {state === "checking" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6B7280" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Checking GitHub releases…
            </div>
          )}
        </div>

        {/* Status banners */}
        {state === "up-to-date" && (
          <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>You're up to date!</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>v{current} is the latest release.</div>
            </div>
            <button onClick={checkForUpdate} style={{ padding: "4px 12px", border: "1px solid #BBF7D0", borderRadius: 6, background: "#fff", color: "#16A34A", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Check again
            </button>
          </div>
        )}

        {state === "error" && (
          <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>Update check failed</div>
              <button onClick={checkForUpdate} style={{ marginLeft: "auto", padding: "3px 10px", border: "1px solid #FECACA", borderRadius: 6, background: "#fff", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Retry</button>
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>{errMsg}</div>
          </div>
        )}
      </div>

      {/* ── New version available card ── */}
      {state === "available" && release && !dismissed && (
        <div style={{ background: "#fff", border: "2px solid #CF291D", borderRadius: 14, overflow: "hidden", animation: "fadeIn 0.3s ease" }}>
          <div style={{ height: 4, background: "linear-gradient(90deg,#CF291D,#B50717)" }} />
          <div style={{ padding: "16px 20px" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🚀</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>New Update Available!</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    Version <strong style={{ color: "#CF291D" }}>{release.tag_name}</strong>
                    <span style={{ marginLeft: 8 }}>·</span>
                    <span style={{ marginLeft: 8 }}>{new Date(release.published_at).toLocaleDateString("en-LK", { year: "numeric", month: "long", day: "numeric" })}</span>
                    <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 20, background: "#FEF2F2", color: "#CF291D", fontSize: 10, fontWeight: 700, border: "1px solid #FECACA" }}>NEW</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setDismiss(true)} style={{ border: "none", background: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 20, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>

            {/* Release notes */}
            {release.body && (
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px", marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  📋 What's New in {release.tag_name}
                </p>
                <ReleaseNotes body={release.body} />
              </div>
            )}

            {/* Download options */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
              Download Installer
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {winAsset && (
                <a href={winAsset.browser_download_url} target="_blank" rel="noreferrer"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", textDecoration: "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#CF291D")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}>
                  <span style={{ fontSize: 20 }}>🪟</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>Windows</span>
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>{winAsset.name.endsWith(".msi") ? "MSI" : "EXE"} · {fmtSize(winAsset.size)}</span>
                </a>
              )}
              {debAsset && (
                <a href={debAsset.browser_download_url} target="_blank" rel="noreferrer"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", textDecoration: "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#CF291D")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}>
                  <span style={{ fontSize: 20 }}>🐧</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>Ubuntu/Debian</span>
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>.deb · {fmtSize(debAsset.size)}</span>
                </a>
              )}
              {appImage && (
                <a href={appImage.browser_download_url} target="_blank" rel="noreferrer"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", textDecoration: "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#CF291D")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}>
                  <span style={{ fontSize: 20 }}>📦</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>Linux (All)</span>
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>AppImage · {fmtSize(appImage.size)}</span>
                </a>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={openReleasePage}
                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 8, background: "#CF291D", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ⬇ View All Downloads on GitHub
              </button>
              <button onClick={() => setDismiss(true)}
                style={{ padding: "10px 20px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#F9FAFB", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Later
              </button>
            </div>

            <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
              Download the installer for your platform and run it — the app will update automatically.
            </p>
          </div>
        </div>
      )}

      {/* ── Info footer ── */}
      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 16px" }}>
        <p style={{ fontSize: 11, color: "#6B7280", margin: 0, lineHeight: 1.65 }}>
          📦 <strong>Release source:</strong> github.com/Victor-dev-03-cmd/lottery-software/releases<br />
          🔒 All releases are built and signed via GitHub Actions.<br />
          🕐 Click "Check for Updates" at any time to see if a new version is available.
        </p>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
