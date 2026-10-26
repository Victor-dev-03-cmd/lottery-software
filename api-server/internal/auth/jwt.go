package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func buildJWT(secret []byte, jti string, exp int64) (string, error) {
	header := base64url(mustJSON(map[string]string{"alg": "HS256", "typ": "JWT"}))
	payload := base64url(mustJSON(map[string]any{
		"sub": "admin",
		"exp": exp,
		"jti": jti,
	}))
	msg := header + "." + payload
	sig := base64url(sign(secret, []byte(msg)))
	return msg + "." + sig, nil
}

func parseJWT(secret []byte, token string) (jti string, exp int64, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", 0, errors.New("malformed token")
	}
	msg := parts[0] + "." + parts[1]
	expectedSig := base64url(sign(secret, []byte(msg)))
	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return "", 0, errors.New("invalid signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", 0, fmt.Errorf("decode payload: %w", err)
	}
	var claims struct {
		JTI string  `json:"jti"`
		Exp float64 `json:"exp"`
	}
	if err := json.Unmarshal(raw, &claims); err != nil {
		return "", 0, fmt.Errorf("parse claims: %w", err)
	}
	return claims.JTI, int64(claims.Exp), nil
}

func sign(secret, msg []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write(msg)
	return mac.Sum(nil)
}

func base64url(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
