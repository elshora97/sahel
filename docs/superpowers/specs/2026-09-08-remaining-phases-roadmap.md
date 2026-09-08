# Marsa — Remaining Phases Roadmap

Lightweight orientation for phases 2–8. One page per few phases, meant to be
read in 5 minutes. This is **not** an implementation plan: each phase still
needs its own brainstorm → spec → plan cycle before code is written.

The source of truth is `01-design-and-requirements.md`. If this file disagrees
with the spec, the spec wins.

## Status snapshot (Phase 1 — done)

Foundation is in place: monorepo layout, Docker Compose (Postgres 16, MinIO,
Go API), Next.js 15 with `next-intl` (Arabic default RTL + English), theme
tokens in `globals.css`, health/readiness endpoints, the `bookings_no_overlap`
drift test, and integer-piaster money helpers. No units, no calendars, no
bookings, no auth, no seed data yet.

---

## Phase 2 — Catalog

**Goal.** A browsable public catalogue of compounds and units with search
filters, before dates or pricing exist.

**Deliverables.**
- Tables: `areas`, `compounds`, `units`, `unit_images`, `owners`.
- Admin CRUD for the above (minimum viable — no polish).
- Public routes: `/`, `/search`, `/unit/[slug]`, `/compound/[slug]`,
  `/destinations/[area]`.
- Filters: area, compound, type, guests, bedrooms, view, max sea distance.
- Image pipeline stub (upload → S3, no derivatives yet).
- Seed data for 2–3 compounds and ~10 units.

**Main risks.**
- Bilingual (ar/en) fields everywhere — easy to forget one column and repaint
  the whole schema later.
- Slug uniqueness across ar/en and across compound namespaces.
- Image handling scope creep (defer derivatives to Phase 7).

**Size.** M — schema + admin + public views is broad but shallow.

---

## Phase 3 — Availability

**Goal.** Per-date price and availability, driven by seasons, visible on unit
pages.

**Deliverables.**
- Tables: `seasons`, `unit_calendar`.
- Season rules → calendar-row generator; manual overrides that survive
  regeneration.
- `GET /units/:slug/availability` and `POST /units/:slug/quote` endpoints.
- `<AvailabilityCalendar />` component (react-day-picker, per-date price and
  state, min-stay enforcement, disabled check-in days).
- Admin calendar editor for a single unit.

**Main risks.**
- Rule → calendar generation is easy to get wrong on season boundaries and
  weekend uplift; needs table-driven tests.
- The "max min_nights across the range" rule (§5.2 rule 3) is stricter than
  Airbnb — must be enforced identically in Go and in the UI.
- Timezone: dates are `DATE`, not timestamps. Do not let a `TIMESTAMPTZ` sneak
  into any stay column.

**Size.** M — small surface, high correctness bar.

---

## Phase 4 — Booking

**Goal.** Guests can hold dates and receive a booking reference; holds expire
automatically; overlaps are impossible.

**Deliverables.**
- `bookings` table with generated `stay daterange`, the `bookings_no_overlap`
  EXCLUDE constraint, and the `unit_calendar` row-lock inside the insert
  transaction.
- Full booking state machine from §5.1 (no `hold`, no `rejected`).
- Reference generator (`MRS-` + 5-char Crockford base32, unique-indexed).
- Hold-expiry worker (`cmd/worker`) running every minute.
- 3-step booking flow UI (`/book/[unitId]`) and public status page
  (`/booking/[ref]`, accessed by ref + phone last-4).
- 23P01 conflict handling with a human-readable "someone just booked these
  dates" message.
- Guest auth: phone + OTP (rate-limited).

**Main risks.**
- The exclusion-constraint predicate and `domain.OccupyingStatuses` **must**
  stay in lockstep — the drift test from Phase 1 becomes load-bearing here.
- Race conditions between hold expiry and payment upload.
- OTP abuse — rate limits per phone and per IP from day one.

**Size.** L — the correctness core of the whole product.

---

## Phase 5 — Payments

**Goal.** Assisted manual reconciliation for InstaPay and bank transfer, with
a verification queue that feels intentional rather than broken.

**Deliverables.**
- Tables: `payments`, `payment_accounts`; `amount_suffix` on `bookings`.
- Payment page with one selected method, copy-to-clipboard details, honest
  countdown timer.
- Proof upload (image/PDF, EXIF-stripped, signed URLs).
- Admin verification queue: verify / reject-with-reason / partial.
- Notifications: WhatsApp + SMS + email adapters (interfaces first, one real
  provider).
- Partial-payment logic (no `partial` status — the booking stays in
  `awaiting_verification` until `paid_total ≥ deposit_due`).

**Main risks.**
- Amount-suffix collisions across concurrent holds — assignment must be
  atomic.
- Notification provider lock-in — keep the interface small and swappable.
- Rejection → retry loop must not release the dates for even one instant.

**Size.** L — many small pieces, all customer-visible.

---

## Phase 6 — Dashboard

**Goal.** The daily operator screen: what's arriving, what needs verifying,
what's booked when.

**Deliverables.**
- `/dashboard` today view: arrivals, departures, payments to verify,
  occupancy.
- `<UnitTimeline />` multi-unit gantt (rows = units, columns = days, bars =
  bookings, drag to block).
- `/dashboard/bookings` list with filters and detail drawer.
- `/dashboard/customers`, `/dashboard/owners`.
- Reports: revenue, occupancy, source, unit performance.
- Admin/staff RBAC on every admin route; `audit_log` on every mutation.
- CSV export of bookings.

**Main risks.**
- The timeline is the working screen — poor performance here kills adoption.
  Budget time for virtualisation.
- Report queries hitting the OLTP DB; may need materialised views by phase end.
- RBAC drift — one un-gated route is a data leak.

**Size.** L — broad surface, real UX care needed.

---

## Phase 7 — Polish

**Goal.** Ship-ready: SEO, real Arabic copy, image derivatives, load-tested
calendar.

**Deliverables.**
- Server-rendered SEO on unit and compound pages: `generateMetadata`,
  JSON-LD (`VacationRental`, `Offer`), sitemap, ar/en hreflang.
- Public map (unit detail; optional search side-by-side view). MapLibre +
  OSM tiles, single offset pin per §9 privacy rule.
- PDF voucher generator; WhatsApp voucher template.
- Full image pipeline: AVIF/WebP at 5 widths, blurhash placeholders, GPS
  strip.
- Native-speaker Arabic copy review across every string.
- Load test on the calendar and search endpoints.
- Seed data expanded to look real in demos.
- Nightly `pg_dump` off-box; restore drill documented.

**Main risks.**
- SEO retrofit surfaces route-shape mistakes made earlier — expect small
  refactors.
- Arabic copy review usually generates schema changes (labels, tone).

**Size.** M — no new domain, lots of quality work.

---

## Phase 8 — Later

**Goal.** Everything explicitly deferred by the spec.

**Deliverables.**
- Owner self-serve portal (read-only view of own units, calendar, payouts).
- PSP integration (Paymob / Kashier / Fawry / Geidea) as an additional
  `payment_method` behind the same state machine.
- Airbnb / Booking.com iCal sync (two-way).
- Guest reviews.
- Dynamic pricing suggestions.

**Main risks.**
- PSP contracts and KYC take real calendar time, not just dev time.
- iCal sync collisions with manual blocks — needs a documented conflict
  policy before code.
- Reviews change SEO surface — coordinate with any Phase 7 work still live.

**Size.** L each, sequenced independently. Do not batch.

---

## Sequencing notes

- **Strict blockers:** 2 → 3 → 4 → 5. Each depends on the previous
  schema.
- **Overlap opportunities:** Phase 6 (Dashboard) can begin as soon as Phase 4
  lands and grows through Phase 5. Phase 7 (Polish) items are mostly
  independent and can be picked up whenever the surface they touch is stable.
- **Do not start Phase 8 items** until Phase 7 has shipped — they change the
  contract with the outside world (owners, PSPs, OTAs) and are hard to
  reverse.

## What this doc does not do

It does not specify schemas, endpoints, tests, acceptance criteria, or
timelines. Each phase still needs its own brainstorm → design spec → written
plan → implementation cycle before any code lands. The purpose here is only
to keep the shape of the whole build visible while working on any single
piece of it.
