import { test } from "node:test";
import assert from "node:assert/strict";
import { needsLeavePrompt } from "./unsaved.ts";

test("only a dirty form leaving the page asks", () => {
  assert.equal(needsLeavePrompt(false, "/dashboard/units"), false);
  assert.equal(needsLeavePrompt(true, "/dashboard/units"), true);
  assert.equal(needsLeavePrompt(true, "#location"), false);
});
