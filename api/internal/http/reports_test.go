package http

import (
	"testing"
	"time"
)

type reportResponse struct {
	Year        int           `json:"year"`
	ActiveUnits int64         `json:"active_units"`
	Months      []reportMonth `json:"months"`
	Units       []reportUnit  `json:"units"`
}

func TestReports_NightsLandInTheirMonthAndOnlyConfirmedCount(t *testing.T) {
	s, _ := paymentServer(t) // today is 2027-05-01 in Cairo; unit u1 is 2000 EGP a night
	token := register(t, s, "01012345678", "Mona Ali")
	stay := book(t, s, token, "2027-06-29", "2027-07-02") // three nights across two months
	book(t, s, token, "2027-08-10", "2027-08-12")         // left unpaid: not revenue

	unit := timelineUnitBySlug(t, s, "2027-06-01", "u1")
	expectStatus(t, adminDo(t, s, "POST", "/units/"+unit.ID+"/blocks", map[string]any{"start": "2027-06-01", "end": "2027-06-05"}), 201)
	// A payment recorded by the admin is verified at once and confirms the stay.
	expectStatus(t, adminDo(t, s, "POST", "/bookings/"+uuidString(stay.ID)+"/payments", map[string]any{"amount": 200000, "sender_name": "Mona"}), 200)

	got := decodeInto[reportResponse](t, adminDo(t, s, "GET", "/reports?year=2027", nil))
	if got.Year != 2027 || len(got.Months) != 12 || got.ActiveUnits < 1 {
		t.Fatalf("report = %+v", got)
	}
	jun, jul, aug := got.Months[5], got.Months[6], got.Months[7]
	if jun.Month != "2027-06" || jun.Nights != 2 || jun.Revenue != 400000 || jun.BlockedNights != 4 ||
		jun.AvailableNights != got.ActiveUnits*30-4 {
		t.Fatalf("june = %+v", jun)
	}
	// Verified on the (frozen) app clock, 1 May 2027.
	if got.Months[4].Collected != 200000 {
		t.Fatalf("may = %+v", got.Months[4])
	}
	if jul.Nights != 1 || jul.Revenue != 200000 || aug.Nights != 0 || aug.Revenue != 0 {
		t.Fatalf("july = %+v, august = %+v", jul, aug)
	}
	for _, u := range got.Units {
		if u.ID == unit.ID && (u.Nights != 3 || u.Revenue != 600000 || u.BlockedNights != 4 || u.AvailableNights != 365-4) {
			t.Fatalf("unit = %+v", u)
		}
	}

	// Bookings count in the month they were made (the database clock).
	thisYear := decodeInto[reportResponse](t, adminDo(t, s, "GET", "/reports?year="+time.Now().Format("2006"), nil))
	var made int64
	for _, m := range thisYear.Months {
		made += m.BookingsMade
	}
	if made != 2 {
		t.Fatalf("bookings made %d", made)
	}

	expectStatus(t, adminDo(t, s, "GET", "/reports?year=nope", nil), 400)
}
