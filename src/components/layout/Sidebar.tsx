import {
  LayoutDashboard, FileText, PlusCircle, Users,
  BarChart2, Settings, ChevronLeft, ChevronRight,
  Ticket, RotateCcw, ClipboardList, Percent, Bell, Trophy, ShoppingCart,
  TrendingUp, Network, Brain, Printer, UserCog,
  Warehouse, HandCoins, FileClock, FileCheck, FileX, Palette, BookOpen,
} from "lucide-react";
import { useAuth, CASHIER_ALLOWED } from "../../contexts/AuthContext";
import type { View } from "../../types";

interface NavItem { view: View; label: string; icon: React.ReactNode; badge?: string }
interface NavGroup { heading: string; items: NavItem[] }

// ── Navigation groups — ordered by business workflow ─────────────────────────
// 1 Overview  2 Purchase  3 Stock  4 Sales  5 Collect  6 Agents  7 Analytics
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "OVERVIEW",
    items: [
      { view: "dashboard", label: "Dashboard",  icon: <LayoutDashboard size={17} /> },
      { view: "alerts",    label: "Alerts",     icon: <Bell size={17} /> },
    ],
  },
  {
    // Step 1: Buy stock from Nimalsiri
    heading: "PURCHASING",
    items: [
      { view: "purchases",         label: "Stock Purchases",    icon: <ShoppingCart size={17} /> },
      { view: "supplier-returns",  label: "Return to Supplier", icon: <RotateCcw size={17} /> },
      { view: "inventory",         label: "Stock Inventory",    icon: <Warehouse size={17} /> },
    ],
  },
  {
    // Step 2: Sell to agents
    heading: "SALES",
    items: [
      { view: "new-invoice",          label: "New Invoice",      icon: <PlusCircle size={17} /> },
      { view: "draft-invoices",       label: "Draft",            icon: <FileClock size={17} /> },
      { view: "confirmed-invoices",   label: "Confirm / Waiting",icon: <FileCheck size={17} /> },
      { view: "invoices",             label: "Paid Invoices",    icon: <FileText size={17} /> },
      { view: "cancelled-invoices",   label: "Cancelled",        icon: <FileX size={17} /> },
      { view: "invoice-model",        label: "Invoice Model",    icon: <Palette size={17} /> },
      { view: "returns",              label: "Agent Returns",    icon: <HandCoins size={17} /> },
      { view: "ledger",               label: "Payment Agent",   icon: <BookOpen size={17} /> },
    ],
  },
  {
    // Step 3: Collect payments
    heading: "COLLECTIONS",
    items: [
      { view: "collections", label: "Daily Collections", icon: <ClipboardList size={17} /> },
      { view: "commission",  label: "Commission",        icon: <Percent size={17} /> },
    ],
  },
  {
    // Agents
    heading: "AGENTS",
    items: [
      { view: "agents",       label: "Agent Profiles",   icon: <Users size={17} /> },
      { view: "distribution", label: "Distribution",     icon: <Network size={17} /> },
    ],
  },
  {
    // Analytics & Intelligence
    heading: "ANALYTICS",
    items: [
      { view: "reports",          label: "Reports",          icon: <BarChart2 size={17} /> },
      { view: "profit-analytics", label: "Profit & Margin",  icon: <TrendingUp size={17} /> },
      { view: "ai-analytics",     label: "AI Intelligence",  icon: <Brain size={17} /> },
      { view: "live-results",     label: "Live Results",     icon: <Trophy size={17} /> },
    ],
  },
  {
    // Operations & People
    heading: "OPERATIONS",
    items: [
      { view: "payroll",      label: "Workers & Salary",  icon: <UserCog size={17} /> },
      { view: "print-export", label: "Print & Export",    icon: <Printer size={17} /> },
    ],
  },
  {
    heading: "SYSTEM",
    items: [
      { view: "settings", label: "Settings", icon: <Settings size={17} /> },
    ],
  },
];

interface Props {
  active: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
}

// ── Professional clean white sidebar tokens ───────────────────────────────────
const G = {
  bg:           "#FFFFFF",
  backdropFilter: "none",
  border:       "#CF291D",
  divider:      "#F3F4F6",
  shadow:       "2px 0 12px rgba(0,0,0,0.06)",

  // Text — clean dark
  sectionTxt:   "#9CA3AF",
  itemTxt:      "#111827",
  itemMuted:    "rgba(17,24,39,0.30)",

  // Active item — left accent bar style
  activeBg:     "rgba(207,41,29,0.07)",
  activeBorder: "#CF291D",
  activeShadow: "none",
  activeGrad:   "rgba(207,41,29,0.07)", // kept for logo only

  // Hover — very subtle neutral fill
  hoverBg:      "#F5F5F5",
  hoverBorder:  "transparent",

  // Tooltip
  tooltipBg:    "#111827",
};

export default function Sidebar({ active, onNavigate, collapsed, onToggle }: Props) {
  const { role } = useAuth();
  const isCashier = role === "cashier";

  return (
    <aside
      className={`flex flex-col h-screen transition-all duration-300 no-print shrink-0 ${
        collapsed ? "w-16" : "w-56"
      }`}
      style={{
        background: G.bg,
        borderRight: `1px solid ${G.border}`,
        boxShadow: G.shadow,
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 shrink-0 ${collapsed ? "justify-center" : ""}`}
        style={{ borderBottom: `1px solid ${G.divider}` }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg,#CF291D 0%,#B50717 100%)", boxShadow: "0 2px 8px rgba(207,41,29,0.30)" }}
        >
          <Ticket size={15} className="text-white" />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div
              className="text-sm font-black leading-tight"
              style={{ color: G.itemTxt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              Ajith Rohana
            </div>
            <div className="text-[10px] font-semibold" style={{ color: G.sectionTxt, whiteSpace: "nowrap" }}>
              Lottery Manager
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-1">
            {!collapsed ? (
              <div
                className="px-4 pt-2.5 pb-0.5 text-[9px] font-black uppercase tracking-[0.12em] select-none"
                style={{ color: G.sectionTxt }}
              >
                {group.heading}
              </div>
            ) : (
              <div className="mx-3 my-1" style={{ height: 1, background: G.divider }} />
            )}

            {group.items.map((item) => {
              const isActive   = active === item.view;
              const restricted = isCashier && !CASHIER_ALLOWED.includes(item.view);

              return (
                <button
                  key={item.view}
                  onClick={() => !restricted && onNavigate(item.view)}
                  title={collapsed ? item.label : restricted ? "Admin only" : undefined}
                  disabled={restricted}
                  className={`w-full flex items-center text-sm transition-all duration-150 group relative
                    ${collapsed ? "justify-center py-2" : "py-1.5"}
                    ${restricted ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}`}
                  style={
                    isActive
                      ? {
                          background: G.activeBg,
                          borderLeft: collapsed ? "none" : `3px solid ${G.activeBorder}`,
                          borderRadius: collapsed ? "10px" : "0 8px 8px 0",
                          margin: collapsed ? "2px 8px" : "1px 8px 1px 0",
                          paddingLeft: collapsed ? undefined : "13px",
                          paddingRight: collapsed ? undefined : "12px",
                        }
                      : {
                          paddingLeft: collapsed ? undefined : "16px",
                          paddingRight: collapsed ? undefined : "12px",
                          margin: collapsed ? "2px 8px" : "1px 8px 1px 0",
                          borderRadius: collapsed ? "10px" : "0 8px 8px 0",
                          borderLeft: collapsed ? "none" : "3px solid transparent",
                        }
                  }
                  onMouseEnter={e => {
                    if (!isActive && !restricted)
                      (e.currentTarget as HTMLButtonElement).style.background = G.hoverBg;
                  }}
                  onMouseLeave={e => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {/* Icon — always fixed width so label never shifts */}
                  <span
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 20,
                      color: isActive ? "#CF291D" : restricted ? G.itemMuted : G.itemTxt,
                    }}
                  >
                    {item.icon}
                  </span>

                  {/* Label — only in expanded mode */}
                  {!collapsed && (
                    <span
                      className="ml-2 font-medium text-[13px] flex-1 text-left"
                      style={{
                        color: isActive ? "#CF291D" : restricted ? G.itemMuted : G.itemTxt,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.label}
                    </span>
                  )}

                  {/* Admin badge */}
                  {!collapsed && restricted && (
                    <span
                      className="ml-1 shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black tracking-wide"
                      style={{ background: "rgba(207,41,29,0.14)", color: "#CF291D" }}
                    >
                      ADMIN
                    </span>
                  )}

                  {/* Collapsed tooltip */}
                  {collapsed && (
                    <span
                      className="absolute left-full ml-3 px-3 py-1.5 text-xs rounded-xl opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50 font-semibold transition-opacity duration-150"
                      style={{
                        background: G.tooltipBg,
                        color: "#FFFFFF",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.20)",
                      }}
                    >
                      {item.label}{restricted ? " (Admin only)" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Powered by ASROZ ─────────────────────────────────────────────── */}
      {!collapsed ? (
        <div
          className="px-4 py-2.5 text-center shrink-0"
          style={{ borderTop: `1px solid ${G.divider}` }}
        >
          <p className="text-[8px] uppercase tracking-[0.20em] font-bold" style={{ color: G.sectionTxt }}>
            Powered by
          </p>
          <p className="text-[12px] font-black tracking-[0.15em] mt-0.5" style={{ color: "#CF291D" }}>
            ASROZ
          </p>
        </div>
      ) : (
        <div className="py-2 text-center shrink-0" style={{ borderTop: `1px solid ${G.divider}` }}>
          <span className="text-[11px] font-black tracking-widest" style={{ color: "#CF291D" }}>A</span>
        </div>
      )}

      {/* ── Collapse toggle ───────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center py-2.5 transition-all duration-150 cursor-pointer shrink-0"
        style={{ borderTop: `1px solid ${G.divider}`, color: G.itemMuted }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#CF291D"; (e.currentTarget as HTMLButtonElement).style.background = G.hoverBg; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = G.itemMuted; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        {collapsed ? (
          <ChevronRight size={14} />
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-4">
            <ChevronLeft size={12} /> Collapse
          </span>
        )}
      </button>
    </aside>
  );
}
