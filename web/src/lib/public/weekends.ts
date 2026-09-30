import type { AvailabilityDay } from "./types";

/** A weekend block: check in Thursday, check out Sunday (3 nights, D-005). */
export interface Weekend {
  checkIn: string;
  checkOut: string;
  /** The nights, check-in inclusive, check-out exclusive. */
  nights: string[];
}

const THURSDAY = 4;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/** Today on the coast, as a UTC-midnight date. */
export function cairoToday(now = new Date()): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(now);
  return new Date(`${day}T00:00:00Z`);
}

/**
 * The next `count` Thursday-to-Sunday weekends that haven't started yet.
 * On a Thursday, today's weekend still counts: check-in is today.
 */
export function upcomingWeekends(count: number, today = cairoToday()): Weekend[] {
  const first = addDays(today, (THURSDAY - today.getUTCDay() + 7) % 7);
  return Array.from({ length: count }, (_, i) => {
    const thu = addDays(first, i * 7);
    return {
      checkIn: iso(thu),
      checkOut: iso(addDays(thu, 3)),
      nights: [0, 1, 2].map((n) => iso(addDays(thu, n))),
    };
  });
}

/**
 * Whether every night of the weekend is free, and what the nights cost.
 * `total` is null when a night has no price yet.
 */
export function weekendStay(days: AvailabilityDay[], weekend: Weekend): { free: boolean; total: number | null } {
  const byDate = new Map(days.map((d) => [d.date.slice(0, 10), d]));
  let total: number | null = 0;
  for (const night of weekend.nights) {
    const day = byDate.get(night);
    if (!day || day.state !== "free") return { free: false, total: null };
    total = day.price == null || total == null ? null : total + day.price;
  }
  return { free: true, total };
}
