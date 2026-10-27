import { useEffect } from "react";
import {
  Category2, Notification, ShoppingCart, RotateLeft, House,
  AddCircle, Clock, DocumentFilter, DocumentText, ClipboardClose,
  Brush, Money3, Book1, ClipboardText, PercentageCircle, Wallet,
  People, Hierarchy, Chart21, TrendUp, Cpu, Cup, UserEdit,
  Printer, Setting2, ArrowLeft2, ArrowRight2, Tag,
} from "iconsax-react";
import { useAuth, CASHIER_ALLOWED } from "../../contexts/AuthContext";
import { useLanguage } from "../../i18n";
import type { View } from "../../types";

interface NavItem { view: View; labelKey: string; label: string; icon: React.ReactNode; badge?: string }
interface NavGroup { headingKey: string; heading: string; items: NavItem[] }

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
  const { t, lang } = useLanguage();

  // ── Navigation groups (reactive to language changes) ─────────────────────
  const NAV_GROUPS: NavGroup[] = [
    {
      headingKey: "nav_overview", heading: t("nav_overview"),
      items: [
        { view: "dashboard", labelKey: "nav_dashboard", label: t("nav_dashboard"), icon: <Category2  size={20} variant="Linear" color="currentColor" /> },
        { view: "alerts",    labelKey: "nav_alerts",    label: t("nav_alerts"),    icon: <Notification size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_purchasing", heading: t("nav_purchasing"),
      items: [
        { view: "purchases",        labelKey: "nav_purchases",        label: t("nav_purchases"),        icon: <ShoppingCart size={20} variant="Linear" color="currentColor" /> },
        { view: "supplier-returns", labelKey: "nav_supplier_returns", label: t("nav_supplier_returns"), icon: <RotateLeft   size={20} variant="Linear" color="currentColor" /> },
        { view: "inventory",        labelKey: "nav_inventory",        label: t("nav_inventory"),        icon: <House        size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_sales", heading: t("nav_sales"),
      items: [
        { view: "new-invoice",        labelKey: "nav_new_invoice",        label: t("nav_new_invoice"),        icon: <AddCircle      size={20} variant="Linear" color="currentColor" /> },
        { view: "draft-invoices",     labelKey: "nav_draft_invoices",     label: t("nav_draft_invoices"),     icon: <Clock          size={20} variant="Linear" color="currentColor" /> },
        { view: "confirmed-invoices", labelKey: "nav_confirmed_invoices", label: t("nav_confirmed_invoices"), icon: <DocumentFilter size={20} variant="Linear" color="currentColor" /> },
        { view: "invoices",           labelKey: "nav_paid_invoices",      label: t("nav_paid_invoices"),      icon: <DocumentText   size={20} variant="Linear" color="currentColor" /> },
        { view: "cancelled-invoices", labelKey: "nav_cancelled_invoices", label: t("nav_cancelled_invoices"), icon: <ClipboardClose size={20} variant="Linear" color="currentColor" /> },
        { view: "invoice-model",      labelKey: "nav_invoice_model",      label: t("nav_invoice_model"),      icon: <Brush          size={20} variant="Linear" color="currentColor" /> },
        { view: "returns",            labelKey: "nav_returns",            label: t("nav_returns"),            icon: <Money3         size={20} variant="Linear" color="currentColor" /> },
        { view: "ledger",             labelKey: "nav_ledger",             label: t("nav_ledger"),             icon: <Book1          size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_section_collections", heading: t("nav_section_collections"),
      items: [
        { view: "collections", labelKey: "nav_daily_collections", label: t("nav_daily_collections"), icon: <ClipboardText    size={20} variant="Linear" color="currentColor" /> },
        { view: "commission",  labelKey: "nav_commission",  label: t("nav_commission"),  icon: <PercentageCircle size={20} variant="Linear" color="currentColor" /> },
        { view: "petty-cash",  labelKey: "nav_petty_cash",  label: t("nav_petty_cash"),  icon: <Wallet           size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_agents", heading: t("nav_agents"),
      items: [
        { view: "agents",       labelKey: "nav_agents_list",  label: t("nav_agents_list"),  icon: <People    size={20} variant="Linear" color="currentColor" /> },
        { view: "distribution", labelKey: "nav_distribution", label: t("nav_distribution"), icon: <Hierarchy size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_analytics", heading: t("nav_analytics"),
      items: [
        { view: "reports",          labelKey: "nav_reports",      label: t("nav_reports"),      icon: <Chart21 size={20} variant="Linear" color="currentColor" /> },
        { view: "profit-analytics", labelKey: "nav_profit",       label: t("nav_profit"),       icon: <TrendUp size={20} variant="Linear" color="currentColor" /> },
        { view: "ai-analytics",     labelKey: "nav_ai",           label: t("nav_ai"),           icon: <Cpu     size={20} variant="Linear" color="currentColor" /> },
        { view: "live-results",     labelKey: "nav_live_results", label: t("nav_live_results"), icon: <Cup     size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_operations", heading: t("nav_operations"),
      items: [
        { view: "payroll",      labelKey: "nav_payroll",      label: t("nav_payroll"),      icon: <UserEdit size={20} variant="Linear" color="currentColor" /> },
        { view: "print-export", labelKey: "nav_print_export", label: t("nav_print_export"), icon: <Printer  size={20} variant="Linear" color="currentColor" /> },
      ],
    },
    {
      headingKey: "nav_system", heading: t("nav_system"),
      items: [
        { view: "settings", labelKey: "nav_settings", label: t("nav_settings"), icon: <Setting2 size={20} variant="Linear" color="currentColor" /> },
      ],
    },
  ];

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
            <ArrowLeft2 size={20} variant="Linear" color="currentColor" />
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
                className={`px-4 pt-2.5 pb-0.5 text-[9px] font-black uppercase tracking-[0.12em] select-none ${lang === "si" ? "si" : ""}`}
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
                  title={collapsed && !mobileOpen ? item.label : restricted ? t("nav_admin_only") : undefined}
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
                      className={`ml-2.5 font-medium text-[13px] flex-1 text-left ${lang === "si" ? "si" : ""}`}
                      style={{
                        color: isActive ? BRAND : restricted ? G.itemMuted : G.itemTxt,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontSize: lang === "si" ? "0.8rem" : undefined,
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
                      {item.label}{restricted ? ` (${t("nav_admin_only")})` : ""}
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
            <ArrowRight2 size={14} variant="Linear" color="currentColor" />
          ) : (
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-4 ${lang === "si" ? "si" : ""}`}>
              <ArrowLeft2 size={12} variant="Linear" color="currentColor" /> {t("nav_collapse")}
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
