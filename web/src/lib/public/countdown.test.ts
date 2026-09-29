import { test } from "node:test";
import assert from "node:assert/strict";
import { remaining } from "./countdown.ts";

test("remaining splits the time left, never negative", () => {
  const now = Date.parse("2027-06-01T10:00:00Z");
  assert.deepEqual(remaining("2027-06-01T11:43:20Z", now), { hours: 1, minutes: 43, seconds: 20, over: false });
  assert.deepEqual(remaining("2027-06-01T10:00:59Z", now), { hours: 0, minutes: 0, seconds: 59, over: false });
  assert.deepEqual(remaining("2027-06-01T09:59:00Z", now), { hours: 0, minutes: 0, seconds: 0, over: true });
  assert.deepEqual(remaining(null, now), { hours: 0, minutes: 0, seconds: 0, over: true });
});
