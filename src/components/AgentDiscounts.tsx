import { useEffect, useRef, useState } from "react";
import { Home, ChevronRight, Save, RotateCcw, Tag } from "lucide-react";
import {
  getAgents, getLotteryGames,
  getAgentGameDiscounts, saveAgentGameDiscount, deleteAgentGameDiscount,
} from "../services/database";
import type { Agent, LotteryGame } from "../types";

// discount_pct column is repurposed to store Rs. discount amount
type DiscountKey = `${number}|${string}`;
type DiscountMap = Map<DiscountKey, number>; // value = Rs. discount amount

const KEY = (agentId: number, gameName: string): DiscountKey => `${agentId}|${gameName}`;
const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgentDiscounts() {
  const [agents,    setAgents]    = useState<Agent[]>([]);
  const [games,     setGames]     = useState<LotteryGame[]>([]);
  const [discounts, setDiscounts] = useState<DiscountMap>(new Map());
  const [dirty,     setDirty]     = useState<Set<DiscountKey>>(new Set());
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getAgents(), getLotteryGames(), getAgentGameDiscounts()]).then(([a, g, d]) => {
      setAgents(a);
      setGames(g);
      const map: DiscountMap = new Map();
      // discount_pct stores the Rs. discount amount (e.g. 5.00 = Rs. 5 off per ticket)
      for (const row of d) {
        const amt = row.custom_price !== null ? row.custom_price : row.discount_pct;
        if (amt > 0) map.set(KEY(row.agent_id, row.game_name), amt);
      }
      setDiscounts(map);
    });
  }, []);

  function getDiscount(agentId: number, gameName: string): number {
    return discounts.get(KEY(agentId, gameName)) ?? 0;
  }

  function setDiscount(agentId: number, gameName: string, amount: number) {
    const key = KEY(agentId, gameName);
    setDiscounts(m => { const n = new Map(m); if (amount > 0) n.set(key, amount); else n.delete(key); return n; });
    setDirty(s => new Set(s).add(key));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(key, agentId, gameName, amount), 800);
  }

  async function autoSave(key: DiscountKey, agentId: number, gameName: string, amount: number) {
    if (amount <= 0) {
      await deleteAgentGameDiscount(agentId, gameName).catch(() => {});
    } else {
      // Store as custom_price = null, discount_pct = Rs. amount (reused field)
      await saveAgentGameDiscount(agentId, gameName, amount, null).catch(() => {});
    }
    setDirty(s => { const n = new Set(s); n.delete(key); return n; });
  }

  async function saveAll() {
    setSaving(true);
    for (const [key, amount] of discounts) {
      const [agentId, ...rest] = key.split("|");
      const gameName = rest.join("|");
      await saveAgentGameDiscount(Number(agentId), gameName, amount, null).catch(() => {});
    }
    // Also delete entries that were cleared (in dirty but not in discounts)
    for (const key of dirty) {
      if (!discounts.has(key)) {
        const [agentId, ...rest] = key.split("|");
        await deleteAgentGameDiscount(Number(agentId), rest.join("|")).catch(() => {});
      }
    }
    setDirty(new Set());
    setSaving(false);
    setToast("All discounts saved");
    setTimeout(() => setToast(""), 2500);
  }

  async function resetAll() {
    if (!confirm("Reset all discounts to zero?")) return;
    setDiscounts(new Map());
    // Mark all previous keys as dirty so they get deleted on next save
    const allKeys = new Set(discounts.keys());
    setDirty(allKeys);
    // Immediately delete all
    for (const key of allKeys) {
      const [agentId, ...rest] = key.split("|");
      await deleteAgentGameDiscount(Number(agentId), rest.join("|")).catch(() => {});
    }
    setDirty(new Set());
    setToast("All discounts cleared");
    setTimeout(() => setToast(""), 2000);
  }

  const nlb  = games.filter(g => g.board === "NLB");
  const dlb  = games.filter(g => g.board === "DLB");
  const cols  = [...nlb, ...dlb]; // games = columns

  const AGENT_W = 185;
  const COL_W   = 108;
  const ROW_H   = 52;

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
              Enter LKR (Rs.) discount per ticket · auto-applied on invoices · auto-saves 0.8s after edit
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
            { bg:"#fff",    bd:"#CBD5E1", label:"No discount (default price)" },
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

        {/* ── SPREADSHEET ──────────────────────────────────────────────────────── */}
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

              {/* ── HEADER ── */}
              <thead>
                {/* Board group row */}
                <tr>
                  <th rowSpan={2} style={{
                    position:"sticky", left:0, top:0, zIndex:40,
                    background:"#0F172A", color:"#94A3B8",
                    padding:"10px 14px", textAlign:"left", verticalAlign:"middle",
                    fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em",
                    borderRight:"2px solid #334155", borderBottom:"2px solid #334155",
                  }}>
                    👤 AGENT NAME
                  </th>
                  <th colSpan={nlb.length} style={{
                    position:"sticky", top:0, zIndex:30,
                    background:"#1d4ed8", color:"#fff",
                    padding:"5px 8px", textAlign:"center",
                    fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em",
                    borderRight:"2px solid #1e40af", borderBottom:"1px solid rgba(255,255,255,0.3)",
                  }}>
                    📘 NLB — National Lottery Board
                  </th>
                  <th colSpan={dlb.length} style={{
                    position:"sticky", top:0, zIndex:30,
                    background:"#c2410c", color:"#fff",
                    padding:"5px 8px", textAlign:"center",
                    fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em",
                    borderBottom:"1px solid rgba(255,255,255,0.3)",
                  }}>
                    📙 DLB — Development Lottery Board
                  </th>
                </tr>
                {/* Game names row */}
                <tr>
                  {cols.map((game, gi) => {
                    const isNLB    = game.board === "NLB";
                    const isLastNLB = isNLB && gi === nlb.length - 1;
                    return (
                      <th key={game.id} style={{
                        position:"sticky", top:26, zIndex:29,
                        background: isNLB ? "#1E40AF" : "#9A3412",
                        color:"#fff",
                        padding:"5px 3px", textAlign:"center",
                        fontSize:9, fontWeight:700,
                        borderRight: isLastNLB ? "2px solid #93C5FD" : "1px solid rgba(255,255,255,0.15)",
                        borderBottom:"2px solid #1E293B",
                        lineHeight:1.2,
                      }}>
                        <div title={game.name} style={{
                          overflow:"hidden", textOverflow:"ellipsis",
                          whiteSpace:"nowrap", maxWidth:COL_W-8, fontSize:9,
                        }}>
                          {game.name}
                        </div>
                        <div style={{ fontSize:8, color:"rgba(255,255,255,0.65)", marginTop:2, fontWeight:500 }}>
                          Rs.{fmt(game.unit_price)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* ── BODY ── */}
              <tbody>
                {agents.map((agent, ai) => (
                  <tr key={agent.id} style={{ height:ROW_H }}>
                    {/* Frozen agent name */}
                    <td style={{
                      position:"sticky", left:0, zIndex:10,
                      background: ai % 2 === 0 ? "#F1F5F9" : "#E2E8F0",
                      padding:"0 12px",
                      borderRight:"2px solid #CBD5E1",
                      borderBottom:"1px solid #E2E8F0",
                      verticalAlign:"middle",
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <div style={{
                          width:30, height:30, borderRadius:"50%",
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

                    {/* One discount cell per game */}
                    {cols.map((game, gi) => {
                      const discAmt   = getDiscount(agent.id!, game.name);
                      const key       = KEY(agent.id!, game.name);
                      const isSet     = discAmt > 0;
                      const isDirty   = dirty.has(key);
                      const isLastNLB = game.board === "NLB" && gi === nlb.length - 1;
                      const effPrice  = Math.max(0, game.unit_price - discAmt);

                      return (
                        <td key={game.id} style={{
                          padding:0, verticalAlign:"middle",
                          borderRight: isLastNLB ? "2px solid #93C5FD" : "1px solid #E2E8F0",
                          borderBottom:"1px solid #E2E8F0",
                          background: isDirty ? "#FEFCE8"
                            : isSet ? (ai%2===0 ? "#F0FDF4" : "#ECFDF5")
                            : (ai%2===0 ? "#fff" : "#F8FAFC"),
                          transition:"background 0.15s",
                        }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                            justifyContent:"center", height:ROW_H, gap:2 }}>

                            {/* Rs. discount input */}
                            <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                              <span style={{ fontSize:9, color:"#64748B", fontWeight:700, flexShrink:0 }}>Rs.</span>
                              <input
                                type="number" min="0" step="0.5"
                                value={discAmt || ""}
                                placeholder="0.00"
                                onChange={e => setDiscount(agent.id!, game.name, parseFloat(e.target.value) || 0)}
                                style={{
                                  width:58, height:26, textAlign:"center", padding:0,
                                  border:`2px solid ${isDirty?"#FDE047":isSet?"#4ADE80":"#CBD5E1"}`,
                                  borderRadius:5, fontSize:12, fontWeight:800,
                                  background:"transparent", color:"#111827", outline:"none",
                                }}
                                onFocus={e => { e.target.select(); e.currentTarget.style.borderColor="#CF291D"; }}
                                onBlur={e => { e.currentTarget.style.borderColor = isDirty?"#FDE047":isSet?"#4ADE80":"#CBD5E1"; }}
                              />
                            </div>

                            {/* Effective price preview */}
                            {isSet && (
                              <div style={{ fontSize:9, fontWeight:700, color:"#16A34A" }}>
                                → Rs. {fmt(effPrice)}
                              </div>
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
          💡 Enter the Rs. discount per ticket · auto-saves 0.8s after edit · Tab moves between cells
        </p>
      </div>
    </div>
  );
}
