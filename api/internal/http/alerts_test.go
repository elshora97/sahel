package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
