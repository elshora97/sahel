// Package money keeps every amount in the system as an integer number of
// piasters. Nothing here returns a float, and nothing here formats for
// display - formatting happens at the edge, in the web layer.
package money

import "fmt"

// Piasters is 1/100 of an Egyptian pound.
type Piasters int64

// FromPounds converts whole pounds to piasters.
func FromPounds(pounds int64) Piasters { return Piasters(pounds * 100) }

// Pounds returns the whole-pound part, truncating.
func (p Piasters) Pounds() int64 { return int64(p) / 100 }

// CeilPct returns pct percent of p, rounded up, in integer arithmetic.
// Rounding up means the guest is never asked for less than the policy says.
// Multiplication happens before division, so no precision is lost on the way.
func CeilPct(p Piasters, pct int) Piasters {
	if pct <= 0 {
		return 0
	}
	return Piasters((int64(p)*int64(pct) + 99) / 100)
}

// CeilToWholePound rounds up to the next whole pound. Used before the
// amount_suffix is added, so the requested amount is always >= the amount due.
func CeilToWholePound(p Piasters) Piasters {
	if r := int64(p) % 100; r != 0 {
		return p + Piasters(100-r)
	}
	return p
}

// WithSuffix returns the amount a guest is asked to transfer: the amount due
// rounded up to a whole pound, plus the booking's two-digit suffix as piasters.
// The distinctive ending is what makes a bank statement line match one booking.
func WithSuffix(due Piasters, suffix int) (Piasters, error) {
	if suffix < 0 || suffix > 99 {
		return 0, fmt.Errorf("amount suffix %d is outside 0-99", suffix)
	}
	return CeilToWholePound(due) + Piasters(suffix), nil
}
