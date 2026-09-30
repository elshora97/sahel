import { test } from "node:test";
import assert from "node:assert/strict";
import { pounds, toCsv } from "./csv.ts";

test("toCsv adds a BOM, quotes what needs it and uses CRLF", () => {
  assert.equal(toCsv([["Ref", "Guest"], ["BES-4F92K", 'Mona "Mo", Ali'], ["BES-X", "سطر\nجديد"]]), '﻿Ref,Guest\r\nBES-4F92K,"Mona ""Mo"", Ali"\r\nBES-X,"سطر\nجديد"\r\n');
});

test("toCsv defuses cells a spreadsheet would run as formulas", () => {
  assert.equal(toCsv([["=HYPERLINK(1)", "+20", "-x", "@a", "safe", 5]]), "﻿'=HYPERLINK(1),'+20,'-x,'@a,safe,5\r\n");
});

test("pounds prints two decimals", () => {
  assert.equal(pounds(150000), "1500.00");
  assert.equal(pounds(12345), "123.45");
});
