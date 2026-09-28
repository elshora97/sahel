import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAmenities } from "./amenities.ts";

test("mergeAmenities: unit first, compound extras after, case-insensitive de-dupe", () => {
  assert.deepEqual(
    mergeAmenities([" WiFi", "Private pool", ""], ["wifi", "Gym", "private pool ", "Beach access"]),
    ["WiFi", "Private pool", "Gym", "Beach access"],
  );
});

test("mergeAmenities tolerates null lists", () => {
  assert.deepEqual(mergeAmenities(null, undefined), []);
  assert.deepEqual(mergeAmenities(null, ["Gym"]), ["Gym"]);
});
