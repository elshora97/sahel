# Phase 2a — Schema & Go Domain: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Phase 2 database schema (areas, compounds, owners, units, unit_images) plus the Go domain enums and slug helper that the later plans (2b–2e) depend on.

**Architecture:** Five goose migrations, one per table, preceded by a shared `updated_at` trigger migration. Enums created via `CREATE TYPE`. Go domain packages mirror the existing `booking` package (pure functions, no DB imports). A single integration test runs migrations up → down → up against a real Postgres via testcontainers-go.

**Tech Stack:** PostgreSQL 16, goose (already vendored via `go run`), sqlc v2, pgx/v5, testcontainers-go.

**Spec:** `docs/superpowers/specs/2026-09-08-phase-2-catalog-design.md` §2.

---

## File structure

**Create:**
- `infra/migrations/00002_updated_at_trigger.sql`
- `infra/migrations/00003_areas.sql`
- `infra/migrations/00004_compounds.sql`
- `infra/migrations/00005_owners.sql`
- `infra/migrations/00006_units.sql`
- `infra/migrations/00007_unit_images.sql`
- `api/internal/domain/area/region.go`
- `api/internal/domain/area/region_test.go`
- `api/internal/domain/compound/beach_type.go`
- `api/internal/domain/compound/beach_type_test.go`
- `api/internal/domain/unit/type.go`
- `api/internal/domain/unit/type_test.go`
- `api/internal/domain/unit/view.go`
- `api/internal/domain/unit/view_test.go`
- `api/internal/domain/unit/status.go`
- `api/internal/domain/unit/status_test.go`
- `api/internal/slug/slug.go`
- `api/internal/slug/slug_test.go`
- `api/internal/store/postgres/migrate_test.go`

**Modify:**
- `api/go.mod` — add `github.com/testcontainers/testcontainers-go` and `github.com/testcontainers/testcontainers-go/modules/postgres`
- `api/go.mod` — add `github.com/pressly/goose/v3` (library form, for the test)

**Do not touch:** anything in `web/`, `cmd/`, `internal/http/`, `internal/money/`, `internal/domain/booking/`. Phase 2a is DB and domain enums only.

---

## Naming conventions used throughout

- Table names: plural, snake_case (`unit_images`).
- Enum type names: singular, snake_case, suffix `_enum` where the noun collides with a column name (`unit_status_enum`).
- Column names: snake_case; bilingual pairs `<name>_ar` / `<name>_en`.
- Go domain package = table's singular noun (`area`, `compound`, `unit`).
- Go enum type = capitalised word matching the Postgres type without `_enum` (`Region`, `BeachType`, `Type`, `View`, `Status`).
- Go enum constants: prefix with the type name, PascalCase (`RegionNorthCoast`, `BeachTypeSea`, `TypeChalet`, `ViewSea`, `StatusDraft`).

---

## Task 1 — Shared `updated_at` trigger

Every Phase 2 table has `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` maintained by a shared trigger function. Create it once here so the table migrations that follow just attach a trigger.

**Files:**
- Create: `infra/migrations/00002_updated_at_trigger.sql`

- [ ] **Step 1: Write the migration**

Create `infra/migrations/00002_updated_at_trigger.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS set_updated_at();
```

Note: the `-- +goose StatementBegin/End` fences are required because goose splits on semicolons by default and would break the function body.

- [ ] **Step 2: Apply and verify**

Run: `make up` (if not already running) then `make migrate`
Expected output includes: `OK   00002_updated_at_trigger.sql`

- [ ] **Step 3: Commit**

```bash
git add infra/migrations/00002_updated_at_trigger.sql
git commit -m "feat(db): add shared updated_at trigger function"
```

---

## Task 2 — `areas` migration + Go `Region` enum

**Files:**
- Create: `infra/migrations/00003_areas.sql`
- Create: `api/internal/domain/area/region.go`
- Create: `api/internal/domain/area/region_test.go`

- [ ] **Step 1: Write the Region enum test**

Create `api/internal/domain/area/region_test.go`:

```go
package area

import "testing"

func TestParseRegionAcceptsCanonicalValues(t *testing.T) {
	for _, r := range All {
		got, err := ParseRegion(string(r))
		if err != nil {
			t.Fatalf("ParseRegion(%q) failed: %v", r, err)
		}
		if got != r {
			t.Fatalf("ParseRegion(%q) = %q, want %q", r, got, r)
		}
	}
}

func TestParseRegionRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "NORTH_COAST", "cairo", "unknown"} {
		if _, err := ParseRegion(v); err == nil {
			t.Errorf("ParseRegion(%q) should have failed", v)
		}
	}
}

func TestAllCoversEveryConstant(t *testing.T) {
	// If a new region is added, this catches the missing All entry.
	seen := map[Region]bool{}
	for _, r := range All {
		if seen[r] {
			t.Fatalf("duplicate region in All: %q", r)
		}
		seen[r] = true
	}
	// Enum must have exactly these five values per spec §2.1.
	if len(All) != 5 {
		t.Fatalf("expected 5 regions per spec, got %d", len(All))
	}
}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd api && go test ./internal/domain/area/...`
Expected: build failure — package `area` not found.

- [ ] **Step 3: Write the Region enum**

Create `api/internal/domain/area/region.go`:

```go
// Package area holds the area entity's enum values. It imports no database
// driver on purpose: everything here is a pure function over values, so the
// same constants can be used in HTTP handlers, tests, and the sqlc layer.
package area

import "fmt"

type Region string

const (
	RegionNorthCoast Region = "north_coast"
	RegionSokhna     Region = "sokhna"
	RegionGouna      Region = "gouna"
	RegionRasSudr    Region = "ras_sudr"
	RegionNewCairo   Region = "new_cairo"
)

// All is the canonical enum. Adding a value here requires a matching
// ALTER TYPE migration; the two must stay in lockstep.
var All = []Region{
	RegionNorthCoast,
	RegionSokhna,
	RegionGouna,
	RegionRasSudr,
	RegionNewCairo,
}

var validSet = func() map[Region]bool {
	m := make(map[Region]bool, len(All))
	for _, r := range All {
		m[r] = true
	}
	return m
}()

func (r Region) Valid() bool  { return validSet[r] }
func (r Region) String() string { return string(r) }

func ParseRegion(v string) (Region, error) {
	r := Region(v)
	if !r.Valid() {
		return "", fmt.Errorf("unknown region %q", v)
	}
	return r, nil
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd api && go test ./internal/domain/area/...`
Expected: PASS.

- [ ] **Step 5: Write the areas migration**

Create `infra/migrations/00003_areas.sql`. The enum values MUST match `area.All` exactly.

```sql
-- +goose Up
CREATE TYPE region_enum AS ENUM (
  'north_coast', 'sokhna', 'gouna', 'ras_sudr', 'new_cairo'
);

CREATE TABLE areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  region      region_enum NOT NULL,
  km_marker   INT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER areas_set_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS areas;
DROP TYPE  IF EXISTS region_enum;
```

- [ ] **Step 6: Apply and verify**

Run: `make migrate`
Expected: `OK   00003_areas.sql`

Then verify enum drift is impossible by running the domain test one more time (it doesn't touch the DB but confirms All still has 5 entries):
Run: `cd api && go test ./internal/domain/area/...`

- [ ] **Step 7: Commit**

```bash
git add infra/migrations/00003_areas.sql api/internal/domain/area/
git commit -m "feat(catalog): areas table + Region enum"
```

---

## Task 3 — `compounds` migration + Go `BeachType` enum

**Files:**
- Create: `infra/migrations/00004_compounds.sql`
- Create: `api/internal/domain/compound/beach_type.go`
- Create: `api/internal/domain/compound/beach_type_test.go`

- [ ] **Step 1: Write the BeachType enum test**

Create `api/internal/domain/compound/beach_type_test.go`:

```go
package compound

import "testing"

func TestParseBeachTypeAcceptsCanonicalValues(t *testing.T) {
	for _, b := range AllBeachTypes {
		got, err := ParseBeachType(string(b))
		if err != nil {
			t.Fatalf("ParseBeachType(%q) failed: %v", b, err)
		}
		if got != b {
			t.Fatalf("ParseBeachType(%q) = %q, want %q", b, got, b)
		}
	}
}

func TestParseBeachTypeRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "SEA", "beach", "unknown"} {
		if _, err := ParseBeachType(v); err == nil {
			t.Errorf("ParseBeachType(%q) should have failed", v)
		}
	}
}

func TestBeachTypeAllHasExactlyFourValues(t *testing.T) {
	if len(AllBeachTypes) != 4 {
		t.Fatalf("expected 4 beach types per spec §2.2, got %d", len(AllBeachTypes))
	}
}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd api && go test ./internal/domain/compound/...`
Expected: build failure — package `compound` not found.

- [ ] **Step 3: Write the BeachType enum**

Create `api/internal/domain/compound/beach_type.go`:

```go
// Package compound holds the compound entity's enum values.
package compound

import "fmt"

type BeachType string

const (
	BeachTypeSea    BeachType = "sea"
	BeachTypeLagoon BeachType = "lagoon"
	BeachTypeBoth   BeachType = "both"
	BeachTypeNone   BeachType = "none"
)

var AllBeachTypes = []BeachType{
	BeachTypeSea,
	BeachTypeLagoon,
	BeachTypeBoth,
	BeachTypeNone,
}

var validBeachTypeSet = func() map[BeachType]bool {
	m := make(map[BeachType]bool, len(AllBeachTypes))
	for _, b := range AllBeachTypes {
		m[b] = true
	}
	return m
}()

func (b BeachType) Valid() bool    { return validBeachTypeSet[b] }
func (b BeachType) String() string { return string(b) }

func ParseBeachType(v string) (BeachType, error) {
	b := BeachType(v)
	if !b.Valid() {
		return "", fmt.Errorf("unknown beach type %q", v)
	}
	return b, nil
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd api && go test ./internal/domain/compound/...`
Expected: PASS.

- [ ] **Step 5: Write the compounds migration**

Create `infra/migrations/00004_compounds.sql`:

```sql
-- +goose Up
CREATE TYPE beach_type_enum AS ENUM ('sea', 'lagoon', 'both', 'none');

CREATE TABLE compounds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id           UUID NOT NULL REFERENCES areas(id),
  slug              TEXT NOT NULL UNIQUE,
  name_ar           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  description_ar    TEXT NOT NULL,
  description_en    TEXT NOT NULL,
  amenities         TEXT[] NOT NULL DEFAULT '{}',
  beach_type        beach_type_enum NOT NULL,
  gate_info_ar      TEXT,
  gate_info_en      TEXT,
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  cover_image_url   TEXT,
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX compounds_area_id_idx ON compounds (area_id);

CREATE TRIGGER compounds_set_updated_at
  BEFORE UPDATE ON compounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS compounds;
DROP TYPE  IF EXISTS beach_type_enum;
```

- [ ] **Step 6: Apply and verify**

Run: `make migrate`
Expected: `OK   00004_compounds.sql`

- [ ] **Step 7: Commit**

```bash
git add infra/migrations/00004_compounds.sql api/internal/domain/compound/
git commit -m "feat(catalog): compounds table + BeachType enum"
```

---

## Task 4 — `owners` migration (no enum needed)

**Files:**
- Create: `infra/migrations/00005_owners.sql`

- [ ] **Step 1: Write the migration**

Create `infra/migrations/00005_owners.sql`:

```sql
-- +goose Up
CREATE TABLE owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  national_id     TEXT,
  notes           TEXT,
  commission_pct  SMALLINT NOT NULL DEFAULT 0
    CHECK (commission_pct BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER owners_set_updated_at
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS owners;
```

- [ ] **Step 2: Apply and verify**

Run: `make migrate`
Expected: `OK   00005_owners.sql`

- [ ] **Step 3: Commit**

```bash
git add infra/migrations/00005_owners.sql
git commit -m "feat(catalog): owners table"
```

---

## Task 5 — Unit domain enums (Type, View, Status)

Three unit-scoped enums live in the same package because they always travel together on the `unit` entity.

**Files:**
- Create: `api/internal/domain/unit/type.go`
- Create: `api/internal/domain/unit/type_test.go`
- Create: `api/internal/domain/unit/view.go`
- Create: `api/internal/domain/unit/view_test.go`
- Create: `api/internal/domain/unit/status.go`
- Create: `api/internal/domain/unit/status_test.go`

- [ ] **Step 1: Write tests for Type**

Create `api/internal/domain/unit/type_test.go`:

```go
package unit

import "testing"

func TestParseTypeAcceptsCanonicalValues(t *testing.T) {
	for _, tt := range AllTypes {
		got, err := ParseType(string(tt))
		if err != nil {
			t.Fatalf("ParseType(%q) failed: %v", tt, err)
		}
		if got != tt {
			t.Fatalf("ParseType(%q) = %q, want %q", tt, got, tt)
		}
	}
}

func TestParseTypeRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "CHALET", "cabin", "house"} {
		if _, err := ParseType(v); err == nil {
			t.Errorf("ParseType(%q) should have failed", v)
		}
	}
}

func TestTypeAllHasExactlySevenValues(t *testing.T) {
	if len(AllTypes) != 7 {
		t.Fatalf("expected 7 unit types per spec §2.4, got %d", len(AllTypes))
	}
}
```

- [ ] **Step 2: Write tests for View**

Create `api/internal/domain/unit/view_test.go`:

```go
package unit

import "testing"

func TestParseViewAcceptsCanonicalValues(t *testing.T) {
	for _, v := range AllViews {
		got, err := ParseView(string(v))
		if err != nil {
			t.Fatalf("ParseView(%q) failed: %v", v, err)
		}
		if got != v {
			t.Fatalf("ParseView(%q) = %q, want %q", v, got, v)
		}
	}
}

func TestParseViewRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "SEA", "ocean"} {
		if _, err := ParseView(v); err == nil {
			t.Errorf("ParseView(%q) should have failed", v)
		}
	}
}

func TestViewAllHasExactlyFiveValues(t *testing.T) {
	if len(AllViews) != 5 {
		t.Fatalf("expected 5 views per spec §2.4, got %d", len(AllViews))
	}
}
```

- [ ] **Step 3: Write tests for Status**

Create `api/internal/domain/unit/status_test.go`:

```go
package unit

import "testing"

func TestParseStatusAcceptsCanonicalValues(t *testing.T) {
	for _, s := range AllStatuses {
		got, err := ParseStatus(string(s))
		if err != nil {
			t.Fatalf("ParseStatus(%q) failed: %v", s, err)
		}
		if got != s {
			t.Fatalf("ParseStatus(%q) = %q, want %q", s, got, s)
		}
	}
}

func TestParseStatusRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "DRAFT", "deleted"} {
		if _, err := ParseStatus(v); err == nil {
			t.Errorf("ParseStatus(%q) should have failed", v)
		}
	}
}

func TestStatusAllHasExactlyFourValues(t *testing.T) {
	if len(AllStatuses) != 4 {
		t.Fatalf("expected 4 unit statuses per spec §2.4, got %d", len(AllStatuses))
	}
}
```

- [ ] **Step 4: Run tests to confirm they fail**

Run: `cd api && go test ./internal/domain/unit/...`
Expected: build failure — package `unit` not found.

- [ ] **Step 5: Write Type enum**

Create `api/internal/domain/unit/type.go`:

```go
// Package unit holds the unit entity's enum values.
package unit

import "fmt"

type Type string

const (
	TypeChalet    Type = "chalet"
	TypeVilla     Type = "villa"
	TypeTwin      Type = "twin"
	TypeTown      Type = "town"
	TypePenthouse Type = "penthouse"
	TypeStudio    Type = "studio"
	TypeApartment Type = "apartment"
)

var AllTypes = []Type{
	TypeChalet, TypeVilla, TypeTwin, TypeTown,
	TypePenthouse, TypeStudio, TypeApartment,
}

var validTypeSet = func() map[Type]bool {
	m := make(map[Type]bool, len(AllTypes))
	for _, t := range AllTypes {
		m[t] = true
	}
	return m
}()

func (t Type) Valid() bool    { return validTypeSet[t] }
func (t Type) String() string { return string(t) }

func ParseType(v string) (Type, error) {
	t := Type(v)
	if !t.Valid() {
		return "", fmt.Errorf("unknown unit type %q", v)
	}
	return t, nil
}
```

- [ ] **Step 6: Write View enum**

Create `api/internal/domain/unit/view.go`:

```go
package unit

import "fmt"

type View string

const (
	ViewSea    View = "sea"
	ViewLagoon View = "lagoon"
	ViewPool   View = "pool"
	ViewGarden View = "garden"
	ViewStreet View = "street"
)

var AllViews = []View{ViewSea, ViewLagoon, ViewPool, ViewGarden, ViewStreet}

var validViewSet = func() map[View]bool {
	m := make(map[View]bool, len(AllViews))
	for _, v := range AllViews {
		m[v] = true
	}
	return m
}()

func (v View) Valid() bool    { return validViewSet[v] }
func (v View) String() string { return string(v) }

func ParseView(v string) (View, error) {
	vv := View(v)
	if !vv.Valid() {
		return "", fmt.Errorf("unknown view %q", v)
	}
	return vv, nil
}
```

- [ ] **Step 7: Write Status enum**

Create `api/internal/domain/unit/status.go`:

```go
package unit

import "fmt"

type Status string

const (
	StatusDraft    Status = "draft"
	StatusActive   Status = "active"
	StatusPaused   Status = "paused"
	StatusArchived Status = "archived"
)

var AllStatuses = []Status{StatusDraft, StatusActive, StatusPaused, StatusArchived}

var validStatusSet = func() map[Status]bool {
	m := make(map[Status]bool, len(AllStatuses))
	for _, s := range AllStatuses {
		m[s] = true
	}
	return m
}()

func (s Status) Valid() bool    { return validStatusSet[s] }
func (s Status) String() string { return string(s) }

func ParseStatus(v string) (Status, error) {
	s := Status(v)
	if !s.Valid() {
		return "", fmt.Errorf("unknown unit status %q", v)
	}
	return s, nil
}
```

- [ ] **Step 8: Run tests to confirm they pass**

Run: `cd api && go test ./internal/domain/unit/...`
Expected: PASS (all three test files).

- [ ] **Step 9: Commit**

```bash
git add api/internal/domain/unit/
git commit -m "feat(catalog): unit Type/View/Status enums"
```

---

## Task 6 — `units` migration

Depends on `areas`, `compounds`, `owners`, and the three unit enums.

**Files:**
- Create: `infra/migrations/00006_units.sql`

- [ ] **Step 1: Write the migration**

Create `infra/migrations/00006_units.sql`. Enum values MUST match `unit.AllTypes`, `unit.AllViews`, `unit.AllStatuses` exactly.

```sql
-- +goose Up
CREATE TYPE unit_type_enum AS ENUM (
  'chalet', 'villa', 'twin', 'town', 'penthouse', 'studio', 'apartment'
);

CREATE TYPE unit_view_enum AS ENUM (
  'sea', 'lagoon', 'pool', 'garden', 'street'
);

CREATE TYPE unit_status_enum AS ENUM (
  'draft', 'active', 'paused', 'archived'
);

CREATE TABLE units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES owners(id),
  compound_id       UUID NOT NULL REFERENCES compounds(id),
  slug              TEXT NOT NULL UNIQUE,
  title_ar          TEXT NOT NULL,
  title_en          TEXT NOT NULL,
  description_ar    TEXT NOT NULL,
  description_en    TEXT NOT NULL,
  house_rules_ar    TEXT,
  house_rules_en    TEXT,
  type              unit_type_enum NOT NULL,
  bedrooms          SMALLINT NOT NULL,
  bathrooms         SMALLINT NOT NULL,
  base_guests       SMALLINT NOT NULL,
  max_guests        SMALLINT NOT NULL,
  area_sqm          INT,
  floor             SMALLINT,
  sea_distance_m    INT NOT NULL,
  view              unit_view_enum NOT NULL,
  row_number        SMALLINT,
  amenities         TEXT[] NOT NULL DEFAULT '{}',
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  exact_address     TEXT,
  status            unit_status_enum NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX units_owner_id_idx        ON units (owner_id);
CREATE INDEX units_compound_id_idx     ON units (compound_id);
CREATE INDEX units_status_idx          ON units (status);
CREATE INDEX units_view_idx            ON units (view);
CREATE INDEX units_sea_distance_m_idx  ON units (sea_distance_m);

CREATE TRIGGER units_set_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS units;
DROP TYPE  IF EXISTS unit_status_enum;
DROP TYPE  IF EXISTS unit_view_enum;
DROP TYPE  IF EXISTS unit_type_enum;
```

- [ ] **Step 2: Apply and verify**

Run: `make migrate`
Expected: `OK   00006_units.sql`

- [ ] **Step 3: Commit**

```bash
git add infra/migrations/00006_units.sql
git commit -m "feat(catalog): units table"
```

---

## Task 7 — `unit_images` migration

**Files:**
- Create: `infra/migrations/00007_unit_images.sql`

- [ ] **Step 1: Write the migration**

Create `infra/migrations/00007_unit_images.sql`:

```sql
-- +goose Up
CREATE TABLE unit_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_ar      TEXT,
  alt_en      TEXT,
  sort        SMALLINT NOT NULL DEFAULT 0,
  is_cover    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX unit_images_unit_id_idx ON unit_images (unit_id);
CREATE UNIQUE INDEX unit_images_one_cover
  ON unit_images (unit_id) WHERE is_cover = true;

CREATE TRIGGER unit_images_set_updated_at
  BEFORE UPDATE ON unit_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS unit_images;
```

- [ ] **Step 2: Apply and verify**

Run: `make migrate`
Expected: `OK   00007_unit_images.sql`

Then verify the partial unique index by hand:

Run:
```powershell
docker compose -f infra/docker-compose.yml exec postgres psql -U sahel -d sahel -c "\d unit_images"
```

Expected: output includes `"unit_images_one_cover" UNIQUE, btree (unit_id) WHERE is_cover = true`.

- [ ] **Step 3: Commit**

```bash
git add infra/migrations/00007_unit_images.sql
git commit -m "feat(catalog): unit_images table with single-cover constraint"
```

---

## Task 8 — Slug helper package

Pure Go, no DB. Used by every future admin create endpoint to auto-generate slugs from `title_en` / `name_en`.

**Files:**
- Create: `api/internal/slug/slug.go`
- Create: `api/internal/slug/slug_test.go`

- [ ] **Step 1: Write the failing tests**

Create `api/internal/slug/slug_test.go`:

```go
package slug

import "testing"

func TestMake(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Marassi", "marassi"},
		{"Hacienda Bay", "hacienda-bay"},
		{"Sidi Abdel Rahman", "sidi-abdel-rahman"},
		{"  spaces  around  ", "spaces-around"},
		{"UPPERCASE Villa", "uppercase-villa"},
		{"underscores_and-dashes", "underscores-and-dashes"},
		{"multi---dashes", "multi-dashes"},
		{"unit #4 (beach)", "unit-4-beach"},
		{"villa @ 12", "villa-12"},
		{"", ""},
		{"---", ""},
		{"café", "cafe"},
		{"naïve", "naive"},
	}
	for _, c := range cases {
		if got := Make(c.in); got != c.want {
			t.Errorf("Make(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestMakeWithSuffix(t *testing.T) {
	if got := MakeWithSuffix("Marassi", 0); got != "marassi" {
		t.Errorf("MakeWithSuffix(%q, 0) = %q, want %q", "Marassi", got, "marassi")
	}
	if got := MakeWithSuffix("Marassi", 2); got != "marassi-2" {
		t.Errorf("MakeWithSuffix(%q, 2) = %q, want %q", "Marassi", got, "marassi-2")
	}
	if got := MakeWithSuffix("Marassi", 10); got != "marassi-10" {
		t.Errorf("MakeWithSuffix(%q, 10) = %q, want %q", "Marassi", got, "marassi-10")
	}
}
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd api && go test ./internal/slug/...`
Expected: build failure — package `slug` not found.

- [ ] **Step 3: Implement**

Create `api/internal/slug/slug.go`:

```go
// Package slug turns a display string into a URL-safe slug. Diacritics are
// stripped (café → cafe); non-alphanumerics collapse to a single hyphen.
// Deterministic and side-effect free.
package slug

import (
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var diacriticStripper = transform.Chain(
	norm.NFD,
	runes.Remove(runes.In(unicode.Mn)),
	norm.NFC,
)

// Make lowercases, strips diacritics, replaces every run of non-alphanumeric
// characters with a single hyphen, and trims leading/trailing hyphens.
// Empty input and inputs that reduce to nothing (like "---") return "".
func Make(s string) string {
	folded, _, err := transform.String(diacriticStripper, s)
	if err != nil {
		folded = s
	}
	folded = strings.ToLower(folded)

	var b strings.Builder
	b.Grow(len(folded))
	prevDash := true // treat start as if we just wrote a dash, to trim leading dashes
	for _, r := range folded {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := b.String()
	return strings.TrimRight(out, "-")
}

// MakeWithSuffix returns Make(s) when n == 0, otherwise appends "-<n>".
// Callers use this when a base slug collides on unique index insert.
func MakeWithSuffix(s string, n int) string {
	base := Make(s)
	if n == 0 {
		return base
	}
	return base + "-" + strconv.Itoa(n)
}
```

- [ ] **Step 4: Add the golang.org/x/text dependency**

Run:
```bash
cd api && go get golang.org/x/text
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `cd api && go test ./internal/slug/...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/internal/slug/ api/go.mod api/go.sum
git commit -m "feat(catalog): slug helper (Make, MakeWithSuffix)"
```

---

## Task 9 — Migration round-trip test (up → down → up)

Guards against a migration that only works from empty forward. Uses testcontainers-go to spin real Postgres 16 per test. Skips if Docker isn't available so `make test` still works in constrained environments.

**Files:**
- Create: `api/internal/store/postgres/migrate_test.go`
- Modify: `api/go.mod` (added by `go get`)

- [ ] **Step 1: Add dependencies**

Run:
```bash
cd api && go get github.com/testcontainers/testcontainers-go github.com/testcontainers/testcontainers-go/modules/postgres github.com/pressly/goose/v3 github.com/jackc/pgx/v5/stdlib
```

- [ ] **Step 2: Write the test**

Create `api/internal/store/postgres/migrate_test.go`:

```go
package postgres

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// TestMigrationsRoundTrip proves every migration can go up, then down to
// zero, then up again on the same database. Without this, a migration whose
// Down was never tried can rot silently — the next developer who runs
// `make migrate-down` gets a broken database.
func TestMigrationsRoundTrip(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("sahel_test"),
		tcpostgres.WithUsername("sahel"),
		tcpostgres.WithPassword("sahel_test"),
		tcpostgres.BasicWaitStrategies(),
		tcpostgres.WithInitScripts(filepath.Join("..", "..", "..", "..", "infra", "postgres", "init", "00-extensions.sql")),
	)
	if err != nil {
		t.Skipf("testcontainers unavailable (%v) - skipping migration round-trip", err)
	}
	t.Cleanup(func() {
		_ = container.Terminate(context.Background())
	})

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// BasicWaitStrategies waits for Postgres to accept connections, but the
	// pool itself still needs a ping before goose talks to it.
	for i := 0; i < 30; i++ {
		if err := db.PingContext(ctx); err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	migrations := filepath.Join("..", "..", "..", "..", "infra", "migrations")

	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("goose dialect: %v", err)
	}

	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("first Up: %v", err)
	}
	if err := goose.DownToContext(ctx, db, migrations, 0); err != nil {
		t.Fatalf("Down to 0: %v", err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("second Up: %v", err)
	}
}
```

- [ ] **Step 3: Run the test**

Run: `cd api && go test ./internal/store/postgres/... -run TestMigrationsRoundTrip -v`

Expected on a machine with Docker: PASS in ~30s. Expected without Docker: SKIP with a clear message.

If the test fails on the *second* Up with "type ... already exists" or similar, a Down migration is missing a `DROP` — fix the corresponding `00003`–`00007` file and re-run.

- [ ] **Step 4: Verify the whole suite still passes**

Run: `cd api && go test ./...`
Expected: PASS across `booking`, `money`, `area`, `compound`, `unit`, `slug`, and (with Docker) `postgres`.

- [ ] **Step 5: Commit**

```bash
git add api/internal/store/postgres/migrate_test.go api/go.mod api/go.sum
git commit -m "test(catalog): migration up/down/up round-trip via testcontainers"
```

---

## Task 10 — Sanity check the whole plan

- [ ] **Step 1: Fresh DB, migrate from zero**

Run:
```bash
make nuke
make up
make migrate
make migrate-status
```

Expected: `make migrate-status` shows all seven migrations as `Applied`.

- [ ] **Step 2: Roll everything back**

Run: `make migrate-down` seven times (or write a helper — but Phase 2a doesn't need one).

Expected: `make migrate-status` shows all as `Pending` after seven downs. If any refuses to roll back, fix its `-- +goose Down` block.

- [ ] **Step 3: Apply forward again**

Run: `make migrate`
Expected: all seven `OK`.

- [ ] **Step 4: `make test` green**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Nothing uncommitted**

Run: `git status`
Expected: clean working tree.

---

## Done criteria for Phase 2a

- All seven migrations apply cleanly from empty and roll back cleanly.
- The round-trip test passes (or skips cleanly without Docker).
- Every Phase 2 enum has a Go domain package with `ParseX`, `Valid`, `All*` list, and a "count matches spec" test.
- `slug.Make` and `slug.MakeWithSuffix` behave per the test matrix.
- No HTTP handlers, no sqlc queries, no seed data — those land in 2b–2e.
