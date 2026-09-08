# Phase 2 — Catalog: Design Spec

Design for Phase 2 of the Marsa build. Establishes the schema, API, admin UI,
public UI, and acceptance test for the catalogue of areas, compounds, owners,
units, and unit images. No dates, no pricing, no bookings — those land in
Phase 3+.

The source of truth for domain rules is `01-design-and-requirements.md`. When
this spec is silent, the design doc wins. When this spec narrows a choice the
design doc left open, this spec wins for Phase 2.

## 1. Scope

### In scope

- Tables: `areas`, `compounds`, `owners`, `units`, `unit_images` (schema,
  goose migrations, sqlc queries).
- Public API: list and detail endpoints for areas, compounds, and units;
  unit search with picklist filters and offset pagination.
- Admin API: CRUD on the five tables plus image upload to MinIO.
- Admin UI at `/dashboard/*` inside the same Next.js app, gated by an
  env-var basic-auth password.
- Public UI: `/`, `/search`, `/unit/[slug]`, `/compound/[slug]`,
  `/destinations/[area]`, all locale-prefixed (`/ar/*`, `/en/*`).
- Seed data: 2 areas, 3 compounds, 10 units, images uploaded through the
  admin flow (proving the round-trip).
- Bilingual fields as separate `_ar` / `_en` columns.
- Slugs auto-generated from `title_en` on create, editable, unique.
- Images stored as originals in MinIO, served straight from there.

### Out of scope (deferred)

- Real user auth, OTP, roles, RBAC — Phase 4/6.
- `seasons`, `unit_calendar`, availability, quotes — Phase 3.
- Booking flow, `bookings`, `payments` — Phase 4/5.
- Map UI on public site — Phase 7.
- Image derivatives, blurhash, EXIF stripping — Phase 7.
- Free-text or trigram search — Phase 7.
- Admin polish, audit log, timeline — Phase 6.
- `customers`, `inquiries` — deferred until they have a caller.

## 2. Schema

Five tables, one migration each, under `infra/migrations/`. Every table has
`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT
NULL DEFAULT now()`, and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
maintained by a trigger. Enums are Postgres `CREATE TYPE`, not `TEXT CHECK`,
so sqlc emits typed Go constants.

Bilingual text fields are stored as separate `TEXT NOT NULL` columns
(`title_ar`, `title_en`, ...). Nullable bilingual fields use nullable pairs.

### 2.1 `areas`

Top-level geographic region.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `slug` | TEXT | unique |
| `name_ar` | TEXT | |
| `name_en` | TEXT | |
| `region` | ENUM | `north_coast` \| `sokhna` \| `gouna` \| `ras_sudr` \| `new_cairo` |
| `km_marker` | INT | nullable, km on the coastal road |
| `sort_order` | INT | default 0, for display ordering |

### 2.2 `compounds`

Belongs to an area.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `area_id` | UUID | FK → `areas.id` |
| `slug` | TEXT | unique |
| `name_ar`, `name_en` | TEXT | |
| `description_ar`, `description_en` | TEXT | |
| `amenities` | TEXT[] | compound-level (private beach, lagoons, gates, pools…) |
| `beach_type` | ENUM | `sea` \| `lagoon` \| `both` \| `none` |
| `gate_info_ar`, `gate_info_en` | TEXT | nullable pair |
| `lat`, `lng` | NUMERIC(9,6) | stored, not rendered in Phase 2 |
| `cover_image_url` | TEXT | nullable |
| `is_featured` | BOOL | default false |

### 2.3 `owners`

Admin-created records. Self-serve is Phase 8. Not bilingual — internal only.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | nullable |
| `national_id` | TEXT | nullable |
| `notes` | TEXT | nullable |
| `commission_pct` | SMALLINT | default 0, range 0–100 |

Bank details deferred until payouts exist.

### 2.4 `units`

The core catalogue entity.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `owner_id` | UUID | FK → `owners.id` |
| `compound_id` | UUID | FK → `compounds.id` |
| `slug` | TEXT | unique |
| `title_ar`, `title_en` | TEXT | |
| `description_ar`, `description_en` | TEXT | |
| `house_rules_ar`, `house_rules_en` | TEXT | nullable pair |
| `type` | ENUM | `chalet` \| `villa` \| `twin` \| `town` \| `penthouse` \| `studio` \| `apartment` |
| `bedrooms`, `bathrooms`, `base_guests`, `max_guests` | SMALLINT | |
| `area_sqm` | INT | nullable |
| `floor` | SMALLINT | nullable |
| `sea_distance_m` | INT | |
| `view` | ENUM | `sea` \| `lagoon` \| `pool` \| `garden` \| `street` |
| `row_number` | SMALLINT | nullable, 1 = first row |
| `amenities` | TEXT[] | unit-level (wifi, pool, bbq…) |
| `lat`, `lng` | NUMERIC(9,6) | nullable |
| `exact_address` | TEXT | admin-only, never returned by public API |
| `status` | ENUM | `draft` \| `active` \| `paused` \| `archived`, default `draft` |

Pricing and stay-rule columns from §7 of the design doc (`cleaning_fee`,
`deposit_pct`, `min_nights_default`, etc.) are **not** added in Phase 2. They
land with the migrations that actually consume them, in Phase 3+.

### 2.5 `unit_images`

One row per uploaded image. FK cascade-deletes with the unit.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `unit_id` | UUID | FK → `units.id` ON DELETE CASCADE |
| `url` | TEXT | full public URL into MinIO |
| `alt_ar`, `alt_en` | TEXT | nullable pair |
| `sort` | SMALLINT | default 0, low-to-high display order |
| `is_cover` | BOOL | default false |

Partial unique index: `CREATE UNIQUE INDEX unit_images_one_cover ON
unit_images (unit_id) WHERE is_cover = true;`

### 2.6 Indexes

- Unique on every `slug`.
- btree on every FK.
- btree on `units.status`, `units.compound_id`, `units.view`,
  `units.sea_distance_m` (search filters).

## 3. API surface

All routes under `/api/v1`. JSON in, JSON out. Errors return
`{"error": {"code": "...", "message": "..."}}` with the appropriate HTTP
status. Admin routes are gated by a chi middleware that checks HTTP Basic
auth against `ADMIN_PASSWORD` from env; missing env crashes the service on
start.

### 3.1 Public — no auth

```
GET  /areas                         → [{id, slug, name_ar, name_en, region, unit_count}]
GET  /areas/:slug                   → area + featured compounds inside it
GET  /compounds                     → ?area=slug   paginated
GET  /compounds/:slug               → compound + units inside it (paginated)
GET  /units                         → filtered search, see 3.2
GET  /units/:slug                   → unit detail (with images, compound, area)
```

Public payloads for `units/:slug` **omit** `exact_address`. Archived units
return 404 from every public route.

### 3.2 Search filters on `GET /units`

Query parameters:

- `area` (slug)
- `compound` (slug)
- `type` (enum)
- `guests` (int, matches units where `max_guests >= guests`)
- `bedrooms` (int, matches units where `bedrooms >= bedrooms`)
- `view` (enum)
- `maxSeaDistance` (int, meters)
- `sort` — `sea_distance_asc` | `bedrooms_desc` | `created_desc` (default)
- `page` — 1-based (default 1)
- `size` — default 20, max 60

Only `status = 'active'` units returned. Unknown parameters are silently
ignored (logged at debug). Response envelope:

```json
{ "items": [...], "page": 1, "size": 20, "total": 42 }
```

### 3.3 Admin — basic auth

```
GET  | POST                 /admin/areas
GET  | PATCH | DELETE       /admin/areas/:id
GET  | POST                 /admin/compounds
GET  | PATCH | DELETE       /admin/compounds/:id
GET  | POST                 /admin/owners
GET  | PATCH | DELETE       /admin/owners/:id
GET  | POST                 /admin/units
GET  | PATCH | DELETE       /admin/units/:id
POST                        /admin/units/:id/images
PATCH                       /admin/units/:id/images/:imageId
DELETE                      /admin/units/:id/images/:imageId
GET                         /admin/enums
```

- Public routes address entities by `slug`; admin by `id`. Never mix them.
- `PATCH`, never `PUT`. Partial updates only.
- `DELETE` on `areas` / `compounds` / `owners` returns 409 if any unit
  references the record. No cascade of business data.
- `DELETE` on `units` cascades to `unit_images` at the DB level; S3 object
  cleanup is a Phase 7 job.
- Image upload: `multipart/form-data`, field name `file`, max 10 MB, MIME
  allowlist `image/jpeg | image/png | image/webp`. Stored at
  `units/{unit_id}/{uuid}.{ext}`. Response is the full `unit_images` row.
- `GET /admin/enums` returns `{ region: [...], beach_type: [...], type: [...],
  view: [...], unit_status: [...] }` — one small helper so the admin UI's
  `<select>` options match the DB enums exactly.

## 4. Admin UI

Lives at `/dashboard/*` in the Next.js app. Next.js middleware issues an
HTTP Basic auth challenge on every `/dashboard/*` route using the same
`ADMIN_PASSWORD` env the Go API uses.

No shadcn dashboard shell. Plain top nav: `Areas · Compounds · Owners ·
Units`.

### 4.1 Pages

```
/dashboard                      counts + recently edited list
/dashboard/areas                table
/dashboard/areas/new            form
/dashboard/areas/[id]           edit form
/dashboard/compounds            table
/dashboard/compounds/new        form
/dashboard/compounds/[id]       edit form
/dashboard/owners               table
/dashboard/owners/new           form
/dashboard/owners/[id]          edit form
/dashboard/units                table with cover thumb
/dashboard/units/new            basics form
/dashboard/units/[id]           edit form + image manager
```

### 4.2 Form conventions

- Bilingual fields render as **side-by-side pairs** — `title_ar` and
  `title_en` on the same row, Arabic input with `dir="rtl"`. Same for
  description, house rules, gate info, alt text. Missing translations are
  visible, not hidden.
- Enum `<select>` options come from `GET /admin/enums`, so the client can't
  drift from the DB.
- Slug field auto-fills from `title_en` / `name_en` on blur. Editable.
  Uniqueness checked on blur against the API.
- Amenities: comma-separated text input mapped to `TEXT[]` server-side. No
  chip picker yet.
- Native `<form>` + Server Actions calling the Go API. No client-side form
  library.

### 4.3 Image manager (unit edit page)

- File picker, one file per request (loops for multiple selections).
- Grid of thumbnails, each with:
  - alt-text inputs (ar / en)
  - reorder buttons (up / down; drag reorder deferred)
  - "set as cover" radio (single-choice across the grid)
  - delete button with confirm
- Cover flip is one server-side call: PATCHes the old cover to
  `is_cover=false` and the new one to `true` in a transaction.

### 4.4 Deliberately missing

- No search, filters, or pagination on admin tables (row counts stay tiny).
- No audit log surface.
- No RBAC — one password, one user.
- No inline validation beyond browser-native + server-side error banner.

## 5. Public UI

Locale-prefixed routes (`/ar/*` default, `/en/*`). All pages server-rendered.
Filters change the URL and re-render server-side; no client-side data
fetching for initial paint.

### 5.1 Pages

```
/[locale]                        home
/[locale]/search                 filtered list
/[locale]/unit/[slug]            unit detail
/[locale]/compound/[slug]        compound page
/[locale]/destinations/[area]    area page
```

### 5.2 Home

Rewritten from the current palette-demo page.

- Header: logo, nav, locale switcher (already exists).
- Hero: full-bleed image of a featured unit, with a placeholder search bar
  that **links** to `/search` with prefilled params. No popover, no calendar
  in Phase 2.
- Featured compounds strip: horizontal cards from `is_featured = true`.
- New arrivals grid: 8 most recently created active units, varied heights.
- Season-at-a-glance ribbon: deferred (needs availability data); the section
  is not rendered in Phase 2.

### 5.3 Search

- Filter panel: area, compound (dependent on area), type, min guests, min
  bedrooms, view, max sea distance, sort. Each control writes to the URL;
  submit is automatic on change.
- Result grid: unit cards with cover image, title, compound name, sea
  distance, bedrooms, view. Price slot shows "coming in Phase 3" placeholder.
- Empty state: "No units match — try loosening filters."
- Pagination: prev / next + page number. No infinite scroll.

### 5.4 Unit detail

- Gallery: 1 cover + up to 4 thumbnails, lightbox on click (shadcn `dialog`).
- Meta block: type · compound · area · bed/bath/guests · sea distance + row
  + view.
- Amenities grid (unit + compound merged, unit-side wins on conflicts).
- Description, house rules (locale-picked).
- Compound facilities card linking to `/compound/[slug]`.
- Sticky column card: title + "Pricing available in Phase 3" placeholder.
- Approximate location as text ("180 m to sea · first row · sea view"). No
  map.
- `generateMetadata` fills title / description / og-image. JSON-LD deferred
  to Phase 7.

### 5.5 Compound

- Cover, name, area breadcrumb.
- Description, amenities, beach type, gate info.
- Grid of units inside (same card as search).

### 5.6 Destination (area)

- Area name, region, description (if seeded).
- Featured compounds inside the area.
- Grid of units in the area, paginated.

### 5.7 Cross-cutting

- All catalogue fetches go through a thin `api.ts` helper hitting
  `NEXT_PUBLIC_API_URL` on the server side. No client fetches for initial
  paint.
- 404 policy: unknown slug or archived unit returns `notFound()`.
- Images: `next/image` with `remotePatterns` pointed at the MinIO host.
- shadcn components installed as their pages need them (`card`, `badge`,
  `select`, `dialog`, `input`, `label`).

## 6. Auth

Single shared secret in `ADMIN_PASSWORD` (env var, no default). Two
enforcement points:

- **Go API** — chi middleware on the `/admin/*` subtree. Missing env crashes
  the service on start so it's never silently off.
- **Next.js** — middleware on `/dashboard/*` that issues an HTTP Basic
  challenge using the same env value.

No sessions, no cookies, no rotation. Real auth (phone + OTP for guests,
proper users + RBAC for staff) lands in Phase 4/6.

## 7. Testing & acceptance

### 7.1 Automated

- **Go unit tests** — slugify, MIME allowlist, offset-pagination clamp,
  bilingual field validators.
- **Go integration tests** with `testcontainers-go`:
  - one per admin CRUD endpoint (happy path, 404, 409)
  - one per public list/detail endpoint
  - `exact_address` absent from public unit payloads
  - basic-auth challenge on `/api/v1/admin/*`
  - archived units 404 from every public route
- **Search filter matrix** — one test per filter, one combining three, one
  paging test. Table-driven.
- **Migration test** — every migration goes up, down, and up again cleanly
  on an empty DB.
- **Web** — `npm run typecheck` stays green. No component tests in Phase 2.

### 7.2 Manual acceptance — the demo that proves Phase 2 done

1. `make dev`, open `/dashboard`, enter `ADMIN_PASSWORD`.
2. Create area **Sidi Abdel Rahman** (region `north_coast`).
3. Create compound **Marassi** in it (with amenities, beach type sea,
   `is_featured = true`).
4. Create owner **Ahmed** with a phone number.
5. Create 3 units in Marassi with different `type`, `view`, `sea_distance_m`.
   Upload 2–4 real images per unit. Mark one image as cover per unit. Set
   status `active`.
6. Open `/ar` — hero, Marassi in featured strip, 3 units in new arrivals.
   Arabic, RTL.
7. Switch to `/en` — same content, English labels, mirrored layout.
8. Open `/ar/search`:
   - `compound = Marassi` → 3 units.
   - `view = sea` → only sea-view units.
   - `maxSeaDistance = 100` → only units within 100 m.
   - `sort = sea_distance_asc` → order changes.
   - clear filters → 3 results.
9. Click a unit → gallery lightbox works, meta reads correctly, description
   in Arabic, house rules present. `/en/unit/[slug]` shows English versions.
10. Click compound breadcrumb → units in the compound listed.
11. Open `/ar/destinations/sidi-abdel-rahman` — Marassi shown, units listed.
12. Open `/dashboard` in an incognito window — basic-auth prompt appears.
13. `GET /api/v1/admin/units` with no auth → 401. With correct auth → 200.
14. `GET /api/v1/units/[slug]` — payload has **no** `exact_address` key.
15. Delete Marassi in admin → 409 because units reference it. Archive a unit
    → it disappears from public `/search` and its direct URL returns 404.
16. `make test` green.

If all sixteen pass, Phase 2 is done.

## 8. Roadmap side-effects

The catalogue roadmap in `2026-09-08-remaining-phases-roadmap.md` needs one
update at spec-approval time: add "public map (unit detail + optional search
view)" to the Phase 7 deliverables. Everything else in the roadmap stands.
