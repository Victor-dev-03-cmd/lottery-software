import { useState, useCallback, useRef } from "react";
import { getAppSettings, saveSetting } from "../services/database";

/**
 * Returns the per-device salt stored in app_settings.
 * If none exists yet, generates a random 32-byte hex string and persists it.
 * This prevents precomputed rainbow tables from being usable across devices (H-14).
 */
async function getOrCreateDeviceSalt(): Promise<string> {
  const settings = await getAppSettings();
  if (settings.pin_device_salt) return settings.pin_device_salt;
  // Generate a unique random salt for this installation
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const salt = Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
  await saveSetting("pin_device_salt", salt);
  return salt;
}

/** SHA-256 with the given salt string */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256(pin + deviceSalt) — unique salt per device prevents precomputed rainbow tables */
export async function hashPin(pin: string): Promise<string> {
  const salt = await getOrCreateDeviceSalt();
  return sha256(pin + salt);
}

/** Hash using the legacy fixed salt (used for migration only) */
async function hashPinLegacy(pin: string): Promise<string> {
  return sha256(pin + "_nimalsiri_2026");
}

/**
 * Try both the new device-salt hash and the legacy fixed salt.
 * If the legacy salt matches, automatically re-hash with the new salt (one-time migration).
 * Returns true if PIN is correct.
 */
async function verifyAndMigrate(enteredPin: string, stored: string): Promise<boolean> {
  // Try new salt first (normal case after migration)
  const newHash = await hashPin(enteredPin);
  if (newHash === stored) return true;
  // Fallback: try legacy salt (first login after H-14 upgrade)
  const legacyHash = await hashPinLegacy(enteredPin);
  if (legacyHash === stored) {
    // Auto-migrate: re-save using new device salt so future logins use the stronger hash
    await saveSetting("admin_pin_hash", newHash);
    return true;
  }
  return false;
}

/** Verifies a raw PIN against the stored hash. Returns false if no PIN is configured — caller must block. */
export async function verifyAdminPin(enteredPin: string): Promise<boolean> {
  const settings = await getAppSettings();
  const stored = settings.admin_pin_hash ?? "";
  if (!stored) return false;
  return verifyAndMigrate(enteredPin, stored);
}

/** Returns a special sentinel when no PIN is configured so the modal can show a helpful message. */
export async function verifyAdminPinWithStatus(
  enteredPin: string
): Promise<{ ok: boolean; noPinConfigured: boolean }> {
  const settings = await getAppSettings();
  const stored = settings.admin_pin_hash ?? "";
  if (!stored) return { ok: false, noPinConfigured: true };
  const ok = await verifyAndMigrate(enteredPin, stored);
  return { ok, noPinConfigured: false };
}

export async function verifyCashierPin(enteredPin: string): Promise<boolean> {
  const settings = await getAppSettings();
  const stored = settings.cashier_pin_hash ?? "";
  if (!stored) return false;
  return verifyAndMigrate(enteredPin, stored);
}

/** Returns true if an admin PIN has been configured. */
export async function isAdminPinSet(): Promise<boolean> {
  const settings = await getAppSettings();
  return !!(settings.admin_pin_hash ?? "");
}

// ── Global PIN guard state hook ────────────────────────────────────────────

export interface PinRequest {
  title: string;
  subtitle: string;
  verify: (pin: string) => Promise<boolean>;
  verifyWithStatus?: (pin: string) => Promise<{ ok: boolean; noPinConfigured: boolean }>;
  resolve: (ok: boolean) => void;
}

export function usePinGuard() {
  const [request, setRequest] = useState<PinRequest | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  /** Shows the PIN modal. Resolves to true if correct PIN entered, false if cancelled. */
  const requirePin = useCallback(
    (
      verify: (pin: string) => Promise<boolean>,
      title = "Admin PIN Required",
      subtitle = "This action requires administrator access"
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setRequest({ title, subtitle, verify, resolve });
      });
    },
    []
  );

  const requireAdminPin = useCallback(
    (title?: string, subtitle?: string): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setRequest({
          title: title ?? "Admin Verification",
          subtitle: subtitle ?? "This action requires administrator access",
          verify: verifyAdminPin,
          verifyWithStatus: verifyAdminPinWithStatus,
          resolve,
        });
      });
    },
    []
  );

  function handleSuccess() {
    setRequest(null);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }

  function handleCancel() {
    setRequest(null);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }

  return { request, requireAdminPin, requirePin, handleSuccess, handleCancel };
}
