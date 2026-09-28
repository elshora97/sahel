/** The public search filters, as they live in the URL. */

export const UNIT_TYPES = ["chalet", "villa", "twin", "town", "penthouse", "studio", "apartment"] as const;
export const UNIT_VIEWS = ["sea", "lagoon", "pool", "garden", "street"] as const;
export const SORTS = ["created_desc", "sea_distance_asc", "bedrooms_desc"] as const;
export const SEA_DISTANCES = [100, 300, 500, 1000] as const;

export interface Filters {
  area: string;
  compound: string;
  type: string;
  view: string;
  guests: number;
  bedrooms: number;
  maxSeaDistance: number;
  sort: string;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function oneOf(v: string, allowed: readonly string[]): string {
  return allowed.includes(v) ? v : "";
}

function positive(v: string): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseSearchParams(raw: Raw): Filters {
  return {
    area: first(raw.area),
    compound: first(raw.compound),
    type: oneOf(first(raw.type), UNIT_TYPES),
    view: oneOf(first(raw.view), UNIT_VIEWS),
    guests: positive(first(raw.guests)),
    bedrooms: positive(first(raw.bedrooms)),
    maxSeaDistance: positive(first(raw.maxSeaDistance)),
    sort: oneOf(first(raw.sort), SORTS),
    page: positive(first(raw.page)) || 1,
  };
}

/** The query string for these filters (no leading "?"); page 1 is implied. */
export function filtersToQuery(f: Filters, page = f.page): string {
  const q = new URLSearchParams();
  for (const key of ["area", "compound", "type", "view", "guests", "bedrooms", "maxSeaDistance", "sort"] as const) {
    const v = f[key];
    if (v) q.set(key, String(v));
  }
  if (page > 1) q.set("page", String(page));
  return q.toString();
}

/** How many narrowing filters are on (sort and page don't narrow). */
export function activeFilterCount(f: Filters): number {
  return [f.area, f.compound, f.type, f.view, f.guests, f.bedrooms, f.maxSeaDistance].filter(Boolean).length;
}
