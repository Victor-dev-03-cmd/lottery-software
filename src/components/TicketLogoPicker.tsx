import { useState } from "react";
import { X, Search } from "lucide-react";

// All available logos — filename maps to display name
const NLB_LOGOS: { name: string; file: string }[] = [
  { name: "Ada Sampatha",       file: "Ada Sampatha.png" },
  { name: "Dhana Nidhanaya",    file: "Dhana Nidhanaya.png" },
  { name: "Govi Setha",         file: "Govi Setha.png" },
  { name: "Hada Hana",          file: "Hada Hana.png" },
  { name: "Mahajana Sampatha",  file: "MAHAJANA SAMPATHA.png" },
  { name: "Mega Power",         file: "mega power.png" },
  { name: "NLB Jaya",           file: "Nlb Jaya.png" },
  { name: "Suba Dasawak",       file: "Suba Dasawak.png" },
];

const DLB_LOGOS: { name: string; file: string }[] = [
  { name: "Ada Kotipathi",         file: "ada-kotipathi.png" },
  { name: "Jaya Sampatha",         file: "Jaya Sampatha.png" },
  { name: "Kapruka",               file: "Kapruka.png" },
  { name: "Lagna Wasanawa",        file: "LAGNA WASANAWA.png" },
  { name: "Sasiri",                file: "Sasiri.png" },
  { name: "Shanida Wasanawa",      file: "Shanida Wasanawa.png" },
  { name: "Super Ball",            file: "Super Ball.png" },
  { name: "Supiri Dana Sampatha",  file: "Supiri Dana Sampatha.png" },
];

interface Props {
  onSelect: (name: string) => void;
  onClose: () => void;
  currentValue?: string;
}

export default function TicketLogoPicker({ onSelect, onClose, currentValue }: Props) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"NLB" | "DLB">("NLB");

  const logos = tab === "NLB" ? NLB_LOGOS : DLB_LOGOS;
  const filtered = search
    ? [...NLB_LOGOS, ...DLB_LOGOS].filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    : logos;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(4px)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, width: 520, maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          animation: "modalIn 0.2s ease",
        }}>
        {/* Header */}
        <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: "#111827", margin: 0 }}>🎫 Select Ticket</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Click a ticket logo to select it</p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 20 }}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px 6px" }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticket name…"
              onKeyDown={e => { if (e.key === "Escape") onClose(); }}
              style={{ width: "100%", padding: "7px 10px 7px 30px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, boxSizing: "border-box", outline: "none" }}
            />
          </div>
        </div>

        {/* Board tabs — only show when no search */}
        {!search && (
          <div style={{ display: "flex", gap: 6, padding: "4px 18px 8px" }}>
            {(["NLB", "DLB"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: "5px 16px", border: "none", borderRadius: 20, cursor: "pointer",
                  fontSize: 12, fontWeight: 700,
                  background: tab === t ? (t === "NLB" ? "#1d4ed8" : "#ea580c") : "#F3F4F6",
                  color: tab === t ? "#fff" : "#374151",
                }}>
                {t === "NLB" ? "📘 NLB" : "📙 DLB"}
              </button>
            ))}
            <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto", alignSelf: "center" }}>
              {logos.length} tickets
            </span>
          </div>
        )}

        {/* Logo grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 16px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#9CA3AF", fontSize: 13 }}>
              No tickets found for "{search}"
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {filtered.map(logo => {
                const folder = NLB_LOGOS.find(l => l.file === logo.file) ? "nlb_logos" : "dlb_logos";
                const isSelected = currentValue?.toLowerCase() === logo.name.toLowerCase();
                return (
                  <button
                    key={logo.file}
                    onClick={() => { onSelect(logo.name); onClose(); }}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      padding: "10px 6px", borderRadius: 10, cursor: "pointer",
                      border: `2px solid ${isSelected ? "#CF291D" : "#E5E7EB"}`,
                      background: isSelected ? "#FEF2F2" : "#FAFAFA",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#CF291D"; e.currentTarget.style.background = "#FEF2F2"; }}
                    onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#FAFAFA"; }}}
                  >
                    <img
                      src={`/${folder}/${logo.file}`}
                      alt={logo.name}
                      style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 6 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='8' fill='%23F3F4F6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='24'%3E🎫%3C/text%3E%3C/svg%3E"; }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 600, color: isSelected ? "#CF291D" : "#374151", textAlign: "center", lineHeight: 1.3 }}>
                      {logo.name}
                    </span>
                    {isSelected && <span style={{ fontSize: 9, color: "#CF291D", fontWeight: 700 }}>✓ Selected</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
