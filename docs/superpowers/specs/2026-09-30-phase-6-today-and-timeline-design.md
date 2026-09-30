# Phase 6 (part 1): today view and units timeline

Scope chosen: the dashboard's **today view** and a **units timeline** with
**date blocking**. Customers, reports, CSV and roles are later rounds.

## 1. Date blocks

A block keeps guests from booking a unit's nights (owner staying,
maintenance). It has no price and no customer.

**Schema (migration 00015):**
`unit_blocks(id, unit_id → units ON DELETE CASCADE, start_date, end_date, note, created_at)`.
- `end_date` is exclusive, like a booking's check-out.
- `span daterange` is generated, with an exclusion constraint so one unit's
  blocks never overlap.
- Blocks add no turnover days; bookings keep theirs.

**Effect on booking:** `CountOverlappingStays` and `ListOccupiedStays` also
count blocks. The public calendar shows blocked nights as unavailable, and a
booking over them is refused with `dates_taken`.

**Races:** creating a booking and creating a block both lock the unit row
(`SELECT … FOR UPDATE`) inside their transaction, so a block and a booking
can never land on the same night.

**Admin API:**
- `POST /admin/units/{id}/blocks {start, end, note}` returns 201.
  - 409 `dates_taken` if an occupying booking overlaps.
  - 409 `overlaps_block` if another block overlaps.
  - 422 on a bad range (end must be after start, at most 180 nights).
- `DELETE /admin/blocks/{id}` returns 204.

## 2. Timeline

**API:** `GET /admin/timeline?from=YYYY-MM-DD&days=14` (1–31 days) returns
every non-archived unit (title, compound, status) with its bookings and
blocks that touch the range:
- bookings: id, ref, status, check_in, check_out, guest name;
- blocks: id, start, end, note.

Cancelled and expired bookings are left out.

**Page `/dashboard/timeline`** (new sidebar item "Timeline", between
Bookings and Payments):
- **Grid:** rows are units, sticky on the inline-start edge; columns are
  days, 14 on tablet and desktop, 7 on phones. Today is outlined, and Friday
  and Saturday are tinted.
- **Moving around:** "Previous week" and "Next week" buttons, a "Today"
  button, and a date field to jump anywhere. The range lives in the URL
  (`?from=`), so it survives reloads and back.
- **Booking bars:** a bar spans the booked nights, is coloured by status
  (confirmed sea; awaiting payment or checking sun; checked-in deep sea),
  and shows the guest name. Clicking it opens the booking. Bars cut off at
  the range edges get a squared edge.
- **Block bars:** hatched grey with the note. Clicking one opens a small
  dialog showing the dates and note, with an "Unblock" button.
- **Blocking:** click a free day on a unit's row to start and another day on
  the same row to end (one click means one night). A dialog confirms the
  dates and takes an optional note, then saves. Esc cancels the selection.
  - Day cells are buttons, so keyboard users can do the same.
  - Days in the past can't be selected.

## 3. Today view (dashboard home)

**API:** `GET /admin/today` returns, for Cairo's today:
- arrivals: check-in today;
- departures: check-out today;
- staying now: a count of stays that started before today and end after it;
- holds expiring within the hour: a count;
- occupancy for the next 7 days: booked plus blocked nights ÷ (active
  units × 7).

Each arrival and departure has the ref, guest name, phone, unit, status and
nights. Only occupying statuses count.

**Page `/dashboard`:** the today section comes first.
- Four stat tiles: arrivals, departures, staying now, payments to check.
- Two short lists, arrivals and departures, with the guest's phone as a
  `tel:` link and each row opening its booking.
- An occupancy meter for the next 7 days that links to the timeline.
- The existing unit and compound stats and the "needs attention" card move
  below it.
- Empty lists say so plainly ("No arrivals today").

## 4. Testing

**Go:**
- blocks: create, overlap with a booking, overlap with another block, delete;
- a blocked night makes availability false and makes booking refuse;
- timeline range filtering;
- today counts, with a fixed clock.

**Web:** unit tests for the pure layout helper (bars to grid columns,
clipping at range edges, selecting a range) and the week-navigation dates.

**Scan:** the timeline and home pages at 360, 390, 768 and 1024. Inside the
timeline the grid scrolls within its own box; the page itself doesn't
scroll sideways.

## 5. Manual

Add a section to `docs/user-manual-ar.md` on the today view, the timeline and
blocking dates.
