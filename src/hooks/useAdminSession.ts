/**
 * React hook for the Rust-backed admin session.
 *
 * The session token lives only in:
 *   1. Rust heap (ADMIN_SESSION static)  — verified by privileged Tauri commands
 *   2. React component state (never localStorage/sessionStorage)
 *
 * This makes it impossible for UI tampering to bypass Rust-level auth checks.
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AdminSession {
  token: string | null;
  isAuthenticated: boolean;
  login: (pinHash: string) => Promise<boolean>;
  logout: () => void;
  /** Verify the stored token is still valid on the Rust side. */
  verify: () => Promise<boolean>;
}

export function useAdminSession(): AdminSession {
  const [token, setToken] = useState<string | null>(null);

  const login = useCallback(async (pinHash: string): Promise<boolean> => {
    try {
      const t = await invoke<string>("begin_admin_session", { pinHash });
      setToken(t);
      return true;
    } catch {
      setToken(null);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    invoke("end_admin_session").catch(() => {});
    setToken(null);
  }, []);

  const verify = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      return await invoke<boolean>("verify_admin_session", { token });
    } catch {
      return false;
    }
  }, [token]);

  return {
    token,
    isAuthenticated: token !== null,
    login,
    logout,
    verify,
  };
}
