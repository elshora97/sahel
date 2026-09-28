package pricing

import (
	"errors"
	"testing"
	"time"

	"github.com/sahel/api/internal/money"
)

var testUnit = Unit{
	BaseGuests: 4, MaxGuests: 6,
	CleaningFee: money.FromPounds(500), SecurityDeposit: money.FromPounds(2000),
	ExtraGuestFee: money.FromPounds(100), DepositPct: 30,
	AdvanceNoticeHours: 24, MaxAdvanceDays: 365,
}

// Off season to 2027-06-30 (2 nights min), peak from 2027-07-01 (3 nights, 2000/night).
var testDays = Generate([]Season{
	season("off", "2027-06-01", "2027-06-30", 1000, func(s *Season) { s.MinNights = 2 }),
	season("peak", "2027-07-01", "2027-07-31", 2000, func(s *Season) { s.MinNights = 3; s.CheckinDays = []int{0, 4, 5} }),
}, d("2027-06-01"), d("2027-07-31"))

var now = time.Date(2027, 5, 1, 10, 0, 0, 0, Cairo)

func code(err error) string {
	var re *RuleError
	if errors.As(err, &re) {
		return re.Code
	}
	return ""
}

func TestQuoteRulesInOrder(t *testing.T) {
	blocked := append([]Day(nil), testDays...)
	for i := range blocked {
		if blocked[i].Date.Equal(d("2027-06-11")) {
			blocked[i].Available = false
		}
	}
	cases := []struct {
		name    string
		days    []Day
		in, out string
		guests  int
		now     time.Time
		want    string
	}{
		{"checkout before checkin", testDays, "2027-06-10", "2027-06-10", 2, now, "invalid_range"},
		{"too many guests", testDays, "2027-06-10", "2027-06-12", 7, now, "invalid_range"},
		{"blocked night", blocked, "2027-06-10", "2027-06-12", 2, now, "unavailable"},
		{"uncovered night", testDays, "2027-05-30", "2027-06-02", 2, now, "unavailable"},
		{"below season minimum", testDays, "2027-06-10", "2027-06-11", 2, now, "min_nights"},
		// Thu 2027-06-24 → Sat 2027-06-26 is fine in the off season...
		{"short weekend off season ok", testDays, "2027-06-24", "2027-06-26", 2, now, ""},
		// ...but Wed 06-30 → Fri 07-02 touches peak, whose 3-night floor applies to the whole stay.
		{"max min-nights across boundary", testDays, "2027-06-30", "2027-07-02", 2, now, "min_nights"},
		{"peak check-in on a Tuesday", testDays, "2027-07-06", "2027-07-10", 2, now, "checkin_day"},
		{"inside advance notice", testDays, "2027-06-10", "2027-06-12", 2, time.Date(2027, 6, 9, 20, 0, 0, 0, Cairo), "too_soon"},
		{"beyond max advance", testDays, "2027-06-10", "2027-06-12", 2, time.Date(2026, 1, 1, 0, 0, 0, 0, Cairo), "too_far"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Quote(testUnit, c.days, Request{CheckIn: d(c.in), CheckOut: d(c.out), Guests: c.guests}, c.now)
			if got := code(err); got != c.want {
				t.Fatalf("want %q, got %q (%v)", c.want, got, err)
			}
		})
	}
}

func TestQuoteBreakdown(t *testing.T) {
	// Thu 07-01 → Sun 07-04: 3 peak nights at 2000, 6 guests (2 extra).
	b, err := Quote(testUnit, testDays, Request{CheckIn: d("2027-07-01"), CheckOut: d("2027-07-04"), Guests: 6}, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Nights) != 3 || b.Subtotal != money.FromPounds(6000) {
		t.Fatalf("nights %d subtotal %d", len(b.Nights), b.Subtotal)
	}
	if b.ExtraGuests != money.FromPounds(600) || b.Cleaning != money.FromPounds(500) {
		t.Fatalf("extra %d cleaning %d", b.ExtraGuests, b.Cleaning)
	}
	if b.Total != money.FromPounds(7100) || b.DepositDue != money.FromPounds(2130) || b.SecurityDeposit != money.FromPounds(2000) {
		t.Fatalf("total %d deposit %d security %d", b.Total, b.DepositDue, b.SecurityDeposit)
	}
}

func TestQuoteDepositRoundsUp(t *testing.T) {
	u := testUnit
	u.CleaningFee = 1 // 2 off nights = 200000 + 1 → 200001 × 30% = 60000.3 → 60001
	b, err := Quote(u, testDays, Request{CheckIn: d("2027-06-10"), CheckOut: d("2027-06-12"), Guests: 2}, now)
	if err != nil {
		t.Fatal(err)
	}
	if b.DepositDue != 60001 {
		t.Fatalf("deposit %d", b.DepositDue)
	}
}
