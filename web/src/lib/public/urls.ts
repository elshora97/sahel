/** URL of a public API route: base + /api/v1 + path (+ query). */
export function apiUrl(base: string, path: string, query = ""): string {
  return `${base.replace(/\/+$/, "")}/api/v1${encodeURI(path)}${query ? `?${query}` : ""}`;
}

/** Page count and the previous/next page numbers, or null at the ends. */
export function pageWindow(page: number, size: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  return { pages, prev: page > 1 ? page - 1 : null, next: page < pages ? page + 1 : null };
}
