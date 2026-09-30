package http

import (
	"sort"
	"strings"
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func TestAdminBookings_DateAndStatusFilters(t *testing.T) {
	s := newGuestServer(t) // today is 2027-05-01 in Cairo
	token := register(t, s, "01012345678", "Mona Ali")
	for _, dates := range [][2]string{{"2027-06-01", "2027-06-04"}, {"2027-06-10", "2027-06-13"}, {"2027-07-01", "2027-07-03"}} {
		expectStatus(t, guestDo(t, s, "POST", "/bookings", token, `{"unit_slug":"u1","check_in":"`+dates[0]+`","check_out":"`+dates[1]+`","guests":2}`), 201)
	}
	refsFor := func(query string) string {
		t.Helper()
		rows := decodeInto[[]db.AdminListBookingsRow](t, adminDo(t, s, "GET", "/bookings"+query, nil))
		ins := []string{}
		for _, b := range rows {
			ins = append(ins, b.CheckIn.Format("01-02"))
		}
		sort.Strings(ins)
		return strings.Join(ins, ",")
	}

	for query, want := range map[string]string{
		"":                                     "06-01,06-10,07-01",
		"?from=2027-06-05":                     "06-10,07-01",
		"?from=2027-06-04":                     "06-01,06-10,07-01", // checks out that day
		"?to=2027-06-09":                       "06-01",
		"?from=2027-06-11&to=2027-06-11":       "06-10", // mid-stay
		"?from=2027-06-14&to=2027-06-30":       "",
		"?status=pending_payment&all=1":        "06-01,06-10,07-01",
		"?status=confirmed":                    "",
		"?from=2027-06-01&to=2027-07-31&all=1": "06-01,06-10,07-01",
	} {
		if got := refsFor(query); got != want {
			t.Errorf("%q = %q, want %q", query, got, want)
		}
	}
	rows := decodeInto[[]db.AdminListBookingsRow](t, adminDo(t, s, "GET", "/bookings", nil))
	if rows[0].CompoundNameEn == "" || rows[0].DepositDue == 0 {
		t.Fatalf("row = %+v", rows[0])
	}
	expectStatus(t, adminDo(t, s, "GET", "/bookings?from=June", nil), 422)
}
