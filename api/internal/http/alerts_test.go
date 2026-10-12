package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sahel/api/internal/telegram"
)

// recordAlerts is an Alerter that keeps every alert for the test to read.
// err, when set, is returned from every Alert call.
type recordAlerts struct {
	ch  chan string
	err error
}

func newRecordAlerts(err error) *recordAlerts {
	return &recordAlerts{ch: make(chan string, 16), err: err}
}

func (r *recordAlerts) Alert(_ context.Context, subject, body string) error {
	r.ch <- subject + "\n" + body
	return r.err
}

// next waits for the next alert; alerts are sent in the background.
func (r *recordAlerts) next(t *testing.T) string {
	t.Helper()
	select {
	case m := <-r.ch:
		return m
	case <-time.After(5 * time.Second):
		t.Fatal("no alert arrived")
		return ""
	}
}

// none checks that no alert arrives within a short grace period.
func (r *recordAlerts) none(t *testing.T) {
	t.Helper()
	select {
	case m := <-r.ch:
		t.Fatalf("unexpected alert:\n%s", m)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestMailAlerter_SendsToTheAddress(t *testing.T) {
	mail := &captureMail{}
	if err := (MailAlerter{Sender: mail, To: "owner@example.com"}).Alert(context.Background(), "Subject", "body"); err != nil {
		t.Fatal(err)
	}
	if mail.count() != 1 || mail.sent[0] != "owner@example.com|Subject" {
		t.Fatalf("sent = %v", mail.sent)
	}
}

func TestTelegramAlerter_SubjectThenBody(t *testing.T) {
	var text string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Text string `json:"text"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		text = body.Text
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	a := TelegramAlerter{Client: telegram.Client{Token: "t", ChatIDs: []string{"1"}, BaseURL: srv.URL}}
	if err := a.Alert(context.Background(), "Subject", "line 1\nline 2\n"); err != nil {
		t.Fatal(err)
	}
	if text != "Subject\nline 1\nline 2\n" {
		t.Fatalf("text = %q", text)
	}
}

func TestAlerts_NewBookingFromWebsiteAndDashboard(t *testing.T) {
	s := newGuestServer(t) // today is 2027-05-01; u1 is 2000 EGP a night
	alerts := newRecordAlerts(nil)
	WithAlerts("https://sahel.example/", alerts)(s)

	token := register(t, s, "01012345678", "Mona Ali")
	b := book(t, s, token, "2027-06-10", "2027-06-13")
	m := alerts.next(t)
	for _, want := range []string{
		"New booking " + b.Ref + " (website)",
		"Guest: Mona Ali (+201012345678)",
		"Dates: 2027-06-10 → 2027-06-13 (3 nights)",
		"Total: 6000 EGP",
		"https://sahel.example/ar/dashboard/bookings/" + uuidString(b.ID),
	} {
		if !strings.Contains(m, want) {
			t.Errorf("website alert lacks %q:\n%s", want, m)
		}
	}

	unit := timelineUnitBySlug(t, s, "2027-06-01", "u1")
	manual := map[string]any{"unit_id": unit.ID, "check_in": "2027-07-01", "check_out": "2027-07-03",
		"guests": 2, "phone": "01112345678", "name": "Omar Said", "nightly_price": 0}
	expectStatus(t, adminDo(t, s, "POST", "/bookings", manual), 201)
	if m := alerts.next(t); !strings.Contains(m, "(dashboard)") || !strings.Contains(m, "Omar Said") {
		t.Errorf("dashboard alert:\n%s", m)
	}

	// A booking that fails alerts nobody.
	expectStatus(t, adminDo(t, s, "POST", "/bookings", manual), 409)
	alerts.none(t)
}

func TestAlerts_FailingChannelNeverFailsTheRequest(t *testing.T) {
	s := newGuestServer(t)
	alerts := newRecordAlerts(errors.New("telegram is down"))
	WithAlerts("", alerts)(s)

	token := register(t, s, "01012345678", "Mona Ali")
	book(t, s, token, "2027-06-10", "2027-06-13") // asserts 201
	if m := alerts.next(t); strings.Contains(m, "http") {
		t.Errorf("WEB_URL is unset, yet the alert has a link:\n%s", m)
	}
}
