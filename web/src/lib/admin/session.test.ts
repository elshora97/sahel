import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCredentials, createSessionToken, safeNext, verifySessionToken } from "./session.ts";

const secret = "s3cret-password";
const now = 1_800_000_000_000;

test("a fresh token verifies until it expires", async () => {
  const token = await createSessionToken(secret, now, 60_000);
  assert.equal(await verifySessionToken(token, secret, now + 59_000), true);
  assert.equal(await verifySessionToken(token, secret, now + 61_000), false);
});

test("tampered, foreign or empty tokens are rejected", async () => {
  const token = await createSessionToken(secret, now, 60_000);
  const [exp, sig] = token.split(".");
  assert.equal(await verifySessionToken(`${Number(exp) + 999_999}.${sig}`, secret, now), false);
  assert.equal(await verifySessionToken(token, "another-password", now), false);
  assert.equal(await verifySessionToken(undefined, secret, now), false);
  assert.equal(await verifySessionToken("garbage", secret, now), false);
  assert.equal(await verifySessionToken(token, "", now), false);
});

test("checkCredentials needs both parts and a configured password", () => {
  assert.equal(checkCredentials("admin", "pw", "admin", "pw"), true);
  assert.equal(checkCredentials("Admin", "pw", "admin", "pw"), false);
  assert.equal(checkCredentials("admin", "pw ", "admin", "pw"), false);
  assert.equal(checkCredentials("admin", "", "admin", undefined), false);
});

test("safeNext only returns into this locale's dashboard", () => {
  assert.equal(safeNext("ar", "/ar/dashboard/units?view=grid"), "/ar/dashboard/units?view=grid");
  assert.equal(safeNext("ar", "https://evil.test/ar/dashboard"), "/ar/dashboard");
  assert.equal(safeNext("ar", "//evil.test"), "/ar/dashboard");
  assert.equal(safeNext("en", "/ar/dashboard"), "/en/dashboard");
  assert.equal(safeNext("ar", null), "/ar/dashboard");
});
