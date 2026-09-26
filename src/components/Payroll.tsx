import { useEffect, useState, type ReactNode } from "react";
import {
  Plus, Trash2, X, Save, RefreshCw, Users, Home, ChevronRight,
  CheckCircle, DollarSign, Banknote, CreditCard, UserCheck, Camera,
  Calendar, Building2, ShieldAlert,
} from "lucide-react";
import {
  getWorkers, saveWorker, deleteWorker,
  getWorkerSalaries, saveWorkerSalary, markSalaryPaid,
  generateMonthlyPayroll, getPayrollSummary,
  getPeriodStats,
} from "../services/database";
import type { Worker, WorkerRole, WorkerSalary, SalaryType } from "../types";
import { useAuth } from "../contexts/AuthContext";
// SI imported for bilingual string access (used inline in JSX)

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  "Rs. " + n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return d;
  }
};

const maskAccount = (acc: string) =>
  acc.length > 4 ? `${"*".repeat(acc.length - 4)}${acc.slice(-4)}` : acc;

const getRoleColor = (role: string | undefined) =>
  ROLE_COLORS[role as WorkerRole] ?? { bg: "#F9FAFB", text: "#6B7280" };

// ─── constants ───────────────────────────────────────────────────────────────
const ROLES: WorkerRole[] = [
  "Cashier", "Driver", "Warehouse Keeper", "Sales Rep",
  "Ticket Checker", "Manager", "Other",
];

const ROLE_COLORS: Record<WorkerRole, { bg: string; text: string }> = {
  "Cashier":          { bg: "#EFF6FF", text: "#2563EB" },
  "Driver":           { bg: "#F0FDF4", text: "#16A34A" },
  "Warehouse Keeper": { bg: "#FFF7ED", text: "#EA580C" },
  "Sales Rep":        { bg: "#FAF5FF", text: "#9333EA" },
  "Ticket Checker":   { bg: "#FFFBEB", text: "#D97706" },
  "Manager":          { bg: "#FEF2F2", text: "#DC2626" },
  "Other":            { bg: "#F9FAFB", text: "#6B7280" },
};

const SL_BANKS = [
  "Bank of Ceylon", "People's Bank", "Commercial Bank",
  "Hatton National Bank", "Sampath Bank", "Seylan Bank",
  "Nations Trust Bank", "NDB Bank", "DFCC Bank",
  "Pan Asia Banking Corporation", "Cargills Bank", "MCB Bank",
];

const EMPTY_WORKER: Worker = {
  name: "", role: "Cashier", salary_type: "monthly", basic_salary: 0, daily_rate: 0,
  bank_name: "", bank_account: "", nic_number: "",
  photo: "", work_start_date: "", work_end_date: "",
  transport_allowance: 0, meal_allowance: 0, other_allowances: 0,
  is_active: 1, notes: "",
};

// ─── local types ─────────────────────────────────────────────────────────────
type PayrollSummaryData = {
  total_payroll: number; pending: number; paid: number; worker_count: number;
  pending_count: number; paid_count: number;
};
type PeriodStatsData = {
  invoice_count: number; total_invoiced: number; total_collected: number;
  total_outstanding: number; total_tickets: number;
};
type SalaryEdit = {
  overtime_pay: number; deductions: number; advance_paid: number;
  days_worked: number; notes: string;
};

// ─── FormField helper ────────────────────────────────────────────────────────
function FormField({ label, required = false, children }: {
  label: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1.5">
        <span style={{ color: "#374151" }}>{label}</span>
        {required && <span style={{ color: "#CF291D" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export default function Payroll() {
  const { withAdminToken } = useAuth();

  const [tab, setTab]           = useState<"workers" | "payroll">("workers");
  const [loading, setLoading]   = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workerFilter, setWorkerFilter] = useState<"all" | SalaryType>("all");

  // Workers
  const [workers, setWorkers]   = useState<Worker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<Worker>({ ...EMPTY_WORKER });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  // Payroll
  const [payrollMonth, setPayrollMonth] = useState<string>(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [salaries, setSalaries]             = useState<WorkerSalary[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummaryData | null>(null);
  const [periodStats, setPeriodStats]       = useState<PeriodStatsData | null>(null);
  const [salaryEdits, setSalaryEdits]       = useState<Record<string, SalaryEdit>>({});
  const [generating, setGenerating]         = useState(false);

  // ─── loaders ──────────────────────────────────────────────────────────────
  const loadWorkers = async () => {
    const ws = await getWorkers();
    setWorkers(ws);
  };

  const loadPayrollData = async (month: string) => {
    const [ss, ps] = await Promise.all([
      getWorkerSalaries(month),
      getPayrollSummary(month),
    ]);
    setSalaries(ss);
    setPayrollSummary(ps);
    setSalaryEdits({});
  };

  useEffect(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = Math.max(1, Math.ceil((now.getTime() - startOfMonth.getTime()) / 86_400_000) + 1);
    setLoading(true);
    Promise.all([
      loadWorkers(),
      loadPayrollData(payrollMonth),
      getPeriodStats(days).then(setPeriodStats),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadPayrollData(payrollMonth);
  }, [payrollMonth]);

  // ─── worker handlers ───────────────────────────────────────────────────────
  const openAdd = () => { setForm({ ...EMPTY_WORKER }); setFormError(null); setShowForm(true); };
  const openEdit = (w: Worker) => { setForm({ ...w }); setFormError(null); setShowForm(true); };

  const handleSaveWorker = async () => {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    try {
      await saveWorker(form);
      await loadWorkers();
      setShowForm(false);
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorker = async (id: number) => {
    if (!confirm("Delete this worker? All their salary records will also be removed.")) return;
    setAuthError(null);
    try {
      await withAdminToken(async (_token) => { await deleteWorker(id); });
      await loadWorkers();
    } catch (e) {
      setAuthError(String(e));
    }
  };

  // ─── payroll handlers ──────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateMonthlyPayroll(payrollMonth);
      await loadPayrollData(payrollMonth);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const salaryKey = (s: WorkerSalary) => String(s.id ?? `${s.worker_id}-${s.month}`);

  const getSalaryEdit = (s: WorkerSalary): SalaryEdit =>
    salaryEdits[salaryKey(s)] ?? {
      overtime_pay: s.overtime_pay,
      deductions:   s.deductions,
      advance_paid: s.advance_paid,
      days_worked:  s.days_worked ?? 0,
      notes:        s.notes,
    };

  const updateSalaryEdit = (
    s: WorkerSalary,
    field: keyof SalaryEdit,
    value: number | string,
  ) => {
    const k = salaryKey(s);
    setSalaryEdits(prev => ({ ...prev, [k]: { ...getSalaryEdit(s), [field]: value } }));
  };

  const handleSaveSalary = async (salary: WorkerSalary) => {
    const edits = getSalaryEdit(salary);
    const daysWorked = edits.days_worked ?? salary.days_worked ?? 0;
    // For daily workers, recompute basic_salary from days × rate
    const updatedBasic = (salary.salary_type ?? "monthly") === "daily"
      ? daysWorked * (salary.daily_rate ?? 0)
      : salary.basic_salary;
    await saveWorkerSalary({ ...salary, ...edits, days_worked: daysWorked, basic_salary: updatedBasic });
    await loadPayrollData(payrollMonth);
  };

  const handleMarkPaid = async (s: WorkerSalary) => {
    setAuthError(null);
    try {
      await withAdminToken(async (_token) => { await markSalaryPaid(s.worker_id, payrollMonth); });
      await loadPayrollData(payrollMonth);
    } catch (e) {
      setAuthError(String(e));
    }
  };

  const handleMarkAllPaid = async () => {
    setAuthError(null);
    try {
      await withAdminToken(async (_token) => {
        for (const s of salaries.filter(x => x.status === "pending")) {
          await markSalaryPaid(s.worker_id, payrollMonth);
        }
      });
      await loadPayrollData(payrollMonth);
    } catch (e) {
      setAuthError(String(e));
    }
  };

  // ─── computed ──────────────────────────────────────────────────────────────
  const activeWorkers = workers.filter(w => w.is_active === 1);
  const monthlyEst    = activeWorkers.reduce(
    (sum, w) => sum + w.basic_salary + w.transport_allowance + w.meal_allowance + w.other_allowances, 0,
  );

  const totals = {
    basic:      salaries.reduce((s, r) => s + r.basic_salary, 0),
    transport:  salaries.reduce((s, r) => s + r.transport_allowance, 0),
    meal:       salaries.reduce((s, r) => s + r.meal_allowance, 0),
    ot:         salaries.reduce((s, r) => s + getSalaryEdit(r).overtime_pay, 0),
    other:      salaries.reduce((s, r) => s + r.other_allowances, 0),
    earnings:   salaries.reduce((s, r) => s + r.total_earnings, 0),
    deductions: salaries.reduce((s, r) => s + getSalaryEdit(r).deductions, 0),
    advance:    salaries.reduce((s, r) => s + getSalaryEdit(r).advance_paid, 0),
    // M-18: compute from in-memory edited values so it updates live as user types
    net:        salaries.reduce((s, r) => {
      const e = getSalaryEdit(r);
      return s + r.total_earnings + e.overtime_pay - e.deductions - e.advance_paid;
    }, 0),
  };

  const totalRevenue = periodStats?.total_invoiced ?? 0;
  const totalPayroll = payrollSummary?.total_payroll ?? 0;
  const netImpact    = totalRevenue - totalPayroll;
  const payrollPct   = totalRevenue > 0 ? (totalPayroll / totalRevenue) * 100 : 0;

  // ─── loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: "#F5F5F5", minHeight: "100%" }}
        className="flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin" style={{ color: "#CF291D" }} />
      </div>
    );
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F5F5F5", minHeight: "100%" }}>

      {/* Auth error banner */}
      {authError && (
        <div className="flex items-center gap-2 px-6 py-2 text-sm font-medium"
          style={{ background: "#FEF2F2", borderBottom: "1px solid #FECACA", color: "#DC2626" }}>
          <ShieldAlert size={15} />
          <span>{authError}</span>
          <button onClick={() => setAuthError(null)} className="ml-auto hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      {/* ── Toolbar: breadcrumb + Refresh + Add Worker side by side ── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <nav className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
          <Home size={12} />
          <ChevronRight size={11} />
          <span className="font-semibold" style={{ color: "#1D1D1D" }}>Workers &amp; Salary</span>
          <span className="ml-2 text-[11px] font-medium" style={{ color: "#9CA3AF" }}>
            · {activeWorkers.length} active
          </span>
        </nav>

        {/* Side-by-side buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void loadWorkers(); void loadPayrollData(payrollMonth); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", color: "#6B7280" }}
            title="Refresh">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          {tab === "workers" && (
            <button onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
              style={{ background: "#CF291D" }}>
              <Plus size={14} /> Add Worker
            </button>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 space-y-5">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1D1D1D" }}>
            Workers &amp; Salary
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            Manage staff, allowances and monthly salary &middot;{" "}
            {activeWorkers.length} active worker{activeWorkers.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl p-1"
          style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", width: "fit-content" }}>
          {(["workers", "payroll"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === t
                ? { background: "#CF291D", color: "#FFFFFF" }
                : { color: "#9CA3AF" }}>
              {t === "workers" ? "Workers" : "Salary"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════ TAB: WORKERS */}
        {tab === "workers" && (
          <div className="space-y-5">

            {/* KPI row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="rounded-xl p-2.5" style={{ background: "#FEF2F2" }}>
                  <UserCheck size={20} style={{ color: "#CF291D" }} />
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "#9CA3AF" }}>Active Workers</p>
                  <p className="text-2xl font-bold" style={{ color: "#1D1D1D" }}>{activeWorkers.length}</p>
                </div>
              </div>

              <div className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="rounded-xl p-2.5" style={{ background: "#F0FDF4" }}>
                  <Banknote size={20} style={{ color: "#16A34A" }} />
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "#9CA3AF" }}>Monthly Salary Est.</p>
                  <p className="text-lg font-bold leading-tight" style={{ color: "#1D1D1D" }}>{fmt(monthlyEst)}</p>
                </div>
              </div>

              <div className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="rounded-xl p-2.5" style={{ background: "#FFFBEB" }}>
                  <DollarSign size={20} style={{ color: "#D97706" }} />
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "#9CA3AF" }}>Pending This Month</p>
                  <p className="text-2xl font-bold" style={{ color: "#1D1D1D" }}>
                    {payrollSummary?.pending ?? 0}
                  </p>
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>salary records</p>
                </div>
              </div>
            </div>

            {/* Empty state */}
            {workers.length === 0 ? (
              <div className="rounded-2xl flex flex-col items-center justify-center py-16 gap-4"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <div className="rounded-2xl p-5" style={{ background: "#F5F5F5" }}>
                  <Users size={40} style={{ color: "#D1D5DB" }} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-base" style={{ color: "#1D1D1D" }}>No workers yet</p>
                  <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>Add your first worker to get started</p>
                </div>
                <button onClick={openAdd}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90"
                  style={{ background: "#CF291D" }}>
                  <Plus size={15} /> Add Worker
                </button>
              </div>
            ) : (
              /* Worker type filter + grid */
              <>
              <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
                {([
                  ["all",     "All Workers",       "සියලු",        "#374151"],
                  ["monthly", "Monthly Salaried",  "මාසික",        "#16A34A"],
                  ["daily",   "Daily Wage",         "දෛනික",       "#2563EB"],
                ] as [typeof workerFilter, string, string, string][]).map(([v,en,si,col]) => (
                  <button key={v} onClick={() => setWorkerFilter(v)}
                    style={{
                      padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:700,
                      border:`1px solid ${workerFilter===v?col:"#E5E7EB"}`,
                      background: workerFilter===v?col:"#fff",
                      color: workerFilter===v?"#fff":col, cursor:"pointer",
                    }}>
                    {en} <span className="si" style={{ fontWeight:400 }}>· {si}</span>
                  </button>
                ))}
                <span style={{ marginLeft:"auto", fontSize:11, color:"#9CA3AF" }}>
                  {workers.filter(w => workerFilter==="all" || (w.salary_type??'monthly')===workerFilter).length} workers
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {workers.filter(w => workerFilter==="all" || (w.salary_type??'monthly')===workerFilter).map(w => {
                  const rc = ROLE_COLORS[w.role];
                  return (
                    <div key={w.id}
                      className="rounded-2xl p-5 flex flex-col gap-3"
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #E8E8E8",
                        opacity: w.is_active === 1 ? 1 : 0.6,
                      }}>

                      {/* Role badge + active chip */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: rc.bg, color: rc.text }}>
                          {w.role}
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={w.is_active === 1
                            ? { background: "#F0FDF4", color: "#16A34A" }
                            : { background: "#F9FAFB", color: "#9CA3AF" }}>
                          {w.is_active === 1 ? "Active" : "Inactive"}
                        </span>
                      </div>

                      {/* Avatar + name */}
                      <div className="flex items-center gap-3">
                        {w.photo ? (
                          <img src={w.photo} alt={w.name}
                            className="w-10 h-10 rounded-full object-cover"
                            style={{ border: "2px solid #E8E8E8" }} />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                            style={{ background: rc.bg, color: rc.text }}>
                            {w.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>{w.name}</p>
                          {w.nic_number && (
                            <p className="text-xs" style={{ color: "#9CA3AF" }}>{w.nic_number}</p>
                          )}
                        </div>
                      </div>

                      {/* Salary type badge + amount */}
                      <div className="rounded-xl p-3" style={{ background: "#F9FAFB" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                          <p className="text-xs" style={{ color: "#9CA3AF" }}>
                            {(w.salary_type ?? "monthly") === "monthly" ? "Monthly Salary" : "Daily Wage"}
                            <span className="si" style={{ marginLeft:4, fontSize:9 }}>
                              {(w.salary_type ?? "monthly") === "monthly" ? "· මාසික" : "· දෛනික"}
                            </span>
                          </p>
                          <span style={{
                            padding:"1px 7px", borderRadius:20, fontSize:9, fontWeight:700,
                            background: (w.salary_type ?? "monthly") === "monthly" ? "#DCFCE7" : "#EFF6FF",
                            color:       (w.salary_type ?? "monthly") === "monthly" ? "#16A34A" : "#2563EB",
                          }}>
                            {(w.salary_type ?? "monthly") === "monthly" ? "Monthly" : "Daily"}
                          </span>
                        </div>
                        {(w.salary_type ?? "monthly") === "monthly" ? (
                          <p className="text-base font-bold" style={{ color: "#1D1D1D" }}>{fmt(w.basic_salary)}</p>
                        ) : (
                          <p className="text-base font-bold" style={{ color: "#2563EB" }}>
                            {fmt(w.daily_rate ?? 0)} <span style={{ fontSize:11, fontWeight:400, color:"#9CA3AF" }}>/ day</span>
                          </p>
                        )}
                      </div>

                      {/* Allowances compact */}
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        {[
                          { label: "Transport", val: w.transport_allowance },
                          { label: "Meal",      val: w.meal_allowance },
                          { label: "Other",     val: w.other_allowances },
                        ].map(({ label, val }) => (
                          <div key={label} className="text-center rounded-lg py-1.5"
                            style={{ background: "#F9FAFB" }}>
                            <p style={{ color: "#9CA3AF" }}>{label}</p>
                            <p className="font-semibold" style={{ color: "#1D1D1D" }}>
                              {val > 0 ? `Rs.${val.toLocaleString()}` : "—"}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Bank info */}
                      {w.bank_name && (
                        <div className="flex items-center gap-2 text-xs px-1"
                          style={{ color: "#6B7280" }}>
                          <CreditCard size={12} />
                          <span className="truncate">{w.bank_name}</span>
                          {w.bank_account && (
                            <span className="ml-auto font-mono whitespace-nowrap"
                              style={{ color: "#1D1D1D" }}>
                              {maskAccount(w.bank_account)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Work start */}
                      {w.work_start_date && (
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                          <Calendar size={11} />
                          <span>Since {fmtDate(w.work_start_date)}</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-1 border-t" style={{ borderColor: "#F3F4F6" }}>
                        <button onClick={() => openEdit(w)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                          style={{ background: "#F5F5F5", color: "#1D1D1D", border: "1px solid #E8E8E8" }}>
                          Edit
                        </button>
                        <button
                          onClick={() => { if (w.id !== undefined) void handleDeleteWorker(w.id); }}
                          className="py-1.5 px-3 rounded-lg text-xs font-medium hover:opacity-80"
                          style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════ TAB: PAYROLL */}
        {tab === "payroll" && (
          <div className="space-y-5">

            {/* Month selector + Generate */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>
                <Calendar size={14} style={{ color: "#9CA3AF" }} />
                <input type="month" value={payrollMonth}
                  onChange={e => setPayrollMonth(e.target.value)}
                  className="text-sm font-medium outline-none"
                  style={{ color: "#1D1D1D", background: "transparent" }} />
              </div>
              <button onClick={() => void handleGenerate()} disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#CF291D" }}>
                {generating
                  ? <RefreshCw size={14} className="animate-spin" />
                  : <CheckCircle size={14} />}
                Generate Salary
              </button>
            </div>

            {/* Cash Flow Impact */}
            <div className="rounded-2xl p-5"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${payrollPct > 30 ? "#FCD34D" : "#E8E8E8"}`,
              }}>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={16} style={{ color: payrollPct > 30 ? "#D97706" : "#CF291D" }} />
                <h3 className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>
                  Cash Flow Impact
                </h3>
                {payrollPct > 30 && (
                  <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "#FFFBEB", color: "#D97706" }}>
                    ⚠ High payroll ratio
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl p-4 text-center" style={{ background: "#F0FDF4" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "#16A34A" }}>
                    Revenue (Current Period)
                  </p>
                  <p className="text-xl font-bold" style={{ color: "#15803D" }}>{fmt(totalRevenue)}</p>
                </div>
                <div className="rounded-xl p-4 text-center"
                  style={{ background: payrollPct > 30 ? "#FFFBEB" : "#FEF2F2" }}>
                  <p className="text-xs font-medium mb-1"
                    style={{ color: payrollPct > 30 ? "#D97706" : "#DC2626" }}>
                    Total Salary
                  </p>
                  <p className="text-xl font-bold"
                    style={{ color: payrollPct > 30 ? "#B45309" : "#CF291D" }}>
                    {fmt(totalPayroll)}
                  </p>
                  {totalRevenue > 0 && (
                    <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                      {payrollPct.toFixed(1)}% of revenue
                    </p>
                  )}
                </div>
                <div className="rounded-xl p-4 text-center"
                  style={{ background: netImpact >= 0 ? "#EFF6FF" : "#FEF2F2" }}>
                  <p className="text-xs font-medium mb-1"
                    style={{ color: netImpact >= 0 ? "#2563EB" : "#DC2626" }}>
                    Net Impact
                  </p>
                  <p className="text-xl font-bold"
                    style={{ color: netImpact >= 0 ? "#1D4ED8" : "#CF291D" }}>
                    {netImpact >= 0 ? "+" : ""}{fmt(netImpact)}
                  </p>
                </div>
              </div>
            </div>

            {/* Payroll table */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "#FFFFFF", border: "1px solid #E8E8E8" }}>

              {/* Table header bar */}
              <div className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid #E8E8E8" }}>
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: "#1D1D1D" }}>
                    Payroll — {payrollMonth}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                    {salaries.length} worker{salaries.length !== 1 ? "s" : ""} &middot;{" "}
                    {payrollSummary?.paid_count ?? 0} paid &middot; {payrollSummary?.pending_count ?? 0} pending
                  </p>
                </div>
                {salaries.some(s => s.status === "pending") && (
                  <button onClick={() => void handleMarkAllPaid()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                    style={{ background: "#16A34A" }}>
                    <CheckCircle size={13} /> Mark All Paid
                  </button>
                )}
              </div>

              {salaries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Banknote size={32} style={{ color: "#D1D5DB" }} />
                  <p className="text-sm font-medium" style={{ color: "#6B7280" }}>
                    No salary records for {payrollMonth}
                  </p>
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>
                    Click "Generate Salary" to create salary records for active workers.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8E8" }}>
                        {[
                          "Worker", "Role", "Basic", "Transport", "Meal",
                          "OT Pay", "Other", "Total", "Deductions", "Advance",
                          "Net", "Status", "Actions",
                        ].map(col => (
                          <th key={col}
                            className="px-3 py-3 text-left font-semibold whitespace-nowrap"
                            style={{ color: "#6B7280" }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salaries.map((s, idx) => {
                        const edit = getSalaryEdit(s);
                        const rc   = getRoleColor(s.worker_role);
                        const key  = salaryKey(s);
                        const isDirty = salaryEdits[key] !== undefined;
                        return (
                          <tr key={key}
                            style={{
                              background: idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                              borderBottom: "1px solid #F3F4F6",
                            }}>
                            <td className="px-3 py-3 font-medium whitespace-nowrap"
                              style={{ color: "#1D1D1D" }}>
                              {s.worker_name ?? "—"}
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ background: rc.bg, color: rc.text }}>
                                {s.worker_role ?? "—"}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {(s.salary_type ?? "monthly") === "daily" ? (
                                <div>
                                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                                    <input type="number" min="0" max="31"
                                      value={edit.days_worked || ""}
                                      placeholder="0"
                                      onChange={e => updateSalaryEdit(s, "days_worked", Number(e.target.value))}
                                      className="w-14 px-2 py-1 rounded-lg outline-none"
                                      style={{ border:"2px solid #2563EB", background:"#EFF6FF", color:"#1D4ED8", fontSize:"11px", fontWeight:700 }}
                                      onFocus={e => e.target.select()} />
                                    <span style={{ fontSize:10, color:"#6B7280" }}>days</span>
                                  </div>
                                  <div style={{ fontSize:9, color:"#2563EB", marginTop:2 }}>
                                    {fmt((edit.days_worked||0) * (s.daily_rate||0))}
                                    <span className="si" style={{ marginLeft:3, color:"#9CA3AF" }}>· {s.daily_rate}/day</span>
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: "#374151" }}>{fmt(s.basic_salary)}</span>
                              )}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ color: "#374151" }}>
                              {fmt(s.transport_allowance)}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ color: "#374151" }}>
                              {fmt(s.meal_allowance)}
                            </td>
                            {/* Editable: OT Pay */}
                            <td className="px-3 py-3">
                              <input type="number" min="0"
                                value={edit.overtime_pay || ""}
                                placeholder="0"
                                onChange={e => updateSalaryEdit(s, "overtime_pay", Number(e.target.value))}
                                className="w-20 px-2 py-1 rounded-lg outline-none"
                                style={{ border: "1px solid #E8E8E8", background: "#F9FAFB", color: "#1D1D1D", fontSize: "11px" }}
                                onFocus={(e) => e.target.select()} />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ color: "#374151" }}>
                              {fmt(s.other_allowances)}
                            </td>
                            <td className="px-3 py-3 font-semibold whitespace-nowrap"
                              style={{ color: "#1D1D1D" }}>
                              {fmt(s.total_earnings)}
                            </td>
                            {/* Editable: Deductions */}
                            <td className="px-3 py-3">
                              <input type="number" min="0"
                                value={edit.deductions || ""}
                                placeholder="0"
                                onChange={e => updateSalaryEdit(s, "deductions", Number(e.target.value))}
                                className="w-20 px-2 py-1 rounded-lg outline-none"
                                style={{ border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: "11px" }}
                                onFocus={(e) => e.target.select()} />
                            </td>
                            {/* Editable: Advance */}
                            <td className="px-3 py-3">
                              <input type="number" min="0"
                                value={edit.advance_paid || ""}
                                placeholder="0"
                                onChange={e => updateSalaryEdit(s, "advance_paid", Number(e.target.value))}
                                className="w-20 px-2 py-1 rounded-lg outline-none"
                                style={{ border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontSize: "11px" }}
                                onFocus={(e) => e.target.select()} />
                            </td>
                            <td className="px-3 py-3 font-bold whitespace-nowrap"
                              style={{ color: "#CF291D" }}>
                              {fmt(s.net_salary)}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {s.status === "paid" ? (
                                <div>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: "#F0FDF4", color: "#16A34A" }}>
                                    Paid ✓
                                  </span>
                                  {s.paid_date && (
                                    <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                                      {fmtDate(s.paid_date)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: "#FFFBEB", color: "#D97706" }}>
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => void handleSaveSalary(s)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-80"
                                  style={{ background: isDirty ? "#2563EB" : "#9CA3AF" }}>
                                  <Save size={11} /> Save
                                </button>
                                {s.status === "pending" && (
                                  <button onClick={() => void handleMarkPaid(s)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                                    style={{ background: "#16A34A" }}>
                                    <CheckCircle size={11} /> Paid
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Footer totals row */}
                    <tfoot>
                      <tr style={{ background: "#1D1D1D", borderTop: "2px solid #374151" }}>
                        <td className="px-3 py-3 font-bold text-xs" style={{ color: "#FFFFFF" }}
                          colSpan={2}>TOTALS</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FFFFFF" }}>{fmt(totals.basic)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FFFFFF" }}>{fmt(totals.transport)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FFFFFF" }}>{fmt(totals.meal)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FFFFFF" }}>{fmt(totals.ot)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FFFFFF" }}>{fmt(totals.other)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FFFFFF" }}>{fmt(totals.earnings)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#F87171" }}>{fmt(totals.deductions)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#FCD34D" }}>{fmt(totals.advance)}</td>
                        <td className="px-3 py-3 font-bold text-xs whitespace-nowrap"
                          style={{ color: "#34D399" }}>{fmt(totals.net)}</td>
                        <td className="px-3 py-3" colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════ Slide-in Worker Form */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.35)" }}
            onClick={() => setShowForm(false)} />

          {/* Panel — isolation:isolate prevents sidebar backdrop-filter bleeding through */}
          <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto shadow-2xl"
            style={{
              width: 480,
              background: "#FFFFFF",
              isolation: "isolate",
              backdropFilter: "none",
              WebkitBackdropFilter: "none",
              boxShadow: "-4px 0 32px rgba(0,0,0,0.18)",
            }}>

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ borderBottom: "1px solid #E8E8E8", background: "#FFFFFF" }}>
              <div>
                <h2 className="font-bold text-base" style={{ color: "#1D1D1D" }}>
                  {form.id ? "Edit Worker" : "Add Worker"}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                  {form.id ? "Update worker details" : "Fill in the worker information"}
                </p>
              </div>
              <button onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 hover:bg-gray-100">
                <X size={18} style={{ color: "#6B7280" }} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Form error */}
              {formError && (
                <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                  style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                  <ShieldAlert size={15} /> {formError}
                </div>
              )}

              {/* Photo */}
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "#374151" }}>
                  Photo
                </label>
                <div className="flex items-center gap-4">
                  {form.photo ? (
                    <img src={form.photo} alt="preview"
                      className="w-16 h-16 rounded-xl object-cover"
                      style={{ border: "2px solid #E8E8E8" }} />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center"
                      style={{ background: "#F9FAFB", border: "2px dashed #D1D5DB" }}>
                      <Camera size={20} style={{ color: "#9CA3AF" }} />
                    </div>
                  )}
                  <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: "#F5F5F5", border: "1px solid #E8E8E8", color: "#374151" }}>
                    <Camera size={13} /> Upload Photo
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev =>
                          setForm(p => ({ ...p, photo: (ev.target?.result as string) ?? "" }));
                        reader.readAsDataURL(file);
                      }} />
                  </label>
                  {form.photo && (
                    <button onClick={() => setForm(p => ({ ...p, photo: "" }))}
                      className="text-xs" style={{ color: "#DC2626" }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Name + Role */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Full Name" required>
                  <input value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Kamal Perera"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }} />
                </FormField>
                <FormField label="Role" required>
                  <select value={form.role}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value as WorkerRole }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </FormField>
              </div>

              {/* Salary & Allowances */}
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: "#F9FAFB", border: "1px solid #E8E8E8" }}>
                <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5"
                  style={{ color: "#9CA3AF" }}>
                  <Banknote size={13} /> Salary &amp; Allowances
                  <span className="si" style={{ fontWeight:400, textTransform:"none" }}>· වේතනය සහ දීමනා</span>
                </p>

                {/* Salary type toggle */}
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color:"#374151" }}>
                    Payment Type / <span className="si" style={{ fontWeight:400 }}>ගෙවීම් වර්ගය</span> *
                  </label>
                  <div style={{ display:"flex", gap:6 }}>
                    {([["monthly","Monthly Salary","මාසික වේතනය"],["daily","Daily Wage","දෛනික වේතනය"]] as [SalaryType,string,string][]).map(([v,en,si]) => (
                      <button key={v} type="button" onClick={() => setForm(p=>({...p, salary_type:v}))}
                        style={{
                          flex:1, padding:"8px 10px", borderRadius:8, border:"2px solid",
                          borderColor: form.salary_type===v ? "#CF291D" : "#E5E7EB",
                          background: form.salary_type===v ? "#FEF2F2" : "#fff",
                          cursor:"pointer", textAlign:"center",
                        }}>
                        <div style={{ fontSize:12, fontWeight:700, color: form.salary_type===v?"#CF291D":"#374151" }}>{en}</div>
                        <div className="si" style={{ fontSize:9, color:"#9CA3AF" }}>{si}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {form.salary_type === "monthly" ? (
                    <FormField label={`Basic Salary (Rs.) · මාසික මූලික වේතනය`} required>
                      <input type="number" min="0" value={form.basic_salary || ""}
                        placeholder="0"
                        onChange={e => setForm(p => ({ ...p, basic_salary: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", color: "#1D1D1D" }}
                        onFocus={(e) => e.target.select()} />
                    </FormField>
                  ) : (
                    <FormField label={`Daily Rate (Rs./day) · දෛනික ගාස්තු`} required>
                      <input type="number" min="0" step="0.01" value={form.daily_rate || ""}
                        placeholder="e.g. 1500"
                        onChange={e => setForm(p => ({ ...p, daily_rate: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                        style={{ border: "2px solid #2563EB", background: "#EFF6FF", color: "#1D4ED8" }}
                        onFocus={(e) => e.target.select()} />
                      <p style={{ fontSize:10, color:"#2563EB", marginTop:2 }}>
                        Salary = Rate × Days Worked <span className="si">· ගෙවීම = ගාස්තු × දින</span>
                      </p>
                    </FormField>
                  )}
                  <FormField label="Transport Allowance (Rs.)">
                    <input type="number" min="0" value={form.transport_allowance || ""}
                      placeholder="0"
                      onChange={e => setForm(p => ({ ...p, transport_allowance: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", color: "#1D1D1D" }}
                      onFocus={(e) => e.target.select()} />
                  </FormField>
                  <FormField label="Meal Allowance (Rs.)">
                    <input type="number" min="0" value={form.meal_allowance || ""}
                      placeholder="0"
                      onChange={e => setForm(p => ({ ...p, meal_allowance: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", color: "#1D1D1D" }}
                      onFocus={(e) => e.target.select()} />
                  </FormField>
                  <FormField label="Other Allowances (Rs.)">
                    <input type="number" min="0" value={form.other_allowances || ""}
                      placeholder="0"
                      onChange={e => setForm(p => ({ ...p, other_allowances: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", color: "#1D1D1D" }}
                      onFocus={(e) => e.target.select()} />
                  </FormField>
                </div>
              </div>

              {/* Bank details */}
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: "#F9FAFB", border: "1px solid #E8E8E8" }}>
                <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5"
                  style={{ color: "#9CA3AF" }}>
                  <Building2 size={13} /> Bank Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Bank Name">
                    <select value={form.bank_name}
                      onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", color: "#1D1D1D" }}>
                      <option value="">Select bank…</option>
                      {SL_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Account Number">
                    <input value={form.bank_account}
                      onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))}
                      placeholder="Account number"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: "1px solid #E8E8E8", background: "#FFFFFF", color: "#1D1D1D" }} />
                  </FormField>
                </div>
              </div>

              {/* NIC + Active */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <FormField label="NIC Number">
                  <input value={form.nic_number}
                    onChange={e => setForm(p => ({ ...p, nic_number: e.target.value }))}
                    placeholder="e.g. 901234567V"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }} />
                </FormField>
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" id="worker_active"
                    checked={form.is_active === 1}
                    onChange={e => setForm(p => ({ ...p, is_active: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: "#CF291D" }} />
                  <label htmlFor="worker_active" className="text-sm font-medium"
                    style={{ color: "#374151" }}>
                    Active Worker
                  </label>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Work Start Date">
                  <input type="date" value={form.work_start_date}
                    onChange={e => setForm(p => ({ ...p, work_start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }} />
                </FormField>
                <FormField label="Work End Date">
                  <input type="date" value={form.work_end_date}
                    onChange={e => setForm(p => ({ ...p, work_end_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }} />
                </FormField>
              </div>

              {/* Notes */}
              <FormField label="Notes">
                <textarea value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Optional notes…"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ border: "1px solid #E8E8E8", background: "#FAFAFA", color: "#1D1D1D" }} />
              </FormField>
            </div>

            {/* Save button */}
            <div className="px-6 pb-8 pt-2">
              <button onClick={() => void handleSaveWorker()} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#CF291D" }}>
                {saving
                  ? <RefreshCw size={15} className="animate-spin" />
                  : <Save size={15} />}
                {saving ? "Saving…" : form.id ? "Update Worker" : "Add Worker"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
