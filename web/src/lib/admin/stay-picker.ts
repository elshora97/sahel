/**
 * Which days the manual booking calendar lets you pick, given a unit's taken
 * nights as [start, end) ranges (bookings with their turnover days, and
 * blocks). Dates are YYYY-MM-DD; string order is date order.
 */

export type Taken = Array<{ start: string; end: string }>;

/** The night starting on `day` is booked or blocked. */
export function isTaken(day: string, taken: Taken): boolean {
  return taken.some((r) => day >= r.start && day < r.end);
}

/** The first taken night on or after `day`, or null when the rest is free. */
export function nextTaken(day: string, taken: Taken): string | null {
  let first: string | null = null;
  for (const r of taken) {
    const hit = r.end > day ? (r.start > day ? r.start : day) : null;
    if (hit && (!first || hit < first)) first = hit;
  }
  return first;
}

/**
 * With no check-in yet (or a full range), any free night can start a stay.
 * With a check-in, a later day is a valid check-out up to and including the
 * next taken night: leaving the morning someone arrives is fine.
 */
export function canPick(day: string, checkIn: string | undefined, checkOut: string | undefined, taken: Taken): boolean {
  if (!checkIn || checkOut) return !isTaken(day, taken);
  if (day <= checkIn) return !isTaken(day, taken);
  const limit = nextTaken(checkIn, taken);
  return !limit || day <= limit;
}
