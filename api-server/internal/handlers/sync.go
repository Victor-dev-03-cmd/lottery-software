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

// ── Batch upsert (sync queue drain) ───────────────────────────────────────────

type batchReq struct {
	Table      string                   `json:"table"`
	Rows       []map[string]interface{} `json:"rows"`
	OnConflict string                   `json:"on_conflict"`
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
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}

		conflictCol, ok := tableAllowlist[req.Table]
		if !ok {
			writeError(w, fmt.Sprintf("table not allowed: %s", req.Table), http.StatusBadRequest)
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
