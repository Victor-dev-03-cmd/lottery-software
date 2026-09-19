import { useEffect, useRef, useState } from "react";
import {
  Save, RefreshCw, Eye, Code, Palette, Upload,
  ToggleLeft, ToggleRight, Building2,
  CheckCircle2, Trash2, ChevronDown, ChevronUp, Sliders,
  FileText, Image, Type, RotateCcw, Download,
} from "lucide-react";
import {
  getInvoiceTemplate, saveInvoiceTemplate, getCompanySettings,
} from "../services/database";
import type { InvoiceTemplate } from "../services/database";
import type { CompanySettings, Invoice } from "../types";
import InvoiceA4Preview from "./shared/InvoiceA4Preview";

// ── Color presets ──────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { label: "Red / Black",   primary: "#CF291D", accent: "#1D1D1D" },
  { label: "Navy / Gold",   primary: "#1E3A5F", accent: "#D97706" },
  { label: "Forest / Dark", primary: "#16A34A", accent: "#1D1D1D" },
  { label: "Violet / Gray", primary: "#7C3AED", accent: "#374151" },
  { label: "Teal / Slate",  primary: "#0D9488", accent: "#1E293B" },
  { label: "Rose / Dark",   primary: "#E11D48", accent: "#1D1D1D" },
];

const DEFAULT_TEMPLATE: InvoiceTemplate = {
  primaryColor: "#CF291D", accentColor: "#1D1D1D", logoData: "",
  showBarcodes: true, showDiscount: true, showRoute: true,
  showSalesRep: true, showCommission: true,
  footerText: "Thank you for your business.",
  customHtml: "", useCustomHtml: false,
};

// ── Mock invoice for preview ───────────────────────────────────────────────────
const MOCK_INVOICE: Invoice = {
  invoice_number: "INV-2025-0042",
  agent_id: 1,
  agent_name: "Kamal Perera",
  agent_address: "No. 15, Main Street, Colombo 11",
  agent_phone: "+94 71 234 5678",
  agent_nlb_reg: "NLB-2024-001",
  agent_dlb_reg: "DLB-2024-001",
  invoice_date: "2025-09-15",
  prepared_by: "Admin",
  invoice_total: 25500,
  prev_outstanding: 5000,
  total_payable: 30500,
  cash_received: 0,
  dlb_winning: 0,
  nlb_winning: 0,
  outstanding_balance: 30500,
  invoice_status: "confirmed",
  delivery_route: "Colombo North",
  sales_rep: "Anura S.",
  items: [
    { ticket_name: "Mega Power",       barcode_start: "0001001", barcode_end: "0002000", qty: 200, qty_unit: "Tickets", unit_price: 100, value: 20000, net_value: 19000, discount_pct: 5  },
    { ticket_name: "Shanida",          barcode_start: "1001001", barcode_end: "1001050", qty: 50,  qty_unit: "Tickets", unit_price: 50,  value: 2500,  net_value: 2500,  discount_pct: 0  },
    { ticket_name: "Jathika Sampatha", barcode_start: "2001001", barcode_end: "2001030", qty: 30,  qty_unit: "Tickets", unit_price: 100, value: 3000,  net_value: 2940,  discount_pct: 2  },
  ],
};

// ── Starter HTML ───────────────────────────────────────────────────────────────
function starterHtml(primary: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111827;margin:0;padding:0}
  .hdr{background:${primary};color:#fff;padding:16px 24px;display:flex;justify-content:space-between}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th{background:${primary};color:#fff;padding:6px 8px;font-size:11px;text-align:left}
  td{border-bottom:1px solid #E5E7EB;padding:6px 8px;font-size:11px}
  .footer{margin-top:20px;font-size:10px;color:#9CA3AF;text-align:center;border-top:1px solid #E5E7EB;padding-top:10px}
</style></head><body>
<div class="hdr"><div><strong>{{company_name}}</strong><br/><small>{{company_address}}</small></div>
<div style="text-align:right"><strong>INVOICE</strong><br/>#{{invoice_number}}<br/>{{invoice_date}}</div></div>
<div style="padding:18px 24px">
  <div style="margin-bottom:12px"><small style="color:#6B7280">BILL TO</small><br/><strong>{{agent_name}}</strong></div>
  {{items_table}}
  <div style="display:flex;justify-content:flex-end;margin-top:12px">
    <table style="width:220px">
      <tr><td>Invoice Total</td><td align="right">Rs. {{total}}</td></tr>
      <tr><td><strong>Total Payable</strong></td><td align="right"><strong>Rs. {{total_payable}}</strong></td></tr>
    </table>
  </div>
  <div class="footer">{{footer_text}}</div>
</div></body></html>`;
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  icon, title, children, collapsible = false, defaultOpen = true,
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #F3F4F6" }}>
      <button type="button" onClick={() => collapsible && setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", border: "none", background: "none", cursor: collapsible ? "pointer" : "default", textAlign: "left" }}>
        <span style={{ color: "#CF291D", display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", flex: 1, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
        {collapsible && <span style={{ color: "#9CA3AF" }}>{open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</span>}
      </button>
      {(!collapsible || open) && <div style={{ padding: "0 20px 16px" }}>{children}</div>}
    </div>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F9FAFB" }}>
      <span style={{ fontSize: 12.5, color: "#374151" }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: value ? "#16A34A" : "#D1D5DB" }}>
        {value ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>}
      </button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function InvoiceModel() {
  const [template, setTemplate] = useState<InvoiceTemplate>(DEFAULT_TEMPLATE);
  const [company, setCompany]   = useState<CompanySettings | null>(null);
  const [saved,   setSaved]     = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [loading, setLoading]   = useState(true);
  const [zoom,    setZoom]      = useState(0.65);
  const logoRef   = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getInvoiceTemplate(), getCompanySettings()])
      .then(([t, c]) => { setTemplate(t); setCompany(c); })
      .finally(() => setLoading(false));
  }, []);

  const patch = (p: Partial<InvoiceTemplate>) => setTemplate(prev => ({ ...prev, ...p }));

  async function handleSave() {
    setSaving(true);
    try { await saveInvoiceTemplate(template); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  function handleReset() {
    if (!confirm("Reset template to default settings? Your current colors and fields will be lost.")) return;
    setTemplate(DEFAULT_TEMPLATE);
  }

  function handleExport() {
    const { logoData: _, ...exportable } = template; // skip large base64
    const json = JSON.stringify(exportable, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "invoice-template.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try { patch(JSON.parse(ev.target?.result as string)); }
      catch { alert("Invalid template file — expected a JSON file exported from this app."); }
    };
    r.readAsText(f);
    e.target.value = "";
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { if (typeof ev.target?.result === "string") patch({ logoData: ev.target.result }); };
    r.readAsDataURL(f);
    e.target.value = "";
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh", gap: 10, color: "#9CA3AF" }}>
      <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 13 }}>Loading template…</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: "#E2E8F0", overflow: "hidden" }}>

      {/* ══ LEFT SIDEBAR ══ */}
      <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", background: "#FFFFFF", borderRight: "1px solid #E5E7EB", boxShadow: "2px 0 10px rgba(0,0,0,0.05)" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px 12px", background: "linear-gradient(135deg,#0F172A 0%,#1E293B 100%)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#CF291D,#B50717)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={15} color="#fff"/>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>Invoice Template</div>
              <div style={{ fontSize: 10, color: "#64748B" }}>Live preview · changes apply instantly</div>
            </div>
          </div>

          {/* Action buttons row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={handleSave} disabled={saving}
              style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 7, background: saved ? "#16A34A" : "#CF291D", color: "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.2s" }}>
              {saved ? <><CheckCircle2 size={13}/>Saved!</> : saving ? <><RefreshCw size={13} style={{ animation: "spin 0.8s linear infinite" }}/>Saving…</> : <><Save size={13}/>Save</>}
            </button>
            <button type="button" onClick={handleReset} title="Reset to defaults"
              style={{ padding: "8px 10px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, background: "rgba(255,255,255,0.07)", color: "#94A3B8", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.2)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}>
              <RotateCcw size={13}/> Reset
            </button>
          </div>

          {/* Import / Export row */}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => importRef.current?.click()}
              style={{ flex: 1, padding: "6px 0", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#94A3B8", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Upload size={12}/> Import
            </button>
            <button type="button" onClick={handleExport}
              style={{ flex: 1, padding: "6px 0", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#94A3B8", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Download size={12}/> Export
            </button>
          </div>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport}/>
        </div>

        {/* Scrollable sections */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Color Theme */}
          <Section icon={<Palette size={13}/>} title="Color Theme">
            {[
              { key: "primaryColor" as const, label: "Primary (headers, accents)" },
              { key: "accentColor"  as const, label: "Accent (agent name, text)" },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <input type="color" value={template[key]} onChange={e => patch({ [key]: e.target.value })}
                    style={{ width: 36, height: 36, border: "1px solid #E5E7EB", borderRadius: 7, padding: 3, cursor: "pointer", flexShrink: 0 }}/>
                  <input type="text" value={template[key]} maxLength={7}
                    onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) patch({ [key]: e.target.value }); }}
                    style={{ flex: 1, height: 36, border: "1px solid #E5E7EB", borderRadius: 7, padding: "0 10px", fontFamily: "monospace", fontSize: 12, color: "#111827" }}/>
                  <div style={{ width: 36, height: 36, borderRadius: 7, background: template[key], border: "1px solid #E5E7EB", flexShrink: 0 }}/>
                </div>
              </div>
            ))}

            <div style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Presets</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {COLOR_PRESETS.map(p => {
                const active = template.primaryColor === p.primary;
                return (
                  <button key={p.label} type="button" onClick={() => patch({ primaryColor: p.primary, accentColor: p.accent })}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 4px", border: `2px solid ${active ? p.primary : "#E5E7EB"}`, borderRadius: 8, cursor: "pointer", background: active ? `${p.primary}12` : "#fff", transition: "all 0.15s" }}>
                    <div style={{ display: "flex", gap: 3 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: p.primary }}/>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: p.accent }}/>
                    </div>
                    <span style={{ fontSize: 9, color: "#6B7280", fontWeight: active ? 700 : 400, textAlign: "center", lineHeight: 1.2 }}>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Logo */}
          <Section icon={<Image size={13}/>} title="Company Logo">
            {template.logoData ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 64, height: 64, border: "1px solid #E5E7EB", borderRadius: 10, padding: 6, background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={template.logoData} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}/>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                  <button type="button" onClick={() => logoRef.current?.click()}
                    style={{ padding: "7px 12px", border: "1px solid #E5E7EB", borderRadius: 7, background: "#F9FAFB", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    <Upload size={12}/> Change Logo
                  </button>
                  <button type="button" onClick={() => patch({ logoData: "" })}
                    style={{ padding: "7px 12px", border: "1px solid #FECACA", borderRadius: 7, background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    <Trash2 size={12}/> Remove Logo
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => logoRef.current?.click()}
                style={{ width: "100%", padding: "16px 0", border: "2px dashed #D1D5DB", borderRadius: 10, background: "#F9FAFB", color: "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, transition: "border-color 0.15s,color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#CF291D"; e.currentTarget.style.color="#CF291D"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#D1D5DB"; e.currentTarget.style.color="#9CA3AF"; }}>
                <Building2 size={20}/>
                <span>Click to upload logo</span>
                <span style={{ fontSize: 10, fontWeight: 400 }}>PNG · JPG · SVG</span>
              </button>
            )}
            <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo}/>
          </Section>

          {/* Fields */}
          <Section icon={<Sliders size={13}/>} title="Invoice Fields">
            <ToggleRow label="Show Barcode Range"  value={template.showBarcodes}   onChange={v => patch({ showBarcodes: v })}/>
            <ToggleRow label="Show Discount %"     value={template.showDiscount}   onChange={v => patch({ showDiscount: v })}/>
            <ToggleRow label="Show Delivery Route" value={template.showRoute}      onChange={v => patch({ showRoute: v })}/>
            <ToggleRow label="Show Sales Rep"      value={template.showSalesRep}   onChange={v => patch({ showSalesRep: v })}/>
            <ToggleRow label="Show Commission"     value={template.showCommission} onChange={v => patch({ showCommission: v })}/>
          </Section>

          {/* Footer */}
          <Section icon={<Type size={13}/>} title="Footer Text">
            <textarea rows={2} value={template.footerText} onChange={e => patch({ footerText: e.target.value })}
              placeholder="e.g. Thank you for your business."
              style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#111827", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5 }}/>
          </Section>

          {/* Custom HTML */}
          <Section icon={<Code size={13}/>} title="Custom HTML" collapsible defaultOpen={false}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Use Custom HTML</div>
                <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>Override standard layout with raw HTML</div>
              </div>
              <button type="button" onClick={() => patch({ useCustomHtml: !template.useCustomHtml })}
                style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: template.useCustomHtml ? "#16A34A" : "#D1D5DB" }}>
                {template.useCustomHtml ? <ToggleRight size={28}/> : <ToggleLeft size={28}/>}
              </button>
            </div>
            {template.useCustomHtml ? (
              <>
                <button type="button" onClick={() => patch({ customHtml: template.customHtml || starterHtml(template.primaryColor) })}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", border: "1px solid #E5E7EB", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#374151", background: "#F9FAFB", marginBottom: 8 }}>
                  <RefreshCw size={11}/> Load Starter
                </button>
                <textarea value={template.customHtml} onChange={e => patch({ customHtml: e.target.value })} spellCheck={false}
                  style={{ width: "100%", height: 260, background: "#0F172A", color: "#E2E8F0", border: "1px solid #1E293B", borderRadius: 10, padding: "12px 14px", fontFamily: "monospace", fontSize: 10.5, lineHeight: 1.65, resize: "vertical", boxSizing: "border-box", outline: "none" }}/>
                <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 6, lineHeight: 1.6 }}>
                  Variables: {"{{invoice_number}} {{agent_name}} {{company_name}} {{invoice_date}} {{items_table}} {{total}} {{total_payable}} {{footer_text}}"}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "8px 0" }}>Enable to write custom HTML layout</div>
            )}
          </Section>
        </div>
      </div>

      {/* ══ RIGHT PANEL — Preview ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 20px", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Eye size={14} style={{ color: "#CF291D" }}/>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Live Preview</span>
            <span style={{ fontSize: 10, background: "#ECFDF5", color: "#16A34A", padding: "2px 8px", borderRadius: 20, fontWeight: 600, border: "1px solid #A7F3D0" }}>Real-time</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF", marginRight: 2 }}>Zoom:</span>
            {[0.45, 0.55, 0.65, 0.75, 0.85].map(z => (
              <button key={z} type="button" onClick={() => setZoom(z)}
                style={{ padding: "3px 9px", border: `1px solid ${zoom === z ? "#CF291D" : "#E5E7EB"}`, borderRadius: 6, background: zoom === z ? "#FEF2F2" : "#fff", color: zoom === z ? "#CF291D" : "#6B7280", fontSize: 11, fontWeight: zoom === z ? 700 : 500, cursor: "pointer" }}>
                {Math.round(z * 100)}%
              </button>
            ))}
            <span style={{ fontSize: 10, color: "#D1D5DB", marginLeft: 4 }}>A4</span>
          </div>
        </div>

        {/* Preview canvas — CSS zoom for correct scaling */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", background: "#F1F5F9", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
          <div style={{
            zoom: zoom,
            display: "inline-block",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            pointerEvents: "none",
            width: "210mm",
            height: "297mm",
            overflow: "hidden",
            background: "#fff",
          }}>
            {template.useCustomHtml && template.customHtml ? (
              <iframe
                title="Custom HTML Preview"
                srcDoc={template.customHtml
                  .replace(/{{company_name}}/g, company?.name ?? "Ajith Rohana Enterprise")
                  .replace(/{{company_address}}/g, company?.address ?? "Colombo")
                  .replace(/{{invoice_number}}/g, "INV-2025-0042")
                  .replace(/{{invoice_date}}/g, "15 Sep 2025")
                  .replace(/{{agent_name}}/g, "Kamal Perera")
                  .replace(/{{total}}/g, "25,500")
                  .replace(/{{total_payable}}/g, "30,500")
                  .replace(/{{footer_text}}/g, template.footerText)
                  .replace(/{{items_table}}/g, `<table><thead><tr><th>#</th><th>Ticket</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead><tbody><tr><td>1</td><td>Mega Power</td><td>200</td><td>Rs.100</td><td>Rs.20,000</td></tr></tbody></table>`)}
                style={{ width: "210mm", height: "297mm", border: "none", display: "block" }}
              />
            ) : (
              <InvoiceA4Preview
                invoice={MOCK_INVOICE}
                company={company}
                status="confirmed"
                primaryColor={template.primaryColor}
                logoSrc={template.logoData || "/ajith_rohana_logo.png"}
              />
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
