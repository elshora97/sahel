import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByQuery, filterUnits, hasFilters, matchesQuery, param, unitFilters } from "./filter.ts";
import type { UnitRow } from "./types";

const unit = (over: Partial<UnitRow>): UnitRow => ({
  id: "1", compound_id: "c1", slug: "sea-chalet", title_ar: "شاليه على البحر", title_en: "Sea Chalet",
  type: "chalet", status: "active", bedrooms: 2, max_guests: 6, sea_distance_m: 80, updated_at: "2026-09-23T10:00:00Z",
  compound_name_ar: "هاسيندا", compound_name_en: "Hacienda", owner_name: "O", cover_url: null, ...over,
});

const rows = [
  unit({}),
  unit({ id: "2", slug: "garden-villa", title_ar: "فيلا الحديقة", title_en: "Garden Villa", type: "villa", status: "draft", compound_id: "c2" }),
  unit({ id: "3", slug: "old-studio", title_ar: "استوديو", title_en: "Old Studio", type: "studio", status: "archived" }),
];

test("matchesQuery is case-insensitive and treats blank as a match", () => {
  assert.equal(matchesQuery("", ["x"]), true);
  assert.equal(matchesQuery("  CHALET ", ["Sea Chalet"]), true);
  assert.equal(matchesQuery("فيلا", ["فيلا الحديقة", null]), true);
  assert.equal(matchesQuery("pool", [undefined, "Sea"]), false);
});

test("filterUnits: each filter, then combined", () => {
  const ids = (f: Partial<ReturnType<typeof unitFilters>>) =>
    filterUnits(rows, { q: "", status: "", compound: "", type: "", ...f }).map((u) => u.id);
  assert.deepEqual(ids({}), ["1", "2", "3"]);
  assert.deepEqual(ids({ q: "فيلا" }), ["2"]);
  assert.deepEqual(ids({ q: "studio" }), ["3"]);
  assert.deepEqual(ids({ status: "draft" }), ["2"]);
  assert.deepEqual(ids({ compound: "c1" }), ["1", "3"]);
  assert.deepEqual(ids({ type: "villa" }), ["2"]);
  assert.deepEqual(ids({ compound: "c1", status: "active", q: "sea" }), ["1"]);
});

test("filterByQuery uses the given fields", () => {
  const areas = [{ n: "North Coast" }, { n: "Sokhna" }];
  assert.deepEqual(filterByQuery(areas, "sok", (a) => [a.n]), [{ n: "Sokhna" }]);
});

test("params and hasFilters", () => {
  assert.equal(param({ q: [" a ", "b"] }, "q"), "a");
  assert.equal(param({}, "q"), "");
  assert.deepEqual(unitFilters({ status: "draft", x: "1" }), { q: "", status: "draft", compound: "", type: "" });
  assert.equal(hasFilters({ q: "", status: "" }), false);
  assert.equal(hasFilters({ q: "", status: "draft" }), true);
});
