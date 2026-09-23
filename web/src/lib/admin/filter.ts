import type { UnitRow } from "./types";

/** List search and filters (spec §6.3), applied in the page over the admin list. */

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string {
  const value = sp[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

const fold = (s: string) => s.normalize("NFKC").toLocaleLowerCase();

export function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return fields.some((f) => f != null && fold(f).includes(q));
}

export function filterByQuery<T>(rows: T[], query: string, fields: (row: T) => Array<string | null | undefined>): T[] {
  return rows.filter((row) => matchesQuery(query, fields(row)));
}

export interface UnitFilters {
  q: string;
  status: string;
  compound: string;
  type: string;
}

export function unitFilters(sp: SearchParams): UnitFilters {
  return { q: param(sp, "q"), status: param(sp, "status"), compound: param(sp, "compound"), type: param(sp, "type") };
}

export function filterUnits(rows: UnitRow[], f: UnitFilters): UnitRow[] {
  return rows.filter(
    (u) =>
      (!f.status || u.status === f.status) &&
      (!f.compound || u.compound_id === f.compound) &&
      (!f.type || u.type === f.type) &&
      matchesQuery(f.q, [u.title_ar, u.title_en, u.slug]),
  );
}

export function hasFilters(values: Record<string, string>): boolean {
  return Object.values(values).some(Boolean);
}

/** Units show as a grid unless the URL asks for the table. */
export function listView(sp: SearchParams): "grid" | "table" {
  return param(sp, "view") === "table" ? "table" : "grid";
}

/** The list's current query (filters, search, view) for returning to it after a row action. */
export function listQuery(sp: SearchParams): string {
  const query = new URLSearchParams();
  for (const key of Object.keys(sp)) {
    const value = param(sp, key);
    if (value && key !== "done" && key !== "name") query.set(key, value);
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}
