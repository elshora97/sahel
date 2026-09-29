# Phase 4: booking

Guests sign in with a phone code and book a unit; bookings confirm instantly; overlaps are impossible in the database. Approved in chat on 2026-09-29. Pricing follows the Phase 3 final revision: total = nightly price × nights, deposit = one night.

## 1. Scope

**In:** customers; phone one-time codes (OTP) with rate limits and a pluggable SMS sender (log sender in development); guest sessions; bookings with the `bookings_no_overlap` exclusion constraint; booked dates unavailable in availability and quotes (with `buffer_days`); "Book now" flow on the unit page; `/booking/[ref]` and `/my-bookings`; admin Bookings list, detail and cancel.

**Out:** payments and proof upload (Phase 5); `pending_payment`/`awaiting_verification`/`expired` flows and the hold-expiry worker; refunds; admin-created bookings; a real SMS provider.

## 2. Data (`00012_booking.sql`)

- `customers`: `id`, `phone` (E.164, unique), `name`, `email` (nullable), timestamps.
- `otp_codes`: `id`, `phone`, `code_hash` (SHA-256 of phone + code + server secret), `expires_at`, `attempts`, `consumed_at`, `ip`, `created_at`; index on `(phone, created_at)` and `(ip, created_at)`.
- `booking_status_enum` from `booking.All`.
- `bookings`: `id`, `ref` (unique), `unit_id`, `customer_id`, `check_in`, `check_out` (DATE, `check_out > check_in`), `nights` generated, `guests`, `status`, `nightly_price`, `total`, `deposit_due` (piasters, copied at booking time), `source` (`web`), `cancelled_at`, `cancel_reason`, timestamps; generated `stay daterange '[)'`; `CONSTRAINT bookings_no_overlap EXCLUDE USING gist (unit_id WITH =, stay WITH &&) WHERE (status IN (<booking.Occupying>))`.
- `btree_gist` extension (already created by the init script; the migration also ensures it).

## 3. Guest sign-in

- `POST /auth/otp/request {phone}`: normalise an Egyptian mobile (`01[0125]` + 8 digits, with or without `+20`/`0020`/`20`, spaces, dashes, Arabic-Indic digits) to `+201XXXXXXXXX`, else 422 `invalid_phone`. Rate limits: 3 per phone per 15 minutes, 10 per IP per hour → 429 `rate_limited`. Stores a hashed 6-digit code valid 5 minutes and sends "Beet Elsahel code: 123456" through the SMS sender. The response never reveals the code.
- `POST /auth/otp/verify {phone, code}`: the newest unconsumed, unexpired code for the phone; each wrong try increments `attempts`, and 5 wrong tries burn the code. Success consumes it, upserts the customer and returns `{token, customer, needs_name}`.
- Guest token: `<customer_id>.<expiry>.<HMAC>` signed with `GUEST_SESSION_SECRET` (falls back to `ADMIN_PASSWORD` in development), 30 days, sent as `Authorization: Bearer`. The web stores it in the HttpOnly cookie `sahel_guest`.
- `PATCH /me {name}` sets the name; `GET /me` returns the customer.
- SMS: `sms.Sender` interface; `LogSender` writes the message to the API log. The API refuses to start in `ENV=production` with the log sender unless `SMS_ALLOW_LOG=1`.

## 4. Booking

- Reference: `BES-` + 5 random Crockford base32 characters (`0-9A-Z` minus `I L O U`); retried on the unique index.
- `POST /bookings {unit_slug, check_in, check_out, guests}` (guest token, name required): re-runs the Phase 3 quote rules, then checks overlap including the unit's `buffer_days` after other stays; inserts `confirmed` with the quote's price, total and deposit. A 23P01 from the constraint (a same-second race) or an overlap found first → 409 `dates_taken`.
- Availability and quote: dates inside an occupying booking, or within `buffer_days` after its check-out, are `booked`/unavailable (`unavailable` rule code).
- `GET /me/bookings`; `GET /bookings/{ref}` for the owning guest token, or with `?phone_last4=` for anyone holding the reference; wrong or missing → 404 (never reveals existence).

## 5. Web

- Unit page: the button becomes "Book now" once a valid quote shows. Signed out: a dialog asks for the phone, then the code (with resend after 60 s), then the name for new guests. Then a summary step and "Confirm booking" → `/booking/[ref]`.
- `/booking/[ref]`: status badge, unit, dates, guests, nights × price, total, deposit due ("paid at confirmation in the next update"), and a lookup form (ref + last 4 digits) when not the owner.
- `/my-bookings`: the guest's bookings, newest first; sign-out.
- Header: "My bookings" when signed in.
- Admin: `Bookings` nav item; list (ref, unit, guest name + phone, dates, nights, total, status; search ref/phone; filter status/unit); detail page with guest, stay, money and "Cancel booking" (confirm modal, optional reason) → `cancelled`, dates free.

## 6. Testing

Go: phone normalisation table; OTP request/verify (hash, expiry, 5 attempts, both rate limits); guest token; reference alphabet; booking create, 409 on overlap and on buffer days; owner vs `phone_last4` access; admin cancel frees dates; the Phase 1 predicate drift test now runs. Web: phone formatting helper. No browser testing (per the user): `curl` against the running stack.
