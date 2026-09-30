import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingWeekends, weekendStay } from "./weekends.ts";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

test("upcomingWeekends starts on the next Thursday, or today on a Thursday", () => {
  // 2026-09-30 is a Wednesday.
  const [first, second] = upcomingWeekends(2, day("2026-09-30"));
  assert.deepEqual(first, { checkIn: "2026-10-01", checkOut: "2026-10-04", nights: ["2026-10-01", "2026-10-02", "2026-10-03"] });
  assert.equal(second.checkIn, "2026-10-08");
  assert.equal(upcomingWeekends(1, day("2026-10-01"))[0].checkIn, "2026-10-01");
  // Friday: this weekend has started, so the next sheet is next Thursday.
  assert.equal(upcomingWeekends(1, day("2026-10-02"))[0].checkIn, "2026-10-08");
});

test("weekendStay needs every night free and sums their prices", () => {
  const [w] = upcomingWeekends(1, day("2026-09-30"));
  const free = (date: string, price: number | null = 100) => ({ date, price, state: "free" as const });
  const nights = [free("2026-10-01"), free("2026-10-02"), free("2026-10-03"), { date: "2026-10-04", price: 100, state: "blocked" as const }];
  assert.deepEqual(weekendStay(nights, w), { free: true, total: 300 });
  assert.deepEqual(weekendStay([{ ...nights[0], state: "blocked" }, ...nights.slice(1)], w), { free: false, total: null });
  assert.deepEqual(weekendStay([free("2026-10-01", null), ...nights.slice(1)], w), { free: true, total: null });
  assert.deepEqual(weekendStay(nights.slice(1), w), { free: false, total: null });
});
