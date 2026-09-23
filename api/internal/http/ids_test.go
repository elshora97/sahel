package http

import (
	"regexp"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func mustNumeric(t *testing.T, s string) pgtype.Numeric {
	t.Helper()
	var n pgtype.Numeric
	if err := n.Scan(s); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestUUIDRoundTrip(t *testing.T) {
	const in = "0b7c8a2e-5d1f-4c3a-9e6b-1f2a3b4c5d6e"
	var u pgtype.UUID
	if err := u.Scan(in); err != nil {
		t.Fatal(err)
	}
	if got := uuidString(u); got != in {
		t.Fatalf("uuidString = %q", got)
	}
}

func TestNewUUIDIsV4(t *testing.T) {
	v4 := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	a, b := uuidString(newUUID()), uuidString(newUUID())
	if !v4.MatchString(a) || a == b {
		t.Fatalf("got %q and %q", a, b)
	}
}
