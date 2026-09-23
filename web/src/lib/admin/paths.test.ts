import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardHref, entityBase, isDashboardPath, legacyDashboardTarget, safeLocale } from "./paths.ts";

test("dashboard paths are locale-prefixed", () => {
  assert.equal(isDashboardPath("/ar/dashboard"), true);
  assert.equal(isDashboardPath("/en/dashboard/units/x"), true);
  assert.equal(isDashboardPath("/ar/dashboards"), false);
  assert.equal(isDashboardPath("/dashboard"), false);
  assert.equal(isDashboardPath("/ar"), false);
});

test("legacy /dashboard redirects to Arabic", () => {
  assert.equal(legacyDashboardTarget("/dashboard"), "/ar/dashboard");
  assert.equal(legacyDashboardTarget("/dashboard/units/1"), "/ar/dashboard/units/1");
  assert.equal(legacyDashboardTarget("/dashboards"), null);
  assert.equal(legacyDashboardTarget("/ar/dashboard"), null);
});

test("entityBase finds the list a record page belongs to", () => {
  assert.equal(entityBase("/en/dashboard/units/abc"), "/en/dashboard/units");
  assert.equal(entityBase("/ar/dashboard/areas"), "/ar/dashboard/areas");
  assert.equal(entityBase("/ar/dashboard"), null);
});

test("hrefs and locale guard", () => {
  assert.equal(dashboardHref("en", "/owners"), "/en/dashboard/owners");
  assert.equal(dashboardHref("ar"), "/ar/dashboard");
  assert.equal(safeLocale("en"), "en");
  assert.equal(safeLocale("fr"), "ar");
});
