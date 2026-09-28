import { test } from "node:test";
import assert from "node:assert/strict";
import { activeFilterCount, filtersToQuery, parseSearchParams } from "./search-params.ts";

test("parseSearchParams keeps known values and drops the rest", () => {
  const f = parseSearchParams({
    area: "sidi-abdel-rahman",
    compound: ["marassi", "ignored"],
    type: "villa",
    view: "moon",
    guests: "4",
    bedrooms: "-2",
    maxSeaDistance: "abc",
    sort: "bedrooms_desc",
    page: "3",
    junk: "x",
  });
  assert.deepEqual(f, {
    area: "sidi-abdel-rahman",
    compound: "marassi",
    type: "villa",
    view: "",
    guests: 4,
    bedrooms: 0,
    maxSeaDistance: 0,
    sort: "bedrooms_desc",
    page: 3,
  });
});

test("parseSearchParams defaults", () => {
  assert.deepEqual(parseSearchParams({}), {
    area: "", compound: "", type: "", view: "", guests: 0, bedrooms: 0, maxSeaDistance: 0, sort: "", page: 1,
  });
});

test("filtersToQuery omits empties and page 1, and round-trips", () => {
  const f = parseSearchParams({ area: "gouna", guests: "6", sort: "sea_distance_asc", page: "1" });
  assert.equal(filtersToQuery(f), "area=gouna&guests=6&sort=sea_distance_asc");
  assert.equal(filtersToQuery(f, 2), "area=gouna&guests=6&sort=sea_distance_asc&page=2");
  assert.equal(filtersToQuery(parseSearchParams({})), "");
  const back = parseSearchParams(Object.fromEntries(new URLSearchParams(filtersToQuery(f, 4))));
  assert.deepEqual(back, { ...f, page: 4 });
});

test("activeFilterCount ignores sort and page", () => {
  assert.equal(activeFilterCount(parseSearchParams({ area: "a", type: "villa", sort: "bedrooms_desc", page: "2" })), 2);
});
