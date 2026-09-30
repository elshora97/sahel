// Package mail sends plain-text alert emails over SMTP. Without an SMTP host
// the Log sender writes them to the log instead.
package mail

import (
	"context"
	"encoding/base64"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

type Sender interface {
	Send(ctx context.Context, to, subject, body string) error
}

// Log writes each email to the log instead of sending it.
type Log struct{ Log zerolog.Logger }

func (l Log) Send(_ context.Context, to, subject, body string) error {
	l.Log.Info().Str("to", to).Str("subject", subject).Str("body", body).Msg("email (not sent: SMTP_HOST is empty)")
	return nil
}

// SMTP sends through any provider's SMTP server on its submission port
// (587), upgrading to TLS with STARTTLS when the server offers it. Implicit
// TLS on port 465 is not supported.
type SMTP struct {
	Host, Port, User, Pass, From string
}

func (s SMTP) Send(ctx context.Context, to, subject, body string) error {
	msg := strings.Join([]string{
		"From: " + s.From,
		"To: " + to,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"Date: " + time.Now().Format(time.RFC1123Z),
		"",
		body,
	}, "\r\n")
	var auth smtp.Auth
	if s.User != "" {
		auth = smtp.PlainAuth("", s.User, s.Pass, s.Host)
	}
	done := make(chan error, 1)
	go func() {
		done <- smtp.SendMail(net.JoinHostPort(s.Host, s.Port), auth, s.From, []string{to}, []byte(msg))
	}()
	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("smtp send: %w", err)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// mimeHeader encodes a non-ASCII subject (Arabic) as RFC 2047 UTF-8.
func mimeHeader(s string) string {
	for _, r := range s {
		if r > 127 {
			return "=?UTF-8?B?" + b64(s) + "?="
		}
	}
	return s
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
