import { useEffect, useRef, useState } from "react";
import { Home, ChevronRight, Save, RotateCcw } from "lucide-react";
import {
  getAgents, getLotteryGames,
  getAgentGameDiscounts, saveAgentGameDiscount, deleteAgentGameDiscount,
} from "../services/database";
import type { Agent, LotteryGame } from "../types";

type DiscountKey = `${number}|${string}`;
type DiscountMap = Map<DiscountKey, number>; // Rs. discount amount

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
      for (const row of d) {
        const amt = row.custom_price !== null ? row.custom_price : row.discount_pct;
        if (amt > 0) map.set(KEY(row.agent_id, row.game_name), amt);
      }
      setDiscounts(map);
    });
  }, []);

  function getDiscount(agentId: number, gameName: string) {
    return discounts.get(KEY(agentId, gameName)) ?? 0;
  }

  function setDiscount(agentId: number, gameName: string, amount: number) {
    const key = KEY(agentId, gameName);
    setDiscounts(m => { const n = new Map(m); amount > 0 ? n.set(key, amount) : n.delete(key); return n; });
    setDirty(s => new Set(s).add(key));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(key, agentId, gameName, amount), 800);
  }

  async function autoSave(key: DiscountKey, agentId: number, gameName: string, amount: number) {
    if (amount <= 0) await deleteAgentGameDiscount(agentId, gameName).catch(() => {});
    else await saveAgentGameDiscount(agentId, gameName, amount, null).catch(() => {});
    setDirty(s => { const n = new Set(s); n.delete(key); return n; });
  }

  async function saveAll() {
    setSaving(true);
    for (const [key, amount] of discounts)
      await saveAgentGameDiscount(Number(key.split("|")[0]), key.split("|").slice(1).join("|"), amount, null).catch(() => {});
    for (const key of dirty)
      if (!discounts.has(key))
        await deleteAgentGameDiscount(Number(key.split("|")[0]), key.split("|").slice(1).join("|")).catch(() => {});
    setDirty(new Set()); setSaving(false);
    setToast("Saved"); setTimeout(() => setToast(""), 2000);
  }

  async function resetAll() {
    if (!confirm("Clear all discounts?")) return;
    for (const key of discounts.keys())
      await deleteAgentGameDiscount(Number(key.split("|")[0]), key.split("|").slice(1).join("|")).catch(() => {});
    setDiscounts(new Map()); setDirty(new Set());
    setToast("All cleared"); setTimeout(() => setToast(""), 2000);
  }

  const nlb  = games.filter(g => g.board === "NLB");
  const dlb  = games.filter(g => g.board === "DLB");
  const cols  = [...nlb, ...dlb];

  const AGENT_W = 190;
  const COL_W   = 105;

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100%" }}>
      {/* Breadcrumb */}
      <div style={{ padding: "16px 28px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <Home size={12} style={{ color: "#9CA3AF" }} />
        <ChevronRight size={11} style={{ color: "#9CA3AF" }} />
        <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>Sub-agent wise Discount</span>
      </div>

      <div style={{ padding: "0 28px 32px" }}>
        {/* Page title + actions */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Sub-agent wise Discount</h1>
            <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
              Fixed Rs. discount per ticket per agent · applied automatically when creating invoices
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {dirty.size > 0 && (
              <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>
                {dirty.size} unsaved
              </span>
            )}
            <button onClick={resetAll}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7,
                border:"1px solid #D1D5DB", background:"#fff", color:"#374151", fontSize:12,
                fontWeight:600, cursor:"pointer" }}>
              <RotateCcw size={12}/> Clear All
            </button>
            <button onClick={saveAll} disabled={saving || dirty.size === 0}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 16px", borderRadius:7,
                border:"none", background: dirty.size > 0 ? "#111827" : "#D1D5DB",
                color:"#fff", fontSize:12, fontWeight:700, cursor: dirty.size > 0 ? "pointer" : "default",
                opacity: saving ? 0.6 : 1 }}>
              <Save size={12}/> {saving ? "Saving…" : "Save All"}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ position:"fixed", top:16, right:20, background:"#111827", color:"#fff",
            padding:"8px 18px", borderRadius:8, fontSize:13, fontWeight:600, zIndex:9999,
            boxShadow:"0 4px 12px rgba(0,0,0,0.2)" }}>
            ✓ {toast}
          </div>
        )}

        {/* Info strip */}
        <div style={{ display:"flex", gap:20, marginBottom:16, fontSize:11, color:"#6B7280", alignItems:"center" }}>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:"#D1FAE5", border:"1px solid #6EE7B7", display:"inline-block" }}/>
            Discount set
          </span>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:"#FEF3C7", border:"1px solid #FCD34D", display:"inline-block" }}/>
            Unsaved
          </span>
          <span style={{ color:"#9CA3AF" }}>
            Effective price = default price − Rs. discount · auto-saves 0.8s after edit
          </span>
        </div>

        {agents.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", background:"#fff", borderRadius:10,
            border:"1px solid #E5E7EB", color:"#9CA3AF", fontSize:13 }}>
            No agents found. Add agents in Agent Profiles first.
          </div>
        ) : (
          <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 270px)",
            borderRadius:10, border:"1px solid #E5E7EB",
            boxShadow:"0 1px 6px rgba(0,0,0,0.07)", background:"#fff" }}>
            <table style={{ borderCollapse:"collapse", tableLayout:"fixed",
              width: AGENT_W + cols.length * COL_W,
              minWidth: AGENT_W + cols.length * COL_W }}>
              <colgroup>
                <col style={{ width: AGENT_W }} />
                {cols.map(g => <col key={g.id} style={{ width: COL_W }} />)}
              </colgroup>

              {/* ── HEADER ── */}
              <thead>
                {/* Board group row */}
                <tr>
                  <th rowSpan={2} style={{
                    position:"sticky", left:0, top:0, zIndex:40,
                    background:"#F9FAFB", borderRight:"1px solid #E5E7EB",
                    borderBottom:"2px solid #E5E7EB",
                    padding:"10px 16px", textAlign:"left", verticalAlign:"middle",
                    fontSize:11, fontWeight:700, color:"#374151",
                    textTransform:"uppercase", letterSpacing:"0.05em",
                  }}>
                    Agent Name
                  </th>
                  {/* NLB group */}
                  <th colSpan={nlb.length} style={{
                    position:"sticky", top:0, zIndex:30,
                    background:"#EFF6FF", color:"#1D4ED8",
                    padding:"6px 10px", textAlign:"center",
                    fontSize:10, fontWeight:700, letterSpacing:"0.04em",
                    borderRight:"2px solid #BFDBFE",
                    borderBottom:"1px solid #BFDBFE",
                    borderLeft:"1px solid #BFDBFE",
                  }}>
                    NLB — National Lottery Board
                  </th>
                  {/* DLB group */}
                  <th colSpan={dlb.length} style={{
                    position:"sticky", top:0, zIndex:30,
                    background:"#FFF7ED", color:"#C2410C",
                    padding:"6px 10px", textAlign:"center",
                    fontSize:10, fontWeight:700, letterSpacing:"0.04em",
                    borderRight:"1px solid #FED7AA",
                    borderBottom:"1px solid #FED7AA",
                  }}>
                    DLB — Development Lottery Board
                  </th>
                </tr>
                {/* Game name row */}
                <tr>
                  {cols.map((game, gi) => {
                    const isLastNLB = game.board === "NLB" && gi === nlb.length - 1;
                    return (
                      <th key={game.id} style={{
                        position:"sticky", top:30, zIndex:29,
                        background:"#F9FAFB",
                        padding:"6px 4px", textAlign:"center",
                        fontSize:10, fontWeight:600, color:"#374151",
                        borderRight: isLastNLB ? "2px solid #BFDBFE" : "1px solid #E5E7EB",
                        borderBottom:"2px solid #E5E7EB",
                        lineHeight:1.3,
                      }}>
                        <div title={game.name} style={{ overflow:"hidden", textOverflow:"ellipsis",
                          whiteSpace:"nowrap", maxWidth:COL_W-8, fontSize:10 }}>
                          {game.name}
                        </div>
                        <div style={{ fontSize:9, color:"#9CA3AF", marginTop:1, fontWeight:500 }}>
                          Rs. {fmt(game.unit_price)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* ── BODY: one row per agent ── */}
              <tbody>
                {agents.map((agent, ai) => (
                  <tr key={agent.id}
                    style={{ background: ai % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    {/* Agent name cell (frozen) */}
                    <td style={{
                      position:"sticky", left:0, zIndex:10,
                      background: ai % 2 === 0 ? "#fff" : "#FAFAFA",
                      padding:"0 16px",
                      borderRight:"1px solid #E5E7EB",
                      borderBottom:"1px solid #F3F4F6",
                      verticalAlign:"middle", height:50,
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{
                          width:28, height:28, borderRadius:"50%",
                          background:"#374151", color:"#fff",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:11, fontWeight:800, flexShrink:0,
                        }}>
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize:12, fontWeight:600, color:"#111827" }}>
                          {agent.name}
                        </span>
                      </div>
                    </td>

                    {/* Discount cells */}
                    {cols.map((game, gi) => {
                      const discAmt   = getDiscount(agent.id!, game.name);
                      const key       = KEY(agent.id!, game.name);
                      const isSet     = discAmt > 0;
                      const isDirty   = dirty.has(key);
                      const isLastNLB = game.board === "NLB" && gi === nlb.length - 1;
                      const effPrice  = Math.max(0, game.unit_price - discAmt);

                      return (
                        <td key={game.id} style={{
                          padding:"0 6px",
                          textAlign:"center",
                          verticalAlign:"middle",
                          height:50,
                          borderRight: isLastNLB ? "2px solid #BFDBFE" : "1px solid #F3F4F6",
                          borderBottom:"1px solid #F3F4F6",
                          background: isDirty ? "#FFFBEB"
                            : isSet ? "#F0FDF4"
                            : "transparent",
                        }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                            {/* Input */}
                            <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                              <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:600 }}>Rs.</span>
                              <input
                                type="number" min="0" step="0.5"
                                value={discAmt || ""}
                                placeholder="—"
                                onChange={e => setDiscount(agent.id!, game.name, parseFloat(e.target.value) || 0)}
                                style={{
                                  width:52, height:26, textAlign:"center", padding:0,
                                  border:`1px solid ${isDirty?"#FCD34D":isSet?"#6EE7B7":"#E5E7EB"}`,
                                  borderRadius:5, fontSize:12, fontWeight:700,
                                  background: isDirty?"#FFFBEB":isSet?"#F0FDF4":"#fff",
                                  color:"#111827", outline:"none",
                                  fontFamily:"inherit",
                                }}
                                onFocus={e => { e.target.select(); e.currentTarget.style.borderColor="#374151"; e.currentTarget.style.boxShadow="0 0 0 2px rgba(55,65,81,0.12)"; }}
                                onBlur={e => { e.currentTarget.style.boxShadow="none"; e.currentTarget.style.borderColor=isDirty?"#FCD34D":isSet?"#6EE7B7":"#E5E7EB"; }}
                              />
                            </div>
                            {/* Effective price */}
                            {isSet && (
                              <span style={{ fontSize:9, color:"#059669", fontWeight:600 }}>
                                → {fmt(effPrice)}
                              </span>
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

        <p style={{ fontSize:11, color:"#9CA3AF", textAlign:"center", marginTop:12 }}>
          Tab between cells · auto-saves 0.8s after edit · Save All to force-flush changes
        </p>
      </div>
    </div>
  );
}
