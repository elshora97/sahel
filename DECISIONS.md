# DECISIONS

Decisions taken where `01-design-and-requirements.md` was silent, self-contradictory, or
wrong. Newest at the bottom. Format: what was decided, what was rejected, why.

---

## D-001 — There is no `hold` booking status

**Was:** §5.1 defined the states as `draft → pending_payment → awaiting_verification → …`,
but the EXCLUDE constraint in §5.3 was written `WHERE (status IN ('hold','confirmed','checked_in'))`
and §5.2 rule 2 said the same. `hold` was never a state.

**Decided:** keep the descriptive state names and widen the predicate to every status that
occupies dates: `pending_payment`, `awaiting_verification`, `confirmed`, `checked_in`,
`completed`. The list is defined once in Go as `domain.OccupyingStatuses`, and the goose
migration's predicate is generated from it so the two can never drift.

**Rejected:** renaming `pending_payment` to `hold`. It reads worse in the admin UI and the
`awaiting_verification` gap would still have been uncovered.

**Why it mattered:** as written, two guests could both reach `pending_payment` on the same
dates and the database would allow it. A constraint that protects nothing is worse than no
constraint, because the team stops writing application-level checks on the strength of it.

## D-002 — `completed` occupies dates

Included in the exclusion predicate. A past stay can't be overwritten by a mistyped manual
booking. Costs nothing: completed stays are in the past, so no future booking can overlap
one anyway. Correcting bad historical data requires moving the row to `cancelled` first,
which is the right amount of friction.

## D-003 — Rejection is a payment state, not a booking state

**Was:** §5.1 drew `awaiting_verification → rejected → pending_payment`.

**Decided:** `payments.status = 'rejected'` with a reason; the booking moves straight back
to `pending_payment` with a fresh `hold_expires_at` and `payment_rejection_count += 1`.
Two rejections maximum, then `cancelled`.

**Why:** a `rejected` booking status that doesn't occupy dates opens a window where the
guest's dates are free between the admin clicking Reject and the booking re-entering
`pending_payment`. Including `rejected` in the predicate instead would mean rejected-and-
abandoned bookings hold dates forever. Removing the state removes the window.

## D-004 — Booking-vs-block is serialised with a row lock

Postgres cannot write an exclusion constraint across two tables, and manual blocks live in
`unit_calendar`. Inside the booking transaction, `SELECT … FROM unit_calendar WHERE unit_id
= $1 AND date >= $2 AND date < $3 FOR UPDATE` before the insert. Booking-vs-booking
contends on the constraint; booking-vs-block contends on those rows.

**Rejected:** modelling blocks as `bookings` rows with a synthetic status so the constraint
covers them. Tempting, and it does work, but it pollutes every bookings query, every report
and the CSV export with rows that aren't bookings.

## D-005 — A night is `check_out - check_in`, and blocks are named accordingly

**Was:** §2 called the standard weekend Thu–Sat and phase 3's acceptance criterion asserted
that Thu–Sat passes `min_nights = 3`. Thu → Sat is 2 nights, so the criterion was impossible.

**Decided:** short weekend Thu → Sat (2 nights, off and shoulder only); weekend Thu → Sun
(3 nights, the peak default); midweek Sun → Thu (4); full week Fri → Fri (7). Peak
`min_nights = 3` makes the short weekend unbookable in peak, which is intended.

## D-006 — `min_nights` is the maximum over the range

Rule 5.2.3 said "≥ min_nights for every date," which is the max over `[check_in, check_out)`.
Kept, and stated explicitly. This is stricter than Airbnb, which reads `min_nights` off the
check-in date only. The visible consequence: a 2-night stay cannot straddle into a peak
season. Revisit if it costs shoulder-season bookings; it's a one-line change in
`validateStay()` and a table-driven test.

## D-007 — Reference format is Crockford base32

`MRS-` + 5 characters from `0-9A-Z` minus `I`, `L`, `O`, `U`. Random, unique-indexed. No
ambiguous glyphs, because this reference gets read down a phone line and typed into a bank
transfer note by someone who is not looking at the screen.

## D-008 — `amount_suffix` replaces "the last 2 digits of the ref"

**Was:** §6.2 said to append the last 2 digits of the booking reference as piasters. The
reference is alphanumeric — `MRS-4F92K` ends in `9K`.

**Decided:** `bookings.amount_suffix smallint` in 0–99, assigned at hold creation as the
smallest value not already taken by another outstanding booking at the same whole-pound
amount, falling back to `crc32(ref) % 100` if all hundred are taken. The requested amount is
`ceil_to_whole_pound(deposit_due) + amount_suffix`, which is always ≥ `deposit_due`.

## D-009 — Percentages round up

`deposit_due = (total * deposit_pct + 99) / 100` in integer piasters. Multiply before
dividing. The guest is never asked for less than policy, and no rounding rule is left to the
formatter at the edge.

## D-010 — No `partial` payment status

A partial payment is a `verified` payment row for less than the expected amount. The booking
stays in `awaiting_verification` until `paid_total ≥ deposit_due`. Balance on arrival is
`total - paid_total`. §6.2 referred to a `due_total` field that the data model never had.

## D-011 — Public routes take a slug, admin routes take an id

`/api/v1/units/:slug/availability` and `/quote`, matching `/units/:slug`. Guest-facing
booking routes take `ref` + phone last-4, never a booking id — including proof upload, which
was specified as `POST /bookings/:id/payments` and would have been an enumeration hole.

## D-012 — `--state-blocked` and `--state-past` are tokens

§4.1 named `#B9C2C6` and `#E7EAEA` as raw hex in the state ramp while the same section said
no colours outside the six-token system. They are now the seventh and eighth tokens, defined
in `globals.css` with the rest.

## D-013 — Phase numbering follows §10 only

§0 and §1 referred to the owner portal as "Phase 3"; §10 lists it under phase 8. §10 is what
the build prompt drives off, so it wins, and the earlier references now point at it.

## D-014 — `nights` and `stay` are generated columns

`nights GENERATED (check_out - check_in)`, `stay GENERATED daterange(check_in, check_out, '[)')`.
`nights` was a plain stored field in the data model, i.e. a second source of truth for
something the dates already say.

## D-015 — Mobile wallets are not a payment method

Removed from `payments.method`, from `payment_accounts`, and from the payment page.
Supported methods are now `instapay`, `bank_transfer`, `cash` (walk-in only) and `psp`
(reserved, phase 8).

Wallets are the hardest method to reconcile by hand: the sender name on a Vodafone Cash
transfer often matches nothing in `customers`, so the `amount_suffix` trick is doing all the
work on its own. If wallets come back, they come back through a PSP, where the provider
supplies a callback — never as another manual method.

## D-016 — No contract; a confirmed booking produces a voucher only

`pdf/` generates the voucher and nothing else. Phase 7 loses "PDF contracts". §0 question 6
now answers no.

**Kept anyway:** `customers.national_id_url`. Compounds ask for guest IDs at the gate, so
the field earns its place independently of any contract — but it is now gate-list data, not
a legal artefact, which changes how long it should be retained. Flag if you want it dropped
entirely; it is one column and one upload control.
