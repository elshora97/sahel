import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, monthGrid, nightsBetween, rangeSelect, toPiasters, toPounds, weekdayOrder } from "./calendar.ts";

test("monthGrid pads a Saturday-first month into full weeks", () => {
  // June 2027 starts on a Tuesday: Sat, Sun, Mon are blanks.
  const weeks = monthGrid(2027, 6);
  assert.deepEqual(weeks[0], [null, null, null, "2027-06-01", "2027-06-02", "2027-06-03", "2027-06-04"]);
  assert.equal(weeks.at(-1)!.filter(Boolean).at(-1), "2027-06-30");
  assert.ok(weeks.every((w) => w.length === 7));
  assert.deepEqual(weekdayOrder, [6, 0, 1, 2, 3, 4, 5]);
});

test("date arithmetic stays on calendar dates", () => {
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
  assert.deepEqual(addMonths(2027, 12, 1), { year: 2028, month: 1 });
  assert.deepEqual(addMonths(2027, 1, -1), { year: 2026, month: 12 });
  assert.equal(nightsBetween("2027-07-01", "2027-07-04"), 3);
});

test("rangeSelect: check-in, then a later check-out, else restart", () => {
  let s = rangeSelect({}, "2027-07-05");
  assert.deepEqual(s, { checkIn: "2027-07-05" });
  assert.deepEqual(rangeSelect(s, "2027-07-03"), { checkIn: "2027-07-03" });
  assert.deepEqual(rangeSelect(s, "2027-07-05"), {});
  s = rangeSelect(s, "2027-07-08");
  assert.deepEqual(s, { checkIn: "2027-07-05", checkOut: "2027-07-08" });
  assert.deepEqual(rangeSelect(s, "2027-07-20"), { checkIn: "2027-07-20" });
});

test("pounds and piasters", () => {
  assert.equal(toPounds(1455050), 14550.5);
  assert.equal(toPiasters("14,550.5"), 1455050);
  assert.equal(toPiasters("0.1"), 10);
  assert.equal(toPiasters(""), null);
  assert.equal(toPiasters("abc"), null);
});
