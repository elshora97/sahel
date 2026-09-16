package unit

import "testing"

func TestParseViewAcceptsCanonicalValues(t *testing.T) {
	for _, v := range AllViews {
		got, err := ParseView(string(v))
		if err != nil {
			t.Fatalf("ParseView(%q) failed: %v", v, err)
		}
		if got != v {
			t.Fatalf("ParseView(%q) = %q, want %q", v, got, v)
		}
	}
}

func TestParseViewRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "SEA", "ocean"} {
		if _, err := ParseView(v); err == nil {
			t.Errorf("ParseView(%q) should have failed", v)
		}
	}
}

func TestViewAllHasExactlyFiveValues(t *testing.T) {
	if len(AllViews) != 5 {
		t.Fatalf("expected 5 views per spec §2.4, got %d", len(AllViews))
	}
}
