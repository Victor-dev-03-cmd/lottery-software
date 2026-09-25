import { useEffect, useRef, useState } from "react";
import { Home, ChevronRight, Save, RotateCcw, Tag } from "lucide-react";
import {
  getAgents, getLotteryGames,
  getAgentGameDiscounts, saveAgentGameDiscount, deleteAgentGameDiscount,
} from "../services/database";
import type { Agent, LotteryGame } from "../types";

type DiscountKey = `${number}|${string}`;
type DiscountMap = Map<DiscountKey, { discount_pct: number; custom_price: number | null }>;

const KEY  = (agentId: number, gameName: string): DiscountKey => `${agentId}|${gameName}`;
const fmt  = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgentDiscounts() {
  const [agents,    setAgents]    = useState<Agent[]>([]);
  const [games,     setGames]     = useState<LotteryGame[]>([]);
  const [discounts, setDiscounts] = useState<DiscountMap>(new Map());
  const [dirty,     setDirty]     = useState<Set<DiscountKey>>(new Set());
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState("");
  const [mode,      setMode]      = useState<"discount" | "price">("discount");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getAgents(), getLotteryGames(), getAgentGameDiscounts()]).then(([a, g, d]) => {
      setAgents(a);
      setGames(g);
      const map: DiscountMap = new Map();
      for (const row of d) map.set(KEY(row.agent_id, row.game_name), { discount_pct: row.discount_pct, custom_price: row.custom_price });
      setDiscounts(map);
    });
  }, []);

  function getCell(agentId: number, gameName: string) {
    return discounts.get(KEY(agentId, gameName)) ?? { discount_pct: 0, custom_price: null };
  }

  function setCell(agentId: number, gameName: string, partial: Partial<{ discount_pct: number; custom_price: number | null }>) {
    const key  = KEY(agentId, gameName);
    const prev = discounts.get(key) ?? { discount_pct: 0, custom_price: null };
    const next = { ...prev, ...partial };
    setDiscounts(m => new Map(m).set(key, next));
    setDirty(s => new Set(s).add(key));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(key, agentId, gameName, next), 800);
  }

  async function autoSave(key: DiscountKey, agentId: number, gameName: string, val: { discount_pct: number; custom_price: number | null }) {
    if (val.discount_pct === 0 && val.custom_price === null) {
      await deleteAgentGameDiscount(agentId, gameName).catch(() => {});
    } else {
      await saveAgentGameDiscount(agentId, gameName, val.discount_pct, val.custom_price).catch(() => {});
    }
    setDirty(s => { const n = new Set(s); n.delete(key); return n; });
  }

  async function saveAll() {
    setSaving(true);
    for (const [key, val] of discounts) {
      const [agentId, ...rest] = key.split("|");
      const gameName = rest.join("|");
      if (val.discount_pct === 0 && val.custom_price === null) {
        await deleteAgentGameDiscount(Number(agentId), gameName).catch(() => {});
      } else {
        await saveAgentGameDiscount(Number(agentId), gameName, val.discount_pct, val.custom_price).catch(() => {});
      }
    }
    setDirty(new Set());
    setSaving(false);
    setToast("All discounts saved");
    setTimeout(() => setToast(""), 2500);
  }

  async function resetAll() {
    if (!confirm("Reset all discounts to zero?")) return;
    const cleared: DiscountMap = new Map();
    for (const [key] of discounts) cleared.set(key, { discount_pct: 0, custom_price: null });
    setDiscounts(cleared);
    setDirty(new Set([...cleared.keys()]));
  }

  const nlb  = games.filter(g => g.board === "NLB");
  const dlb  = games.filter(g => g.board === "DLB");
  const cols = [...nlb, ...dlb]; // games = columns

  // Layout constants
  const AGENT_W = 180;   // left frozen column
  const COL_W   = 105;   // per-game column
  const ROW_H   = 50;    // per-agent row

  return (
    <div style={{ background:"#F5F5F5", minHeight:"100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color:"#9CA3AF" }}>
          <Home size={12}/><ChevronRight size={11}/>
          <span style={{ color:"#1D1D1D", fontWeight:600 }}>Sub-agent wise Discount</span>
        </nav>
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color:"#1D1D1D" }}>
              <Tag size={20} style={{ display:"inline", marginRight:8, verticalAlign:"middle" }}/>
              Sub-agent wise Discount
            </h1>
            <p className="text-xs mt-0.5" style={{ color:"#9CA3AF" }}>
              Rows = Agents · Columns = Games · auto-applied on invoices · auto-saves 0.8s after edit
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ display:"flex", background:"#F3F4F6", borderRadius:8, padding:3, gap:2 }}>
              {(["discount","price"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ padding:"5px 14px", borderRadius:6, fontSize:12, fontWeight:700, border:"none", cursor:"pointer",
                    background: mode===m?"#CF291D":"transparent", color: mode===m?"#fff":"#6B7280" }}>
                  {m === "discount" ? "Discount %" : "Custom Price"}
                </button>
              ))}
            </div>
            <button onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background:"#fff", border:"1px solid #E5E7EB", color:"#6B7280" }}>
              <RotateCcw size={13}/> Reset All
            </button>
            <button onClick={saveAll} disabled={saving || dirty.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
              style={{ background:"#CF291D" }}>
              <Save size={13}/> {saving ? "Saving…" : `Save All${dirty.size > 0 ? ` (${dirty.size})` : ""}`}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-sm z-50 text-white"
            style={{ background:"#10b981" }}>✓ {toast}</div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-5 flex-wrap" style={{ fontSize:11, color:"#6B7280" }}>
          {[
            { bg:"#DCFCE7", bd:"#4ADE80", label:"Discount set" },
            { bg:"#FEF9C3", bd:"#FDE047", label:"Unsaved change" },
            { bg:"#fff",    bd:"#CBD5E1", label:"No override (default)" },
          ].map(l => (
            <span key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:13, height:13, borderRadius:3, background:l.bg, border:`1px solid ${l.bd}`, display:"inline-block" }}/>
              {l.label}
            </span>
          ))}
          {dirty.size > 0 && (
            <span style={{ color:"#D97706", fontWeight:700, marginLeft:"auto" }}>
              ⚠ {dirty.size} unsaved change{dirty.size!==1?"s":""}
            </span>
          )}
        </div>

        {/* ── SPREADSHEET ──────────────────────────────────────────────────── */}
        {agents.length === 0 ? (
          <div className="text-center py-16 rounded-2xl"
            style={{ background:"#fff", border:"1px solid #E5E7EB", color:"#9CA3AF", fontSize:13 }}>
            No agents found. Add agents in Agent Profiles first.
          </div>
        ) : (
          <div style={{
            overflowX:"auto", overflowY:"auto",
            maxHeight:"calc(100vh - 275px)",
            borderRadius:12, border:"2px solid #1E293B",
            boxShadow:"0 4px 20px rgba(0,0,0,0.12)",
          }}>
            <table style={{
              borderCollapse:"collapse", tableLayout:"fixed",
              width: AGENT_W + cols.length * COL_W,
              minWidth: AGENT_W + cols.length * COL_W,
            }}>
              <colgroup>
                <col style={{ width:AGENT_W }}/>
                {cols.map(g => <col key={g.id} style={{ width:COL_W }}/>)}
              </colgroup>

              {/* ── HEADER: top-left corner + one column per GAME ── */}
              <thead>
                {/* Board-group sub-header (NLB / DLB spans) */}
                <tr>
                  {/* Corner */}
                  <th rowSpan={2} style={{
                    position:"sticky", left:0, top:0, zIndex:40,
                    background:"#0F172A", color:"#94A3B8",
                    padding:"10px 14px", textAlign:"left", verticalAlign:"middle",
                    fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em",
                    borderRight:"2px solid #334155", borderBottom:"2px solid #334155",
                  }}>
                    👤 AGENT NAME
                  </th>
                  {/* NLB span */}
                  <th colSpan={nlb.length} style={{
                    position:"sticky", top:0, zIndex:30,
                    background:"#1d4ed8", color:"#fff",
                    padding:"5px 8px", textAlign:"center",
                    fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em",
                    borderRight:"2px solid #1e40af", borderBottom:"1px solid #1e40af",
                  }}>
                    📘 NLB — National Lottery Board
                  </th>
                  {/* DLB span */}
                  <th colSpan={dlb.length} style={{
                    position:"sticky", top:0, zIndex:30,
                    background:"#c2410c", color:"#fff",
                    padding:"5px 8px", textAlign:"center",
                    fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em",
                    borderBottom:"1px solid #9a3412",
                  }}>
                    📙 DLB — Development Lottery Board
                  </th>
                </tr>
                {/* Game name row */}
                <tr>
                  {cols.map((game, gi) => {
                    const isNLB = game.board === "NLB";
                    const isLastNLB = isNLB && gi === nlb.length - 1;
                    return (
                      <th key={game.id} style={{
                        position:"sticky", top:26, zIndex:29,
                        background: isNLB ? "#1E40AF" : "#9A3412",
                        color:"#fff",
                        padding:"6px 4px", textAlign:"center",
                        fontSize:10, fontWeight:700,
                        borderRight: isLastNLB ? "2px solid #93C5FD" : "1px solid rgba(255,255,255,0.15)",
                        borderBottom:"2px solid #1E293B",
                        lineHeight:1.2,
                        overflow:"hidden",
                      }}>
                        <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          fontSize:10, maxWidth:COL_W-8 }}>
                          {game.name}
                        </div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.6)", marginTop:2, fontWeight:400 }}>
                          Rs. {fmt(game.unit_price)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* ── BODY: one row per AGENT ── */}
              <tbody>
                {agents.map((agent, ai) => (
                  <tr key={agent.id} style={{ height:ROW_H }}>
                    {/* Frozen agent name cell */}
                    <td style={{
                      position:"sticky", left:0, zIndex:10,
                      background: ai % 2 === 0 ? "#F1F5F9" : "#E2E8F0",
                      padding:"0 14px",
                      borderRight:"2px solid #CBD5E1",
                      borderBottom:"1px solid #E2E8F0",
                      verticalAlign:"middle",
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{
                          width:32, height:32, borderRadius:"50%",
                          background:"#CF291D", color:"#fff",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:13, fontWeight:900, flexShrink:0,
                        }}>
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:"#1D1D1D", lineHeight:1.2 }}>
                            {agent.name}
                          </div>
                          {(agent.nlb_reg || agent.dlb_reg) && (
                            <div style={{ fontSize:9, color:"#64748B" }}>
                              {agent.nlb_reg ? `NLB: ${agent.nlb_reg}` : `DLB: ${agent.dlb_reg}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* One cell per game */}
                    {cols.map((game, gi) => {
                      const cell    = getCell(agent.id!, game.name);
                      const key     = KEY(agent.id!, game.name);
                      const isSet   = cell.discount_pct > 0 || cell.custom_price !== null;
                      const isDirty = dirty.has(key);
                      const isLastNLB = game.board === "NLB" && gi === nlb.length - 1;

                      const effPrice   = cell.custom_price !== null
                        ? cell.custom_price
                        : game.unit_price * (1 - cell.discount_pct / 100);
                      const savingAmt  = game.unit_price - effPrice;

                      return (
                        <td key={game.id} style={{
                          padding:0, verticalAlign:"middle",
                          borderRight: isLastNLB ? "2px solid #93C5FD" : "1px solid #E2E8F0",
                          borderBottom:"1px solid #E2E8F0",
                          background: isDirty ? "#FEFCE8"
                            : isSet ? (ai % 2 === 0 ? "#F0FDF4" : "#ECFDF5")
                            : (ai % 2 === 0 ? "#fff" : "#F8FAFC"),
                          transition:"background 0.15s",
                        }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                            justifyContent:"center", height:ROW_H, gap:2 }}>

                            {mode === "discount" ? (
                              <>
                                <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                  <input
                                    type="number" min="0" max="100" step="0.5"
                                    value={cell.discount_pct || ""}
                                    placeholder="0"
                                    onChange={e => setCell(agent.id!, game.name, { discount_pct: parseFloat(e.target.value) || 0 })}
                                    style={{
                                      width:50, height:26, textAlign:"center", padding:0,
                                      border:`2px solid ${isDirty?"#FDE047":isSet?"#4ADE80":"#CBD5E1"}`,
                                      borderRadius:5, fontSize:13, fontWeight:800,
                                      background:"transparent", color:"#111827", outline:"none",
                                    }}
                                    onFocus={e => { e.target.select(); e.currentTarget.style.borderColor="#CF291D"; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = isDirty?"#FDE047":isSet?"#4ADE80":"#CBD5E1"; }}
                                  />
                                  <span style={{ fontSize:11, color:"#64748B", fontWeight:700 }}>%</span>
                                </div>
                                {isSet && (
                                  <div style={{ fontSize:9, fontWeight:700,
                                    color: savingAmt >= 0 ? "#16A34A" : "#DC2626" }}>
                                    Rs. {fmt(effPrice)}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <input
                                  type="number" min="0" step="0.5"
                                  value={cell.custom_price ?? ""}
                                  placeholder={fmt(game.unit_price)}
                                  onChange={e => {
                                    const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                    setCell(agent.id!, game.name, { custom_price: v });
                                  }}
                                  style={{
                                    width:76, height:26, textAlign:"right", padding:"0 4px",
                                    border:`2px solid ${isDirty?"#FDE047":isSet?"#4ADE80":"#CBD5E1"}`,
                                    borderRadius:5, fontSize:12, fontWeight:800,
                                    background:"transparent", color:"#111827", outline:"none",
                                  }}
                                  onFocus={e => { e.target.select(); e.currentTarget.style.borderColor="#CF291D"; }}
                                  onBlur={e => { e.currentTarget.style.borderColor = isDirty?"#FDE047":isSet?"#4ADE80":"#CBD5E1"; }}
                                />
                                {isSet && savingAmt > 0 && (
                                  <div style={{ fontSize:9, fontWeight:700, color:"#16A34A" }}>
                                    -{fmt(savingAmt)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize:11, color:"#9CA3AF", textAlign:"center" }}>
          💡 Auto-saves 0.8s after you stop typing · Tab moves between cells · Save All to force-flush all pending changes
        </p>
      </div>
    </div>
  );
}
