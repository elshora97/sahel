# Sahel Rentals — Design & Requirements Spec
**Working name:** *Marsa* (placeholder — rename)
**Stack:** Next.js 15 (App Router) + shadcn/ui + Tailwind · Go 1.23 API · PostgreSQL 16 · S3-compatible storage
**Market:** North Coast (Sahel) chalets & villas, expanding to Ain Sokhna, Gouna, Ras Sudr, New Cairo

> Edit this file freely. Everything in `02-build-prompt.md` points back to it, so changing a rule here changes the build.

---

## 0. Confirm these before building

| # | Question | Assumed answer (change if wrong) |
|---|---|---|
| 1 | Are you the only one listing units, or do outside owners sign up and list? | **You only, for now.** Owners are records you create. The owner self-serve portal is **phase 8** — see §10, which is the only phase numbering that counts. |
| 2 | Is money collected online, or is the site a booking + verification layer? | **Verification layer.** InstaPay and bank transfer are both off-platform; the app collects proof and an admin confirms. No mobile wallets. |
| 3 | Nightly or weekly rentals? | **Both**, but weekly + weekend blocks are the default in Sahel, so the calendar enforces min-stay and allowed check-in days per unit. |
| 4 | Deposit or full amount up front? | **Deposit %** per unit (default 30%), remainder on arrival. Configurable per unit. |
| 5 | Arabic or English first? | **Arabic default (RTL), English toggle.** Full i18n from day one — retrofitting RTL is expensive. |
| 6 | Do you sign a contract per booking? | **No contract.** A confirmed booking produces a voucher only. Tenant national ID is still collected, for the compound gate list, not for a contract. |

---

## 1. Roles

- **Guest** — browses, checks availability, requests a booking, uploads payment proof, tracks status. Auth by phone + OTP (email optional).
- **Admin (you)** — full dashboard: units, calendar, pricing, bookings, payment verification, owners, content, reports.
- **Staff / Agent** — restricted admin: can manage bookings and verify payments, can't change pricing or delete units.
- **Owner** *(phase 8)* — read-only view of their own units, calendar, and payouts.

---

## 2. What makes this not just an Airbnb clone

The domain is different from Airbnb's in four ways, and the data model should reflect it:

1. **Compounds are first-class.** Nobody searches "an apartment in Alexandria." They search *Marassi*, *Hacienda Bay*, *Telal*, *Almaza Bay*, *Marina*. A compound has its own page, amenities (private beach, lagoons, gates, pools), and units belong to it.
2. **Distance to sea is the price.** `sea_distance_m`, `view` (sea / lagoon / pool / garden / street), and `row` (first row, second row…) are filterable, sortable fields — not free-text amenities.
3. **Season is everything.** Same unit is 25,000 EGP/night in mid-August and empty in January. Pricing is a per-date table, not a base price with a multiplier.
4. **Rentals are blocks, not nights.** Blocks are named by check-in → check-out, and nights = the difference:
   - **Short weekend** Thu → Sat = **2 nights** (off and shoulder season only)
   - **Weekend** Thu → Sun = **3 nights** (the peak-season default, because peak `min_nights` is 3)
   - **Midweek** Sun → Thu = 4 nights · **Full week** Fri → Fri = 7 nights

   Units define `min_nights` and `allowed_checkin_days` per season. Setting peak `min_nights` to 3 makes the short weekend unbookable in peak; that is intended, not a bug.

---

## 3. Sitemap

```
Public (ar default, /en)
├── /                         Home — search, featured compounds, seasonal picks
├── /search                   Map + list results, filters, calendar
├── /unit/[slug]              Unit detail — gallery, availability calendar, price breakdown
├── /compound/[slug]          Compound page — about, amenities, units inside
├── /destinations/[area]      Sidi Abdel Rahman, Ras El Hekma, Sokhna…
├── /book/[unitId]            3-step booking flow
├── /booking/[ref]            Booking status + payment upload (public link, no login needed)
├── /account                  My bookings, profile
├── /list-your-unit           Owner lead form
└── /about, /contact, /terms, /faq

Dashboard  /dashboard
├── /                         Today: arrivals, departures, payments to verify, occupancy
├── /calendar                 Multi-unit timeline (the main working screen)
├── /bookings                 List, filters, detail drawer
├── /payments                 Verification queue
├── /units                    List → editor (details, photos, pricing, rules)
├── /compounds
├── /owners
├── /customers
├── /reports                  Revenue, occupancy, source, unit performance
└── /settings                 Payment accounts, users, taxes, content, i18n strings
```

---

## 4. Visual direction

### 4.1 Design plan (review before coding)

**Concept:** the site should feel like standing on the sand at 6pm, not like a SaaS dashboard with beach photos in it. The photography carries the warmth; the interface stays cool, quiet and factual so prices and dates are easy to read. One bold move only: the **availability ribbon** — a horizontal, always-visible strip of the season showing free/held/booked in colour. It's the thing people came for, and it's the thing they'll remember.

**Color** (6 tokens, everything else derives):

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0B2A3A` | Text, headers, footer field |
| `--sea` | `#0F7C86` | Primary actions, links, selected dates |
| `--lagoon` | `#7FD4D0` | Availability "free", hover fills, chart series |
| `--sand` | `#E8DCC8` | Section backgrounds, dividers, disabled |
| `--shell` | `#FBFAF7` | Page background (cool white, not cream) |
| `--sun` | `#F2B233` | Single accent: price emphasis, "pending payment" state |

Two more tokens exist for calendar cells, so that "no colours outside the system" is literally true:

| Token | Hex | Use |
|---|---|---|
| `--state-blocked` | `#B9C2C6` | Blocked / unavailable dates |
| `--state-past` | `#E7EAEA` | Dates before today |

Booking states then read: free `--lagoon`, held `--sun`, confirmed `--sea`, blocked `--state-blocked`, past `--state-past`.

**Type:** one family — **Readex Pro** (200/400/500/600). It carries Arabic and Latin in one voice, which matters when the same page flips RTL. Numerals set with `font-variant-numeric: tabular-nums` everywhere a price or date appears, so calendar columns align. Display sizes at 600 weight, tightened tracking (-0.02em) for Latin, default tracking for Arabic. Body 16/1.6, max 68ch.

**Layout:** leading-edge aligned in Arabic *and* English (start is the right edge in Arabic, the left edge in English), using CSS logical properties (`margin-inline-start`, not `margin-left`) so RTL is a flip, not a rewrite. Content grid is 12 columns, but unit cards break out of it into a 4-across masonry-ish grid with **varied card heights driven by photo aspect ratio** — a wall of identical rounded cards is the tell to avoid.

**Principles:**
- The calendar is the hero, not a hero image with a search bar bolted on.
- Prices in EGP, always with the season label next to them ("14,500 / night · peak").
- No "Book now →" arrows, no ALL-CAPS eyebrows, no gradient washes.
- Motion only on state change: date range selecting, drawer opening, payment status flipping to verified.

### 4.2 Home page wireframe

```
┌──────────────────────────────────────────────────────────────┐
│ [logo]        Destinations  Compounds  Villas  Help   AR|EN  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Full-bleed photo, one unit, shot at golden hour            │
│   ┌────────────────────────────────────────────────────┐     │
│   │ Where       │ Dates            │ Guests │  Search  │     │  ← Popover + RangeCalendar
│   └────────────────────────────────────────────────────┘     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Available this weekend            (9 units)      See all →  │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                             │
│  │ img │ │ img │ │ img │ │ img │   varied heights            │
│  │ 12k │ │ 8k  │ │ 22k │ │ 15k │                             │
│  └─────┘ └─────┘ └─────┘ └─────┘                             │
├──────────────────────────────────────────────────────────────┤
│  Compounds                                                   │
│  Marassi · Hacienda Bay · Telal · Almaza · Marina            │
│  [wide horizontal cards, compound logo + 3 stats]            │
├──────────────────────────────────────────────────────────────┤
│  Season at a glance                                          │
│  Jun ▓▓░░▓ Jul ▓▓▓░░ Aug ▓▓▓▓▓ Sep ░░░░░   ← availability    │
│                                              ribbon          │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Unit detail wireframe

```
┌───────────────────────────────────────────────────────────┐
│ Gallery: 1 large + 4 thumbs, lightbox on click            │
├────────────────────────────────────┬──────────────────────┤
│ Villa · Marassi · Sidi Abdel Rahman│  ┌─────────────────┐ │
│ 4 bed · 3 bath · 8 guests          │  │ 14,500 EGP /nt  │ │  sticky
│ 180 m to sea · first row · sea view│  │ ┌─────────────┐ │ │  card
│                                    │  │ │ Check-in    │ │ │
│ [Amenities grid]                   │  │ │ Check-out   │ │ │
│ [Compound facilities]              │  │ └─────────────┘ │ │
│ [House rules: min 3 nights,        │  │ 3 nights 43,500 │ │
│  check-in Thu/Fri only in peak]    │  │ Cleaning  1,000 │ │
│ [Map — approximate pin only]       │  │ Deposit   13,350│ │
│ [Cancellation policy]              │  │ [Request booking]│ │
│                                    │  │ No charge yet.  │ │
├────────────────────────────────────┤  └─────────────────┘ │
│ AVAILABILITY — 2 months side by side, prices in each cell  │
│ hovering a range shows total. Blocked dates struck through.│
└───────────────────────────────────────────────────────────┘
```

### 4.4 shadcn/ui components to install

`button card badge input select calendar popover dialog sheet drawer table tabs form label textarea checkbox radio-group separator skeleton sonner tooltip dropdown-menu avatar alert alert-dialog progress command scroll-area accordion carousel chart pagination breadcrumb`

Custom components to build on top:
- `<AvailabilityCalendar />` — react-day-picker range mode, per-date price + state, min-stay enforcement, disabled check-in days.
- `<UnitTimeline />` — dashboard multi-unit gantt (units as rows, days as columns, bookings as bars, drag to block).
- `<PriceBreakdown />` — nights × rate + fees + deposit split.
- `<PaymentProofUploader />` — image/PDF drop, preview, EXIF strip.
- `<StateBadge />` — one component, every booking/payment state.

---

## 5. Booking & availability engine

### 5.1 Booking states

```
draft → pending_payment → awaiting_verification → confirmed → checked_in → completed
             ▲       │            │
             │       │            └─ expired (hold ran out, dates released)
             └───────┴─ payment rejected: straight back to pending_payment
                        with a new timer. Max 2, then cancelled.

confirmed | checked_in → cancelled → refund_pending → refunded
pending_payment | awaiting_verification → cancelled (admin, or 2nd rejection)
```

**Canonical enum.** Nothing outside this list is a valid `bookings.status`, and every other section of this document refers back to it:

```
draft | pending_payment | awaiting_verification | confirmed | checked_in | completed
      | expired | cancelled | refund_pending | refunded
```

- `pending_payment` holds the dates for **`hold_minutes`** (default 120, configurable). A background worker expires holds every minute.
- `awaiting_verification` = guest uploaded proof; dates stay held indefinitely until an admin acts.
- **There is no `rejected` booking status.** Rejection is recorded on the `payments` row (`status = 'rejected'` plus `rejection_reason`) and the booking goes straight back to `pending_payment` with a fresh `hold_expires_at` and `payment_rejection_count += 1`. Two rejections maximum, then `cancelled`. Modelling it this way means the dates are never unheld for the instant between rejecting and retrying.

### 5.2 Availability rules, in order

1. Date must exist in `unit_calendar` and be `is_available`.
2. No overlap with any booking in a date-occupying status: `pending_payment | awaiting_verification | confirmed | checked_in | completed`. This list and the EXCLUDE predicate in §5.3 must stay identical; define it once in Go as `domain.OccupyingStatuses` and generate the migration predicate from it.
3. `nights = check_out - check_in`. The required minimum is the **maximum** `min_nights` across every date in `[check_in, check_out)`, so one peak date inside the range raises the floor for the whole stay. This is stricter than Airbnb, which reads `min_nights` off the check-in date alone. It is deliberate, and the consequence is that a 2-night Thu–Sat weekend cannot straddle into a 3-night peak season — see the weekend definition in §2.
4. Check-in day ∈ `allowed_checkin_days` of the check-in date.
5. `advance_notice_hours` and `max_advance_days` respected.
6. Optional turnover gap (`buffer_days`) after each booking for cleaning.

### 5.3 The one thing to get right

Overlaps must be impossible at the database level, not just in Go:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD COLUMN stay daterange
  GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED;

ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (unit_id WITH =, stay WITH &&)
  WHERE (status IN ('pending_payment','awaiting_verification',
                    'confirmed','checked_in','completed'));
```

The predicate must name **every** status that occupies dates. There is no `hold` status — an earlier draft of this document used one, and a constraint written against it would silently protect nothing, which is the worst possible failure here. `draft`, `expired`, `cancelled`, `refund_pending` and `refunded` release the dates. `completed` is included so a mistyped manual booking can't be written over a stay that already happened.

Two people hitting "Request booking" in the same second: one gets a 409, guaranteed. Handle 23P01 explicitly and show "Someone just booked these dates."

**What the constraint does not cover.** It is booking-versus-booking only. A manual admin block lives in `unit_calendar`, a different table, and Postgres cannot write an exclusion constraint across two tables. So inside the same transaction that inserts the booking, lock the calendar rows first:

```sql
SELECT date, is_available FROM unit_calendar
 WHERE unit_id = $1 AND date >= $2 AND date < $3
   FOR UPDATE;
```

That serialises booking-versus-block on the same rows. Blocking and booking therefore contend on `unit_calendar`; booking and booking contend on the exclusion constraint.

### 5.4 Pricing

`unit_calendar` is one row per unit per date — the source of truth for price, availability and min-stay. Admin edits it through:
- **Season rules** (name, date range, nightly price, min nights, check-in days, weekend uplift %) that *generate* calendar rows.
- **Manual overrides** on any date, which win over rules and are never overwritten by regeneration.

Extra fees: cleaning (fixed), deposit (%), security deposit (refundable, optional), extra-guest fee above `base_guests`.

**Rounding.** Every figure is integer piasters end to end. Percentages round **up**: `deposit_due = ceil(total * deposit_pct / 100)`, computed as `(total * deposit_pct + 99) / 100` in integer arithmetic so the guest is never asked for less than policy. Multiply before dividing, always.

---

## 6. Payments — the part that's specific to Egypt

Neither InstaPay nor bank transfer gives you a clean webhook by default. So the platform is **assisted manual reconciliation**, designed to feel intentional rather than broken.

Mobile wallets (Vodafone / Etisalat / Orange Cash) are deliberately **not** supported. They are the noisiest method to reconcile by hand and the one most likely to arrive with a sender name that matches nothing.

### 6.1 Flow

```
Guest picks dates → Request booking (no login wall until step 3)
   ↓
Booking created, dates HELD, reference generated: MRS-4F92K
   ↓
Payment page shows ONE selected method with copy-to-clipboard details:
   InstaPay  →  IPA address / mobile number, exact amount, reference MRS-4F92K
   Transfer  →  Bank, account name, IBAN, amount, reference
   ↓
Guest pays outside the app, uploads screenshot/receipt + sender name/number
   ↓
Status: awaiting verification. WhatsApp + SMS sent to admin.
   ↓
Admin opens Payments queue: sees proof image next to expected amount,
   marks Verified / Rejected (with reason) / Partially paid
   ↓
Confirmed → voucher emailed & WhatsApp'd to guest
```

### 6.2 Design details that reduce support load

- **Reference format:** `MRS-` plus 5 characters of Crockford base32 (`0-9` and `A-Z` minus `I`, `L`, `O`, `U`), random, unique-indexed. No ambiguous glyphs, safe to read down a phone line, safe to type into a transfer note.
- **Amount uniqueness trick:** the reference is alphanumeric, so it has no "last 2 digits" to append — `MRS-4F92K` ends in `9K`. Instead every booking stores `amount_suffix smallint` in 0–99, and the amount the guest is asked to send is:

  ```
  expected_piasters = ceil_to_whole_pound(deposit_due) + amount_suffix
  ```

  which is always ≥ `deposit_due` and ends in two distinctive digits (43,500.92 EGP). Assign `amount_suffix` at hold creation as the smallest value in 0–99 not already taken by another outstanding booking at the same whole-pound amount; if all hundred are taken, fall back to `crc32(ref) % 100` and let the reference in the transfer note disambiguate. Makes bank-statement matching almost automatic.
- Countdown timer on the payment page, visible and honest: "Dates held for 1h 43m."
- The `/booking/[ref]` page works with no account — guests lose passwords, not WhatsApp links.
- Admin can record a payment that arrived without the guest uploading anything (they will call you instead — that's normal).
- Every payment row stores: method, amount, sender name, sender number, proof file, verified_by, verified_at, notes.
- Partial payments supported, but there is **no `partial` payment status**: a partial is simply a `verified` payment row for less than the expected amount. The booking stays in `awaiting_verification` until `paid_total ≥ deposit_due`, then moves to `confirmed`. The balance due on arrival is `total - paid_total`. (There is no `due_total` field; an earlier draft named one.)

### 6.3 Automation path (phase 8, verify current offerings before committing)

Egyptian PSPs — Paymob, Kashier, Fawry, Geidea — cover cards, and several advertise InstaPay/IPN acceptance. A PSP is also the only sane route back to wallets, if that decision is ever reversed: through the provider, never reconciled by hand. Treat the manual flow above as the permanent fallback and add a PSP as an additional `payment_method` behind the same state machine, so nothing else changes. Do not design the schema around a specific provider.

---

## 7. Data model

```
compounds        id, name{ar,en}, slug, area_id, description, amenities[], gate_info,
                 beach_type, lat, lng, images[], is_featured
areas            id, name{ar,en}, slug, region (north_coast|sokhna|gouna|...), km_marker
owners           id, name, phone, email, national_id, bank_details(json), commission_pct, notes
units            id, owner_id, compound_id, slug, title{ar,en}, type(chalet|villa|twin|
                 town|penthouse|studio|apartment), bedrooms, bathrooms, base_guests,
                 max_guests, area_sqm, floor, sea_distance_m, view(sea|lagoon|pool|garden|street),
                 row_number, amenities[], description{ar,en}, house_rules{ar,en},
                 cleaning_fee, deposit_pct, security_deposit, extra_guest_fee,
                 min_nights_default, buffer_days, advance_notice_hours, max_advance_days,
                 status(draft|active|paused|archived), lat, lng, exact_address (admin-only)
unit_images      id, unit_id, url, alt{ar,en}, sort, is_cover
seasons          id, unit_id|null, name, start_date, end_date, nightly_price, min_nights,
                 allowed_checkin_days[], weekend_uplift_pct, priority
unit_calendar    unit_id, date, price, min_nights, is_available, source(rule|manual|booking),
                 note            PK(unit_id, date)
bookings         id, ref, unit_id, customer_id, check_in, check_out, guests,
                 nights          GENERATED (check_out - check_in)
                 stay            GENERATED daterange(check_in, check_out, '[)')
                 nightly_subtotal, cleaning_fee, extra_guest_fee, discount, total,
                 deposit_due, amount_suffix, paid_total, payment_rejection_count,
                 status (§5.1 enum — no other values), hold_expires_at,
                 source(web|whatsapp|phone|walk_in), notes, created_by, cancelled_reason
payments         id, booking_id, method(instapay|bank_transfer|cash|psp), amount,
                 currency, sender_name, sender_ref, proof_url, status(submitted|verified|
                 rejected), rejection_reason, verified_by, verified_at
customers        id, name, phone(unique), email, national_id_url (gate list, not a
                 contract), whatsapp_opt_in, notes,
                 blacklisted
payment_accounts id, method, label, details(json), instructions{ar,en}, is_active
users            id, name, email, phone, password_hash, role(admin|staff|owner), owner_id
audit_log        id, user_id, entity, entity_id, action, before(json), after(json), at
inquiries        id, name, phone, unit_id|null, message, status, source
```

---

## 8. Go API surface

```
Public
GET    /api/v1/units                        ?area=&compound=&type=&guests=&bedrooms=
                                            &checkIn=&checkOut=&minPrice=&maxPrice=
                                            &view=&maxSeaDistance=&sort=&page=
GET    /api/v1/units/:slug
GET    /api/v1/units/:slug/availability     ?from=&to=   → per-date price/state
POST   /api/v1/units/:slug/quote            → full price breakdown, validates rules
GET    /api/v1/compounds  /:slug
GET    /api/v1/areas
POST   /api/v1/bookings                     → creates hold, returns ref
GET    /api/v1/bookings/ref/:ref            → public status by ref + phone last-4
POST   /api/v1/bookings/ref/:ref/payments   → multipart proof upload (ref + phone last-4)
POST   /api/v1/inquiries
POST   /api/v1/auth/otp/request  /verify

Admin (JWT, role-gated)
GET    /api/v1/admin/dashboard/summary
GET    /api/v1/admin/calendar               ?from=&to=&unitIds=  → timeline payload
POST   /api/v1/admin/blocks                 manual block/unblock
CRUD   /api/v1/admin/units /compounds /owners /customers /seasons /payment-accounts /users
POST   /api/v1/admin/units/:id/pricing/generate
PATCH  /api/v1/admin/units/:id/calendar     bulk date override
GET    /api/v1/admin/bookings               ?status=&unit=&from=&q=
POST   /api/v1/admin/bookings               manual booking (phone/walk-in)
PATCH  /api/v1/admin/bookings/:id/status
GET    /api/v1/admin/payments?status=submitted
POST   /api/v1/admin/payments/:id/verify   /reject
GET    /api/v1/admin/reports/revenue /occupancy /units
GET    /api/v1/admin/export/bookings.csv
```

Public routes address a unit by `slug`, because that is what the URL bar holds and what the guest can see; admin routes address it by `id`. Don't mix the two. Guest-facing booking routes address a booking by `ref` + phone last-4, never by `id` — a sequential or guessable id in a public route is an enumeration hole.

### Backend layout

```
cmd/api/main.go
cmd/worker/main.go            hold expiry, WhatsApp/SMS queue, iCal sync, image processing
internal/
  config/  http/ (router, middleware: auth, ratelimit, cors, requestid, recover)
  domain/{unit,booking,payment,pricing,availability}/   entities + rules, no DB imports
  store/postgres/   sqlc-generated + queries/*.sql
  service/          orchestration, transactions
  notify/           whatsapp, sms, email adapters (interfaces)
  storage/          s3/minio
  pdf/              voucher generation
migrations/         goose
```

Libraries: `chi` router, `pgx/v5` + `sqlc`, `goose`, `golang-jwt`, `go-playground/validator`, `river` or `asynq` for jobs, `zerolog`, `testcontainers-go` for integration tests.

**Non-negotiable backend rules:** all money in **integer piasters**; all dates as `DATE` (never timestamps) for stay ranges; all timestamps stored UTC, rendered `Africa/Cairo`; every mutation writes `audit_log`.

---

## 9. Non-functional

- **i18n/RTL:** `next-intl`, locales `ar` (default, `dir=rtl`) and `en`. Logical CSS properties only. Arabic-Indic numeral toggle in settings — default to Western numerals for prices.
- **SEO:** server-rendered unit and compound pages, `generateMetadata`, JSON-LD (`VacationRental`, `Offer`, `AggregateRating`), sitemap, `ar`/`en` hreflang. This is how you stop paying for every lead.
- **Images:** upload → worker generates AVIF/WebP at 5 widths, blurhash placeholder, strips EXIF GPS. Never serve originals.
- **Privacy:** exact address and owner details are admin-only; public map shows a ~300 m offset pin until the booking is confirmed.
- **Security:** OTP rate-limited per phone and IP, signed URLs for proof files (they contain bank details), RBAC on every admin route, CSRF on cookie auth, audit log on money and status changes.
- **Analytics:** unit view → quote → booking request → paid funnel, per unit and per source.
- **Deploy:** Next.js on Vercel; Go + Postgres on Hetzner/DigitalOcean via Docker Compose or Coolify; images on Cloudflare R2. Nightly `pg_dump` off-box.

---

## 10. Build phases

1. **Foundation** — repos, Docker, Postgres, migrations, health check, Next.js + shadcn + theme tokens + i18n shell.
2. **Catalog** — areas, compounds, units, images, public listing + detail + search filters (no dates yet).
3. **Availability** — seasons, `unit_calendar`, generation, availability API, calendar UI, quote endpoint.
4. **Booking** — hold + exclusion constraint + expiry worker + booking flow UI + status page.
5. **Payments** — accounts, instructions, proof upload, verification queue, notifications.
6. **Dashboard** — timeline calendar, bookings, customers, owners, reports, roles.
7. **Polish** — SEO, PDF vouchers, WhatsApp templates, seed data, Arabic copy review, load test the calendar.
8. **Later** — owner portal, PSP integration, Airbnb/Booking.com iCal sync, reviews, dynamic pricing suggestions.
