import { test } from "node:test";
import assert from "node:assert/strict";
import { enumOptions, other, pick, unitStatusTone } from "./labels.ts";

test("unit status maps to a badge tone", () => {
  assert.equal(unitStatusTone("active"), "confirmed");
  assert.equal(unitStatusTone("draft"), "neutral");
  assert.equal(unitStatusTone("paused"), "attention");
  assert.equal(unitStatusTone("archived"), "muted");
  assert.equal(unitStatusTone("unknown"), "neutral");
});

test("pick prefers the locale and falls back to the other language", () => {
  assert.equal(pick("ar", "مراسي", "Marassi"), "مراسي");
  assert.equal(pick("en", "مراسي", "Marassi"), "Marassi");
  assert.equal(pick("en", "مراسي", ""), "مراسي");
  assert.equal(other("ar", "مراسي", "Marassi"), "Marassi");
});

test("enumOptions keeps API values and adds labels", () => {
  assert.deepEqual(enumOptions(["sea", "pool"], (v) => v.toUpperCase()), [
    { value: "sea", label: "SEA" },
    { value: "pool", label: "POOL" },
  ]);
});
