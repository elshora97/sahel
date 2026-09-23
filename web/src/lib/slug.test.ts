import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.ts";

// Mirrors api/internal/slug tests: the admin's auto-filled slug must be the
// one the API would accept as canonical.
test("slugify matches the Go slug package", () => {
  const cases: Array<[string, string]> = [
    ["Sidi Abdel Rahman", "sidi-abdel-rahman"],
    ["Café del Mar", "cafe-del-mar"],
    ["  --Hello,  World!--  ", "hello-world"],
    ["Villa 4BR", "villa-4br"],
    ["مراسي", ""],
    ["", ""],
  ];
  for (const [input, want] of cases) {
    assert.equal(slugify(input), want, `slugify(${JSON.stringify(input)})`);
  }
});
