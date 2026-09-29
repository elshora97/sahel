package pricing

import (
	"errors"
	"testing"
	"time"

	"github.com/sahel/api/internal/money"
)

func d(s string) time.Time {
	t, err := time.Parse(DateLayout, s)
	if err != nil {
		panic(err)
	}
	return t
}

var testUnit = Unit{
	NightlyPrice: money.FromPounds(2000), MaxGuests: 6,
	AdvanceNoticeHours: 24, MaxAdvanceDays: 365,
}

var now = time.Date(2027, 5, 1, 10, 0, 0, 0, Cairo)

func code(err error) string {
	var re *RuleError
	if errors.As(err, &re) {
		return re.Code
	}
	return ""
}

func TestDaysFollowTheUnitPrice(t *testing.T) {
	days := Days(testUnit, d("2027-06-01"), d("2027-06-03"))
	if len(days) != 3 || days[0].Price != 200000 || !days[2].Available {
		t.Fatalf("days = %+v", days)
	}
	unpriced := testUnit
	unpriced.NightlyPrice = 0
	if Days(unpriced, d("2027-06-01"), d("2027-06-01"))[0].Available {
		t.Fatal("an unpriced unit is not bookable")
	}
}

func TestQuoteRules(t *testing.T) {
	unpriced := testUnit
	unpriced.NightlyPrice = 0
	cases := []struct {
		name    string
		unit    Unit
		in, out string
		guests  int
		now     time.Time
		want    string
	}{
		{"one night is fine", testUnit, "2027-06-08", "2027-06-09", 2, now, ""},
		{"checkout before checkin", testUnit, "2027-06-10", "2027-06-10", 2, now, "invalid_range"},
		{"too many guests", testUnit, "2027-06-10", "2027-06-12", 7, now, "invalid_range"},
		{"unpriced unit", unpriced, "2027-06-10", "2027-06-12", 2, now, "unavailable"},
		{"inside advance notice", testUnit, "2027-06-10", "2027-06-12", 2, time.Date(2027, 6, 9, 20, 0, 0, 0, Cairo), "too_soon"},
		{"beyond max advance", testUnit, "2027-06-10", "2027-06-12", 2, time.Date(2026, 1, 1, 0, 0, 0, 0, Cairo), "too_far"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Quote(c.unit, Request{CheckIn: d(c.in), CheckOut: d(c.out), Guests: c.guests}, c.now)
			if got := code(err); got != c.want {
				t.Fatalf("want %q, got %q (%v)", c.want, got, err)
			}
		})
	}
}

func TestQuoteBreakdown(t *testing.T) {
	b, err := Quote(testUnit, Request{CheckIn: d("2027-07-01"), CheckOut: d("2027-07-04"), Guests: 6}, now)
	if err != nil {
		t.Fatal(err)
	}
	if b.NightCount != 3 || b.NightlyPrice != money.FromPounds(2000) {
		t.Fatalf("breakdown %+v", b)
	}
	// Exactly the entered price × nights: nothing added.
	if b.Total != money.FromPounds(6000) || b.DepositDue != money.FromPounds(2000) {
		t.Fatalf("total %d deposit %d", b.Total, b.DepositDue)
	}
}

func TestQuoteKeepsTheEnteredPriceExactly(t *testing.T) {
	u := testUnit
	u.NightlyPrice = 449992 // 4,499.92 EGP stays 4,499.92: no rounding, nothing added
	b, err := Quote(u, Request{CheckIn: d("2027-06-10"), CheckOut: d("2027-06-12"), Guests: 2}, now)
	if err != nil {
		t.Fatal(err)
	}
	if b.NightlyPrice != 449992 || b.Total != 899984 || b.DepositDue != 449992 {
		t.Fatalf("breakdown %+v", b)
	}
}
