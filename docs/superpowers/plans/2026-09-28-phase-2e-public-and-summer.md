# Phase 2e: public catalogue and Summer design system — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Kept deliberately compact at the user's request: UI tasks name files, interfaces and acceptance checks rather than inlining every line of JSX; pure helpers are fully test-first.

**Goal:** Build the five public catalogue routes and restyle public + admin onto the "Summer" system from `docs/superpowers/specs/2026-09-28-phase-2e-public-and-summer-design.md`.

**Architecture:** Server-rendered Next 15 pages under `app/[locale]/(public)/`, fed by a small server-only client `lib/public/api.ts` over the Go public API. Pure helpers (`lib/public/*.ts`) carry the logic and have node tests. Styling stays token-driven: `globals.css` values + a rewritten `styles/beet-elsahel.css`, plus a new `styles/public.css` for public-only components.

**Tech stack:** Next 15, React 19, next-intl 4, Tailwind 4, `node --test`; Go + sqlc for the one API tweak.

**Spec deviation (recorded here and in the spec):** the public list rows lack a cover URL and Arabic compound/area names, which the unit card needs. Task 1 adds three read-only columns to two public queries. No new endpoints, no contract removals.

---

### Task 1: API — cover and Arabic names on public unit rows

**Files:** `api/internal/store/postgres/queries/units.sql`, `queries/compounds.sql`, `api/internal/store/postgres/db/units.sql.go`, `db/compounds.sql.go` (hand-regenerated; no local sqlc/go — Docker build is the compile check).

- [ ] `SearchUnits`: add `c.name_ar AS compound_name_ar`, `a.name_ar AS area_name_ar`, and
  `(SELECT i.url FROM unit_images i WHERE i.unit_id = u.id AND i.is_cover LIMIT 1) AS cover_url`.
- [ ] `ListActiveUnitsByCompoundID`: add the same `cover_url` subquery (alias the table `u`).
- [ ] Mirror both in the generated Go: SQL constant, row struct fields (`CompoundNameAr string`, `AreaNameAr string`, `CoverUrl *string` with json tags `compound_name_ar`, `area_name_ar`, `cover_url`), and the `rows.Scan` argument order.
- [ ] Verify: `docker compose build api` succeeds; `curl localhost:8090/api/v1/units?size=1` shows `cover_url`.
- [ ] Commit `feat(api): cover url and Arabic names on public unit rows`.

### Task 2: Public data layer (test-first)

**Files:** create `web/src/lib/public/types.ts`, `api.ts`, `search-params.ts`, `amenities.ts`, `format.ts` and `*.test.ts` beside them.

- [ ] Tests first, then code, for:
  - `parseSearchParams(record) → Filters` and `filtersToQuery(filters, page?) → string`: drops empty/invalid values, keeps only known enums and positive ints, round-trips, `page` omitted when 1.
  - `mergeAmenities(unit, compound)`: unit order first, then compound items not already present (case-insensitive, trimmed), empties dropped.
  - `pick(locale, ar, en)`: current locale, falls back to the other when blank.
  - `unitsPath(query)` / `publicUrl(base, path)`: API URL building (`/api/v1/units?area=x&page=2`).
- [ ] `api.ts`: `publicGet<T>(path)` with `next: { revalidate: 60 }`, API 404 → `notFound()`; wrappers `listAreas`, `getArea`, `listCompounds`, `getCompound`, `searchUnits`, `getUnit`.
- [ ] Run `npm test` (all pass) and `npm run typecheck`. Commit `feat(web): public catalogue client and helpers`.

### Task 3: Summer tokens and component sheet

**Files:** `web/src/app/globals.css`, `web/src/styles/beet-elsahel.css`, `web/src/app/[locale]/layout.tsx`.

- [ ] Replace token values per spec §2; add `--radius-pill`, `--shadow-card`, `--shadow-lift`, `--ease-spring`, `--dur-1..3`, `--font-display`; expose new ones in `@theme inline`.
- [ ] Load `Baloo_Bhaijaan_2` (500, 700, arabic+latin) via `next/font` as `--font-baloo`; `.display, h1, h2, h3 { font-family: var(--font-display) }`.
- [ ] Rewrite `beet-elsahel.css` header ("Summer" system, owned here, edit freely); primary button → `sun`, radii/shadows/motion per spec §2 and admin calmness per §5; keep every existing class name.
- [ ] Global reduced-motion block. Global cross-document `@view-transition { navigation: auto; }`.
- [ ] Check contrast of text pairs (small node script, not committed); adjust `ink-muted`/button text if any fails AA.
- [ ] `npm run typecheck`; commit `feat(web): Summer tokens, fonts and component sheet`.

### Task 4: Public copy

**Files:** `web/src/messages/{ar,en}.json` — replace `home`/`palette`/`states`/`nav` demo copy with a `public` namespace; `meta` renamed to Beet Elsahel.

- [ ] Keys: header, hero, searchBar, sections, card, filters, sort, results, empty, pagination, unit, compound, destination, notFound, footer. Arabic first.
- [ ] Commit `feat(web): public Arabic and English copy`.

### Task 5: Public shell and shared components

**Files:** create `web/src/app/[locale]/(public)/layout.tsx`, `not-found.tsx`; `web/src/components/public/{site-header,site-footer,unit-card,unit-grid,compound-card,section,pagination,reveal}.tsx`; `web/src/styles/public.css` (imported in `globals.css`, components layer). Move `[locale]/page.tsx` into `(public)/page.tsx`. Delete `components/locale-switcher.tsx` if unused afterwards.

- [ ] Header: sticky, brand, links (Destinations `#destinations` on home, Search), language switch (next-intl `Link` with `locale`), gains shadow after scroll (tiny client component watching `scrollY > 8`).
- [ ] `UnitCard`: `next/image` cover (4:3, `sizes`), `view-transition-name: unit-<slug>` on the image, hover lift/zoom, display-font title, meta line with `num`, "Pricing coming soon" chip. Placeholder gradient when no cover.
- [ ] `Pagination`: prev/next links built with `filtersToQuery`, `aria-label`s, disabled states.
- [ ] Commit `feat(web): public shell, cards and pagination`.

### Task 6: Home, search, unit, compound, destination pages

**Files:** `web/src/app/[locale]/(public)/page.tsx`, `search/{page,loading,filter-bar}.tsx`, `unit/[slug]/{page,gallery}.tsx`, `compound/[slug]/page.tsx`, `destinations/[area]/page.tsx`.

- [ ] Home per spec §3 (hero with featured compound cover, pill search form `GET` to `/search`, featured compounds scroll-snap strip, destinations chips, 8 newest units).
- [ ] Search: server page reads `searchParams` via `parseSearchParams`; client `FilterBar` writes URL with `router.replace` in a transition (shows pending state); compound select narrows by area; count line; empty state with reset; `loading.tsx` skeleton.
- [ ] Unit: gallery + `<dialog>` lightbox (keys, swipe, thumbs, counter, focus return), meta, amenities via `mergeAmenities`, description/rules via `pick`, compound card, sticky side card, `generateMetadata`.
- [ ] Compound and destination pages per spec §3.
- [ ] `npm run typecheck`, `npm test`. Commit per page group.

### Task 7: Verify

- [ ] Start Docker Desktop, `docker compose up -d`, seed if empty, `npm run dev`.
- [ ] Browser pass: `/ar`, `/ar/search` (filters, empty, pagination), a unit (lightbox, view transition), compound, destination, `/en/*` mirror, 375px width, admin overview/list/form spot-check.
- [ ] Fix everything found in one batch; `NEXT_DIST_DIR=.next-build npm run build`. Commit.
