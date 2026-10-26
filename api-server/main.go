// Ajith Rohana Enterprise — Cloud Sync API Server
// Receives sync-queue drains from the desktop, stores them in PostgreSQL.
// PostgreSQL is a cloud replica only; SQLite remains the authoritative store.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Victor-dev-03-cmd/lottery-api/internal/auth"
	"github.com/Victor-dev-03-cmd/lottery-api/internal/db"
	"github.com/Victor-dev-03-cmd/lottery-api/internal/handlers"
	"github.com/Victor-dev-03-cmd/lottery-api/internal/middleware"
)

func main() {
	// ── Configuration from environment ────────────────────────────────────────
	port     := getEnv("PORT", "8090")
	dbURL    := mustEnv("DATABASE_URL")
	jwtSecret := mustEnv("JWT_SECRET")

	// ── Database connection pool ───────────────────────────────────────────────
	pool, err := db.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(context.Background(), pool); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}
	log.Println("Database migrations applied successfully")

	// ── Auth helpers ───────────────────────────────────────────────────────────
	authSvc := auth.NewService(pool, []byte(jwtSecret))

	// ── Route handlers ─────────────────────────────────────────────────────────
	mux := http.NewServeMux()

	// Public
	mux.HandleFunc("GET /api/v1/health", healthHandler)

	// Auth
	mux.HandleFunc("POST /api/v1/auth/bootstrap",    handlers.Bootstrap(authSvc))
	mux.HandleFunc("POST /api/v1/auth/admin-token",  handlers.AdminToken(authSvc))
	mux.HandleFunc("POST /api/v1/auth/register-device", handlers.RegisterDevice(authSvc))

	// Protected — device key required
	devMW := middleware.DeviceAuth(authSvc)
	mux.Handle("POST /api/v1/sync/batch",       devMW(handlers.SyncBatch(pool)))
	mux.Handle("POST /api/v1/sync/full",         devMW(handlers.FullSync(pool)))
	mux.Handle("GET  /api/v1/sync/status",       devMW(handlers.SyncStatus(pool)))
	mux.Handle("GET  /api/v1/results",           devMW(handlers.GetResults(pool)))
	mux.Handle("POST /api/v1/results",           devMW(handlers.UpsertResult(pool)))

	// Admin JWT required
	adminMW := middleware.AdminAuth(authSvc)
	mux.Handle("POST /api/v1/auth/rotate-key",   adminMW(handlers.RotateKey(authSvc)))

	// ── Server with graceful shutdown ──────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      middleware.RequestLogger(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("Lottery API server listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutdown signal received")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}
	log.Println("Server stopped")
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "lottery-api",
		"version": "1.0.0",
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return v
}
