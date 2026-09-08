package booking

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestOccupiesMatchesTheEnum(t *testing.T) {
	cases := []struct {
		status Status
		want   bool
	}{
		{StatusDraft, false},
		{StatusPendingPayment, true},
		{StatusAwaitingVerification, true},
		{StatusConfirmed, true},
		{StatusCheckedIn, true},
		{StatusCompleted, true},
		{StatusExpired, false},
		{StatusCancelled, false},
		{StatusRefundPending, false},
		{StatusRefunded, false},
	}
	if len(cases) != len(All) {
		t.Fatalf("the enum has %d statuses but this table covers %d - add the new one here", len(All), len(cases))
	}
	for _, c := range cases {
		if got := c.status.Occupies(); got != c.want {
			t.Errorf("%s.Occupies() = %v, want %v", c.status, got, c.want)
		}
	}
}

func TestParseStatusRejectsRetiredNames(t *testing.T) {
	for _, v := range []string{"hold", "rejected", "", "PENDING_PAYMENT"} {
		if _, err := ParseStatus(v); err == nil {
			t.Errorf("ParseStatus(%q) should have failed", v)
		}
	}
	for _, s := range All {
		if _, err := ParseStatus(string(s)); err != nil {
			t.Errorf("ParseStatus(%q) failed: %v", s, err)
		}
	}
}

// TestMigrationPredicateMatchesDomain is the guard rail for D-001. If someone
// widens Occupying without touching the migration, or edits the migration
// predicate by hand, this fails. It skips until the bookings migration exists
// in phase 4.
func TestMigrationPredicateMatchesDomain(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "infra", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skipf("no migrations directory at %s", dir)
	}

	predicate := regexp.MustCompile(`(?is)CONSTRAINT\s+bookings_no_overlap.*?WHERE\s*\((.*?)\)\s*;`)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		m := predicate.FindSubmatch(body)
		if m == nil {
			continue
		}

		found := regexp.MustCompile(`'([a-z_]+)'`).FindAllStringSubmatch(string(m[1]), -1)
		got := make([]string, 0, len(found))
		for _, f := range found {
			got = append(got, "'"+f[1]+"'")
		}
		sort.Strings(got)

		if strings.Join(got, ",") != OccupyingSQLList() {
			t.Fatalf("%s predicate is out of sync with booking.Occupying\n  migration: %s\n  domain:    %s",
				e.Name(), strings.Join(got, ","), OccupyingSQLList())
		}
		return
	}
	t.Skip("no bookings_no_overlap constraint yet - lands in phase 4")
}
