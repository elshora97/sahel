import { test } from "node:test";
import assert from "node:assert/strict";
import { readResult, safeReturnQuery, withResult, withoutResult } from "./result.ts";

test("withResult appends to paths with and without a query", () => {
  assert.equal(withResult("/ar/dashboard/units", "deleted", "Villa 4BR"), "/ar/dashboard/units?done=deleted&name=Villa+4BR");
  assert.equal(withResult("/x?q=a", "saved", "ب"), "/x?q=a&done=saved&name=%D8%A8");
});

test("readResult accepts only known kinds", () => {
  assert.deepEqual(readResult(new URLSearchParams("done=created&name=Marassi")), { kind: "created", name: "Marassi" });
  assert.equal(readResult(new URLSearchParams("done=exploded&name=x")), null);
  assert.equal(readResult(new URLSearchParams("q=a")), null);
  assert.deepEqual(readResult(new URLSearchParams("done=saved")), { kind: "saved", name: "" });
});

test("withoutResult keeps other parameters", () => {
  assert.equal(withoutResult(new URLSearchParams("q=a&done=saved&name=x&status=draft")), "?q=a&status=draft");
  assert.equal(withoutResult(new URLSearchParams("done=saved&name=x")), "");
});

test("safeReturnQuery only keeps a real query string, minus the handshake", () => {
  assert.equal(safeReturnQuery("?q=a&done=saved&name=x"), "?q=a");
  assert.equal(safeReturnQuery("//evil.example/x"), "");
  assert.equal(safeReturnQuery("https://evil.example/?q=a"), "");
  assert.equal(safeReturnQuery(""), "");
});
