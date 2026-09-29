# Phase 5: payments (InstaPay)

Guests pay the one-night deposit by InstaPay and upload the receipt; an admin checks it and confirms the booking. Decided in chat on 2026-09-30: InstaPay only (no bank transfer, no wallets), pay to confirm, 2-hour hold, alerts by dashboard badge and email. Source: `01-design-and-requirements.md` §5.1 and §6, minus the amount suffix (the user's rule: the guest pays exactly the price, nothing added; the reference in the transfer note identifies the payment).

## 1. Booking states

- `POST /bookings` now creates `pending_payment` with `hold_expires_at = now + HOLD_MINUTES` (default 120). The dates are held (the exclusion constraint already counts `pending_payment`).
- The API runs a minute ticker: `pending_payment` bookings past `hold_expires_at` become `expired`, releasing their dates.
- Guest uploads a receipt → payment `pending`; booking `pending_payment` → `awaiting_verification` (no expiry while a receipt waits). An upload after the hold ran out is refused (409 `hold_expired`).
- Admin verifies a payment (amount editable, defaults to the deposit) → `paid_total += amount`; when `paid_total ≥ deposit_due` the booking becomes `confirmed`, otherwise it stays `awaiting_verification` (a partial payment: the guest uploads another receipt).
- Admin rejects with a reason → `payment_rejection_count += 1`; the first rejection returns the booking to `pending_payment` with a fresh hold; the second cancels it.
- Admin can record a payment the guest never uploaded (paid by phone call): a `verified` payment straight away, same confirmation rule.
- Cancelling works from `pending_payment`, `awaiting_verification` and `confirmed`.

## 2. Data (`00014_payments.sql`)

- `bookings` gains `hold_expires_at TIMESTAMPTZ`, `paid_total BIGINT DEFAULT 0`, `payment_rejection_count SMALLINT DEFAULT 0`.
- `payments`: `id`, `booking_id`, `method` (`instapay`), `status` (`pending|verified|rejected`), `amount` (piasters; the guest's stated amount until verified), `sender_name`, `sender_number`, `proof_key` (private bucket, nullable for admin-recorded), `proof_type`, `rejection_reason`, `notes`, `recorded_by` (`guest|admin`), `verified_at`, timestamps.
- `instapay_account`: one row (`id = 1`) with `address` (the IPA, e.g. `beetelsahel@instapay`), `mobile`, `holder_name`, `updated_at`.

## 3. Receipts

- Stored in a private bucket `${S3_BUCKET}-private` (no anonymous access), key `proofs/<booking id>/<uuid>.<ext>`. JPEG, PNG, WebP or PDF, 10 MB max, type sniffed from the bytes.
- Only the admin can read one: `GET /admin/payments/:id/proof` streams it through the API.

## 4. API

Guest (booking owner token, or `?phone_last4=`):
- `GET /bookings/{ref}` adds `hold_expires_at`, `paid_total`, the InstaPay details and the booking's payments (status, amount, rejection reason, date).
- `POST /bookings/{ref}/payments` multipart `file`, `sender_name`, `sender_number`, `amount` (optional).

Admin:
- `GET /admin/payments?status=pending|verified|rejected` (queue, newest first, with booking and guest); `GET /admin/payments/pending-count`.
- `POST /admin/payments/:id/verify {amount}`, `POST /admin/payments/:id/reject {reason}`, `GET /admin/payments/:id/proof`.
- `POST /admin/bookings/:id/payments {amount, sender_name, notes}` (record a payment).
- `GET /admin/bookings/:id` adds its payments.
- `GET|PUT /admin/settings/instapay`.

## 5. Alerts

- Dashboard: a count badge on "Payments" in the sidebar and a "Payments to check" card on the overview.
- Email: on each receipt upload, a message to `ALERT_EMAIL_TO` through SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Works with any provider's SMTP (Gmail app password, Brevo, Zoho…). Without `SMTP_HOST` the message is logged instead. A failed email never fails the upload.

## 6. Web

- Booking page by status: `pending_payment` → "Pay the deposit": InstaPay address / mobile / name with copy buttons, the exact amount, "put BES-XXXXX in the transfer note", a live countdown ("dates held for 1h 43m"), and the receipt upload form; `awaiting_verification` → "Receipt received, we're checking" (and upload another); rejected → the reason and upload again; `expired` → "the hold ran out" with a link back to the unit.
- Admin: Payments queue (receipt preview, expected vs stated amount, guest, booking; verify with amount, reject with reason); booking detail gains a payments card with "Record a payment"; InstaPay settings page.

## 7. Testing

Go: hold expiry; upload → awaiting; verify full and partial; reject twice → cancelled; record payment; upload after expiry refused; receipt only readable by admin; settings round-trip; email sent on upload (fake mailer). Web: countdown formatting. `curl` end to end; no browser testing.
