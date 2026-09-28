# Phase 3: availability and pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Compact by request: pure logic is test-first with the cases listed; handlers and UI name files, interfaces and checks.

**Goal:** Build `docs/superpowers/specs/2026-09-28-phase-3-availability-design.md`.

**Architecture:** Pure Go `domain/pricing` (Generate, Quote) + sqlc queries + chi handlers; Next pages call the API server-side; the public calendar is a client component that calls a quote Server Action.

**Tooling:** no host Go. Run Go through Docker:
`docker run --rm -v //var/run/docker.sock:/var/run/docker.sock -v "$PWD/api":/src -v "$PWD/infra":/infra -v sahel_gomod:/go/pkg/mod -w /src -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal golang:1.23 <cmd>` (sqlc: `go run github.com/sqlc-dev/sqlc/cmd/sqlc@latest generate`; tests: `go test ./...`). Migrate the dev DB with `make migrate` equivalent through `docker compose run`.

---

### Task 0: Verify the Phase 2e hand-edits with real sqlc
- [ ] Run sqlc generate on master; `git diff` must be empty or whitespace-only. Commit any diff as `chore(api): regenerate sqlc`.

### Task 1: Migration and queries
- [ ] `infra/migrations/00008_pricing.sql` per spec §2 (Up and Down); update `testsupport` truncate list to include `seasons, unit_calendar`.
- [ ] `queries/seasons.sql`: list/get/create/update/delete for a unit, `CopySeasons` (delete target's, insert from source), `ListSeasonsForUnit`.
- [ ] `queries/calendar.sql`: `DeleteRuleDays(unit, from, to)`, `InsertDays` via `unnest` arrays `ON CONFLICT DO NOTHING`, `ListCalendar(unit, from, to)` joined to season names, `UpsertManual` (range override with COALESCE of given fields, `source='manual'`), `SetAvailability(range, bool)` (upsert manual), `DeleteManual(range)`.
- [ ] Unit queries: add the 8 pricing columns to create/update; `from_price` subquery on `SearchUnits` and `ListActiveUnitsByCompoundID`.
- [ ] sqlc generate; `go build ./...`. Commit.

### Task 2: `domain/pricing` (test-first)
- [ ] `generate_test.go` cases: single season covers range; uncovered dates omitted; overlap → higher priority; equal priority → shorter season; Thu/Fri uplift 15% on 10,050.00 EGP rounds up to whole pound; empty check-in days → all allowed; `{4,5}` → only Thu/Fri.
- [ ] `quote_test.go` cases: each error code in order; min nights = max across a boundary (2-night Thu–Sat into a 3-night season fails); extra guests; deposit rounds up (`total=100001, pct=30 → 30001`); too_soon uses Africa/Cairo.
- [ ] Implement `Generate`, `Quote`, `Weekday` helpers. `go test ./internal/domain/pricing`. Commit.

### Task 3: Store regeneration + handlers
- [ ] `internal/http/pricing_store.go`: `regenerate(ctx, q, unitID, from, to)` = load seasons, `pricing.Generate`, `DeleteRuleDays`, `InsertDays`.
- [ ] Admin handlers `admin_seasons.go`, `admin_calendar.go`; public `availability.go` (`GET availability`, `POST quote`); unit input gains pricing fields (validate ≥ 0, `deposit_pct` 0..100).
- [ ] Handler tests: season create → calendar rows; manual override survives season edit; reset restores; quote 200 and 422 codes; availability marks missing dates blocked.
- [ ] `go test ./...` in Docker. Restart the dev API; migrate the dev DB. Commit.

### Task 4: Web data layer (test-first)
- [ ] `lib/public/calendar.ts` + test: `monthGrid(year, month, weekStart=6)` (Saturday-first weeks, Egyptian convention), `rangeSelect(state, date)` (first click = check-in, second after it = check-out, else restart), `nights(a,b)`, `toPounds/toPiasters`, `formatPounds(locale)`.
- [ ] `lib/public/api.ts`: `getAvailability`, `postQuote`; admin `lib/admin` types/actions for seasons and calendar.
- [ ] Commit.

### Task 5: Public calendar and quote
- [ ] `unit/[slug]/availability-calendar.tsx` (client), `quote-action.ts` (Server Action), `booking-card.tsx`; copy keys `public.calendar.*`, `public.quote.*` incl. one message per error code; card "from" price.
- [ ] Styles in `public.css` (`.pb-cal*`). Commit.

### Task 6: Admin
- [ ] Unit form "Pricing & fees" section (pounds), seasons card + modal + copy, calendar editor card; copy keys `admin.pricing.*`, `admin.seasons.*`, `admin.calendar.*`. Commit.

### Task 7: Verify
- [ ] Browser pass per spec §8; `npm test`, typecheck, build; Go tests. Fix in one batch; commit.
