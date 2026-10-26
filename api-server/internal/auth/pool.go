package auth

import "github.com/jackc/pgx/v5/pgxpool"

// Pool exposes the underlying pgxpool for handlers that need direct DB access.
func (s *Service) Pool() *pgxpool.Pool { return s.pool }
