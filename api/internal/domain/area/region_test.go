package area

import "testing"

func TestParseRegionAcceptsCanonicalValues(t *testing.T) {
	for _, r := range All {
		got, err := ParseRegion(string(r))
		if err != nil {
			t.Fatalf("ParseRegion(%q) failed: %v", r, err)
		}
		if got != r {
			t.Fatalf("ParseRegion(%q) = %q, want %q", r, got, r)
		}
	}
}

func TestParseRegionRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "NORTH_COAST", "cairo", "unknown"} {
		if _, err := ParseRegion(v); err == nil {
			t.Errorf("ParseRegion(%q) should have failed", v)
		}
	}
}

func TestAllCoversEveryConstant(t *testing.T) {
	seen := map[Region]bool{}
	for _, r := range All {
		if seen[r] {
			t.Fatalf("duplicate region in All: %q", r)
		}
		seen[r] = true
	}
	if len(All) != 5 {
		t.Fatalf("expected 5 regions per spec, got %d", len(All))
	}
}
