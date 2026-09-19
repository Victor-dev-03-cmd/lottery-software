/**
 * Full bi-directional sync between local SQLite and Supabase.
 * All calls go through Rust invoke (bypasses WebView CORS).
 *
 * Usage:
 *   import { syncAllTablesToCloud } from './supabaseFullSync';
 *   await syncAllTablesToCloud(onProgress);
 */

import { invoke } from "@tauri-apps/api/core";

export interface SyncProgress {
  table: string;
  pushed: number;
  pulled: number;
  status: "ok" | "error";
  message?: string;
}

export type ProgressCallback = (p: SyncProgress) => void;

// ── Generic push helper (all tables) ──────────────────────────────────────────

async function pushTable(
  tableName: string,
  rows: unknown[],
  onConflict: string,
  cb?: ProgressCallback
): Promise<number> {
  if (!rows.length) return 0;
  try {
    const n = await invoke<number>("supabase_upsert_rows", {
      tableName,
      rows,
      onConflict,
    });
    cb?.({ table: tableName, pushed: n, pulled: 0, status: "ok" });
    return n;
  } catch (e) {
    cb?.({ table: tableName, pushed: 0, pulled: 0, status: "error", message: String(e) });
    return 0;
  }
}

// ── Table-specific sync functions ─────────────────────────────────────────────

/** Push agents → Supabase */
export async function syncAgents(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_agents_for_sync");
  return pushTable("agents", rows, "id", cb);
}

/** Push lottery_games → Supabase */
export async function syncGames(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_games_for_sync");
  return pushTable("lottery_games", rows, "id", cb);
}

/** Push invoices → Supabase */
export async function syncInvoices(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_invoices_for_sync");
  return pushTable("invoices", rows, "invoice_number", cb);
}

/** Push invoice_items → Supabase */
export async function syncInvoiceItems(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_invoice_items_for_sync");
  return pushTable("invoice_items", rows, "id", cb);
}

/** Push inventory_batches → Supabase */
export async function syncInventory(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_inventory_for_sync");
  return pushTable("inventory_batches", rows, "id", cb);
}

/** Push payments → Supabase */
export async function syncPayments(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_payments_for_sync");
  return pushTable("payments", rows, "id", cb);
}

/** Push ticket_returns → Supabase */
export async function syncReturns(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_returns_for_sync");
  return pushTable("ticket_returns", rows, "id", cb);
}

/** Push daily_collections → Supabase */
export async function syncCollections(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_collections_for_sync");
  return pushTable("daily_collections", rows, "id", cb);
}

/** Push commission_schemes → Supabase */
export async function syncCommission(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_commission_for_sync");
  return pushTable("commission_schemes", rows, "id", cb);
}

/** Push lottery_results → Supabase (composite key) */
export async function syncLotteryResults(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_results_for_sync");
  return pushTable("lottery_results", rows, "game_slug,draw_date", cb);
}

/** Push app_settings → Supabase */
export async function syncSettings(cb?: ProgressCallback) {
  const rows = await invoke<unknown[]>("get_all_settings_for_sync");
  return pushTable("app_settings", rows, "key", cb);
}

// ── Master sync — all tables in order ─────────────────────────────────────────

export async function syncAllTablesToCloud(cb?: ProgressCallback): Promise<{
  total: number; success: number; errors: string[];
}> {
  const errors: string[] = [];
  let total = 0, success = 0;

  const tasks: Array<[string, () => Promise<number>]> = [
    ["agents",             () => syncAgents(cb)],
    ["lottery_games",      () => syncGames(cb)],
    ["invoices",           () => syncInvoices(cb)],
    ["invoice_items",      () => syncInvoiceItems(cb)],
    ["inventory_batches",  () => syncInventory(cb)],
    ["payments",           () => syncPayments(cb)],
    ["ticket_returns",     () => syncReturns(cb)],
    ["daily_collections",  () => syncCollections(cb)],
    ["commission_schemes", () => syncCommission(cb)],
    ["lottery_results",    () => syncLotteryResults(cb)],
    ["app_settings",       () => syncSettings(cb)],
  ];

  for (const [name, fn] of tasks) {
    total++;
    try {
      await fn();
      success++;
    } catch (e) {
      errors.push(`${name}: ${String(e)}`);
    }
  }

  return { total, success, errors };
}
