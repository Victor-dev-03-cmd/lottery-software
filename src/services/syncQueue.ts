/**
 * Offline-first sync queue.
 *
 * Every local write enqueues a record here (instant, 0ms).
 * A background worker drains the queue to Supabase every 60s.
 * The UI is never blocked by network latency.
 */

import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./database";

export interface SyncStats {
  flushed: number;
  failed: number;
  remaining: number;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/** Add a record to the local sync queue (pure SQLite write — instant). */
export async function enqueueSync(
  tableName: string,
  operation: "upsert" | "delete",
  payload: Record<string, unknown>,
  onConflict = "id"
): Promise<void> {
  try {
    const d = await getDb();
    await d.execute(
      `INSERT OR IGNORE INTO sync_queue
       (table_name, operation, payload, on_conflict)
       VALUES (?, ?, ?, ?)`,
      [tableName, operation, JSON.stringify(payload), onConflict]
    );
  } catch {
    // Non-fatal — local record still saved
  }
}

/** Drain the queue via Rust (calls Supabase). */
export async function flushQueue(token?: string): Promise<SyncStats> {
  try {
    return await invoke<SyncStats>("drain_sync_queue", { token: token ?? null });
  } catch {
    return { flushed: 0, failed: 0, remaining: 0 };
  }
}

/** Start the background drain worker. Call once on app mount. */
export function startSyncWorker(): void {
  if (workerTimer) return; // already running
  // First flush after 10s to catch anything queued at startup
  setTimeout(() => flush(), 10_000);
  workerTimer = setInterval(flush, 60_000);
}

async function flush() {
  if (isRunning) return;
  isRunning = true;
  try {
    await flushQueue(); // no token = background mode
  } finally {
    isRunning = false;
  }
}

/** Stop the worker (e.g. on app unmount). */
export function stopSyncWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

/** Ensure sync_queue table exists (called from initSchema guard). */
export async function ensureSyncQueueTable(): Promise<void> {
  try {
    const d = await getDb();
    await d.execute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL DEFAULT 'upsert',
        record_id INTEGER,
        payload TEXT NOT NULL DEFAULT '{}',
        on_conflict TEXT DEFAULT 'id',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT DEFAULT ''
      )
    `);
  } catch { /* already exists */ }
}
