// Package auth handles device registration, PIN verification, and JWT issuance.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/argon2"
)

// jwtClaims is a minimal JWT payload — we use a hand-rolled HS256 JWT to avoid
// adding jwt library dependencies.  The token is: base64(header).base64(claims).sig
// Verification is in middleware/admin_auth.go.

const (
	argon2Time    = 3
	argon2Memory  = 64 * 1024 // 64 MB
	argon2Threads = 4
	argon2KeyLen  = 32
	saltLen       = 16
)

// Service provides auth operations.
type Service struct {
	pool      *pgxpool.Pool
	jwtSecret []byte
}

func NewService(pool *pgxpool.Pool, jwtSecret []byte) *Service {
	return &Service{pool: pool, jwtSecret: jwtSecret}
}

// ── PIN ────────────────────────────────────────────────────────────────────────

// HashPIN produces an argon2id hash suitable for storage.
func HashPIN(pin string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}
	hash := argon2.IDKey([]byte(pin), salt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argon2Memory, argon2Time, argon2Threads,
		hex.EncodeToString(salt),
		hex.EncodeToString(hash),
	), nil
}

// VerifyPIN checks a plain PIN against the stored argon2id hash.
// Format: $argon2id$v=19$m=65536,t=3,p=4$<saltHex>$<hashHex>
// We split by '$' rather than using fmt.Sscanf because %s stops at whitespace,
// not at '$', causing saltHex to consume the rest of the string including hashHex.
func VerifyPIN(pin, stored string) bool {
	// Parts after splitting "$argon2id$v=19$m=...,t=...,p=...$SALT$HASH" by "$":
	// [0]=""  [1]="argon2id"  [2]="v=19"  [3]="m=...,t=...,p=..."  [4]=saltHex  [5]=hashHex
	parts := strings.SplitN(stored, "$", 6)
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	salt, err := hex.DecodeString(parts[4])
	if err != nil {
		return false
	}
	expectedHash, err := hex.DecodeString(parts[5])
	if err != nil {
		return false
	}
	computed := argon2.IDKey([]byte(pin), salt, t, m, p, uint32(len(expectedHash)))
	return hex.EncodeToString(computed) == hex.EncodeToString(expectedHash)
}

// ── Device keys ───────────────────────────────────────────────────────────────

// GenerateDeviceKey returns a 32-byte random hex key and its sha256 hash.
func GenerateDeviceKey() (rawKey, keyHash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate device key: %w", err)
	}
	rawKey = hex.EncodeToString(b)
	h := sha256.Sum256(b)
	keyHash = hex.EncodeToString(h[:])
	return rawKey, keyHash, nil
}

// DeviceKeyHash returns sha256(hex-decoded key) as a hex string.
func DeviceKeyHash(rawKey string) (string, error) {
	b, err := hex.DecodeString(rawKey)
	if err != nil {
		return "", fmt.Errorf("invalid device key format: %w", err)
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}

// RegisterDevice inserts a new device into the devices table.
func (s *Service) RegisterDevice(ctx context.Context, name, keyHash string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO devices (name, key_hash) VALUES ($1, $2)`,
		name, keyHash,
	)
	return err
}

// ValidateDeviceKey checks the key hash against the devices table.
// Returns the device ID on success.
func (s *Service) ValidateDeviceKey(ctx context.Context, rawKey string) (int64, error) {
	hash, err := DeviceKeyHash(rawKey)
	if err != nil {
		return 0, errors.New("invalid device key")
	}
	var id int64
	var revoked bool
	err = s.pool.QueryRow(ctx,
		`SELECT id, is_revoked FROM devices WHERE key_hash = $1`,
		hash,
	).Scan(&id, &revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errors.New("device not found")
	}
	if err != nil {
		return 0, fmt.Errorf("device lookup: %w", err)
	}
	if revoked {
		return 0, errors.New("device revoked")
	}
	return id, nil
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

// IsBootstrapped returns true if a device has already been registered.
func (s *Service) IsBootstrapped(ctx context.Context) (bool, error) {
	var used string
	err := s.pool.QueryRow(ctx,
		`SELECT value FROM app_config WHERE key = 'bootstrap_used'`,
	).Scan(&used)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return used == "true", nil
}

// SetBootstrapped marks bootstrap as complete and sets the admin PIN hash.
func (s *Service) SetBootstrapped(ctx context.Context, pinHash string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	_, err = tx.Exec(ctx,
		`INSERT INTO app_config (key, value) VALUES ('bootstrap_used', 'true')
         ON CONFLICT (key) DO UPDATE SET value = 'true'`)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO app_config (key, value) VALUES ('admin_pin_argon2', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`, pinHash)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ── Admin PIN check ────────────────────────────────────────────────────────────

func (s *Service) VerifyAdminPIN(ctx context.Context, pin string) (bool, error) {
	var stored string
	err := s.pool.QueryRow(ctx,
		`SELECT value FROM app_config WHERE key = 'admin_pin_argon2'`,
	).Scan(&stored)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return VerifyPIN(pin, stored), nil
}

// ── JWT ────────────────────────────────────────────────────────────────────────

// IssueAdminToken returns a signed HS256 JWT valid for 1 hour.
// Payload: { "sub": "admin", "exp": unix, "jti": hex }
func (s *Service) IssueAdminToken(ctx context.Context) (string, error) {
	jtiBytes := make([]byte, 16)
	if _, err := rand.Read(jtiBytes); err != nil {
		return "", err
	}
	jti := hex.EncodeToString(jtiBytes)
	exp := time.Now().Add(time.Hour).Unix()
	return buildJWT(s.jwtSecret, jti, exp)
}

// ValidateAdminToken verifies the JWT signature, expiry, and revocation.
func (s *Service) ValidateAdminToken(ctx context.Context, token string) error {
	jti, exp, err := parseJWT(s.jwtSecret, token)
	if err != nil {
		return err
	}
	if time.Now().Unix() > exp {
		return errors.New("token expired")
	}
	var exists bool
	err = s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)`,
		jti,
	).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return errors.New("token revoked")
	}
	return nil
}

// RevokeToken adds the JTI to the revoked_tokens table.
func (s *Service) RevokeToken(ctx context.Context, token string) error {
	jti, _, err := parseJWT(s.jwtSecret, token)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO revoked_tokens (jti) VALUES ($1) ON CONFLICT DO NOTHING`,
		jti,
	)
	return err
}
