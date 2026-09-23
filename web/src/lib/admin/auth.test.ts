import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthorized } from "./auth.ts";

const basic = (userPass: string) => "Basic " + Buffer.from(userPass, "utf8").toString("base64");

test("accepts the right password with any username", () => {
  assert.equal(isAuthorized(basic("anyone:s3cret"), "s3cret"), true);
});

test("accepts passwords containing colons and non-ASCII", () => {
  assert.equal(isAuthorized(basic("admin:a:b"), "a:b"), true);
  assert.equal(isAuthorized(basic("admin:كلمة-سر"), "كلمة-سر"), true);
});

test("rejects everything else", () => {
  assert.equal(isAuthorized(basic("admin:wrong"), "s3cret"), false);
  assert.equal(isAuthorized(null, "s3cret"), false);
  assert.equal(isAuthorized("Bearer abc", "s3cret"), false);
  assert.equal(isAuthorized("Basic !!!not-base64!!!", "s3cret"), false);
  assert.equal(isAuthorized(basic("no-colon"), "s3cret"), false);
});

test("an unset password rejects everyone, including an empty guess", () => {
  assert.equal(isAuthorized(basic("admin:"), ""), false);
  assert.equal(isAuthorized(basic("admin:"), undefined), false);
});
