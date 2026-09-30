package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

type reportMonth struct {
	Month         string `json:"month"` // YYYY-MM
	Nights        int64  `json:"nights"`
	Revenue       int64  `json:"revenue"`
	BlockedNights int64  `json:"blocked_nights"`
	// Nights on offer: every active unit, every night, less blocked nights.
	AvailableNights int64 `json:"available_nights"`
	Collected       int64 `json:"collected"`
	BookingsMade    int64 `json:"bookings_made"`
}

type reportUnit struct {
	ID              string `json:"id"`
	TitleAr         string `json:"title_ar"`
	TitleEn         string `json:"title_en"`
	Status          string `json:"status"`
	Nights          int64  `json:"nights"`
	Revenue         int64  `json:"revenue"`
	BlockedNights   int64  `json:"blocked_nights"`
	AvailableNights int64  `json:"available_nights"`
}

// adminReports answers GET /admin/reports?year=YYYY: month by month and unit
// by unit, confirmed nights and their revenue, blocked nights, payments
// verified and bookings made. Occupancy uses today's active units.
func (s *Server) adminReports(w http.ResponseWriter, r *http.Request) {
	year := cairoToday().Year()
	if v := r.URL.Query().Get("year"); v != "" {
		y, err := strconv.Atoi(v)
		if err != nil || y < 2000 || y > 2100 {
			writeError(w, http.StatusBadRequest, "invalid_param", "year must be a year like 2026")
			return
		}
		year = y
	}
	from := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(1, 0, 0)
	ctx := r.Context()

	units, err := s.queries.ReportUnits(ctx, db.ReportUnitsParams{FromDate: from, ToDate: to})
	if err != nil {
		s.internalError(w, err, "report units")
		return
	}
	months, err := s.queries.ReportMonths(ctx, db.ReportMonthsParams{FromDate: from, Months: 12})
	if err != nil {
		s.internalError(w, err, "report months")
		return
	}

	var active int64
	outUnits := make([]reportUnit, len(units))
	yearDays := int64(to.Sub(from).Hours() / 24)
	for i, u := range units {
		if u.Status == db.UnitStatusEnumActive {
			active++
		}
		outUnits[i] = reportUnit{
			ID: uuidString(u.ID), TitleAr: u.TitleAr, TitleEn: u.TitleEn, Status: string(u.Status),
			Nights: u.Nights, Revenue: u.Revenue, BlockedNights: u.BlockedNights,
			AvailableNights: max(yearDays-u.BlockedNights, 0),
		}
	}
	outMonths := make([]reportMonth, len(months))
	for i, m := range months {
		days := int64(m.MonthEnd.Sub(m.MonthStart).Hours() / 24)
		outMonths[i] = reportMonth{
			Month: m.MonthStart.Format("2006-01"), Nights: m.Nights, Revenue: m.Revenue, BlockedNights: m.BlockedNights,
			AvailableNights: max(active*days-m.BlockedNights, 0), Collected: m.Collected, BookingsMade: m.BookingsMade,
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"year": year, "today": cairoToday().Format(pricing.DateLayout), "active_units": active,
		"months": outMonths, "units": outUnits,
	})
}
