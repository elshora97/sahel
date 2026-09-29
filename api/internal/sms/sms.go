// Package sms sends text messages. Only a logging sender exists until a
// provider is chosen; a real one implements Sender and is wired in main.
package sms

import (
	"context"

	"github.com/rs/zerolog"
)

type Sender interface {
	Send(ctx context.Context, to, text string) error
}

// LogSender writes each message to the log instead of sending it. For
// development: the code a guest needs shows up in the API log.
type LogSender struct{ Log zerolog.Logger }

func (s LogSender) Send(_ context.Context, to, text string) error {
	s.Log.Warn().Str("to", to).Str("text", text).Msg("sms (log sender, not sent)")
	return nil
}
