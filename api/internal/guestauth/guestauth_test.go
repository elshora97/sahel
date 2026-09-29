package guestauth

import (
	"strings"
	"testing"
	"time"
)

var t0 = time.Date(2027, 5, 1, 10, 0, 0, 0, time.UTC)

func TestTokenRoundTripAndExpiry(t *testing.T) {
	tok := SignToken("secret", "7f7c7590-bdf7-4e9d-a0bd-d182a0037680", t0, time.Hour)
	id, ok := VerifyToken("secret", tok, t0.Add(59*time.Minute))
	if !ok || id != "7f7c7590-bdf7-4e9d-a0bd-d182a0037680" {
		t.Fatalf("verify = %q %v", id, ok)
	}
	if _, ok := VerifyToken("secret", tok, t0.Add(61*time.Minute)); ok {
		t.Fatal("expired token accepted")
	}
	if _, ok := VerifyToken("other", tok, t0); ok {
		t.Fatal("token accepted under another secret")
	}
	parts := strings.Split(tok, ".")
	forged := "00000000-0000-0000-0000-000000000000." + parts[1] + "." + parts[2]
	if _, ok := VerifyToken("secret", forged, t0); ok {
		t.Fatal("token accepted for another customer")
	}
	for _, bad := range []string{"", "a.b", "a.b.c.d", "x.123.sig"} {
		if _, ok := VerifyToken("secret", bad, t0); ok {
			t.Fatalf("accepted %q", bad)
		}
	}
	if _, ok := VerifyToken("", tok, t0); ok {
		t.Fatal("empty secret must reject everything")
	}
}

func TestPasswords(t *testing.T) {
	h, err := HashPassword("sea-breeze-2027")
	if err != nil || h == "sea-breeze-2027" {
		t.Fatalf("hash %q %v", h, err)
	}
	if !CheckPassword(h, "sea-breeze-2027") || CheckPassword(h, "sea-breeze-2028") || CheckPassword("", "anything") {
		t.Fatal("CheckPassword is wrong")
	}
}
