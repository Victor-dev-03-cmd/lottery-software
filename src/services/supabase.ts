/**
 * Supabase cloud sync — all HTTP calls go through the Rust backend (reqwest)
 * to bypass Tauri WebView CORS/fetch restrictions.
 *
 * SQLite is always the primary source of truth.
 * Supabase is a background sync destination — never blocking, never crashing.
 *
 * Supabase table setup (run once in your Supabase SQL editor):
 * ─────────────────────────────────────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS lottery_results (
 *   id              BIGSERIAL PRIMARY KEY,
 *   game_slug       TEXT NOT NULL,
 *   game_name       TEXT,
 *   board           TEXT DEFAULT 'NLB',
 *   draw_number     TEXT DEFAULT '',
 *   draw_date       TEXT NOT NULL,
 *   winning_letter  TEXT DEFAULT '',
 *   winning_numbers JSONB DEFAULT '[]',
 *   super_number    TEXT DEFAULT '',
 *   prizes          JSONB DEFAULT '[]',
 *   source          TEXT DEFAULT 'manual',
 *   saved_at        TIMESTAMPTZ DEFAULT NOW(),
 *   UNIQUE (game_slug, draw_date)
 * );
 * ALTER TABLE lottery_results ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "allow_all" ON lottery_results FOR ALL USING (true);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { invoke } from "@tauri-apps/api/core";
import type { LotteryResult } from "../types";

// ── Push one result to Supabase via Rust reqwest ──────────────────────────────

export async function pushResultToCloud(r: LotteryResult, gameSlug: string): Promise<void> {
  try {
    await invoke("push_to_supabase", { result: r, gameSlug });
  } catch { /* non-fatal */ }
}

// ── Pull latest results from Supabase via Rust, merge into SQLite ─────────────

export async function pullResultsFromCloud(
  onResult: (r: LotteryResult, slug: string) => Promise<void>
): Promise<number> {
  try {
    const rows = await invoke<Record<string, unknown>[]>("pull_from_supabase");
    let count = 0;
    for (const row of rows) {
      await onResult(
        {
          game_slug:       String(row.game_slug ?? ""),
          game_name:       String(row.game_name ?? ""),
          board:           String(row.board ?? "NLB"),
          draw_number:     String(row.draw_number ?? ""),
          draw_date:       String(row.draw_date ?? ""),
          winning_letter:  String(row.winning_letter ?? ""),
          winning_numbers: Array.isArray(row.winning_numbers) ? (row.winning_numbers as string[]) : [],
          super_number:    String(row.super_number ?? ""),
          prizes:          Array.isArray(row.prizes) ? (row.prizes as { rank:string; prize:string; match_desc:string }[]) : [],
          source_url:      "Supabase cloud",
          fetched_at:      String(Date.now()),
          error:           "",
        },
        String(row.game_slug ?? "")
      );
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// ── Save Supabase credentials through Rust (stored in app config JSON) ─────────

export async function saveSupabaseCredentials(url: string, anonKey: string): Promise<void> {
  await invoke("save_supabase_config", { supabaseUrl: url, supabaseAnonKey: anonKey });
}

// ── Test connectivity via Rust ────────────────────────────────────────────────

export async function testSupabaseConnection(): Promise<string> {
  try {
    return await invoke<string>("test_supabase_connection");
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

// ── isSupabaseEnabled: check if credentials are configured ────────────────────
// We can't read app_config from the frontend directly, so check via Rust invoke.
let _enabled: boolean | null = null;
export async function isSupabaseEnabled(): Promise<boolean> {
  if (_enabled !== null) return _enabled;
  try {
    const result = await invoke<string>("test_supabase_connection");
    _enabled = result.startsWith("✓");
    return _enabled;
  } catch {
    _enabled = false;
    return false;
  }
}

// ── Realtime: not available via Rust, use polling fallback ────────────────────
// Returns an unsubscribe fn. Polls every 5 minutes when Supabase is configured.
export function subscribeToCloudUpdates(
  onNewResult: (r: LotteryResult, slug: string) => Promise<void>
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  async function poll() {
    if (stopped) return;
    const enabled = await isSupabaseEnabled().catch(() => false);
    if (enabled) {
      await pullResultsFromCloud(onNewResult).catch(() => {});
    }
    if (!stopped) timer = setTimeout(poll, 5 * 60 * 1000); // 5 min
  }

  // First poll after 30 seconds (let app fully load first)
  timer = setTimeout(poll, 30_000);

  return () => { stopped = true; clearTimeout(timer); };
}
