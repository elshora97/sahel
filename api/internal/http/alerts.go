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
