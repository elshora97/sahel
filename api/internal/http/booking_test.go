package http

import (
	"context"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

// captureSMS records every message instead of sending it.
type captureSMS struct {
	mu   sync.Mutex
	last map[string]string
}

func (c *captureSMS) Send(_ context.Context, to, text string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.last[to] = text
	return nil
}

func (c *captureSMS) code(to string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return regexp.MustCompile(`\d{6}`).FindString(c.last[to])
}

func guestDo(t *testing.T, s *Server, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.RemoteAddr = "203.0.113.7:5000"
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	return rec
}

func signIn(t *testing.T, s *Server, sms *captureSMS, phone string) string {
	t.Helper()
	expectStatus(t, guestDo(t, s, "POST", "/auth/otp/request", "", `{"phone":"`+phone+`"}`), 200)
	norm := "+20" + strings.TrimPrefix(phone, "0")
	rec := guestDo(t, s, "POST", "/auth/otp/verify", "", `{"phone":"`+phone+`","code":"`+sms.code(norm)+`"}`)
	expectStatus(t, rec, 200)
	return decodeInto[struct {
		Token string `json:"token"`
	}](t, rec).Token
}

func newGuestServer(t *testing.T) (*Server, *captureSMS) {
	t.Helper()
	s, pool, _ := newAdminServer(t)
	sms := &captureSMS{last: map[string]string{}}
	WithGuests("guest-secret", sms)(s)
	mustExec(t, pool, catalogSeedSQL)
	mustExec(t, pool, `UPDATE units SET nightly_price = 200000, max_guests = 4, buffer_days = 1 WHERE slug = 'u1'`)
	freezeNow(t, time.Date(2027, 5, 1, 12, 0, 0, 0, pricing.Cairo))
	return s, sms
}

func TestOTP_WrongCodesBurnTheCodeAndRateLimits(t *testing.T) {
	s, sms := newGuestServer(t)
	expectStatus(t, guestDo(t, s, "POST", "/auth/otp/request", "", `{"phone":"0101234"}`), 422)
	expectStatus(t, guestDo(t, s, "POST", "/auth/otp/request", "", `{"phone":"010 1234 5678"}`), 200)
	good := sms.code("+201012345678")
	for i := 0; i < 5; i++ {
		rec := guestDo(t, s, "POST", "/auth/otp/verify", "", `{"phone":"01012345678","code":"000000"}`)
		if good == "000000" {
			t.Skip("random code happened to be 000000")
		}
		expectStatus(t, rec, 422)
	}
	// Five wrong tries burn the code: even the right one no longer works.
	expectStatus(t, guestDo(t, s, "POST", "/auth/otp/verify", "", `{"phone":"01012345678","code":"`+good+`"}`), 422)

	expectStatus(t, guestDo(t, s, "POST", "/auth/otp/request", "", `{"phone":"01012345678"}`), 200)
	expectStatus(t, guestDo(t, s, "POST", "/auth/otp/request", "", `{"phone":"01012345678"}`), 200)
	rec := guestDo(t, s, "POST", "/auth/otp/request", "", `{"phone":"01012345678"}`)
	expectStatus(t, rec, 429)
}

func TestBooking_FlowOverlapBufferAccessAndCancel(t *testing.T) {
	s, sms := newGuestServer(t)
	body := `{"unit_slug":"u1","check_in":"2027-06-10","check_out":"2027-06-13","guests":2}`

	expectStatus(t, guestDo(t, s, "POST", "/bookings", "", body), 401)
	token := signIn(t, s, sms, "01012345678")
	rec := guestDo(t, s, "POST", "/bookings", token, body)
	expectStatus(t, rec, 422) // a name is required first
	if errorCode(t, rec) != "name_required" {
		t.Fatalf("code %s", errorCode(t, rec))
	}
	expectStatus(t, guestDo(t, s, "PATCH", "/me", token, `{"name":"  Mona   Ali "}`), 200)

	rec = guestDo(t, s, "POST", "/bookings", token, body)
	expectStatus(t, rec, 201)
	b := decodeInto[db.GetBookingViewRow](t, rec)
	if !regexp.MustCompile(`^BES-[0-9A-HJKMNP-TV-Z]{5}$`).MatchString(b.Ref) || b.Status != "confirmed" ||
		b.Total != 600000 || b.DepositDue != 200000 || b.CustomerName != "Mona Ali" {
		t.Fatalf("booking = %+v", b)
	}

	// Overlap, and the day after check-out (one turnover day), are taken.
	other := signIn(t, s, sms, "01112345678")
	expectStatus(t, guestDo(t, s, "PATCH", "/me", other, `{"name":"Omar"}`), 200)
	for _, dates := range []string{`"check_in":"2027-06-12","check_out":"2027-06-14"`, `"check_in":"2027-06-13","check_out":"2027-06-15"`} {
		rec = guestDo(t, s, "POST", "/bookings", other, `{"unit_slug":"u1",`+dates+`,"guests":2}`)
		expectStatus(t, rec, 409)
	}
	expectStatus(t, guestDo(t, s, "POST", "/bookings", other, `{"unit_slug":"u1","check_in":"2027-06-14","check_out":"2027-06-16","guests":2}`), 201)

	rec = guestDo(t, s, "GET", "/units/u1/availability?from=2027-06-09&to=2027-06-14", "", "")
	days := decodeInto[[]calendarDay](t, rec)
	states := []string{}
	for _, d := range days {
		states = append(states, d.State)
	}
	if strings.Join(states, ",") != "free,blocked,blocked,blocked,blocked,blocked" {
		t.Fatalf("states = %v", states)
	}

	// Access: owner yes, other guest no, reference + last 4 digits yes.
	expectStatus(t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""), 200)
	expectStatus(t, guestDo(t, s, "GET", "/bookings/"+b.Ref, other, ""), 404)
	expectStatus(t, guestDo(t, s, "GET", "/bookings/"+b.Ref+"?phone_last4=5678", "", ""), 200)
	expectStatus(t, guestDo(t, s, "GET", "/bookings/"+b.Ref+"?phone_last4=0000", "", ""), 404)
	rec = guestDo(t, s, "GET", "/me/bookings", token, "")
	if n := len(decodeInto[[]db.ListCustomerBookingsRow](t, rec)); n != 1 {
		t.Fatalf("my bookings = %d", n)
	}

	// Admin cancel frees the dates.
	rec = adminDo(t, s, "GET", "/bookings?q="+b.Ref, nil)
	if n := len(decodeInto[[]db.AdminListBookingsRow](t, rec)); n != 1 {
		t.Fatalf("admin search = %d", n)
	}
	expectStatus(t, adminDo(t, s, "POST", "/bookings/"+uuidString(b.ID)+"/cancel", map[string]any{"reason": "guest called"}), 200)
	expectStatus(t, adminDo(t, s, "POST", "/bookings/"+uuidString(b.ID)+"/cancel", map[string]any{}), 409)
	expectStatus(t, guestDo(t, s, "POST", "/bookings", other, body), 201)
}
