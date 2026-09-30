package http

import (
	"strings"
	"testing"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
)

// mustCairo is noon on a YYYY-MM-DD day in Cairo.
func mustCairo(t *testing.T, day string) time.Time {
	t.Helper()
	d, err := time.ParseInLocation(pricing.DateLayout, day, pricing.Cairo)
	if err != nil {
		t.Fatal(err)
	}
	return d.Add(12 * time.Hour)
}

type timelineResponse struct {
	From  string         `json:"from"`
	Days  int            `json:"days"`
	Units []timelineUnit `json:"units"`
}

func timelineUnitBySlug(t *testing.T, s *Server, from, slug string) timelineUnit {
	t.Helper()
	rec := adminDo(t, s, "GET", "/timeline?from="+from+"&days=14", nil)
	expectStatus(t, rec, 200)
	for _, u := range decodeInto[timelineResponse](t, rec).Units {
		if u.Slug == slug {
			return u
		}
	}
	t.Fatalf("unit %s missing from the timeline", slug)
	return timelineUnit{}
}

func TestBlocks_CloseNightsToGuestsAndClashWithBookings(t *testing.T) {
	s := newGuestServer(t) // today is 2027-05-01 in Cairo
	unit := timelineUnitBySlug(t, s, "2027-06-01", "u1")
	blocks := "/units/" + unit.ID + "/blocks"

	for body, code := range map[string]string{
		`{"start":"2027-06-10","end":"2027-06-10"}`: "invalid_range",
		`{"start":"2027-06-12","end":"2027-06-10"}`: "invalid_range",
		`{"start":"2027-06-01","end":"2028-06-01"}`: "invalid_range",
	} {
		rec := adminDo(t, s, "POST", blocks, body)
		expectStatus(t, rec, 422)
		if errorCode(t, rec) != code {
			t.Fatalf("%s: %s", body, errorCode(t, rec))
		}
	}
	expectStatus(t, adminDo(t, s, "POST", "/units/00000000-0000-4000-8000-000000000000/blocks", map[string]any{"start": "2027-06-10", "end": "2027-06-12"}), 404)

	rec := adminDo(t, s, "POST", blocks, map[string]any{"start": "2027-06-10", "end": "2027-06-12", "note": " Owner staying "})
	expectStatus(t, rec, 201)
	block := decodeInto[blockView](t, rec)
	if block.Note != "Owner staying" || block.Start != "2027-06-10" || block.End != "2027-06-12" {
		t.Fatalf("block = %+v", block)
	}
	expectStatus(t, adminDo(t, s, "POST", blocks, map[string]any{"start": "2027-06-11", "end": "2027-06-13"}), 409)

	// Guests see the nights taken and can't book them; blocks add no turnover day.
	days := decodeInto[[]calendarDay](t, guestDo(t, s, "GET", "/units/u1/availability?from=2027-06-09&to=2027-06-12", "", ""))
	states := []string{}
	for _, d := range days {
		states = append(states, d.State)
	}
	if strings.Join(states, ",") != "free,blocked,blocked,free" {
		t.Fatalf("states = %v", states)
	}
	token := register(t, s, "01012345678", "Mona Ali")
	rec = guestDo(t, s, "POST", "/bookings", token, `{"unit_slug":"u1","check_in":"2027-06-11","check_out":"2027-06-13","guests":2}`)
	expectStatus(t, rec, 409)
	expectStatus(t, guestDo(t, s, "POST", "/bookings", token, `{"unit_slug":"u1","check_in":"2027-06-12","check_out":"2027-06-14","guests":2}`), 201)

	// A block can't cover a booked night.
	rec = adminDo(t, s, "POST", blocks, map[string]any{"start": "2027-06-13", "end": "2027-06-15"})
	expectStatus(t, rec, 409)
	if errorCode(t, rec) != "dates_taken" {
		t.Fatalf("code = %s", errorCode(t, rec))
	}

	// The timeline shows both, then the block goes and its nights reopen.
	unit = timelineUnitBySlug(t, s, "2027-06-01", "u1")
	if len(unit.Blocks) != 1 || len(unit.Bookings) != 1 || unit.Bookings[0].CustomerName != "Mona Ali" {
		t.Fatalf("timeline unit = %+v", unit)
	}
	if u := timelineUnitBySlug(t, s, "2027-07-01", "u1"); len(u.Blocks)+len(u.Bookings) != 0 {
		t.Fatalf("a later range still shows %+v", u)
	}
	expectStatus(t, adminDo(t, s, "DELETE", "/blocks/"+block.ID, nil), 204)
	expectStatus(t, adminDo(t, s, "DELETE", "/blocks/"+block.ID, nil), 404)
	expectStatus(t, guestDo(t, s, "POST", "/bookings", token, `{"unit_slug":"u1","check_in":"2027-06-10","check_out":"2027-06-11","guests":2}`), 201)

	expectStatus(t, adminDo(t, s, "GET", "/timeline?from=2027-06-01&days=40", nil), 400)
	expectStatus(t, adminDo(t, s, "GET", "/timeline?from=June", nil), 400)
}

func TestToday_ArrivalsDeparturesAndOccupancy(t *testing.T) {
	s := newGuestServer(t) // today is 2027-05-01 in Cairo
	token := register(t, s, "01012345678", "Mona Ali")
	unit := timelineUnitBySlug(t, s, "2027-05-01", "u1")

	// A two-night stay from the 3rd, and a two-night block later that week;
	// the clock then moves to the arrival and departure days.
	expectStatus(t, guestDo(t, s, "POST", "/bookings", token, `{"unit_slug":"u1","check_in":"2027-05-03","check_out":"2027-05-05","guests":2}`), 201)
	expectStatus(t, adminDo(t, s, "POST", "/units/"+unit.ID+"/blocks", map[string]any{"start": "2027-05-07", "end": "2027-05-09"}), 201)

	type today struct {
		Today          string     `json:"today"`
		Arrivals       []movement `json:"arrivals"`
		Departures     []movement `json:"departures"`
		StayingTonight int64      `json:"staying_tonight"`
		HoldsExpiring  int64      `json:"holds_expiring"`
		OccupiedNights int64      `json:"occupied_nights"`
		WeekNights     int64      `json:"week_nights"`
	}
	freezeNow(t, mustCairo(t, "2027-05-03"))
	got := decodeInto[today](t, adminDo(t, s, "GET", "/today", nil))
	if got.Today != "2027-05-03" || len(got.Arrivals) != 1 || len(got.Departures) != 0 || got.Arrivals[0].CustomerName != "Mona Ali" ||
		got.Arrivals[0].Nights != 2 || got.StayingTonight != 1 {
		t.Fatalf("today = %+v", got)
	}
	// Nights 3, 4 booked and 7, 8 blocked all fall in the week from the 3rd.
	if got.OccupiedNights != 4 || got.WeekNights == 0 {
		t.Fatalf("occupancy = %d of %d", got.OccupiedNights, got.WeekNights)
	}

	freezeNow(t, mustCairo(t, "2027-05-05"))
	got = decodeInto[today](t, adminDo(t, s, "GET", "/today", nil))
	if len(got.Arrivals) != 0 || len(got.Departures) != 1 || got.StayingTonight != 0 {
		t.Fatalf("departure day = %+v", got)
	}
}
