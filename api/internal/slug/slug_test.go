package slug

import "testing"

func TestMake(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Marassi", "marassi"},
		{"Hacienda Bay", "hacienda-bay"},
		{"Sidi Abdel Rahman", "sidi-abdel-rahman"},
		{"  spaces  around  ", "spaces-around"},
		{"UPPERCASE Villa", "uppercase-villa"},
		{"underscores_and-dashes", "underscores-and-dashes"},
		{"multi---dashes", "multi-dashes"},
		{"unit #4 (beach)", "unit-4-beach"},
		{"villa @ 12", "villa-12"},
		{"", ""},
		{"---", ""},
		{"café", "cafe"},
		{"naïve", "naive"},
	}
	for _, c := range cases {
		if got := Make(c.in); got != c.want {
			t.Errorf("Make(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestMakeWithSuffix(t *testing.T) {
	if got := MakeWithSuffix("Marassi", 0); got != "marassi" {
		t.Errorf("MakeWithSuffix(%q, 0) = %q, want %q", "Marassi", got, "marassi")
	}
	if got := MakeWithSuffix("Marassi", 2); got != "marassi-2" {
		t.Errorf("MakeWithSuffix(%q, 2) = %q, want %q", "Marassi", got, "marassi-2")
	}
	if got := MakeWithSuffix("Marassi", 10); got != "marassi-10" {
		t.Errorf("MakeWithSuffix(%q, 10) = %q, want %q", "Marassi", got, "marassi-10")
	}
}
