package middleware

import (
	"net/http"
)

// BodyLimit wraps r.Body with http.MaxBytesReader so that request bodies
// larger than maxBytes are rejected before the handler reads them.
// The handler sees an error from json.Decode when the limit is hit;
// callers should check for "http: request body too large" and return 413.
func BodyLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}
