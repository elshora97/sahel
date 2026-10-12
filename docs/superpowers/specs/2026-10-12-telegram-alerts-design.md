# Telegram alerts — design

**Date:** 2026-10-12
**Status:** approved

## Goal

The owner gets a Telegram message when:

1. **A booking is created**, from the website (`source = "web"`) or from the
   dashboard (`source = "admin"`).
2. **A guest uploads a payment receipt**, the event that already sends the
   email alert (`alertNewReceipt`).

Verifying or rejecting a payment sends no message. Messages are text only; the
receipt image never leaves private storage.

## Approach

The API calls the Telegram Bot API directly, in a background goroutine, the
same way the receipt email works today. A slow or failing Telegram never
delays or fails the guest's request; failures are logged. No retries and no
outbox: the dashboard remains the record of truth, and a missed alert is
visible there.

Rejected: an outbox table plus worker (survives restarts, but too much
machinery for a notification), and a Supabase database webhook (logic outside
the repo, untestable, does not run locally).

## Components

### `api/internal/telegram`

```go
type Client struct {
    Token   string
    ChatIDs []string
    BaseURL string       // https://api.telegram.org; tests point it at httptest
    HTTP    *http.Client // nil means a client with a 10s timeout
}

func (c Client) Send(ctx context.Context, text string) error
```

`Send` POSTs JSON `{"chat_id": id, "text": text, "disable_web_page_preview": true}`
to `<BaseURL>/bot<Token>/sendMessage` once per chat ID. No `parse_mode`: plain
text needs no escaping for names or Arabic. A non-2xx response returns an error
carrying Telegram's `description`. It tries every chat ID and joins the errors.
The token must never appear in a returned error or log line.

### Alert channels in `internal/http`

```go
// Alerter delivers one alert to one channel.
type Alerter interface {
    Alert(ctx context.Context, subject, body string) error
}
```

There are two adapters, both in `internal/http/alerts.go` and exported because
`main.go` builds them:

- `MailAlerter{Sender mail.Sender, To string}` → `Sender.Send(ctx, To, subject, body)`
- `TelegramAlerter{Client telegram.Client}` → `Client.Send(ctx, subject + "\n" + body)`

`Server` replaces `mailer` and `alertTo` with `alerters []Alerter` and
`webURL string`. The helper `s.alert(ref, subject, body)` starts one goroutine
per alerter, each with a 30s timeout, and logs failures with `ref` and the channel type.

`WithPayments(hold, mailer, alertTo)` becomes `WithPayments(hold)` plus
`WithAlerts(webURL string, alerters ...Alerter)`. `main.go` builds the list:

- email: only when `ALERT_EMAIL_TO` is set. With no `SMTP_HOST`, the existing
  `mail.Log` sender still logs it.
- Telegram: only when the token and chat ID are both set.

### Events

- `alertNewReceipt(view, amount, sender)`: same subject and body as today,
  sent through `s.alert`.
- `alertNewBooking(view)`: new. It is called after `GetBookingView` succeeds in
  both `createBooking` (bookings.go) and `adminCreateBooking`
  (admin_manual_booking.go).

Booking message:

```
🏖 New booking SH-4K2P (website)          ← "(dashboard)" when source = admin
Guest: Ahmed Ali (01012345678)
Unit: new villa in marina 5
Dates: 2026-10-20 → 2026-10-24 (4 nights)
Guests: 6
Total: 60000 EGP · deposit due 18000 EGP
<WEB_URL>/ar/dashboard/bookings/<id>      ← only when WEB_URL is set
```

The receipt message gains the same dashboard link line when `WEB_URL` is set:
`<WEB_URL>/ar/dashboard/payments`.

## Configuration

| Variable | Meaning |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather. Optional. |
| `TELEGRAM_CHAT_ID` | Chat ID(s), comma-separated. Optional. |
| `WEB_URL` | Public site origin, e.g. `https://sahel.vercel.app`; no trailing slash. Optional. |

If only one of the token and chat ID is set, `config.Load` returns an error, so
the API refuses to start: a typo must not silently turn alerts off. Both empty
means Telegram is off.

The variables are added to `.env.example`, `infra/docker-compose.yml` (api
environment, defaulting to empty) and `render.yaml` (`sync: false`).
`docs/deploy-free.md` gets a "Telegram alerts" section: create the bot with
@BotFather, send it any message, read the chat ID from
`https://api.telegram.org/bot<token>/getUpdates`, then set the variables on Render.

## Error handling

- A Telegram or SMTP failure is logged and never changes the HTTP response.
- An alert is sent only after the booking or receipt transaction has
  committed. A failed booking sends nothing.
- No retries.

## Testing

- `telegram`: an httptest server checks the path contains the token, the JSON
  body, one request per chat ID, that non-2xx returns an error with
  Telegram's description, and that the error does not contain the token.
- `config`: a token without a chat ID (and the reverse) is an error; both empty
  is fine; the chat ID list is split and trimmed.
- `http`: a recording fake `Alerter`. A guest booking and a manual booking
  each record one alert with the right source label. A receipt upload records
  one alert. A fake that returns an error does not change the response
  status. Asynchronous delivery is awaited with a channel or WaitGroup in the
  fake, never with sleeps.
