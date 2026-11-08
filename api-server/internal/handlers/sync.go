package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// maxSyncRetries is documented here for cross-reference with the Rust drain query
// ("WHERE retry_count < 3" in drain_sync_queue_to_backend). If you increase this,
// also update the Rust drain to: WHERE retry_count < maxSyncRetries.
// Note: enforcement lives in the Rust client; this constant is a documentation and
// test anchor only — the Go server does not control retry counting.
const maxSyncRetries = 10

// tableAllowlist lists every table that may receive upserts via the sync API.
// Adding a new table requires a code change — prevents arbitrary SQL injection.
var tableAllowlist = map[string]string{
	// Table name → on-conflict column(s)
	"agents":                   "id",
	"invoices":                 "id",
	"invoice_items":            "id",
	"inventory_batches":        "id",
	"payments":                 "id",
	"ticket_returns":           "id",
	"daily_collections":        "id",
	"suppliers":                "id",
	"purchase_invoices":        "id",
	"purchase_invoice_items":   "id",
	"purchase_payments":        "id",
	"lottery_games":            "id",
	"commission_schemes":       "id",
	"workers":                  "id",
	"worker_salaries":          "id",
	"supplier_returns":         "id",
	"petty_cash_transactions":  "id",
	"petty_cash_closings":      "id",
	"lottery_results":          "game_slug,draw_date",
	"company_settings":         "id",
}

// deletableTableAllowlist is a subset of tableAllowlist that permits hard deletes.
// Only tables where delete sync is explicitly required should be listed here.
var deletableTableAllowlist = map[string]bool{
	"invoices": true,
}

// ── Batch upsert (sync queue drain) ───────────────────────────────────────────

type batchReq struct {
	Table      string                   `json:"table"`
	Rows       []map[string]interface{} `json:"rows"`
	OnConflict string                   `json:"on_conflict"`
	Operation  string                   `json:"operation"` // "upsert" (default) or "delete"
	RecordID   *int64                   `json:"record_id"` // required when Operation == "delete"
}

type batchResp struct {
	Upserted int    `json:"upserted"`
	Failed   int    `json:"failed"`
	Error    string `json:"error,omitempty"`
}

func SyncBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req batchReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			if strings.Contains(err.Error(), "request body too large") {
				writeError(w, "request body too large", http.StatusRequestEntityTooLarge)
				return
			}
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}

		conflictCol, ok := tableAllowlist[req.Table]
		if !ok {
			writeError(w, fmt.Sprintf("table not allowed: %s", req.Table), http.StatusBadRequest)
			return
		}

		// Route delete operations before the upsert path.
		if req.Operation == "delete" {
			if req.RecordID == nil {
				writeError(w, "record_id required for delete operation", http.StatusBadRequest)
				return
			}
			var queueID int64
			if len(req.Rows) > 0 {
				if raw, ok2 := req.Rows[0]["_queue_id"]; ok2 {
					if coerced := coerceValue(raw); coerced != nil {
						if id, ok3 := coerced.(int64); ok3 {
							queueID = id
						}
					}
				}
			}
			if err := deleteRecord(r.Context(), pool, req.Table, *req.RecordID, queueID); err != nil {
				writeJSON(w, batchResp{Failed: 1, Error: err.Error()}, http.StatusInternalServerError)
				return
			}
			writeJSON(w, batchResp{Upserted: 1}, http.StatusOK)
			return
		}

		if len(req.Rows) == 0 {
			writeJSON(w, batchResp{}, http.StatusOK)
			return
		}
		if len(req.Rows) > 100 {
			writeError(w, "batch too large (max 100 rows)", http.StatusBadRequest)
			return
		}

		// Use client-provided on_conflict if it's in the allowlist value
		if req.OnConflict != "" && isValidConflictCol(req.Table, req.OnConflict) {
			conflictCol = req.OnConflict
		}

		upserted, failed, err := upsertRows(r.Context(), pool, req.Table, conflictCol, req.Rows)
		if err != nil {
			writeJSON(w, batchResp{Upserted: upserted, Failed: failed, Error: err.Error()},
				http.StatusInternalServerError)
			return
		}
		writeJSON(w, batchResp{Upserted: upserted, Failed: failed}, http.StatusOK)
	}
}

// upsertRows performs individual upserts for each row.
// Processes rows one at a time so partial failures are reported accurately.
// No batch-level transaction — a failed row does not roll back earlier successes.
// This matches the existing drain_sync_queue behavior.
func upsertRows(
	ctx context.Context,
	pool *pgxpool.Pool,
	table, conflictCol string,
	rows []map[string]interface{},
) (upserted, failed int, firstErr error) {
	for _, row := range rows {
		if err := upsertRow(ctx, pool, table, conflictCol, row); err != nil {
			failed++
			if firstErr == nil {
				firstErr = err
			}
		} else {
			upserted++
		}
	}
	return
}

// upsertRow builds an idempotent INSERT ... ON CONFLICT DO UPDATE using
// parameterized values. Column names come from the row map keys — they are
// validated against the allowlist table but not individual column names.
// Unknown columns result in a PostgreSQL error (safe — no injection possible
// because the table name itself is allowlisted).
func upsertRow(ctx context.Context, pool *pgxpool.Pool, table, conflictCol string, row map[string]interface{}) error {
	if len(row) == 0 {
		return nil
	}

	// AP-04: Extract _queue_id before the column loop so it is never treated as a
	// business column. When present, it drives the stale-event guard:
	//   DO UPDATE SET ... WHERE EXCLUDED.last_queue_id >= "<table>".last_queue_id
	// Full Sync rows omit _queue_id; they upsert unconditionally (SQLite is authoritative).
	// Single-device constraint: _queue_id is a SQLite autoincrement local to one device.
	var queueID int64
	hasQueueID := false
	if raw, ok := row["_queue_id"]; ok {
		if coerced := coerceValue(raw); coerced != nil {
			if id, ok2 := coerced.(int64); ok2 {
				queueID = id
				hasQueueID = true
			}
		}
		delete(row, "_queue_id")
	}

	// Resurrection guard: if a tombstone exists for this record with a queue_id
	// >= the incoming upsert's queue_id, the row was deleted more recently — skip.
	if hasQueueID {
		var rowID int64
		if raw, ok := row["id"]; ok {
			if v := coerceValue(raw); v != nil {
				if id, ok2 := v.(int64); ok2 {
					rowID = id
				}
			}
		}
		if rowID > 0 {
			var tombstoneQID int64
			qErr := pool.QueryRow(ctx,
				`SELECT queue_id FROM sync_tombstones WHERE table_name = $1 AND record_id = $2`,
				table, rowID,
			).Scan(&tombstoneQID)
			if qErr == nil && tombstoneQID >= queueID {
				// Row was deleted with a newer or equal queue_id — skip this upsert.
				return nil
			}
		}
	}

	cols := make([]string, 0, len(row)+1)
	vals := make([]interface{}, 0, len(row)+1)
	placeholders := make([]string, 0, len(row)+1)
	updates := make([]string, 0, len(row)+1)
	i := 1

	for col, val := range row {
		// Reject column names with special characters (belt-and-suspenders)
		if !isSafeIdentifier(col) {
			return fmt.Errorf("unsafe column name: %s", col)
		}
		cols = append(cols, `"`+col+`"`)
		vals = append(vals, coerceValue(val))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		updates = append(updates, fmt.Sprintf(`"%s" = EXCLUDED."%s"`, col, col))
		i++
	}

	if hasQueueID {
		cols = append(cols, `"last_queue_id"`)
		vals = append(vals, queueID)
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		updates = append(updates, `"last_queue_id" = EXCLUDED."last_queue_id"`)
	}

	// Build conflict target — supports composite keys like "game_slug,draw_date"
	conflictTarget := buildConflictTarget(conflictCol)

	var sqlStr string
	if hasQueueID {
		// Stale-event guard: skip the DO UPDATE when the incoming event is older than
		// what PostgreSQL already has. INSERT (no conflict) is always unconditional.
		sqlStr = fmt.Sprintf(
			`INSERT INTO "%s" (%s) VALUES (%s)
			 ON CONFLICT %s DO UPDATE SET %s, synced_at = NOW()
			 WHERE EXCLUDED."last_queue_id" >= "%s"."last_queue_id"`,
			table,
			strings.Join(cols, ", "),
			strings.Join(placeholders, ", "),
			conflictTarget,
			strings.Join(updates, ", "),
			table,
		)
	} else {
		sqlStr = fmt.Sprintf(
			`INSERT INTO "%s" (%s) VALUES (%s)
			 ON CONFLICT %s DO UPDATE SET %s, synced_at = NOW()`,
			table,
			strings.Join(cols, ", "),
			strings.Join(placeholders, ", "),
			conflictTarget,
			strings.Join(updates, ", "),
		)
	}

	_, err := pool.Exec(ctx, sqlStr, vals...)
	return err
}

// ── Sync reliability notes ────────────────────────────────────────────────────
// The Rust sync drain increments retry_count on each failure and skips events
// with retry_count >= 3 (or the configured limit). Events that exceed the retry
// limit are NOT deleted — they remain in sync_queue as "stranded" events.
//
// Recovery mechanism: The desktop app's Settings screen exposes a "Reset Sync Queue"
// action (reset_sync_queue Tauri command) that sets retry_count = 0 for all stranded
// events, allowing them to be retried. This prevents permanent data loss from
// transient network or server failures.
//
// Invoice deletions specifically: if a delete event strands, the record remains in
// the cloud replica until manually recovered (Settings → Reset Sync Queue → retry).
// The tombstone written on a successful delete prevents resurrection. A stranded
// delete does NOT write a tombstone — so if the delete never reaches the server,
// the cloud replica retains the invoice row until the event is recovered and retried.

// deleteRecord records a tombstone and hard-deletes a row from a business table
// inside a single PostgreSQL transaction.
// Only tables in deletableTableAllowlist may be deleted via this path.
// The tombstone prevents stale upsert retries (with an older queue_id) from
// resurrecting the deleted row.
//
// Stale delete guard: if the row exists with a last_queue_id strictly newer than
// queueID, the delete is stale — the row was updated after this delete was queued.
// In that case neither the delete nor the tombstone is written, so the newer row
// is preserved and future upserts are unblocked.
//
// Cascade scope: invoice deletion removes invoice_items, payments, and ticket_returns
// from PostgreSQL. These tables have no ON DELETE CASCADE in the PostgreSQL schema
// (per DEFERRED_RISKS.md AP-03), so the Go handler performs explicit deletes.
// If the Go API is unreachable when the delete is draining, ALL deletes (invoice +
// children) will retry as a unit on the next drain cycle (they are in separate
// sync_queue entries but the invoice delete is the only one synced — child deletions
// happen implicitly here).
func deleteRecord(ctx context.Context, pool *pgxpool.Pool, table string, recordID, queueID int64) error {
	if !deletableTableAllowlist[table] {
		return fmt.Errorf("table not allowed for delete: %s", table)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Lock the target row (if it exists) to serialize concurrent upserts.
	// This prevents a race where a concurrent upsert with a newer queue_id
	// succeeds between the stale-check and the DELETE.
	// COALESCE converts NULL last_queue_id to 0 so we can scan into int64 directly.
	var existingQueueID int64
	scanErr := tx.QueryRow(ctx,
		fmt.Sprintf(`SELECT COALESCE(last_queue_id, 0) FROM "%s" WHERE id = $1 FOR UPDATE`, table),
		recordID,
	).Scan(&existingQueueID)
	// scanErr != nil (pgx.ErrNoRows) means the row doesn't exist — that's fine;
	// we still need to write the tombstone to prevent stale upsert resurrection.

	// Stale check: if the row exists with a newer last_queue_id, skip the delete.
	if scanErr == nil && existingQueueID > queueID {
		// The row was updated more recently than this delete was queued.
		// Do NOT delete it, do NOT write a tombstone (tombstone would block future upserts).
		return tx.Commit(ctx) // commit empty transaction — no-op
	}

	// Cascade deletes for tables with known child relationships.
	if table == "invoices" {
		childTables := []string{"invoice_items", "payments", "ticket_returns"}
		for _, child := range childTables {
			_, err := tx.Exec(ctx,
				fmt.Sprintf(`DELETE FROM "%s" WHERE invoice_id = $1`, child),
				recordID,
			)
			if err != nil {
				return fmt.Errorf("cascade delete %s: %w", child, err)
			}
		}
	}

	// Hard delete the row.
	tag, err := tx.Exec(ctx,
		fmt.Sprintf(`DELETE FROM "%s" WHERE id = $1`, table),
		recordID,
	)
	if err != nil {
		return fmt.Errorf("delete row: %w", err)
	}
	// tag.RowsAffected() == 0 means the row didn't exist — we still write the
	// tombstone to guard against resurrection from in-flight upsert retries.
	_ = tag.RowsAffected()

	// Record the tombstone so subsequent upserts can detect resurrection.
	// ON CONFLICT: keep the highest queue_id we have seen.
	_, err = tx.Exec(ctx, `
		INSERT INTO sync_tombstones (table_name, record_id, queue_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (table_name, record_id)
		DO UPDATE SET queue_id   = GREATEST(sync_tombstones.queue_id, EXCLUDED.queue_id),
		              deleted_at = NOW()
		WHERE EXCLUDED.queue_id >= sync_tombstones.queue_id
	`, table, recordID, queueID)
	if err != nil {
		return fmt.Errorf("record tombstone: %w", err)
	}

	return tx.Commit(ctx)
}

func buildConflictTarget(conflictCol string) string {
	parts := strings.Split(conflictCol, ",")
	quoted := make([]string, len(parts))
	for i, p := range parts {
		quoted[i] = `"` + strings.TrimSpace(p) + `"`
	}
	return "(" + strings.Join(quoted, ", ") + ")"
}

func isSafeIdentifier(s string) bool {
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return len(s) > 0
}

func isValidConflictCol(table, col string) bool {
	allowed := tableAllowlist[table]
	return allowed == col || strings.Contains(allowed, col)
}

// coerceValue normalises JSON number types (float64) to int64 where appropriate.
func coerceValue(v interface{}) interface{} {
	if f, ok := v.(float64); ok {
		if f == float64(int64(f)) {
			return int64(f)
		}
	}
	return v
}

// ── Full sync ─────────────────────────────────────────────────────────────────

type fullSyncReq struct {
	Table string                   `json:"table"`
	Rows  []map[string]interface{} `json:"rows"`
}

type fullSyncTableResult struct {
	Table    string `json:"table"`
	Upserted int    `json:"upserted"`
	Failed   int    `json:"failed"`
	Error    string `json:"error,omitempty"`
}

type fullSyncResp struct {
	Results  []fullSyncTableResult `json:"results"`
	Total    int                   `json:"total"`
	Upserted int                   `json:"upserted"`
	Failed   int                   `json:"failed"`
}

func FullSync(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req fullSyncReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			if strings.Contains(err.Error(), "request body too large") {
				writeError(w, "request body too large", http.StatusRequestEntityTooLarge)
				return
			}
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		conflictCol, ok := tableAllowlist[req.Table]
		if !ok {
			writeError(w, fmt.Sprintf("table not allowed: %s", req.Table), http.StatusBadRequest)
			return
		}
		if len(req.Rows) == 0 {
			// Empty table — do not delete cloud records (idempotent no-op)
			result := fullSyncTableResult{Table: req.Table, Upserted: 0, Failed: 0}
			writeJSON(w, fullSyncResp{
				Results:  []fullSyncTableResult{result},
				Total:    0,
				Upserted: 0,
				Failed:   0,
			}, http.StatusOK)
			return
		}

		upserted, failed, err := 0, 0, error(nil)
		// Process in chunks of 50
		for start := 0; start < len(req.Rows); start += 50 {
			end := start + 50
			if end > len(req.Rows) {
				end = len(req.Rows)
			}
			u, f, e := upsertRows(r.Context(), pool, req.Table, conflictCol, req.Rows[start:end])
			upserted += u
			failed += f
			if e != nil && err == nil {
				err = e
			}
		}

		// Update sync_log
		pool.Exec(r.Context(), //nolint:errcheck
			`INSERT INTO sync_log (table_name, last_full_sync, row_count)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (table_name) DO UPDATE SET
			   last_full_sync = $2, row_count = $3`,
			req.Table, time.Now(), upserted,
		)

		errStr := ""
		if err != nil {
			errStr = err.Error()
		}
		result := fullSyncTableResult{
			Table:    req.Table,
			Upserted: upserted,
			Failed:   failed,
			Error:    errStr,
		}
		statusCode := http.StatusOK
		if failed > 0 {
			statusCode = http.StatusMultiStatus
		}
		writeJSON(w, fullSyncResp{
			Results:  []fullSyncTableResult{result},
			Total:    len(req.Rows),
			Upserted: upserted,
			Failed:   failed,
		}, statusCode)
	}
}

// ── Sync status ────────────────────────────────────────────────────────────────

func SyncStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(),
			`SELECT table_name, last_full_sync, row_count FROM sync_log ORDER BY table_name`)
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type status struct {
			Table        string    `json:"table"`
			LastFullSync time.Time `json:"last_full_sync"`
			RowCount     int64     `json:"row_count"`
		}
		var results []status
		for rows.Next() {
			var s status
			if err := rows.Scan(&s.Table, &s.LastFullSync, &s.RowCount); err == nil {
				results = append(results, s)
			}
		}
		if results == nil {
			results = []status{}
		}
		writeJSON(w, results, http.StatusOK)
	}
}
