package http

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/booking"
	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

const pgExclusionViolation = "23P01"

// markBooked makes every day inside an occupying booking, or inside the
// unit's turnover days after one, unavailable.
func (s *Server) markBooked(ctx context.Context, u db.GetPricingUnitRow, days []pricing.Day) error {
	if len(days) == 0 {
		return nil
	}
	stays, err := s.queries.ListOccupiedStays(ctx, db.ListOccupiedStaysParams{
		UnitID: u.ID, BufferDays: int32(u.BufferDays), FromDate: days[0].Date, ToDate: days[len(days)-1].Date,
	})
	if err != nil {
		return err
	}
	for i := range days {
		for _, st := range stays {
			if !days[i].Date.Before(st.CheckIn) && days[i].Date.Before(st.BlockedUntil) {
				days[i].Available = false
			}
		}
	}
	return nil
}

// quoteStay applies the pricing rules, then refuses dates another booking
// (or its turnover days) already holds.
func (s *Server) quoteStay(ctx context.Context, q *db.Queries, u db.GetPricingUnitRow, req pricing.Request) (pricing.Breakdown, error) {
	b, err := pricing.Quote(pricingUnit(u), req, now())
	if err != nil {
		return b, err
	}
	n, err := q.CountOverlappingStays(ctx, db.CountOverlappingStaysParams{
		UnitID: u.ID, BufferDays: int32(u.BufferDays), CheckIn: req.CheckIn, CheckOut: req.CheckOut,
	})
	if err != nil {
		return b, err
	}
	if n > 0 {
		return b, &pricing.RuleError{Code: "unavailable", Message: "some of these nights are already booked"}
	}
	return b, nil
}

type bookingRequest struct {
	UnitSlug string `json:"unit_slug"`
	CheckIn  string `json:"check_in"`
	CheckOut string `json:"check_out"`
	Guests   int    `json:"guests"`
}

func (s *Server) createBooking(w http.ResponseWriter, r *http.Request) {
	var in bookingRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	checkIn, checkOut, err := parseRange(in.CheckIn, in.CheckOut, maxAvailabilitySpan)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_range", err.Error())
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	guest, err := s.queries.GetCustomer(ctx, guestFrom(r))
	if err != nil {
		s.writeStoreError(w, err, "customer")
		return
	}
	if strings.TrimSpace(guest.Name) == "" {
		writeError(w, http.StatusUnprocessableEntity, "name_required", "add your name before booking")
		return
	}
	u, ok := s.pricingUnitBySlug(w, r, in.UnitSlug)
	if !ok {
		return
	}
	req := pricing.Request{CheckIn: checkIn, CheckOut: checkOut, Guests: in.Guests}

	created, err := inTx(ctx, s, func(q *db.Queries) (db.CreateBookingRow, error) {
		// Admin blocks take the same lock, so a block and a booking can't
		// claim the same night at once.
		if _, err := q.LockUnit(ctx, u.ID); err != nil {
			return db.CreateBookingRow{}, err
		}
		b, err := s.quoteStay(ctx, q, u, req)
		if err != nil {
			return db.CreateBookingRow{}, err
		}
		for attempt := 0; ; attempt++ {
			ref, err := booking.NewRef(nil)
			if err != nil {
				return db.CreateBookingRow{}, err
			}
			row, err := q.CreateBooking(ctx, db.CreateBookingParams{
				Ref: ref, UnitID: u.ID, CustomerID: guest.ID, CheckIn: checkIn, CheckOut: checkOut,
				Guests: int16(in.Guests), Status: db.BookingStatusEnum(booking.StatusPendingPayment),
				NightlyPrice: int64(b.NightlyPrice), Total: int64(b.Total), DepositDue: int64(b.DepositDue),
				HoldExpiresAt: tsNow(s.holdFor()),
			})
			// A clashing reference is the only unique violation possible here.
			if pgCode(err) == pgUniqueViolation && attempt < 5 {
				continue
			}
			return row, err
		}
	})
	var re *pricing.RuleError
	switch {
	case errors.As(err, &re) && re.Code == "unavailable" && u.NightlyPrice != nil,
		pgCode(err) == pgExclusionViolation:
		writeError(w, http.StatusConflict, "dates_taken", "someone just booked these dates")
		return
	case errors.As(err, &re):
		writeError(w, http.StatusUnprocessableEntity, re.Code, re.Message)
		return
	case err != nil:
		s.internalError(w, err, "create booking")
		return
	}
	view, err := s.queries.GetBookingView(ctx, db.GetBookingViewParams{ID: created.ID})
	if err != nil {
		s.internalError(w, err, "booking")
		return
	}
	writeJSON(w, http.StatusCreated, view)
}

func (s *Server) listMyBookings(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queries.ListCustomerBookings(r.Context(), guestFrom(r))
	if err != nil {
		s.internalError(w, err, "bookings")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminListBookings(w http.ResponseWriter, r *http.Request) {
	p := db.AdminListBookingsParams{Q: queryOpt(r, "q")}
	if v := r.URL.Query().Get("status"); v != "" {
		if _, err := booking.ParseStatus(v); err != nil {
			writeInvalid(w, err)
			return
		}
		p.Status = db.NullBookingStatusEnum{BookingStatusEnum: db.BookingStatusEnum(v), Valid: true}
	}
	if v := r.URL.Query().Get("unit"); v != "" {
		var id pgtype.UUID
		if err := id.Scan(v); err != nil {
			writeInvalid(w, errString("unit must be a unit id"))
			return
		}
		p.UnitID = id
	}
	rows, err := s.queries.AdminListBookings(r.Context(), p)
	if err != nil {
		s.internalError(w, err, "bookings")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetBooking(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "booking")
	if !ok {
		return
	}
	view, err := s.queries.GetBookingView(r.Context(), db.GetBookingViewParams{ID: id})
	if err != nil {
		s.writeStoreError(w, err, "booking")
		return
	}
	payments, err := s.queries.ListBookingPayments(r.Context(), id)
	if err != nil {
		s.internalError(w, err, "payments")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		db.GetBookingViewRow
		Payments []db.ListBookingPaymentsRow `json:"payments"`
	}{view, payments})
}

func (s *Server) adminCancelBooking(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "booking")
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	var reason *string
	if v := strings.TrimSpace(in.Reason); v != "" {
		reason = &v
	}
	if _, err := s.queries.CancelBooking(r.Context(), db.CancelBookingParams{ID: id, Reason: reason}); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusConflict, "not_cancellable", "only a pending or confirmed booking can be cancelled")
		return
	} else if err != nil {
		s.internalError(w, err, "cancel booking")
		return
	}
	s.adminGetBooking(w, r)
}

type errString string

func (e errString) Error() string { return string(e) }
