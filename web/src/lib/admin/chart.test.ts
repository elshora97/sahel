import { test } from "node:test";
import assert from "node:assert/strict";
import { niceScale } from "./chart.ts";

test("niceScale rounds the top up to three even steps", () => {
  assert.deepEqual(niceScale(0), { max: 1, steps: [] });
  assert.deepEqual(niceScale(7), { max: 7.5, steps: [2.5, 5, 7.5] });
  assert.deepEqual(niceScale(100), { max: 150, steps: [50, 100, 150] });
  assert.deepEqual(niceScale(1_500_000), { max: 1_500_000, steps: [500_000, 1_000_000, 1_500_000] });
  assert.deepEqual(niceScale(61), { max: 75, steps: [25, 50, 75] });
});
