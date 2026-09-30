import { test } from "node:test";
import assert from "node:assert/strict";
import { canPick, isTaken, nextTaken, type Taken } from "./stay-picker.ts";

// Nights 10-13 booked (turnover included), 20-21 blocked.
const taken: Taken = [
  { start: "2027-06-20", end: "2027-06-22" },
  { start: "2027-06-10", end: "2027-06-14" },
];

test("isTaken covers [start, end)", () => {
  assert.deepEqual(["2027-06-09", "2027-06-10", "2027-06-13", "2027-06-14"].map((d) => isTaken(d, taken)), [false, true, true, false]);
});

test("nextTaken finds the first closed night from a day", () => {
  assert.equal(nextTaken("2027-06-01", taken), "2027-06-10");
  assert.equal(nextTaken("2027-06-11", taken), "2027-06-11");
  assert.equal(nextTaken("2027-06-15", taken), "2027-06-20");
  assert.equal(nextTaken("2027-06-22", taken), null);
});

test("a check-in must be free; a check-out may reach the next closed night", () => {
  assert.equal(canPick("2027-06-11", undefined, undefined, taken), false);
  assert.equal(canPick("2027-06-05", undefined, undefined, taken), true);
  // From the 5th: up to the 10th (leave as the next guest arrives), not beyond.
  assert.equal(canPick("2027-06-10", "2027-06-05", undefined, taken), true);
  assert.equal(canPick("2027-06-12", "2027-06-05", undefined, taken), false);
  assert.equal(canPick("2027-06-25", "2027-06-05", undefined, taken), false);
  // An earlier day restarts the pick, so it only needs to be free.
  assert.equal(canPick("2027-06-02", "2027-06-05", undefined, taken), true);
  // After the last closed night everything is open.
  assert.equal(canPick("2027-07-30", "2027-06-23", undefined, taken), true);
  // With a full range the next pick is a new check-in.
  assert.equal(canPick("2027-06-12", "2027-06-05", "2027-06-08", taken), false);
});
