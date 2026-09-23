import { test } from "node:test";
import assert from "node:assert/strict";
import { checkbox, int, list, nullableNumber, optional, ref, text } from "./form.ts";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

test("text trims and treats a missing key as empty", () => {
  assert.equal(text(fd({ a: "  x  " }), "a"), "x");
  assert.equal(text(fd({}), "a"), "");
});

test("optional and ref drop blanks", () => {
  assert.equal(optional(fd({ slug: " " }), "slug"), undefined);
  assert.equal(optional(fd({ slug: "marassi" }), "slug"), "marassi");
  assert.equal(ref(fd({ area_id: "" }), "area_id"), null);
});

test("numbers", () => {
  assert.equal(int(fd({ n: "4" }), "n"), 4);
  assert.equal(int(fd({ n: "" }), "n"), undefined);
  assert.equal(nullableNumber(fd({ lat: "" }), "lat"), null);
  assert.equal(nullableNumber(fd({ lat: "30.9876" }), "lat"), 30.9876);
});

test("checkbox is on only when checked", () => {
  assert.equal(checkbox(fd({ f: "on" }), "f"), true);
  assert.equal(checkbox(fd({}), "f"), false);
});

test("list splits on commas (Latin and Arabic) and newlines", () => {
  assert.deepEqual(list(fd({ a: " pool, beach ،gym\nwifi,, " }), "a"), ["pool", "beach", "gym", "wifi"]);
  assert.deepEqual(list(fd({}), "a"), []);
});
