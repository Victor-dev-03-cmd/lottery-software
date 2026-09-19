import { useRef, useState } from "react";
import { saveAgent, saveLotteryGame, saveInventoryBatch } from "../services/database";

// ── CSV helpers ────────────────────────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false, cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = "﻿"; // UTF-8 BOM so Excel opens it correctly
  const csv = bom + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ── Config ─────────────────────────────────────────────────────────────────────
type ImportType = "agents" | "games" | "inventory" | "purchases";

const CONFIGS: Record<ImportType, {
  label: string; emoji: string; description: string;
  headers: string[]; sampleRow: string[]; instructions: string[];
}> = {
  agents: {
    label: "Agent Profiles", emoji: "👤",
    description: "Import sub-agents from Excel",
    headers: ["name","nlb_reg","dlb_reg","phone","address","nic_number","bank_name","bank_account","credit_limit"],
    sampleRow: ["Kamal Perera","NLB-A001","DLB-B001","+94711234567","No.5 Main St Colombo","123456789V","People's Bank","001-1-001-0000000","500000"],
    instructions: [
      "Column 'name' is required — all others optional",
      "'credit_limit' is a number (e.g. 500000)",
      "Duplicate names are imported as new agents",
    ],
  },
  games: {
    label: "Lottery Games", emoji: "🎮",
    description: "Import NLB & DLB game catalog",
    headers: ["name","board","cost_price","unit_price"],
    sampleRow: ["Mega Power","NLB","32.5","32.5"],
    instructions: [
      "'board' must be exactly NLB or DLB",
      "'cost_price' = Nimalsiri → Ajith, 'unit_price' = Ajith → Agent",
      "Duplicate game names will be skipped",
    ],
  },
  inventory: {
    label: "Stock Inventory", emoji: "📦",
    description: "Import ticket batches and stock",
    headers: ["game_name","batch_date","barcode_start","barcode_end","total_qty","distributed_qty","unit_price","notes"],
    sampleRow: ["Mega Power","2026-09-01","62900474690","62900524689","50000","12000","32.5","Opening stock"],
    instructions: [
      "'game_name' must match an existing game exactly",
      "'batch_date' format: YYYY-MM-DD",
      "'distributed_qty' = tickets already issued before import (use 0 if unknown)",
    ],
  },
  purchases: {
    label: "Stock Purchases", emoji: "🛒",
    description: "Import Nimalsiri purchase history",
    headers: ["purchase_number","purchase_date","game_name","barcode_start","barcode_end","qty","unit_price","initial_payment","notes"],
    sampleRow: ["PUR-2026-001","2026-09-01","Mega Power","62900474690","62900524689","50000","32.5","1500000","Opening purchase"],
    instructions: [
      "'purchase_date' format: YYYY-MM-DD",
      "'initial_payment' = amount already paid to Nimalsiri",
    ],
  },
};

type ImportRow = { data: Record<string, string>; errors: string[]; ok: boolean };

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportDataTab() {
  const [type, setType]       = useState<ImportType>("agents");
  const [rows, setRows]       = useState<ImportRow[]>([]);
  const [importing, setImp]   = useState(false);
  const [result, setResult]   = useState<{ ok: number; failed: number } | null>(null);
  const [dragOver, setDrag]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = CONFIGS[type];

  function switchType(t: ImportType) {
    setType(t);
    setRows([]);
    setResult(null);
    setDrag(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function parseFile(text: string, importType: ImportType) {
    const allRows = parseCSV(text);
    if (allRows.length < 2) { alert("CSV must have a header row and at least one data row."); return; }
    const headers = allRows[0].map(h => h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
    const parsed: ImportRow[] = [];
    for (let i = 1; i < allRows.length; i++) {
      const data: Record<string, string> = {};
      headers.forEach((h, j) => { data[h] = allRows[i][j]?.trim() ?? ""; });
      const errors: string[] = [];
      if (importType === "agents" && !data.name) errors.push("name required");
      if (importType === "games") {
        if (!data.name) errors.push("name required");
        if (data.board && !["NLB","DLB"].includes(data.board.toUpperCase())) errors.push("board must be NLB/DLB");
      }
      if (importType === "inventory" && !data.game_name) errors.push("game_name required");
      if (importType === "purchases" && !data.purchase_date) errors.push("purchase_date required");
      parsed.push({ data, errors, ok: errors.length === 0 });
    }
    setRows(parsed);
    setResult(null);
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a .csv file.\nIn Excel: File → Save As → CSV (Comma delimited).");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => parseFile(e.target?.result as string, type);
    reader.readAsText(file);
  }

  async function handleImport() {
    const valid = rows.filter(r => r.ok);
    if (!valid.length) { alert("No valid rows to import."); return; }
    if (!confirm(`Import ${valid.length} ${cfg.label} record(s) into the database?`)) return;
    setImp(true);
    let ok = 0, failed = 0;
    for (const row of valid) {
      try {
        const d = row.data;
        if (type === "agents") {
          await saveAgent({
            name: d.name, nlb_reg: d.nlb_reg ?? "", dlb_reg: d.dlb_reg ?? "",
            phone: d.phone ?? "", address: d.address ?? "", nic_number: d.nic_number ?? "",
            bank_name: d.bank_name ?? "", bank_account: d.bank_account ?? "",
            photo: "", credit_limit: parseFloat(d.credit_limit) || 0,
          });
        } else if (type === "games") {
          await saveLotteryGame({
            name: d.name,
            board: d.board?.toUpperCase() === "DLB" ? "DLB" : "NLB",
            cost_price: parseFloat(d.cost_price) || parseFloat(d.unit_price) || 32.5,
            unit_price: parseFloat(d.unit_price) || 32.5,
            is_enabled: 1,
          });
        } else if (type === "inventory") {
          await saveInventoryBatch({
            game_name: d.game_name,
            batch_date: d.batch_date || new Date().toISOString().split("T")[0],
            barcode_start: d.barcode_start ?? "", barcode_end: d.barcode_end ?? "",
            total_qty: parseInt(d.total_qty) || 0,
            distributed_qty: parseInt(d.distributed_qty) || 0,
            unit_price: parseFloat(d.unit_price) || 32.5,
            low_stock_threshold: 100,
            notes: d.notes || "Imported from Excel",
          });
        } else if (type === "purchases") {
          const { savePurchaseInvoice } = await import("../services/database");
          const total = (parseInt(d.qty) || 0) * (parseFloat(d.unit_price) || 0);
          await savePurchaseInvoice(
            {
              purchase_number: d.purchase_number || `IMP-${Date.now()}`,
              supplier_name: "Nimalsiri Enterprises",
              purchase_date: d.purchase_date,
              stock_date: d.purchase_date,
              invoice_total: total,
              initial_payment: parseFloat(d.initial_payment) || 0,
              outstanding_balance: Math.max(0, total - (parseFloat(d.initial_payment) || 0)),
              status: "pending",
              notes: d.notes || "Imported from Excel",
            },
            [{
              game_name: d.game_name, barcode_start: d.barcode_start ?? "",
              barcode_end: d.barcode_end ?? "", qty: parseInt(d.qty) || 0,
              unit_price: parseFloat(d.unit_price) || 0,
              value: total,
            }]
          );
        }
        ok++;
      } catch { failed++; }
    }
    setImp(false);
    setResult({ ok, failed });
  }

  const validRows = rows.filter(r => r.ok);
  const errorRows = rows.filter(r => !r.ok);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Type selector ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6", borderLeft: "3px solid #CF291D" }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#1D1D1D", margin: 0 }}>📥 Import Historical Data from Excel / CSV</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>
            Export your Excel sheet as <strong>.csv</strong> → upload here. Download a template first to see the exact columns needed.
          </p>
        </div>
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            What are you importing?
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {(Object.keys(CONFIGS) as ImportType[]).map(t => {
              const c = CONFIGS[t];
              const active = type === t;
              return (
                <button key={t} type="button" onClick={() => switchType(t)}
                  style={{
                    padding: "12px 8px", borderRadius: 10, textAlign: "center",
                    border: `2px solid ${active ? "#CF291D" : "#E5E7EB"}`,
                    background: active ? "#FEF2F2" : "#FAFAFA",
                    cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 5 }}>{c.emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#CF291D" : "#374151" }}>{c.label}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, lineHeight: 1.3 }}>{c.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Step 1: Template ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#1D1D1D", margin: 0 }}>Step 1 — Download Template</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Open in Excel, fill in your data, save as .csv</p>
          </div>
          <button type="button"
            onClick={() => downloadCSV(`template_${type}.csv`, cfg.headers, [cfg.sampleRow])}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", border: "none", borderRadius: 8, background: "#CF291D", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ⬇ Download Template
          </button>
        </div>
        <div style={{ padding: "12px 20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {cfg.headers.map(h => (
              <span key={h} style={{ padding: "2px 8px", borderRadius: 4, background: "#F3F4F6", fontSize: 11, fontFamily: "monospace", color: "#374151" }}>{h}</span>
            ))}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {cfg.instructions.map((ins, i) => (
              <li key={i} style={{ fontSize: 11, color: "#6B7280", display: "flex", gap: 6, marginBottom: 3 }}>
                <span style={{ color: "#CF291D", flexShrink: 0 }}>•</span>{ins}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Step 2: Upload ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #F3F4F6" }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#1D1D1D", margin: 0 }}>Step 2 — Upload Your CSV File</p>
        </div>
        <div style={{ padding: 16 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#CF291D" : "#D1D5DB"}`,
              borderRadius: 10, padding: "28px 20px", textAlign: "center",
              background: dragOver ? "#FEF2F2" : "#F9FAFB", cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>📂</div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>Drag & drop your CSV file here</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>or click to browse — .csv files only</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      </div>

      {/* ── Step 3: Preview ── */}
      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#1D1D1D", margin: 0 }}>Step 3 — Preview & Import</p>
              <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#DCFCE7", color: "#16A34A" }}>
                ✓ {validRows.length} valid
              </span>
              {errorRows.length > 0 && (
                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#FEE2E2", color: "#DC2626" }}>
                  ✗ {errorRows.length} errors
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setRows([]); setResult(null); }}
                style={{ padding: "5px 12px", border: "1px solid #E5E7EB", borderRadius: 7, background: "#F9FAFB", color: "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Clear
              </button>
              <button type="button" onClick={handleImport} disabled={importing || validRows.length === 0}
                style={{ padding: "5px 14px", border: "none", borderRadius: 7, background: validRows.length > 0 ? "#CF291D" : "#D1D5DB", color: "#fff", fontSize: 12, fontWeight: 700, cursor: validRows.length > 0 && !importing ? "pointer" : "not-allowed" }}>
                {importing ? "Importing…" : `⬆ Import ${validRows.length} Records`}
              </button>
            </div>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead style={{ position: "sticky", top: 0, background: "#F9FAFB", zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: "#6B7280", borderBottom: "1px solid #E5E7EB", width: 32 }}>#</th>
                  {cfg.headers.map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#6B7280", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                  <th style={{ padding: "6px 10px", fontWeight: 700, color: "#6B7280", borderBottom: "1px solid #E5E7EB" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F9FAFB", background: !row.ok ? "#FFF1F0" : undefined }}>
                    <td style={{ padding: "5px 10px", textAlign: "center", color: "#9CA3AF" }}>{i + 1}</td>
                    {cfg.headers.map(h => (
                      <td key={h} style={{ padding: "5px 10px", color: "#111827", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.data[h] || <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                      {row.ok
                        ? <span style={{ color: "#16A34A", fontWeight: 600 }}>✓ Ready</span>
                        : <span style={{ color: "#DC2626", fontSize: 10 }}>✗ {row.errors.join(", ")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <div style={{
          padding: "14px 18px", borderRadius: 10,
          background: result.failed === 0 ? "#DCFCE7" : "#FEF3C7",
          border: `1px solid ${result.failed === 0 ? "#BBF7D0" : "#FDE68A"}`,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: result.failed === 0 ? "#15803D" : "#92400E" }}>
            {result.failed === 0
              ? `✅ Import complete — ${result.ok} records added successfully!`
              : `⚠ Import done — ${result.ok} added, ${result.failed} failed. Check that games/agents exist.`}
          </p>
          <p style={{ fontSize: 11, color: "#6B7280", marginTop: 5, marginBottom: 0 }}>
            Data is now live. Use the ☁ cloud icon in the top bar to sync to Supabase.
          </p>
        </div>
      )}
    </div>
  );
}
