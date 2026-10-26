package handlers

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, v any, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, msg string, status int) {
	writeJSON(w, map[string]string{"error": msg}, status)
}
