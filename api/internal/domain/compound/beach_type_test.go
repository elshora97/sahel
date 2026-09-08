package compound

import "testing"

func TestParseBeachTypeAcceptsCanonicalValues(t *testing.T) {
	for _, b := range AllBeachTypes {
		got, err := ParseBeachType(string(b))
		if err != nil {
			t.Fatalf("ParseBeachType(%q) failed: %v", b, err)
		}
		if got != b {
			t.Fatalf("ParseBeachType(%q) = %q, want %q", b, got, b)
		}
	}
}

func TestParseBeachTypeRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "SEA", "beach", "unknown"} {
		if _, err := ParseBeachType(v); err == nil {
			t.Errorf("ParseBeachType(%q) should have failed", v)
		}
	}
}

func TestBeachTypeAllHasExactlyFourValues(t *testing.T) {
	if len(AllBeachTypes) != 4 {
		t.Fatalf("expected 4 beach types per spec §2.2, got %d", len(AllBeachTypes))
	}
}
