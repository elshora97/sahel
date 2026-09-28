package http

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/money"
	"github.com/sahel/api/internal/store/postgres/db"
)

// maxCalendarSpan caps any one read or edit of a calendar range.
const maxCalendarSpan = 400

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

func toDomainSeason(s db.Season) pricing.Season {
	days := make([]int, len(s.AllowedCheckinDays))
	for i, d := range s.AllowedCheckinDays {
		days[i] = int(d)
	}
	return pricing.Season{
		ID: uuidString(s.ID), NameAr: s.NameAr, NameEn: s.NameEn,
		Start: s.StartDate, End: s.EndDate, NightlyPrice: money.Piasters(s.NightlyPrice),
		MinNights: int(s.MinNights), CheckinDays: days, UpliftPct: int(s.WeekendUpliftPct), Priority: int(s.Priority),
	}
}

// regenerate rebuilds a unit's rule-sourced calendar rows in [from, to] from
// its current seasons. Manual rows are left exactly as they are. Run it in
// the same transaction as the season change that caused it.
func regenerate(ctx context.Context, q *db.Queries, unitID pgtype.UUID, from, to time.Time) error {
	rows, err := q.ListSeasons(ctx, unitID)
	if err != nil {
		return err
	}
	seasons := make([]pricing.Season, len(rows))
	for i, r := range rows {
		seasons[i] = toDomainSeason(r)
	}
	if err := q.DeleteRuleDays(ctx, db.DeleteRuleDaysParams{UnitID: unitID, FromDate: from, ToDate: to}); err != nil {
		return err
	}
	days := pricing.Generate(seasons, from, to)
	if len(days) == 0 {
		return nil
	}
	p := db.InsertRuleDaysParams{UnitID: unitID}
	for _, d := range days {
		var sid pgtype.UUID
		if err := sid.Scan(d.SeasonID); err != nil {
			return err
		}
		p.Dates = append(p.Dates, d.Date)
		p.Prices = append(p.Prices, int64(d.Price))
		p.MinNights = append(p.MinNights, int16(d.MinNights))
		p.AllowedCheckin = append(p.AllowedCheckin, d.AllowedCheckin)
		p.SeasonIds = append(p.SeasonIds, sid)
	}
	return q.InsertRuleDays(ctx, p)
}

// spanOf returns the smallest range covering every given season.
func spanOf(seasons ...db.Season) (time.Time, time.Time, bool) {
	var from, to time.Time
	for i, s := range seasons {
		if i == 0 || s.StartDate.Before(from) {
			from = s.StartDate
		}
		if i == 0 || s.EndDate.After(to) {
			to = s.EndDate
		}
	}
	return from, to, len(seasons) > 0
}

func calendarDays(rows []db.ListCalendarRow) []pricing.Day {
	days := make([]pricing.Day, len(rows))
	for i, r := range rows {
		days[i] = pricing.Day{
			Date: r.Date, Price: money.Piasters(r.Price), MinNights: int(r.MinNights),
			AllowedCheckin: r.AllowedCheckin, Available: r.IsAvailable,
		}
		if r.SeasonNameAr != nil {
			days[i].SeasonNameAr = *r.SeasonNameAr
		}
		if r.SeasonNameEn != nil {
			days[i].SeasonNameEn = *r.SeasonNameEn
		}
	}
	return days
}
