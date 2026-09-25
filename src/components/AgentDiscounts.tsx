import { useEffect, useRef, useState } from "react";
import { Home, ChevronRight, Save, RotateCcw, Tag } from "lucide-react";
import {
  getAgents, getLotteryGames,
  getAgentGameDiscounts, saveAgentGameDiscount, deleteAgentGameDiscount,
} from "../services/database";
import type { Agent, LotteryGame } from "../types";

// ── local type ────────────────────────────────────────────────────────────────
type DiscountKey = `${number}|${string}`;
type DiscountMap = Map<DiscountKey, { discount_pct: number; custom_price: number | null }>;

const KEY = (agentId: number, gameName: string): DiscountKey => `${agentId}|${gameName}`;

const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgentDiscounts() {
  const [agents, setAgents]  = useState<Agent[]>([]);
  const [games, setGames]    = useState<LotteryGame[]>([]);
  const [discounts, setDiscounts] = useState<DiscountMap>(new Map());
  const [dirty, setDirty]    = useState<Set<DiscountKey>>(new Set());
  const [saving, setSaving]  = useState(false);
  const [toast, setToast]    = useState("");
  const [mode, setMode]      = useState<"discount" | "price">("discount");
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
    const key = KEY(agentId, gameName);
    const prev = discounts.get(key) ?? { discount_pct: 0, custom_price: null };
    const next = { ...prev, ...partial };
    setDiscounts(m => new Map(m).set(key, next));
    setDirty(s => new Set(s).add(key));
    // Auto-save after 800ms idle
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
    setToast("All discounts saved ✓");
    setTimeout(() => setToast(""), 2500);
  }

  function resetAll() {
    if (!confirm("Reset all discounts to zero?")) return;
    const cleared: DiscountMap = new Map();
    for (const [key] of discounts) {
      cleared.set(key, { discount_pct: 0, custom_price: null });
    }
    setDiscounts(cleared);
    setDirty(new Set([...cleared.keys()]));
  }

  const nlb = games.filter(g => g.board === "NLB");
  const dlb = games.filter(g => g.board === "DLB");
  const rows = [...nlb, ...dlb];

  const CELL_W = 110;
  const GAME_W = 170;

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} /><ChevronRight size={11} />
          <span style={{ color: "#1D1D1D", fontWeight: 600 }}>Sub-agent wise Discount</span>
        </nav>
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1D1D1D" }}>Sub-agent wise Discount</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              Set per-agent per-game discounts · auto-applied when creating invoices · auto-saves on edit
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode toggle */}
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background:"#fff", border:"1px solid #E5E7EB", color:"#6B7280" }}>
              <RotateCcw size={13} /> Reset All
            </button>
            <button onClick={saveAll} disabled={saving || dirty.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
              style={{ background:"#CF291D" }}>
              <Save size={13} /> {saving ? "Saving…" : `Save All${dirty.size > 0 ? ` (${dirty.size})` : ""}`}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-sm z-50 text-white"
            style={{ background:"#10b981" }}>✓ {toast}</div>
        )}

        {/* Legend */}
        <div style={{ display:"flex", gap:16, fontSize:11, color:"#9CA3AF" }}>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:14, height:14, borderRadius:3, background:"#DCFCE7", border:"1px solid #86EFAC", display:"inline-block" }}/>
            Has discount/price set
          </span>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:14, height:14, borderRadius:3, background:"#FFF", border:"1px solid #E5E7EB", display:"inline-block" }}/>
            No override (uses default)
          </span>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:14, height:14, borderRadius:3, background:"#FEF9C3", border:"1px solid #FDE047", display:"inline-block" }}/>
            Unsaved change
          </span>
        </div>

        {/* Excel grid */}
        {agents.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color:"#9CA3AF" }}>
            No agents found. Add agents in Agent Profiles first.
          </div>
        ) : (
          <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 260px)", borderRadius:14, border:"1px solid #E5E7EB", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
            <table style={{ borderCollapse:"collapse", minWidth: GAME_W + agents.length * CELL_W, background:"#fff" }}>
              <thead>
                <tr>
                  {/* Frozen game-name column header */}
                  <th style={{
                    position:"sticky", left:0, top:0, zIndex:30,
                    width:GAME_W, minWidth:GAME_W,
                    background:"#1E293B", color:"#F1F5F9",
                    padding:"12px 14px", textAlign:"left", fontSize:11,
                    fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em",
                    borderRight:"2px solid #334155", borderBottom:"2px solid #334155",
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Tag size={13} /> Game / Ticket
                    </div>
                  </th>
                  {/* Agent columns */}
                  {agents.map(a => (
                    <th key={a.id} style={{
                      position:"sticky", top:0, zIndex:20,
                      width:CELL_W, minWidth:CELL_W, maxWidth:CELL_W,
                      background:"#1E293B", color:"#F1F5F9",
                      padding:"8px 6px", textAlign:"center", fontSize:11, fontWeight:700,
                      borderRight:"1px solid #334155", borderBottom:"2px solid #334155",
                    }}>
                      <div style={{ maxWidth:CELL_W-12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {a.name}
                      </div>
                      {(a.nlb_reg || a.dlb_reg) && (
                        <div style={{ fontSize:9, color:"#94A3B8", marginTop:2, fontWeight:400 }}>
                          {a.nlb_reg ? `NLB: ${a.nlb_reg}` : a.dlb_reg ? `DLB: ${a.dlb_reg}` : ""}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((game, ri) => {
                  const isNLB = game.board === "NLB";
                  const isFirst = ri === 0 || rows[ri-1].board !== game.board;
                  return (
                    <>
                      {/* Board section header row */}
                      {isFirst && (
                        <tr key={`hdr-${game.board}`}>
                          <td colSpan={agents.length + 1} style={{
                            background: isNLB ? "#EFF6FF" : "#FFF7ED",
                            padding:"6px 14px",
                            fontSize:11, fontWeight:800,
                            color: isNLB ? "#1d4ed8" : "#c2410c",
                            borderBottom:`2px solid ${isNLB?"#2563EB":"#EA580C"}`,
                            borderTop:"2px solid #E5E7EB",
                            position:"sticky", left:0,
                          }}>
                            {isNLB ? "📘 NLB — National Lottery Board" : "📙 DLB — Development Lottery Board"}
                          </td>
                        </tr>
                      )}
                      {/* Game row */}
                      <tr key={game.id} style={{ borderBottom:"1px solid #F3F4F6" }}>
                        {/* Frozen game name */}
                        <td style={{
                          position:"sticky", left:0, zIndex:10,
                          background:"#F8FAFC", width:GAME_W, minWidth:GAME_W,
                          padding:"8px 14px", fontSize:12, fontWeight:600, color:"#1D1D1D",
                          borderRight:"2px solid #E5E7EB",
                          whiteSpace:"nowrap",
                        }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                            <span>{game.name}</span>
                            <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:400 }}>
                              Default: Rs. {fmt(game.unit_price)}
                            </span>
                          </div>
                        </td>
                        {/* Per-agent cell */}
                        {agents.map(agent => {
                          const cell = getCell(agent.id!, game.name);
                          const key  = KEY(agent.id!, game.name);
                          const isSet   = cell.discount_pct > 0 || cell.custom_price !== null;
                          const isDirty = dirty.has(key);
                          const effectivePrice = cell.custom_price ?? (game.unit_price * (1 - cell.discount_pct / 100));

                          return (
                            <td key={agent.id} style={{
                              padding:"6px 4px", textAlign:"center", verticalAlign:"middle",
                              borderRight:"1px solid #F3F4F6",
                              background: isDirty ? "#FEFCE8" : isSet ? "#F0FFF4" : "#fff",
                              transition:"background 0.2s",
                            }}>
                              {mode === "discount" ? (
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                                    <input
                                      type="number" min="0" max="100" step="0.5"
                                      value={cell.discount_pct || ""}
                                      placeholder="0"
                                      onChange={e => setCell(agent.id!, game.name, { discount_pct: parseFloat(e.target.value) || 0 })}
                                      style={{
                                        width:58, padding:"4px 4px", textAlign:"center",
                                        border:`1px solid ${isDirty?"#FDE047":isSet?"#86EFAC":"#E5E7EB"}`,
                                        borderRadius:6, fontSize:12, fontWeight:700,
                                        background:"transparent", color:"#1D1D1D", outline:"none",
                                      }}
                                      onFocus={e => e.target.select()}
                                    />
                                    <span style={{ fontSize:11, color:"#6B7280" }}>%</span>
                                  </div>
                                  {isSet && (
                                    <div style={{ fontSize:9, color:"#16A34A", fontWeight:600 }}>
                                      → Rs. {fmt(effectivePrice)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                                  <input
                                    type="number" min="0" step="0.5"
                                    value={cell.custom_price ?? ""}
                                    placeholder={fmt(game.unit_price)}
                                    onChange={e => {
                                      const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                      setCell(agent.id!, game.name, { custom_price: val });
                                    }}
                                    style={{
                                      width:80, padding:"4px 6px", textAlign:"right",
                                      border:`1px solid ${isDirty?"#FDE047":isSet?"#86EFAC":"#E5E7EB"}`,
                                      borderRadius:6, fontSize:12, fontWeight:700,
                                      background:"transparent", color:"#1D1D1D", outline:"none",
                                    }}
                                    onFocus={e => e.target.select()}
                                  />
                                  {cell.custom_price !== null && cell.custom_price < game.unit_price && (
                                    <div style={{ fontSize:9, color:"#16A34A", fontWeight:600 }}>
                                      -{fmt(game.unit_price - cell.custom_price)} off
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize:11, color:"#9CA3AF", textAlign:"center" }}>
          💡 Changes auto-save 0.8s after you stop typing · click Save All to force-save all pending changes
        </p>
      </div>
    </div>
  );
}
