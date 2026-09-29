package http

import (
	"fmt"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/money"
	"github.com/sahel/api/internal/store/postgres/db"
)

func parseDate(s string) (time.Time, error) {
	t, err := time.Parse(pricing.DateLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("%q is not a YYYY-MM-DD date", s)
	}
	return t, nil
}

// parseRange reads from/to dates, requiring from <= to and a bounded span.
func parseRange(from, to string, maxDays int) (time.Time, time.Time, error) {
	f, err := parseDate(from)
	if err != nil {
		return f, f, err
	}
	t, err := parseDate(to)
	if err != nil {
		return f, t, err
	}
	if t.Before(f) {
		return f, t, fmt.Errorf("to must not be before from")
	}
	if int(t.Sub(f).Hours()/24) > maxDays {
		return f, t, fmt.Errorf("a range can span at most %d days", maxDays)
	}
	return f, t, nil
}

func pricingUnit(u db.GetPricingUnitRow) pricing.Unit {
	p := pricing.Unit{
		MaxGuests:          int(u.MaxGuests),
		AdvanceNoticeHours: int(u.AdvanceNoticeHours), MaxAdvanceDays: int(u.MaxAdvanceDays),
	}
	if u.NightlyPrice != nil {
		p.NightlyPrice = money.Piasters(*u.NightlyPrice)
	}
	return p
}

// calendarDay is one date as the guest's calendar reads it.
type calendarDay struct {
	Date  string `json:"date"`
	Price *int64 `json:"price"`
	State string `json:"state"` // free | blocked | past
}

// toCalendar labels days for display: dates before today are past, dates
// past the unit's booking horizon (or unpriced) are blocked.
func toCalendar(days []pricing.Day, today time.Time, maxAdvanceDays int) []calendarDay {
	horizon := today.AddDate(0, 0, maxAdvanceDays)
	out := make([]calendarDay, len(days))
	for i, d := range days {
		c := calendarDay{Date: d.Date.Format(pricing.DateLayout), State: "blocked"}
		if d.Price > 0 {
			price := int64(d.Price)
			c.Price = &price
		}
		if d.Available && !d.Date.After(horizon) {
			c.State = "free"
		}
		if d.Date.Before(today) {
			c.State = "past"
		}
		out[i] = c
	}
	return out
}
