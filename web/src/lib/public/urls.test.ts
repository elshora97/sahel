import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, pageWindow } from "./urls.ts";

test("apiUrl joins base, the v1 prefix, path and query", () => {
  assert.equal(apiUrl("http://api:8090/", "/units", "area=x&page=2"), "http://api:8090/api/v1/units?area=x&page=2");
  assert.equal(apiUrl("http://api:8090", "/areas", ""), "http://api:8090/api/v1/areas");
  assert.equal(apiUrl("http://api:8090", "/units/sea chalet"), "http://api:8090/api/v1/units/sea%20chalet");
});

test("pageWindow reports totals and neighbours", () => {
  assert.deepEqual(pageWindow(1, 20, 0), { pages: 1, prev: null, next: null });
  assert.deepEqual(pageWindow(1, 20, 41), { pages: 3, prev: null, next: 2 });
  assert.deepEqual(pageWindow(3, 20, 41), { pages: 3, prev: 2, next: null });
});
