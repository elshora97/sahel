# Telegram Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the owner a Telegram message when a booking is created (website or dashboard) and when a guest uploads a payment receipt.

**Architecture:** A small `telegram` package posts plain text to the Bot API. In `internal/http`, an `Alerter` interface replaces the hard-wired mailer. Email and Telegram are two adapters, and `s.alert` fans out to each in a background goroutine, so a failing channel never touches the HTTP response. `alertNewBooking` is new and runs after both booking handlers. `alertNewReceipt` moves onto the same path.

**Tech Stack:** Go 1.23, chi, pgx/sqlc, zerolog, testcontainers (Postgres) for handler tests.

**Spec:** `docs/superpowers/specs/2026-10-12-telegram-alerts-design.md`

---

## Running Go here

Go is not installed on the host. Run every test in a container. Define this once per Git Bash session, from the repo root `D:\Projects\sahel\sahel`:

```bash
gotest() {
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/repo -v sahel_gomod:/go/pkg/mod \
    -v //var/run/docker.sock:/var/run/docker.sock \
    -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -e GOFLAGS=-buildvcs=false \
    -w /repo/api golang:1.23-alpine go "$@"
}
```

`gotest test ./internal/config/` runs `go test` inside the container, and `gotest vet ./...` runs `go vet`. Handler tests start a Postgres via testcontainers. Docker Desktop must be running, otherwise they **skip** rather than fail, so check for `--- SKIP` in the output.

## File map

| File | Change |
|---|---|
| `api/internal/telegram/telegram.go` | **New.** `Client.Send`. |
| `api/internal/telegram/telegram_test.go` | **New.** |
| `api/internal/config/config.go` | Adds `TelegramToken`, `TelegramChatIDs`, `WebURL`, and the both-or-neither check. |
| `api/internal/config/config_test.go` | Adds 3 tests. |
| `api/internal/http/alerts.go` | **New.** `Alerter`, `MailAlerter`, `TelegramAlerter`, `WithAlerts`, `s.alert`, `dashboardLink`, `alertNewBooking`, `alertNewReceipt` (moved). |
| `api/internal/http/alerts_test.go` | **New.** |
| `api/internal/http/router.go` | `Server` fields; `WithPayments(hold)`. |
| `api/internal/http/payments.go` | Deletes `alertNewReceipt` (moved). |
| `api/internal/http/payments_test.go` | Uses the recording alerter. |
| `api/internal/http/bookings.go`, `admin_manual_booking.go` | Call `s.alertNewBooking(view)`. |
| `api/cmd/api/main.go` | Builds the alerter list. |
| `.env.example`, `infra/docker-compose.yml`, `render.yaml` | New variables. |
| `docs/deploy-free.md`, `docs/user-manual-ar.md` | Setup instructions. |

---

### Task 1: `telegram` client

**Files:**
- Create: `api/internal/telegram/telegram.go`
- Test: `api/internal/telegram/telegram_test.go`

- [ ] **Step 1: Write the failing tests**

`api/internal/telegram/telegram_test.go`:

```go
package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const token = "123456:secret-token"

func TestSend_PostsPlainTextToEveryChat(t *testing.T) {
	var paths []string
	var bodies []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		paths = append(paths, r.Method+" "+r.URL.Path)
		bodies = append(bodies, body)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := Client{Token: token, ChatIDs: []string{"111", "-222"}, BaseURL: srv.URL}
	text := "حجز جديد <b>&\nline 2"
	if err := c.Send(context.Background(), text); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(bodies) != 2 {
		t.Fatalf("requests = %d, want 2", len(bodies))
	}
	for i, id := range []string{"111", "-222"} {
		if paths[i] != "POST /bot"+token+"/sendMessage" {
			t.Errorf("path = %s", paths[i])
		}
		b := bodies[i]
		if b["chat_id"] != id || b["text"] != text || b["disable_web_page_preview"] != true {
			t.Errorf("body = %v", b)
		}
		if _, ok := b["parse_mode"]; ok {
			t.Errorf("parse_mode must be absent so text needs no escaping: %v", b)
		}
	}
}

func TestSend_ErrorNamesTelegramsReasonAndTriesEveryChat(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"ok":false,"description":"Bad Request: chat not found"}`))
	}))
	defer srv.Close()

	err := Client{Token: token, ChatIDs: []string{"1", "2"}, BaseURL: srv.URL}.Send(context.Background(), "hi")
	if err == nil || !strings.Contains(err.Error(), "chat not found") {
		t.Fatalf("err = %v", err)
	}
	if strings.Contains(err.Error(), token) {
		t.Fatalf("error leaks the token: %v", err)
	}
	if calls != 2 {
		t.Fatalf("calls = %d, want 2: one failing chat must not stop the others", calls)
	}
}

func TestSend_NetworkErrorHidesToken(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close() // nothing listens there now

	err := Client{Token: token, ChatIDs: []string{"1"}, BaseURL: url}.Send(context.Background(), "hi")
	if err == nil {
		t.Fatal("want an error from a closed server")
	}
	if strings.Contains(err.Error(), token) {
		t.Fatalf("error leaks the token: %v", err)
	}
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `gotest test ./internal/telegram/`
Expected: FAIL, because `Client` is undefined.

- [ ] **Step 3: Implement**

`api/internal/telegram/telegram.go`:

```go
// Package telegram sends plain-text messages through the Telegram Bot API.
// The bot token is part of every request URL, so no error from here ever
// contains a URL.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.telegram.org"

type Client struct {
	Token   string
	ChatIDs []string
	BaseURL string       // empty means api.telegram.org; tests point it at httptest
	HTTP    *http.Client // nil means a client with a 10s timeout
}

// Send delivers text to every chat. One failing chat does not stop the
// others; the errors are joined.
func (c Client) Send(ctx context.Context, text string) error {
	var errs []error
	for _, id := range c.ChatIDs {
		if err := c.send(ctx, id, text); err != nil {
			errs = append(errs, fmt.Errorf("telegram chat %s: %w", id, err))
		}
	}
	return errors.Join(errs...)
}

func (c Client) send(ctx context.Context, chatID, text string) error {
	// No parse_mode: plain text, so names and Arabic need no escaping.
	body, err := json.Marshal(map[string]any{"chat_id": chatID, "text": text, "disable_web_page_preview": true})
	if err != nil {
		return err
	}
	base := c.BaseURL
	if base == "" {
		base = defaultBaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(base, "/")+"/bot"+c.Token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return errors.New("build request") // err would quote the URL
	}
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		// *url.Error repeats the URL; keep only what went wrong.
		var ue *url.Error
		if errors.As(err, &ue) {
			return ue.Err
		}
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 == 2 {
		return nil
	}
	var out struct {
		Description string `json:"description"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&out)
	return fmt.Errorf("status %d: %s", resp.StatusCode, out.Description)
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `gotest test ./internal/telegram/ -v`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add api/internal/telegram
git commit -m "feat(api): telegram client for plain-text alerts"
```

---

### Task 2: Configuration

**Files:**
- Modify: `api/internal/config/config.go`
- Test: `api/internal/config/config_test.go`

- [ ] **Step 1: Write the failing tests**

Append to `api/internal/config/config_test.go`, and add `"reflect"` to its imports:

```go
func TestLoad_TelegramAndWebURL(t *testing.T) {
	setValidEnv(t)
	t.Setenv("TELEGRAM_BOT_TOKEN", "123:abc")
	t.Setenv("TELEGRAM_CHAT_ID", " 111 , -222,")
	t.Setenv("WEB_URL", "https://sahel.vercel.app/")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.TelegramToken != "123:abc" || !reflect.DeepEqual(c.TelegramChatIDs, []string{"111", "-222"}) {
		t.Fatalf("telegram = %q %q", c.TelegramToken, c.TelegramChatIDs)
	}
	if c.WebURL != "https://sahel.vercel.app" {
		t.Fatalf("WebURL = %q, want no trailing slash", c.WebURL)
	}
}

func TestLoad_TelegramOffByDefault(t *testing.T) {
	setValidEnv(t)
	t.Setenv("TELEGRAM_BOT_TOKEN", "")
	t.Setenv("TELEGRAM_CHAT_ID", "")
	c, err := Load()
	if err != nil || c.TelegramToken != "" || len(c.TelegramChatIDs) != 0 {
		t.Fatalf("got %q %q, err %v", c.TelegramToken, c.TelegramChatIDs, err)
	}
}

// Half a Telegram setup is a typo, not a choice: refuse to start rather
// than silently send nothing.
func TestLoad_TelegramNeedsTokenAndChat(t *testing.T) {
	for _, only := range []string{"TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"} {
		t.Run(only, func(t *testing.T) {
			setValidEnv(t)
			t.Setenv("TELEGRAM_BOT_TOKEN", "")
			t.Setenv("TELEGRAM_CHAT_ID", " , ")
			t.Setenv(only, "123")
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), "TELEGRAM_BOT_TOKEN") {
				t.Fatalf("err = %v", err)
			}
		})
	}
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `gotest test ./internal/config/`
Expected: FAIL to compile with `c.TelegramToken undefined`.

- [ ] **Step 3: Implement**

In `api/internal/config/config.go`, add `"strings"` to the imports, then add these fields after `SMTPHost, ... AlertEmailTo string`:

```go
	// TelegramToken and TelegramChatIDs send the same alerts to Telegram.
	// Both empty: off. One without the other: Load fails.
	TelegramToken   string
	TelegramChatIDs []string

	// WebURL is the public site origin, used for dashboard links in alerts.
	// Optional; no trailing slash.
	WebURL string
```

In the `Config{...}` literal inside `Load`, after `AlertEmailTo: ...`, add:

```go
		TelegramToken:   env("TELEGRAM_BOT_TOKEN", ""),
		WebURL:          strings.TrimRight(env("WEB_URL", ""), "/"),
```

Then insert this immediately before `hold, err := strconv.Atoi(...)`:

```go
	for _, id := range strings.Split(env("TELEGRAM_CHAT_ID", ""), ",") {
		if id = strings.TrimSpace(id); id != "" {
			c.TelegramChatIDs = append(c.TelegramChatIDs, id)
		}
	}
	if (c.TelegramToken == "") != (len(c.TelegramChatIDs) == 0) {
		return c, fmt.Errorf("set both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or neither")
	}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `gotest test ./internal/config/ -v`
Expected: PASS, including the 3 new tests.

- [ ] **Step 5: Commit**

```bash
git add api/internal/config
git commit -m "feat(api): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and WEB_URL settings"
```

---

### Task 3: Alert channels, with the receipt alert moved onto them

**Files:**
- Create: `api/internal/http/alerts.go`
- Create: `api/internal/http/alerts_test.go`
- Modify: `api/internal/http/router.go:13-39`
- Modify: `api/internal/http/payments.go:235-253` (delete `alertNewReceipt`)
- Modify: `api/internal/http/payments_test.go:73-79, 99-121`

- [ ] **Step 1: Write the failing tests**

`api/internal/http/alerts_test.go`:

```go
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
```

In `api/internal/http/payments_test.go`, replace `paymentServer` (lines 73–79) with:

```go
func paymentServer(t *testing.T) (*Server, *recordAlerts) {
	t.Helper()
	s := newGuestServer(t)
	alerts := newRecordAlerts(nil)
	WithPayments(2 * time.Hour)(s)
	WithAlerts("https://sahel.example", alerts)(s)
	expectStatus(t, adminDo(t, s, "PUT", "/settings/instapay", map[string]any{"address": "beetelsahel@instapay", "mobile": "01000000000", "holder_name": "Beet Elsahel"}), 200)
	return s, alerts
}
```

In `TestPayments_UploadVerifyPartialAndReceiptPrivacy`, change `s, mail := paymentServer(t)` to `s, alerts := paymentServer(t)`. Then replace

```go
	time.Sleep(50 * time.Millisecond)
	if mail.count() != 1 {
		t.Fatalf("alert emails = %d", mail.count())
	}
```

with

```go
	alerts.next(t) // the booking alert from book(), checked in alerts_test.go
	receipt := alerts.next(t)
	for _, want := range []string{"New InstaPay receipt", b.Ref, "Sent by: Mona Ali", "https://sahel.example/ar/dashboard/payments"} {
		if !strings.Contains(receipt, want) {
			t.Errorf("receipt alert lacks %q:\n%s", want, receipt)
		}
	}
```

`book()` will only send a booking alert once Task 4 lands. Until then the first `alerts.next` takes the receipt alert and the second times out. That is expected, and Task 4 fixes it. To keep this task green on its own, comment out the `alerts.next(t) // the booking alert...` line now, and Task 4 Step 1 restores it.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `gotest test ./internal/http/ -run 'TestMailAlerter|TestTelegramAlerter|TestPayments_' -v`
Expected: FAIL to compile with `undefined: MailAlerter` and `undefined: WithAlerts`.

- [ ] **Step 3: Implement**

`api/internal/http/alerts.go`:

```go
package http

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/sahel/api/internal/mail"
	"github.com/sahel/api/internal/store/postgres/db"
	"github.com/sahel/api/internal/telegram"
)

// Alerter delivers one alert to one channel: email, Telegram.
type Alerter interface {
	Alert(ctx context.Context, subject, body string) error
}

// MailAlerter emails every alert to one address.
type MailAlerter struct {
	Sender mail.Sender
	To     string
}

func (m MailAlerter) Alert(ctx context.Context, subject, body string) error {
	return m.Sender.Send(ctx, m.To, subject, body)
}

// TelegramAlerter sends each alert as one message: the subject line, then the body.
type TelegramAlerter struct{ Client telegram.Client }

func (t TelegramAlerter) Alert(ctx context.Context, subject, body string) error {
	return t.Client.Send(ctx, subject+"\n"+body)
}

// WithAlerts sends alerts about new bookings and receipts to every channel.
// webURL, when set, adds a dashboard link to each alert.
func WithAlerts(webURL string, alerters ...Alerter) Option {
	return func(s *Server) {
		s.webURL = strings.TrimRight(webURL, "/")
		s.alerters = alerters
	}
}

// alert delivers in the background, one goroutine per channel: a slow or
// failing channel never delays or fails the request behind it.
func (s *Server) alert(ref, subject, body string) {
	for _, a := range s.alerters {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := a.Alert(ctx, subject, body); err != nil {
				s.log.Error().Err(err).Str("ref", ref).Str("channel", fmt.Sprintf("%T", a)).Msg("alert not delivered")
			}
		}()
	}
}

// dashboardLink is a line with a link to path under the dashboard, or ""
// when WEB_URL is unset.
func (s *Server) dashboardLink(path string) string {
	if s.webURL == "" {
		return ""
	}
	return s.webURL + "/ar/dashboard" + path + "\n"
}

func (s *Server) alertNewReceipt(view db.GetBookingViewRow, amount int64, sender string) {
	subject := "إيصال دفع جديد " + view.Ref + " — New InstaPay receipt"
	body := fmt.Sprintf("Booking %s\nGuest: %s (%s)\nUnit: %s\nDates: %s → %s\nAmount stated: %s EGP (deposit due %s EGP)\nSent by: %s\n\nCheck it in the dashboard: Payments.\n",
		view.Ref, view.CustomerName, view.CustomerPhone, view.UnitTitleEn,
		view.CheckIn.Format("2006-01-02"), view.CheckOut.Format("2006-01-02"),
		pounds(amount), pounds(view.DepositDue), sender)
	s.alert(view.Ref, subject, body+s.dashboardLink("/payments"))
}
```

In `api/internal/http/payments.go`, delete the whole `alertNewReceipt` function and its comment (from `// alertNewReceipt emails the admin in the background` through the closing `}` before `func pounds`). Leave the call `s.alertNewReceipt(view, amount, senderName)` in place. `context`, `fmt` and `time` are still used elsewhere in the file.

In `api/internal/http/router.go`:
- Remove the `"github.com/sahel/api/internal/mail"` import.
- In `Server`, replace the two lines `mailer mail.Sender` and `alertTo string` with:

```go
	alerters      []Alerter
	webURL        string
```

- Replace `WithPayments` with:

```go
// WithPayments sets how long unpaid bookings hold their dates.
func WithPayments(hold time.Duration) Option {
	return func(s *Server) { s.hold = hold }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `gotest test ./internal/http/ -run 'TestMailAlerter|TestTelegramAlerter|TestPayments_|TestReports' -v`
Expected: PASS, with no `--- SKIP` lines. `cmd/api` will not compile yet because main.go still calls the old `WithPayments`. Task 5 fixes that, and this command only builds `internal/http`.

- [ ] **Step 5: Commit**

```bash
git add api/internal/http/alerts.go api/internal/http/alerts_test.go api/internal/http/router.go api/internal/http/payments.go api/internal/http/payments_test.go
git commit -m "refactor(api): alerts go through a list of channels"
```

---

### Task 4: Alert on every new booking

**Files:**
- Modify: `api/internal/http/alerts.go` (add `alertNewBooking`)
- Modify: `api/internal/http/bookings.go:~141` and `api/internal/http/admin_manual_booking.go:~168`
- Modify: `api/internal/http/alerts_test.go`, `api/internal/http/payments_test.go`

- [ ] **Step 1: Write the failing tests**

In `api/internal/http/payments_test.go`, uncomment `alerts.next(t) // the booking alert from book(), ...`.

Append to `api/internal/http/alerts_test.go`, and add `"errors"` and `"strings"` to its imports:

```go
func TestAlerts_NewBookingFromWebsiteAndDashboard(t *testing.T) {
	s := newGuestServer(t) // today is 2027-05-01; u1 is 2000 EGP a night
	alerts := newRecordAlerts(nil)
	WithAlerts("https://sahel.example/", alerts)(s)

	token := register(t, s, "01012345678", "Mona Ali")
	b := book(t, s, token, "2027-06-10", "2027-06-13")
	m := alerts.next(t)
	for _, want := range []string{
		"New booking " + b.Ref + " (website)",
		"Guest: Mona Ali (01012345678)",
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `gotest test ./internal/http/ -run 'TestAlerts_|TestPayments_UploadVerify' -v`
Expected: FAIL with `no alert arrived`, because bookings don't alert yet.

- [ ] **Step 3: Implement**

Append to `api/internal/http/alerts.go`:

```go
func (s *Server) alertNewBooking(view db.GetBookingViewRow) {
	from := "website"
	if view.Source == "admin" {
		from = "dashboard"
	}
	nights := int(view.CheckOut.Sub(view.CheckIn).Hours() / 24)
	subject := fmt.Sprintf("🏖 New booking %s (%s)", view.Ref, from)
	body := fmt.Sprintf("Guest: %s (%s)\nUnit: %s\nDates: %s → %s (%d nights)\nGuests: %d\nTotal: %s EGP · deposit due %s EGP\n",
		view.CustomerName, view.CustomerPhone, view.UnitTitleEn,
		view.CheckIn.Format("2006-01-02"), view.CheckOut.Format("2006-01-02"), nights,
		view.Guests, pounds(view.Total), pounds(view.DepositDue))
	s.alert(view.Ref, subject, body+s.dashboardLink("/bookings/"+uuidString(view.ID)))
}
```

In `api/internal/http/bookings.go`, at the end of `createBooking`, change

```go
	writeJSON(w, http.StatusCreated, view)
}
```

to

```go
	s.alertNewBooking(view)
	writeJSON(w, http.StatusCreated, view)
}
```

Make the identical change at the end of `adminCreateBooking` in `api/internal/http/admin_manual_booking.go`. In each file, this is the `writeJSON(w, http.StatusCreated, view)` that directly follows the `GetBookingView` error check.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `gotest test ./internal/http/ -v 2>&1 | grep -E '^(--- |ok|FAIL)'`
Expected: every test PASSES and none SKIP. This is the whole package, since `book()` is used across many tests and a stray alert must not break them.

- [ ] **Step 5: Commit**

```bash
git add api/internal/http
git commit -m "feat(api): alert on every new booking, website or dashboard"
```

---

### Task 5: Wiring and configuration files

**Files:**
- Modify: `api/cmd/api/main.go:57-67`
- Modify: `.env.example`, `infra/docker-compose.yml`, `render.yaml`

- [ ] **Step 1: Wire main.go**

Add `"github.com/sahel/api/internal/telegram"` to the imports. Replace

```go
	var mailer mail.Sender = mail.Log{Log: log}
	if cfg.SMTPHost != "" {
		mailer = mail.SMTP{Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser, Pass: cfg.SMTPPass, From: cfg.MailFrom}
	}
```

with

```go
	var alerters []http.Alerter
	if cfg.AlertEmailTo != "" {
		var mailer mail.Sender = mail.Log{Log: log}
		if cfg.SMTPHost != "" {
			mailer = mail.SMTP{Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser, Pass: cfg.SMTPPass, From: cfg.MailFrom}
		}
		alerters = append(alerters, http.MailAlerter{Sender: mailer, To: cfg.AlertEmailTo})
	}
	if cfg.TelegramToken != "" {
		alerters = append(alerters, http.TelegramAlerter{Client: telegram.Client{Token: cfg.TelegramToken, ChatIDs: cfg.TelegramChatIDs}})
	}
	log.Info().Bool("email", cfg.AlertEmailTo != "").Bool("telegram", cfg.TelegramToken != "").Msg("alerts")
```

and replace the `http.WithPayments(...)` line with:

```go
		http.WithPayments(time.Duration(cfg.HoldMinutes)*time.Minute),
		http.WithAlerts(cfg.WebURL, alerters...),
```

- [ ] **Step 2: Build and vet everything**

Run: `gotest vet ./...`
Expected: no output, exit 0.

- [ ] **Step 3: Add the variables to the config files**

Append to `.env.example`, after `ALERT_EMAIL_TO=`:

```
# Telegram alerts for new bookings and receipts. Create a bot with @BotFather,
# message it once, then read your chat id from
# https://api.telegram.org/bot<token>/getUpdates. Several ids: comma-separated.
# Set both or neither.
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Public site origin, for dashboard links in alerts. Optional.
WEB_URL=http://localhost:3000
```

In `infra/docker-compose.yml`, under the api `environment`, after `ALERT_EMAIL_TO: ${ALERT_EMAIL_TO:-}`:

```yaml
      # Telegram alerts: both or neither. WEB_URL adds dashboard links.
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
      WEB_URL: ${WEB_URL:-}
```

At the end of `render.yaml`'s `envVars`:

```yaml
      - key: TELEGRAM_BOT_TOKEN
        sync: false
      - key: TELEGRAM_CHAT_ID
        sync: false
      - key: WEB_URL
        sync: false
```

- [ ] **Step 4: Commit**

```bash
git add api/cmd/api/main.go .env.example infra/docker-compose.yml render.yaml
git commit -m "feat(api): wire email and Telegram alert channels"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/deploy-free.md` (new section before `## Keeping it awake`)
- Modify: `docs/user-manual-ar.md`

- [ ] **Step 1: deploy-free.md**

Insert before `## Keeping it awake (optional)`:

```markdown
## Telegram alerts (optional)

Get a Telegram message for every new booking and every uploaded receipt.

1. In Telegram, open **@BotFather**, send `/newbot` and follow the prompts.
   It replies with a token like `123456789:AA...`. Keep it secret.
2. Open your new bot and send it any message (bots can't message you first).
3. Open `https://api.telegram.org/bot<token>/getUpdates` in a browser and find
   `"chat":{"id":...}`. That number is your chat ID.
4. On Render → `sahel-api` → **Environment**, add:

   | Key | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Token from step 1 |
   | `TELEGRAM_CHAT_ID` | Chat ID from step 3. Several people: comma-separated |
   | `WEB_URL` | `https://<project>.vercel.app`, so messages link to the dashboard |

   Then choose **Save and deploy**. Set both Telegram variables or neither: with
   only one, the API refuses to start. The log line `alerts` shows
   `"telegram":true` once it's on.
```

- [ ] **Step 2: user-manual-ar.md**

Read `docs/user-manual-ar.md` and find the section on payments or receipts (search for `إيصال`). After it, add a section that matches the file's heading level:

```markdown
## تنبيهات تيليجرام

يصلك على تيليجرام رسالة عند:

- **كل حجز جديد**، سواء من الموقع أو من لوحة التحكم. الرسالة فيها رقم الحجز، واسم الضيف وتليفونه، والوحدة، والتواريخ، والإجمالي، والعربون المطلوب.
- **كل إيصال دفع يرفعه ضيف.** افتح لوحة التحكم ← المدفوعات وراجع الإيصال.

الرسالة فيها رابط يفتح الحجز أو صفحة المدفوعات مباشرة. صورة الإيصال لا تُرسل على تيليجرام؛ تراها في لوحة التحكم فقط.

لو الرسائل وقفت: افتح البوت على تيليجرام وتأكد إنك لم تحظره، وراجع إعدادات `TELEGRAM_BOT_TOKEN` و`TELEGRAM_CHAT_ID` على Render.
```

- [ ] **Step 3: Commit**

```bash
git add docs/deploy-free.md docs/user-manual-ar.md
git commit -m "docs: Telegram alert setup and manual section"
```

---

### Task 7: Final verification

- [ ] **Step 1: The whole suite**

Run: `gotest test ./... 2>&1 | grep -Ev '^\s*$|Waiting for|🐳|✅|🔔|⏳'`
Expected: every package `ok` (or `no test files`), with no `FAIL` and no `SKIP`.

- [ ] **Step 2: The production image builds**

Run, from the repo root: `docker build -q -f api/Dockerfile.prod -t sahel-api-check .`
Expected: an image ID (`sha256:...`).

- [ ] **Step 3: Local smoke test, without Telegram**

Restart the dev stack so it picks up the code: `docker compose -f infra/docker-compose.yml --env-file .env up -d --build api`. Then
`docker compose -f infra/docker-compose.yml --env-file .env logs api | grep '"alerts"'`
Expected: `"email":false,"telegram":false` (or `email:true` if `ALERT_EMAIL_TO` is set locally).
