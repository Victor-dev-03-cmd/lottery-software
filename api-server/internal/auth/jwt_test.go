package auth

import (
	"testing"
	"time"
)

func TestJWTRoundTrip(t *testing.T) {
	secret := []byte("test-secret-32-bytes-xxxxxxxxxxx")
	jti := "test-jti-abc123"
	exp := time.Now().Add(time.Hour).Unix()

	token, err := buildJWT(secret, jti, exp)
	if err != nil {
		t.Fatalf("buildJWT failed: %v", err)
	}

	gotJTI, gotExp, err := parseJWT(secret, token)
	if err != nil {
		t.Fatalf("parseJWT failed: %v", err)
	}
	if gotJTI != jti {
		t.Errorf("JTI mismatch: got %q want %q", gotJTI, jti)
	}
	if gotExp != exp {
		t.Errorf("exp mismatch: got %d want %d", gotExp, exp)
	}
}

func TestJWTWrongSecret(t *testing.T) {
	secret1 := []byte("secret-one-xxxxxxxxxxxxxxxxxxxxxxxxx")
	secret2 := []byte("secret-two-xxxxxxxxxxxxxxxxxxxxxxxxx")
	token, _ := buildJWT(secret1, "jti", time.Now().Add(time.Hour).Unix())
	_, _, err := parseJWT(secret2, token)
	if err == nil {
		t.Fatal("expected signature error, got nil")
	}
}

func TestJWTMalformed(t *testing.T) {
	_, _, err := parseJWT([]byte("secret"), "not.a.valid.jwt.at.all.nope")
	if err == nil {
		t.Fatal("expected error for malformed token")
	}
}

func TestPINHash(t *testing.T) {
	pin := "1234"
	hash, err := HashPIN(pin)
	if err != nil {
		t.Fatalf("HashPIN failed: %v", err)
	}
	if !VerifyPIN(pin, hash) {
		t.Error("VerifyPIN returned false for correct PIN")
	}
	if VerifyPIN("0000", hash) {
		t.Error("VerifyPIN returned true for wrong PIN")
	}
}

func TestPINHashDifferentSalts(t *testing.T) {
	pin := "9876"
	hash1, _ := HashPIN(pin)
	hash2, _ := HashPIN(pin)
	// Two hashes of the same PIN must differ (different salts)
	if hash1 == hash2 {
		t.Error("expected different hashes from different salts")
	}
	// Both must verify correctly
	if !VerifyPIN(pin, hash1) || !VerifyPIN(pin, hash2) {
		t.Error("VerifyPIN failed for one of the two hashes")
	}
}
