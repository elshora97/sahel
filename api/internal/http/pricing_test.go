package http

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

// publicDo sends an unauthenticated request under /api/v1.
func publicDo(t *testing.T, s *Server, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	return rec
}

func freezeNow(t *testing.T, at time.Time) {
	t.Helper()
	prev := now
	now = func() time.Time { return at }
	t.Cleanup(func() { now = prev })
}

func calendarOf(t *testing.T, s *Server, unitID, from, to string) map[string]db.ListCalendarRow {
	t.Helper()
	rec := adminDo(t, s, "GET", "/units/"+unitID+"/calendar?from="+from+"&to="+to, nil)
	expectStatus(t, rec, 200)
	out := map[string]db.ListCalendarRow{}
	for _, r := range decodeInto[[]db.ListCalendarRow](t, rec) {
		out[r.Date.Format(pricing.DateLayout)] = r
	}
	return out
}

func TestPricing_SeasonsCalendarAndQuote(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	unitID := idOf(t, pool, "units", "slug='u1'")
	freezeNow(t, time.Date(2027, 5, 1, 12, 0, 0, 0, pricing.Cairo))
	mustExec(t, pool, `UPDATE units SET base_guests = 2, max_guests = 4, cleaning_fee = 50000 WHERE slug = 'u1'`)

	// Off season 2000 EGP (2 nights), then a July peak 4000 EGP (3 nights).
	rec := adminDo(t, s, "POST", "/units/"+unitID+"/seasons", map[string]any{
		"name_ar": "عادي", "name_en": "Off", "start_date": "2027-06-01", "end_date": "2027-06-30",
		"nightly_price": 200000, "min_nights": 2,
	})
	expectStatus(t, rec, 201)
	rec = adminDo(t, s, "POST", "/units/"+unitID+"/seasons", map[string]any{
		"name_ar": "ذروة", "name_en": "Peak", "start_date": "2027-07-01", "end_date": "2027-07-31",
		"nightly_price": 400000, "min_nights": 3, "allowed_checkin_days": []int{0, 4, 5},
	})
	expectStatus(t, rec, 201)
	peakID := uuidString(decodeInto[db.Season](t, rec).ID)

	cal := calendarOf(t, s, unitID, "2027-06-29", "2027-07-02")
	if len(cal) != 4 || cal["2027-07-01"].Price != 400000 || cal["2027-06-30"].Price != 200000 {
		t.Fatalf("calendar = %+v", cal)
	}

	// A manual price survives a season edit; reset brings the rule back.
	rec = adminDo(t, s, "POST", "/units/"+unitID+"/calendar", map[string]any{
		"from": "2027-07-02", "to": "2027-07-02", "action": "override", "price": 999900, "note": "festival",
	})
	expectStatus(t, rec, 200)
	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+unitID+"/seasons/"+peakID, map[string]any{"nightly_price": 450000}), 200)
	cal = calendarOf(t, s, unitID, "2027-07-01", "2027-07-02")
	if cal["2027-07-01"].Price != 450000 || cal["2027-07-02"].Price != 999900 || cal["2027-07-02"].Source != "manual" {
		t.Fatalf("after edit = %+v", cal)
	}
	expectStatus(t, adminDo(t, s, "POST", "/units/"+unitID+"/calendar", map[string]any{
		"from": "2027-07-02", "to": "2027-07-02", "action": "reset",
	}), 200)
	if c := calendarOf(t, s, unitID, "2027-07-02", "2027-07-02")["2027-07-02"]; c.Price != 450000 || c.Source != "rule" {
		t.Fatalf("after reset = %+v", c)
	}

	// Public availability: uncovered dates are blocked, blocked dates stay blocked.
	expectStatus(t, adminDo(t, s, "POST", "/units/"+unitID+"/calendar", map[string]any{
		"from": "2027-06-15", "to": "2027-06-15", "action": "block",
	}), 200)
	rec = publicDo(t, s, "GET", "/units/u1/availability?from=2027-05-31&to=2027-06-15", "")
	expectStatus(t, rec, 200)
	days := decodeInto[[]availabilityDay](t, rec)
	if days[0].State != "blocked" || days[0].Price != nil || days[1].State != "free" || days[15].State != "blocked" {
		t.Fatalf("availability = %+v", days)
	}

	// Quotes: a good one, then each failure surfaces as 422 with its code.
	rec = publicDo(t, s, "POST", "/units/u1/quote", `{"check_in":"2027-07-01","check_out":"2027-07-04","guests":2}`)
	expectStatus(t, rec, 200)
	if b := decodeInto[pricing.Breakdown](t, rec); b.Total != 3*450000+50000 || b.NightCount != 3 {
		t.Fatalf("quote = %+v", b)
	}
	for body, want := range map[string]string{
		`{"check_in":"2027-06-30","check_out":"2027-07-02","guests":2}`: "min_nights",
		`{"check_in":"2027-07-06","check_out":"2027-07-10","guests":2}`: "checkin_day",
		`{"check_in":"2027-06-14","check_out":"2027-06-16","guests":2}`: "unavailable",
		`{"check_in":"2027-06-10","check_out":"2027-06-12","guests":9}`: "invalid_range",
	} {
		rec = publicDo(t, s, "POST", "/units/u1/quote", body)
		expectStatus(t, rec, 422)
		if got := errorCode(t, rec); got != want {
			t.Errorf("%s: code %q, want %q", body, got, want)
		}
	}

	// The search row carries the lowest future price.
	rec = publicDo(t, s, "GET", "/units?compound=hac", "")
	if !strings.Contains(rec.Body.String(), `"from_price":200000`) {
		t.Fatalf("search = %s", rec.Body.String())
	}

	// Deleting the peak season leaves July uncovered.
	expectStatus(t, adminDo(t, s, "DELETE", "/units/"+unitID+"/seasons/"+peakID, nil), 204)
	if cal := calendarOf(t, s, unitID, "2027-07-01", "2027-07-31"); len(cal) != 0 {
		t.Fatalf("july after delete = %d rows", len(cal))
	}
}
