package guestauth

import (
	"regexp"
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

func TestCodes(t *testing.T) {
	code, err := NewCode()
	if err != nil || !regexp.MustCompile(`^\d{6}$`).MatchString(code) {
		t.Fatalf("code %q %v", code, err)
	}
	h := HashCode("secret", "+201012345678", "123456")
	if h == HashCode("secret", "+201012345679", "123456") || h == HashCode("secret", "+201012345678", "123457") {
		t.Fatal("hash must bind phone and code")
	}
	if !CodeMatches("secret", "+201012345678", "123456", h) || CodeMatches("secret", "+201012345678", "654321", h) {
		t.Fatal("CodeMatches is wrong")
	}
}
