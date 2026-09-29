# Phase 3: availability and pricing

Per-date price and availability, driven by per-unit seasons, visible on the unit page and editable in the admin. Source of truth: `01-design-and-requirements.md` §2 (blocks), §5.2 (rules), §5.4 (pricing). Approved in chat on 2026-09-28.

## 1. Scope

**In:** unit pricing fields; `seasons` and `unit_calendar`; rule → calendar generation; availability and quote endpoints; admin seasons, "copy from unit", calendar overrides; public two-month calendar with quote breakdown; "from X / night" on cards.

**Out (Phase 4):** bookings, rule 2 (booking overlap), `buffer_days` enforcement, the "Request booking" action (shown disabled as "Booking opens soon").

## 2. Data

Migration `00008_pricing.sql`:

- `units` gains `cleaning_fee BIGINT NOT NULL DEFAULT 0`, `deposit_pct SMALLINT NOT NULL DEFAULT 30 CHECK (0..100)`, `security_deposit BIGINT NOT NULL DEFAULT 0`, `extra_guest_fee BIGINT NOT NULL DEFAULT 0` (per guest per night above `base_guests`), `min_nights_default SMALLINT NOT NULL DEFAULT 1`, `buffer_days SMALLINT NOT NULL DEFAULT 0`, `advance_notice_hours INT NOT NULL DEFAULT 24`, `max_advance_days INT NOT NULL DEFAULT 365`. All money is integer piasters.
- `seasons`: `id`, `unit_id` (required, cascade delete), `name_ar`, `name_en`, `start_date`, `end_date` (inclusive; `CHECK end_date >= start_date`), `nightly_price BIGINT > 0`, `min_nights SMALLINT >= 1`, `allowed_checkin_days SMALLINT[]` (0 = Sunday … 6 = Saturday; empty = every day), `weekend_uplift_pct SMALLINT DEFAULT 0 (0..300)`, `priority INT DEFAULT 0`, timestamps.
- `unit_calendar`: `PRIMARY KEY (unit_id, date)`, `price BIGINT`, `min_nights SMALLINT`, `allowed_checkin BOOLEAN`, `is_available BOOLEAN`, `source calendar_source_enum ('rule','manual')`, `season_id` (nullable, `ON DELETE SET NULL`), `note TEXT`. `date` is `DATE`.

## 3. Generation (`domain/pricing`, pure Go)

`Generate(seasons, from, to) → []Day` for one unit:

- For each date, the covering season with the highest `priority` wins; ties go to the shorter season, then the later `start_date`.
- `price = nightly_price`, plus `weekend_uplift_pct` on Thursday and Friday nights, rounded **up** to a whole pound (100 piasters) in integer arithmetic.
- `allowed_checkin` = weekday ∈ `allowed_checkin_days` (or true when empty). `min_nights` from the season.
- Uncovered dates produce no row: unavailable by rule 1.

The store regenerates in one transaction: delete the unit's `source='rule'` rows in `[from, to]`, insert generated days with `ON CONFLICT DO NOTHING`, so `manual` rows always survive. The window is the union of the changed season's old and new ranges; "copy seasons" and season delete regenerate their own ranges.

## 4. Quote (`domain/pricing`, pure Go)

`Quote(unit, days, checkIn, checkOut, guests, now)` checks in order and returns the first failure as a code:

1. `invalid_range`: check-out after check-in, guests between 1 and `max_guests`.
2. `unavailable`: every night in `[check_in, check_out)` has a row with `is_available`.
3. `min_nights`: nights ≥ the **maximum** `min_nights` across those nights.
4. `checkin_day`: the check-in date's `allowed_checkin` is true.
5. `too_soon` / `too_far`: check-in ≥ now + `advance_notice_hours` (Africa/Cairo), and ≤ today + `max_advance_days`.

The breakdown: nightly lines (date, price, season name), `subtotal`, `extra_guests = max(0, guests − base_guests) × extra_guest_fee × nights`, `cleaning_fee`, `total`, `deposit_due = (total × deposit_pct + 99) / 100`, `security_deposit`. Integers only, multiply before dividing.

## 5. API

Public:
- `GET /units/:slug/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` (max 120 days) → `[{date, price, min_nights, allowed_checkin, state}]` where state is `free | blocked | past`; dates without a row appear as `blocked`.
- `POST /units/:slug/quote {check_in, check_out, guests}` → 200 breakdown, or 422 `{error:{code, message}}` with a §4 code.
- Search and compound unit rows gain `from_price` (the lowest future available price, or null).

Admin (basic auth):
- `GET|POST /admin/units/:id/seasons`, `PATCH|DELETE /admin/units/:id/seasons/:seasonId`
- `POST /admin/units/:id/seasons/copy {from_unit_id}`: replaces this unit's seasons with copies, then regenerates.
- `GET /admin/units/:id/calendar?from=&to=` → rows with `source`, `note`, season name.
- `POST /admin/units/:id/calendar {from, to, action, price?, min_nights?, note?}` where action is `override` (sets any given fields, `source='manual'`), `block`, `unblock`, or `reset` (drops manual rows in the range, regenerates from seasons).
- The unit PATCH accepts the new pricing fields.

## 6. Public unit page

- Two months side by side (one below 768px), previous/next month, each cell showing the day number and the price in pounds; unavailable days struck through and dotted; non-check-in days dimmed; past days muted. The states never rely on colour alone.
- Choosing a check-in, then a check-out, calls the quote through a Server Action; the sticky side card shows the season label ("14,500 / night · Peak"), nightly total, extra guests, cleaning, total, deposit due and security deposit, with a guests stepper. Rule failures appear under the calendar in plain words.
- The action button reads "Booking opens soon" and is disabled.
- Cards show "from 14,500 / night" when `from_price` is set, else "Pricing coming soon".

## 7. Admin

- Unit edit page: a "Pricing & fees" form section for the new unit fields (pounds in the UI, piasters in the API).
- A "Seasons" card: list (name, dates, price, min nights, check-in days, uplift, priority), add/edit in a modal, delete with confirm, "Copy seasons from another unit" (select + confirm, warns that it replaces).
- A "Calendar" card: month grid with price and state per day, manual days marked; click a day, shift-click another to select a range; an action bar applies override price / min nights / note, block, unblock, or reset to seasons.

## 8. Testing

- Go table tests: generation (boundaries, overlaps and priority, uplift rounding, empty check-in days), regeneration keeps manual rows (store test against Postgres), every quote rule including max-min-nights across a season boundary, deposit rounding up.
- Node tests: month-grid building, range selection helper, pounds ⇄ piasters.
- Browser pass: set seasons on a unit, override a date, view the public calendar in ar/en, get a quote and each error.

## Revision 2026-09-29: pricing without seasons

At the user's request seasons are removed (migration `00009_unit_base_pricing.sql`). This supersedes §2–§5 and §7 where they mention seasons:

- `units` gains `nightly_price` (nullable: unpriced units are not bookable), `weekend_price` (Thursday and Friday nights; null = nightly) and `allowed_checkin_days`. `min_nights_default` is the unit's minimum stay.
- `unit_calendar` holds only the admin's edits: nullable `price` and `min_nights`, `is_available`, `note`. `seasons`, `source` and `season_id` are dropped.
- `pricing.Resolve(base, edits, from, to)` replaces `Generate`: every date takes the unit's price, then any edit on that date. Quote rules are unchanged.
- Admin: `/admin/units/:id/seasons*` removed; the calendar endpoint returns resolved days with `edited` and `note`; `reset` deletes edits. The calendar sits inside the unit form above the save bar.
- Public: quote nights no longer carry season names; the card shows "average" when a stay's nights differ in price.

## Revision 2026-09-29 (later): simple pricing

Further simplified at the user's request (migration `00010_simple_pricing.sql`), superseding the revision above:

- A unit has one `nightly_price` (null = not bookable) and a `cleaning_fee`. Weekend price, check-in days, minimum nights, extra-guest fee, security deposit and the `unit_calendar` table are removed, along with the admin calendar and its endpoints.
- Quote rules: valid range and guests, unit priced, advance notice, booking horizon. Breakdown: nights × price, cleaning, total, deposit due (rounded up).
- Kept for later phases: `deposit_pct`, `buffer_days`, `advance_notice_hours`, `max_advance_days`.

## Revision 2026-09-29: dashboard sign-in

Browser Basic auth on `/dashboard` is replaced by a sign-in dialog at `/[locale]/login`. Username `ADMIN_USERNAME` (default `admin`), password `ADMIN_PASSWORD`. A successful sign-in sets `sahel_admin`, an HttpOnly, SameSite=Lax cookie holding an HMAC-signed 12-hour expiry keyed by the password, so changing the password signs everyone out. Middleware redirects unsigned dashboard page requests to the login page with `next`, and rejects unsigned Server Action POSTs with 401. The sidebar has a sign-out button. The web → API calls still use Basic auth server-side. The public header links to the dashboard.
