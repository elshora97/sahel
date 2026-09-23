# Phase 2d — Admin UI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/dashboard/*` in the Next.js app. It's gated by the same `ADMIN_PASSWORD` as the API and lets one operator create and edit areas, compounds, owners and units, and manage unit images, all through the Phase 2c admin API.

**Architecture:** `/dashboard` sits outside the `[locale]` tree. It is English, LTR, has its own root layout, and uses plain Tailwind (no shadcn shell, per spec §4). The middleware handles HTTP Basic auth for `/dashboard/*` and hands every other path to next-intl. Pages are server components that call the Go API through one server-side `adminFetch` helper. Writes are Server Actions: each maps `FormData` to the API's JSON body and returns `{error}` for the error banner, or redirects. Forms submit through `onSubmit` → `useActionState` dispatch rather than the `action` prop, because React 19 resets `action` forms and would wipe the admin's input on a validation error.

**Tech Stack:** Next.js 15.5 (App Router, Server Actions, Node-runtime middleware), React 19, Tailwind 4, TypeScript 5.7, Node 22 built-in test runner (`node --test --experimental-strip-types`) for the few pure helpers.

**Spec:** `docs/superpowers/specs/2026-09-08-phase-2-catalog-design.md` §4, §6. **API contract:** `docs/superpowers/plans/2026-09-23-phase-2c-admin-api.md` ("Admin API conventions").

---

## Conventions for this plan

- Run web commands from `web/`: `npm run typecheck`, `npm test`, `npm run build`.
- The API must be running for the smoke steps: `docker compose -f infra/docker-compose.yml --env-file .env up -d`.
- `web` reads the **repo-root** `.env` (Task 1), so `ADMIN_PASSWORD` and `NEXT_PUBLIC_API_URL` are shared with the API.
- Every file below is given in full. "Create" means write the file with exactly that content. "Replace" means overwrite an existing file.

## File structure

**Create:**
- `web/src/lib/slug.ts` (+ `slug.test.ts`): client mirror of Go `slug.Make` for the on-blur auto-fill.
- `web/src/lib/admin/auth.ts` (+ `auth.test.ts`): pure Basic-auth check used by the middleware.
- `web/src/lib/admin/form.ts` (+ `form.test.ts`): `FormData` → payload helpers.
- `web/src/lib/admin/types.ts`: API row types, `FormState`, `FormAction`.
- `web/src/lib/admin/api.ts`: server-side `adminFetch`, `adminGet`, `adminSend`, `getOr404`, `ApiError`.
- `web/src/lib/admin/actions.ts`: `mutate`, `attempt`, `assertId`, `errorMessage` for Server Actions.
- `web/src/components/admin/ui.ts`: shared class strings.
- `web/src/components/admin/fields.tsx`: `TextField`, `TextArea`, `BilingualField`, `SelectField`, `CheckboxField`.
- `web/src/components/admin/entity-form.tsx`: form shell with error banner and pending state.
- `web/src/components/admin/slug-field.tsx`: auto-fill + uniqueness hint.
- `web/src/components/admin/delete-button.tsx`
- `web/src/components/admin/page-header.tsx`
- `web/src/components/admin/units-table.tsx`
- `web/src/components/admin/image-manager.tsx`
- `web/src/app/dashboard/layout.tsx`, `page.tsx`, `not-found.tsx`, `slug-action.ts`
- `web/src/app/dashboard/areas/{page,area-form,actions}.tsx|ts`, `new/page.tsx`, `[id]/page.tsx`
- `web/src/app/dashboard/compounds/…` (same shape)
- `web/src/app/dashboard/owners/…` (same shape)
- `web/src/app/dashboard/units/…` (same shape) + `image-actions.ts`

**Modify / replace:**
- `web/next.config.ts`: load the root `.env`; raise the Server Action body limit to 11 MB for uploads.
- `web/src/middleware.ts`: Basic auth on `/dashboard/*`, next-intl everywhere else, Node runtime.
- `web/src/app/layout.tsx`: pass-through (each subtree now owns its `<html>`).
- `web/src/app/not-found.tsx`: renders its own `<html>`.
- `web/tsconfig.json`: `allowImportingTsExtensions` (tests import `./x.ts`).
- `web/package.json`: `test` script.
- `Makefile`: `test` also runs `npm test`.

**Do not touch:** `api/`, `infra/`, `web/src/app/[locale]/**` (public UI is Phase 2e).

---

## Task 1 — Plumbing: env, layouts, test runner

**Files:** `web/next.config.ts`, `web/src/app/layout.tsx`, `web/src/app/not-found.tsx`, `web/tsconfig.json`, `web/package.json`, `Makefile`

- [ ] **Step 1: Replace `web/next.config.ts`**

```ts
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The repo keeps one .env at its root, shared by the API and the web app.
// Next only reads env files next to itself, so load the root one too.
// Variables already set in the real environment win.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "..", ".env"));
} catch {
  // No root .env (CI, production): rely on the real environment.
}

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Unit images travel through a Server Action; the API caps them at 10 MB.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Replace `web/src/app/layout.tsx`**

`/[locale]` and `/dashboard` each render their own `<html>` (different `lang`/`dir`), so the top-level layout only passes through:

```tsx
import type { ReactNode } from "react";

// Each subtree ([locale], dashboard) renders its own <html> with the right
// lang and dir, so the top-level layout only passes children through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
```

- [ ] **Step 3: Replace `web/src/app/not-found.tsx`**

```tsx
// Rendered outside every subtree layout, so it brings its own document.
export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "4rem", fontFamily: "system-ui, sans-serif" }}>
          <h1>404</h1>
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Test runner**

`web/tsconfig.json`: add `"allowImportingTsExtensions": true,` after `"noEmit": true,`.

`web/package.json` `scripts`: add after `"typecheck"`:

```json
    "test": "node --experimental-strip-types --no-warnings --test \"src/**/*.test.ts\""
```

`Makefile` `test` target: replace `> cd web && npm run typecheck` with `> cd web && npm run typecheck && npm test`.

- [ ] **Step 5: Verify**

Run: `cd web && npm run typecheck`
Expected: exits 0. (`npm test` has no test files yet. Task 2 adds them.)

- [ ] **Step 6: Commit**

```bash
git add web/next.config.ts web/src/app/layout.tsx web/src/app/not-found.tsx web/tsconfig.json web/package.json Makefile
git commit -m "chore(web): root .env, per-subtree html, node test runner"
```

---

## Task 2 — Pure helpers (TDD): slugify, Basic auth, form parsing

**Files:** `web/src/lib/slug.ts`, `web/src/lib/slug.test.ts`, `web/src/lib/admin/auth.ts`, `web/src/lib/admin/auth.test.ts`, `web/src/lib/admin/form.ts`, `web/src/lib/admin/form.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/slug.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.ts";

// Mirrors api/internal/slug tests: the admin's auto-filled slug must be the
// one the API would accept as canonical.
test("slugify matches the Go slug package", () => {
  const cases: Array<[string, string]> = [
    ["Sidi Abdel Rahman", "sidi-abdel-rahman"],
    ["Café del Mar", "cafe-del-mar"],
    ["  --Hello,  World!--  ", "hello-world"],
    ["Villa 4BR", "villa-4br"],
    ["مراسي", ""],
    ["", ""],
  ];
  for (const [input, want] of cases) {
    assert.equal(slugify(input), want, `slugify(${JSON.stringify(input)})`);
  }
});
```

Create `web/src/lib/admin/auth.test.ts`:

```ts
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
```

Create `web/src/lib/admin/form.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkbox, int, list, nullableNumber, optional, ref, text } from "./form.ts";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

test("text trims and treats a missing key as empty", () => {
  assert.equal(text(fd({ a: "  x  " }), "a"), "x");
  assert.equal(text(fd({}), "a"), "");
});

test("optional and ref drop blanks", () => {
  assert.equal(optional(fd({ slug: " " }), "slug"), undefined);
  assert.equal(optional(fd({ slug: "marassi" }), "slug"), "marassi");
  assert.equal(ref(fd({ area_id: "" }), "area_id"), null);
});

test("numbers", () => {
  assert.equal(int(fd({ n: "4" }), "n"), 4);
  assert.equal(int(fd({ n: "" }), "n"), undefined);
  assert.equal(nullableNumber(fd({ lat: "" }), "lat"), null);
  assert.equal(nullableNumber(fd({ lat: "30.9876" }), "lat"), 30.9876);
});

test("checkbox is on only when checked", () => {
  assert.equal(checkbox(fd({ f: "on" }), "f"), true);
  assert.equal(checkbox(fd({}), "f"), false);
});

test("list splits on commas (Latin and Arabic) and newlines", () => {
  assert.deepEqual(list(fd({ a: " pool, beach ،gym\nwifi,, " }), "a"), ["pool", "beach", "gym", "wifi"]);
  assert.deepEqual(list(fd({}), "a"), []);
});
```

- [ ] **Step 2: Confirm they fail**

Run: `cd web && npm test`
Expected: FAIL, `Cannot find module …/slug.ts` (and auth.ts, form.ts).

- [ ] **Step 3: Implement**

Create `web/src/lib/slug.ts`:

```ts
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
```

Create `web/src/lib/admin/auth.ts`:

```ts
/**
 * HTTP Basic check for /dashboard (spec §6). Mirrors the Go API: the
 * username is ignored and an unset password rejects everyone.
 */
export function isAuthorized(header: string | null, password: string | undefined): boolean {
  if (!password || !header || !header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    const binary = atob(header.slice("Basic ".length).trim());
    decoded = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  return constantTimeEqual(decoded.slice(colon + 1), password);
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export const basicAuthChallenge = {
  status: 401,
  headers: { "WWW-Authenticate": 'Basic realm="sahel-admin", charset="UTF-8"' },
};
```

Create `web/src/lib/admin/form.ts`:

```ts
/**
 * FormData → JSON payload helpers for the admin Server Actions. Blank
 * nullable text is sent as "" on purpose: the API stores blanks as NULL,
 * which is how an admin clears a field on edit.
 */

export const text = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();

/** Omitted from the JSON body when blank (e.g. slug: "let the API derive it"). */
export const optional = (fd: FormData, key: string): string | undefined => text(fd, key) || undefined;

/** A foreign-key id; blank becomes null so the API says "x cannot be null". */
export const ref = (fd: FormData, key: string): string | null => text(fd, key) || null;

/** A NOT NULL number; blank is omitted so create reports "x is required". */
export function int(fd: FormData, key: string): number | undefined {
  const v = text(fd, key);
  return v === "" ? undefined : Number(v);
}

/** A nullable number; blank clears the column. */
export function nullableNumber(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  return v === "" ? null : Number(v);
}

export const checkbox = (fd: FormData, key: string): boolean => fd.get(key) === "on";

/** Comma- (Latin or Arabic) or newline-separated input → trimmed, non-empty items. */
export function list(fd: FormData, key: string): string[] {
  return text(fd, key)
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm test && npm run typecheck`
Expected: all tests pass (4 files' worth); typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/slug.ts web/src/lib/slug.test.ts web/src/lib/admin/
git commit -m "feat(web): slugify, basic-auth check, and form helpers"
```

---

## Task 3 — Middleware + API client + dashboard shell

**Files:** `web/src/middleware.ts`, `web/src/lib/admin/types.ts`, `web/src/lib/admin/api.ts`, `web/src/lib/admin/actions.ts`, `web/src/components/admin/ui.ts`, `web/src/components/admin/page-header.tsx`, `web/src/components/admin/units-table.tsx`, `web/src/app/dashboard/layout.tsx`, `web/src/app/dashboard/page.tsx`, `web/src/app/dashboard/not-found.tsx`

- [ ] **Step 1: Replace `web/src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { basicAuthChallenge, isAuthorized } from "./lib/admin/auth";

const intl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    // Covers pages and the Server Action POSTs made from them.
    if (!isAuthorized(req.headers.get("authorization"), process.env.ADMIN_PASSWORD)) {
      return new NextResponse("Admin password required", basicAuthChallenge);
    }
    return NextResponse.next();
  }
  return intl(req);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
  // Node runtime so ADMIN_PASSWORD is read from the server's env per request.
  runtime: "nodejs",
};
```

- [ ] **Step 2: Create `web/src/lib/admin/types.ts`**

```ts
/** Shapes returned by /api/v1/admin/*. Numeric(9,6) columns arrive as numbers. */

export interface Area {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  region: string;
  km_marker: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Compound {
  id: string;
  area_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  amenities: string[];
  beach_type: string;
  gate_info_ar: string | null;
  gate_info_en: string | null;
  lat: number | null;
  lng: number | null;
  cover_image_url: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompoundRow extends Compound {
  area_name_en: string;
}

export interface Owner {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  national_id: string | null;
  notes: string | null;
  commission_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  owner_id: string;
  compound_id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  house_rules_ar: string | null;
  house_rules_en: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  base_guests: number;
  max_guests: number;
  area_sqm: number | null;
  floor: number | null;
  sea_distance_m: number;
  view: string;
  row_number: number | null;
  amenities: string[];
  lat: number | null;
  lng: number | null;
  exact_address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UnitImage {
  id: string;
  unit_id: string;
  url: string;
  alt_ar: string | null;
  alt_en: string | null;
  sort: number;
  is_cover: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitDetail extends Unit {
  images: UnitImage[];
}

export interface UnitRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  type: string;
  status: string;
  bedrooms: number;
  max_guests: number;
  updated_at: string;
  compound_name_en: string;
  owner_name: string;
  cover_url: string | null;
}

export interface Enums {
  region: string[];
  beach_type: string[];
  type: string[];
  view: string[];
  unit_status: string[];
}

/** What a form Server Action hands back to its form: nothing, or a banner. */
export type FormState = { error: string } | null;
export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;
```

- [ ] **Step 3: Create `web/src/lib/admin/api.ts`**

```ts
import { notFound } from "next/navigation";

/**
 * Server-side client for /api/v1/admin/*. Never import this from a client
 * component: it reads ADMIN_PASSWORD from the server environment.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function apiBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
}

function authorization(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set for the web app (see .env)");
  return "Basic " + Buffer.from(`admin:${password}`, "utf8").toString("base64");
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization());
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  const res = await fetch(`${apiBase()}/api/v1/admin${path}`, { ...init, headers, cache: "no-store" });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `The API answered ${res.status}`,
    );
  }
  return body as T;
}

export function adminGet<T>(path: string): Promise<T> {
  return adminFetch<T>(path);
}

export function adminSend<T = unknown>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const payload = body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body);
  return adminFetch<T>(path, { method, body: payload });
}

/** GET that turns an API 404 into the dashboard's not-found page. */
export async function getOr404<T>(path: string): Promise<T> {
  try {
    return await adminFetch<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
```

- [ ] **Step 4: Create `web/src/lib/admin/actions.ts`**

```ts
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "./api";
import type { FormState } from "./types";

/** Helpers for Server Actions. Not a "use server" module itself. */

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Runs an API write. On failure the form gets an error banner; on success
 * every dashboard page is revalidated and the browser is sent to `next`.
 */
export async function mutate<T>(
  run: () => Promise<T>,
  next: string | ((result: T) => string),
): Promise<FormState> {
  const outcome = await run().then(
    (value) => ({ ok: true as const, value }),
    (e: unknown) => ({ ok: false as const, error: errorMessage(e) }),
  );
  if (!outcome.ok) return { error: outcome.error };
  revalidatePath("/dashboard", "layout");
  redirect(typeof next === "string" ? next : next(outcome.value));
}

/** Like mutate, for in-place edits (images) that stay on the page. */
export async function attempt(run: () => Promise<unknown>, revalidate: string): Promise<{ error?: string }> {
  try {
    await run();
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(revalidate);
  return {};
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server Actions are public endpoints; never splice an unchecked id into a URL. */
export function assertId(id: string): string {
  if (!uuidPattern.test(id)) throw new Error(`invalid id ${JSON.stringify(id)}`);
  return id;
}
```

- [ ] **Step 5: Shared UI bits**

Create `web/src/components/admin/ui.ts`:

```ts
export const inputCls =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const labelCls = "mb-1 block text-sm font-medium";
export const hintCls = "mt-1 block text-xs text-muted-foreground";
export const buttonCls =
  "inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
export const secondaryButtonCls =
  "inline-flex items-center rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-sand/40 disabled:opacity-40";
export const dangerButtonCls =
  "inline-flex items-center rounded-md border border-destructive px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50";
export const linkCls = "font-medium text-sea hover:underline";
export const tableCls =
  "w-full text-sm [&_th]:py-2 [&_th]:pe-4 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:py-2 [&_td]:pe-4 [&_tr]:border-b [&_tr]:border-border";
```

Create `web/src/components/admin/page-header.tsx`:

```tsx
import Link from "next/link";

import { buttonCls, linkCls } from "./ui";

export function PageHeader({ title, newHref, back }: { title: string; newHref?: string; back?: string }) {
  return (
    <div className="mb-6 space-y-1">
      {back && (
        <Link href={back} className={`${linkCls} text-sm`}>
          ← Back
        </Link>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {newHref && (
          <Link href={newHref} className={buttonCls}>
            New
          </Link>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
```

Create `web/src/components/admin/units-table.tsx`:

```tsx
/* eslint-disable @next/next/no-img-element -- admin thumbnails straight from MinIO; no optimisation needed */
import Link from "next/link";

import type { UnitRow } from "@/lib/admin/types";
import { linkCls, tableCls } from "./ui";

const statusStyle: Record<string, string> = {
  active: "bg-lagoon/50",
  draft: "bg-sand",
  paused: "bg-sun/40",
  archived: "bg-state-blocked/60",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${statusStyle[status] ?? "bg-sand"}`}>{status}</span>;
}

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  });
}

export function UnitsTable({ rows }: { rows: UnitRow[] }) {
  return (
    <table className={tableCls}>
      <thead>
        <tr>
          <th className="w-16" />
          <th>Title</th>
          <th>Compound</th>
          <th>Type</th>
          <th>Beds</th>
          <th>Status</th>
          <th>Edited</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>
              {u.cover_url ? (
                <img src={u.cover_url} alt="" className="h-10 w-14 rounded object-cover" />
              ) : (
                <div className="h-10 w-14 rounded bg-sand" />
              )}
            </td>
            <td>
              <Link href={`/dashboard/units/${u.id}`} className={linkCls}>
                {u.title_en}
              </Link>
              <div className="text-xs text-muted-foreground" dir="rtl">
                {u.title_ar}
              </div>
            </td>
            <td>{u.compound_name_en}</td>
            <td>{u.type}</td>
            <td>{u.bedrooms}</td>
            <td>
              <StatusBadge status={u.status} />
            </td>
            <td className="whitespace-nowrap text-muted-foreground">{formatWhen(u.updated_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 6: Dashboard layout, home, not-found**

Create `web/src/app/dashboard/layout.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Readex_Pro } from "next/font/google";

import "../globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sahel admin",
  robots: { index: false, follow: false },
};

// Every admin page reads live data; nothing here is cacheable.
export const dynamic = "force-dynamic";

const nav = [
  ["Areas", "/dashboard/areas"],
  ["Compounds", "/dashboard/compounds"],
  ["Owners", "/dashboard/owners"],
  ["Units", "/dashboard/units"],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${readex.variable} min-h-screen bg-background text-foreground`}>
        <header className="border-b border-border bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/dashboard" className="font-semibold">
              Sahel admin
            </Link>
            {nav.map(([label, href]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
```

Create `web/src/app/dashboard/not-found.tsx`:

```tsx
import Link from "next/link";

import { linkCls } from "@/components/admin/ui";

export default function DashboardNotFound() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That record doesn&apos;t exist, or it was deleted.</p>
      <Link href="/dashboard" className={linkCls}>
        Back to the dashboard
      </Link>
    </div>
  );
}
```

Create `web/src/app/dashboard/page.tsx`:

```tsx
import Link from "next/link";

import { EmptyState } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import type { Area, CompoundRow, Owner, UnitRow } from "@/lib/admin/types";

export default async function DashboardHome() {
  const [areas, compounds, owners, units] = await Promise.all([
    adminGet<Area[]>("/areas"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Owner[]>("/owners"),
    adminGet<UnitRow[]>("/units"), // newest edit first
  ]);

  const counts = [
    ["Areas", areas.length, "/dashboard/areas"],
    ["Compounds", compounds.length, "/dashboard/compounds"],
    ["Owners", owners.length, "/dashboard/owners"],
    ["Units", units.length, "/dashboard/units"],
  ] as const;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {counts.map(([label, n, href]) => (
          <Link key={href} href={href} className="rounded-lg border border-border bg-white p-4 hover:border-sea">
            <div className="text-3xl font-semibold tabular-nums">{n}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </Link>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recently edited units</h2>
        {units.length === 0 ? (
          <EmptyState>
            No units yet.{" "}
            <Link href="/dashboard/units/new" className={linkCls}>
              Create the first one
            </Link>
            .
          </EmptyState>
        ) : (
          <UnitsTable rows={units.slice(0, 8)} />
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Verify auth and the shell**

Run: `cd web && npm run typecheck`. Expected: exits 0.

Start the dev server in the background: `cd web && npm run dev`. Then:

```bash
PW=$(grep ^ADMIN_PASSWORD= .env | cut -d= -f2-)
curl -s -o /dev/null -w '%{http_code} ' http://localhost:3000/dashboard; curl -sI http://localhost:3000/dashboard | grep -i www-authenticate
curl -s -u admin:$PW http://localhost:3000/dashboard | grep -o "Recently edited units"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/ar
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/
```

Expected: `401` plus a `WWW-Authenticate: Basic realm="sahel-admin"…` header; `Recently edited units`; `200` for `/ar`; `307 http://localhost:3000/ar` for `/`.

- [ ] **Step 8: Commit**

```bash
git add web/src/middleware.ts web/src/lib/admin/types.ts web/src/lib/admin/api.ts web/src/lib/admin/actions.ts web/src/components/admin/ web/src/app/dashboard/
git commit -m "feat(web): password-gated /dashboard shell with counts and recent units"
```

---

## Task 4 — Form components

**Files:** `web/src/components/admin/fields.tsx`, `entity-form.tsx`, `slug-field.tsx`, `delete-button.tsx`, `web/src/app/dashboard/slug-action.ts`

- [ ] **Step 1: Create `web/src/components/admin/fields.tsx`**

```tsx
import { hintCls, inputCls, labelCls } from "./ui";

/*
  Plain uncontrolled inputs: EntityForm reads them with FormData on submit.
  Required marks are browser-native; the API is the real validator.
*/

type Base = { label: string; name: string; required?: boolean; hint?: string };
type Value = string | number | null | undefined;

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
      <span className={labelCls}>
        {label}
        {required && " *"}
      </span>
      <input
        className={inputCls}
        name={name}
        type={type}
        dir={dir}
        required={required}
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
      <span className={labelCls}>
        {label}
        {required && " *"}
      </span>
      <textarea className={inputCls} name={name} dir={dir} rows={rows} required={required} defaultValue={defaultValue ?? ""} />
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

/**
 * The spec §4.2 pair: Arabic and English side by side, Arabic typed RTL.
 * Submits as `${name}_ar` and `${name}_en`.
 */
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

export type Option = string | { value: string; label: string };

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
      <span className={labelCls}>
        {label}
        {required && " *"}
      </span>
      <select className={inputCls} name={name} required={required} defaultValue={defaultValue ?? ""}>
        <option value="">—</option>
        {options.map((o) => {
          const { value, label: text } = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-sea" />
      {label}
    </label>
  );
}
```

- [ ] **Step 2: Create `web/src/components/admin/entity-form.tsx`**

```tsx
"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";

import type { FormAction } from "@/lib/admin/types";
import { buttonCls } from "./ui";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

/**
 * Submits through onSubmit rather than <form action>: React 19 resets an
 * action-driven form after it runs, which would wipe the admin's input
 * whenever the API rejects it. Here the fields keep their values and the
 * API's message shows in a banner above them.
 */
export function EntityForm({
  action,
  children,
  submitLabel = "Save",
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {state?.error && <ErrorBanner message={state.error} />}
      {children}
      <button type="submit" className={buttonCls} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `web/src/app/dashboard/slug-action.ts`**

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

- [ ] **Step 4: Create `web/src/components/admin/slug-field.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { slugTaken } from "@/app/dashboard/slug-action";
import { slugify } from "@/lib/slug";
import { hintCls, inputCls, labelCls } from "./ui";

type Status = "idle" | "checking" | "taken" | "free";

/**
 * Spec §4.2: auto-fills from the English name on blur (only while empty),
 * stays editable, and checks uniqueness against the API on blur. Leaving it
 * blank lets the API derive one.
 */
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

  const hint = {
    idle: "Leave blank to generate it from the English name.",
    checking: "Checking…",
    taken: "Already used. Pick another.",
    free: "Available.",
  }[status];

  return (
    <label className="block">
      <span className={labelCls}>Slug</span>
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
      <span className={`${hintCls} ${status === "taken" ? "text-destructive" : ""}`}>{hint}</span>
    </label>
  );
}
```

- [ ] **Step 5: Create `web/src/components/admin/delete-button.tsx`**

```tsx
"use client";

import { startTransition, useActionState } from "react";

import type { FormAction } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";
import { dangerButtonCls } from "./ui";

/** Confirms, then deletes. A 409 ("still referenced") shows as a banner. */
export function DeleteButton({ action, what }: { action: FormAction; what: string }) {
  const [state, dispatch, pending] = useActionState(action, null);
  return (
    <div className="space-y-3">
      {state?.error && <ErrorBanner message={state.error} />}
      <button
        type="button"
        className={dangerButtonCls}
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete this ${what}? This cannot be undone.`)) {
            startTransition(() => dispatch(new FormData()));
          }
        }}
      >
        {pending ? "Deleting…" : `Delete ${what}`}
      </button>
    </div>
  );
}

export function DangerZone({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-12 space-y-3 border-t border-border pt-6">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      {children}
    </section>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `cd web && npm run typecheck`. Expected: exits 0.

```bash
git add web/src/components/admin/ web/src/app/dashboard/slug-action.ts
git commit -m "feat(web): admin form components (bilingual fields, slug, delete)"
```

---

## Task 5 — Areas pages

**Files:** `web/src/app/dashboard/areas/actions.ts`, `area-form.tsx`, `page.tsx`, `new/page.tsx`, `[id]/page.tsx`

- [ ] **Step 1: Create `web/src/app/dashboard/areas/actions.ts`**

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, nullableNumber, optional, text } from "@/lib/admin/form";
import type { FormState } from "@/lib/admin/types";

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

export async function createArea(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("POST", "/areas", payload(fd)), "/dashboard/areas");
}

export async function updateArea(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/areas/${assertId(id)}`, payload(fd)), "/dashboard/areas");
}

export async function deleteArea(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/areas/${assertId(id)}`), "/dashboard/areas");
}
```

- [ ] **Step 2: Create `web/src/app/dashboard/areas/area-form.tsx`**

```tsx
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import type { Area, Enums, FormAction } from "@/lib/admin/types";

export function AreaForm({ action, enums, area }: { action: FormAction; enums: Enums; area?: Area }) {
  return (
    <EntityForm action={action} submitLabel={area ? "Save changes" : "Create area"}>
      <BilingualField label="Name" name="name" ar={area?.name_ar} en={area?.name_en} required />
      <SlugField entity="areas" sourceName="name_en" currentId={area?.id} defaultValue={area?.slug} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Region" name="region" options={enums.region} defaultValue={area?.region} required />
        <TextField label="Km marker" name="km_marker" type="number" min={0} defaultValue={area?.km_marker} hint="Km on the coastal road." />
        <TextField label="Sort order" name="sort_order" type="number" defaultValue={area?.sort_order ?? 0} hint="Lower shows first." />
      </div>
    </EntityForm>
  );
}
```

- [ ] **Step 3: Create the three pages**

Create `web/src/app/dashboard/areas/page.tsx`:

```tsx
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { linkCls, tableCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import type { Area } from "@/lib/admin/types";

export default async function AreasPage() {
  const areas = await adminGet<Area[]>("/areas");
  return (
    <>
      <PageHeader title="Areas" newHref="/dashboard/areas/new" />
      {areas.length === 0 ? (
        <EmptyState>No areas yet.</EmptyState>
      ) : (
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>الاسم</th>
              <th>Region</th>
              <th>Km</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/dashboard/areas/${a.id}`} className={linkCls}>
                    {a.name_en}
                  </Link>
                </td>
                <td dir="rtl">{a.name_ar}</td>
                <td>{a.region}</td>
                <td>{a.km_marker ?? "—"}</td>
                <td>{a.sort_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

Create `web/src/app/dashboard/areas/new/page.tsx`:

```tsx
import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Enums } from "@/lib/admin/types";
import { createArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function NewAreaPage() {
  const enums = await adminGet<Enums>("/enums");
  return (
    <>
      <PageHeader title="New area" back="/dashboard/areas" />
      <AreaForm action={createArea} enums={enums} />
    </>
  );
}
```

Create `web/src/app/dashboard/areas/[id]/page.tsx`:

```tsx
import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import type { Area, Enums } from "@/lib/admin/types";
import { deleteArea, updateArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function EditAreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [area, enums] = await Promise.all([getOr404<Area>(`/areas/${id}`), adminGet<Enums>("/enums")]);
  return (
    <>
      <PageHeader title={area.name_en} back="/dashboard/areas" />
      <AreaForm action={updateArea.bind(null, id)} enums={enums} area={area} />
      <DangerZone>
        <DeleteButton action={deleteArea.bind(null, id)} what="area" />
      </DangerZone>
    </>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `cd web && npm run typecheck`. Expected: exits 0.
With the dev server up: `curl -s -u admin:$PW http://localhost:3000/dashboard/areas/new | grep -o "Create area"` → `Create area`. `curl -s -o /dev/null -w '%{http_code}\n' -u admin:$PW http://localhost:3000/dashboard/areas/00000000-0000-4000-8000-000000000000` → `404`.

```bash
git add web/src/app/dashboard/areas/
git commit -m "feat(web): admin areas pages"
```

---

## Task 6 — Compounds pages

**Files:** `web/src/app/dashboard/compounds/actions.ts`, `compound-form.tsx`, `page.tsx`, `new/page.tsx`, `[id]/page.tsx`

- [ ] **Step 1: Create `web/src/app/dashboard/compounds/actions.ts`**

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { checkbox, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
import type { FormState } from "@/lib/admin/types";

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

export async function createCompound(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("POST", "/compounds", payload(fd)), "/dashboard/compounds");
}

export async function updateCompound(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/compounds/${assertId(id)}`, payload(fd)), "/dashboard/compounds");
}

export async function deleteCompound(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/compounds/${assertId(id)}`), "/dashboard/compounds");
}
```

- [ ] **Step 2: Create `web/src/app/dashboard/compounds/compound-form.tsx`**

```tsx
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, CheckboxField, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import type { Area, Compound, Enums, FormAction } from "@/lib/admin/types";

export function CompoundForm({
  action,
  enums,
  areas,
  compound,
}: {
  action: FormAction;
  enums: Enums;
  areas: Area[];
  compound?: Compound;
}) {
  return (
    <EntityForm action={action} submitLabel={compound ? "Save changes" : "Create compound"}>
      <SelectField
        label="Area"
        name="area_id"
        required
        options={areas.map((a) => ({ value: a.id, label: a.name_en }))}
        defaultValue={compound?.area_id}
      />
      <BilingualField label="Name" name="name" ar={compound?.name_ar} en={compound?.name_en} required />
      <SlugField entity="compounds" sourceName="name_en" currentId={compound?.id} defaultValue={compound?.slug} />
      <BilingualField label="Description" name="description" ar={compound?.description_ar} en={compound?.description_en} required multiline />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Beach type" name="beach_type" options={enums.beach_type} defaultValue={compound?.beach_type} required />
        <TextField
          label="Amenities"
          name="amenities"
          defaultValue={compound?.amenities.join(", ")}
          hint="Comma-separated: private beach, lagoons, gates, pools…"
        />
      </div>
      <BilingualField label="Gate info" name="gate_info" ar={compound?.gate_info_ar} en={compound?.gate_info_en} multiline />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Latitude" name="lat" type="number" step="0.000001" min={-90} max={90} defaultValue={compound?.lat} />
        <TextField label="Longitude" name="lng" type="number" step="0.000001" min={-180} max={180} defaultValue={compound?.lng} />
        <TextField label="Cover image URL" name="cover_image_url" type="url" defaultValue={compound?.cover_image_url} />
      </div>
      <CheckboxField label="Featured on the home page" name="is_featured" defaultChecked={compound?.is_featured} />
    </EntityForm>
  );
}
```

- [ ] **Step 3: Create the three pages**

Create `web/src/app/dashboard/compounds/page.tsx`:

```tsx
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { linkCls, tableCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import type { CompoundRow } from "@/lib/admin/types";

export default async function CompoundsPage() {
  const compounds = await adminGet<CompoundRow[]>("/compounds");
  return (
    <>
      <PageHeader title="Compounds" newHref="/dashboard/compounds/new" />
      {compounds.length === 0 ? (
        <EmptyState>No compounds yet. Create an area first.</EmptyState>
      ) : (
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>الاسم</th>
              <th>Area</th>
              <th>Beach</th>
              <th>Featured</th>
            </tr>
          </thead>
          <tbody>
            {compounds.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/dashboard/compounds/${c.id}`} className={linkCls}>
                    {c.name_en}
                  </Link>
                </td>
                <td dir="rtl">{c.name_ar}</td>
                <td>{c.area_name_en}</td>
                <td>{c.beach_type}</td>
                <td>{c.is_featured ? "★" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

Create `web/src/app/dashboard/compounds/new/page.tsx`:

```tsx
import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Area, Enums } from "@/lib/admin/types";
import { createCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function NewCompoundPage() {
  const [enums, areas] = await Promise.all([adminGet<Enums>("/enums"), adminGet<Area[]>("/areas")]);
  return (
    <>
      <PageHeader title="New compound" back="/dashboard/compounds" />
      <CompoundForm action={createCompound} enums={enums} areas={areas} />
    </>
  );
}
```

Create `web/src/app/dashboard/compounds/[id]/page.tsx`:

```tsx
import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import type { Area, Compound, Enums } from "@/lib/admin/types";
import { deleteCompound, updateCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function EditCompoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [compound, enums, areas] = await Promise.all([
    getOr404<Compound>(`/compounds/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Area[]>("/areas"),
  ]);
  return (
    <>
      <PageHeader title={compound.name_en} back="/dashboard/compounds" />
      <CompoundForm action={updateCompound.bind(null, id)} enums={enums} areas={areas} compound={compound} />
      <DangerZone>
        <DeleteButton action={deleteCompound.bind(null, id)} what="compound" />
      </DangerZone>
    </>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `cd web && npm run typecheck`. Expected: exits 0. `curl -s -u admin:$PW http://localhost:3000/dashboard/compounds | grep -o Hacienda` → `Hacienda` (the Phase 2b smoke compound).

```bash
git add web/src/app/dashboard/compounds/
git commit -m "feat(web): admin compounds pages"
```

---

## Task 7 — Owners pages

**Files:** `web/src/app/dashboard/owners/actions.ts`, `owner-form.tsx`, `page.tsx`, `new/page.tsx`, `[id]/page.tsx`

- [ ] **Step 1: Create `web/src/app/dashboard/owners/actions.ts`**

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, text } from "@/lib/admin/form";
import type { FormState } from "@/lib/admin/types";

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

export async function createOwner(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("POST", "/owners", payload(fd)), "/dashboard/owners");
}

export async function updateOwner(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/owners/${assertId(id)}`, payload(fd)), "/dashboard/owners");
}

export async function deleteOwner(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/owners/${assertId(id)}`), "/dashboard/owners");
}
```

- [ ] **Step 2: Create `web/src/app/dashboard/owners/owner-form.tsx`**

```tsx
import { EntityForm } from "@/components/admin/entity-form";
import { TextArea, TextField } from "@/components/admin/fields";
import type { FormAction, Owner } from "@/lib/admin/types";

export function OwnerForm({ action, owner }: { action: FormAction; owner?: Owner }) {
  return (
    <EntityForm action={action} submitLabel={owner ? "Save changes" : "Create owner"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={owner?.name} />
        <TextField label="Phone" name="phone" type="tel" dir="ltr" required defaultValue={owner?.phone} />
        <TextField label="Email" name="email" type="email" dir="ltr" defaultValue={owner?.email} />
        <TextField label="National ID" name="national_id" dir="ltr" defaultValue={owner?.national_id} />
        <TextField
          label="Commission %"
          name="commission_pct"
          type="number"
          min={0}
          max={100}
          defaultValue={owner?.commission_pct ?? 0}
        />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={owner?.notes} hint="Internal only." />
    </EntityForm>
  );
}
```

- [ ] **Step 3: Create the three pages**

Create `web/src/app/dashboard/owners/page.tsx`:

```tsx
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { linkCls, tableCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import type { Owner } from "@/lib/admin/types";

export default async function OwnersPage() {
  const owners = await adminGet<Owner[]>("/owners");
  return (
    <>
      <PageHeader title="Owners" newHref="/dashboard/owners/new" />
      {owners.length === 0 ? (
        <EmptyState>No owners yet.</EmptyState>
      ) : (
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Commission</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/dashboard/owners/${o.id}`} className={linkCls}>
                    {o.name}
                  </Link>
                </td>
                <td dir="ltr">{o.phone}</td>
                <td>{o.email ?? "—"}</td>
                <td>{o.commission_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

Create `web/src/app/dashboard/owners/new/page.tsx`:

```tsx
import { PageHeader } from "@/components/admin/page-header";
import { createOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default function NewOwnerPage() {
  return (
    <>
      <PageHeader title="New owner" back="/dashboard/owners" />
      <OwnerForm action={createOwner} />
    </>
  );
}
```

Create `web/src/app/dashboard/owners/[id]/page.tsx`:

```tsx
import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { getOr404 } from "@/lib/admin/api";
import type { Owner } from "@/lib/admin/types";
import { deleteOwner, updateOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default async function EditOwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getOr404<Owner>(`/owners/${id}`);
  return (
    <>
      <PageHeader title={owner.name} back="/dashboard/owners" />
      <OwnerForm action={updateOwner.bind(null, id)} owner={owner} />
      <DangerZone>
        <DeleteButton action={deleteOwner.bind(null, id)} what="owner" />
      </DangerZone>
    </>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `cd web && npm run typecheck`. Expected: exits 0.

```bash
git add web/src/app/dashboard/owners/
git commit -m "feat(web): admin owners pages"
```

---

## Task 8 — Units pages

**Files:** `web/src/app/dashboard/units/actions.ts`, `unit-form.tsx`, `page.tsx`, `new/page.tsx`, `[id]/page.tsx`

- [ ] **Step 1: Create `web/src/app/dashboard/units/actions.ts`**

```ts
"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
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
export async function createUnit(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(
    () => adminSend<Unit>("POST", "/units", payload(fd)),
    (unit) => `/dashboard/units/${unit.id}`,
  );
}

export async function updateUnit(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/units/${assertId(id)}`, payload(fd)), `/dashboard/units/${id}`);
}

export async function deleteUnit(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/units/${assertId(id)}`), "/dashboard/units");
}
```

- [ ] **Step 2: Create `web/src/app/dashboard/units/unit-form.tsx`**

```tsx
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import type { CompoundRow, Enums, FormAction, Owner, Unit } from "@/lib/admin/types";

export function UnitForm({
  action,
  enums,
  owners,
  compounds,
  unit,
}: {
  action: FormAction;
  enums: Enums;
  owners: Owner[];
  compounds: CompoundRow[];
  unit?: Unit;
}) {
  return (
    <EntityForm action={action} submitLabel={unit ? "Save changes" : "Create unit"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Compound"
          name="compound_id"
          required
          options={compounds.map((c) => ({ value: c.id, label: `${c.name_en} · ${c.area_name_en}` }))}
          defaultValue={unit?.compound_id}
        />
        <SelectField
          label="Owner"
          name="owner_id"
          required
          options={owners.map((o) => ({ value: o.id, label: o.name }))}
          defaultValue={unit?.owner_id}
        />
        <SelectField
          label="Status"
          name="status"
          required
          options={enums.unit_status}
          defaultValue={unit?.status ?? "draft"}
          hint="Only active units are public."
        />
      </div>

      <BilingualField label="Title" name="title" ar={unit?.title_ar} en={unit?.title_en} required />
      <SlugField entity="units" sourceName="title_en" currentId={unit?.id} defaultValue={unit?.slug} />
      <BilingualField label="Description" name="description" ar={unit?.description_ar} en={unit?.description_en} required multiline />
      <BilingualField label="House rules" name="house_rules" ar={unit?.house_rules_ar} en={unit?.house_rules_en} multiline />

      <div className="grid gap-4 sm:grid-cols-4">
        <SelectField label="Type" name="type" options={enums.type} defaultValue={unit?.type} required />
        <SelectField label="View" name="view" options={enums.view} defaultValue={unit?.view} required />
        <TextField label="Sea distance (m)" name="sea_distance_m" type="number" min={0} required defaultValue={unit?.sea_distance_m} />
        <TextField label="Row" name="row_number" type="number" min={1} defaultValue={unit?.row_number} hint="1 = first row." />
        <TextField label="Bedrooms" name="bedrooms" type="number" min={0} required defaultValue={unit?.bedrooms} />
        <TextField label="Bathrooms" name="bathrooms" type="number" min={0} required defaultValue={unit?.bathrooms} />
        <TextField label="Base guests" name="base_guests" type="number" min={1} required defaultValue={unit?.base_guests} />
        <TextField label="Max guests" name="max_guests" type="number" min={1} required defaultValue={unit?.max_guests} />
        <TextField label="Area (m²)" name="area_sqm" type="number" min={1} defaultValue={unit?.area_sqm} />
        <TextField label="Floor" name="floor" type="number" defaultValue={unit?.floor} />
        <TextField label="Latitude" name="lat" type="number" step="0.000001" min={-90} max={90} defaultValue={unit?.lat} />
        <TextField label="Longitude" name="lng" type="number" step="0.000001" min={-180} max={180} defaultValue={unit?.lng} />
      </div>

      <TextField label="Amenities" name="amenities" defaultValue={unit?.amenities.join(", ")} hint="Comma-separated: wifi, pool, bbq…" />
      <TextArea
        label="Exact address"
        name="exact_address"
        rows={2}
        defaultValue={unit?.exact_address}
        hint="Admin only. Never shown on the public site."
      />
    </EntityForm>
  );
}
```

- [ ] **Step 3: Create the list and new pages**

Create `web/src/app/dashboard/units/page.tsx`:

```tsx
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import type { UnitRow } from "@/lib/admin/types";

export default async function UnitsPage() {
  const units = await adminGet<UnitRow[]>("/units");
  return (
    <>
      <PageHeader title="Units" newHref="/dashboard/units/new" />
      {units.length === 0 ? <EmptyState>No units yet. Create a compound and an owner first.</EmptyState> : <UnitsTable rows={units} />}
    </>
  );
}
```

Create `web/src/app/dashboard/units/new/page.tsx`:

```tsx
import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { CompoundRow, Enums, Owner } from "@/lib/admin/types";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function NewUnitPage() {
  const [enums, owners, compounds] = await Promise.all([
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  return (
    <>
      <PageHeader title="New unit" back="/dashboard/units" />
      <p className="mb-6 text-sm text-muted-foreground">Save the basics first; images are added on the next screen.</p>
      <UnitForm action={createUnit} enums={enums} owners={owners} compounds={compounds} />
    </>
  );
}
```

- [ ] **Step 4: Create the edit page (image manager wired in Task 9)**

Create `web/src/app/dashboard/units/[id]/page.tsx`:

```tsx
import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { ImageManager } from "@/components/admin/image-manager";
import { PageHeader } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/units-table";
import { adminGet, getOr404 } from "@/lib/admin/api";
import type { CompoundRow, Enums, Owner, UnitDetail } from "@/lib/admin/types";
import { deleteUnit, updateUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [unit, enums, owners, compounds] = await Promise.all([
    getOr404<UnitDetail>(`/units/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  return (
    <>
      <PageHeader title={unit.title_en} back="/dashboard/units" />
      <div className="mb-6 flex items-center gap-3 text-sm">
        <StatusBadge status={unit.status} />
        {unit.status === "active" && (
          <a href={`/ar/unit/${unit.slug}`} className={linkCls} target="_blank" rel="noreferrer">
            View public page ↗
          </a>
        )}
      </div>
      <div className="space-y-12">
        <UnitForm action={updateUnit.bind(null, id)} enums={enums} owners={owners} compounds={compounds} unit={unit} />
        <ImageManager unitId={id} images={unit.images} />
      </div>
      <DangerZone>
        <DeleteButton action={deleteUnit.bind(null, id)} what="unit" />
      </DangerZone>
    </>
  );
}
```

- [ ] **Step 5: Stub the image manager so the page compiles**

Create `web/src/components/admin/image-manager.tsx` (fully implemented in Task 9):

```tsx
"use client";

import type { UnitImage } from "@/lib/admin/types";

export function ImageManager({ images }: { unitId: string; images: UnitImage[] }) {
  return <section className="text-sm text-muted-foreground">{images.length} images</section>;
}
```

- [ ] **Step 6: Verify and commit**

Run: `cd web && npm run typecheck`. Expected: exits 0. `curl -s -u admin:$PW http://localhost:3000/dashboard/units | grep -o U1` → `U1`.

```bash
git add web/src/app/dashboard/units/ web/src/components/admin/image-manager.tsx
git commit -m "feat(web): admin units pages"
```

---

## Task 9 — Image manager

**Files:** `web/src/app/dashboard/units/image-actions.ts`, `web/src/components/admin/image-manager.tsx`

- [ ] **Step 1: Create `web/src/app/dashboard/units/image-actions.ts`**

```ts
"use server";

import { assertId, attempt } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";

type Result = { error?: string };

const page = (unitId: string) => `/dashboard/units/${unitId}`;

/** One file per request (spec §4.3); the client loops over a multi-select. */
export async function uploadImage(unitId: string, fd: FormData): Promise<Result> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  const body = new FormData();
  body.set("file", file);
  return attempt(() => adminSend("POST", `/units/${assertId(unitId)}/images`, body), page(unitId));
}

export async function updateImage(
  unitId: string,
  imageId: string,
  patch: { alt_ar?: string; alt_en?: string; is_cover?: boolean },
): Promise<Result> {
  return attempt(() => adminSend("PATCH", `/units/${assertId(unitId)}/images/${assertId(imageId)}`, patch), page(unitId));
}

/** Rewrites sort to match the given order (index = sort). */
export async function reorderImages(unitId: string, orderedIds: string[]): Promise<Result> {
  return attempt(async () => {
    for (const [sort, imageId] of orderedIds.entries()) {
      await adminSend("PATCH", `/units/${assertId(unitId)}/images/${assertId(imageId)}`, { sort });
    }
  }, page(unitId));
}

export async function deleteImage(unitId: string, imageId: string): Promise<Result> {
  return attempt(() => adminSend("DELETE", `/units/${assertId(unitId)}/images/${assertId(imageId)}`), page(unitId));
}
```

- [ ] **Step 2: Replace `web/src/components/admin/image-manager.tsx`**

```tsx
"use client";

/* eslint-disable @next/next/no-img-element -- admin thumbnails straight from MinIO */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteImage, reorderImages, updateImage, uploadImage } from "@/app/dashboard/units/image-actions";
import type { UnitImage } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";
import { dangerButtonCls, inputCls, secondaryButtonCls } from "./ui";

type Result = { error?: string };

/**
 * Spec §4.3: upload (one request per file), alt text per image, up/down
 * reorder, single-choice cover, delete with confirm. Every change goes
 * straight to the API and the page re-fetches.
 */
export function ImageManager({ unitId, images }: { unitId: string; images: UnitImage[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run(task: () => Promise<Result>) {
    startTransition(async () => {
      setError(null);
      const result = await task();
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function uploadAll(files: File[]) {
    run(async () => {
      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        const result = await uploadImage(unitId, fd);
        if (result.error) return { error: `${file.name}: ${result.error}` };
      }
      return {};
    });
  }

  function move(index: number, delta: -1 | 1) {
    const ids = images.map((i) => i.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => reorderImages(unitId, ids));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Images</h2>
        <label className={`${secondaryButtonCls} cursor-pointer`}>
          {busy ? "Working…" : "Add images"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length > 0) uploadAll(files);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 10 MB each. The first image becomes the cover.</p>
      {error && <ErrorBanner message={error} />}

      {images.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No images yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li key={`${img.id}-${img.updated_at}`} className="space-y-3 rounded-lg border border-border bg-white p-3">
              <img src={img.url} alt={img.alt_en ?? ""} className="aspect-[4/3] w-full rounded object-cover" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`cover-${unitId}`}
                  checked={img.is_cover}
                  disabled={busy}
                  onChange={() => run(() => updateImage(unitId, img.id, { is_cover: true }))}
                  className="accent-sea"
                />
                Cover
              </label>
              <input
                className={inputCls}
                dir="rtl"
                placeholder="النص البديل"
                defaultValue={img.alt_ar ?? ""}
                onBlur={(e) => {
                  if (e.currentTarget.value !== (img.alt_ar ?? "")) {
                    const alt_ar = e.currentTarget.value;
                    run(() => updateImage(unitId, img.id, { alt_ar }));
                  }
                }}
              />
              <input
                className={inputCls}
                dir="ltr"
                placeholder="Alt text"
                defaultValue={img.alt_en ?? ""}
                onBlur={(e) => {
                  if (e.currentTarget.value !== (img.alt_en ?? "")) {
                    const alt_en = e.currentTarget.value;
                    run(() => updateImage(unitId, img.id, { alt_en }));
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button type="button" className={secondaryButtonCls} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                  ↑
                </button>
                <button
                  type="button"
                  className={secondaryButtonCls}
                  disabled={busy || i === images.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move later"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${dangerButtonCls} ms-auto px-3 py-1.5`}
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Delete this image?")) run(() => deleteImage(unitId, img.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd web && npm run typecheck`. Expected: exits 0.

```bash
git add web/src/app/dashboard/units/image-actions.ts web/src/components/admin/image-manager.tsx
git commit -m "feat(web): unit image manager (upload, alt, reorder, cover, delete)"
```

---

## Task 10 — Full verification

- [ ] **Step 1: Static checks and build**

Run: `cd web && npm run typecheck && npm test && npm run build`
Expected: typecheck 0, all node tests pass, `next build` succeeds (dashboard routes listed as `ƒ` dynamic).

- [ ] **Step 2: HTTP smoke against `next dev`**

With the API and `npm run dev` running:

```bash
PW=$(grep ^ADMIN_PASSWORD= .env | cut -d= -f2-); W=http://localhost:3000
for p in /dashboard /dashboard/areas /dashboard/areas/new /dashboard/compounds /dashboard/compounds/new /dashboard/owners /dashboard/owners/new /dashboard/units /dashboard/units/new; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -u admin:$PW $W$p)"
done
U1=$(docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres psql -U sahel -d sahel -tAc "SELECT id FROM units WHERE slug='u1'")
curl -s -u admin:$PW $W/dashboard/units/$U1 | grep -o "Images"
curl -s -o /dev/null -w 'no auth: %{http_code}\n' $W/dashboard/units
```

Expected: every page `200`; `Images`; `no auth: 401`.

- [ ] **Step 3: Browser walk-through (spec §7.2 steps 1–5, 12, 15)**

In a browser at `http://localhost:3000/dashboard`:
1. Basic-auth prompt appears. Enter any username and `ADMIN_PASSWORD`.
2. Areas → New: Arabic + English name, region → create. Leaving the slug blank derives it; tabbing out of the English name fills it.
3. Compounds → New in that area, with amenities, beach type, featured → create.
4. Owners → New with a phone → create.
5. Units → New in the compound → create. You land on the edit page. Add 2–3 images: the first is the cover. Move one up, switch the cover, add alt text, delete one.
6. Submit a unit with max guests < base guests. The banner shows the API message, and the typed values are still in the form.
7. Delete the compound. The banner says it's still referenced (409).
8. Set the unit status to archived and save; the list badge updates.

- [ ] **Step 4: `git status` clean**

Expected: nothing tracked is modified.

---

## Done criteria for Phase 2d

- `/dashboard/*` challenges without the password (pages and Server Actions alike) and works with it; `/ar`, `/en` still route through next-intl.
- Every page in spec §4.1 exists and reads live data. Forms follow §4.2: bilingual pairs side by side with Arabic RTL, enum selects from `/admin/enums`, slug auto-fill plus uniqueness check, comma-separated amenities, and an error banner that keeps the admin's input.
- The image manager covers §4.3: upload loop, alt text, up/down reorder, single cover, delete with confirm.
- `npm run typecheck`, `npm test`, `npm run build` all pass; `make test` runs both Go and web checks.

**Handed to Phase 2e (public UI + seed + acceptance):** public pages under `/[locale]`, `next/image` `remotePatterns` for MinIO, `cover_url` on public search/compound payloads, seed data, and the full §7.2 demo.
