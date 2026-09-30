package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/booking"
	"github.com/sahel/api/internal/domain/customer"
	"github.com/sahel/api/internal/store/postgres/db"
)

// maxNightlyPrice bounds a typed price (piasters): a million pounds a night.
const maxNightlyPrice = 100_000_000

type manualBookingRequest struct {
	UnitID   string `json:"unit_id"`
	CheckIn  string `json:"check_in"`
	CheckOut string `json:"check_out"`
	Guests   int    `json:"guests"`
	Phone    string `json:"phone"`
	Name     string `json:"name"`
	// Piasters per night; 0 takes the unit's own price.
	NightlyPrice int64 `json:"nightly_price"`
}

var errNightsTaken = errors.New("nights taken")

// adminCreateBooking books a stay for a guest who called or came in. It is
// confirmed at once (payments are recorded separately), may use any price,
// and skips the website's notice rules, but never double-books: it counts
// bookings, turnover days and blocks under the unit's row lock.
func (s *Server) adminCreateBooking(w http.ResponseWriter, r *http.Request) {
	var in manualBookingRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	var unitID pgtype.UUID
	if err := unitID.Scan(in.UnitID); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "unit_required", "choose a unit")
		return
	}
	checkIn, checkOut, err := parseRange(in.CheckIn, in.CheckOut, maxAvailabilitySpan)
	if err == nil && !checkOut.After(checkIn) {
		err = errors.New("check-out must be after check-in")
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_range", err.Error())
		return
	}
	phone, err := customer.NormalizePhone(in.Phone)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_phone", err.Error())
		return
	}
	name := cleanName(in.Name)
	if !validName(name) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_name", "name must be 2 to 80 characters")
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()

	u, err := s.queries.GetPricingUnit(ctx, db.GetPricingUnitParams{ID: unitID})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && u.Status == db.UnitStatusEnumArchived) {
		writeError(w, http.StatusUnprocessableEntity, "unit_required", "that unit can't be booked")
		return
	}
	if err != nil {
		s.internalError(w, err, "unit")
		return
	}
	if in.Guests < 1 || in.Guests > int(u.MaxGuests) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_guests", "guests must be between 1 and the unit's maximum")
		return
	}
	price := in.NightlyPrice
	if price == 0 && u.NightlyPrice != nil {
		price = *u.NightlyPrice
	}
	if price <= 0 || price > maxNightlyPrice {
		writeError(w, http.StatusUnprocessableEntity, "price_required", "enter a nightly price")
		return
	}
	nights := int64(checkOut.Sub(checkIn).Hours() / 24)

	created, err := inTx(ctx, s, func(q *db.Queries) (db.CreateBookingRow, error) {
		if _, err := q.LockUnit(ctx, u.ID); err != nil {
			return db.CreateBookingRow{}, err
		}
		n, err := q.CountOverlappingStays(ctx, db.CountOverlappingStaysParams{
			UnitID: u.ID, BufferDays: int32(u.BufferDays), CheckIn: checkIn, CheckOut: checkOut,
		})
		if err != nil {
			return db.CreateBookingRow{}, err
		}
		if n > 0 {
			return db.CreateBookingRow{}, errNightsTaken
		}
		c, err := q.EnsureCustomer(ctx, db.EnsureCustomerParams{Phone: phone, Name: name})
		if err != nil {
			return db.CreateBookingRow{}, err
		}
		for attempt := 0; ; attempt++ {
			ref, err := booking.NewRef(nil)
			if err != nil {
				return db.CreateBookingRow{}, err
			}
			row, err := q.CreateBooking(ctx, db.CreateBookingParams{
				Ref: ref, UnitID: u.ID, CustomerID: c.ID, CheckIn: checkIn, CheckOut: checkOut,
				Guests: int16(in.Guests), Status: db.BookingStatusEnum(booking.StatusConfirmed),
				NightlyPrice: price, Total: price * nights, DepositDue: price, Source: "admin",
			})
			if pgCode(err) == pgUniqueViolation && attempt < 5 {
				continue
			}
			return row, err
		}
	})
	switch {
	case errors.Is(err, errNightsTaken), pgCode(err) == pgExclusionViolation:
		writeError(w, http.StatusConflict, "dates_taken", "a booking or block already holds some of these nights")
		return
	case err != nil:
		s.internalError(w, err, "manual booking")
		return
	}
	view, err := s.queries.GetBookingView(ctx, db.GetBookingViewParams{ID: created.ID})
	if err != nil {
		s.internalError(w, err, "booking")
		return
	}
	writeJSON(w, http.StatusCreated, view)
}
