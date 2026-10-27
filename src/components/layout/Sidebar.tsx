import { useEffect } from "react";
import {
  Category2, Notification, ShoppingCart, RotateLeft, House,
  AddCircle, Clock, DocumentFilter, DocumentText, ClipboardClose,
  Brush, Money3, Book1, ClipboardText, PercentageCircle, Wallet,
  People, Hierarchy, Chart21, TrendUp, Cpu, Cup, UserEdit,
  Printer, Setting2, ArrowLeft2, ArrowRight2, Tag,
} from "iconsax-react";
import { useAuth, CASHIER_ALLOWED } from "../../contexts/AuthContext";
import type { View } from "../../types";

interface NavItem { view: View; label: string; icon: React.ReactNode; badge?: string }
interface NavGroup { heading: string; items: NavItem[] }

// ── Navigation groups — ordered by business workflow ─────────────────────────
// 1 Overview  2 Purchase  3 Stock  4 Sales  5 Collect  6 Agents  7 Analytics
// All icon sizes: 20px standard per design system
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "OVERVIEW",
    items: [
      { view: "dashboard", label: "Dashboard",  icon: <Category2  size={20} variant="Linear" /> },
      { view: "alerts",    label: "Alerts",     icon: <Notification size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "PURCHASING",
    items: [
      { view: "purchases",        label: "Stock Purchases",    icon: <ShoppingCart      size={20} variant="Linear" /> },
      { view: "supplier-returns", label: "Return to Supplier", icon: <RotateLeft        size={20} variant="Linear" /> },
      { view: "inventory",        label: "Stock Inventory",    icon: <House             size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "SALES",
    items: [
      { view: "new-invoice",        label: "New Invoice",       icon: <AddCircle        size={20} variant="Linear" /> },
      { view: "draft-invoices",     label: "Draft",             icon: <Clock            size={20} variant="Linear" /> },
      { view: "confirmed-invoices", label: "Confirm / Waiting", icon: <DocumentFilter   size={20} variant="Linear" /> },
      { view: "invoices",           label: "Paid Invoices",     icon: <DocumentText     size={20} variant="Linear" /> },
      { view: "cancelled-invoices", label: "Cancelled",         icon: <ClipboardClose   size={20} variant="Linear" /> },
      { view: "invoice-model",      label: "Invoice Model",     icon: <Brush            size={20} variant="Linear" /> },
      { view: "returns",            label: "Agent Returns",     icon: <Money3           size={20} variant="Linear" /> },
      { view: "ledger",             label: "Payment Agent",     icon: <Book1            size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "COLLECTIONS",
    items: [
      { view: "collections", label: "Daily Collections", icon: <ClipboardText    size={20} variant="Linear" /> },
      { view: "commission",  label: "Commission",        icon: <PercentageCircle size={20} variant="Linear" /> },
      { view: "petty-cash",  label: "Petty Cash",        icon: <Wallet           size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "AGENTS",
    items: [
      { view: "agents",       label: "Agent Profiles", icon: <People    size={20} variant="Linear" /> },
      { view: "distribution", label: "Distribution",   icon: <Hierarchy size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "ANALYTICS",
    items: [
      { view: "reports",          label: "Reports",         icon: <Chart21 size={20} variant="Linear" /> },
      { view: "profit-analytics", label: "Profit & Margin", icon: <TrendUp size={20} variant="Linear" /> },
      { view: "ai-analytics",     label: "AI Intelligence", icon: <Cpu     size={20} variant="Linear" /> },
      { view: "live-results",     label: "Live Results",    icon: <Cup     size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "OPERATIONS",
    items: [
      { view: "payroll",      label: "Workers & Salary", icon: <UserEdit size={20} variant="Linear" /> },
      { view: "print-export", label: "Print & Export",   icon: <Printer  size={20} variant="Linear" /> },
    ],
  },
  {
    heading: "SYSTEM",
    items: [
      { view: "settings", label: "Settings", icon: <Setting2 size={20} variant="Linear" /> },
    ],
  },
];

interface Props {
  active: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
  /** Mobile drawer — true when the off-canvas drawer is open */
  mobileOpen?: boolean;
  /** Called to close the mobile drawer */
  onMobileClose?: () => void;
}

// ── Design tokens — aligned with src/tokens.css ───────────────────────────────
const BRAND   = "#4285F4";
const BRAND_H = "#1A73E8";           // hover / pressed
const BRAND_L = "rgba(66,133,244,0.08)"; // very light brand tint

const G = {
  bg:         "#FFFFFF",
  border:     BRAND,
  divider:    "#F1F3F4",
  shadow:     "2px 0 12px rgba(32,33,36,0.06)",

  sectionTxt: "#9AA0A6",
  itemTxt:    "#202124",
  itemMuted:  "rgba(32,33,36,0.30)",

  activeBg:     BRAND_L,
  activeBorder: BRAND,
  hoverBg:      "#F8F9FA",
  tooltipBg:    "#202124",
};

export default function Sidebar({
  active, onNavigate, collapsed, onToggle,
  mobileOpen = false, onMobileClose,
}: Props) {
  const { role } = useAuth();
  const isCashier = role === "cashier";

  // Close drawer on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMobileClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function handleNavigate(view: View) {
    onNavigate(view);
    // Close mobile drawer on navigation
    if (mobileOpen) onMobileClose?.();
  }

  const sidebarContent = (
    <aside
      className={`flex flex-col h-screen no-print shrink-0 transition-all duration-300
        ${mobileOpen
          ? "fixed inset-y-0 left-0 z-50 w-56"
          : `hidden lg:flex ${collapsed ? "w-16" : "w-56"}`
        }`}
      style={{
        background: G.bg,
        borderRight: `1px solid ${G.border}`,
        boxShadow: G.shadow,
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-3 shrink-0 ${
          collapsed && !mobileOpen ? "justify-center" : ""
        }`}
        style={{ borderBottom: `1px solid ${G.divider}` }}
      >
        {/* Close button — mobile only */}
        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="lg:hidden mr-1 p-1 rounded-lg transition-colors"
            style={{ color: G.sectionTxt }}
            onMouseEnter={e => { e.currentTarget.style.background = G.hoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            aria-label="Close navigation"
          >
            <ArrowLeft2 size={20} variant="Linear" />
          </button>
        )}
        {/* Logo mark */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_H} 100%)`,
            boxShadow: "0 2px 8px rgba(66,133,244,0.30)",
          }}
        >
          <Tag size={15} color="#FFFFFF" variant="Bold" />
        </div>
        {(!collapsed || mobileOpen) && (
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
            {(!collapsed || mobileOpen) ? (
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
                  onClick={() => !restricted && handleNavigate(item.view)}
                  title={collapsed && !mobileOpen ? item.label : restricted ? "Admin only" : undefined}
                  disabled={restricted}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label + (restricted ? " (Admin only)" : "")}
                  className={`w-full flex items-center text-sm transition-all duration-150 group relative
                    ${collapsed && !mobileOpen ? "justify-center py-2" : "py-1.5"}
                    ${restricted ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}`}
                  style={
                    isActive
                      ? {
                          background: G.activeBg,
                          borderLeft: (collapsed && !mobileOpen) ? "none" : `3px solid ${G.activeBorder}`,
                          borderRadius: (collapsed && !mobileOpen) ? "10px" : "0 8px 8px 0",
                          margin: (collapsed && !mobileOpen) ? "2px 8px" : "1px 8px 1px 0",
                          paddingLeft: (collapsed && !mobileOpen) ? undefined : "13px",
                          paddingRight: (collapsed && !mobileOpen) ? undefined : "12px",
                        }
                      : {
                          paddingLeft: (collapsed && !mobileOpen) ? undefined : "16px",
                          paddingRight: (collapsed && !mobileOpen) ? undefined : "12px",
                          margin: (collapsed && !mobileOpen) ? "2px 8px" : "1px 8px 1px 0",
                          borderRadius: (collapsed && !mobileOpen) ? "10px" : "0 8px 8px 0",
                          borderLeft: (collapsed && !mobileOpen) ? "none" : "3px solid transparent",
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
                  {/* Icon */}
                  <span
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 22,
                      color: isActive ? BRAND : restricted ? G.itemMuted : G.itemTxt,
                    }}
                  >
                    {item.icon}
                  </span>

                  {/* Label — expanded or mobile */}
                  {(!collapsed || mobileOpen) && (
                    <span
                      className="ml-2.5 font-medium text-[13px] flex-1 text-left"
                      style={{
                        color: isActive ? BRAND : restricted ? G.itemMuted : G.itemTxt,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.label}
                    </span>
                  )}

                  {/* Admin badge */}
                  {(!collapsed || mobileOpen) && restricted && (
                    <span
                      className="ml-1 shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black tracking-wide"
                      style={{ background: "rgba(66,133,244,0.12)", color: BRAND }}
                    >
                      ADMIN
                    </span>
                  )}

                  {/* Collapsed tooltip (desktop only) */}
                  {collapsed && !mobileOpen && (
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

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {(!collapsed || mobileOpen) ? (
        <div
          className="px-4 py-2.5 text-center shrink-0"
          style={{ borderTop: `1px solid ${G.divider}` }}
        >
          <p className="text-[8px] uppercase tracking-[0.20em] font-bold" style={{ color: G.sectionTxt }}>
            Powered by
          </p>
          <p className="text-[12px] font-black tracking-[0.15em] mt-0.5" style={{ color: BRAND }}>
            ASROZ
          </p>
        </div>
      ) : (
        <div className="py-2 text-center shrink-0" style={{ borderTop: `1px solid ${G.divider}` }}>
          <span className="text-[11px] font-black tracking-widest" style={{ color: BRAND }}>A</span>
        </div>
      )}

      {/* ── Collapse toggle (desktop only) ───────────────────────────────── */}
      {!mobileOpen && (
        <button
          onClick={onToggle}
          className="flex items-center justify-center py-2.5 transition-all duration-150 cursor-pointer shrink-0"
          style={{ borderTop: `1px solid ${G.divider}`, color: G.sectionTxt }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = BRAND;
            (e.currentTarget as HTMLButtonElement).style.background = G.hoverBg;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = G.sectionTxt;
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          {collapsed ? (
            <ArrowRight2 size={14} variant="Linear" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-4">
              <ArrowLeft2 size={12} variant="Linear" /> Collapse
            </span>
          )}
        </button>
      )}
    </aside>
  );

  return (
    <>
      {/* Backdrop — mobile only, shown when drawer is open */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(32,33,36,0.50)" }}
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      {sidebarContent}
    </>
  );
}
