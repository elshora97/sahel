package http

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
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

func TestPricing_UnitPriceAvailabilityAndQuote(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	unitID := idOf(t, pool, "units", "slug='u1'")
	freezeNow(t, time.Date(2027, 5, 1, 12, 0, 0, 0, pricing.Cairo))

	// Unpriced unit: nothing is bookable.
	rec := publicDo(t, s, "GET", "/units/u1/availability?from=2027-06-01&to=2027-06-01", "")
	expectStatus(t, rec, 200)
	if d := decodeInto[[]calendarDay](t, rec)[0]; d.State != "blocked" || d.Price != nil {
		t.Fatalf("unpriced day = %+v", d)
	}
	rec = publicDo(t, s, "POST", "/units/u1/quote", `{"check_in":"2027-06-10","check_out":"2027-06-12","guests":2}`)
	expectStatus(t, rec, 422)
	if got := errorCode(t, rec); got != "unavailable" {
		t.Fatalf("unpriced quote code %q", got)
	}

	// 2000 EGP a night; the guest pays exactly that per night.
	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+unitID, map[string]any{
		"nightly_price": 200000, "max_guests": 4,
	}), 200)
	rec = publicDo(t, s, "GET", "/units/u1/availability?from=2027-04-30&to=2027-06-01", "")
	days := decodeInto[[]calendarDay](t, rec)
	if days[0].State != "past" || days[len(days)-1].State != "free" || *days[len(days)-1].Price != 200000 {
		t.Fatalf("availability = %+v … %+v", days[0], days[len(days)-1])
	}

	// A one-night stay on any weekday is fine.
	rec = publicDo(t, s, "POST", "/units/u1/quote", `{"check_in":"2027-06-08","check_out":"2027-06-09","guests":4}`)
	expectStatus(t, rec, 200)
	if b := decodeInto[pricing.Breakdown](t, rec); b.Total != 200000 || b.NightCount != 1 || b.DepositDue != 200000 {
		t.Fatalf("quote = %+v", b)
	}
	rec = publicDo(t, s, "POST", "/units/u1/quote", `{"check_in":"2027-06-10","check_out":"2027-06-12","guests":9}`)
	expectStatus(t, rec, 422)
	if got := errorCode(t, rec); got != "invalid_range" {
		t.Fatalf("too many guests code %q", got)
	}

	// The search row carries the price.
	rec = publicDo(t, s, "GET", "/units?compound=hac", "")
	if !strings.Contains(rec.Body.String(), `"from_price":200000`) {
		t.Fatalf("search = %s", rec.Body.String())
	}
}
