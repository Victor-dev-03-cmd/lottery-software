package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// GetResults returns the latest lottery results from PostgreSQL.
func GetResults(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := r.URL.Query().Get("game_slug")
		limit := 300

		var (
			rows interface{}
			err  error
		)
		if slug != "" {
			rows, err = queryResults(r.Context(), pool,
				`SELECT id, game_slug, game_name, board, draw_number, draw_date,
				        winning_letter, winning_numbers::text, super_number, prizes::text, source, saved_at
				 FROM lottery_results WHERE game_slug = $1
				 ORDER BY draw_date DESC LIMIT $2`,
				slug, limit)
		} else {
			rows, err = queryResults(r.Context(), pool,
				`SELECT id, game_slug, game_name, board, draw_number, draw_date,
				        winning_letter, winning_numbers::text, super_number, prizes::text, source, saved_at
				 FROM lottery_results
				 ORDER BY saved_at DESC LIMIT $1`,
				limit)
		}
		if err != nil {
			writeError(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, rows, http.StatusOK)
	}
}

func queryResults(ctx interface{ Value(any) any }, pool *pgxpool.Pool, sql string, args ...interface{}) ([]map[string]interface{}, error) {
	// This wrapper is needed because r.Context() is used inside the handler.
	// We pass the pool and use r.Context() directly.
	return nil, nil // placeholder — see below
}

// UpsertResult stores a single lottery result, used by the desktop live-results push.
func UpsertResult(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var row map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&row); err != nil {
			writeError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if err := upsertRow(r.Context(), pool, "lottery_results", "game_slug,draw_date", row); err != nil {
			writeError(w, "upsert failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "synced_at": time.Now()}, http.StatusOK)
	}
}
