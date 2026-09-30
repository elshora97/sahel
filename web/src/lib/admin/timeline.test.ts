import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayRange, isWeekend, parseFrom, place, selection } from "./timeline.ts";

test("addDays and dayRange cross months and years", () => {
  assert.equal(addDays("2027-01-30", 3), "2027-02-02");
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.deepEqual(dayRange("2027-02-27", 3), ["2027-02-27", "2027-02-28", "2027-03-01"]);
});

test("isWeekend is Friday and Saturday", () => {
  assert.deepEqual(["2027-06-03", "2027-06-04", "2027-06-05", "2027-06-06"].map(isWeekend), [false, true, true, false]);
});

test("place puts a stay's nights on the visible columns", () => {
  const from = "2027-06-01";
  assert.deepEqual(place("2027-06-03", "2027-06-06", from, 14), { col: 2, span: 3, clippedStart: false, clippedEnd: false });
  assert.deepEqual(place("2027-05-28", "2027-06-03", from, 14), { col: 0, span: 2, clippedStart: true, clippedEnd: false });
  assert.deepEqual(place("2027-06-13", "2027-06-20", from, 14), { col: 12, span: 2, clippedStart: false, clippedEnd: true });
  assert.deepEqual(place("2027-05-01", "2027-07-01", from, 7), { col: 0, span: 7, clippedStart: true, clippedEnd: true });
  assert.equal(place("2027-05-25", "2027-06-01", from, 14), null, "checks out on the first visible day");
  assert.equal(place("2027-06-15", "2027-06-18", from, 14), null, "starts after the range");
});

test("selection orders the clicks and counts the last day's night", () => {
  assert.deepEqual(selection("2027-06-05", "2027-06-03"), { start: "2027-06-03", end: "2027-06-06", nights: 3 });
  assert.deepEqual(selection("2027-06-05", "2027-06-05"), { start: "2027-06-05", end: "2027-06-06", nights: 1 });
});

test("parseFrom accepts only real days", () => {
  assert.equal(parseFrom("2027-02-10", "x"), "2027-02-10");
  for (const bad of [undefined, "", "2027-02-30", "June", "2027-2-1"]) assert.equal(parseFrom(bad, "x"), "x");
});
