package customer

import "testing"

func TestNormalizePhone(t *testing.T) {
	ok := map[string]string{
		"01012345678":          "+201012345678",
		"0101 234 5678":        "+201012345678",
		"010-1234-5678":        "+201012345678",
		"+201112345678":        "+201112345678",
		"00201212345678":       "+201212345678",
		"201512345678":         "+201512345678",
		"٠١٠١٢٣٤٥٦٧٨":          "+201012345678",
		" (+20) 10 1234 5678 ": "+201012345678",
	}
	for in, want := range ok {
		got, err := NormalizePhone(in)
		if err != nil || got != want {
			t.Errorf("%q: got %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "0131234567", "01312345678", "0101234567", "010123456789", "+441012345678", "0223456789", "abc"} {
		if got, err := NormalizePhone(bad); err == nil {
			t.Errorf("%q: want an error, got %q", bad, got)
		}
	}
}
