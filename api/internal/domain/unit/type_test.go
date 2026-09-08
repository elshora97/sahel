package unit

import "testing"

func TestParseTypeAcceptsCanonicalValues(t *testing.T) {
	for _, tt := range AllTypes {
		got, err := ParseType(string(tt))
		if err != nil {
			t.Fatalf("ParseType(%q) failed: %v", tt, err)
		}
		if got != tt {
			t.Fatalf("ParseType(%q) = %q, want %q", tt, got, tt)
		}
	}
}

func TestParseTypeRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "CHALET", "cabin", "house"} {
		if _, err := ParseType(v); err == nil {
			t.Errorf("ParseType(%q) should have failed", v)
		}
	}
}

func TestTypeAllHasExactlySevenValues(t *testing.T) {
	if len(AllTypes) != 7 {
		t.Fatalf("expected 7 unit types per spec §2.4, got %d", len(AllTypes))
	}
}
