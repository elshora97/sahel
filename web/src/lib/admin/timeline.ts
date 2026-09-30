/** Date math for the units timeline. Dates are YYYY-MM-DD strings, read as UTC days. */

export const DAY_MS = 86_400_000;

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The `count` days from `from`, one per timeline column. */
export function dayRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/** Monday..Sunday is 1..7; Egypt's weekend is Friday (5) and Saturday (6). */
export function isWeekend(day: string): boolean {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d === 5 || d === 6;
}

export type Placement = {
  /** First column (0-based) the bar covers. */
  col: number;
  span: number;
  /** The stay goes on before or after the visible range. */
  clippedStart: boolean;
  clippedEnd: boolean;
};

/**
 * Where a stay of nights [start, end) sits among `count` columns from `from`,
 * or null when none of its nights are visible.
 */
export function place(start: string, end: string, from: string, count: number): Placement | null {
  const to = addDays(from, count);
  if (end <= from || start >= to || end <= start) return null;
  const first = start < from ? from : start;
  const last = end > to ? to : end;
  const col = Math.round((Date.parse(first) - Date.parse(from)) / DAY_MS);
  const span = Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS);
  return { col, span, clippedStart: start < from, clippedEnd: end > to };
}

/** The nights in [start, end). */
export function nightsBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
}

/** Two clicked days, in either order, as the nights [start, end) they cover. */
export function selection(a: string, b: string): { start: string; end: string; nights: number } {
  const start = a < b ? a : b;
  const end = addDays(a < b ? b : a, 1);
  return { start, end, nights: nightsBetween(start, end) };
}

/** A `from` query value, or `fallback` when it isn't a real YYYY-MM-DD day. */
export function parseFrom(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value ? fallback : value;
}
