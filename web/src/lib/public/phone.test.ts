import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingStatusTone } from "../admin/labels.ts";
import { formatPhone, looksLikeMobile } from "./phone.ts";

test("formatPhone shows an E.164 Egyptian mobile the local way", () => {
  assert.equal(formatPhone("+201012345678"), "010 1234 5678");
  assert.equal(formatPhone("weird"), "weird");
});

test("looksLikeMobile accepts common spellings before the API normalises them", () => {
  for (const ok of ["01012345678", "010 1234 5678", "+20 10 1234 5678", "٠١٠١٢٣٤٥٦٧٨"]) assert.equal(looksLikeMobile(ok), true, ok);
  for (const bad of ["", "0101234", "01312345678", "abc"]) assert.equal(looksLikeMobile(bad), false, bad);
});

test("bookingStatusTone", () => {
  assert.equal(bookingStatusTone("confirmed"), "confirmed");
  assert.equal(bookingStatusTone("cancelled"), "muted");
  assert.equal(bookingStatusTone("pending_payment"), "held");
});
