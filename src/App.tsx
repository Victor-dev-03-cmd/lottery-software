import { useState, useEffect, useRef, createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import AgentDashboard from "./components/AgentDashboard";
import InvoiceList from "./components/InvoiceList";
import NewInvoice from "./components/NewInvoice";
import InvoicePrint from "./components/InvoicePrint";
import AgentsManager from "./components/AgentsManager";
import Settings from "./components/Settings";
import Inventory from "./components/Inventory";
import Reports from "./components/Reports";
import Ledger from "./components/Ledger";
import Returns from "./components/Returns";
import DailyCollectionView from "./components/DailyCollection";
import Commission from "./components/Commission";
import AgentDiscounts from "./components/AgentDiscounts";
import Alerts from "./components/Alerts";
import LiveResults from "./components/LiveResults";
import Purchases from "./components/Purchases";
import SupplierReturns from "./components/SupplierReturns";
import DraftInvoices from "./components/DraftInvoices";
import ConfirmedInvoices from "./components/ConfirmedInvoices";
import CancelledInvoices from "./components/CancelledInvoices";
import InvoiceModel from "./components/InvoiceModel";
import ProfitAnalytics from "./components/ProfitAnalytics";
import DistributionSummary from "./components/DistributionSummary";
import RoleSelectModal from "./components/RoleSelectModal";
import { AuthProvider, useAuth, CASHIER_ALLOWED } from "./contexts/AuthContext";
import { startSyncWorker } from "./services/syncQueue";
import Payroll from "./components/Payroll";
import AIAnalytics from "./components/AIAnalytics";
import PrintExport from "./components/PrintExport";
import SplashScreen from "./components/SplashScreen";
import SetupWizard from "./components/SetupWizard";
import { getDb } from "./services/database";
import { useKeyboardShortcuts, SHORTCUTS } from "./hooks/useKeyboardShortcuts";
import { usePinGuard } from "./hooks/usePinGuard";
import PinModal from "./components/PinModal";
import UpdateNotifier from "./components/UpdateNotifier";
import type { View } from "./types";

// ── Global PIN guard context ──────────────────────────────────────────────────
interface PinGuardCtx {
  requireAdminPin: (title?: string, subtitle?: string) => Promise<boolean>;
}
export const PinGuardContext = createContext<PinGuardCtx>({
  requireAdminPin: async () => true,
});

// ── App startup state ─────────────────────────────────────────────────────────
type AppStage =
  | "splash"       // showing splash + loading config
  | "setup"        // first-run wizard
  | "ready"        // DB loaded, main app
  | "error";       // fatal error

export default function App() {
  const [stage, setStage]   = useState<AppStage>("splash");
  const [splashMsg, setSplashMsg] = useState("Loading configuration…");
  const [defaultDataDir, setDefaultDataDir] = useState("");

  const [view, setView] = useState<View>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [printInvoiceId, setPrintInvoiceId] = useState<number | null>(null);
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<() => void>(() => {});
  const { request: pinRequest, requireAdminPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = usePinGuard();

  // ── Startup sequence ────────────────────────────────────────────────────────
  useEffect(() => {
    async function startup() {
      // Min splash display: 1.8s for branding visibility
      const splashStart = Date.now();

      try {
        // 1. Get app data dir (for wizard default path display)
        let dataDir = "";
        try {
          dataDir = await invoke<string>("get_app_data_dir");
          setDefaultDataDir(dataDir);
        } catch { /* browser preview */ }

        // 2. Read config — check if first run
        let config = { db_directory: "", setup_completed: false };
        try {
          config = await invoke<typeof config>("get_app_config");
        } catch { /* browser preview, skip */ }

        if (!config.setup_completed) {
          // First run → show wizard (after min splash time)
          const elapsed = Date.now() - splashStart;
          if (elapsed < 1800) await delay(1800 - elapsed);
          setStage("setup");
          return;
        }

        // 3. Init DB
        setSplashMsg("Connecting to database…");
        await getDb();
        setDbReady(true);
        // 4. Start offline-first background sync (non-blocking)
        startSyncWorker();

        // 4. Ensure min splash time for branding
        const elapsed = Date.now() - splashStart;
        if (elapsed < 2200) await delay(2200 - elapsed);
        setStage("ready");

      } catch (e) {
        setDbError(String(e));
        setStage("error");
      }
    }
    startup();
  }, []);

  // Called by SetupWizard when user finishes first-run setup
  async function handleSetupComplete() {
    setSplashMsg("Initializing database…");
    setStage("splash");
    try {
      await getDb();
      setDbReady(true);
      await delay(1000);
      setStage("ready");
    } catch (e) {
      setDbError(String(e));
      setStage("error");
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  function navigate(v: View, invoiceId?: number) {
    if (v === ("print" as string)) {
      setPrintInvoiceId(invoiceId ?? null);
      setView("print" as View);
    } else if (v === ("edit-invoice" as string)) {
      setEditInvoiceId(invoiceId ?? null);
      setView("new-invoice");
    } else {
      setEditInvoiceId(null);
      setPrintInvoiceId(null);
      setView(v);
    }
  }

  function handleInvoiceSaved(id: number, nextView: View) {
    setRefreshKey((k) => k + 1);
    if (nextView === ("print" as string)) {
      setPrintInvoiceId(id);
      setView("print" as View);
    } else {
      setView("invoices");
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNavigate: navigate,
    onFocusSearch: () => searchRef.current?.(),
    onToggleHelp: () => setShowHelp((v) => !v),
  });

  // ── Stage renders ────────────────────────────────────────────────────────────

  if (stage === "splash") {
    return <SplashScreen message={splashMsg} />;
  }

  if (stage === "setup") {
    return (
      <SetupWizard
        defaultDataDir={defaultDataDir}
        onComplete={handleSetupComplete}
      />
    );
  }

  if (stage === "error" || dbError) {
    const msg = dbError ?? "Unknown startup error.";
    const isBrowser = msg.includes("invoke") || msg.includes("__TAURI__");
    return (
      <div style={{ background: "#131313" }}
        className="flex items-center justify-center h-screen">
        <div className="text-center p-8 max-w-lg">
          <div className="text-xl font-bold mb-3" style={{ color: "#CF291D" }}>Startup Error</div>
          {isBrowser ? (
            <div className="text-sm space-y-2" style={{ color: "#9CA3AF" }}>
              <p>Run the app with: <code className="text-white font-mono">bun tauri dev</code></p>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                If build fails: <code className="font-mono">sudo apt install pkg-config libsqlite3-dev</code>
              </p>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#9CA3AF" }}>{msg}</p>
          )}
        </div>
      </div>
    );
  }

  const isPrint = view === ("print" as View);

  if (isPrint && printInvoiceId !== null) {
    return <InvoicePrint invoiceId={printInvoiceId} onBack={() => navigate("invoices")} />;
  }

  const sidebarView = (view === "edit-invoice" ? "new-invoice" : view) as View;

  return (
    <AuthProvider>
    <AppInner
      view={view} sidebarView={sidebarView} navigate={navigate}
      sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed}
      dbReady={dbReady} refreshKey={refreshKey} searchRef={searchRef}
      editInvoiceId={editInvoiceId} handleInvoiceSaved={handleInvoiceSaved}
      requireAdminPin={requireAdminPin} pinRequest={pinRequest}
      pinSuccess={pinSuccess} pinCancel={pinCancel}
      showHelp={showHelp} setShowHelp={setShowHelp}
    />
    <UpdateNotifier />
    </AuthProvider>
  );
}

// ── Inner app — has access to AuthContext ─────────────────────────────────────

function AppInner({
  view, sidebarView, navigate, sidebarCollapsed, setSidebarCollapsed,
  dbReady, refreshKey, searchRef, editInvoiceId, handleInvoiceSaved,
  requireAdminPin, pinRequest, pinSuccess, pinCancel,
  showHelp, setShowHelp,
}: {
  view: View; sidebarView: View;
  navigate: (v: View, id?: number) => void;
  sidebarCollapsed: boolean; setSidebarCollapsed: (f: (c: boolean) => boolean) => void;
  dbReady: boolean; refreshKey: number;
  searchRef: React.MutableRefObject<() => void>;
  editInvoiceId: number | null;
  handleInvoiceSaved: (id: number, next: View) => void;
  requireAdminPin: (t?: string, s?: string) => Promise<boolean>;
  pinRequest: import("./hooks/usePinGuard").PinRequest | null;
  pinSuccess: () => void; pinCancel: () => void;
  showHelp: boolean; setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { role, can } = useAuth();

  // Guard: redirect cashier away from restricted view
  const effectiveView: View = (role === "cashier" && !CASHIER_ALLOWED.includes(view))
    ? "dashboard"
    : view;

  return (
    <PinGuardContext.Provider value={{ requireAdminPin }}>
    <div className="flex h-screen overflow-hidden"
      style={{ background: "#F3F4F6" }}>
      {/* Role selection — shown until role is set */}
      {!role && <RoleSelectModal onSelected={() => {}} />}

      <Sidebar active={sidebarView} onNavigate={navigate} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onNavigate={navigate} dbReady={dbReady} refreshKey={refreshKey} onSearchFocusRef={searchRef} />
        <main className="flex-1 overflow-auto">
          {effectiveView === "dashboard"        && <AgentDashboard onNavigate={navigate} refreshKey={refreshKey} />}
          {effectiveView === "invoices"         && <InvoiceList onNavigate={navigate} refreshKey={refreshKey} />}
          {effectiveView === "new-invoice"      && <NewInvoice editInvoiceId={editInvoiceId} onSaved={handleInvoiceSaved} />}
          {effectiveView === "agents"           && can("agents")           && <AgentsManager />}
          {effectiveView === "inventory"        && can("inventory")        && <Inventory />}
          {effectiveView === "reports"          && can("reports")          && <Reports />}
          {effectiveView === "ledger"           && can("ledger")           && <Ledger />}
          {effectiveView === "returns"          && can("returns")          && <Returns />}
          {effectiveView === "collections"      && <DailyCollectionView />}
          {effectiveView === "commission"       && can("commission")       && <Commission />}
          {effectiveView === "agent-discounts"  && <AgentDiscounts />}
          {effectiveView === "alerts"           && <Alerts />}
          {effectiveView === "live-results"     && <LiveResults />}
          {effectiveView === "purchases"          && can("purchases")          && <Purchases />}
          {effectiveView === "supplier-returns"   && can("supplier-returns")   && <SupplierReturns />}
          {effectiveView === "draft-invoices"     && can("draft-invoices")     && <DraftInvoices onNavigate={navigate} />}
          {effectiveView === "confirmed-invoices" && can("confirmed-invoices") && <ConfirmedInvoices onNavigate={navigate} />}
          {effectiveView === "cancelled-invoices" && can("cancelled-invoices") && <CancelledInvoices />}
          {effectiveView === "invoice-model"      && can("invoice-model")      && <InvoiceModel />}
          {effectiveView === "profit-analytics" && can("profit-analytics") && <ProfitAnalytics />}
          {effectiveView === "distribution"     && can("distribution")     && <DistributionSummary />}
          {effectiveView === "payroll"          && can("payroll")          && <Payroll />}
          {effectiveView === "ai-analytics"     && can("ai-analytics")     && <AIAnalytics onNavigate={navigate} />}
          {effectiveView === "print-export"     && <PrintExport onNavigate={navigate} />}
          {effectiveView === "settings"         && can("settings")         && <Settings />}
        </main>
      </div>

      {/* PIN modal — rendered globally so it works in any view */}
      {pinRequest && (
        <PinModal
          title={pinRequest.title}
          subtitle={pinRequest.subtitle}
          verify={pinRequest.verifyWithStatus
            ? undefined                          // let modal use verifyWithStatus directly
            : pinRequest.verify}
          verifyWithStatus={pinRequest.verifyWithStatus}
          onSuccess={pinSuccess}
          onCancel={pinCancel}
        />
      )}

      {/* Keyboard shortcut help overlay */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-gray-800 text-lg mb-4">Keyboard Shortcuts</h2>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{s.desc}</span>
                  <kbd className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded border border-gray-300 font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-4 w-full py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              Close (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
    </PinGuardContext.Provider>
  );
}

/** Convenience hook for any child component to get the PIN guard. */
export function usePinGuardContext() {
  return useContext(PinGuardContext);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
