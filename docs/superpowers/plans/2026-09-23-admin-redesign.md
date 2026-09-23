# Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin on the Beet Elsahel design system under `/[locale]/dashboard` (Arabic RTL default, English LTR). It gets a sidebar shell, in-app modals (success after create/update/delete, confirm before delete, discard-changes on leaving), a sectioned unit form with a sticky save bar, and search and filters on the lists.

**Architecture:**
- Styling: the system's `bundle.css` is copied verbatim into `web/src/styles/` (in the `components` cascade layer), and its tokens go into `globals.css`.
- `components/ds/*` are thin React wrappers over its classes: Button, StateBadge, Card, StatTile, DataTable, Modal on native `<dialog>`.
- Admin pages move to `app/[locale]/dashboard/**`. The layout mounts three client providers: `UnsavedChangesProvider`, `ToastProvider` and `ActionResultModal`.
- Server Actions take the locale as a bound argument and redirect with `?done=…&name=…`. The layout's result modal reads those parameters, then strips them from the URL.
- Filtering is a pure helper run in the page over the admin list endpoints.

**Tech Stack:** Next.js 15.5, React 19, next-intl 4, Tailwind 4, Node 22 test runner; Go 1.23 + sqlc for two additive list fields.

**Spec:** `docs/superpowers/specs/2026-09-23-admin-redesign-design.md`.

---

## Conventions

- `GO '<cmd>'` is the Docker Go wrapper defined in `docs/superpowers/plans/2026-09-23-phase-2c-admin-api.md` ("Running Go").
- Web commands run from `web/`.
- "Create `path`" means write that file with exactly the code below it (overwrite if it exists). "Delete" means `git rm`.
- The design-system stylesheet was saved by `Artifact read` to `$DS = <scratchpad>/artifact-files/a0252947-c48c-49af-bb1f-cb8ea087a78b/project/components/bundle.css` (version `1790169313-6dfc`).
- Every admin file obeys spec §3's rules: logical properties only, one primary button per view, no arrows or emoji in labels, `num` class on numbers and dates.

---

## Task 1 — API: localised names and ids on the admin lists

**Files:** `api/internal/store/postgres/queries/admin_units.sql`, `api/internal/store/postgres/queries/admin_compounds.sql`, `api/internal/http/admin_units_test.go`, `api/internal/http/admin_compounds_test.go`, `web/src/lib/admin/types.ts`

- [ ] **Step 1: Failing assertions**

In `admin_units_test.go` `TestAdminUnits_CRUD`, after the `list :=` check, add:

```go
	if list[0].CompoundNameAr != "ه" || uuidString(list[0].CompoundID) != compoundID {
		t.Fatalf("list row compound = %q / %s, want ه / %s", list[0].CompoundNameAr, uuidString(list[0].CompoundID), compoundID)
	}
```

In `admin_compounds_test.go` `TestAdminCompounds_CRUD`, after the `list :=` check, add:

```go
	if list[1].AreaNameAr != "ن" {
		t.Fatalf("area_name_ar = %q", list[1].AreaNameAr)
	}
```

Run: `GO 'go vet ./internal/http/'` → fails: `list[0].CompoundNameAr undefined`.

- [ ] **Step 2: Queries**

In `admin_units.sql` `AdminListUnits`, change the select list's first line to `SELECT u.id, u.compound_id, u.slug, u.title_ar, u.title_en, u.type, u.status,` and the line `c.name_en AS compound_name_en, o.name AS owner_name,` to `c.name_ar AS compound_name_ar, c.name_en AS compound_name_en, o.name AS owner_name,`.

In `admin_compounds.sql` `AdminListCompounds`, change `SELECT c.*, a.name_en AS area_name_en` to `SELECT c.*, a.name_ar AS area_name_ar, a.name_en AS area_name_en`.

Run: `GO 'go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 generate && go test ./internal/http/ -run "TestAdminUnits|TestAdminCompounds"'` → PASS.

- [ ] **Step 3: TS types**

In `web/src/lib/admin/types.ts`:
- In `CompoundRow`, add `area_name_ar: string;` before `area_name_en`.
- In `UnitRow`, add `compound_id: string;` after `id` and `compound_name_ar: string;` before `compound_name_en`.

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/postgres/ api/internal/http/admin_units_test.go api/internal/http/admin_compounds_test.go web/src/lib/admin/types.ts
git commit -m "feat(admin): Arabic names and compound id on admin list rows"
```

---

## Task 2 — Design tokens, component stylesheet, build output dir

**Files:** `web/src/styles/beet-elsahel.css`, `web/src/app/globals.css`, `web/next.config.ts`, `.gitignore`

- [ ] **Step 1: Copy the stylesheet**

```bash
{ printf '/*\n  Beet Elsahel component styles, copied verbatim from the design system\n  https://claude.ai/artifact/LmyUFrChGwsFN9WBnvPLux (version 1790169313-6dfc,\n  project/components/bundle.css). Only the Google Fonts @import was dropped:\n  next/font loads Readex Pro. To update, re-copy; never edit by hand.\n*/\n'; tail -n +2 "$DS"; } > web/src/styles/beet-elsahel.css
```

Check: `head -12 web/src/styles/beet-elsahel.css` shows the header, then the `/* Beet Elsahel component styles…` comment, and no `@import`.

- [ ] **Step 2: Replace `web/src/app/globals.css`**

Create `web/src/app/globals.css`:

```css
@import "tailwindcss";
/* In the components layer so Tailwind utilities can still adjust layout. */
@import "../styles/beet-elsahel.css" layer(components);

/*
  Beet Elsahel tokens: design system version 1790169313-6dfc,
  project/tokens.json. No colour is defined anywhere but here and in the
  copied component sheet.
*/
:root {
  --ink: #0b2a3a;
  --ink-muted: #4b6270;
  --sea: #0f7c86;
  --sea-deep: #0b636b;
  --lagoon: #7fd4d0;
  --sand: #e8dcc8;
  --shell: #fbfaf7;
  --surface: #ffffff;
  --sun: #f2b233;
  --sun-soft: #f9eacc;
  --lagoon-soft: #d0ede9;
  --sea-soft: #e3edec;
  --state-blocked: #b9c2c6;
  --state-past: #e7eaea;
  --line: #dee1e0;
  --line-control: #77888f;
  --danger: #a32d2d;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sheet: 0 8px 24px rgba(11, 42, 58, 0.1);

  /* shadcn/ui theme variables, mapped onto the palette above. */
  --background: var(--shell);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface);
  --popover-foreground: var(--ink);
  --primary: var(--sea);
  --primary-foreground: var(--shell);
  --secondary: var(--sand);
  --secondary-foreground: var(--ink);
  --muted: var(--sand);
  --muted-foreground: var(--ink-muted);
  --accent: var(--lagoon);
  --accent-foreground: var(--ink);
  --destructive: var(--danger);
  --destructive-foreground: var(--shell);
  --border: var(--line);
  --input: var(--line-control);
  --ring: var(--sea);
  --radius: 8px;
}

@theme inline {
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-sea: var(--sea);
  --color-sea-deep: var(--sea-deep);
  --color-lagoon: var(--lagoon);
  --color-sand: var(--sand);
  --color-shell: var(--shell);
  --color-surface: var(--surface);
  --color-sun: var(--sun);
  --color-sun-soft: var(--sun-soft);
  --color-lagoon-soft: var(--lagoon-soft);
  --color-sea-soft: var(--sea-soft);
  --color-state-blocked: var(--state-blocked);
  --color-state-past: var(--state-past);
  --color-line: var(--line);
  --color-line-control: var(--line-control);
  --color-danger: var(--danger);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --font-sans: var(--font-readex), system-ui, sans-serif;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sheet: 0 8px 24px rgba(11, 42, 58, 0.1);
}

@layer base {
  * {
    border-color: var(--border);
  }

  body {
    /* Declared on body, where next/font sets --font-readex, so it resolves. */
    --font-sans: var(--font-readex), system-ui, sans-serif;
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    font-weight: 400;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /*
    Every price, date and calendar cell. Tabular figures are what keep a
    calendar column aligned when the digits change.
  */
  .num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  /* Latin display type is tightened; Arabic keeps its default tracking. */
  :lang(en) .display {
    letter-spacing: -0.02em;
  }

  .prose-measure {
    max-width: 68ch;
  }
}
```

- [ ] **Step 3: Separate build output**

In `web/next.config.ts`, add inside `nextConfig` before `experimental`:

```ts
  // Lets `NEXT_DIST_DIR=.next-build npm run build` run beside a live `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
```

Append `.next-build/` to the root `.gitignore`.

- [ ] **Step 4: Verify and commit**

Run: `cd web && npx tsc --noEmit && npm test`. Expected: exit 0, tests pass. With your dev server running, `/ar` still renders its palette demo in the same colours.

```bash
git add web/src/styles/beet-elsahel.css web/src/app/globals.css web/next.config.ts .gitignore
git commit -m "feat(web): Beet Elsahel tokens and component stylesheet"
```

---

## Task 3 — Pure helpers (TDD)

**Files:** `web/src/lib/admin/{paths,result,filter,labels,unsaved}.ts` with a `.test.ts` beside each.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/admin/paths.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardHref, entityBase, isDashboardPath, legacyDashboardTarget, safeLocale } from "./paths.ts";

test("dashboard paths are locale-prefixed", () => {
  assert.equal(isDashboardPath("/ar/dashboard"), true);
  assert.equal(isDashboardPath("/en/dashboard/units/x"), true);
  assert.equal(isDashboardPath("/ar/dashboards"), false);
  assert.equal(isDashboardPath("/dashboard"), false);
  assert.equal(isDashboardPath("/ar"), false);
});

test("legacy /dashboard redirects to Arabic", () => {
  assert.equal(legacyDashboardTarget("/dashboard"), "/ar/dashboard");
  assert.equal(legacyDashboardTarget("/dashboard/units/1"), "/ar/dashboard/units/1");
  assert.equal(legacyDashboardTarget("/dashboards"), null);
  assert.equal(legacyDashboardTarget("/ar/dashboard"), null);
});

test("entityBase finds the list a record page belongs to", () => {
  assert.equal(entityBase("/en/dashboard/units/abc"), "/en/dashboard/units");
  assert.equal(entityBase("/ar/dashboard/areas"), "/ar/dashboard/areas");
  assert.equal(entityBase("/ar/dashboard"), null);
});

test("hrefs and locale guard", () => {
  assert.equal(dashboardHref("en", "/owners"), "/en/dashboard/owners");
  assert.equal(dashboardHref("ar"), "/ar/dashboard");
  assert.equal(safeLocale("en"), "en");
  assert.equal(safeLocale("fr"), "ar");
});
```

Create `web/src/lib/admin/result.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readResult, withResult, withoutResult } from "./result.ts";

test("withResult appends to paths with and without a query", () => {
  assert.equal(withResult("/ar/dashboard/units", "deleted", "Villa 4BR"), "/ar/dashboard/units?done=deleted&name=Villa+4BR");
  assert.equal(withResult("/x?q=a", "saved", "ب"), "/x?q=a&done=saved&name=%D8%A8");
});

test("readResult accepts only known kinds", () => {
  assert.deepEqual(readResult(new URLSearchParams("done=created&name=Marassi")), { kind: "created", name: "Marassi" });
  assert.equal(readResult(new URLSearchParams("done=exploded&name=x")), null);
  assert.equal(readResult(new URLSearchParams("q=a")), null);
  assert.deepEqual(readResult(new URLSearchParams("done=saved")), { kind: "saved", name: "" });
});

test("withoutResult keeps other parameters", () => {
  assert.equal(withoutResult(new URLSearchParams("q=a&done=saved&name=x&status=draft")), "?q=a&status=draft");
  assert.equal(withoutResult(new URLSearchParams("done=saved&name=x")), "");
});
```

Create `web/src/lib/admin/filter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByQuery, filterUnits, hasFilters, matchesQuery, param, unitFilters } from "./filter.ts";
import type { UnitRow } from "./types";

const unit = (over: Partial<UnitRow>): UnitRow => ({
  id: "1", compound_id: "c1", slug: "sea-chalet", title_ar: "شاليه على البحر", title_en: "Sea Chalet",
  type: "chalet", status: "active", bedrooms: 2, max_guests: 6, updated_at: "2026-09-23T10:00:00Z",
  compound_name_ar: "هاسيندا", compound_name_en: "Hacienda", owner_name: "O", cover_url: null, ...over,
});

const rows = [
  unit({}),
  unit({ id: "2", slug: "garden-villa", title_ar: "فيلا الحديقة", title_en: "Garden Villa", type: "villa", status: "draft", compound_id: "c2" }),
  unit({ id: "3", slug: "old-studio", title_ar: "استوديو", title_en: "Old Studio", type: "studio", status: "archived" }),
];

test("matchesQuery is case-insensitive and treats blank as a match", () => {
  assert.equal(matchesQuery("", ["x"]), true);
  assert.equal(matchesQuery("  CHALET ", ["Sea Chalet"]), true);
  assert.equal(matchesQuery("فيلا", ["فيلا الحديقة", null]), true);
  assert.equal(matchesQuery("pool", [undefined, "Sea"]), false);
});

test("filterUnits: each filter, then combined", () => {
  const ids = (f: Partial<ReturnType<typeof unitFilters>>) =>
    filterUnits(rows, { q: "", status: "", compound: "", type: "", ...f }).map((u) => u.id);
  assert.deepEqual(ids({}), ["1", "2", "3"]);
  assert.deepEqual(ids({ q: "فيلا" }), ["2"]);
  assert.deepEqual(ids({ q: "studio" }), ["3"]);
  assert.deepEqual(ids({ status: "draft" }), ["2"]);
  assert.deepEqual(ids({ compound: "c1" }), ["1", "3"]);
  assert.deepEqual(ids({ type: "villa" }), ["2"]);
  assert.deepEqual(ids({ compound: "c1", status: "active", q: "sea" }), ["1"]);
});

test("filterByQuery uses the given fields", () => {
  const areas = [{ n: "North Coast" }, { n: "Sokhna" }];
  assert.deepEqual(filterByQuery(areas, "sok", (a) => [a.n]), [{ n: "Sokhna" }]);
});

test("params and hasFilters", () => {
  assert.equal(param({ q: [" a ", "b"] }, "q"), "a");
  assert.equal(param({}, "q"), "");
  assert.deepEqual(unitFilters({ status: "draft", x: "1" }), { q: "", status: "draft", compound: "", type: "" });
  assert.equal(hasFilters({ q: "", status: "" }), false);
  assert.equal(hasFilters({ q: "", status: "draft" }), true);
});
```

Create `web/src/lib/admin/labels.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { enumOptions, other, pick, unitStatusTone } from "./labels.ts";

test("unit status maps to a badge tone", () => {
  assert.equal(unitStatusTone("active"), "confirmed");
  assert.equal(unitStatusTone("draft"), "neutral");
  assert.equal(unitStatusTone("paused"), "attention");
  assert.equal(unitStatusTone("archived"), "muted");
  assert.equal(unitStatusTone("unknown"), "neutral");
});

test("pick prefers the locale and falls back to the other language", () => {
  assert.equal(pick("ar", "مراسي", "Marassi"), "مراسي");
  assert.equal(pick("en", "مراسي", "Marassi"), "Marassi");
  assert.equal(pick("en", "مراسي", ""), "مراسي");
  assert.equal(other("ar", "مراسي", "Marassi"), "Marassi");
});

test("enumOptions keeps API values and adds labels", () => {
  assert.deepEqual(enumOptions(["sea", "pool"], (v) => v.toUpperCase()), [
    { value: "sea", label: "SEA" },
    { value: "pool", label: "POOL" },
  ]);
});
```

Create `web/src/lib/admin/unsaved.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsLeavePrompt } from "./unsaved.ts";

test("only a dirty form leaving the page asks", () => {
  assert.equal(needsLeavePrompt(false, "/dashboard/units"), false);
  assert.equal(needsLeavePrompt(true, "/dashboard/units"), true);
  assert.equal(needsLeavePrompt(true, "#location"), false);
});
```

Run: `cd web && npm test` → FAIL: `Cannot find module …/paths.ts` (and the others).

- [ ] **Step 2: Implement**

Create `web/src/lib/admin/paths.ts`:

```ts
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
```

Create `web/src/lib/admin/result.ts`:

```ts
/** The ?done=&name= handshake between a Server Action's redirect and the result modal. */

export const resultKinds = ["created", "saved", "deleted"] as const;
export type ResultKind = (typeof resultKinds)[number];
export interface ActionResult {
  kind: ResultKind;
  name: string;
}

export function withResult(path: string, kind: ResultKind, name: string): string {
  const query = new URLSearchParams({ done: kind, name }).toString();
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export function readResult(params: URLSearchParams): ActionResult | null {
  const kind = params.get("done");
  if (!kind || !(resultKinds as readonly string[]).includes(kind)) return null;
  return { kind: kind as ResultKind, name: params.get("name") ?? "" };
}

/** The query string with the handshake removed ("" or "?a=b"). */
export function withoutResult(params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  rest.delete("done");
  rest.delete("name");
  const query = rest.toString();
  return query ? `?${query}` : "";
}
```

Create `web/src/lib/admin/filter.ts`:

```ts
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
```

Create `web/src/lib/admin/labels.ts`:

```ts
/** Display helpers shared by admin pages. Pure. */

export type Tone = "free" | "held" | "confirmed" | "neutral" | "muted" | "blocked" | "attention" | "danger";

export function unitStatusTone(status: string): Tone {
  switch (status) {
    case "active":
      return "confirmed";
    case "paused":
      return "attention";
    case "archived":
      return "muted";
    default:
      return "neutral";
  }
}

/** The text in the page's language, falling back to the other one. */
export function pick(locale: string, ar: string | null | undefined, en: string | null | undefined): string {
  return (locale === "ar" ? ar || en : en || ar) ?? "";
}

/** The text in the other language (shown muted under the main one). */
export function other(locale: string, ar: string | null | undefined, en: string | null | undefined): string {
  return (locale === "ar" ? en : ar) ?? "";
}

export function enumOptions(values: string[], label: (value: string) => string) {
  return values.map((value) => ({ value, label: label(value) }));
}

export function formatWhen(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  });
}
```

Create `web/src/lib/admin/unsaved.ts`:

```ts
/** Whether following `href` should ask "Discard unsaved changes?". In-page anchors never ask. */
export function needsLeavePrompt(dirty: boolean, href: string): boolean {
  return dirty && !href.startsWith("#");
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd web && npm test && npx tsc --noEmit` → all tests pass, exit 0.

```bash
git add web/src/lib/admin/
git commit -m "feat(web): admin path, result, filter and label helpers"
```

---

## Task 4 — Admin copy (Arabic and English)

**Files:** `web/src/messages/admin/ar.json`, `web/src/messages/admin/en.json`, `web/src/i18n/request.ts`

- [ ] **Step 1: Messages**

Create `web/src/messages/admin/ar.json`:

```json
{
  "admin": {
    "shell": {
      "brand": "بيت الساحل",
      "subtitle": "لوحة التحكم",
      "role": "مسؤول",
      "switchLanguage": "English",
      "openMenu": "القائمة",
      "closeMenu": "إغلاق القائمة",
      "navLabel": "أقسام لوحة التحكم"
    },
    "nav": {
      "overview": "نظرة عامة",
      "areas": "المناطق",
      "compounds": "الكمبوندات",
      "owners": "الملاك",
      "units": "الوحدات"
    },
    "actions": {
      "save": "حفظ التغييرات",
      "saving": "جارٍ الحفظ…",
      "cancel": "إلغاء",
      "delete": "حذف",
      "deleting": "جارٍ الحذف…",
      "done": "تم",
      "backToList": "العودة للقائمة",
      "addAnother": "إضافة آخر",
      "keepEditing": "متابعة التعديل",
      "discard": "تجاهل",
      "clear": "مسح",
      "moveEarlier": "تقديم الصورة",
      "moveLater": "تأخير الصورة",
      "addImages": "رفع صور",
      "working": "جارٍ التنفيذ…",
      "makeCover": "اجعلها الغلاف",
      "viewPublic": "عرض الصفحة العامة"
    },
    "feedback": {
      "created": "تمت الإضافة",
      "createdBody": "تمت إضافة «{name}».",
      "saved": "تم الحفظ",
      "savedBody": "تم حفظ التغييرات على «{name}».",
      "deleted": "تم الحذف",
      "deletedBody": "تم حذف «{name}».",
      "notSaved": "لم يتم الحفظ",
      "cantDelete": "لا يمكن الحذف",
      "unsavedTitle": "تجاهل التغييرات غير المحفوظة؟",
      "unsavedBody": "ستضيع تعديلاتك على هذا النموذج.",
      "unsavedHint": "تغييرات غير محفوظة",
      "imagesUploadedTitle": "تم رفع الصور",
      "imagesUploaded": "تم رفع {count} من الصور.",
      "imageDeleted": "تم حذف الصورة.",
      "coverUpdated": "تم تحديث الغلاف",
      "altSaved": "تم حفظ النص البديل",
      "orderSaved": "تم حفظ الترتيب"
    },
    "confirm": {
      "deleteTitle": "حذف «{name}»؟",
      "imageTitle": "حذف هذه الصورة؟",
      "deleteBody": "لا يمكن التراجع عن هذا.",
      "unit": "ستُحذف صورها أيضًا.",
      "referenced": "الحذف ممكن فقط إذا لم يكن مستخدمًا في أي مكان.",
      "image": "ستختفي من صفحة الوحدة فورًا."
    },
    "list": {
      "search": "بحث",
      "all": "الكل",
      "count": "العدد: {count}",
      "countFiltered": "العدد: {count} · المطابق: {matched}",
      "noResults": "لا توجد نتائج مطابقة"
    },
    "form": {
      "sections": "أقسام النموذج",
      "dangerZone": "منطقة الخطر",
      "pairAr": "عربي",
      "pairEn": "English"
    },
    "slug": {
      "label": "الرابط المختصر",
      "idle": "اتركه فارغًا ليتولد من الاسم الإنجليزي.",
      "checking": "جارٍ التحقق…",
      "taken": "مستخدم بالفعل. اختر غيره.",
      "free": "متاح."
    },
    "overview": {
      "heading": "نظرة عامة",
      "statActive": "وحدات منشورة",
      "statDrafts": "مسودات",
      "statCompounds": "كمبوندات",
      "statOwners": "ملاك",
      "noteActive": "من أصل {total} وحدة",
      "noteDrafts": "غير ظاهرة للضيوف",
      "attention": "تحتاج إلى متابعة",
      "reasonDraft": "مسودة",
      "reasonNoCover": "بدون صورة غلاف",
      "recent": "آخر التعديلات",
      "empty": "لا توجد وحدات بعد.",
      "createFirst": "أضف أول وحدة"
    },
    "notFound": {
      "heading": "غير موجود",
      "body": "هذا السجل غير موجود، أو تم حذفه.",
      "back": "العودة للنظرة العامة"
    },
    "areas": {
      "heading": "المناطق",
      "new": "إضافة منطقة",
      "search": "ابحث بالاسم أو الرابط",
      "empty": "لا توجد مناطق بعد.",
      "basics": "بيانات المنطقة",
      "name": "الاسم",
      "region": "الإقليم",
      "km": "الكيلو",
      "kmHint": "رقم الكيلو على الطريق الساحلي.",
      "order": "ترتيب العرض",
      "orderHint": "الأصغر يظهر أولًا."
    },
    "compounds": {
      "heading": "الكمبوندات",
      "new": "إضافة كمبوند",
      "search": "ابحث بالاسم أو الرابط",
      "empty": "لا توجد كمبوندات بعد. أضف منطقة أولًا.",
      "basics": "بيانات الكمبوند",
      "descriptionSection": "الوصف",
      "place": "الموقع والغلاف",
      "amenitiesSection": "المرافق والبوابة",
      "name": "الاسم",
      "area": "المنطقة",
      "beach": "نوع الشاطئ",
      "featured": "مميز في الصفحة الرئيسية",
      "featuredCol": "مميز",
      "featuredYes": "مميز",
      "description": "الوصف",
      "amenities": "المرافق",
      "amenitiesHint": "افصل بينها بفاصلة: شاطئ خاص، لاجونات، حمامات سباحة…",
      "gate": "معلومات البوابة",
      "lat": "خط العرض",
      "lng": "خط الطول",
      "cover": "رابط صورة الغلاف"
    },
    "owners": {
      "heading": "الملاك",
      "new": "إضافة مالك",
      "search": "ابحث بالاسم أو الهاتف أو البريد",
      "empty": "لا يوجد ملاك بعد.",
      "contact": "بيانات التواصل",
      "terms": "الشروط والملاحظات",
      "name": "الاسم",
      "phone": "الهاتف",
      "email": "البريد الإلكتروني",
      "nationalId": "الرقم القومي",
      "commission": "العمولة %",
      "notes": "ملاحظات",
      "notesHint": "داخلية فقط."
    },
    "units": {
      "heading": "الوحدات",
      "new": "إضافة وحدة",
      "newHint": "احفظ البيانات الأساسية أولًا، ثم أضف الصور في الشاشة التالية.",
      "search": "ابحث بالعنوان أو الرابط",
      "empty": "لا توجد وحدات بعد. أضف كمبوند ومالكًا أولًا.",
      "filterStatus": "الحالة",
      "filterCompound": "الكمبوند",
      "filterType": "النوع",
      "titleCol": "الوحدة",
      "compound": "الكمبوند",
      "owner": "المالك",
      "type": "النوع",
      "status": "الحالة",
      "edited": "آخر تعديل",
      "statusHint": "الوحدات المنشورة فقط تظهر للضيوف.",
      "sectionBasics": "الأساسيات",
      "sectionText": "العنوان والوصف",
      "sectionRooms": "الغرف والضيوف",
      "sectionLocation": "الموقع",
      "sectionAmenities": "المرافق وقواعد الإقامة",
      "sectionPrivate": "بيانات خاصة",
      "sectionImages": "الصور",
      "title": "العنوان",
      "description": "الوصف",
      "houseRules": "قواعد الإقامة",
      "bedrooms": "غرف النوم",
      "bathrooms": "الحمامات",
      "baseGuests": "الضيوف الأساسيون",
      "maxGuests": "أقصى عدد للضيوف",
      "areaSqm": "المساحة (م²)",
      "seaDistance": "المسافة من البحر (م)",
      "row": "الصف",
      "rowHint": "1 = الصف الأول.",
      "view": "الإطلالة",
      "floor": "الدور",
      "lat": "خط العرض",
      "lng": "خط الطول",
      "amenities": "المرافق",
      "amenitiesHint": "افصل بينها بفاصلة: واي فاي، حمام سباحة، شواية…",
      "exactAddress": "العنوان التفصيلي",
      "exactAddressHint": "للإدارة فقط. لا يظهر أبدًا في الموقع العام.",
      "imagesHint": "JPEG أو PNG أو WebP، حتى 10 ميجابايت لكل صورة. أول صورة تصبح الغلاف.",
      "noImages": "لا توجد صور بعد.",
      "cover": "الغلاف",
      "altAr": "النص البديل بالعربية",
      "altEn": "Alt text in English"
    }
  },
  "enums": {
    "region": {
      "north_coast": "الساحل الشمالي",
      "sokhna": "العين السخنة",
      "gouna": "الجونة",
      "ras_sudr": "رأس سدر",
      "new_cairo": "القاهرة الجديدة"
    },
    "beach_type": {
      "sea": "بحر",
      "lagoon": "لاجون",
      "both": "بحر ولاجون",
      "none": "بدون شاطئ"
    },
    "type": {
      "chalet": "شاليه",
      "villa": "فيلا",
      "twin": "توين هاوس",
      "town": "تاون هاوس",
      "penthouse": "بنتهاوس",
      "studio": "استوديو",
      "apartment": "شقة"
    },
    "view": {
      "sea": "على البحر",
      "lagoon": "على اللاجون",
      "pool": "على حمام السباحة",
      "garden": "على الحديقة",
      "street": "على الشارع"
    },
    "unit_status": {
      "draft": "مسودة",
      "active": "منشورة",
      "paused": "موقوفة مؤقتًا",
      "archived": "مؤرشفة"
    }
  }
}
```

Create `web/src/messages/admin/en.json`:

```json
{
  "admin": {
    "shell": {
      "brand": "Beet Elsahel",
      "subtitle": "Dashboard",
      "role": "Admin",
      "switchLanguage": "العربية",
      "openMenu": "Menu",
      "closeMenu": "Close menu",
      "navLabel": "Dashboard sections"
    },
    "nav": {
      "overview": "Overview",
      "areas": "Areas",
      "compounds": "Compounds",
      "owners": "Owners",
      "units": "Units"
    },
    "actions": {
      "save": "Save changes",
      "saving": "Saving…",
      "cancel": "Cancel",
      "delete": "Delete",
      "deleting": "Deleting…",
      "done": "Done",
      "backToList": "Back to list",
      "addAnother": "Add another",
      "keepEditing": "Keep editing",
      "discard": "Discard",
      "clear": "Clear",
      "moveEarlier": "Move image earlier",
      "moveLater": "Move image later",
      "addImages": "Upload images",
      "working": "Working…",
      "makeCover": "Make cover",
      "viewPublic": "View public page"
    },
    "feedback": {
      "created": "Created",
      "createdBody": "«{name}» was added.",
      "saved": "Saved",
      "savedBody": "Changes to «{name}» were saved.",
      "deleted": "Deleted",
      "deletedBody": "«{name}» was deleted.",
      "notSaved": "Not saved",
      "cantDelete": "Can't delete",
      "unsavedTitle": "Discard unsaved changes?",
      "unsavedBody": "Your edits to this form will be lost.",
      "unsavedHint": "Unsaved changes",
      "imagesUploadedTitle": "Images uploaded",
      "imagesUploaded": "{count, plural, one {# image was} other {# images were}} uploaded.",
      "imageDeleted": "The image was deleted.",
      "coverUpdated": "Cover updated",
      "altSaved": "Alt text saved",
      "orderSaved": "Order saved"
    },
    "confirm": {
      "deleteTitle": "Delete «{name}»?",
      "imageTitle": "Delete this image?",
      "deleteBody": "This can't be undone.",
      "unit": "Its images are removed too.",
      "referenced": "Only possible when nothing uses it.",
      "image": "It disappears from the unit page straight away."
    },
    "list": {
      "search": "Search",
      "all": "All",
      "count": "{count, plural, one {# record} other {# records}}",
      "countFiltered": "{count} total · {matched} match",
      "noResults": "Nothing matches these filters"
    },
    "form": {
      "sections": "Form sections",
      "dangerZone": "Danger zone",
      "pairAr": "عربي",
      "pairEn": "English"
    },
    "slug": {
      "label": "Slug",
      "idle": "Leave blank to generate it from the English name.",
      "checking": "Checking…",
      "taken": "Already used. Pick another.",
      "free": "Available."
    },
    "overview": {
      "heading": "Overview",
      "statActive": "Active units",
      "statDrafts": "Drafts",
      "statCompounds": "Compounds",
      "statOwners": "Owners",
      "noteActive": "of {total} units",
      "noteDrafts": "Not visible to guests",
      "attention": "Needs attention",
      "reasonDraft": "Draft",
      "reasonNoCover": "No cover image",
      "recent": "Recently edited",
      "empty": "No units yet.",
      "createFirst": "Add the first unit"
    },
    "notFound": {
      "heading": "Not found",
      "body": "That record doesn't exist, or it was deleted.",
      "back": "Back to the overview"
    },
    "areas": {
      "heading": "Areas",
      "new": "Add area",
      "search": "Search by name or slug",
      "empty": "No areas yet.",
      "basics": "Area details",
      "name": "Name",
      "region": "Region",
      "km": "Km marker",
      "kmHint": "Km on the coastal road.",
      "order": "Display order",
      "orderHint": "Lower shows first."
    },
    "compounds": {
      "heading": "Compounds",
      "new": "Add compound",
      "search": "Search by name or slug",
      "empty": "No compounds yet. Add an area first.",
      "basics": "Compound details",
      "descriptionSection": "Description",
      "place": "Location and cover",
      "amenitiesSection": "Amenities and gate",
      "name": "Name",
      "area": "Area",
      "beach": "Beach type",
      "featured": "Featured on the home page",
      "featuredCol": "Featured",
      "featuredYes": "Featured",
      "description": "Description",
      "amenities": "Amenities",
      "amenitiesHint": "Comma-separated: private beach, lagoons, pools…",
      "gate": "Gate info",
      "lat": "Latitude",
      "lng": "Longitude",
      "cover": "Cover image URL"
    },
    "owners": {
      "heading": "Owners",
      "new": "Add owner",
      "search": "Search by name, phone or email",
      "empty": "No owners yet.",
      "contact": "Contact details",
      "terms": "Terms and notes",
      "name": "Name",
      "phone": "Phone",
      "email": "Email",
      "nationalId": "National ID",
      "commission": "Commission %",
      "notes": "Notes",
      "notesHint": "Internal only."
    },
    "units": {
      "heading": "Units",
      "new": "Add unit",
      "newHint": "Save the basics first; images are added on the next screen.",
      "search": "Search by title or slug",
      "empty": "No units yet. Add a compound and an owner first.",
      "filterStatus": "Status",
      "filterCompound": "Compound",
      "filterType": "Type",
      "titleCol": "Unit",
      "compound": "Compound",
      "owner": "Owner",
      "type": "Type",
      "status": "Status",
      "edited": "Edited",
      "statusHint": "Only active units are public.",
      "sectionBasics": "Basics",
      "sectionText": "Title and description",
      "sectionRooms": "Rooms and guests",
      "sectionLocation": "Location",
      "sectionAmenities": "Amenities and house rules",
      "sectionPrivate": "Private",
      "sectionImages": "Images",
      "title": "Title",
      "description": "Description",
      "houseRules": "House rules",
      "bedrooms": "Bedrooms",
      "bathrooms": "Bathrooms",
      "baseGuests": "Base guests",
      "maxGuests": "Max guests",
      "areaSqm": "Area (m²)",
      "seaDistance": "Sea distance (m)",
      "row": "Row",
      "rowHint": "1 = first row.",
      "view": "View",
      "floor": "Floor",
      "lat": "Latitude",
      "lng": "Longitude",
      "amenities": "Amenities",
      "amenitiesHint": "Comma-separated: wifi, pool, bbq…",
      "exactAddress": "Exact address",
      "exactAddressHint": "Admin only. Never shown on the public site.",
      "imagesHint": "JPEG, PNG or WebP, up to 10 MB each. The first image becomes the cover.",
      "noImages": "No images yet.",
      "cover": "Cover",
      "altAr": "النص البديل بالعربية",
      "altEn": "Alt text in English"
    }
  },
  "enums": {
    "region": {
      "north_coast": "North Coast",
      "sokhna": "Ain Sokhna",
      "gouna": "El Gouna",
      "ras_sudr": "Ras Sudr",
      "new_cairo": "New Cairo"
    },
    "beach_type": {
      "sea": "Sea",
      "lagoon": "Lagoon",
      "both": "Sea and lagoon",
      "none": "No beach"
    },
    "type": {
      "chalet": "Chalet",
      "villa": "Villa",
      "twin": "Twin house",
      "town": "Town house",
      "penthouse": "Penthouse",
      "studio": "Studio",
      "apartment": "Apartment"
    },
    "view": {
      "sea": "Sea view",
      "lagoon": "Lagoon view",
      "pool": "Pool view",
      "garden": "Garden view",
      "street": "Street view"
    },
    "unit_status": {
      "draft": "Draft",
      "active": "Active",
      "paused": "Paused",
      "archived": "Archived"
    }
  }
}
```

- [ ] **Step 2: Load them with the public copy**

In `web/src/i18n/request.ts`, replace the `messages:` line with:

```ts
    // Public copy and admin copy live in separate files; both load per locale.
    messages: {
      ...(await import(`../messages/${locale}.json`)).default,
      ...(await import(`../messages/admin/${locale}.json`)).default,
    },
```

- [ ] **Step 3: Verify and commit**

Run: `cd web && npx tsc --noEmit && node -e "for (const l of ['ar','en']) JSON.parse(require('fs').readFileSync('src/messages/admin/'+l+'.json','utf8'))"` → exit 0.

```bash
git add web/src/messages/admin/ web/src/i18n/request.ts
git commit -m "feat(web): Arabic and English admin copy"
```

---

## Task 5 — Design-system components

**Files:** `web/src/components/ds/{button,state-badge,card,stat-tile,data-table,modal}.tsx`

- [ ] **Step 1: Create the components**

Create `web/src/components/ds/button.tsx`:

```tsx
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

/** Classes for the system's Button; also used on links that look like buttons. */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", block = false): string {
  return cn("bs-btn", `bs-btn--${variant}`, `bs-btn--${size}`, block && "bs-btn--block");
}

/**
 * Beet Elsahel Button. `primary` once per view: the action that moves the
 * record forward. `danger` only for deletes. Labels are verb phrases, no arrows.
 */
export function Button({
  variant,
  size,
  block,
  className,
  ...rest
}: { variant?: Variant; size?: Size; block?: boolean } & ComponentProps<"button">) {
  return <button type="button" {...rest} className={cn(buttonClass(variant, size, block), className)} />;
}
```

Create `web/src/components/ds/state-badge.tsx`:

```tsx
import type { ReactNode } from "react";

import type { Tone } from "@/lib/admin/labels";

/** The system's StateBadge: a dot and a word, never colour alone. */
export function StateBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`bs-badge bs-badge--${tone}`}>
      <span className="bs-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
```

Create `web/src/components/ds/card.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** `surface` on `shell`, a `line` hairline, `radius-md`. No shadow: cards sit on the page. */
export function Card({
  title,
  actions,
  children,
  id,
  padded = true,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-6 rounded-md border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
          {title && <h2 className="text-lg leading-[26px] font-medium">{title}</h2>}
          {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-6" : undefined}>{children}</div>
    </section>
  );
}
```

Create `web/src/components/ds/stat-tile.tsx`:

```tsx
import type { ComponentProps, ReactNode } from "react";

import { Link } from "@/i18n/navigation";

const tileCls = "flex flex-col gap-1.5 rounded-md border border-line bg-surface p-5 text-ink";

/** A dashboard figure in the `stat` style: 40px, weight 200, tabular. */
export function StatTile({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  href?: ComponentProps<typeof Link>["href"];
}) {
  const body = (
    <>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="num text-[40px] leading-[44px] font-extralight">{value}</span>
      {note && <span className="num text-[13px] text-ink-muted">{note}</span>}
    </>
  );
  if (!href) return <div className={tileCls}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${tileCls} hover:border-sea focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea`}
    >
      {body}
    </Link>
  );
}
```

Create `web/src/components/ds/data-table.tsx`:

```tsx
import type { ReactNode } from "react";

/** Row and cell classes. A row is `relative` so its RowLink can cover it. */
export const rowCls =
  "relative border-b border-line last:border-b-0 hover:bg-sea-soft/60 focus-within:bg-sea-soft";
export const cellCls = "px-4 py-3 align-middle text-sm";

export function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="border-b border-line px-4 py-2.5 text-start text-[13px] font-normal whitespace-nowrap text-ink-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-ink-muted">{children}</div>;
}
```

Create `web/src/components/ds/modal.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Native <dialog> opened with showModal(): focus is trapped, the page is
 * inert, Escape closes, and focus returns to the opener. Put the safe
 * button first and mark it `data-autofocus`; the confirming button goes last.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  /** While true, Escape can't close it (an action is running). */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[440px] rounded-lg bg-surface p-6 text-ink shadow-sheet backdrop:bg-ink/40"
    >
      <h2 id={titleId} className="text-lg leading-[26px] font-medium">
        {title}
      </h2>
      {children && <div className="mt-2 space-y-1 text-[15px] leading-6 text-ink-muted">{children}</div>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div>
    </dialog>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd web && npx tsc --noEmit` → exit 0.

```bash
git add web/src/components/ds/
git commit -m "feat(web): design-system components (button, badge, card, stat, table, modal)"
```

---

## Task 6 — Shell, providers, form kit, routing move, overview

This task replaces the old admin in one step: the old `app/dashboard` pages import components that are rewritten here.

**Files:**
- Delete `web/src/app/dashboard/` (everything), `web/src/components/admin/delete-button.tsx`, `web/src/components/admin/units-table.tsx`.
- Create or replace: `web/src/components/admin/{ui.ts,guarded-link.tsx,unsaved-changes.tsx,toast.tsx,action-result-modal.tsx,sidebar.tsx,page-header.tsx,row-link.tsx,list-count.tsx,fields.tsx,entity-form.tsx,confirm-delete.tsx,filter-bar.tsx,slug-field.tsx,units-table.tsx}`, `web/src/lib/admin/actions.ts`, `web/src/middleware.ts`, `web/src/app/[locale]/dashboard/{layout.tsx,page.tsx,not-found.tsx,slug-action.ts}`.
- Stub: `web/src/components/admin/image-manager.tsx` (the real one lands in Task 10).

- [ ] **Step 1: Remove the old admin**

```bash
git rm -r -q web/src/app/dashboard web/src/components/admin/delete-button.tsx web/src/components/admin/units-table.tsx
```

- [ ] **Step 2: Shared classes and navigation**

Create `web/src/components/admin/ui.ts`:

```ts
/** Form control classes on the system's tokens: surface, line-control border, sea focus ring. */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea";
export const inputCls = `min-h-[42px] w-full rounded-md border border-line-control bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-ink-muted ${focusRing}`;
export const labelCls = "mb-1.5 block text-sm font-medium";
export const hintCls = "mt-1.5 block text-xs leading-4 text-ink-muted";
export const linkCls = `font-medium text-sea hover:text-sea-deep ${focusRing} rounded-sm`;
```

Create `web/src/components/admin/unsaved-changes.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";

type Guard = {
  dirty: boolean;
  setDirty: (formId: string, dirty: boolean) => void;
  /** Runs `go` now, or after the admin confirms discarding their edits. */
  confirmLeave: (go: () => void) => void;
};

const GuardContext = createContext<Guard>({ dirty: false, setDirty: () => {}, confirmLeave: (go) => go() });
export const useUnsavedChanges = () => useContext(GuardContext);

/**
 * Spec §6.1: in-app navigation away from a dirty form asks through our
 * modal. Closing or refreshing the tab can only use the browser's own
 * beforeunload prompt, which is all that is attached for that case.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const [dirtyForms, setDirtyForms] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const leaving = useRef(false);
  const dirty = dirtyForms.size > 0;

  const setDirty = useCallback((formId: string, value: boolean) => {
    setDirtyForms((prev) => {
      if (prev.has(formId) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(formId);
      else next.delete(formId);
      return next;
    });
  }, []);

  const confirmLeave = useCallback(
    (go: () => void) => {
      if (!dirty) return go();
      pending.current = go;
      setAsking(true);
    },
    [dirty],
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Back/forward: while dirty, park a duplicate entry of this page. Popping
  // it means the admin pressed Back; re-park it and ask first.
  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;
    window.history.pushState(window.history.state, "", window.location.href);
    const onPopState = () => {
      if (leaving.current) return;
      window.history.pushState(window.history.state, "", window.location.href);
      pending.current = () => window.history.go(-2);
      setAsking(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty]);

  const stay = () => {
    pending.current = null;
    setAsking(false);
  };
  const leave = () => {
    const go = pending.current;
    pending.current = null;
    leaving.current = true;
    setAsking(false);
    setDirtyForms(new Set());
    go?.();
  };

  const value = useMemo(() => ({ dirty, setDirty, confirmLeave }), [dirty, setDirty, confirmLeave]);

  return (
    <GuardContext.Provider value={value}>
      {children}
      <Modal
        open={asking}
        onClose={stay}
        title={t("feedback.unsavedTitle")}
        actions={
          <>
            <Button variant="secondary" data-autofocus onClick={stay}>
              {t("actions.keepEditing")}
            </Button>
            <Button variant="danger" onClick={leave}>
              {t("actions.discard")}
            </Button>
          </>
        }
      >
        <p>{t("feedback.unsavedBody")}</p>
      </Modal>
    </GuardContext.Provider>
  );
}
```

Create `web/src/components/admin/guarded-link.tsx`:

```tsx
"use client";

import type { ComponentProps, MouseEvent } from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { needsLeavePrompt } from "@/lib/admin/unsaved";
import { useUnsavedChanges } from "./unsaved-changes";

/** What next-intl's router can push: a path, or a path with a query. */
type Href = Parameters<ReturnType<typeof useRouter>["push"]>[0];

/** A locale-aware Link that asks before leaving a form with unsaved changes. */
export function GuardedLink({ onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: Href }) {
  const guard = useUnsavedChanges();
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    const plainClick = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && props.target !== "_blank";
    if (e.defaultPrevented || !plainClick) return;
    const target = typeof props.href === "string" ? props.href : props.href.pathname;
    if (!needsLeavePrompt(guard.dirty, target)) return;
    e.preventDefault();
    guard.confirmLeave(() => router.push(props.href, { locale: props.locale }));
  }

  return <Link {...props} onClick={handleClick} />;
}
```

Create `web/src/components/admin/toast.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

/** Small, self-dismissing notes for inline edits (spec §6.2). Record-level results use the modal. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const show = useCallback((text: string) => setToast({ text, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed end-6 bottom-6 z-50">
        {toast && (
          <div key={toast.id} className="rounded-md border border-line bg-surface px-4 py-3 text-sm shadow-sheet">
            {toast.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
```

Create `web/src/components/admin/action-result-modal.tsx`:

```tsx
"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { entityBase } from "@/lib/admin/paths";
import { readResult, withoutResult, type ActionResult } from "@/lib/admin/result";

/**
 * Spec §6.2: every successful create, update and delete ends here. The
 * Server Action redirected with ?done=&name=; show the modal, then drop the
 * parameters so a refresh or Back doesn't show it again.
 */
export function ActionResultModal() {
  const t = useTranslations("admin");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    const current = new URLSearchParams(params.toString());
    const found = readResult(current);
    if (!found) return;
    setResult(found);
    router.replace(pathname + withoutResult(current), { scroll: false });
  }, [params, pathname, router]);

  const close = () => setResult(null);
  const base = entityBase(pathname);
  const kind = result?.kind ?? "saved";

  return (
    <Modal
      open={result !== null}
      onClose={close}
      title={t(`feedback.${kind}`)}
      actions={
        <>
          {kind === "created" && base && (
            <NextLink href={`${base}/new`} className={buttonClass("secondary")} onClick={close}>
              {t("actions.addAnother")}
            </NextLink>
          )}
          {kind === "saved" && base && (
            <NextLink href={base} className={buttonClass("secondary")} onClick={close}>
              {t("actions.backToList")}
            </NextLink>
          )}
          <Button variant="primary" data-autofocus onClick={close}>
            {t("actions.done")}
          </Button>
        </>
      }
    >
      <p>{t(`feedback.${kind}Body`, { name: result?.name ?? "" })}</p>
    </Modal>
  );
}
```

Create `web/src/components/admin/sidebar.tsx`:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { GuardedLink } from "./guarded-link";
import { focusRing } from "./ui";

const items = [
  ["overview", "/dashboard"],
  ["areas", "/dashboard/areas"],
  ["compounds", "/dashboard/compounds"],
  ["owners", "/dashboard/owners"],
  ["units", "/dashboard/units"],
] as const;

/** The app design's 232px sidebar; below 1024px, a top bar with the nav in a sheet. */
export function Sidebar() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const pathname = usePathname(); // without the locale prefix
  const search = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const otherLocale = locale === "ar" ? "en" : "ar";

  const nav = (
    <nav aria-label={t("shell.navLabel")} className="flex flex-col gap-0.5">
      {items.map(([key, href]) => {
        const active = isActive(href);
        return (
          <GuardedLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center rounded-md px-3 py-2.5 text-[15px]",
              focusRing,
              active ? "bg-sea-soft font-medium text-sea-deep" : "text-ink hover:bg-sea-soft/60",
            )}
          >
            {t(`nav.${key}`)}
          </GuardedLink>
        );
      })}
    </nav>
  );

  const foot = (
    <div className="mt-auto flex flex-col gap-3 border-t border-line px-3 pt-4">
      <GuardedLink
        href={{ pathname, query: Object.fromEntries(search.entries()) }}
        locale={otherLocale}
        lang={otherLocale}
        className={buttonClass("secondary", "sm")}
      >
        {t("shell.switchLanguage")}
      </GuardedLink>
      <span className="text-xs text-ink-muted">{t("shell.role")}</span>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-6 border-e border-line bg-surface px-4 py-5 lg:flex">
        <div className="flex flex-col gap-0.5 px-3">
          <span className="text-xl font-semibold text-sea">{t("shell.brand")}</span>
          <span className="text-[13px] text-ink-muted">{t("shell.subtitle")}</span>
        </div>
        {nav}
        {foot}
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="text-lg font-semibold text-sea">{t("shell.brand")}</span>
        <Button
          variant="secondary"
          size="sm"
          className="ms-auto"
          aria-expanded={open}
          aria-controls="admin-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t("shell.closeMenu") : t("shell.openMenu")}
        </Button>
      </header>
      {open && (
        <div
          id="admin-menu"
          className="fixed inset-x-0 top-[57px] z-20 flex flex-col gap-6 border-b border-line bg-surface p-4 shadow-sheet lg:hidden"
        >
          {nav}
          {foot}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Page building blocks**

Create `web/src/components/admin/page-header.tsx`:

```tsx
import type { ReactNode } from "react";

import { GuardedLink } from "./guarded-link";
import { linkCls } from "./ui";

/** Title row from the app design: `heading` h1, muted subtitle, actions at the end edge. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <GuardedLink href={back.href} className={`${linkCls} self-start text-sm`}>
            {back.label}
          </GuardedLink>
        )}
        <h1 className="text-[26px] leading-[34px] font-semibold">{title}</h1>
        {subtitle && <p className="num text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
```

Create `web/src/components/admin/row-link.tsx`:

```tsx
import { GuardedLink } from "./guarded-link";

/** The record link in a table row; its ::after covers the row, so the whole row opens it. */
export function RowLink({ href, primary, secondary }: { href: string; primary: string; secondary?: string }) {
  return (
    <GuardedLink
      href={href}
      className="font-medium text-ink outline-none after:absolute after:inset-0 after:content-[''] hover:text-sea-deep"
    >
      {primary}
      {secondary && (
        <span className="block text-xs font-normal text-ink-muted" dir="auto">
          {secondary}
        </span>
      )}
    </GuardedLink>
  );
}
```

Create `web/src/components/admin/list-count.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

export async function ListCount({ total, shown, filtered }: { total: number; shown: number; filtered: boolean }) {
  const t = await getTranslations("admin.list");
  return <>{filtered ? t("countFiltered", { count: total, matched: shown }) : t("count", { count: total })}</>;
}
```

Create `web/src/components/admin/fields.tsx`:

```tsx
import { hintCls, inputCls, labelCls } from "./ui";

/*
  Uncontrolled inputs: EntityForm reads them with FormData on submit and
  watches input events for the unsaved-changes flag. Required marks are
  browser-native; the API is the real validator.
*/

type Base = { label: string; name: string; required?: boolean; hint?: string };
type Value = string | number | null | undefined;

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className={labelCls}>
      {label}
      {required && (
        <span aria-hidden="true" className="text-danger">
          {" *"}
        </span>
      )}
    </span>
  );
}

export function TextField({
  label,
  name,
  required,
  hint,
  defaultValue,
  type = "text",
  dir,
  ...rest
}: Base & {
  defaultValue?: Value;
  type?: string;
  dir?: "rtl" | "ltr";
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <input
        className={`${inputCls} ${type === "number" ? "num" : ""}`}
        name={name}
        type={type}
        dir={dir}
        required={required}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
        {...rest}
      />
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  required,
  hint,
  defaultValue,
  dir,
  rows = 4,
}: Base & { defaultValue?: Value; dir?: "rtl" | "ltr"; rows?: number }) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <textarea
        className={inputCls}
        name={name}
        dir={dir}
        rows={rows}
        required={required}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
      />
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

/** Spec §4.2: Arabic and English side by side, Arabic typed RTL and first. Submits `${name}_ar`/`${name}_en`. */
export function BilingualField({
  label,
  name,
  ar,
  en,
  required,
  multiline,
}: {
  label: string;
  name: string;
  ar?: string | null;
  en?: string | null;
  required?: boolean;
  multiline?: boolean;
}) {
  const Input = multiline ? TextArea : TextField;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label={`${label} · عربي`} name={`${name}_ar`} defaultValue={ar} required={required} dir="rtl" />
      <Input label={`${label} · English`} name={`${name}_en`} defaultValue={en} required={required} dir="ltr" />
    </div>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  hint,
}: Base & { options: Option[]; defaultValue?: string | null }) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <select className={inputCls} name={name} required={required} aria-required={required} defaultValue={defaultValue ?? ""}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-[42px] items-center gap-2.5 text-[15px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-sea" />
      {label}
    </label>
  );
}

/** Lays out the fields inside one form section. */
export function FieldGrid({ cols = 1, children }: { cols?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`grid gap-5 ${grid}`}>{children}</div>;
}
```

Create `web/src/components/admin/entity-form.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import type { FormAction } from "@/lib/admin/types";
import { GuardedLink } from "./guarded-link";
import { useUnsavedChanges } from "./unsaved-changes";

export function ErrorBanner({ title, message, ref }: { title: string; message: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-md border border-danger bg-surface px-4 py-3 text-sm outline-none">
      <p className="font-medium text-danger">{title}</p>
      <p className="mt-1 text-ink">{message}</p>
    </div>
  );
}

/**
 * Submits through onSubmit (not <form action>): React 19 resets action
 * forms, which would wipe the admin's input on a validation error. Tracks
 * dirtiness for the save-bar hint and the leave guard; errors land in a
 * focused banner; success is the redirect's result modal.
 */
export function EntityForm({
  formId,
  action,
  submitLabel,
  cancelHref,
  sections,
  children,
}: {
  formId: string;
  action: FormAction;
  submitLabel: string;
  cancelHref: string;
  sections?: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  const [state, dispatch, pending] = useActionState(action, null);
  const { setDirty } = useUnsavedChanges();
  const [dirty, setLocalDirty] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const mark = (value: boolean) => {
    setLocalDirty(value);
    setDirty(formId, value);
  };

  useEffect(() => () => setDirty(formId, false), [formId, setDirty]);

  useEffect(() => {
    if (!state?.error) return;
    mark(true);
    bannerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    bannerRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new result only
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    mark(false); // the success redirect must not trip the leave guard
    startTransition(() => dispatch(data));
  }

  const onEdit = () => {
    if (!dirty) mark(true);
  };

  return (
    <form id={formId} onSubmit={onSubmit} onInput={onEdit} onChange={onEdit} className="space-y-6">
      {sections && (
        <nav aria-label={t("form.sections")} className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md bg-sea-soft px-3 py-1.5 text-sm text-sea-deep hover:bg-lagoon-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
            >
              {s.label}
            </a>
          ))}
        </nav>
      )}
      {state?.error && <ErrorBanner ref={bannerRef} title={t("feedback.notSaved")} message={state.error} />}
      {children}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3 shadow-sheet sm:-mx-10 sm:px-10">
        <span aria-live="polite" className="text-sm text-ink-muted">
          {dirty ? t("feedback.unsavedHint") : ""}
        </span>
        <div className="ms-auto flex items-center gap-2.5">
          <GuardedLink href={cancelHref} className={buttonClass("secondary")}>
            {t("actions.cancel")}
          </GuardedLink>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t("actions.saving") : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
```

Create `web/src/components/admin/confirm-delete.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Modal } from "@/components/ds/modal";
import type { FormAction } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";

/** Spec §6.2: delete always asks first; a failure (e.g. 409) closes the modal and shows the banner. */
export function ConfirmDelete({ action, name, detail }: { action: FormAction; name: string; detail: string }) {
  const t = useTranslations("admin");
  const [state, dispatch, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.error) setOpen(false);
  }, [state]);

  return (
    <Card title={t("form.dangerZone")}>
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-ink-muted">{detail}</p>
        <Button variant="danger" className="ms-auto" onClick={() => setOpen(true)}>
          {t("actions.delete")}
        </Button>
      </div>
      {state?.error && (
        <div className="mt-4">
          <ErrorBanner title={t("feedback.cantDelete")} message={state.error} />
        </div>
      )}
      <Modal
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={t("confirm.deleteTitle", { name })}
        actions={
          <>
            <Button variant="secondary" data-autofocus disabled={pending} onClick={() => setOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => startTransition(() => dispatch(new FormData()))}>
              {pending ? t("actions.deleting") : t("actions.delete")}
            </Button>
          </>
        }
      >
        <p>{t("confirm.deleteBody")}</p>
        <p>{detail}</p>
      </Modal>
    </Card>
  );
}
```

Create `web/src/components/admin/filter-bar.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ds/button";
import type { Option } from "./fields";
import { inputCls } from "./ui";

/** Spec §6.3: search (debounced) and selects write to the query string; the page filters on the server. */
export function FilterBar({
  placeholder,
  selects = [],
}: {
  placeholder: string;
  selects?: Array<{ name: string; label: string; options: Option[] }>;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const apply = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => apply({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
  }, [q, params, apply]);

  const active = params.has("q") || selects.some((s) => params.has(s.name));

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() });
      }}
      className="mb-4 flex flex-wrap items-center gap-3"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={t("list.search")}
        className={`${inputCls} min-w-[220px] flex-1 basis-64`}
      />
      {selects.map((s) => (
        <select
          key={s.name}
          aria-label={s.label}
          value={params.get(s.name) ?? ""}
          onChange={(e) => apply({ [s.name]: e.target.value })}
          className={`${inputCls} w-auto min-w-40 flex-none`}
        >
          <option value="">
            {s.label}: {t("list.all")}
          </option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {active && (
        <Button
          variant="quiet"
          onClick={() => {
            setQ("");
            router.replace(pathname, { scroll: false });
          }}
        >
          {t("actions.clear")}
        </Button>
      )}
    </form>
  );
}
```

Create `web/src/components/admin/slug-field.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { slugTaken } from "@/app/[locale]/dashboard/slug-action";
import { slugify } from "@/lib/slug";
import { hintCls, inputCls, labelCls } from "./ui";

type Status = "idle" | "checking" | "taken" | "free";

/** Auto-fills from the English name on blur while empty; checks uniqueness on blur. */
export function SlugField({
  entity,
  sourceName,
  currentId,
  defaultValue,
}: {
  entity: "areas" | "compounds" | "units";
  sourceName: string;
  currentId?: string;
  defaultValue?: string;
}) {
  const t = useTranslations("admin.slug");
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  const check = useCallback(
    async (value: string) => {
      if (!value) return setStatus("idle");
      setStatus("checking");
      setStatus((await slugTaken(entity, value, currentId)) ? "taken" : "free");
    },
    [entity, currentId],
  );

  useEffect(() => {
    const input = ref.current;
    const source = input?.form?.elements.namedItem(sourceName);
    if (!input || !(source instanceof HTMLInputElement)) return;
    const fill = () => {
      if (input.value !== "") return;
      input.value = slugify(source.value);
      void check(input.value);
    };
    source.addEventListener("blur", fill);
    return () => source.removeEventListener("blur", fill);
  }, [sourceName, check]);

  return (
    <label className="block">
      <span className={labelCls}>{t("label")}</span>
      <input
        ref={ref}
        name="slug"
        dir="ltr"
        className={inputCls}
        defaultValue={defaultValue ?? ""}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        onBlur={(e) => {
          e.currentTarget.value = slugify(e.currentTarget.value);
          void check(e.currentTarget.value);
        }}
      />
      <span className={`${hintCls} ${status === "taken" ? "text-danger" : ""}`}>{t(status)}</span>
    </label>
  );
}
```

Create `web/src/components/admin/units-table.tsx`:

```tsx
/* eslint-disable @next/next/no-img-element -- admin thumbnails straight from MinIO */
import { getTranslations } from "next-intl/server";

import { DataTable, cellCls, rowCls } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { formatWhen, other, pick, unitStatusTone } from "@/lib/admin/labels";
import type { UnitRow } from "@/lib/admin/types";
import { RowLink } from "./row-link";

export async function UnitsTable({ rows, locale }: { rows: UnitRow[]; locale: string }) {
  const t = await getTranslations();
  return (
    <DataTable
      head={[
        <span key="c" className="sr-only">{t("admin.units.cover")}</span>,
        t("admin.units.titleCol"),
        t("admin.units.compound"),
        t("admin.units.type"),
        t("admin.units.status"),
        t("admin.units.edited"),
      ]}
    >
      {rows.map((u) => (
        <tr key={u.id} className={rowCls}>
          <td className={`${cellCls} w-[72px]`}>
            {u.cover_url ? (
              <img src={u.cover_url} alt="" className="h-10 w-14 rounded-sm object-cover" />
            ) : (
              <span className="block h-10 w-14 rounded-sm bg-sand" />
            )}
          </td>
          <td className={cellCls}>
            <RowLink href={`/dashboard/units/${u.id}`} primary={pick(locale, u.title_ar, u.title_en)} secondary={other(locale, u.title_ar, u.title_en)} />
          </td>
          <td className={cellCls}>{pick(locale, u.compound_name_ar, u.compound_name_en)}</td>
          <td className={cellCls}>{t(`enums.type.${u.type}`)}</td>
          <td className={cellCls}>
            <StateBadge tone={unitStatusTone(u.status)}>{t(`enums.unit_status.${u.status}`)}</StateBadge>
          </td>
          <td className={`${cellCls} num whitespace-nowrap text-ink-muted`}>{formatWhen(u.updated_at, locale)}</td>
        </tr>
      ))}
    </DataTable>
  );
}
```

Create `web/src/components/admin/image-manager.tsx` (stub; Task 10 replaces it):

```tsx
"use client";

import type { UnitImage } from "@/lib/admin/types";

export function ImageManager({ images }: { unitId: string; images: UnitImage[] }) {
  return <p className="text-sm text-ink-muted">{images.length}</p>;
}
```

- [ ] **Step 4: Server Action helpers revalidate the locale tree**

In `web/src/lib/admin/actions.ts`, replace both `revalidatePath("/dashboard", "layout");` / `revalidatePath(revalidate);` calls:
- in `mutate`: `revalidatePath("/[locale]/dashboard", "layout");`
- in `attempt`: drop the `revalidate` parameter and call `revalidatePath("/[locale]/dashboard", "layout");`. The signature becomes `attempt(run: () => Promise<unknown>): Promise<{ error?: string }>`.

- [ ] **Step 5: Middleware**

Create `web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { basicAuthChallenge, isAuthorized } from "./lib/admin/auth";
import { isDashboardPath, legacyDashboardTarget } from "./lib/admin/paths";

const intl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Old un-prefixed admin URLs land on the Arabic admin.
  const legacy = legacyDashboardTarget(pathname);
  if (legacy) return NextResponse.redirect(new URL(legacy + search, req.url), 307);

  // Pages and the Server Action POSTs made from them.
  if (isDashboardPath(pathname) && !isAuthorized(req.headers.get("authorization"), process.env.ADMIN_PASSWORD)) {
    return new NextResponse("Admin password required", basicAuthChallenge);
  }
  return intl(req);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
  // Node runtime so ADMIN_PASSWORD is read from the server's env per request.
  runtime: "nodejs",
};
```

- [ ] **Step 6: Dashboard layout, overview, not-found, slug action**

Create `web/src/app/[locale]/dashboard/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { ActionResultModal } from "@/components/admin/action-result-modal";
import { Sidebar } from "@/components/admin/sidebar";
import { ToastProvider } from "@/components/admin/toast";
import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes";

// Every admin page reads live data.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.shell");
  return { title: `${t("subtitle")} · ${t("brand")}`, robots: { index: false, follow: false } };
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <UnsavedChangesProvider>
      <ToastProvider>
        <div className="min-h-dvh bg-shell text-ink lg:flex">
          <Suspense>
            <Sidebar />
          </Suspense>
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-8">{children}</main>
        </div>
        <Suspense>
          <ActionResultModal />
        </Suspense>
      </ToastProvider>
    </UnsavedChangesProvider>
  );
}
```

Create `web/src/app/[locale]/dashboard/not-found.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { GuardedLink } from "@/components/admin/guarded-link";
import { linkCls } from "@/components/admin/ui";

export default async function DashboardNotFound() {
  const t = await getTranslations("admin.notFound");
  return (
    <div className="space-y-3">
      <h1 className="text-[26px] leading-[34px] font-semibold">{t("heading")}</h1>
      <p className="text-ink-muted">{t("body")}</p>
      <GuardedLink href="/dashboard" className={linkCls}>
        {t("back")}
      </GuardedLink>
    </div>
  );
}
```

Create `web/src/app/[locale]/dashboard/slug-action.ts`:

```ts
"use server";

import { adminGet } from "@/lib/admin/api";

const sluggable = new Set(["areas", "compounds", "units"]);

/** True when another record of `entity` already uses `slug`. */
export async function slugTaken(entity: string, slug: string, currentId?: string): Promise<boolean> {
  if (!sluggable.has(entity) || slug === "") return false;
  const rows = await adminGet<Array<{ id: string }>>(`/${entity}?slug=${encodeURIComponent(slug)}`);
  return rows.some((r) => r.id !== currentId);
}
```

Create `web/src/app/[locale]/dashboard/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/data-table";
import { StatTile } from "@/components/ds/stat-tile";
import { StateBadge } from "@/components/ds/state-badge";
import { GuardedLink } from "@/components/admin/guarded-link";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import { pick } from "@/lib/admin/labels";
import type { CompoundRow, Owner, UnitRow } from "@/lib/admin/types";

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, compounds, owners, units] = await Promise.all([
    getTranslations("admin"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Owner[]>("/owners"),
    adminGet<UnitRow[]>("/units"), // newest edit first
  ]);

  const active = units.filter((u) => u.status === "active").length;
  const drafts = units.filter((u) => u.status === "draft").length;
  const attention = units
    .filter((u) => u.status === "draft" || !u.cover_url)
    .slice(0, 8)
    .map((u) => ({
      unit: u,
      reasons: [
        u.status === "draft" && { tone: "neutral" as const, label: t("overview.reasonDraft") },
        !u.cover_url && { tone: "attention" as const, label: t("overview.reasonNoCover") },
      ].filter((r) => r !== false),
    }));

  return (
    <>
      <PageHeader title={t("overview.heading")} />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label={t("overview.statActive")}
            value={active}
            note={t("overview.noteActive", { total: units.length })}
            href={{ pathname: "/dashboard/units", query: { status: "active" } }}
          />
          <StatTile
            label={t("overview.statDrafts")}
            value={drafts}
            note={t("overview.noteDrafts")}
            href={{ pathname: "/dashboard/units", query: { status: "draft" } }}
          />
          <StatTile label={t("overview.statCompounds")} value={compounds.length} href="/dashboard/compounds" />
          <StatTile label={t("overview.statOwners")} value={owners.length} href="/dashboard/owners" />
        </div>

        {attention.length > 0 && (
          <Card title={t("overview.attention")} padded={false}>
            <ul>
              {attention.map(({ unit, reasons }) => (
                <li key={unit.id} className="relative flex flex-wrap items-center gap-3 border-t border-line px-6 py-3 first:border-t-0 hover:bg-sea-soft/60 focus-within:bg-sea-soft">
                  <RowLink
                    href={`/dashboard/units/${unit.id}`}
                    primary={pick(locale, unit.title_ar, unit.title_en)}
                    secondary={pick(locale, unit.compound_name_ar, unit.compound_name_en)}
                  />
                  <span className="ms-auto flex gap-2">
                    {reasons.map((r) => (
                      <StateBadge key={r.label} tone={r.tone}>
                        {r.label}
                      </StateBadge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t("overview.recent")} padded={false}>
          {units.length === 0 ? (
            <EmptyState>
              <p>{t("overview.empty")}</p>
              <GuardedLink href="/dashboard/units/new" className={buttonClass("primary")}>
                {t("overview.createFirst")}
              </GuardedLink>
            </EmptyState>
          ) : (
            <UnitsTable rows={units.slice(0, 8)} locale={locale} />
          )}
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 7: Verify and commit**

Run: `cd web && npx tsc --noEmit && npm test` → exit 0.

With the API and `next dev` running (`PW` from `.env`, `W` = the dev server origin):

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $W/dashboard/units              # 307 …/ar/dashboard/units
curl -s -o /dev/null -w '%{http_code}\n' $W/ar/dashboard                                   # 401
curl -s -u admin:$PW $W/ar/dashboard | grep -o 'dir="rtl"\|نظرة عامة' | sort -u             # both
curl -s -u admin:$PW $W/en/dashboard | grep -o 'dir="ltr"\|Recently edited' | sort -u      # both
curl -s -o /dev/null -w '%{http_code}\n' $W/ar                                             # 200
```

```bash
git add -A web/src/app web/src/components/admin web/src/lib/admin/actions.ts web/src/middleware.ts
git commit -m "feat(web): admin shell, modals and overview under /[locale]/dashboard"
```

---

## Task 7 — Areas

**Files:** `web/src/app/[locale]/dashboard/areas/{actions.ts,area-form.tsx,page.tsx,new/page.tsx,[id]/page.tsx}`

- [ ] **Step 1: Create the files**

Create `web/src/app/[locale]/dashboard/areas/actions.ts`:

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, nullableNumber, optional, text } from "@/lib/admin/form";
import { pick } from "@/lib/admin/labels";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { withResult } from "@/lib/admin/result";
import type { Area, FormState } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    slug: optional(fd, "slug"),
    name_ar: text(fd, "name_ar"),
    name_en: text(fd, "name_en"),
    region: text(fd, "region"),
    km_marker: nullableNumber(fd, "km_marker"),
    sort_order: int(fd, "sort_order") ?? 0,
  };
}

export async function createArea(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Area>("POST", "/areas", payload(fd)),
    (a) => withResult(dashboardHref(l, `/areas/${a.id}`), "created", pick(l, a.name_ar, a.name_en)),
  );
}

export async function updateArea(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Area>("PATCH", `/areas/${assertId(id)}`, payload(fd)),
    (a) => withResult(dashboardHref(l, `/areas/${a.id}`), "saved", pick(l, a.name_ar, a.name_en)),
  );
}

export async function deleteArea(id: string, locale: string, name: string, _: FormState): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/areas/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/areas"), "deleted", name),
  );
}
```

Create `web/src/app/[locale]/dashboard/areas/area-form.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, FieldGrid, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import { enumOptions } from "@/lib/admin/labels";
import type { Area, Enums, FormAction } from "@/lib/admin/types";

export async function AreaForm({ action, enums, area }: { action: FormAction; enums: Enums; area?: Area }) {
  const t = await getTranslations();
  return (
    <EntityForm
      formId="area-form"
      action={action}
      submitLabel={area ? t("admin.actions.save") : t("admin.areas.new")}
      cancelHref="/dashboard/areas"
    >
      <Card title={t("admin.areas.basics")}>
        <div className="space-y-5">
          <BilingualField label={t("admin.areas.name")} name="name" ar={area?.name_ar} en={area?.name_en} required />
          <SlugField entity="areas" sourceName="name_en" currentId={area?.id} defaultValue={area?.slug} />
          <FieldGrid cols={3}>
            <SelectField
              label={t("admin.areas.region")}
              name="region"
              required
              options={enumOptions(enums.region, (v) => t(`enums.region.${v}`))}
              defaultValue={area?.region}
            />
            <TextField label={t("admin.areas.km")} hint={t("admin.areas.kmHint")} name="km_marker" type="number" min={0} defaultValue={area?.km_marker} />
            <TextField label={t("admin.areas.order")} hint={t("admin.areas.orderHint")} name="sort_order" type="number" defaultValue={area?.sort_order ?? 0} />
          </FieldGrid>
        </div>
      </Card>
    </EntityForm>
  );
}
```

Create `web/src/app/[locale]/dashboard/areas/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { filterByQuery, param, type SearchParams } from "@/lib/admin/filter";
import { other, pick } from "@/lib/admin/labels";
import type { Area } from "@/lib/admin/types";

export default async function AreasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all] = await Promise.all([getTranslations(), adminGet<Area[]>("/areas")]);
  const q = param(sp, "q");
  const rows = filterByQuery(all, q, (a) => [a.name_ar, a.name_en, a.slug]);

  return (
    <>
      <PageHeader
        title={t("admin.areas.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={q !== ""} />}
        actions={
          <GuardedLink href="/dashboard/areas/new" className={buttonClass("primary")}>
            {t("admin.areas.new")}
          </GuardedLink>
        }
      />
      <FilterBar placeholder={t("admin.areas.search")} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("admin.areas.empty") : t("admin.list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("admin.areas.name"), t("admin.areas.region"), t("admin.areas.km"), t("admin.areas.order")]}>
            {rows.map((a) => (
              <tr key={a.id} className={rowCls}>
                <td className={cellCls}>
                  <RowLink href={`/dashboard/areas/${a.id}`} primary={pick(locale, a.name_ar, a.name_en)} secondary={other(locale, a.name_ar, a.name_en)} />
                </td>
                <td className={cellCls}>{t(`enums.region.${a.region}`)}</td>
                <td className={`${cellCls} num`}>{a.km_marker ?? "—"}</td>
                <td className={`${cellCls} num`}>{a.sort_order}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/areas/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Enums } from "@/lib/admin/types";
import { createArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function NewAreaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, enums] = await Promise.all([getTranslations("admin"), adminGet<Enums>("/enums")]);
  return (
    <>
      <PageHeader title={t("areas.new")} back={{ href: "/dashboard/areas", label: t("actions.backToList") }} />
      <AreaForm action={createArea.bind(null, locale)} enums={enums} />
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/areas/[id]/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick } from "@/lib/admin/labels";
import type { Area, Enums } from "@/lib/admin/types";
import { deleteArea, updateArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function EditAreaPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, area, enums] = await Promise.all([getTranslations("admin"), getOr404<Area>(`/areas/${id}`), adminGet<Enums>("/enums")]);
  const name = pick(locale, area.name_ar, area.name_en);
  return (
    <>
      <PageHeader title={name} back={{ href: "/dashboard/areas", label: t("actions.backToList") }} />
      <div className="space-y-6">
        <AreaForm key={area.updated_at} action={updateArea.bind(null, id, locale)} enums={enums} area={area} />
        <ConfirmDelete action={deleteArea.bind(null, id, locale, name)} name={name} detail={t("confirm.referenced")} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd web && npx tsc --noEmit`. Then:

```bash
curl -s -u admin:$PW "$W/ar/dashboard/areas" | grep -o "الساحل الشمالي" | head -1       # region label
curl -s -u admin:$PW "$W/en/dashboard/areas/new" | grep -o "Add area" | head -1
curl -s -o /dev/null -w '%{http_code}\n' -u admin:$PW "$W/ar/dashboard/areas/00000000-0000-4000-8000-000000000000"   # 404
```

```bash
git add "web/src/app/[locale]/dashboard/areas"
git commit -m "feat(web): redesigned areas pages"
```

---

## Task 8 — Compounds

**Files:** `web/src/app/[locale]/dashboard/compounds/{actions.ts,compound-form.tsx,page.tsx,new/page.tsx,[id]/page.tsx}`

- [ ] **Step 1: Create the files**

Create `web/src/app/[locale]/dashboard/compounds/actions.ts`:

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { checkbox, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
import { pick } from "@/lib/admin/labels";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { withResult } from "@/lib/admin/result";
import type { Compound, FormState } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    area_id: ref(fd, "area_id"),
    slug: optional(fd, "slug"),
    name_ar: text(fd, "name_ar"),
    name_en: text(fd, "name_en"),
    description_ar: text(fd, "description_ar"),
    description_en: text(fd, "description_en"),
    amenities: list(fd, "amenities"),
    beach_type: text(fd, "beach_type"),
    gate_info_ar: text(fd, "gate_info_ar"),
    gate_info_en: text(fd, "gate_info_en"),
    lat: nullableNumber(fd, "lat"),
    lng: nullableNumber(fd, "lng"),
    cover_image_url: text(fd, "cover_image_url"),
    is_featured: checkbox(fd, "is_featured"),
  };
}

export async function createCompound(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Compound>("POST", "/compounds", payload(fd)),
    (c) => withResult(dashboardHref(l, `/compounds/${c.id}`), "created", pick(l, c.name_ar, c.name_en)),
  );
}

export async function updateCompound(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Compound>("PATCH", `/compounds/${assertId(id)}`, payload(fd)),
    (c) => withResult(dashboardHref(l, `/compounds/${c.id}`), "saved", pick(l, c.name_ar, c.name_en)),
  );
}

export async function deleteCompound(id: string, locale: string, name: string, _: FormState): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/compounds/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/compounds"), "deleted", name),
  );
}
```

Create `web/src/app/[locale]/dashboard/compounds/compound-form.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, CheckboxField, FieldGrid, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import { enumOptions, pick } from "@/lib/admin/labels";
import type { Area, Compound, Enums, FormAction } from "@/lib/admin/types";

export async function CompoundForm({
  action,
  enums,
  areas,
  locale,
  compound,
}: {
  action: FormAction;
  enums: Enums;
  areas: Area[];
  locale: string;
  compound?: Compound;
}) {
  const t = await getTranslations();
  const s = (key: string) => t(`admin.compounds.${key}`);
  return (
    <EntityForm
      formId="compound-form"
      action={action}
      submitLabel={compound ? t("admin.actions.save") : s("new")}
      cancelHref="/dashboard/compounds"
      sections={[
        { id: "basics", label: s("basics") },
        { id: "description", label: s("descriptionSection") },
        { id: "place", label: s("place") },
        { id: "amenities", label: s("amenitiesSection") },
      ]}
    >
      <Card id="basics" title={s("basics")}>
        <div className="space-y-5">
          <FieldGrid cols={2}>
            <SelectField
              label={s("area")}
              name="area_id"
              required
              options={areas.map((a) => ({ value: a.id, label: pick(locale, a.name_ar, a.name_en) }))}
              defaultValue={compound?.area_id}
            />
            <SelectField
              label={s("beach")}
              name="beach_type"
              required
              options={enumOptions(enums.beach_type, (v) => t(`enums.beach_type.${v}`))}
              defaultValue={compound?.beach_type}
            />
          </FieldGrid>
          <BilingualField label={s("name")} name="name" ar={compound?.name_ar} en={compound?.name_en} required />
          <SlugField entity="compounds" sourceName="name_en" currentId={compound?.id} defaultValue={compound?.slug} />
          <CheckboxField label={s("featured")} name="is_featured" defaultChecked={compound?.is_featured} />
        </div>
      </Card>
      <Card id="description" title={s("descriptionSection")}>
        <BilingualField label={s("description")} name="description" ar={compound?.description_ar} en={compound?.description_en} required multiline />
      </Card>
      <Card id="place" title={s("place")}>
        <FieldGrid cols={3}>
          <TextField label={s("lat")} name="lat" type="number" step="0.000001" min={-90} max={90} dir="ltr" defaultValue={compound?.lat} />
          <TextField label={s("lng")} name="lng" type="number" step="0.000001" min={-180} max={180} dir="ltr" defaultValue={compound?.lng} />
          <TextField label={s("cover")} name="cover_image_url" type="url" dir="ltr" defaultValue={compound?.cover_image_url} />
        </FieldGrid>
      </Card>
      <Card id="amenities" title={s("amenitiesSection")}>
        <div className="space-y-5">
          <TextField label={s("amenities")} hint={s("amenitiesHint")} name="amenities" defaultValue={compound?.amenities.join("، ")} />
          <BilingualField label={s("gate")} name="gate_info" ar={compound?.gate_info_ar} en={compound?.gate_info_en} multiline />
        </div>
      </Card>
    </EntityForm>
  );
}
```

Create `web/src/app/[locale]/dashboard/compounds/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { filterByQuery, param, type SearchParams } from "@/lib/admin/filter";
import { other, pick } from "@/lib/admin/labels";
import type { CompoundRow } from "@/lib/admin/types";

export default async function CompoundsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all] = await Promise.all([getTranslations(), adminGet<CompoundRow[]>("/compounds")]);
  const q = param(sp, "q");
  const rows = filterByQuery(all, q, (c) => [c.name_ar, c.name_en, c.slug]);

  return (
    <>
      <PageHeader
        title={t("admin.compounds.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={q !== ""} />}
        actions={
          <GuardedLink href="/dashboard/compounds/new" className={buttonClass("primary")}>
            {t("admin.compounds.new")}
          </GuardedLink>
        }
      />
      <FilterBar placeholder={t("admin.compounds.search")} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("admin.compounds.empty") : t("admin.list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("admin.compounds.name"), t("admin.compounds.area"), t("admin.compounds.beach"), t("admin.compounds.featuredCol")]}>
            {rows.map((c) => (
              <tr key={c.id} className={rowCls}>
                <td className={cellCls}>
                  <RowLink href={`/dashboard/compounds/${c.id}`} primary={pick(locale, c.name_ar, c.name_en)} secondary={other(locale, c.name_ar, c.name_en)} />
                </td>
                <td className={cellCls}>{pick(locale, c.area_name_ar, c.area_name_en)}</td>
                <td className={cellCls}>{t(`enums.beach_type.${c.beach_type}`)}</td>
                <td className={cellCls}>{c.is_featured && <StateBadge tone="free">{t("admin.compounds.featuredYes")}</StateBadge>}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/compounds/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Area, Enums } from "@/lib/admin/types";
import { createCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function NewCompoundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, enums, areas] = await Promise.all([getTranslations("admin"), adminGet<Enums>("/enums"), adminGet<Area[]>("/areas")]);
  return (
    <>
      <PageHeader title={t("compounds.new")} back={{ href: "/dashboard/compounds", label: t("actions.backToList") }} />
      <CompoundForm action={createCompound.bind(null, locale)} enums={enums} areas={areas} locale={locale} />
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/compounds/[id]/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick } from "@/lib/admin/labels";
import type { Area, Compound, Enums } from "@/lib/admin/types";
import { deleteCompound, updateCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function EditCompoundPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, compound, enums, areas] = await Promise.all([
    getTranslations("admin"),
    getOr404<Compound>(`/compounds/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Area[]>("/areas"),
  ]);
  const name = pick(locale, compound.name_ar, compound.name_en);
  return (
    <>
      <PageHeader title={name} back={{ href: "/dashboard/compounds", label: t("actions.backToList") }} />
      <div className="space-y-6">
        <CompoundForm
          key={compound.updated_at}
          action={updateCompound.bind(null, id, locale)}
          enums={enums}
          areas={areas}
          locale={locale}
          compound={compound}
        />
        <ConfirmDelete action={deleteCompound.bind(null, id, locale, name)} name={name} detail={t("confirm.referenced")} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd web && npx tsc --noEmit`. `curl -s -u admin:$PW "$W/ar/dashboard/compounds" | grep -o "هاسيندا\|Hacienda" | head -1` → a name; `curl -s -u admin:$PW "$W/en/dashboard/compounds/new" | grep -o "Add compound" | head -1`.

```bash
git add "web/src/app/[locale]/dashboard/compounds"
git commit -m "feat(web): redesigned compounds pages"
```

---

## Task 9 — Owners

**Files:** `web/src/app/[locale]/dashboard/owners/{actions.ts,owner-form.tsx,page.tsx,new/page.tsx,[id]/page.tsx}`

- [ ] **Step 1: Create the files**

Create `web/src/app/[locale]/dashboard/owners/actions.ts`:

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, text } from "@/lib/admin/form";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { withResult } from "@/lib/admin/result";
import type { FormState, Owner } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    name: text(fd, "name"),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    national_id: text(fd, "national_id"),
    notes: text(fd, "notes"),
    commission_pct: int(fd, "commission_pct") ?? 0,
  };
}

export async function createOwner(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Owner>("POST", "/owners", payload(fd)),
    (o) => withResult(dashboardHref(l, `/owners/${o.id}`), "created", o.name),
  );
}

export async function updateOwner(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Owner>("PATCH", `/owners/${assertId(id)}`, payload(fd)),
    (o) => withResult(dashboardHref(l, `/owners/${o.id}`), "saved", o.name),
  );
}

export async function deleteOwner(id: string, locale: string, name: string, _: FormState): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/owners/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/owners"), "deleted", name),
  );
}
```

Create `web/src/app/[locale]/dashboard/owners/owner-form.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { FieldGrid, TextArea, TextField } from "@/components/admin/fields";
import type { FormAction, Owner } from "@/lib/admin/types";

export async function OwnerForm({ action, owner }: { action: FormAction; owner?: Owner }) {
  const t = await getTranslations("admin");
  return (
    <EntityForm formId="owner-form" action={action} submitLabel={owner ? t("actions.save") : t("owners.new")} cancelHref="/dashboard/owners">
      <Card title={t("owners.contact")}>
        <FieldGrid cols={2}>
          <TextField label={t("owners.name")} name="name" required defaultValue={owner?.name} />
          <TextField label={t("owners.phone")} name="phone" type="tel" dir="ltr" required defaultValue={owner?.phone} />
          <TextField label={t("owners.email")} name="email" type="email" dir="ltr" defaultValue={owner?.email} />
          <TextField label={t("owners.nationalId")} name="national_id" dir="ltr" defaultValue={owner?.national_id} />
        </FieldGrid>
      </Card>
      <Card title={t("owners.terms")}>
        <div className="space-y-5">
          <div className="max-w-48">
            <TextField label={t("owners.commission")} name="commission_pct" type="number" min={0} max={100} defaultValue={owner?.commission_pct ?? 0} />
          </div>
          <TextArea label={t("owners.notes")} hint={t("owners.notesHint")} name="notes" defaultValue={owner?.notes} />
        </div>
      </Card>
    </EntityForm>
  );
}
```

Create `web/src/app/[locale]/dashboard/owners/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { filterByQuery, param, type SearchParams } from "@/lib/admin/filter";
import type { Owner } from "@/lib/admin/types";

export default async function OwnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [t, all] = await Promise.all([getTranslations("admin"), adminGet<Owner[]>("/owners")]);
  const q = param(sp, "q");
  const rows = filterByQuery(all, q, (o) => [o.name, o.phone, o.email]);

  return (
    <>
      <PageHeader
        title={t("owners.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={q !== ""} />}
        actions={
          <GuardedLink href="/dashboard/owners/new" className={buttonClass("primary")}>
            {t("owners.new")}
          </GuardedLink>
        }
      />
      <FilterBar placeholder={t("owners.search")} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("owners.empty") : t("list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("owners.name"), t("owners.phone"), t("owners.email"), t("owners.commission")]}>
            {rows.map((o) => (
              <tr key={o.id} className={rowCls}>
                <td className={cellCls}>
                  <RowLink href={`/dashboard/owners/${o.id}`} primary={o.name} />
                </td>
                <td className={`${cellCls} num`} dir="ltr">
                  {o.phone}
                </td>
                <td className={cellCls} dir="ltr">
                  {o.email ?? "—"}
                </td>
                <td className={`${cellCls} num`}>{o.commission_pct}%</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/owners/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { createOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default async function NewOwnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin");
  return (
    <>
      <PageHeader title={t("owners.new")} back={{ href: "/dashboard/owners", label: t("actions.backToList") }} />
      <OwnerForm action={createOwner.bind(null, locale)} />
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/owners/[id]/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PageHeader } from "@/components/admin/page-header";
import { getOr404 } from "@/lib/admin/api";
import type { Owner } from "@/lib/admin/types";
import { deleteOwner, updateOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default async function EditOwnerPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, owner] = await Promise.all([getTranslations("admin"), getOr404<Owner>(`/owners/${id}`)]);
  return (
    <>
      <PageHeader title={owner.name} back={{ href: "/dashboard/owners", label: t("actions.backToList") }} />
      <div className="space-y-6">
        <OwnerForm key={owner.updated_at} action={updateOwner.bind(null, id, locale)} owner={owner} />
        <ConfirmDelete action={deleteOwner.bind(null, id, locale, owner.name)} name={owner.name} detail={t("confirm.referenced")} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd web && npx tsc --noEmit`. `curl -s -u admin:$PW "$W/en/dashboard/owners" | grep -o "Owner One\|>O<" | head -1`.

```bash
git add "web/src/app/[locale]/dashboard/owners"
git commit -m "feat(web): redesigned owners pages"
```

---

## Task 10 — Units and image manager

**Files:** `web/src/app/[locale]/dashboard/units/{actions.ts,image-actions.ts,unit-form.tsx,page.tsx,new/page.tsx,[id]/page.tsx}`, `web/src/components/admin/image-manager.tsx`

- [ ] **Step 1: Actions**

Create `web/src/app/[locale]/dashboard/units/actions.ts`:

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
import { pick } from "@/lib/admin/labels";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { withResult } from "@/lib/admin/result";
import type { FormState, Unit } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    owner_id: ref(fd, "owner_id"),
    compound_id: ref(fd, "compound_id"),
    slug: optional(fd, "slug"),
    title_ar: text(fd, "title_ar"),
    title_en: text(fd, "title_en"),
    description_ar: text(fd, "description_ar"),
    description_en: text(fd, "description_en"),
    house_rules_ar: text(fd, "house_rules_ar"),
    house_rules_en: text(fd, "house_rules_en"),
    type: text(fd, "type"),
    view: text(fd, "view"),
    status: text(fd, "status"),
    bedrooms: int(fd, "bedrooms"),
    bathrooms: int(fd, "bathrooms"),
    base_guests: int(fd, "base_guests"),
    max_guests: int(fd, "max_guests"),
    sea_distance_m: int(fd, "sea_distance_m"),
    area_sqm: nullableNumber(fd, "area_sqm"),
    floor: nullableNumber(fd, "floor"),
    row_number: nullableNumber(fd, "row_number"),
    amenities: list(fd, "amenities"),
    lat: nullableNumber(fd, "lat"),
    lng: nullableNumber(fd, "lng"),
    exact_address: text(fd, "exact_address"),
  };
}

/** New units land on their edit page, where the image manager lives. */
export async function createUnit(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Unit>("POST", "/units", payload(fd)),
    (u) => withResult(dashboardHref(l, `/units/${u.id}`), "created", pick(l, u.title_ar, u.title_en)),
  );
}

export async function updateUnit(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Unit>("PATCH", `/units/${assertId(id)}`, payload(fd)),
    (u) => withResult(dashboardHref(l, `/units/${u.id}`), "saved", pick(l, u.title_ar, u.title_en)),
  );
}

export async function deleteUnit(id: string, locale: string, name: string, _: FormState): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/units/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/units"), "deleted", name),
  );
}
```

Create `web/src/app/[locale]/dashboard/units/image-actions.ts`:

```ts
"use server";

import { assertId, attempt } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";

type Result = { error?: string };

/** One file per request (spec §4.3); the client loops over a multi-select. */
export async function uploadImage(unitId: string, fd: FormData): Promise<Result> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  const body = new FormData();
  body.set("file", file);
  return attempt(() => adminSend("POST", `/units/${assertId(unitId)}/images`, body));
}

export async function updateImage(
  unitId: string,
  imageId: string,
  patch: { alt_ar?: string; alt_en?: string; is_cover?: boolean },
): Promise<Result> {
  return attempt(() => adminSend("PATCH", `/units/${assertId(unitId)}/images/${assertId(imageId)}`, patch));
}

/** Rewrites sort to match the given order (index = sort). */
export async function reorderImages(unitId: string, orderedIds: string[]): Promise<Result> {
  return attempt(async () => {
    for (const [sort, imageId] of orderedIds.entries()) {
      await adminSend("PATCH", `/units/${assertId(unitId)}/images/${assertId(imageId)}`, { sort });
    }
  });
}

export async function deleteImage(unitId: string, imageId: string): Promise<Result> {
  return attempt(() => adminSend("DELETE", `/units/${assertId(unitId)}/images/${assertId(imageId)}`));
}
```

- [ ] **Step 2: Unit form (sections per spec §6.1)**

Create `web/src/app/[locale]/dashboard/units/unit-form.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, FieldGrid, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import { enumOptions, pick } from "@/lib/admin/labels";
import type { CompoundRow, Enums, FormAction, Owner, Unit } from "@/lib/admin/types";

export async function UnitForm({
  action,
  enums,
  owners,
  compounds,
  locale,
  unit,
}: {
  action: FormAction;
  enums: Enums;
  owners: Owner[];
  compounds: CompoundRow[];
  locale: string;
  unit?: Unit;
}) {
  const t = await getTranslations();
  const s = (key: string) => t(`admin.units.${key}`);
  const sections = [
    { id: "basics", label: s("sectionBasics") },
    { id: "text", label: s("sectionText") },
    { id: "rooms", label: s("sectionRooms") },
    { id: "location", label: s("sectionLocation") },
    { id: "amenities", label: s("sectionAmenities") },
    { id: "private", label: s("sectionPrivate") },
    ...(unit ? [{ id: "images", label: s("sectionImages") }] : []),
  ];

  return (
    <EntityForm
      formId="unit-form"
      action={action}
      submitLabel={unit ? t("admin.actions.save") : s("new")}
      cancelHref="/dashboard/units"
      sections={sections}
    >
      <Card id="basics" title={s("sectionBasics")}>
        <FieldGrid cols={2}>
          <SelectField
            label={s("compound")}
            name="compound_id"
            required
            options={compounds.map((c) => ({
              value: c.id,
              label: `${pick(locale, c.name_ar, c.name_en)} · ${pick(locale, c.area_name_ar, c.area_name_en)}`,
            }))}
            defaultValue={unit?.compound_id}
          />
          <SelectField
            label={s("owner")}
            name="owner_id"
            required
            options={owners.map((o) => ({ value: o.id, label: o.name }))}
            defaultValue={unit?.owner_id}
          />
          <SelectField
            label={s("status")}
            name="status"
            required
            hint={s("statusHint")}
            options={enumOptions(enums.unit_status, (v) => t(`enums.unit_status.${v}`))}
            defaultValue={unit?.status ?? "draft"}
          />
          <SelectField
            label={s("type")}
            name="type"
            required
            options={enumOptions(enums.type, (v) => t(`enums.type.${v}`))}
            defaultValue={unit?.type}
          />
        </FieldGrid>
      </Card>

      <Card id="text" title={s("sectionText")}>
        <div className="space-y-5">
          <BilingualField label={s("title")} name="title" ar={unit?.title_ar} en={unit?.title_en} required />
          <SlugField entity="units" sourceName="title_en" currentId={unit?.id} defaultValue={unit?.slug} />
          <BilingualField label={s("description")} name="description" ar={unit?.description_ar} en={unit?.description_en} required multiline />
        </div>
      </Card>

      <Card id="rooms" title={s("sectionRooms")}>
        <FieldGrid cols={4}>
          <TextField label={s("bedrooms")} name="bedrooms" type="number" min={0} required defaultValue={unit?.bedrooms} />
          <TextField label={s("bathrooms")} name="bathrooms" type="number" min={0} required defaultValue={unit?.bathrooms} />
          <TextField label={s("baseGuests")} name="base_guests" type="number" min={1} required defaultValue={unit?.base_guests} />
          <TextField label={s("maxGuests")} name="max_guests" type="number" min={1} required defaultValue={unit?.max_guests} />
          <TextField label={s("areaSqm")} name="area_sqm" type="number" min={1} defaultValue={unit?.area_sqm} />
        </FieldGrid>
      </Card>

      <Card id="location" title={s("sectionLocation")}>
        <FieldGrid cols={3}>
          <TextField label={s("seaDistance")} name="sea_distance_m" type="number" min={0} required defaultValue={unit?.sea_distance_m} />
          <TextField label={s("row")} hint={s("rowHint")} name="row_number" type="number" min={1} defaultValue={unit?.row_number} />
          <SelectField
            label={s("view")}
            name="view"
            required
            options={enumOptions(enums.view, (v) => t(`enums.view.${v}`))}
            defaultValue={unit?.view}
          />
          <TextField label={s("floor")} name="floor" type="number" defaultValue={unit?.floor} />
          <TextField label={s("lat")} name="lat" type="number" step="0.000001" min={-90} max={90} dir="ltr" defaultValue={unit?.lat} />
          <TextField label={s("lng")} name="lng" type="number" step="0.000001" min={-180} max={180} dir="ltr" defaultValue={unit?.lng} />
        </FieldGrid>
      </Card>

      <Card id="amenities" title={s("sectionAmenities")}>
        <div className="space-y-5">
          <TextField label={s("amenities")} hint={s("amenitiesHint")} name="amenities" defaultValue={unit?.amenities.join("، ")} />
          <BilingualField label={s("houseRules")} name="house_rules" ar={unit?.house_rules_ar} en={unit?.house_rules_en} multiline />
        </div>
      </Card>

      <Card id="private" title={s("sectionPrivate")}>
        <TextArea label={s("exactAddress")} hint={s("exactAddressHint")} name="exact_address" rows={2} defaultValue={unit?.exact_address} />
      </Card>
    </EntityForm>
  );
}
```

- [ ] **Step 3: Image manager**

Create `web/src/components/admin/image-manager.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element -- admin photos straight from MinIO */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { deleteImage, reorderImages, updateImage, uploadImage } from "@/app/[locale]/dashboard/units/image-actions";
import { Button, buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Modal } from "@/components/ds/modal";
import { StateBadge } from "@/components/ds/state-badge";
import type { UnitImage } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";
import { useToast } from "./toast";
import { inputCls } from "./ui";

type Result = { error?: string };

/**
 * Spec §4.3 + §6.2: upload and delete end in a result modal (delete asks
 * first); inline edits (cover, alt text, order) confirm with a toast.
 */
export function ImageManager({ unitId, images }: { unitId: string; images: UnitImage[] }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<UnitImage | null>(null);
  const [result, setResult] = useState<{ title: string; body: string } | null>(null);

  function run(task: () => Promise<Result>, onSuccess: () => void) {
    startTransition(async () => {
      setError(null);
      const outcome = await task();
      if (outcome.error) setError(outcome.error);
      else onSuccess();
      router.refresh();
    });
  }

  function uploadAll(files: File[]) {
    run(
      async () => {
        for (const file of files) {
          const fd = new FormData();
          fd.set("file", file);
          const outcome = await uploadImage(unitId, fd);
          if (outcome.error) return { error: `${file.name}: ${outcome.error}` };
        }
        return {};
      },
      () => setResult({ title: t("feedback.imagesUploadedTitle"), body: t("feedback.imagesUploaded", { count: files.length }) }),
    );
  }

  function move(index: number, delta: -1 | 1) {
    const ids = images.map((i) => i.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => reorderImages(unitId, ids), () => toast(t("feedback.orderSaved")));
  }

  function saveAlt(img: UnitImage, field: "alt_ar" | "alt_en", value: string) {
    if (value === (img[field] ?? "")) return;
    run(() => updateImage(unitId, img.id, { [field]: value }), () => toast(t("feedback.altSaved")));
  }

  function confirmDelete() {
    const img = confirming;
    if (!img) return;
    startTransition(async () => {
      setError(null);
      const outcome = await deleteImage(unitId, img.id);
      setConfirming(null);
      if (outcome.error) setError(outcome.error);
      else setResult({ title: t("feedback.deleted"), body: t("feedback.imageDeleted") });
      router.refresh();
    });
  }

  return (
    <Card
      id="images"
      title={t("units.sectionImages")}
      actions={
        <label className={`${buttonClass("secondary", "sm")} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? t("actions.working") : t("actions.addImages")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length > 0) uploadAll(files);
            }}
          />
        </label>
      }
    >
      <p className="mb-4 text-xs text-ink-muted">{t("units.imagesHint")}</p>
      {error && (
        <div className="mb-4">
          <ErrorBanner title={t("feedback.notSaved")} message={error} />
        </div>
      )}

      {images.length === 0 ? (
        <div className="rounded-lg bg-sand px-6 py-12 text-center text-sm text-ink">{t("units.noImages")}</div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((img, i) => (
            <li key={`${img.id}-${img.updated_at}`} className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-lg bg-sand">
                <img src={img.url} alt={img.alt_en ?? img.alt_ar ?? ""} className="block w-full" />
                {img.is_cover && (
                  <span className="absolute start-3 top-3">
                    <StateBadge tone="confirmed">{t("units.cover")}</StateBadge>
                  </span>
                )}
              </div>
              <input
                className={inputCls}
                dir="rtl"
                aria-label={t("units.altAr")}
                placeholder={t("units.altAr")}
                defaultValue={img.alt_ar ?? ""}
                onBlur={(e) => saveAlt(img, "alt_ar", e.currentTarget.value)}
              />
              <input
                className={inputCls}
                dir="ltr"
                aria-label={t("units.altEn")}
                placeholder={t("units.altEn")}
                defaultValue={img.alt_en ?? ""}
                onBlur={(e) => saveAlt(img, "alt_en", e.currentTarget.value)}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="quiet" size="sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={t("actions.moveEarlier")}>
                  <ChevronLeft className="size-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={busy || i === images.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("actions.moveLater")}
                >
                  <ChevronRight className="size-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                </Button>
                {!img.is_cover && (
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => updateImage(unitId, img.id, { is_cover: true }), () => toast(t("feedback.coverUpdated")))}
                  >
                    {t("actions.makeCover")}
                  </Button>
                )}
                <Button variant="danger" size="sm" className="ms-auto" disabled={busy} onClick={() => setConfirming(img)}>
                  {t("actions.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={confirming !== null}
        busy={busy}
        onClose={() => setConfirming(null)}
        title={t("confirm.imageTitle")}
        actions={
          <>
            <Button variant="secondary" data-autofocus disabled={busy} onClick={() => setConfirming(null)}>
              {t("actions.cancel")}
            </Button>
            <Button variant="danger" disabled={busy} onClick={confirmDelete}>
              {busy ? t("actions.deleting") : t("actions.delete")}
            </Button>
          </>
        }
      >
        <p>{t("confirm.deleteBody")}</p>
        <p>{t("confirm.image")}</p>
      </Modal>

      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title={result?.title ?? ""}
        actions={
          <Button variant="primary" data-autofocus onClick={() => setResult(null)}>
            {t("actions.done")}
          </Button>
        }
      >
        <p>{result?.body}</p>
      </Modal>
    </Card>
  );
}
```

- [ ] **Step 4: Pages**

Create `web/src/app/[locale]/dashboard/units/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import { filterUnits, hasFilters, unitFilters, type SearchParams } from "@/lib/admin/filter";
import { enumOptions, pick } from "@/lib/admin/labels";
import type { CompoundRow, Enums, UnitRow } from "@/lib/admin/types";

export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all, compounds, enums] = await Promise.all([
    getTranslations(),
    adminGet<UnitRow[]>("/units"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Enums>("/enums"),
  ]);
  const filters = unitFilters(sp);
  const rows = filterUnits(all, filters);

  return (
    <>
      <PageHeader
        title={t("admin.units.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={hasFilters({ ...filters })} />}
        actions={
          <GuardedLink href="/dashboard/units/new" className={buttonClass("primary")}>
            {t("admin.units.new")}
          </GuardedLink>
        }
      />
      <FilterBar
        placeholder={t("admin.units.search")}
        selects={[
          {
            name: "status",
            label: t("admin.units.filterStatus"),
            options: enumOptions(enums.unit_status, (v) => t(`enums.unit_status.${v}`)),
          },
          {
            name: "compound",
            label: t("admin.units.filterCompound"),
            options: compounds.map((c) => ({ value: c.id, label: pick(locale, c.name_ar, c.name_en) })),
          },
          {
            name: "type",
            label: t("admin.units.filterType"),
            options: enumOptions(enums.type, (v) => t(`enums.type.${v}`)),
          },
        ]}
      />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("admin.units.empty") : t("admin.list.noResults")}</EmptyState>
        ) : (
          <UnitsTable rows={rows} locale={locale} />
        )}
      </Card>
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/units/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { CompoundRow, Enums, Owner } from "@/lib/admin/types";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function NewUnitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, enums, owners, compounds] = await Promise.all([
    getTranslations("admin"),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  return (
    <>
      <PageHeader title={t("units.new")} subtitle={t("units.newHint")} back={{ href: "/dashboard/units", label: t("actions.backToList") }} />
      <UnitForm action={createUnit.bind(null, locale)} enums={enums} owners={owners} compounds={compounds} locale={locale} />
    </>
  );
}
```

Create `web/src/app/[locale]/dashboard/units/[id]/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { StateBadge } from "@/components/ds/state-badge";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { ImageManager } from "@/components/admin/image-manager";
import { PageHeader } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick, unitStatusTone } from "@/lib/admin/labels";
import type { CompoundRow, Enums, Owner, UnitDetail } from "@/lib/admin/types";
import { deleteUnit, updateUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function EditUnitPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, unit, enums, owners, compounds] = await Promise.all([
    getTranslations(),
    getOr404<UnitDetail>(`/units/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  const name = pick(locale, unit.title_ar, unit.title_en);

  return (
    <>
      <PageHeader
        title={name}
        back={{ href: "/dashboard/units", label: t("admin.actions.backToList") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <StateBadge tone={unitStatusTone(unit.status)}>{t(`enums.unit_status.${unit.status}`)}</StateBadge>
            {unit.status === "active" && (
              <a href={`/${locale}/unit/${unit.slug}`} target="_blank" rel="noreferrer" className={`${linkCls} text-sm`}>
                {t("admin.actions.viewPublic")}
              </a>
            )}
          </span>
        }
      />
      <div className="space-y-6">
        <UnitForm
          key={unit.updated_at}
          action={updateUnit.bind(null, id, locale)}
          enums={enums}
          owners={owners}
          compounds={compounds}
          locale={locale}
          unit={unit}
        />
        <ImageManager unitId={id} images={unit.images} />
        <ConfirmDelete action={deleteUnit.bind(null, id, locale, name)} name={name} detail={t("admin.confirm.unit")} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `cd web && npx tsc --noEmit`. Then:

```bash
U1=$(docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres psql -U sahel -d sahel -tAc "SELECT id FROM units WHERE slug='u1'")
curl -s -u admin:$PW "$W/ar/dashboard/units?status=active" | grep -o "منشورة" | head -1
curl -s -u admin:$PW "$W/en/dashboard/units/$U1" | grep -o "Upload images\|Danger zone\|Rooms and guests" | sort -u
```

Expected: `منشورة`; all three English strings.

```bash
git add "web/src/app/[locale]/dashboard/units" web/src/components/admin/image-manager.tsx
git commit -m "feat(web): redesigned units pages, sectioned form and image manager"
```

---

## Task 11 — Full verification

- [ ] **Step 1: Static checks, tests, build**

```bash
cd web && npx tsc --noEmit && npm test && NEXT_DIST_DIR=.next-build npm run build
GO 'go test ./internal/http/...'
```

Expected: typecheck 0; all node tests pass; the build succeeds with every `/[locale]/dashboard` route dynamic (`ƒ`); Go `ok`.

- [ ] **Step 2: Smoke, both languages**

```bash
for l in ar en; do for p in "" /areas /areas/new /compounds /compounds/new /owners /owners/new /units /units/new; do
  printf '%-4s %-18s %s\n' $l "$p" "$(curl -s -o /dev/null -w '%{http_code}' -u admin:$PW $W/$l/dashboard$p)"; done; done
curl -s -u admin:$PW $W/ar/dashboard | grep -c 'dir="rtl"'; curl -s -u admin:$PW $W/en/dashboard | grep -c 'dir="ltr"'
curl -s -o /dev/null -w 'no auth %{http_code}\n' $W/en/dashboard/units
curl -s -o /dev/null -w 'legacy %{http_code} %{redirect_url}\n' "$W/dashboard/units?status=draft"
```

Expected: every page `200`; both `dir` counts ≥1; `no auth 401`; `legacy 307 …/ar/dashboard/units?status=draft`.

- [ ] **Step 3: Hand the browser checklist to the owner** (spec §8, manual 1–6).

- [ ] **Step 4:** `git status --short` shows nothing tracked modified.

---

## Done criteria

- Admin at `/ar/dashboard` (RTL) and `/en/dashboard` (LTR) on Beet Elsahel tokens and components; `/dashboard/*` redirects.
- Success modal after every create, update and delete; confirm modal before every delete; discard-changes modal on in-app navigation; no `confirm()`/`alert()` left (`grep -rn "confirm(\|alert(" web/src` → only `confirmLeave`/`confirmDelete` identifiers).
- Sectioned unit form with jump list and sticky save bar showing the unsaved hint.
- Search on every list, with status, compound and type filters on units, all in the URL.
- Typecheck, node tests, `next build`, and Go tests are green.
