/**
 * CSV for spreadsheets: a UTF-8 byte-order mark so Excel reads Arabic, CRLF
 * line ends, and quoting where a cell needs it. A cell that a spreadsheet
 * would run as a formula (starting with = + - @ or a tab) gets a leading
 * apostrophe, since guest names and notes are typed by the public.
 */
export function toCsv(rows: Array<Array<string | number>>): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

function cell(v: string | number): string {
  if (typeof v === "number") return String(v);
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Piasters as pounds with two decimals, the way a spreadsheet sums them. */
export function pounds(piasters: number): string {
  return (piasters / 100).toFixed(2);
}
