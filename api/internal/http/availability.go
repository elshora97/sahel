package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/money"
	"github.com/sahel/api/internal/store/postgres/db"
)

// maxAvailabilitySpan bounds one public availability read (about four months).
const maxAvailabilitySpan = 120

// now is the clock for the booking rules; tests replace it.
var now = time.Now

type availabilityDay struct {
	Date           string `json:"date"`
	Price          *int64 `json:"price"`
	MinNights      int16  `json:"min_nights"`
	AllowedCheckin bool   `json:"allowed_checkin"`
	State          string `json:"state"` // free | blocked | past
	SeasonNameAr   string `json:"season_name_ar,omitempty"`
	SeasonNameEn   string `json:"season_name_en,omitempty"`
}

func cairoToday() time.Time {
	l := now().In(pricing.Cairo)
	return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
}

func (s *Server) pricingUnit(w http.ResponseWriter, r *http.Request) (db.GetPricingUnitBySlugRow, bool) {
	u, err := s.queries.GetPricingUnitBySlug(r.Context(), chi.URLParam(r, "slug"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "not_found", "unit not found")
		return u, false
	}
	if err != nil {
		s.internalError(w, err, "get unit")
		return u, false
	}
	return u, true
}

// getAvailability lists every date in the range: dates without a calendar
// row are blocked, dates before today (Cairo) are past.
func (s *Server) getAvailability(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"), maxAvailabilitySpan)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_param", err.Error())
		return
	}
	u, ok := s.pricingUnit(w, r)
	if !ok {
		return
	}
	rows, err := s.queries.ListCalendar(r.Context(), db.ListCalendarParams{UnitID: u.ID, FromDate: from, ToDate: to})
	if err != nil {
		s.internalError(w, err, "availability")
		return
	}
	byDate := make(map[string]db.ListCalendarRow, len(rows))
	for _, row := range rows {
		byDate[row.Date.Format(pricing.DateLayout)] = row
	}
	today := cairoToday()
	out := make([]availabilityDay, 0, int(to.Sub(from).Hours()/24)+1)
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		key := d.Format(pricing.DateLayout)
		day := availabilityDay{Date: key, State: "blocked"}
		if row, ok := byDate[key]; ok {
			price := row.Price
			day.Price, day.MinNights, day.AllowedCheckin = &price, row.MinNights, row.AllowedCheckin
			if row.IsAvailable {
				day.State = "free"
			}
			if row.SeasonNameAr != nil {
				day.SeasonNameAr = *row.SeasonNameAr
			}
			if row.SeasonNameEn != nil {
				day.SeasonNameEn = *row.SeasonNameEn
			}
		}
		if d.Before(today) {
			day.State = "past"
		}
		out = append(out, day)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) postQuote(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CheckIn  string `json:"check_in"`
		CheckOut string `json:"check_out"`
		Guests   int    `json:"guests"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	checkIn, checkOut, err := parseRange(in.CheckIn, in.CheckOut, maxAvailabilitySpan)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_range", err.Error())
		return
	}
	u, ok := s.pricingUnit(w, r)
	if !ok {
		return
	}
	rows, err := s.queries.ListCalendar(r.Context(), db.ListCalendarParams{UnitID: u.ID, FromDate: checkIn, ToDate: checkOut})
	if err != nil {
		s.internalError(w, err, "quote")
		return
	}
	b, err := pricing.Quote(pricing.Unit{
		BaseGuests: int(u.BaseGuests), MaxGuests: int(u.MaxGuests),
		CleaningFee: money.Piasters(u.CleaningFee), SecurityDeposit: money.Piasters(u.SecurityDeposit),
		ExtraGuestFee: money.Piasters(u.ExtraGuestFee), DepositPct: int(u.DepositPct),
		AdvanceNoticeHours: int(u.AdvanceNoticeHours), MaxAdvanceDays: int(u.MaxAdvanceDays),
	}, calendarDays(rows), pricing.Request{CheckIn: checkIn, CheckOut: checkOut, Guests: in.Guests}, now())
	var re *pricing.RuleError
	if errors.As(err, &re) {
		writeError(w, http.StatusUnprocessableEntity, re.Code, re.Message)
		return
	}
	if err != nil {
		s.internalError(w, err, "quote")
		return
	}
	writeJSON(w, http.StatusOK, b)
}
