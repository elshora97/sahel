# Build Prompt

Two ways to use this: paste **Section A** once at the start of a project (Claude Code, Cursor, or a fresh chat) with `01-design-and-requirements.md` attached, then feed **Section B** prompts one phase at a time. Don't paste all of B at once — long single-shot builds produce shallow code.

---

## Section A — Master prompt (paste once, with the spec attached)

```
You are the lead engineer on a vacation-rental booking platform for the Egyptian
North Coast (Sahel): chalets and villas in compounds like Marassi, Hacienda Bay,
Telal and Almaza Bay, plus Ain Sokhna, El Gouna and Ras Sudr.

The attached file `01-design-and-requirements.md` is the source of truth for scope,
data model, API surface, booking rules, payment flow and visual direction. Follow it.
Where it is silent, decide and write down the decision in DECISIONS.md. Where you
think it is wrong, say so before implementing — do not silently deviate.

STACK — do not substitute:
- Frontend: Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui,
  TanStack Query for server state, react-hook-form + zod, next-intl (ar default RTL, en),
  react-day-picker for calendars.
- Backend: Go 1.23, chi router, pgx/v5 + sqlc, goose migrations, JWT auth,
  asynq (or river) for background jobs, zerolog.
- Database: PostgreSQL 16 with btree_gist. Storage: S3-compatible (R2/MinIO).
- Monorepo: /web (Next.js), /api (Go), /infra (docker-compose, migrations).

HARD RULES:
1. Money is stored and computed as integer piasters. Never float. Format at the edge only.
   Percentages round up: deposit_due = (total * deposit_pct + 99) / 100 in integer arithmetic.
2. Stay dates are DATE, never timestamp. A stay is a half-open daterange [check_in, check_out).
3. Double-booking is prevented by a Postgres EXCLUDE constraint, not by application checks.
   Handle 23P01 explicitly and return 409 with a clear message. The predicate must list every
   status that occupies dates (spec 5.1) - there is no 'hold' status. The constraint covers
   booking-vs-booking only; booking-vs-manual-block is serialised with SELECT ... FOR UPDATE
   on the unit_calendar rows inside the same transaction.
4. Every layout uses CSS logical properties (margin-inline-start, padding-inline-end,
   start/end, not left/right). The Arabic RTL layout must be a mirror, not a second design.
5. All user-facing strings live in message catalogs. No hardcoded English or Arabic in JSX.
6. All money and status mutations write to audit_log with actor, before and after.
7. Admin-only data (exact address, owner contact, bank details) never appears in a public
   API response. Enforce this with separate response DTOs, not field omission at render time.
8. Every endpoint that touches a booking runs inside a transaction.

WORKING METHOD:
- Work in the phases listed in section 10 of the spec. Complete and verify one phase
  before starting the next. At the end of each phase, output: what you built, how to
  run it, what to test manually, and what you deferred.
- Write the Go domain layer with no database imports; keep pricing and availability rules
  as pure functions with table-driven unit tests.
- Every new endpoint ships with an integration test using testcontainers against real Postgres.
- Seed data must be realistic: real compound names, EGP prices at peak-season levels
  (8,000–35,000/night for villas), Arabic titles and descriptions.
- Do not scaffold placeholder pages you won't fill. Fewer, finished screens.

DESIGN RULES (from spec section 4):
- Tokens: --ink #0B2A3A, --sea #0F7C86, --lagoon #7FD4D0, --sand #E8DCC8,
  --shell #FBFAF7, --sun #F2B233, plus --state-blocked #B9C2C6 and --state-past #E7EAEA
  for calendar cells. Define once in globals.css and map into the shadcn theme
  variables. No colors outside this system.
- Typeface: Readex Pro only, weights 200/400/500/600, tabular numerals for all
  prices, dates and calendar cells.
- Unit card grids use varied heights driven by photo aspect ratio, not a uniform
  rounded-card wall. Motion only on state change.
- Avoid: all-caps eyebrow labels, arrows appended to button text, gradient decoration,
  identical drop shadows on every surface.

Before writing code for a phase, restate the phase's acceptance criteria in your own
words and list the files you will create. Then build.
```

---

## Section B — Phase prompts

### Phase 1 — Foundation
```
Set up the monorepo: /web, /api, /infra.
- docker-compose with Postgres 16 (btree_gist enabled), MinIO, and the Go API.
- Go: chi router, config from env, zerolog, /healthz and /readyz, graceful shutdown,
  goose wired to /infra/migrations, sqlc configured.
- Next.js 15 with TypeScript strict, Tailwind, shadcn/ui initialized, the six design
  tokens defined and mapped to shadcn theme vars, Readex Pro loaded for ar + en.
- next-intl with ar (default, dir=rtl) and en, a locale switcher, and a demo page that
  proves the RTL mirror works with logical properties.
- Makefile: make dev, make migrate, make sqlc, make test, make seed.
Acceptance: `make dev` gives me a running API and a Next.js page at /ar and /en that
mirrors correctly, with the palette visibly applied.
```

### Phase 2 — Catalog
```
Implement areas, compounds, owners, units and unit_images per the spec's data model.
Backend: migrations, sqlc queries, CRUD services, public list/detail endpoints with
filtering (area, compound, type, guests, bedrooms, price range, view, max sea distance)
and cursor pagination. Admin CRUD behind JWT.
Frontend: home page, /search with filters in the URL, unit detail page (no calendar yet),
compound page, destination page. Server components for data, TanStack Query only where
there is real interactivity. generateMetadata + JSON-LD on unit and compound pages.
Seed: 3 areas, 5 real compounds, 20 units with plausible Arabic and English content.
Acceptance: I can browse and filter 20 seeded units in both languages, and unit pages
render valid VacationRental JSON-LD.
```

### Phase 3 — Availability and pricing
```
Implement seasons, unit_calendar, and the pricing engine.
- Pure Go functions: generateCalendar(unit, seasons, range), quote(unit, range, guests)
  returning a full breakdown, and validateStay() enforcing all six rules from spec 5.2.
  Table-driven tests including: range crossing two seasons, min-nights raised mid-range,
  disallowed check-in day, manual override winning over a rule, buffer days.
- Endpoints: GET /units/:slug/availability, POST /units/:slug/quote,
  POST /admin/units/:id/pricing/generate, PATCH /admin/units/:id/calendar.
  Public routes take a slug, admin routes take an id.
- Frontend: <AvailabilityCalendar /> — two months, per-date price in the cell, blocked
  dates struck through, range selection that refuses invalid ranges with an inline reason,
  live price breakdown in the sticky card.
Acceptance: on an August unit with min_nights 3 and allowed check-in days [Thu,Fri],
check-in Thu / check-out Sun (3 nights) is accepted; check-in Thu / check-out Sat
(2 nights) is refused for min_nights; check-in Sat / check-out Sun is refused for the
check-in day. Each refusal names the first failing rule in readable ar and en.
```

### Phase 4 — Booking and holds
```
Add bookings and customers.
- Migration with the generated `stay` daterange column and the EXCLUDE constraint from
  spec 5.3, whose predicate lists pending_payment, awaiting_verification, confirmed,
  checked_in and completed. Prove it: write a test that fires two concurrent booking
  requests for the same dates and asserts exactly one succeeds and the other gets 409.
  Write a second test that fires a booking and an admin block concurrently and asserts
  the FOR UPDATE lock on unit_calendar serialises them.
- POST /bookings creates a booking in pending_payment with hold_expires_at, generates a
  Crockford-base32 reference (MRS-XXXXX), assigns amount_suffix, and re-validates the quote
  server-side. Never trust a client-sent total.
- Worker job expiring holds every minute.
- Phone OTP auth (rate-limited per phone and per IP).
- Frontend: 3-step booking flow (dates+guests → guest details → payment method choice),
  and /booking/[ref] status page accessible without login via ref + last 4 phone digits.
Acceptance: a hold blocks the dates, expires on schedule, and the concurrency test passes.
```

### Phase 5 — Payments
```
Implement the assisted-manual payment flow from spec section 6.
- payment_accounts admin CRUD: InstaPay and bank transfer only, each with bilingual
  instructions and copy-to-clipboard fields. No mobile wallets - do not add the method,
  do not seed one, do not leave it in the enum.
- Payment page per booking: selected method's details, the exact amount including the
  booking's amount_suffix piasters, a visible countdown of the remaining hold.
- Proof upload to S3 with EXIF stripping, virus-safe content-type validation, signed
  URLs for admin viewing only.
- Admin verification queue: proof image beside expected amount, Verify / Reject with
  reason / Record partial payment. Verification confirms the booking and triggers
  notifications (stub the WhatsApp and SMS adapters behind interfaces).
Acceptance: full path from date selection to a confirmed booking, with the dates
correctly held throughout and released on rejection-then-expiry.
```

### Phase 6 — Dashboard
```
Build /dashboard per spec section 3.
- Today view: arrivals, departures, payments awaiting verification, occupancy this week.
- <UnitTimeline />: units as rows, days as columns, bookings as bars colored by state,
  horizontal scroll, drag to block or unblock dates, click to open the booking drawer.
  Must stay smooth with 60 units across 120 days — virtualize.
- Bookings list with filters and a detail drawer; manual booking creation for phone and
  walk-in guests.
- Customers, owners, reports (revenue, occupancy, per-unit performance) with shadcn charts.
- Roles: admin vs staff enforced server-side, not just hidden in the UI.
Acceptance: I can run a full week of operations without touching the database.
```

### Phase 7 — Polish
```
- PDF voucher generation per confirmed booking. There is no contract.
- WhatsApp and SMS templates in Arabic, wired to a real provider behind the existing
  interface.
- Sitemap, robots, hreflang, OG images per unit.
- Image pipeline: AVIF/WebP at 5 widths plus blurhash.
- Arabic copy review pass across every screen, including empty and error states.
- Load test: availability search across 500 units and 180 days under 200ms p95.
```

---

## Section C — Prompt for the visual mockup (if you want to see it before building)

```
Using the design direction in section 4 of 01-design-and-requirements.md, build a
single self-contained HTML file that mockups three screens stacked vertically:
the home page, a unit detail page with the availability calendar, and the dashboard
timeline. Use real Egyptian North Coast content — Marassi, Hacienda Bay, Sidi Abdel
Rahman — and realistic peak-season EGP prices. Static, no framework, but pixel-accurate
to the tokens and typography. Include an ar/en toggle that actually flips direction.
This is for reviewing the look before any code is written.
```
