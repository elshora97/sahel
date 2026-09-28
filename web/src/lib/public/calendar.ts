/**
 * Calendar-date helpers for the availability calendar. Dates are ISO
 * "YYYY-MM-DD" strings end to end and all maths is done in UTC, so no local
 * timezone can shift a day.
 */

export type ISODate = string;

/** Egyptian calendars start the week on Saturday. Values are JS weekdays. */
export const weekdayOrder = [6, 0, 1, 2, 3, 4, 5] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: ISODate) => new Date(`${s}T00:00:00Z`);

export function addDays(date: ISODate, n: number): ISODate {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** month is 1-12. */
export function addMonths(year: number, month: number, n: number) {
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function nightsBetween(checkIn: ISODate, checkOut: ISODate): number {
  return Math.round((parse(checkOut).getTime() - parse(checkIn).getTime()) / 86_400_000);
}

export function weekday(date: ISODate): number {
  return parse(date).getUTCDay();
}

/** Weeks of a month (1-12), Saturday first; blanks are null. */
export function monthGrid(year: number, month: number): (ISODate | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = weekdayOrder.indexOf(first.getUTCDay() as (typeof weekdayOrder)[number]);
  const cells: (ISODate | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(Date.UTC(year, month - 1, d))));
  while (cells.length % 7) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface Range {
  checkIn?: ISODate;
  checkOut?: ISODate;
}

/**
 * First pick is the check-in; a later pick is the check-out. Picking the
 * check-in again clears; an earlier pick, or any pick after a full range,
 * starts over from that date.
 */
export function rangeSelect(r: Range, date: ISODate): Range {
  if (r.checkIn && !r.checkOut) {
    if (date === r.checkIn) return {};
    if (date > r.checkIn) return { checkIn: r.checkIn, checkOut: date };
  }
  return { checkIn: date };
}

export function toPounds(piasters: number): number {
  return piasters / 100;
}

/** Parses a pounds amount typed by an admin ("14,550.5") into piasters. */
export function toPiasters(pounds: string): number | null {
  const clean = pounds.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
