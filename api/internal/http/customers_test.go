package http

import (
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func TestCustomers_ListSearchDetailAndTheirBookings(t *testing.T) {
	s := newGuestServer(t)
	mona := register(t, s, "01012345678", "Mona Ali")
	register(t, s, "01112345678", "Omar Hassan")
	expectStatus(t, guestDo(t, s, "POST", "/bookings", mona, `{"unit_slug":"u1","check_in":"2027-06-10","check_out":"2027-06-13","guests":2}`), 201)

	all := decodeInto[[]db.AdminListCustomersRow](t, adminDo(t, s, "GET", "/customers", nil))
	if len(all) != 2 {
		t.Fatalf("customers = %d", len(all))
	}
	for _, q := range []string{"mona", "01012345678", "Ali"} {
		rows := decodeInto[[]db.AdminListCustomersRow](t, adminDo(t, s, "GET", "/customers?q="+q, nil))
		if len(rows) != 1 || rows[0].Name != "Mona Ali" || rows[0].Bookings != 1 || rows[0].Stays != 0 || !rows[0].LastBookedAt.Valid {
			t.Fatalf("q=%s: %+v", q, rows)
		}
	}
	monaID := uuidString(decodeInto[[]db.AdminListCustomersRow](t, adminDo(t, s, "GET", "/customers?q=mona", nil))[0].ID)

	c := decodeInto[db.AdminGetCustomerRow](t, adminDo(t, s, "GET", "/customers/"+monaID, nil))
	if c.Phone != "+201012345678" || !c.HasPassword {
		t.Fatalf("customer = %+v", c)
	}
	expectStatus(t, adminDo(t, s, "GET", "/customers/00000000-0000-4000-8000-000000000000", nil), 404)

	if n := len(decodeInto[[]db.AdminListBookingsRow](t, adminDo(t, s, "GET", "/bookings?customer="+monaID, nil))); n != 1 {
		t.Fatalf("mona's bookings = %d", n)
	}
	expectStatus(t, adminDo(t, s, "GET", "/bookings?customer=nope", nil), 422)
}
