# Phase 2b — Public Read API: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public, read-only catalog endpoints (`/api/v1/areas`, `/compounds`, `/units`) backed by sqlc queries and integration-tested against a real Postgres, so the web front-end can browse the catalog seeded by later phases.

**Architecture:** sqlc generates a typed `db` package from `.sql` files that live next to the schema. A thin chi router in `internal/http` calls `*db.Queries` directly (no separate service layer — Phase 2 is CRUD-shaped, adding a layer now is speculative). Handler tests spin one Postgres container per test process via `internal/testsupport`, truncate the catalog tables before each test, insert fixtures inline, and hit handlers through `httptest`.

**Tech Stack:** Go 1.23, chi/v5, pgx/v5, sqlc v1.27+ (pinned), testcontainers-go, Postgres 16.

**Spec:** `docs/superpowers/specs/2026-09-08-phase-2-catalog-design.md` §3.1, §3.2.

---

## File structure

**Create:**
- `api/internal/store/postgres/queries/areas.sql`
- `api/internal/store/postgres/queries/compounds.sql`
- `api/internal/store/postgres/queries/units.sql`
- `api/internal/store/postgres/db/*.go` — **generated** by sqlc, never hand-edited
- `api/internal/testsupport/pgcontainer.go`
- `api/internal/http/errors.go`
- `api/internal/http/errors_test.go`
- `api/internal/http/pagination.go`
- `api/internal/http/pagination_test.go`
- `api/internal/http/areas.go`
- `api/internal/http/areas_test.go`
- `api/internal/http/compounds.go`
- `api/internal/http/compounds_test.go`
- `api/internal/http/units.go`
- `api/internal/http/units_test.go`

**Modify:**
- `api/internal/http/router.go` — accept `*db.Queries`, register the new routes.
- `api/cmd/api/main.go` — construct `db.New(pool)` and pass to `NewServer`.
- `api/sqlc.yaml` — no change expected; if sqlc complains about enum overrides, add them here.

**Do not touch:** anything in `web/`, `infra/migrations/`, `internal/domain/`, `internal/money/`, `internal/slug/`. Phase 2b is API layer only.

---

## Naming & response conventions

- Public routes address entities by `slug`; admin (Phase 2c) uses `id`.
- Only `status = 'active'` units are returned to public callers. Archived units 404 from every public route; drafts and paused units are invisible to public callers (they aren't `active`).
- Error envelope, always:
  ```json
  { "error": { "code": "not_found", "message": "unit not found" } }
  ```
- Search envelope, always:
  ```json
  { "items": [...], "page": 1, "size": 20, "total": 42 }
  ```
- `GET /units/:slug` payload MUST omit `exact_address`.
- JSON field names are `snake_case` (matches sqlc's `emit_json_tags`).

---

## Task 1 — sqlc queries: areas

**Files:**
- Create: `api/internal/store/postgres/queries/areas.sql`

- [ ] **Step 1: Pin sqlc**

Verify sqlc runs against the schema. Because the API image uses Go 1.23 and the latest sqlc requires Go 1.24+, pin to `v1.27.0` which supports Go 1.23. Run:

```powershell
docker compose -f infra/docker-compose.yml --env-file .env run --rm api sh -c 'cd /src && go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 version'
```

Expected: `v1.27.0`. If the compose service doesn't mount `/src`, use `-w /src` or invoke from `api/` directly.

- [ ] **Step 2: Write `areas.sql`**

Create `api/internal/store/postgres/queries/areas.sql`:

```sql
-- name: ListAreasWithUnitCount :many
SELECT
  a.id, a.slug, a.name_ar, a.name_en, a.region, a.km_marker, a.sort_order,
  COUNT(u.id) FILTER (WHERE u.status = 'active') AS unit_count
FROM areas a
LEFT JOIN compounds c ON c.area_id = a.id
LEFT JOIN units u     ON u.compound_id = c.id
GROUP BY a.id
ORDER BY a.sort_order ASC, a.name_en ASC;

-- name: GetAreaBySlug :one
SELECT id, slug, name_ar, name_en, region, km_marker, sort_order
FROM areas WHERE slug = $1;

-- name: ListFeaturedCompoundsByAreaID :many
SELECT id, area_id, slug, name_ar, name_en, description_ar, description_en,
       amenities, beach_type, gate_info_ar, gate_info_en, lat, lng,
       cover_image_url, is_featured
FROM compounds
WHERE area_id = $1 AND is_featured = true
ORDER BY name_en ASC;
```

- [ ] **Step 3: Regenerate sqlc**

Run from `api/`:

```powershell
docker run --rm -v D:/Projects/sahel/sahel/api:/src -w /src golang:1.23-alpine sh -c 'apk add --no-cache git >/dev/null && go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 generate'
```

Expected: silent success; new files under `api/internal/store/postgres/db/`.

If sqlc errors on an unknown enum (`region_enum`), stop and add an override to `sqlc.yaml`:
```yaml
overrides:
  - db_type: "region_enum"
    go_type:
      import: "github.com/sahel/api/internal/domain/area"
      type: "Region"
```
Then re-run. Repeat the same pattern (only when needed) for `beach_type_enum`, `unit_type_enum`, `unit_view_enum`, `unit_status_enum` in later tasks.

- [ ] **Step 4: Verify compile**

Run:
```powershell
docker run --rm -v D:/Projects/sahel/sahel/api:/src -w /src golang:1.23-alpine sh -c 'go build ./...'
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add api/internal/store/postgres/queries/areas.sql api/internal/store/postgres/db/ api/sqlc.yaml
git commit -m "feat(catalog): sqlc queries for areas"
```

---

## Task 2 — testsupport package (shared Postgres container)

A single package-level container per `go test` process. Individual tests get a clean slate by TRUNCATE-ing the catalog tables. Skips cleanly when Docker isn't available so `go test ./...` still finishes on constrained machines.

**Files:**
- Create: `api/internal/testsupport/pgcontainer.go`

- [ ] **Step 1: Write the helper**

Create `api/internal/testsupport/pgcontainer.go`:

```go
// Package testsupport gives handler and store tests a real Postgres. One
// container per process, truncated between callers. Not for production code.
package testsupport

import (
	"context"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"database/sql"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var (
	poolOnce sync.Once
	sharedPool *pgxpool.Pool
	startErr   error
)

// Pool returns a *pgxpool.Pool pointed at a fresh Postgres 16 with every
// Phase 2 migration applied. Truncates the catalog tables before returning
// so each caller sees an empty schema. Calls t.Skip if Docker is unreachable.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	poolOnce.Do(startShared)
	if startErr != nil {
		t.Skipf("testcontainers unavailable (%v)", startErr)
	}
	if _, err := sharedPool.Exec(context.Background(),
		`TRUNCATE unit_images, units, compounds, owners, areas RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return sharedPool
}

func startShared() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("sahel_test"),
		tcpostgres.WithUsername("sahel"),
		tcpostgres.WithPassword("sahel_test"),
		tcpostgres.BasicWaitStrategies(),
		tcpostgres.WithInitScripts(filepath.Join(repoRoot(), "infra", "postgres", "init", "00-extensions.sql")),
	)
	if err != nil {
		startErr = err
		return
	}

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		startErr = err
		return
	}

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		startErr = err
		return
	}
	defer sqlDB.Close()

	migrations := filepath.Join(repoRoot(), "infra", "migrations")
	if err := goose.SetDialect("postgres"); err != nil {
		startErr = err
		return
	}
	if err := goose.UpContext(ctx, sqlDB, migrations); err != nil {
		startErr = err
		return
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		startErr = err
		return
	}
	sharedPool = pool
}

// repoRoot walks up from this file to the repo root (contains go.mod).
func repoRoot() string {
	_, thisFile, _, _ := runtime.Caller(0)
	// this file is api/internal/testsupport/pgcontainer.go
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "..")
}
```

- [ ] **Step 2: Verify compile**

Run:
```powershell
docker run --rm -v D:/Projects/sahel/sahel/api:/src -w /src golang:1.23-alpine sh -c 'go build ./...'
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add api/internal/testsupport/
git commit -m "test(catalog): shared postgres testcontainer helper"
```

---

## Task 3 — Error envelope helper

**Files:**
- Create: `api/internal/http/errors.go`
- Create: `api/internal/http/errors_test.go`

- [ ] **Step 1: Write the tests**

Create `api/internal/http/errors_test.go`:

```go
package http

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestWriteErrorShape(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, 404, "not_found", "unit not found")

	if rec.Code != 404 {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("content-type = %q", ct)
	}

	var got struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Error.Code != "not_found" || got.Error.Message != "unit not found" {
		t.Fatalf("body = %+v", got)
	}
}
```

- [ ] **Step 2: Confirm it fails**

Run:
```powershell
docker run --rm -v D:/Projects/sahel/sahel/api:/src -w /src golang:1.23-alpine sh -c 'go test ./internal/http/... -run TestWriteErrorShape -v'
```
Expected: build failure — `writeError` undefined.

- [ ] **Step 3: Implement**

Create `api/internal/http/errors.go`:

```go
package http

import "net/http"

// writeError emits the {"error":{"code","message"}} envelope required by
// the spec. Code strings are stable identifiers that clients may switch on;
// messages are human-readable and may change.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}
```

- [ ] **Step 4: Run tests**

Run:
```powershell
docker run --rm -v D:/Projects/sahel/sahel/api:/src -w /src golang:1.23-alpine sh -c 'go test ./internal/http/... -run TestWriteErrorShape -v'
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/internal/http/errors.go api/internal/http/errors_test.go
git commit -m "feat(api): error envelope helper"
```

---

## Task 4 — Pagination parser

Every list endpoint accepts `page` and `size`. One helper enforces the defaults and caps.

**Files:**
- Create: `api/internal/http/pagination.go`
- Create: `api/internal/http/pagination_test.go`

- [ ] **Step 1: Write the tests**

Create `api/internal/http/pagination_test.go`:

```go
package http

import (
	"net/url"
	"testing"
)

func TestParsePagination(t *testing.T) {
	cases := []struct {
		name              string
		q                 string
		wantPage, wantSize int
	}{
		{"defaults", "", 1, 20},
		{"explicit", "page=3&size=40", 3, 40},
		{"size clamped to max", "size=999", 1, 60},
		{"size floor", "size=0", 1, 20},
		{"page floor", "page=0", 1, 20},
		{"negative page", "page=-5", 1, 20},
		{"garbage", "page=abc&size=xyz", 1, 20},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v, _ := url.ParseQuery(c.q)
			page, size := parsePagination(v)
			if page != c.wantPage || size != c.wantSize {
				t.Fatalf("got (%d,%d), want (%d,%d)", page, size, c.wantPage, c.wantSize)
			}
		})
	}
}
```

- [ ] **Step 2: Confirm it fails**

Run: `go test ./internal/http/... -run TestParsePagination -v`
Expected: build failure — `parsePagination` undefined.

- [ ] **Step 3: Implement**

Create `api/internal/http/pagination.go`:

```go
package http

import (
	"net/url"
	"strconv"
)

const (
	defaultPageSize = 20
	maxPageSize     = 60
)

// parsePagination reads ?page= and ?size= with hard bounds. Anything invalid,
// zero, or negative falls back to defaults. Size is capped at maxPageSize.
func parsePagination(q url.Values) (page, size int) {
	page = intOrDefault(q.Get("page"), 1)
	if page < 1 {
		page = 1
	}
	size = intOrDefault(q.Get("size"), defaultPageSize)
	if size < 1 {
		size = defaultPageSize
	}
	if size > maxPageSize {
		size = maxPageSize
	}
	return page, size
}

func intOrDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/http/... -run TestParsePagination -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/internal/http/pagination.go api/internal/http/pagination_test.go
git commit -m "feat(api): pagination helper"
```

---

## Task 5 — Areas handlers

**Files:**
- Create: `api/internal/http/areas.go`
- Create: `api/internal/http/areas_test.go`
- Modify: `api/internal/http/router.go`
- Modify: `api/cmd/api/main.go`

- [ ] **Step 1: Modify router to hold `*db.Queries`**

Edit `api/internal/http/router.go` — change the `Server` struct and constructor:

```go
import (
    // existing imports...
    "github.com/sahel/api/internal/store/postgres/db"
)

type Server struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	log     zerolog.Logger
	env     string
}

func NewServer(pool *pgxpool.Pool, log zerolog.Logger, env string) *Server {
	return &Server{
		pool:    pool,
		queries: db.New(pool),
		log:     log,
		env:     env,
	}
}
```

No other edits to `router.go` in this task — we register handlers later.

- [ ] **Step 2: Write the handler tests**

Create `api/internal/http/areas_test.go`:

```go
package http

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"

	"github.com/sahel/api/internal/testsupport"
)

func TestListAreas_Empty(t *testing.T) {
	pool := testsupport.Pool(t)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/areas", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var body []map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body) != 0 {
		t.Fatalf("want empty list, got %v", body)
	}
}

func TestListAreas_CountsOnlyActiveUnits(t *testing.T) {
	pool := testsupport.Pool(t)
	ctx := context.Background()

	// Two areas, one compound each, mixed unit statuses.
	mustExec(t, pool, `
		INSERT INTO areas (slug, name_ar, name_en, region, sort_order) VALUES
		  ('nc', 'س', 'North Coast', 'north_coast', 1),
		  ('so', 'س', 'Sokhna',      'sokhna',      2);
		INSERT INTO owners (name, phone) VALUES ('O', '0');
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
		  SELECT id, 'c-'||slug, 'ن', 'C', 'د', 'D', 'sea' FROM areas;
		WITH o AS (SELECT id FROM owners LIMIT 1)
		INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
		                   type, bedrooms, bathrooms, base_guests, max_guests, sea_distance_m, view, status)
		SELECT (SELECT id FROM o), c.id, 'u-'||c.slug||'-'||g.n,
		       't', 't', 'd', 'd', 'chalet', 2, 1, 4, 6, 100, 'sea', g.status
		FROM compounds c
		CROSS JOIN (VALUES ('active'::unit_status_enum), ('draft'::unit_status_enum)) AS g(status)
		         , generate_series(1, 1) AS gg(n);
	`)
	_ = ctx

	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/areas", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	var body []struct {
		Slug      string `json:"slug"`
		UnitCount int    `json:"unit_count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body) != 2 {
		t.Fatalf("want 2 areas, got %d", len(body))
	}
	for _, a := range body {
		if a.UnitCount != 1 {
			t.Errorf("area %s: unit_count=%d, want 1 (only active)", a.Slug, a.UnitCount)
		}
	}
}

func TestGetArea_BySlug(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, `
		INSERT INTO areas (slug, name_ar, name_en, region) VALUES
		  ('marassi', 'م', 'Marassi', 'north_coast');
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en,
		                       beach_type, is_featured)
		SELECT id, 'hac', 'ه', 'Hacienda', 'd', 'd', 'sea', true FROM areas WHERE slug='marassi';
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en,
		                       beach_type, is_featured)
		SELECT id, 'bg', 'ب', 'Bianchi', 'd', 'd', 'sea', false FROM areas WHERE slug='marassi';
	`)

	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/areas/marassi", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var body struct {
		Slug     string           `json:"slug"`
		Featured []map[string]any `json:"featured_compounds"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Slug != "marassi" {
		t.Fatalf("slug = %q", body.Slug)
	}
	if len(body.Featured) != 1 {
		t.Fatalf("featured_compounds = %d, want 1", len(body.Featured))
	}
}

func TestGetArea_NotFound(t *testing.T) {
	pool := testsupport.Pool(t)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/areas/nope", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	if rec.Code != 404 {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Error.Code != "not_found" {
		t.Fatalf("error.code = %q", body.Error.Code)
	}
}
```

Also add a small helper for tests in the same file (single copy — reused in later tests):

```go
import "github.com/jackc/pgx/v5/pgxpool"

func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("mustExec: %v\n%s", err, sql)
	}
}
```

- [ ] **Step 3: Confirm they fail**

Run:
```powershell
docker run --rm -e TESTCONTAINERS_RYUK_DISABLED=true -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal --add-host=host.docker.internal:host-gateway -v /var/run/docker.sock:/var/run/docker.sock -v D:/Projects/sahel/sahel:/src -w /src/api golang:1.23-alpine sh -c 'go test ./internal/http/... -run TestListAreas -v'
```
Expected: build failure — `registerCatalogRoutes` / handlers undefined.

- [ ] **Step 4: Implement the areas handlers**

Create `api/internal/http/areas.go`:

```go
package http

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func (s *Server) listAreas(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5)
	defer cancel()

	rows, err := s.queries.ListAreasWithUnitCount(ctx)
	if err != nil {
		s.log.Error().Err(err).Msg("list areas")
		writeError(w, http.StatusInternalServerError, "internal", "list areas failed")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) getArea(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	area, err := s.queries.GetAreaBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "area not found")
			return
		}
		s.log.Error().Err(err).Msg("get area")
		writeError(w, http.StatusInternalServerError, "internal", "get area failed")
		return
	}

	featured, err := s.queries.ListFeaturedCompoundsByAreaID(ctx, area.ID)
	if err != nil {
		s.log.Error().Err(err).Msg("list featured compounds")
		writeError(w, http.StatusInternalServerError, "internal", "featured compounds failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":                 area.ID,
		"slug":               area.Slug,
		"name_ar":            area.NameAr,
		"name_en":            area.NameEn,
		"region":             area.Region,
		"km_marker":          area.KmMarker,
		"sort_order":         area.SortOrder,
		"featured_compounds": featured,
	})
}
```

`contextWithTimeout` currently takes a `time.Duration`. Update the call sites — either pass `5 * time.Second` explicitly or, if you prefer, change the signature to take an `int` seconds value. Keeping the existing signature is simpler; use `5 * time.Second`:

```go
ctx, cancel := contextWithTimeout(r, 5*time.Second)
```

(Update the imports accordingly.)

- [ ] **Step 5: Register the routes**

Edit `api/internal/http/router.go` — inside `Routes()`, replace the `r.Route("/api/v1", ...)` block with:

```go
r.Route("/api/v1", func(r chi.Router) {
    r.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
        writeJSON(w, http.StatusOK, map[string]string{"pong": "sahel"})
    })
    s.registerCatalogRoutes(r)
})
```

Then, still in `router.go`, add:

```go
func (s *Server) registerCatalogRoutes(r chi.Router) {
    r.Get("/areas", s.listAreas)
    r.Get("/areas/{slug}", s.getArea)
    // compounds and units land in Task 6 / Task 7
}
```

For tests to call it as a receiver on `*Server` without a router argument, expose a zero-arg variant only if you actually call one from tests. The test above uses `s.Routes()` which calls it internally — so no zero-arg variant is needed. **Delete** the `s.registerCatalogRoutes()` line from the test (a leftover from a draft).

Fix the test file: replace the first test's

```go
s.registerCatalogRoutes()
```

with a comment, or simply remove the line. `s.Routes()` already wires everything.

- [ ] **Step 6: Update `cmd/api/main.go`**

No change is required if `NewServer(pool, log, cfg.Env)` still compiles. It does — `db.New(pool)` is constructed inside `NewServer` in Step 1. Nothing to do here.

- [ ] **Step 7: Run the tests**

Run:
```powershell
docker run --rm -e TESTCONTAINERS_RYUK_DISABLED=true -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal --add-host=host.docker.internal:host-gateway -v /var/run/docker.sock:/var/run/docker.sock -v D:/Projects/sahel/sahel:/src -w /src/api golang:1.23-alpine sh -c 'go test ./internal/http/... -v -run TestListAreas\|TestGetArea'
```
Expected: 4 subtests PASS (or SKIP if Docker unavailable).

- [ ] **Step 8: Commit**

```bash
git add api/internal/http/areas.go api/internal/http/areas_test.go api/internal/http/router.go
git commit -m "feat(catalog): public GET /areas and /areas/:slug"
```

---

## Task 6 — Compounds handlers

**Files:**
- Create: `api/internal/store/postgres/queries/compounds.sql`
- Create: `api/internal/http/compounds.go`
- Create: `api/internal/http/compounds_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Write the sqlc queries**

Create `api/internal/store/postgres/queries/compounds.sql`:

```sql
-- name: ListCompounds :many
SELECT
  c.id, c.area_id, c.slug, c.name_ar, c.name_en, c.description_ar, c.description_en,
  c.amenities, c.beach_type, c.cover_image_url, c.is_featured,
  a.slug AS area_slug
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE (sqlc.narg('area_slug')::text IS NULL OR a.slug = sqlc.narg('area_slug')::text)
ORDER BY c.name_en ASC
LIMIT $1 OFFSET $2;

-- name: CountCompounds :one
SELECT COUNT(*)
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE (sqlc.narg('area_slug')::text IS NULL OR a.slug = sqlc.narg('area_slug')::text);

-- name: GetCompoundBySlug :one
SELECT
  c.id, c.area_id, c.slug, c.name_ar, c.name_en, c.description_ar, c.description_en,
  c.amenities, c.beach_type, c.gate_info_ar, c.gate_info_en, c.lat, c.lng,
  c.cover_image_url, c.is_featured,
  a.slug AS area_slug, a.name_ar AS area_name_ar, a.name_en AS area_name_en
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE c.slug = $1;

-- name: ListActiveUnitsByCompoundID :many
SELECT id, compound_id, slug, title_ar, title_en, type, bedrooms, bathrooms,
       max_guests, sea_distance_m, view, status, created_at
FROM units
WHERE compound_id = $1 AND status = 'active'
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountActiveUnitsByCompoundID :one
SELECT COUNT(*) FROM units WHERE compound_id = $1 AND status = 'active';
```

- [ ] **Step 2: Regenerate sqlc**

Run:
```powershell
docker run --rm -v D:/Projects/sahel/sahel/api:/src -w /src golang:1.23-alpine sh -c 'go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 generate'
```
Expected: silent success.

- [ ] **Step 3: Write the handler tests**

Create `api/internal/http/compounds_test.go`:

```go
package http

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"

	"github.com/sahel/api/internal/testsupport"
)

func TestListCompounds_FilterByArea(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, `
		INSERT INTO areas (slug, name_ar, name_en, region) VALUES
		  ('nc','ن','North','north_coast'),
		  ('so','س','Sokhna','sokhna');
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
		SELECT id, 'nc-1','ه','NC 1','د','D','sea' FROM areas WHERE slug='nc';
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
		SELECT id, 'nc-2','ه','NC 2','د','D','sea' FROM areas WHERE slug='nc';
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
		SELECT id, 'so-1','ه','SO 1','د','D','sea' FROM areas WHERE slug='so';
	`)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/compounds?area=nc", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
		Page  int              `json:"page"`
		Size  int              `json:"size"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Total != 2 || len(body.Items) != 2 {
		t.Fatalf("total=%d items=%d, want 2/2", body.Total, len(body.Items))
	}
	if body.Page != 1 || body.Size != 20 {
		t.Fatalf("page/size = %d/%d, want 1/20", body.Page, body.Size)
	}
}

func TestGetCompound_WithUnits(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, `
		INSERT INTO areas (slug, name_ar, name_en, region) VALUES ('nc','ن','North','north_coast');
		INSERT INTO owners (name, phone) VALUES ('O','0');
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
		SELECT id, 'hac','ه','Hacienda','د','D','sea' FROM areas WHERE slug='nc';
		WITH o AS (SELECT id FROM owners LIMIT 1),
		     c AS (SELECT id FROM compounds WHERE slug='hac')
		INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
		                   type, bedrooms, bathrooms, base_guests, max_guests, sea_distance_m, view, status)
		VALUES
		  ((SELECT id FROM o), (SELECT id FROM c), 'u1','ت','U1','د','D','chalet',2,1,4,6,100,'sea','active'),
		  ((SELECT id FROM o), (SELECT id FROM c), 'u2','ت','U2','د','D','chalet',2,1,4,6,100,'sea','draft');
	`)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/compounds/hac", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Slug  string `json:"slug"`
		Units struct {
			Items []map[string]any `json:"items"`
			Total int              `json:"total"`
		} `json:"units"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Slug != "hac" {
		t.Fatalf("slug = %q", body.Slug)
	}
	if body.Units.Total != 1 || len(body.Units.Items) != 1 {
		t.Fatalf("units total=%d items=%d, want 1/1 (only active)", body.Units.Total, len(body.Units.Items))
	}
}

func TestGetCompound_NotFound(t *testing.T) {
	pool := testsupport.Pool(t)
	s := NewServer(pool, zerolog.Nop(), "test")
	req := httptest.NewRequest("GET", "/api/v1/compounds/nope", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
```

- [ ] **Step 4: Confirm tests fail**

Run: `go test ./internal/http/... -run TestListCompounds\|TestGetCompound -v`
Expected: build failure.

- [ ] **Step 5: Implement handlers**

Create `api/internal/http/compounds.go`:

```go
package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/store/postgres/db"
)

func (s *Server) listCompounds(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	page, size := parsePagination(r.URL.Query())
	area := r.URL.Query().Get("area")

	var areaSlug *string
	if area != "" {
		areaSlug = &area
	}

	items, err := s.queries.ListCompounds(ctx, db.ListCompoundsParams{
		AreaSlug: areaSlug,
		Limit:    int32(size),
		Offset:   int32((page - 1) * size),
	})
	if err != nil {
		s.log.Error().Err(err).Msg("list compounds")
		writeError(w, http.StatusInternalServerError, "internal", "list compounds failed")
		return
	}
	total, err := s.queries.CountCompounds(ctx, areaSlug)
	if err != nil {
		s.log.Error().Err(err).Msg("count compounds")
		writeError(w, http.StatusInternalServerError, "internal", "count compounds failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"page":  page,
		"size":  size,
		"total": total,
	})
}

func (s *Server) getCompound(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	c, err := s.queries.GetCompoundBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "compound not found")
			return
		}
		s.log.Error().Err(err).Msg("get compound")
		writeError(w, http.StatusInternalServerError, "internal", "get compound failed")
		return
	}

	page, size := parsePagination(r.URL.Query())
	units, err := s.queries.ListActiveUnitsByCompoundID(ctx, db.ListActiveUnitsByCompoundIDParams{
		CompoundID: c.ID,
		Limit:      int32(size),
		Offset:     int32((page - 1) * size),
	})
	if err != nil {
		s.log.Error().Err(err).Msg("list compound units")
		writeError(w, http.StatusInternalServerError, "internal", "compound units failed")
		return
	}
	total, err := s.queries.CountActiveUnitsByCompoundID(ctx, c.ID)
	if err != nil {
		s.log.Error().Err(err).Msg("count compound units")
		writeError(w, http.StatusInternalServerError, "internal", "compound units count failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":              c.ID,
		"slug":            c.Slug,
		"name_ar":         c.NameAr,
		"name_en":         c.NameEn,
		"description_ar":  c.DescriptionAr,
		"description_en":  c.DescriptionEn,
		"amenities":       c.Amenities,
		"beach_type":      c.BeachType,
		"gate_info_ar":    c.GateInfoAr,
		"gate_info_en":    c.GateInfoEn,
		"lat":             c.Lat,
		"lng":             c.Lng,
		"cover_image_url": c.CoverImageUrl,
		"is_featured":     c.IsFeatured,
		"area": map[string]any{
			"slug":    c.AreaSlug,
			"name_ar": c.AreaNameAr,
			"name_en": c.AreaNameEn,
		},
		"units": map[string]any{
			"items": units,
			"page":  page,
			"size":  size,
			"total": total,
		},
	})
}
```

- [ ] **Step 6: Register the routes**

Append inside `registerCatalogRoutes` in `router.go`:

```go
r.Get("/compounds", s.listCompounds)
r.Get("/compounds/{slug}", s.getCompound)
```

- [ ] **Step 7: Run tests**

Run: `go test ./internal/http/... -v -run TestListCompounds\|TestGetCompound`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/internal/store/postgres/queries/compounds.sql api/internal/store/postgres/db/ \
        api/internal/http/compounds.go api/internal/http/compounds_test.go \
        api/internal/http/router.go
git commit -m "feat(catalog): public GET /compounds and /compounds/:slug"
```

---

## Task 7 — Unit search + detail

The biggest single query in Phase 2b. Filters follow spec §3.2 exactly; sort follows the three-value whitelist; pagination reuses the helper.

**Files:**
- Create: `api/internal/store/postgres/queries/units.sql`
- Create: `api/internal/http/units.go`
- Create: `api/internal/http/units_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Write the sqlc queries**

Create `api/internal/store/postgres/queries/units.sql`:

```sql
-- name: SearchUnits :many
SELECT
  u.id, u.owner_id, u.compound_id, u.slug,
  u.title_ar, u.title_en, u.type, u.bedrooms, u.bathrooms,
  u.base_guests, u.max_guests, u.area_sqm, u.floor,
  u.sea_distance_m, u.view, u.status, u.created_at,
  c.slug AS compound_slug, c.name_en AS compound_name_en,
  a.slug AS area_slug,     a.name_en AS area_name_en
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN areas     a ON a.id = c.area_id
WHERE u.status = 'active'
  AND (sqlc.narg('area_slug')::text     IS NULL OR a.slug = sqlc.narg('area_slug')::text)
  AND (sqlc.narg('compound_slug')::text IS NULL OR c.slug = sqlc.narg('compound_slug')::text)
  AND (sqlc.narg('unit_type')::unit_type_enum IS NULL OR u.type = sqlc.narg('unit_type')::unit_type_enum)
  AND (sqlc.narg('unit_view')::unit_view_enum IS NULL OR u.view = sqlc.narg('unit_view')::unit_view_enum)
  AND (sqlc.narg('guests')::int         IS NULL OR u.max_guests >= sqlc.narg('guests')::int)
  AND (sqlc.narg('bedrooms')::int       IS NULL OR u.bedrooms   >= sqlc.narg('bedrooms')::int)
  AND (sqlc.narg('max_sea_distance')::int IS NULL OR u.sea_distance_m <= sqlc.narg('max_sea_distance')::int)
ORDER BY
  CASE WHEN @sort_key::text = 'sea_distance_asc' THEN u.sea_distance_m END ASC NULLS LAST,
  CASE WHEN @sort_key::text = 'bedrooms_desc'    THEN u.bedrooms       END DESC NULLS LAST,
  u.created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountSearchUnits :one
SELECT COUNT(*)
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN areas     a ON a.id = c.area_id
WHERE u.status = 'active'
  AND (sqlc.narg('area_slug')::text     IS NULL OR a.slug = sqlc.narg('area_slug')::text)
  AND (sqlc.narg('compound_slug')::text IS NULL OR c.slug = sqlc.narg('compound_slug')::text)
  AND (sqlc.narg('unit_type')::unit_type_enum IS NULL OR u.type = sqlc.narg('unit_type')::unit_type_enum)
  AND (sqlc.narg('unit_view')::unit_view_enum IS NULL OR u.view = sqlc.narg('unit_view')::unit_view_enum)
  AND (sqlc.narg('guests')::int         IS NULL OR u.max_guests >= sqlc.narg('guests')::int)
  AND (sqlc.narg('bedrooms')::int       IS NULL OR u.bedrooms   >= sqlc.narg('bedrooms')::int)
  AND (sqlc.narg('max_sea_distance')::int IS NULL OR u.sea_distance_m <= sqlc.narg('max_sea_distance')::int);

-- name: GetPublicUnitBySlug :one
SELECT
  u.id, u.compound_id, u.slug,
  u.title_ar, u.title_en, u.description_ar, u.description_en,
  u.house_rules_ar, u.house_rules_en,
  u.type, u.bedrooms, u.bathrooms, u.base_guests, u.max_guests,
  u.area_sqm, u.floor, u.sea_distance_m, u.view, u.row_number,
  u.amenities, u.lat, u.lng, u.status, u.created_at, u.updated_at,
  c.id AS compound_id_out, c.slug AS compound_slug, c.name_ar AS compound_name_ar, c.name_en AS compound_name_en,
  a.id AS area_id, a.slug AS area_slug, a.name_ar AS area_name_ar, a.name_en AS area_name_en
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN areas     a ON a.id = c.area_id
WHERE u.slug = $1 AND u.status = 'active';

-- name: ListImagesByUnitID :many
SELECT id, unit_id, url, alt_ar, alt_en, sort, is_cover
FROM unit_images
WHERE unit_id = $1
ORDER BY is_cover DESC, sort ASC, created_at ASC;
```

Note: `exact_address` is deliberately absent from `GetPublicUnitBySlug`.

- [ ] **Step 2: Regenerate sqlc**

Run the sqlc command from Task 1 Step 3. Expected: silent success.

- [ ] **Step 3: Write the handler tests**

Create `api/internal/http/units_test.go`:

```go
package http

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"

	"github.com/sahel/api/internal/testsupport"
)

const unitSeedSQL = `
INSERT INTO areas (slug, name_ar, name_en, region) VALUES
  ('nc','ن','North','north_coast'),
  ('so','س','Sokhna','sokhna');
INSERT INTO owners (name, phone) VALUES ('O','0');
INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
SELECT id, 'nc-a','ه','NC A','د','D','sea' FROM areas WHERE slug='nc';
INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
SELECT id, 'so-a','ه','SO A','د','D','sea' FROM areas WHERE slug='so';

WITH o AS (SELECT id FROM owners LIMIT 1),
     nc AS (SELECT id FROM compounds WHERE slug='nc-a'),
     so AS (SELECT id FROM compounds WHERE slug='so-a')
INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
                   type, bedrooms, bathrooms, base_guests, max_guests, sea_distance_m, view, status,
                   exact_address)
VALUES
  ((SELECT id FROM o),(SELECT id FROM nc),'nc-chalet-2br','ت','NC Chalet 2BR','د','D','chalet',2,1,4,6, 50,'sea','active','SECRET-1'),
  ((SELECT id FROM o),(SELECT id FROM nc),'nc-villa-4br', 'ت','NC Villa 4BR', 'د','D','villa', 4,3,8,10,300,'lagoon','active','SECRET-2'),
  ((SELECT id FROM o),(SELECT id FROM nc),'nc-draft',     'ت','NC Draft',     'د','D','chalet',2,1,4,6,100,'sea','draft','SECRET-3'),
  ((SELECT id FROM o),(SELECT id FROM so),'so-chalet',    'ت','SO Chalet',    'د','D','chalet',3,2,6,8, 20,'sea','active','SECRET-4');
`

func TestSearchUnits_NoFilters_OnlyActive(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if body.Total != 3 || len(body.Items) != 3 {
		t.Fatalf("total=%d items=%d, want 3/3 (active only)", body.Total, len(body.Items))
	}
}

func TestSearchUnits_FilterByArea(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units?area=nc", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	var body struct{ Total int `json:"total"` }
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if body.Total != 2 {
		t.Fatalf("total=%d, want 2 (2 active in nc)", body.Total)
	}
}

func TestSearchUnits_FilterByGuestsAndBedrooms(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	// max_guests>=8 AND bedrooms>=4 → only nc-villa-4br
	req := httptest.NewRequest("GET", "/api/v1/units?guests=8&bedrooms=4", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	var body struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if body.Total != 1 || body.Items[0]["slug"] != "nc-villa-4br" {
		t.Fatalf("got %+v", body)
	}
}

func TestSearchUnits_SortSeaDistanceAsc(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units?sort=sea_distance_asc", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	var body struct{ Items []map[string]any `json:"items"` }
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if body.Items[0]["slug"] != "so-chalet" {
		t.Fatalf("first slug=%v, want so-chalet (20m)", body.Items[0]["slug"])
	}
}

func TestSearchUnits_MaxSize60(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units?size=500", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	var body struct{ Size int `json:"size"` }
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if body.Size != 60 {
		t.Fatalf("size=%d, want 60", body.Size)
	}
}

func TestGetUnit_OmitsExactAddress(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units/nc-chalet-2br", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	if contains(body, "exact_address") {
		t.Fatalf("response leaks exact_address: %s", body)
	}
	if contains(body, "SECRET-") {
		t.Fatalf("response leaks SECRET-N value: %s", body)
	}
	if !contains(body, `"slug":"nc-chalet-2br"`) {
		t.Fatalf("slug missing: %s", body)
	}
}

func TestGetUnit_ArchivedIs404(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	mustExec(t, pool, `UPDATE units SET status='archived' WHERE slug='nc-chalet-2br'`)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units/nc-chalet-2br", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("status=%d, want 404", rec.Code)
	}
}

// contains is a tiny helper to avoid importing strings just for one use per
// test. Delete if you'd rather use strings.Contains directly.
func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
```

- [ ] **Step 4: Confirm they fail**

Run: `go test ./internal/http/... -run TestSearchUnits\|TestGetUnit -v`
Expected: build failure.

- [ ] **Step 5: Implement the handlers**

Create `api/internal/http/units.go`:

```go
package http

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/domain/unit"
	"github.com/sahel/api/internal/store/postgres/db"
)

var allowedSorts = map[string]bool{
	"sea_distance_asc": true,
	"bedrooms_desc":    true,
	"created_desc":     true,
}

func (s *Server) searchUnits(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	q := r.URL.Query()
	page, size := parsePagination(q)

	params := db.SearchUnitsParams{
		Limit:   int32(size),
		Offset:  int32((page - 1) * size),
		SortKey: normSort(q.Get("sort")),
	}
	if v := q.Get("area"); v != "" {
		params.AreaSlug = &v
	}
	if v := q.Get("compound"); v != "" {
		params.CompoundSlug = &v
	}
	if v := q.Get("type"); v != "" {
		if _, err := unit.ParseType(v); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_param", "type: "+err.Error())
			return
		}
		params.UnitType = db.NullUnitTypeEnum{UnitTypeEnum: db.UnitTypeEnum(v), Valid: true}
	}
	if v := q.Get("view"); v != "" {
		if _, err := unit.ParseView(v); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_param", "view: "+err.Error())
			return
		}
		params.UnitView = db.NullUnitViewEnum{UnitViewEnum: db.UnitViewEnum(v), Valid: true}
	}
	if n, ok := atoiOpt(q.Get("guests")); ok {
		params.Guests = &n
	}
	if n, ok := atoiOpt(q.Get("bedrooms")); ok {
		params.Bedrooms = &n
	}
	if n, ok := atoiOpt(q.Get("maxSeaDistance")); ok {
		params.MaxSeaDistance = &n
	}

	items, err := s.queries.SearchUnits(ctx, params)
	if err != nil {
		s.log.Error().Err(err).Msg("search units")
		writeError(w, http.StatusInternalServerError, "internal", "search failed")
		return
	}

	total, err := s.queries.CountSearchUnits(ctx, db.CountSearchUnitsParams{
		AreaSlug:       params.AreaSlug,
		CompoundSlug:   params.CompoundSlug,
		UnitType:       params.UnitType,
		UnitView:       params.UnitView,
		Guests:         params.Guests,
		Bedrooms:       params.Bedrooms,
		MaxSeaDistance: params.MaxSeaDistance,
	})
	if err != nil {
		s.log.Error().Err(err).Msg("count units")
		writeError(w, http.StatusInternalServerError, "internal", "count failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"page":  page,
		"size":  size,
		"total": total,
	})
}

func (s *Server) getUnit(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	u, err := s.queries.GetPublicUnitBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "unit not found")
			return
		}
		s.log.Error().Err(err).Msg("get unit")
		writeError(w, http.StatusInternalServerError, "internal", "get unit failed")
		return
	}
	images, err := s.queries.ListImagesByUnitID(ctx, u.ID)
	if err != nil {
		s.log.Error().Err(err).Msg("list unit images")
		writeError(w, http.StatusInternalServerError, "internal", "images failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":              u.ID,
		"slug":            u.Slug,
		"title_ar":        u.TitleAr,
		"title_en":        u.TitleEn,
		"description_ar":  u.DescriptionAr,
		"description_en":  u.DescriptionEn,
		"house_rules_ar":  u.HouseRulesAr,
		"house_rules_en":  u.HouseRulesEn,
		"type":            u.Type,
		"bedrooms":        u.Bedrooms,
		"bathrooms":       u.Bathrooms,
		"base_guests":     u.BaseGuests,
		"max_guests":      u.MaxGuests,
		"area_sqm":        u.AreaSqm,
		"floor":           u.Floor,
		"sea_distance_m":  u.SeaDistanceM,
		"view":            u.View,
		"row_number":      u.RowNumber,
		"amenities":       u.Amenities,
		"lat":             u.Lat,
		"lng":             u.Lng,
		"status":          u.Status,
		// deliberate: no exact_address
		"compound": map[string]any{
			"id":      u.CompoundIDOut,
			"slug":    u.CompoundSlug,
			"name_ar": u.CompoundNameAr,
			"name_en": u.CompoundNameEn,
		},
		"area": map[string]any{
			"id":      u.AreaID,
			"slug":    u.AreaSlug,
			"name_ar": u.AreaNameAr,
			"name_en": u.AreaNameEn,
		},
		"images":     images,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	})
}

func normSort(s string) string {
	if allowedSorts[s] {
		return s
	}
	return "created_desc"
}

func atoiOpt(s string) (int32, bool) {
	if s == "" {
		return 0, false
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return 0, false
	}
	return int32(n), true
}
```

Note on generated names: `NullUnitTypeEnum` / `UnitTypeEnum` are sqlc conventions. If the generator emits different names (e.g. `NullUnitType`), adjust the field names to match. Check `api/internal/store/postgres/db/models.go` after regeneration.

- [ ] **Step 6: Register the routes**

Append inside `registerCatalogRoutes` in `router.go`:

```go
r.Get("/units", s.searchUnits)
r.Get("/units/{slug}", s.getUnit)
```

- [ ] **Step 7: Run tests**

Run: `go test ./internal/http/... -v -run TestSearchUnits\|TestGetUnit`
Expected: PASS. If the sort-by-sea-distance test flakes, verify `ORDER BY ... NULLS LAST` is present in the query.

- [ ] **Step 8: Commit**

```bash
git add api/internal/store/postgres/queries/units.sql api/internal/store/postgres/db/ \
        api/internal/http/units.go api/internal/http/units_test.go \
        api/internal/http/router.go
git commit -m "feat(catalog): public GET /units search + /units/:slug detail"
```

---

## Task 8 — Whole-suite green + smoke test

- [ ] **Step 1: Full test suite**

Run:
```powershell
docker run --rm -e TESTCONTAINERS_RYUK_DISABLED=true -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal --add-host=host.docker.internal:host-gateway -v /var/run/docker.sock:/var/run/docker.sock -v D:/Projects/sahel/sahel:/src -w /src/api golang:1.23-alpine sh -c 'go test ./...'
```
Expected: every package `ok`, no `FAIL`.

- [ ] **Step 2: Boot the real API and curl it**

Run:
```powershell
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
docker compose -f infra/docker-compose.yml --env-file .env run --rm api sh -c 'go run github.com/pressly/goose/v3/cmd/goose@v3.24.1 -dir /migrations postgres "$DATABASE_URL" up'
```

Then insert one row set for a manual check:

```powershell
docker compose -f infra/docker-compose.yml --env-file .env exec postgres psql -U sahel -d sahel -c "
INSERT INTO areas (slug, name_ar, name_en, region) VALUES ('nc','ن','North','north_coast');
INSERT INTO owners (name, phone) VALUES ('O','0');
INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
SELECT id, 'hac','ه','Hacienda','د','D','sea' FROM areas WHERE slug='nc';
WITH o AS (SELECT id FROM owners LIMIT 1), c AS (SELECT id FROM compounds WHERE slug='hac')
INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
                   type, bedrooms, bathrooms, base_guests, max_guests, sea_distance_m, view, status)
VALUES ((SELECT id FROM o), (SELECT id FROM c), 'u1','ت','U1','د','D','chalet',2,1,4,6,100,'sea','active');
"
```

Then hit the endpoints:

```powershell
curl http://localhost:8090/api/v1/areas
curl http://localhost:8090/api/v1/areas/nc
curl "http://localhost:8090/api/v1/compounds?area=nc"
curl http://localhost:8090/api/v1/compounds/hac
curl http://localhost:8090/api/v1/units
curl http://localhost:8090/api/v1/units/u1
```

Expected: every call returns 200 with valid JSON. `/api/v1/units/u1` must NOT contain the string `exact_address`.

- [ ] **Step 3: `git status` clean**

Run: `git status`
Expected: no uncommitted changes on tracked files (`.env.example` may still be dirty from Phase 2a — unrelated).

---

## Done criteria for Phase 2b

- Six public endpoints wired: `GET /areas`, `/areas/:slug`, `/compounds`, `/compounds/:slug`, `/units`, `/units/:slug`.
- Every endpoint returns the spec's JSON envelope on success and the `{error:{code,message}}` envelope on failure.
- Search accepts all §3.2 filters, all three sort options, and pagination with size clamped to 60.
- Public unit payload never contains `exact_address`.
- Only `active` units are visible to public callers; other statuses 404 from `/units/:slug` and are absent from `/units` search and `/compounds/:slug` unit lists.
- `go test ./...` passes on a Docker-enabled machine; skips cleanly without.
- No admin routes, no auth, no writes — those land in Phase 2c.
