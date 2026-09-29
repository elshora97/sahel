package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

// maxAvailabilitySpan bounds one public availability read (about four months).
const maxAvailabilitySpan = 120

// now is the clock for the booking rules; tests replace it.
var now = time.Now

func cairoToday() time.Time {
	l := now().In(pricing.Cairo)
	return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
}

func (s *Server) publicPricingUnit(w http.ResponseWriter, r *http.Request) (db.GetPricingUnitRow, bool) {
	slug := chi.URLParam(r, "slug")
	u, err := s.queries.GetPricingUnit(r.Context(), db.GetPricingUnitParams{Slug: &slug, OnlyActive: true})
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

func (s *Server) getAvailability(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"), maxAvailabilitySpan)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_param", err.Error())
		return
	}
	u, ok := s.publicPricingUnit(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toCalendar(pricing.Days(pricingUnit(u), from, to), cairoToday(), int(u.MaxAdvanceDays)))
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
	u, ok := s.publicPricingUnit(w, r)
	if !ok {
		return
	}
	b, err := pricing.Quote(pricingUnit(u), pricing.Request{CheckIn: checkIn, CheckOut: checkOut, Guests: in.Guests}, now())
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
