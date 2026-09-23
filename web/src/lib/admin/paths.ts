/** URL helpers for the locale-prefixed admin (spec §2). Pure: used by middleware and tests. */

const dashboardPattern = /^\/(ar|en)\/dashboard(?:\/|$)/;
const entityPattern = /^(\/(?:ar|en)\/dashboard\/(?:areas|compounds|owners|units))(?:\/|$)/;

export function isDashboardPath(pathname: string): boolean {
  return dashboardPattern.test(pathname);
}

/** Old un-prefixed admin URLs keep working: they land on the Arabic admin. */
export function legacyDashboardTarget(pathname: string): string | null {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return `/ar${pathname}`;
  return null;
}

/** "/ar/dashboard/units/abc" → "/ar/dashboard/units"; null outside an entity. */
export function entityBase(pathname: string): string | null {
  return entityPattern.exec(pathname)?.[1] ?? null;
}

export function dashboardHref(locale: string, path = ""): string {
  return `/${locale}/dashboard${path}`;
}

/** Server Actions are public endpoints: never trust a locale argument. */
export function safeLocale(locale: string): "ar" | "en" {
  return locale === "en" ? "en" : "ar";
}
