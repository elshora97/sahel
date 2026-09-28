// Package pricing turns a unit's seasons into one calendar day per date and
// prices a stay against those days. Pure: no database, no clock of its own.
// Dates are calendar dates carried as UTC midnight; money is integer piasters.
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

type Season struct {
	ID           string
	NameAr       string
	NameEn       string
	Start, End   time.Time // inclusive
	NightlyPrice money.Piasters
	MinNights    int
	CheckinDays  []int // time.Weekday values; empty = every day
	UpliftPct    int   // added on Thursday and Friday nights, the Egyptian weekend
	Priority     int
}

type Day struct {
	Date           time.Time
	Price          money.Piasters
	MinNights      int
	AllowedCheckin bool
	Available      bool
	SeasonID       string
	SeasonNameAr   string
	SeasonNameEn   string
}

func isWeekendNight(t time.Time) bool {
	return t.Weekday() == time.Thursday || t.Weekday() == time.Friday
}

// wins reports whether a should price a date that b also covers: higher
// priority, then the shorter season, then the one that starts later.
func wins(a, b Season) bool {
	if a.Priority != b.Priority {
		return a.Priority > b.Priority
	}
	la, lb := a.End.Sub(a.Start), b.End.Sub(b.Start)
	if la != lb {
		return la < lb
	}
	return a.Start.After(b.Start)
}

// Generate returns one Day for every date in [from, to] that a season covers.
// Dates no season covers get no Day: they are unavailable.
func Generate(seasons []Season, from, to time.Time) []Day {
	var days []Day
	for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
		var best *Season
		for i := range seasons {
			s := &seasons[i]
			if date.Before(s.Start) || date.After(s.End) {
				continue
			}
			if best == nil || wins(*s, *best) {
				best = s
			}
		}
		if best == nil {
			continue
		}
		price := best.NightlyPrice
		if best.UpliftPct > 0 && isWeekendNight(date) {
			price = money.CeilToWholePound(money.CeilPct(price, 100+best.UpliftPct))
		}
		allowed := len(best.CheckinDays) == 0
		for _, wd := range best.CheckinDays {
			if time.Weekday(wd) == date.Weekday() {
				allowed = true
			}
		}
		days = append(days, Day{
			Date: date, Price: price, MinNights: best.MinNights, AllowedCheckin: allowed, Available: true,
			SeasonID: best.ID, SeasonNameAr: best.NameAr, SeasonNameEn: best.NameEn,
		})
	}
	return days
}

type Unit struct {
	BaseGuests, MaxGuests int
	CleaningFee           money.Piasters
	SecurityDeposit       money.Piasters
	ExtraGuestFee         money.Piasters // per extra guest per night
	DepositPct            int
	AdvanceNoticeHours    int
	MaxAdvanceDays        int
}

type Request struct {
	CheckIn, CheckOut time.Time
	Guests            int
}

type Night struct {
	Date         time.Time      `json:"date"`
	Price        money.Piasters `json:"price"`
	SeasonNameAr string         `json:"season_name_ar"`
	SeasonNameEn string         `json:"season_name_en"`
}

type Breakdown struct {
	Nights          []Night        `json:"nights"`
	NightCount      int            `json:"night_count"`
	Subtotal        money.Piasters `json:"subtotal"`
	ExtraGuests     money.Piasters `json:"extra_guests"`
	Cleaning        money.Piasters `json:"cleaning_fee"`
	Total           money.Piasters `json:"total"`
	DepositDue      money.Piasters `json:"deposit_due"`
	SecurityDeposit money.Piasters `json:"security_deposit"`
}

// RuleError is a stay that breaks one of the availability rules. Code is
// stable and machine-readable; the web layer words it for guests.
type RuleError struct {
	Code    string
	Message string
}

func (e *RuleError) Error() string { return e.Code + ": " + e.Message }

func fail(code, format string, args ...any) error {
	return &RuleError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// IsRuleError reports whether err is a broken availability rule.
func IsRuleError(err error) bool {
	var re *RuleError
	return errors.As(err, &re)
}

// Quote checks the rules in the order the spec gives them and prices the
// stay. days must cover the stay's nights; missing nights are unavailable.
func Quote(u Unit, days []Day, r Request, now time.Time) (Breakdown, error) {
	nights := int(r.CheckOut.Sub(r.CheckIn).Hours() / 24)
	if nights < 1 {
		return Breakdown{}, fail("invalid_range", "check-out must be after check-in")
	}
	if r.Guests < 1 || r.Guests > u.MaxGuests {
		return Breakdown{}, fail("invalid_range", "guests must be between 1 and %d", u.MaxGuests)
	}

	byDate := make(map[string]Day, len(days))
	for _, d := range days {
		byDate[d.Date.Format(DateLayout)] = d
	}

	b := Breakdown{NightCount: nights}
	minNights := 1
	for date := r.CheckIn; date.Before(r.CheckOut); date = date.AddDate(0, 0, 1) {
		day, ok := byDate[date.Format(DateLayout)]
		if !ok || !day.Available {
			return Breakdown{}, fail("unavailable", "%s is not available", date.Format(DateLayout))
		}
		minNights = max(minNights, day.MinNights)
		b.Nights = append(b.Nights, Night{Date: date, Price: day.Price, SeasonNameAr: day.SeasonNameAr, SeasonNameEn: day.SeasonNameEn})
		b.Subtotal += day.Price
	}
	if nights < minNights {
		return Breakdown{}, fail("min_nights", "this stay needs at least %d nights", minNights)
	}
	if !byDate[r.CheckIn.Format(DateLayout)].AllowedCheckin {
		return Breakdown{}, fail("checkin_day", "check-in is not allowed on %s", r.CheckIn.Weekday())
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

	if extra := r.Guests - u.BaseGuests; extra > 0 {
		b.ExtraGuests = u.ExtraGuestFee * money.Piasters(extra*nights)
	}
	b.Cleaning = u.CleaningFee
	b.Total = b.Subtotal + b.ExtraGuests + b.Cleaning
	b.DepositDue = money.CeilPct(b.Total, u.DepositPct)
	b.SecurityDeposit = u.SecurityDeposit
	return b, nil
}
