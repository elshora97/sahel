// Package pricing prices a stay at a unit: its nightly price × nights, with
// nothing added. The deposit to confirm is one night's price. Pure: no database, no clock of
// its own. Dates are calendar dates carried as UTC midnight; money is integer
// piasters.
package pricing

import (
	"errors"
	"fmt"
	"time"
	// Alpine images ship without zoneinfo; embed it so Africa/Cairo always loads.
	_ "time/tzdata"

	"github.com/sahel/api/internal/money"
)

const DateLayout = "2006-01-02"

// Cairo is where every "today" and "now" in the booking rules is measured.
var Cairo = mustLoad("Africa/Cairo")

// checkInHour is the local hour a stay starts, for advance-notice checks.
const checkInHour = 14

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

type Unit struct {
	NightlyPrice       money.Piasters // 0 = not priced yet: nothing is bookable
	MaxGuests          int
	AdvanceNoticeHours int
	MaxAdvanceDays     int
}

type Day struct {
	Date      time.Time
	Price     money.Piasters
	Available bool
}

// Days is every date in [from, to] at the unit's price.
func Days(u Unit, from, to time.Time) []Day {
	var days []Day
	for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
		days = append(days, Day{Date: date, Price: u.NightlyPrice, Available: u.NightlyPrice > 0})
	}
	return days
}

type Request struct {
	CheckIn, CheckOut time.Time
	Guests            int
}

type Breakdown struct {
	NightlyPrice money.Piasters `json:"nightly_price"`
	NightCount   int            `json:"night_count"`
	Total        money.Piasters `json:"total"`
	DepositDue   money.Piasters `json:"deposit_due"`
}

// RuleError is a stay that breaks one of the booking rules. Code is stable
// and machine-readable; the web layer words it for guests.
type RuleError struct {
	Code    string
	Message string
}

func (e *RuleError) Error() string { return e.Code + ": " + e.Message }

func fail(code, format string, args ...any) error {
	return &RuleError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// IsRuleError reports whether err is a broken booking rule.
func IsRuleError(err error) bool {
	var re *RuleError
	return errors.As(err, &re)
}

// Quote checks the rules in order and prices the stay.
func Quote(u Unit, r Request, now time.Time) (Breakdown, error) {
	nights := int(r.CheckOut.Sub(r.CheckIn).Hours() / 24)
	if nights < 1 {
		return Breakdown{}, fail("invalid_range", "check-out must be after check-in")
	}
	if r.Guests < 1 || r.Guests > u.MaxGuests {
		return Breakdown{}, fail("invalid_range", "guests must be between 1 and %d", u.MaxGuests)
	}
	if u.NightlyPrice <= 0 {
		return Breakdown{}, fail("unavailable", "this unit has no price yet")
	}

	start := time.Date(r.CheckIn.Year(), r.CheckIn.Month(), r.CheckIn.Day(), checkInHour, 0, 0, 0, Cairo)
	if start.Before(now.Add(time.Duration(u.AdvanceNoticeHours) * time.Hour)) {
		return Breakdown{}, fail("too_soon", "book at least %d hours ahead", u.AdvanceNoticeHours)
	}
	local := now.In(Cairo)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	if r.CheckIn.After(today.AddDate(0, 0, u.MaxAdvanceDays)) {
		return Breakdown{}, fail("too_far", "bookings open %d days ahead", u.MaxAdvanceDays)
	}

	b := Breakdown{NightlyPrice: u.NightlyPrice, NightCount: nights}
	b.Total = u.NightlyPrice * money.Piasters(nights)
	b.DepositDue = u.NightlyPrice
	return b, nil
}
