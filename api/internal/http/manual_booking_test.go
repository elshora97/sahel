package http

import (
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func TestManualBooking_ConfirmedAtOnceWithAnyPriceButNeverDoubleBooked(t *testing.T) {
	s := newGuestServer(t) // today is 2027-05-01; u1 is 2000 EGP a night, 4 guests, 1 turnover day
	unit := timelineUnitBySlug(t, s, "2027-06-01", "u1")
	body := func(in, out string, guests int, phone, name string, price int64) map[string]any {
		return map[string]any{"unit_id": unit.ID, "check_in": in, "check_out": out, "guests": guests, "phone": phone, "name": name, "nightly_price": price}
	}

	for code, b := range map[string]map[string]any{
		"invalid_range":  body("2027-06-10", "2027-06-10", 2, "01012345678", "Mona Ali", 0),
		"invalid_phone":  body("2027-06-10", "2027-06-12", 2, "123", "Mona Ali", 0),
		"invalid_name":   body("2027-06-10", "2027-06-12", 2, "01012345678", "M", 0),
		"invalid_guests": body("2027-06-10", "2027-06-12", 5, "01012345678", "Mona Ali", 0),
		"price_required": body("2027-06-10", "2027-06-12", 2, "01012345678", "Mona Ali", -5),
	} {
		rec := adminDo(t, s, "POST", "/bookings", b)
		expectStatus(t, rec, 422)
		if errorCode(t, rec) != code {
			t.Errorf("%s: got %s", code, errorCode(t, rec))
		}
	}

	// The unit's price by default; a new guest gets an account without a password.
	rec := adminDo(t, s, "POST", "/bookings", body("2027-06-10", "2027-06-13", 2, "010 1234 5678", "  Mona   Ali ", 0))
	expectStatus(t, rec, 201)
	b := decodeInto[db.GetBookingViewRow](t, rec)
	if b.Status != "confirmed" || b.Source != "admin" || b.Total != 600000 || b.DepositDue != 200000 || b.HoldExpiresAt.Valid || b.CustomerName != "Mona Ali" {
		t.Fatalf("booking = %+v", b)
	}
	c := decodeInto[db.AdminGetCustomerRow](t, adminDo(t, s, "GET", "/customers/"+uuidString(b.CustomerID), nil))
	if c.HasPassword {
		t.Fatal("a manual guest should have no password yet")
	}

	// Overlap and the turnover day are refused; so is a blocked night.
	expectStatus(t, adminDo(t, s, "POST", "/bookings", body("2027-06-13", "2027-06-14", 2, "01112345678", "Omar", 0)), 409)
	expectStatus(t, adminDo(t, s, "POST", "/units/"+unit.ID+"/blocks", map[string]any{"start": "2027-06-20", "end": "2027-06-22"}), 201)
	expectStatus(t, adminDo(t, s, "POST", "/bookings", body("2027-06-21", "2027-06-23", 2, "01112345678", "Omar", 0)), 409)

	// A typed price, and a same-day stay the website's notice rules would refuse;
	// the same phone joins the existing account and keeps its name.
	rec = adminDo(t, s, "POST", "/bookings", body("2027-05-01", "2027-05-03", 1, "01012345678", "Someone Else", 150000))
	expectStatus(t, rec, 201)
	b2 := decodeInto[db.GetBookingViewRow](t, rec)
	if b2.Total != 300000 || b2.NightlyPrice != 150000 || b2.CustomerID != b.CustomerID || b2.CustomerName != "Mona Ali" {
		t.Fatalf("second booking = %+v", b2)
	}

	// The guest can register later with that phone and sees both bookings.
	token := register(t, s, "01012345678", "Mona Ali")
	if n := len(decodeInto[[]db.ListCustomerBookingsRow](t, guestDo(t, s, "GET", "/me/bookings", token, ""))); n != 2 {
		t.Fatalf("guest sees %d bookings", n)
	}
}
