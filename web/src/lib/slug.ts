/**
 * Client-side mirror of api/internal/slug.Make: strip diacritics, lowercase,
 * collapse every run of non [a-z0-9] into one hyphen, trim hyphens. The API
 * re-checks, so a divergence here only costs a validation round-trip.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
