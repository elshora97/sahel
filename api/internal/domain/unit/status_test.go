package unit

import "testing"

func TestParseStatusAcceptsCanonicalValues(t *testing.T) {
	for _, s := range AllStatuses {
		got, err := ParseStatus(string(s))
		if err != nil {
			t.Fatalf("ParseStatus(%q) failed: %v", s, err)
		}
		if got != s {
			t.Fatalf("ParseStatus(%q) = %q, want %q", s, got, s)
		}
	}
}

func TestParseStatusRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "DRAFT", "deleted"} {
		if _, err := ParseStatus(v); err == nil {
			t.Errorf("ParseStatus(%q) should have failed", v)
		}
	}
}

func TestStatusAllHasExactlyFourValues(t *testing.T) {
	if len(AllStatuses) != 4 {
		t.Fatalf("expected 4 unit statuses per spec §2.4, got %d", len(AllStatuses))
	}
}
