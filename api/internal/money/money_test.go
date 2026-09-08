package money

import "testing"

func TestCeilPct(t *testing.T) {
	cases := []struct {
		name   string
		amount Piasters
		pct    int
		want   Piasters
	}{
		{"exact division", 100000, 30, 30000},
		{"rounds up, never down", 100001, 30, 30001},
		{"one piaster short of a round result", 3333, 30, 1000},
		{"zero percent", 100000, 0, 0},
		{"negative percent is zero", 100000, -5, 0},
		{"full amount", 4350092, 100, 4350092},
		{"peak villa, 30 percent deposit", 3500000, 30, 1050000},
	}
	for _, c := range cases {
		if got := CeilPct(c.amount, c.pct); got != c.want {
			t.Errorf("%s: CeilPct(%d, %d) = %d, want %d", c.name, c.amount, c.pct, got, c.want)
		}
	}
}

func TestWithSuffix(t *testing.T) {
	cases := []struct {
		name   string
		due    Piasters
		suffix int
		want   Piasters
	}{
		{"already whole pounds", 4350000, 92, 4350092},
		{"rounds up to the next pound first", 4350001, 92, 4350192},
		{"suffix zero still lands on a whole pound", 4350000, 0, 4350000},
		{"suffix 99", 4350000, 99, 4350099},
	}
	for _, c := range cases {
		got, err := WithSuffix(c.due, c.suffix)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", c.name, err)
		}
		if got != c.want {
			t.Errorf("%s: WithSuffix(%d, %d) = %d, want %d", c.name, c.due, c.suffix, got, c.want)
		}
		if got < c.due {
			t.Errorf("%s: asked the guest for less than is due (%d < %d)", c.name, got, c.due)
		}
	}

	for _, bad := range []int{-1, 100, 1000} {
		if _, err := WithSuffix(4350000, bad); err == nil {
			t.Errorf("WithSuffix with suffix %d should have failed", bad)
		}
	}
}
