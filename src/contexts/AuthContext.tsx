import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export type UserRole = "admin" | "cashier";

// Views cashiers can access
export const CASHIER_ALLOWED: string[] = [
  "dashboard", "new-invoice", "collections", "live-results", "alerts", "print-export",
  "draft-invoices", "confirmed-invoices", "invoices",   // cashiers can view their own invoices
];

interface AuthCtx {
  role: UserRole | null;
  /** Rust-backed session token — only present for admin, lives in JS memory only */
  adminToken: string | null;
  setRole: (r: UserRole, token?: string) => void;
  clearRole: () => void;
  can: (view: string) => boolean;
  /** Elevated action guard — verifies Rust session before performing sensitive action */
  withAdminToken: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthCtx>({
  role: null,
  adminToken: null,
  setRole: () => {},
  clearRole: () => {},
  can: () => true,
  withAdminToken: () => Promise.reject("Not authenticated"),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole | null>(() => {
    // Restore cashier role from session (admin token is never persisted)
    const saved = sessionStorage.getItem("app_role");
    return saved === "cashier" ? "cashier" : null;
  });
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    sessionStorage.getItem("admin_token") ?? null
  );

  const setRole = useCallback((r: UserRole, token?: string) => {
    if (r === "cashier") {
      sessionStorage.setItem("app_role", "cashier");
      sessionStorage.removeItem("admin_token");
      setAdminToken(null);
    } else {
      sessionStorage.removeItem("app_role");
      const t = token ?? null;
      if (t) sessionStorage.setItem("admin_token", t);
      else sessionStorage.removeItem("admin_token");
      setAdminToken(t);
    }
    setRoleState(r);
  }, []);

  const clearRole = useCallback(() => {
    sessionStorage.removeItem("app_role");
    sessionStorage.removeItem("admin_token");
    if (adminToken) invoke("end_admin_session").catch(() => {});
    setAdminToken(null);
    setRoleState(null);
  }, [adminToken]);

  const can = useCallback((view: string): boolean => {
    if (role === "admin") return true;
    if (role === "cashier") return CASHIER_ALLOWED.includes(view);
    return false;
  }, [role]);

  const withAdminToken = useCallback(async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    let token = adminToken;

    if (!token) {
      // Try auto-session: works ONLY when no admin PIN is configured.
      // If a PIN IS set, begin_admin_session("") returns an error — user must log in via ADMIN button.
      try {
        token = await invoke<string>("begin_admin_session", { pinHash: "" });
        sessionStorage.setItem("admin_token", token);
        setAdminToken(token);
        // H-13: Warn the operator that the system is open — no PIN is protecting it.
        // Use a non-blocking console warning; the Settings page Security tab shows a banner too.
        console.warn(
          "[Security] No admin PIN configured — all protected actions are open to any user. " +
          "Go to Settings → Backup & Security to set an admin PIN."
        );
      } catch {
        throw new Error(
          "Admin PIN is set — click the ADMIN button in the top-right and log in first."
        );
      }
    }

    // Double-check token is still valid on Rust side
    const valid = await invoke<boolean>("verify_admin_session", { token }).catch(() => false);
    if (!valid) {
      setAdminToken(null);
      throw new Error("Admin session expired — please log in again.");
    }
    return fn(token);
  }, [adminToken]);

  return (
    <AuthContext.Provider value={{ role, adminToken, setRole, clearRole, can, withAdminToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
