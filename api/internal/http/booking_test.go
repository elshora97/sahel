package http

import (
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

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

func tokenOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	return decodeInto[struct {
		Token string `json:"token"`
	}](t, rec).Token
}

func register(t *testing.T, s *Server, phone, name string) string {
	t.Helper()
	rec := guestDo(t, s, "POST", "/auth/register", "", `{"phone":"`+phone+`","name":"`+name+`","password":"sea-breeze-2027"}`)
	expectStatus(t, rec, 201)
	return tokenOf(t, rec)
}

func newGuestServer(t *testing.T) *Server {
	t.Helper()
	s, pool, _ := newAdminServer(t)
	WithGuests("guest-secret")(s)
	mustExec(t, pool, catalogSeedSQL)
	mustExec(t, pool, `UPDATE units SET nightly_price = 200000, max_guests = 4, buffer_days = 1 WHERE slug = 'u1'`)
	freezeNow(t, time.Date(2027, 5, 1, 12, 0, 0, 0, pricing.Cairo))
	return s
}

func TestGuestAccounts_RegisterLoginAndLimits(t *testing.T) {
	s := newGuestServer(t)
	cases := map[string]string{
		`{"phone":"0101234","name":"Mona","password":"sea-breeze-2027"}`:  "invalid_phone",
		`{"phone":"01012345678","name":"M","password":"sea-breeze-2027"}`: "invalid_name",
		`{"phone":"01012345678","name":"Mona","password":"short"}`:        "weak_password",
	}
	for body, code := range cases {
		rec := guestDo(t, s, "POST", "/auth/register", "", body)
		expectStatus(t, rec, 422)
		if errorCode(t, rec) != code {
			t.Errorf("%s: code %s, want %s", body, errorCode(t, rec), code)
		}
	}

	rec := guestDo(t, s, "POST", "/auth/register", "", `{"phone":"010 1234 5678","name":"  Mona   Ali ","password":"sea-breeze-2027"}`)
	expectStatus(t, rec, 201)
	if strings.Contains(rec.Body.String(), "password") || !strings.Contains(rec.Body.String(), `"name":"Mona Ali"`) {
		t.Fatalf("register response = %s", rec.Body.String())
	}
	rec = guestDo(t, s, "POST", "/auth/register", "", `{"phone":"01012345678","name":"Someone","password":"another-pass"}`)
	expectStatus(t, rec, 409)

	expectStatus(t, guestDo(t, s, "POST", "/auth/login", "", `{"phone":"+201012345678","password":"sea-breeze-2027"}`), 200)
	for _, body := range []string{`{"phone":"01012345678","password":"wrong-pass"}`, `{"phone":"01099999999","password":"sea-breeze-2027"}`, `{"phone":"nope","password":"x"}`} {
		rec = guestDo(t, s, "POST", "/auth/login", "", body)
		expectStatus(t, rec, 401)
		if errorCode(t, rec) != "invalid_credentials" {
			t.Fatalf("%s: %s", body, errorCode(t, rec))
		}
	}

	// Ten failures on one phone lock it for a while, even with the right password.
	for i := 0; i < 9; i++ {
		guestDo(t, s, "POST", "/auth/login", "", `{"phone":"01012345678","password":"wrong-pass"}`)
	}
	expectStatus(t, guestDo(t, s, "POST", "/auth/login", "", `{"phone":"01012345678","password":"sea-breeze-2027"}`), 429)
}

func TestBooking_FlowOverlapBufferAccessAndCancel(t *testing.T) {
	s := newGuestServer(t)
	body := `{"unit_slug":"u1","check_in":"2027-06-10","check_out":"2027-06-13","guests":2}`

	expectStatus(t, guestDo(t, s, "POST", "/bookings", "", body), 401)
	token := register(t, s, "01012345678", "Mona Ali")

	rec := guestDo(t, s, "POST", "/bookings", token, body)
	expectStatus(t, rec, 201)
	b := decodeInto[db.GetBookingViewRow](t, rec)
	if !regexp.MustCompile(`^BES-[0-9A-HJKMNP-TV-Z]{5}$`).MatchString(b.Ref) || b.Status != "pending_payment" || !b.HoldExpiresAt.Valid ||
		b.Total != 600000 || b.DepositDue != 200000 || b.CustomerName != "Mona Ali" {
		t.Fatalf("booking = %+v", b)
	}

	// Overlap, and the day after check-out (one turnover day), are taken.
	other := register(t, s, "01112345678", "Omar")
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

	// Admin: find it, reset the guest's password, cancel it.
	rec = adminDo(t, s, "GET", "/bookings?q="+b.Ref, nil)
	if n := len(decodeInto[[]db.AdminListBookingsRow](t, rec)); n != 1 {
		t.Fatalf("admin search = %d", n)
	}
	expectStatus(t, adminDo(t, s, "POST", "/customers/"+uuidString(b.CustomerID)+"/password", map[string]any{"password": "new-password-1"}), 204)
	expectStatus(t, guestDo(t, s, "POST", "/auth/login", "", `{"phone":"01012345678","password":"new-password-1"}`), 200)
	expectStatus(t, adminDo(t, s, "POST", "/bookings/"+uuidString(b.ID)+"/cancel", map[string]any{"reason": "guest called"}), 200)
	expectStatus(t, adminDo(t, s, "POST", "/bookings/"+uuidString(b.ID)+"/cancel", map[string]any{}), 409)
	expectStatus(t, guestDo(t, s, "POST", "/bookings", other, body), 201)
}
