# Phase 2c — Admin API: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the password-gated admin API (`/api/v1/admin/*`): CRUD for areas, compounds, owners, and units, unit-image upload to MinIO, and `GET /admin/enums`. This is everything the Phase 2d admin UI calls.

**Architecture:** Same shape as Phase 2b. sqlc queries (prefixed `Admin…`) are called directly from chi handlers in `internal/http`, with no service layer. POST and PATCH share one input struct per entity, built from a generic `field[T]` that separates "absent" from "explicit null". Create starts from a zero row and applies the input; PATCH loads the row, applies the input, and writes every column back. Both paths go through one validation function per entity. Object storage sits behind a two-method `storage.ObjectStore` interface: a MinIO implementation in production and a fake in handler tests.

**Tech Stack:** Go 1.23, chi/v5, pgx/v5, sqlc v1.27.0, minio-go v7.0.80, testcontainers-go v0.34.0 (postgres + minio modules), Postgres 16, MinIO.

**Spec:** `docs/superpowers/specs/2026-09-08-phase-2-catalog-design.md` §3 (esp. §3.3), §6, §7.1.

---

## Running Go

There's no Go on the host. Every `go …` command in this plan runs in the Go 1.23 container, with the repo mounted and the Docker socket passed through so testcontainers works. Define this once in Git Bash:

```bash
GO() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    -e TESTCONTAINERS_RYUK_DISABLED=true \
    -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
    -e GOFLAGS=-buildvcs=false -e GOTOOLCHAIN=local \
    --add-host=host.docker.internal:host-gateway \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v sahel-gomod:/go/pkg/mod -v sahel-gobuild:/root/.cache/go-build \
    -v D:/Projects/sahel/sahel:/src -w /src/api \
    golang:1.23-alpine sh -c "$1"
}
```

`GO 'go test ./internal/http/...'` then runs inside `api/`. sqlc: `GO 'go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 generate'`.

---

## File structure

**Create:**
- `api/internal/config/config_test.go`: required-env checks.
- `api/internal/storage/storage.go`: `ObjectStore` interface + MinIO/S3 implementation.
- `api/internal/storage/storage_test.go`: round-trip against a MinIO testcontainer.
- `api/internal/http/admin_input.go`: `field[T]`, `problems`, setters, validators, JSON decode.
- `api/internal/http/admin_input_test.go`
- `api/internal/http/ids.go`: UUID parse/format/generate.
- `api/internal/http/ids_test.go`
- `api/internal/http/admin_errors.go`: Postgres error → envelope mapping, delete/slug helpers, tx helper.
- `api/internal/http/admin_auth.go`: basic-auth middleware.
- `api/internal/http/admin_auth_test.go`
- `api/internal/http/admin_enums.go`
- `api/internal/http/admin_helpers_test.go`: fake store, request helpers, seed SQL.
- `api/internal/http/admin_areas.go`, `admin_areas_test.go`
- `api/internal/http/admin_compounds.go`, `admin_compounds_test.go`
- `api/internal/http/admin_owners.go`, `admin_owners_test.go`
- `api/internal/http/admin_units.go`, `admin_units_test.go`
- `api/internal/http/admin_images.go`, `admin_images_test.go`
- `api/internal/store/postgres/queries/admin_areas.sql`
- `api/internal/store/postgres/queries/admin_compounds.sql`
- `api/internal/store/postgres/queries/admin_owners.sql`
- `api/internal/store/postgres/queries/admin_units.sql`
- `api/internal/store/postgres/queries/admin_images.sql`

**Modify:**
- `api/internal/config/config.go`: `AdminPassword`, `S3PublicURL`; required-var checks.
- `api/internal/http/router.go`: `Option`/`WithAdmin`, new `Server` fields, `/admin` subtree.
- `api/cmd/api/main.go`: build the S3 store, pass `WithAdmin`.
- `infra/docker-compose.yml`: pass `ADMIN_PASSWORD` and `S3_PUBLIC_URL`; make the bucket publicly readable.
- `.env.example`: document the two new vars.
- `Makefile`: pin goose to `v3.24.1` (`@latest` needs Go 1.26 and breaks `make migrate`).
- `api/go.mod`, `api/go.sum`: add minio-go and the testcontainers minio module.

**Do not touch:** `web/`, `infra/migrations/`, `internal/domain/`, the public handlers from Phase 2b.

---

## Admin API conventions

- **Auth:** HTTP Basic on every `/api/v1/admin/*` route. The username is ignored; the password must equal `ADMIN_PASSWORD` (constant-time compare). A server built without `WithAdmin` rejects everything. Failure → `401` + `WWW-Authenticate: Basic realm="sahel-admin"` + `{"error":{"code":"unauthorized",…}}`.
- **IDs:** path `{id}` must be a UUID. A malformed UUID → `404 not_found` (the same as an unknown one).
- **Bodies:** JSON with `DisallowUnknownFields`, max 1 MB. Malformed or unknown keys → `400 invalid_json`.
- **Status codes:** POST → `201` + row. GET/PATCH → `200` + row. DELETE → `204`, no body.
- **Validation errors:** `422 validation_failed`. The message lists every problem, joined by `"; "`.
- **Slugs:** optional on create. If absent, derived with `slug.Make(name_en | title_en)`, and a collision retries with `-2`, `-3`, …. If supplied, it must already be canonical (`slug.Make(s) == s`), and a collision → `409 slug_taken`. PATCH never re-derives.
- **References:** unknown `area_id` / `owner_id` / `compound_id` → `422 invalid_reference`. Deleting an area, compound or owner that is still referenced → `409 in_use`.
- **Lists:** no pagination (spec §4.4). Every list takes an optional `?slug=` exact match, which the admin UI uses for its on-blur uniqueness check.
- **Nullable text:** a blank string is stored as NULL. Amenities are trimmed, de-duplicated, and blanks dropped; the stored array is never NULL.

---

## Task 1 — Config, compose, Makefile

**Files:**
- Create: `api/internal/config/config_test.go`
- Modify: `api/internal/config/config.go`, `infra/docker-compose.yml`, `.env.example`, `Makefile`

- [ ] **Step 1: Write the failing test**

Create `api/internal/config/config_test.go`:

```go
package config

import (
	"strings"
	"testing"
)

func setValidEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("ADMIN_PASSWORD", "pw")
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("S3_BUCKET", "sahel-uploads")
	t.Setenv("S3_PUBLIC_URL", "http://localhost:9000/sahel-uploads")
}

func TestLoad_Valid(t *testing.T) {
	setValidEnv(t)
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.AdminPassword != "pw" || c.S3PublicURL != "http://localhost:9000/sahel-uploads" {
		t.Fatalf("got %+v", c)
	}
}

func TestLoad_RequiredVars(t *testing.T) {
	for _, name := range []string{"DATABASE_URL", "ADMIN_PASSWORD", "S3_ENDPOINT", "S3_BUCKET", "S3_PUBLIC_URL"} {
		t.Run(name, func(t *testing.T) {
			setValidEnv(t)
			t.Setenv(name, "")
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("want error naming %s, got %v", name, err)
			}
		})
	}
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `GO 'go test ./internal/config/'`
Expected: build failure, `c.AdminPassword undefined`.

- [ ] **Step 3: Implement**

In `api/internal/config/config.go`, add two fields to `Config` after `S3SecretKey`:

```go
	S3PublicURL string

	// AdminPassword gates /api/v1/admin/*. Required: the API refuses to start
	// without it so the admin surface can never be silently open.
	AdminPassword string
```

In `Load`, add to the struct literal:

```go
		S3PublicURL:   env("S3_PUBLIC_URL", ""),
		AdminPassword: env("ADMIN_PASSWORD", ""),
```

Replace the trailing `if c.DatabaseURL == "" { … }` block with:

```go
	required := []struct{ name, value string }{
		{"DATABASE_URL", c.DatabaseURL},
		{"ADMIN_PASSWORD", c.AdminPassword},
		{"S3_ENDPOINT", c.S3Endpoint},
		{"S3_BUCKET", c.S3Bucket},
		{"S3_PUBLIC_URL", c.S3PublicURL},
	}
	for _, r := range required {
		if r.value == "" {
			return c, fmt.Errorf("%s is required", r.name)
		}
	}
	return c, nil
```

- [ ] **Step 4: Run tests**

Run: `GO 'go test ./internal/config/ -v'`
Expected: PASS (1 + 5 subtests).

- [ ] **Step 5: Compose, env, Makefile**

`infra/docker-compose.yml`, under `api.environment`, add after `S3_SECRET_KEY`:

```yaml
      S3_PUBLIC_URL: ${S3_PUBLIC_URL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:?set ADMIN_PASSWORD in .env}
```

Replace the `minio-init` entrypoint's `mc mb …` line so the bucket is also publicly readable. The browser loads images straight from MinIO (spec §1):

```yaml
      mc mb --ignore-existing local/${S3_BUCKET} &&
      mc anonymous set download local/${S3_BUCKET} &&
```

`.env.example`: add after `S3_SECRET_KEY=minioadmin`:

```
# What browsers use to load uploaded images (not the in-network endpoint).
S3_PUBLIC_URL=http://localhost:9000/sahel-uploads

# Gates /api/v1/admin/* and /dashboard. No default on purpose.
ADMIN_PASSWORD=
```

Add the same two lines to your local `.env` with a real password (for example `ADMIN_PASSWORD=change-me-locally`). `.env` is not committed.

`Makefile`: replace all three `goose@latest` with `goose@v3.24.1`.

- [ ] **Step 6: Commit**

```bash
git add api/internal/config/ infra/docker-compose.yml .env.example Makefile
git commit -m "feat(api): require ADMIN_PASSWORD and S3_PUBLIC_URL; public-read bucket"
```

(`.env.example` already carries the uncommitted `API_PORT=8090` change from Phase 2b. Committing it here is intended.)

---

## Task 2 — Object storage

**Files:**
- Create: `api/internal/storage/storage.go`, `api/internal/storage/storage_test.go`
- Modify: `api/go.mod`, `api/go.sum`

- [ ] **Step 1: Add dependencies**

Run:
```bash
GO 'go get github.com/minio/minio-go/v7@v7.0.80 github.com/testcontainers/testcontainers-go/modules/minio@v0.34.0'
```
Expected: `go: added …` lines; `go.mod` still says `go 1.23`.

- [ ] **Step 2: Write the failing test**

Create `api/internal/storage/storage_test.go`:

```go
package storage

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
)

func newTestStore(t *testing.T) *S3 {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	c, err := tcminio.Run(ctx, "minio/minio:RELEASE.2024-01-16T16-07-38Z")
	if err != nil {
		t.Skipf("testcontainers unavailable (%v)", err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })

	hostPort, err := c.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	s, err := NewS3("http://"+hostPort, c.Username, c.Password, "test-bucket", "http://cdn.test/test-bucket/")
	if err != nil {
		t.Fatalf("NewS3: %v", err)
	}
	if err := s.EnsureBucket(ctx); err != nil {
		t.Fatalf("EnsureBucket: %v", err)
	}
	return s
}

func TestS3_PutThenDelete(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	url, err := s.Put(ctx, "units/abc/1.png", "image/png", strings.NewReader("pngbytes"), 8)
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if url != "http://cdn.test/test-bucket/units/abc/1.png" {
		t.Fatalf("url = %q", url)
	}

	info, err := s.client.StatObject(ctx, "test-bucket", "units/abc/1.png", minio.StatObjectOptions{})
	if err != nil {
		t.Fatalf("stat after put: %v", err)
	}
	if info.ContentType != "image/png" || info.Size != 8 {
		t.Fatalf("stored %s / %d bytes", info.ContentType, info.Size)
	}

	if err := s.Delete(ctx, url); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.client.StatObject(ctx, "test-bucket", "units/abc/1.png", minio.StatObjectOptions{}); err == nil {
		t.Fatal("object still exists after Delete")
	}
}

func TestS3_DeleteRejectsForeignURL(t *testing.T) {
	s, err := NewS3("http://localhost:9000", "k", "s", "b", "http://cdn.test/b")
	if err != nil {
		t.Fatalf("NewS3: %v", err)
	}
	if err := s.Delete(context.Background(), "http://elsewhere.test/b/x.png"); err == nil {
		t.Fatal("want error for a URL outside this bucket")
	}
}

func TestNewS3_RejectsBareHost(t *testing.T) {
	if _, err := NewS3("minio:9000", "k", "s", "b", "http://cdn.test/b"); err == nil {
		t.Fatal("want error for endpoint without scheme")
	}
}
```

- [ ] **Step 3: Confirm it fails**

Run: `GO 'go test ./internal/storage/'`
Expected: build failure, `undefined: NewS3`.

- [ ] **Step 4: Implement**

Create `api/internal/storage/storage.go`:

```go
// Package storage puts uploaded files somewhere a browser can load them.
// Handlers depend on ObjectStore; production wires the MinIO/S3 client, tests
// wire an in-memory fake.
package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// ObjectStore stores objects under a key. Put returns the public URL the
// browser will load; Delete takes that same URL back.
type ObjectStore interface {
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (publicURL string, err error)
	Delete(ctx context.Context, publicURL string) error
}

// S3 is an ObjectStore backed by any S3-compatible server (MinIO locally).
type S3 struct {
	client     *minio.Client
	bucket     string
	publicBase string // no trailing slash
}

// NewS3 connects to endpoint (a URL such as http://minio:9000). publicBase is
// the browser-facing prefix for objects in bucket, e.g.
// http://localhost:9000/sahel-uploads. The two differ inside Docker.
func NewS3(endpoint, accessKey, secretKey, bucket, publicBase string) (*S3, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("S3 endpoint %q must be a URL like http://minio:9000", endpoint)
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: u.Scheme == "https",
	})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}
	return &S3{client: client, bucket: bucket, publicBase: strings.TrimRight(publicBase, "/")}, nil
}

// EnsureBucket creates the bucket if it's missing. Compose's minio-init does
// this in dev; tests call it directly.
func (s *S3) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("bucket exists: %w", err)
	}
	if exists {
		return nil
	}
	return s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
}

func (s *S3) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (string, error) {
	if _, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType}); err != nil {
		return "", fmt.Errorf("put %s: %w", key, err)
	}
	return s.publicBase + "/" + key, nil
}

func (s *S3) Delete(ctx context.Context, publicURL string) error {
	key, ok := strings.CutPrefix(publicURL, s.publicBase+"/")
	if !ok || key == "" {
		return fmt.Errorf("%q is not an object in this bucket", publicURL)
	}
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("delete %s: %w", key, err)
	}
	return nil
}
```

- [ ] **Step 5: Run tests**

Run: `GO 'go mod tidy && go test ./internal/storage/ -v'`
Expected: 3 PASS (the first takes a few seconds to start MinIO).

- [ ] **Step 6: Commit**

```bash
git add api/go.mod api/go.sum api/internal/storage/
git commit -m "feat(api): S3/MinIO object store"
```

---

## Task 3 — Input plumbing: `field[T]`, validators, IDs, DB errors

Pure helpers every admin handler uses. Unit-tested with no database.

**Files:**
- Create: `api/internal/http/admin_input.go`, `api/internal/http/admin_input_test.go`, `api/internal/http/ids.go`, `api/internal/http/ids_test.go`, `api/internal/http/admin_errors.go`

- [ ] **Step 1: Write the failing tests**

Create `api/internal/http/admin_input_test.go`:

```go
package http

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestField_AbsentNullValue(t *testing.T) {
	var in struct {
		A field[int32]  `json:"a"`
		B field[int32]  `json:"b"`
		C field[string] `json:"c"`
	}
	if err := json.Unmarshal([]byte(`{"b": null, "c": "x"}`), &in); err != nil {
		t.Fatal(err)
	}
	if in.A.Set {
		t.Error("a: absent key must not be Set")
	}
	if !in.B.Set || !in.B.Null {
		t.Errorf("b: want Set+Null, got %+v", in.B)
	}
	if !in.C.Set || in.C.Null || in.C.V != "x" {
		t.Errorf("c: want value x, got %+v", in.C)
	}
}

func TestSetters(t *testing.T) {
	var p problems
	name := "old"
	setField(&p, &name, field[string]{Set: true, V: "new"}, "name")
	setField(&p, &name, field[string]{}, "name") // absent: unchanged
	if name != "new" {
		t.Errorf("name = %q", name)
	}
	setField(&p, &name, field[string]{Set: true, Null: true}, "name")
	if len(p) != 1 || !strings.Contains(p[0], "name cannot be null") {
		t.Errorf("problems = %v", p)
	}

	km := new(int32)
	setNullable(&km, field[int32]{Set: true, Null: true})
	if km != nil {
		t.Error("explicit null must clear a nullable column")
	}
	setNullable(&km, field[int32]{Set: true, V: 7})
	if km == nil || *km != 7 {
		t.Errorf("km = %v", km)
	}
}

func TestSetCoord(t *testing.T) {
	var p problems
	var n = mustNumeric(t, "1")
	setCoord(&p, &n, field[float64]{Set: true, V: 31.123456}, "lat", 90)
	if got, _ := n.Float64Value(); got.Float64 != 31.123456 {
		t.Errorf("lat = %v", got)
	}
	setCoord(&p, &n, field[float64]{Set: true, V: 91}, "lat", 90)
	if len(p) != 1 {
		t.Errorf("want out-of-range problem, got %v", p)
	}
	setCoord(&p, &n, field[float64]{Set: true, Null: true}, "lat", 90)
	if n.Valid {
		t.Error("null must clear the coordinate")
	}
}

func TestRequirePair(t *testing.T) {
	var p problems
	requirePair(&p, "title", "عنوان", "  ")
	if !reflect.DeepEqual([]string(p), []string{"title_en is required"}) {
		t.Errorf("problems = %v", p)
	}
}

func TestCheckEnum(t *testing.T) {
	var p problems
	checkEnum(&p, "type", "", false)
	checkEnum(&p, "view", "moon", false)
	checkEnum(&p, "view", "sea", true)
	want := []string{"type is required", `view: unknown value "moon"`}
	if !reflect.DeepEqual([]string(p), want) {
		t.Errorf("problems = %v", p)
	}
}

func TestNormalizeAmenities(t *testing.T) {
	got := normalizeAmenities([]string{" pool ", "", "pool", "beach", "  "})
	if !reflect.DeepEqual(got, []string{"pool", "beach"}) {
		t.Errorf("got %v", got)
	}
	if got := normalizeAmenities(nil); got == nil || len(got) != 0 {
		t.Errorf("nil input must become an empty, non-nil slice; got %#v", got)
	}
}

func TestBlankToNil(t *testing.T) {
	s := "   "
	p := &s
	blankToNil(&p)
	if p != nil {
		t.Error("blank must become nil")
	}
	v := " keep "
	p = &v
	blankToNil(&p)
	if p == nil || *p != "keep" {
		t.Errorf("want trimmed value, got %v", p)
	}
}

func TestCheckSlug(t *testing.T) {
	for s, ok := range map[string]bool{"marassi": true, "sidi-abdel-rahman": true, "": false, "Marassi": false, "a b": false, "-x": false} {
		if err := checkSlug(s); (err == nil) != ok {
			t.Errorf("checkSlug(%q) err=%v, want ok=%v", s, err, ok)
		}
	}
}

func TestResolveSlug(t *testing.T) {
	s, explicit, err := resolveSlug("", "Sidi Abdel Rahman")
	if err != nil || s != "sidi-abdel-rahman" || explicit {
		t.Errorf("derived: %q %v %v", s, explicit, err)
	}
	s, explicit, err = resolveSlug("custom-one", "ignored")
	if err != nil || s != "custom-one" || !explicit {
		t.Errorf("explicit: %q %v %v", s, explicit, err)
	}
	if _, _, err := resolveSlug("", "!!!"); err == nil {
		t.Error("want error when nothing can be derived")
	}
}
```

Create `api/internal/http/ids_test.go`:

```go
package http

import (
	"regexp"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func mustNumeric(t *testing.T, s string) pgtype.Numeric {
	t.Helper()
	var n pgtype.Numeric
	if err := n.Scan(s); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestUUIDRoundTrip(t *testing.T) {
	const in = "0b7c8a2e-5d1f-4c3a-9e6b-1f2a3b4c5d6e"
	var u pgtype.UUID
	if err := u.Scan(in); err != nil {
		t.Fatal(err)
	}
	if got := uuidString(u); got != in {
		t.Fatalf("uuidString = %q", got)
	}
}

func TestNewUUIDIsV4(t *testing.T) {
	v4 := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	a, b := uuidString(newUUID()), uuidString(newUUID())
	if !v4.MatchString(a) || a == b {
		t.Fatalf("got %q and %q", a, b)
	}
}
```

- [ ] **Step 2: Confirm they fail**

Run: `GO 'go test ./internal/http/ -run "TestField|TestSet|TestRequire|TestCheck|TestNormalize|TestBlank|TestResolve|TestUUID|TestNewUUID"'`
Expected: build failure, undefined identifiers.

- [ ] **Step 3: Implement `ids.go`**

Create `api/internal/http/ids.go`:

```go
package http

import (
	"crypto/rand"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// parseID reads a UUID path parameter. A malformed id is answered with the
// same 404 as an unknown one: from the client's view neither exists.
func parseID(w http.ResponseWriter, r *http.Request, param, what string) (pgtype.UUID, bool) {
	var id pgtype.UUID
	if err := id.Scan(chi.URLParam(r, param)); err != nil {
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
		return id, false
	}
	return id, true
}

// uuidString formats a UUID in canonical 8-4-4-4-12 lowercase form.
func uuidString(u pgtype.UUID) string {
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// newUUID returns a random (version 4) UUID.
func newUUID() pgtype.UUID {
	var u pgtype.UUID
	if _, err := rand.Read(u.Bytes[:]); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	u.Bytes[6] = u.Bytes[6]&0x0f | 0x40
	u.Bytes[8] = u.Bytes[8]&0x3f | 0x80
	u.Valid = true
	return u
}
```

- [ ] **Step 4: Implement `admin_input.go`**

Create `api/internal/http/admin_input.go`:

```go
package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/slug"
)

// field is one member of an admin POST/PATCH body. Plain pointers can't tell
// "key absent" (leave the column alone) from "key: null" (clear the column);
// field can. Set means the key was present; Null means its value was null.
type field[T any] struct {
	Set  bool
	Null bool
	V    T
}

func (f *field[T]) UnmarshalJSON(b []byte) error {
	f.Set = true
	if string(b) == "null" {
		f.Null = true
		return nil
	}
	return json.Unmarshal(b, &f.V)
}

// problems collects every validation failure so the admin sees them all at
// once instead of fixing one per round-trip.
type problems []string

func (p *problems) add(format string, args ...any) {
	*p = append(*p, fmt.Sprintf(format, args...))
}

func (p problems) err() error {
	if len(p) == 0 {
		return nil
	}
	return errors.New(strings.Join(p, "; "))
}

// setField copies a present value into a NOT NULL column.
func setField[T any](p *problems, dst *T, f field[T], name string) {
	if !f.Set {
		return
	}
	if f.Null {
		p.add("%s cannot be null", name)
		return
	}
	*dst = f.V
}

// setNullable copies a present value, or an explicit null, into a nullable column.
func setNullable[T any](dst **T, f field[T]) {
	if !f.Set {
		return
	}
	if f.Null {
		*dst = nil
		return
	}
	v := f.V
	*dst = &v
}

// setCoord writes a latitude/longitude into a NUMERIC(9,6) column,
// rejecting values outside ±limit.
func setCoord(p *problems, dst *pgtype.Numeric, f field[float64], name string, limit float64) {
	if !f.Set {
		return
	}
	if f.Null {
		*dst = pgtype.Numeric{}
		return
	}
	if f.V < -limit || f.V > limit {
		p.add("%s must be between %g and %g", name, -limit, limit)
		return
	}
	var n pgtype.Numeric
	if err := n.Scan(strconv.FormatFloat(f.V, 'f', 6, 64)); err != nil {
		p.add("%s: %v", name, err)
		return
	}
	*dst = n
}

// requirePair checks both halves of a bilingual NOT NULL pair, trimming
// them in place.
func requirePair(p *problems, name string, ar, en string) {
	if strings.TrimSpace(ar) == "" {
		p.add("%s_ar is required", name)
	}
	if strings.TrimSpace(en) == "" {
		p.add("%s_en is required", name)
	}
}

// requireText checks a single NOT NULL text column.
func requireText(p *problems, name, v string) {
	if strings.TrimSpace(v) == "" {
		p.add("%s is required", name)
	}
}

// requireSet flags a create-time field that has no sensible zero value.
func requireSet(p *problems, name string, set bool) {
	if !set {
		p.add("%s is required", name)
	}
}

// checkEnum reports an empty or unknown enum value. valid comes from the
// matching internal/domain parser so the DB enum and Go stay in lockstep.
func checkEnum(p *problems, name, v string, valid bool) {
	switch {
	case v == "":
		p.add("%s is required", name)
	case !valid:
		p.add("%s: unknown value %q", name, v)
	}
}

// trimAll trims whitespace from each string in place.
func trimAll(ss ...*string) {
	for _, s := range ss {
		*s = strings.TrimSpace(*s)
	}
}

// blankToNil trims a nullable text column and stores blanks as NULL, so ""
// and null mean the same thing to every reader.
func blankToNil(s **string) {
	if *s == nil {
		return
	}
	v := strings.TrimSpace(**s)
	if v == "" {
		*s = nil
		return
	}
	*s = &v
}

// normalizeAmenities trims, drops blanks and duplicates, keeps first-seen
// order, and never returns nil (the column is TEXT[] NOT NULL).
func normalizeAmenities(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, a := range in {
		a = strings.TrimSpace(a)
		if a == "" || seen[a] {
			continue
		}
		seen[a] = true
		out = append(out, a)
	}
	return out
}

// checkSlug requires a slug already in canonical form.
func checkSlug(s string) error {
	if s == "" || slug.Make(s) != s {
		return fmt.Errorf("slug %q must be lowercase letters, digits and single hyphens (try %q)", s, slug.Make(s))
	}
	return nil
}

// resolveSlug returns the slug to insert on create. An admin-supplied slug
// must be canonical and is used verbatim (explicit=true); otherwise one is
// derived from source (the English name/title).
func resolveSlug(given, source string) (s string, explicit bool, err error) {
	if given != "" {
		return given, true, checkSlug(given)
	}
	derived := slug.Make(source)
	if derived == "" {
		return "", false, errors.New("slug could not be derived from the English name; provide one")
	}
	return derived, false, nil
}

// decodeJSON reads a JSON body of at most 1 MB into dst, rejecting unknown
// keys so typos ("titel_en") fail loudly instead of being dropped.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return false
	}
	return true
}

func writeInvalid(w http.ResponseWriter, err error) {
	writeError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
}

// queryOpt returns a query parameter, or nil when it's absent or empty.
func queryOpt(r *http.Request, name string) *string {
	if v := r.URL.Query().Get(name); v != "" {
		return &v
	}
	return nil
}
```

- [ ] **Step 5: Implement `admin_errors.go`**

Create `api/internal/http/admin_errors.go`:

```go
package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sahel/api/internal/slug"
	"github.com/sahel/api/internal/store/postgres/db"
)

const (
	pgUniqueViolation = "23505"
	pgFKViolation     = "23503"
	pgCheckViolation  = "23514"
)

func pgCode(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

// writeStoreError maps a query error from a get/insert/update to the admin
// error envelope. what names the entity ("unit") for messages.
func (s *Server) writeStoreError(w http.ResponseWriter, err error, what string) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
	case pgCode(err) == pgUniqueViolation:
		writeError(w, http.StatusConflict, "slug_taken", "that slug is already used by another "+what)
	case pgCode(err) == pgFKViolation:
		writeError(w, http.StatusUnprocessableEntity, "invalid_reference", "a referenced record does not exist")
	case pgCode(err) == pgCheckViolation:
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
	default:
		s.internalError(w, err, what)
	}
}

// finishDelete answers a DELETE from its :execrows result.
func (s *Server) finishDelete(w http.ResponseWriter, n int64, err error, what string) {
	switch {
	case pgCode(err) == pgFKViolation:
		writeError(w, http.StatusConflict, "in_use", what+" is still referenced; move or delete what uses it first")
	case err != nil:
		s.internalError(w, err, "delete "+what)
	case n == 0:
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) internalError(w http.ResponseWriter, err error, what string) {
	s.log.Error().Err(err).Str("entity", what).Msg("admin query failed")
	writeError(w, http.StatusInternalServerError, "internal", what+" request failed")
}

// insertWithSlug runs insert with base. When the slug was derived rather
// than typed by the admin and it collides, it retries base-2, base-3, …
func insertWithSlug[T any](base string, explicit bool, insert func(slug string) (T, error)) (T, error) {
	for n := 1; ; n++ {
		candidate := base
		if n > 1 {
			candidate = slug.MakeWithSuffix(base, n)
		}
		v, err := insert(candidate)
		if err == nil || explicit || pgCode(err) != pgUniqueViolation || n >= 50 {
			return v, err
		}
	}
}

// inTx runs fn inside one transaction and commits when it returns no error.
func inTx[T any](ctx context.Context, s *Server, fn func(q *db.Queries) (T, error)) (T, error) {
	var zero T
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return zero, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	v, err := fn(s.queries.WithTx(tx))
	if err != nil {
		return zero, err
	}
	if err := tx.Commit(ctx); err != nil {
		return zero, err
	}
	return v, nil
}
```

- [ ] **Step 6: Run tests**

Run: `GO 'go test ./internal/http/ -run "TestField|TestSet|TestRequire|TestCheck|TestNormalize|TestBlank|TestResolve|TestUUID|TestNewUUID" -v'`
Expected: all PASS. `TestField_AbsentNullValue` in particular proves `encoding/json` calls `UnmarshalJSON` for an explicit `null`.

- [ ] **Step 7: Commit**

```bash
git add api/internal/http/admin_input.go api/internal/http/admin_input_test.go api/internal/http/ids.go api/internal/http/ids_test.go api/internal/http/admin_errors.go
git commit -m "feat(api): admin input plumbing (patch fields, validators, ids, db errors)"
```

---

## Task 4 — Basic auth, server options, `/admin/enums`, wiring

**Files:**
- Create: `api/internal/http/admin_auth.go`, `api/internal/http/admin_auth_test.go`, `api/internal/http/admin_enums.go`, `api/internal/http/admin_helpers_test.go`
- Modify: `api/internal/http/router.go`, `api/cmd/api/main.go`

- [ ] **Step 1: Write the shared test helpers**

Create `api/internal/http/admin_helpers_test.go`:

```go
package http

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/sahel/api/internal/testsupport"
)

const (
	testAdminPassword = "test-admin-pw"
	fakeStoreBase     = "http://objects.test/"
)

// fakeStore is an in-memory storage.ObjectStore.
type fakeStore struct {
	mu      sync.Mutex
	objects map[string][]byte
	deleted []string
}

func newFakeStore() *fakeStore { return &fakeStore{objects: map[string][]byte{}} }

func (f *fakeStore) Put(_ context.Context, key, _ string, body io.Reader, _ int64) (string, error) {
	b, err := io.ReadAll(body)
	if err != nil {
		return "", err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[key] = b
	return fakeStoreBase + key, nil
}

func (f *fakeStore) Delete(_ context.Context, url string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, url)
	delete(f.objects, strings.TrimPrefix(url, fakeStoreBase))
	return nil
}

func newAdminServer(t *testing.T) (*Server, *pgxpool.Pool, *fakeStore) {
	t.Helper()
	pool := testsupport.Pool(t)
	store := newFakeStore()
	return NewServer(pool, zerolog.Nop(), "test", WithAdmin(testAdminPassword, store)), pool, store
}

// adminDo sends an authenticated admin request. body may be nil, a raw
// string, or any value to be JSON-encoded. path is relative to /api/v1/admin.
func adminDo(t *testing.T, s *Server, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rdr io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rdr = strings.NewReader(b)
	default:
		j, err := json.Marshal(b)
		if err != nil {
			t.Fatal(err)
		}
		rdr = bytes.NewReader(j)
	}
	req := httptest.NewRequest(method, "/api/v1/admin"+path, rdr)
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth("admin", testAdminPassword)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	return rec
}

func expectStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, want, rec.Body.String())
	}
}

func decodeInto[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode: %v; body=%s", err, rec.Body.String())
	}
	return v
}

func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	return decodeInto[struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}](t, rec).Error.Code
}

// idOf returns the id (as text) of the row in table matching where, e.g.
// idOf(t, pool, "areas", "slug='nc'").
func idOf(t *testing.T, pool *pgxpool.Pool, table, where string) string {
	t.Helper()
	var id string
	if err := pool.QueryRow(context.Background(), "SELECT id::text FROM "+table+" WHERE "+where).Scan(&id); err != nil {
		t.Fatalf("idOf %s %s: %v", table, where, err)
	}
	return id
}

// catalogSeedSQL: one area (nc), one compound (hac), one owner (Owner One),
// one active unit (u1). Enough for every reference/in-use test.
const catalogSeedSQL = `
INSERT INTO areas (slug, name_ar, name_en, region) VALUES ('nc','ن','North','north_coast');
INSERT INTO owners (name, phone) VALUES ('Owner One','0100');
INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
SELECT id, 'hac','ه','Hacienda','د','D','sea' FROM areas WHERE slug='nc';
INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
                   type, bedrooms, bathrooms, base_guests, max_guests, sea_distance_m, view, status)
SELECT o.id, c.id, 'u1','ت','U1','د','D','chalet',2,1,4,6,100,'sea','active'
FROM owners o, compounds c WHERE o.name='Owner One' AND c.slug='hac';
`

const zeroUUID = "00000000-0000-4000-8000-000000000000"
```

- [ ] **Step 2: Write the failing auth + enums test**

Create `api/internal/http/admin_auth_test.go`:

```go
package http

import (
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"
)

func TestAdminAuth(t *testing.T) {
	// No database needed: auth rejects before any handler runs, and
	// /admin/enums never touches the pool.
	s := NewServer(nil, zerolog.Nop(), "test", WithAdmin(testAdminPassword, newFakeStore()))
	unconfigured := NewServer(nil, zerolog.Nop(), "test")

	cases := []struct {
		name     string
		srv      *Server
		user, pw string
		useAuth  bool
		want     int
	}{
		{"no credentials", s, "", "", false, 401},
		{"wrong password", s, "admin", "nope", true, 401},
		{"right password", s, "anyone", testAdminPassword, true, 200},
		{"server without WithAdmin rejects everything", unconfigured, "admin", "", true, 401},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v1/admin/enums", nil)
			if c.useAuth {
				req.SetBasicAuth(c.user, c.pw)
			}
			rec := httptest.NewRecorder()
			c.srv.Routes().ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("status = %d, want %d", rec.Code, c.want)
			}
			if c.want == 401 {
				if rec.Header().Get("WWW-Authenticate") == "" {
					t.Error("401 must carry a WWW-Authenticate challenge")
				}
				if code := errorCode(t, rec); code != "unauthorized" {
					t.Errorf("error.code = %q", code)
				}
			}
		})
	}
}

func TestAdminEnums(t *testing.T) {
	s := NewServer(nil, zerolog.Nop(), "test", WithAdmin(testAdminPassword, newFakeStore()))
	rec := adminDo(t, s, "GET", "/enums", nil)
	expectStatus(t, rec, 200)

	got := decodeInto[map[string][]string](t, rec)
	wantLens := map[string]int{"region": 5, "beach_type": 4, "type": 7, "view": 5, "unit_status": 4}
	for k, n := range wantLens {
		if len(got[k]) != n {
			t.Errorf("%s: %d values, want %d (%v)", k, len(got[k]), n, got[k])
		}
	}
	if got["unit_status"][0] != "draft" {
		t.Errorf("unit_status order = %v, want draft first", got["unit_status"])
	}
}
```

- [ ] **Step 3: Confirm it fails**

Run: `GO 'go test ./internal/http/ -run "TestAdminAuth|TestAdminEnums"'`
Expected: build failure, `undefined: WithAdmin`.

- [ ] **Step 4: Server options and admin subtree in `router.go`**

In `api/internal/http/router.go`, add the storage import:

```go
	"github.com/sahel/api/internal/storage"
```

Replace the `Server` struct and `NewServer` with:

```go
type Server struct {
	pool          *pgxpool.Pool
	queries       *db.Queries
	log           zerolog.Logger
	env           string
	adminPassword string
	store         storage.ObjectStore
}

// Option configures optional Server capabilities.
type Option func(*Server)

// WithAdmin enables /api/v1/admin/*. Without it every admin request is 401.
func WithAdmin(password string, store storage.ObjectStore) Option {
	return func(s *Server) {
		s.adminPassword = password
		s.store = store
	}
}

func NewServer(pool *pgxpool.Pool, log zerolog.Logger, env string, opts ...Option) *Server {
	s := &Server{
		pool:    pool,
		queries: db.New(pool),
		log:     log,
		env:     env,
	}
	for _, o := range opts {
		o(s)
	}
	return s
}
```

Inside `Routes()`, in the `/api/v1` block, after `s.registerCatalogRoutes(r)`:

```go
		r.Route("/admin", func(r chi.Router) {
			r.Use(s.adminAuth)
			s.registerAdminRoutes(r)
		})
```

After `registerCatalogRoutes`, add the full route table. Handlers land in Tasks 5–9. Until then, keep only the `/enums` line and add each group in its own task:

```go
func (s *Server) registerAdminRoutes(r chi.Router) {
	r.Get("/enums", s.adminEnums)
}
```

- [ ] **Step 5: Implement auth and enums**

Create `api/internal/http/admin_auth.go`:

```go
package http

import (
	"crypto/subtle"
	"net/http"
)

// adminAuth gates the admin subtree with HTTP Basic auth against the single
// shared ADMIN_PASSWORD (spec §6). The username is ignored. An empty
// configured password rejects everything; it never matches an empty guess.
func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, pw, ok := r.BasicAuth()
		if !ok || s.adminPassword == "" ||
			subtle.ConstantTimeCompare([]byte(pw), []byte(s.adminPassword)) != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="sahel-admin", charset="UTF-8"`)
			writeError(w, http.StatusUnauthorized, "unauthorized", "admin credentials required")
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

Create `api/internal/http/admin_enums.go`:

```go
package http

import (
	"net/http"

	"github.com/sahel/api/internal/domain/area"
	"github.com/sahel/api/internal/domain/compound"
	"github.com/sahel/api/internal/domain/unit"
)

// adminEnums feeds the admin UI's <select> options from the same Go enums
// that validate writes, so the form can't drift from the database.
func (s *Server) adminEnums(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string][]string{
		"region":      strs(area.All),
		"beach_type":  strs(compound.AllBeachTypes),
		"type":        strs(unit.AllTypes),
		"view":        strs(unit.AllViews),
		"unit_status": strs(unit.AllStatuses),
	})
}

func strs[T ~string](vs []T) []string {
	out := make([]string, len(vs))
	for i, v := range vs {
		out[i] = string(v)
	}
	return out
}
```

- [ ] **Step 6: Wire `main.go`**

In `api/cmd/api/main.go`, add the import `"github.com/sahel/api/internal/storage"`. After `waitForDatabase`, add:

```go
	store, err := storage.NewS3(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3PublicURL)
	if err != nil {
		return err
	}
```

Change the handler line to:

```go
		Handler:           http.NewServer(pool, log, cfg.Env, http.WithAdmin(cfg.AdminPassword, store)).Routes(),
```

- [ ] **Step 7: Run tests**

Run: `GO 'go vet ./... && go test ./internal/http/ -run "TestAdminAuth|TestAdminEnums" -v'`
Expected: PASS (4 auth subtests + enums).

- [ ] **Step 8: Commit**

```bash
git add api/internal/http/router.go api/internal/http/admin_auth.go api/internal/http/admin_auth_test.go api/internal/http/admin_enums.go api/internal/http/admin_helpers_test.go api/cmd/api/main.go
git commit -m "feat(api): basic-auth admin subtree and GET /admin/enums"
```

---

## Task 5 — Admin areas

**Files:**
- Create: `api/internal/store/postgres/queries/admin_areas.sql`, `api/internal/http/admin_areas.go`, `api/internal/http/admin_areas_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Queries**

Create `api/internal/store/postgres/queries/admin_areas.sql`:

```sql
-- name: AdminListAreas :many
SELECT * FROM areas
WHERE (sqlc.narg('slug')::text IS NULL OR slug = sqlc.narg('slug')::text)
ORDER BY sort_order ASC, name_en ASC;

-- name: AdminGetArea :one
SELECT * FROM areas WHERE id = $1;

-- name: AdminCreateArea :one
INSERT INTO areas (slug, name_ar, name_en, region, km_marker, sort_order)
VALUES (@slug, @name_ar, @name_en, @region, @km_marker, @sort_order)
RETURNING *;

-- name: AdminUpdateArea :one
UPDATE areas
SET slug = @slug, name_ar = @name_ar, name_en = @name_en, region = @region,
    km_marker = @km_marker, sort_order = @sort_order
WHERE id = @id
RETURNING *;

-- name: AdminDeleteArea :execrows
DELETE FROM areas WHERE id = $1;
```

Run: `GO 'go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 generate'`. Expected: silent. Check `db/admin_areas.sql.go`: `AdminCreateAreaParams` has `Slug, NameAr, NameEn string; Region RegionEnum; KmMarker *int32; SortOrder int32`.

- [ ] **Step 2: Write the failing tests**

Create `api/internal/http/admin_areas_test.go`:

```go
package http

import (
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func TestAdminAreas_CRUD(t *testing.T) {
	s, _, _ := newAdminServer(t)

	rec := adminDo(t, s, "POST", "/areas", map[string]any{
		"name_ar": "سيدي عبد الرحمن", "name_en": "Sidi Abdel Rahman",
		"region": "north_coast", "km_marker": 140,
	})
	expectStatus(t, rec, 201)
	created := decodeInto[db.Area](t, rec)
	if created.Slug != "sidi-abdel-rahman" || created.KmMarker == nil || *created.KmMarker != 140 {
		t.Fatalf("created = %+v", created)
	}
	id := uuidString(created.ID)

	expectStatus(t, adminDo(t, s, "GET", "/areas/"+id, nil), 200)

	list := decodeInto[[]db.Area](t, adminDo(t, s, "GET", "/areas?slug=sidi-abdel-rahman", nil))
	if len(list) != 1 {
		t.Fatalf("?slug= filter: %d rows", len(list))
	}
	if all := decodeInto[[]db.Area](t, adminDo(t, s, "GET", "/areas?slug=nope", nil)); len(all) != 0 {
		t.Fatalf("unknown slug: %d rows", len(all))
	}

	rec = adminDo(t, s, "PATCH", "/areas/"+id, map[string]any{"name_en": "Sidi Abdelrahman", "km_marker": nil})
	expectStatus(t, rec, 200)
	patched := decodeInto[db.Area](t, rec)
	if patched.NameEn != "Sidi Abdelrahman" || patched.KmMarker != nil {
		t.Fatalf("patched = %+v", patched)
	}
	if patched.NameAr != created.NameAr || patched.Slug != created.Slug {
		t.Fatal("PATCH changed fields it was not given")
	}

	expectStatus(t, adminDo(t, s, "DELETE", "/areas/"+id, nil), 204)
	expectStatus(t, adminDo(t, s, "GET", "/areas/"+id, nil), 404)
}

func TestAdminAreas_Validation(t *testing.T) {
	s, _, _ := newAdminServer(t)
	cases := []struct {
		name string
		body any
		want int
	}{
		{"missing name_ar", map[string]any{"name_en": "X", "region": "sokhna"}, 422},
		{"unknown region", map[string]any{"name_ar": "س", "name_en": "X", "region": "atlantis"}, 422},
		{"non-canonical slug", map[string]any{"slug": "Not A Slug", "name_ar": "س", "name_en": "X", "region": "sokhna"}, 422},
		{"unknown key", map[string]any{"name_ar": "س", "name_en": "X", "region": "sokhna", "colour": "red"}, 400},
		{"malformed json", "{", 400},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			expectStatus(t, adminDo(t, s, "POST", "/areas", c.body), c.want)
		})
	}
}

func TestAdminAreas_Slugs(t *testing.T) {
	s, _, _ := newAdminServer(t)
	body := map[string]any{"name_ar": "م", "name_en": "Marassi", "region": "north_coast"}

	expectStatus(t, adminDo(t, s, "POST", "/areas", body), 201)
	second := decodeInto[db.Area](t, adminDo(t, s, "POST", "/areas", body))
	if second.Slug != "marassi-2" {
		t.Fatalf("derived slug collision: got %q, want marassi-2", second.Slug)
	}

	body["slug"] = "marassi"
	rec := adminDo(t, s, "POST", "/areas", body)
	expectStatus(t, rec, 409)
	if code := errorCode(t, rec); code != "slug_taken" {
		t.Fatalf("error.code = %q", code)
	}
}

func TestAdminAreas_DeleteInUse(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)

	rec := adminDo(t, s, "DELETE", "/areas/"+idOf(t, pool, "areas", "slug='nc'"), nil)
	expectStatus(t, rec, 409)
	if code := errorCode(t, rec); code != "in_use" {
		t.Fatalf("error.code = %q", code)
	}
}

func TestAdminAreas_NotFound(t *testing.T) {
	s, _, _ := newAdminServer(t)
	for _, id := range []string{zeroUUID, "not-a-uuid"} {
		expectStatus(t, adminDo(t, s, "GET", "/areas/"+id, nil), 404)
		expectStatus(t, adminDo(t, s, "PATCH", "/areas/"+id, map[string]any{"name_en": "X"}), 404)
		expectStatus(t, adminDo(t, s, "DELETE", "/areas/"+id, nil), 404)
	}
}
```

- [ ] **Step 3: Confirm they fail**

Run: `GO 'go test ./internal/http/ -run TestAdminAreas'`
Expected: FAIL. Every request gets 404 or 405 because the routes aren't registered.

- [ ] **Step 4: Implement handlers**

Create `api/internal/http/admin_areas.go`:

```go
package http

import (
	"net/http"
	"time"

	"github.com/sahel/api/internal/domain/area"
	"github.com/sahel/api/internal/store/postgres/db"
)

type areaInput struct {
	Slug      field[string]        `json:"slug"`
	NameAr    field[string]        `json:"name_ar"`
	NameEn    field[string]        `json:"name_en"`
	Region    field[db.RegionEnum] `json:"region"`
	KmMarker  field[int32]         `json:"km_marker"`
	SortOrder field[int32]         `json:"sort_order"`
}

func (in areaInput) apply(a *db.Area) error {
	var p problems
	setField(&p, &a.Slug, in.Slug, "slug")
	setField(&p, &a.NameAr, in.NameAr, "name_ar")
	setField(&p, &a.NameEn, in.NameEn, "name_en")
	setField(&p, &a.Region, in.Region, "region")
	setNullable(&a.KmMarker, in.KmMarker)
	setField(&p, &a.SortOrder, in.SortOrder, "sort_order")

	trimAll(&a.NameAr, &a.NameEn)
	requirePair(&p, "name", a.NameAr, a.NameEn)
	checkEnum(&p, "region", string(a.Region), area.Region(a.Region).Valid())
	if a.KmMarker != nil && *a.KmMarker < 0 {
		p.add("km_marker must be >= 0")
	}
	return p.err()
}

func (s *Server) adminListAreas(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListAreas(ctx, queryOpt(r, "slug"))
	if err != nil {
		s.internalError(w, err, "areas")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetArea(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "area")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	a, err := s.queries.AdminGetArea(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) adminCreateArea(w http.ResponseWriter, r *http.Request) {
	var in areaInput
	if !decodeJSON(w, r, &in) {
		return
	}
	var a db.Area
	if err := in.apply(&a); err != nil {
		writeInvalid(w, err)
		return
	}
	base, explicit, err := resolveSlug(a.Slug, a.NameEn)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := insertWithSlug(base, explicit, func(sl string) (db.Area, error) {
		return s.queries.AdminCreateArea(ctx, db.AdminCreateAreaParams{
			Slug: sl, NameAr: a.NameAr, NameEn: a.NameEn, Region: a.Region,
			KmMarker: a.KmMarker, SortOrder: a.SortOrder,
		})
	})
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchArea(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "area")
	if !ok {
		return
	}
	var in areaInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	a, err := s.queries.AdminGetArea(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	if err := in.apply(&a); err != nil {
		writeInvalid(w, err)
		return
	}
	if err := checkSlug(a.Slug); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateArea(ctx, db.AdminUpdateAreaParams{
		ID: id, Slug: a.Slug, NameAr: a.NameAr, NameEn: a.NameEn, Region: a.Region,
		KmMarker: a.KmMarker, SortOrder: a.SortOrder,
	})
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteArea(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "area")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteArea(ctx, id)
	s.finishDelete(w, n, err, "area")
}
```

- [ ] **Step 5: Register routes**

In `registerAdminRoutes` in `router.go`, append:

```go
	r.Get("/areas", s.adminListAreas)
	r.Post("/areas", s.adminCreateArea)
	r.Get("/areas/{id}", s.adminGetArea)
	r.Patch("/areas/{id}", s.adminPatchArea)
	r.Delete("/areas/{id}", s.adminDeleteArea)
```

- [ ] **Step 6: Run tests**

Run: `GO 'go test ./internal/http/ -run TestAdminAreas -v'`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/store/postgres/queries/admin_areas.sql api/internal/store/postgres/db/ api/internal/http/admin_areas.go api/internal/http/admin_areas_test.go api/internal/http/router.go
git commit -m "feat(admin): areas CRUD"
```

---

## Task 6 — Admin compounds

**Files:**
- Create: `api/internal/store/postgres/queries/admin_compounds.sql`, `api/internal/http/admin_compounds.go`, `api/internal/http/admin_compounds_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Queries**

Create `api/internal/store/postgres/queries/admin_compounds.sql`:

```sql
-- name: AdminListCompounds :many
SELECT c.*, a.name_en AS area_name_en
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE (sqlc.narg('slug')::text IS NULL OR c.slug = sqlc.narg('slug')::text)
ORDER BY c.name_en ASC;

-- name: AdminGetCompound :one
SELECT * FROM compounds WHERE id = $1;

-- name: AdminCreateCompound :one
INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en,
                       amenities, beach_type, gate_info_ar, gate_info_en, lat, lng,
                       cover_image_url, is_featured)
VALUES (@area_id, @slug, @name_ar, @name_en, @description_ar, @description_en,
        @amenities, @beach_type, @gate_info_ar, @gate_info_en, @lat, @lng,
        @cover_image_url, @is_featured)
RETURNING *;

-- name: AdminUpdateCompound :one
UPDATE compounds
SET area_id = @area_id, slug = @slug, name_ar = @name_ar, name_en = @name_en,
    description_ar = @description_ar, description_en = @description_en,
    amenities = @amenities, beach_type = @beach_type,
    gate_info_ar = @gate_info_ar, gate_info_en = @gate_info_en,
    lat = @lat, lng = @lng, cover_image_url = @cover_image_url, is_featured = @is_featured
WHERE id = @id
RETURNING *;

-- name: AdminDeleteCompound :execrows
DELETE FROM compounds WHERE id = $1;
```

Run sqlc generate. Expected: silent. `AdminListCompoundsRow` has every compound column plus `AreaNameEn string`.

- [ ] **Step 2: Write the failing tests**

Create `api/internal/http/admin_compounds_test.go`:

```go
package http

import (
	"reflect"
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func compoundBody(areaID string) map[string]any {
	return map[string]any{
		"area_id": areaID, "name_ar": "مراسي", "name_en": "Marassi",
		"description_ar": "وصف", "description_en": "Desc",
		"beach_type": "sea", "amenities": []string{" pool ", "", "pool", "beach"},
		"lat": 30.9876, "lng": 28.7654, "is_featured": true,
	}
}

func TestAdminCompounds_CRUD(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	areaID := idOf(t, pool, "areas", "slug='nc'")

	rec := adminDo(t, s, "POST", "/compounds", compoundBody(areaID))
	expectStatus(t, rec, 201)
	c := decodeInto[db.Compound](t, rec)
	if c.Slug != "marassi" || !c.IsFeatured || !reflect.DeepEqual(c.Amenities, []string{"pool", "beach"}) {
		t.Fatalf("created = %+v", c)
	}
	if lat, _ := c.Lat.Float64Value(); lat.Float64 != 30.9876 {
		t.Fatalf("lat = %v", lat)
	}
	id := uuidString(c.ID)

	list := decodeInto[[]db.AdminListCompoundsRow](t, adminDo(t, s, "GET", "/compounds", nil))
	if len(list) != 2 || list[1].AreaNameEn != "North" {
		t.Fatalf("list = %+v", list)
	}

	rec = adminDo(t, s, "PATCH", "/compounds/"+id, map[string]any{"gate_info_en": "Gate 3", "lat": nil})
	expectStatus(t, rec, 200)
	p := decodeInto[db.Compound](t, rec)
	if p.GateInfoEn == nil || *p.GateInfoEn != "Gate 3" || p.Lat.Valid {
		t.Fatalf("patched = %+v", p)
	}

	expectStatus(t, adminDo(t, s, "DELETE", "/compounds/"+id, nil), 204)
	expectStatus(t, adminDo(t, s, "GET", "/compounds/"+id, nil), 404)
}

func TestAdminCompounds_Validation(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	areaID := idOf(t, pool, "areas", "slug='nc'")

	bad := compoundBody(areaID)
	bad["lat"] = 123.0
	bad["beach_type"] = "lava"
	bad["description_en"] = ""
	expectStatus(t, adminDo(t, s, "POST", "/compounds", bad), 422)

	missingArea := compoundBody(areaID)
	delete(missingArea, "area_id")
	expectStatus(t, adminDo(t, s, "POST", "/compounds", missingArea), 422)

	rec := adminDo(t, s, "POST", "/compounds", compoundBody(zeroUUID))
	expectStatus(t, rec, 422)
	if code := errorCode(t, rec); code != "invalid_reference" {
		t.Fatalf("error.code = %q", code)
	}
}

func TestAdminCompounds_DeleteInUse(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	rec := adminDo(t, s, "DELETE", "/compounds/"+idOf(t, pool, "compounds", "slug='hac'"), nil)
	expectStatus(t, rec, 409)
	if code := errorCode(t, rec); code != "in_use" {
		t.Fatalf("error.code = %q", code)
	}
}
```

- [ ] **Step 3: Confirm they fail**

Run: `GO 'go test ./internal/http/ -run TestAdminCompounds'`
Expected: FAIL (routes not registered).

- [ ] **Step 4: Implement handlers**

Create `api/internal/http/admin_compounds.go`:

```go
package http

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/compound"
	"github.com/sahel/api/internal/store/postgres/db"
)

type compoundInput struct {
	AreaID        field[pgtype.UUID]      `json:"area_id"`
	Slug          field[string]           `json:"slug"`
	NameAr        field[string]           `json:"name_ar"`
	NameEn        field[string]           `json:"name_en"`
	DescriptionAr field[string]           `json:"description_ar"`
	DescriptionEn field[string]           `json:"description_en"`
	Amenities     field[[]string]         `json:"amenities"`
	BeachType     field[db.BeachTypeEnum] `json:"beach_type"`
	GateInfoAr    field[string]           `json:"gate_info_ar"`
	GateInfoEn    field[string]           `json:"gate_info_en"`
	Lat           field[float64]          `json:"lat"`
	Lng           field[float64]          `json:"lng"`
	CoverImageUrl field[string]           `json:"cover_image_url"`
	IsFeatured    field[bool]             `json:"is_featured"`
}

func (in compoundInput) apply(c *db.Compound) error {
	var p problems
	setField(&p, &c.AreaID, in.AreaID, "area_id")
	setField(&p, &c.Slug, in.Slug, "slug")
	setField(&p, &c.NameAr, in.NameAr, "name_ar")
	setField(&p, &c.NameEn, in.NameEn, "name_en")
	setField(&p, &c.DescriptionAr, in.DescriptionAr, "description_ar")
	setField(&p, &c.DescriptionEn, in.DescriptionEn, "description_en")
	setField(&p, &c.Amenities, in.Amenities, "amenities")
	setField(&p, &c.BeachType, in.BeachType, "beach_type")
	setNullable(&c.GateInfoAr, in.GateInfoAr)
	setNullable(&c.GateInfoEn, in.GateInfoEn)
	setCoord(&p, &c.Lat, in.Lat, "lat", 90)
	setCoord(&p, &c.Lng, in.Lng, "lng", 180)
	setNullable(&c.CoverImageUrl, in.CoverImageUrl)
	setField(&p, &c.IsFeatured, in.IsFeatured, "is_featured")

	trimAll(&c.NameAr, &c.NameEn, &c.DescriptionAr, &c.DescriptionEn)
	blankToNil(&c.GateInfoAr)
	blankToNil(&c.GateInfoEn)
	blankToNil(&c.CoverImageUrl)
	c.Amenities = normalizeAmenities(c.Amenities)

	if !c.AreaID.Valid {
		p.add("area_id is required")
	}
	requirePair(&p, "name", c.NameAr, c.NameEn)
	requirePair(&p, "description", c.DescriptionAr, c.DescriptionEn)
	checkEnum(&p, "beach_type", string(c.BeachType), compound.BeachType(c.BeachType).Valid())
	return p.err()
}

func (s *Server) adminListCompounds(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListCompounds(ctx, queryOpt(r, "slug"))
	if err != nil {
		s.internalError(w, err, "compounds")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetCompound(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "compound")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	c, err := s.queries.AdminGetCompound(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) adminCreateCompound(w http.ResponseWriter, r *http.Request) {
	var in compoundInput
	if !decodeJSON(w, r, &in) {
		return
	}
	var c db.Compound
	if err := in.apply(&c); err != nil {
		writeInvalid(w, err)
		return
	}
	base, explicit, err := resolveSlug(c.Slug, c.NameEn)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := insertWithSlug(base, explicit, func(sl string) (db.Compound, error) {
		return s.queries.AdminCreateCompound(ctx, db.AdminCreateCompoundParams{
			AreaID: c.AreaID, Slug: sl, NameAr: c.NameAr, NameEn: c.NameEn,
			DescriptionAr: c.DescriptionAr, DescriptionEn: c.DescriptionEn,
			Amenities: c.Amenities, BeachType: c.BeachType,
			GateInfoAr: c.GateInfoAr, GateInfoEn: c.GateInfoEn, Lat: c.Lat, Lng: c.Lng,
			CoverImageUrl: c.CoverImageUrl, IsFeatured: c.IsFeatured,
		})
	})
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchCompound(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "compound")
	if !ok {
		return
	}
	var in compoundInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	c, err := s.queries.AdminGetCompound(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	if err := in.apply(&c); err != nil {
		writeInvalid(w, err)
		return
	}
	if err := checkSlug(c.Slug); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateCompound(ctx, db.AdminUpdateCompoundParams{
		ID: id, AreaID: c.AreaID, Slug: c.Slug, NameAr: c.NameAr, NameEn: c.NameEn,
		DescriptionAr: c.DescriptionAr, DescriptionEn: c.DescriptionEn,
		Amenities: c.Amenities, BeachType: c.BeachType,
		GateInfoAr: c.GateInfoAr, GateInfoEn: c.GateInfoEn, Lat: c.Lat, Lng: c.Lng,
		CoverImageUrl: c.CoverImageUrl, IsFeatured: c.IsFeatured,
	})
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteCompound(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "compound")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteCompound(ctx, id)
	s.finishDelete(w, n, err, "compound")
}
```

- [ ] **Step 5: Register routes**

Append to `registerAdminRoutes`:

```go
	r.Get("/compounds", s.adminListCompounds)
	r.Post("/compounds", s.adminCreateCompound)
	r.Get("/compounds/{id}", s.adminGetCompound)
	r.Patch("/compounds/{id}", s.adminPatchCompound)
	r.Delete("/compounds/{id}", s.adminDeleteCompound)
```

- [ ] **Step 6: Run tests**

Run: `GO 'go test ./internal/http/ -run TestAdminCompounds -v'`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/store/postgres/queries/admin_compounds.sql api/internal/store/postgres/db/ api/internal/http/admin_compounds.go api/internal/http/admin_compounds_test.go api/internal/http/router.go
git commit -m "feat(admin): compounds CRUD"
```

---

## Task 7 — Admin owners

**Files:**
- Create: `api/internal/store/postgres/queries/admin_owners.sql`, `api/internal/http/admin_owners.go`, `api/internal/http/admin_owners_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Queries**

Create `api/internal/store/postgres/queries/admin_owners.sql`:

```sql
-- name: AdminListOwners :many
SELECT * FROM owners ORDER BY name ASC;

-- name: AdminGetOwner :one
SELECT * FROM owners WHERE id = $1;

-- name: AdminCreateOwner :one
INSERT INTO owners (name, phone, email, national_id, notes, commission_pct)
VALUES (@name, @phone, @email, @national_id, @notes, @commission_pct)
RETURNING *;

-- name: AdminUpdateOwner :one
UPDATE owners
SET name = @name, phone = @phone, email = @email, national_id = @national_id,
    notes = @notes, commission_pct = @commission_pct
WHERE id = @id
RETURNING *;

-- name: AdminDeleteOwner :execrows
DELETE FROM owners WHERE id = $1;
```

Owners have no slug, so the list takes no `?slug=` filter. Run sqlc generate.

- [ ] **Step 2: Write the failing tests**

Create `api/internal/http/admin_owners_test.go`:

```go
package http

import (
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func TestAdminOwners_CRUD(t *testing.T) {
	s, _, _ := newAdminServer(t)

	rec := adminDo(t, s, "POST", "/owners", map[string]any{
		"name": " Ahmed ", "phone": "01000000000", "email": "", "commission_pct": 15,
	})
	expectStatus(t, rec, 201)
	o := decodeInto[db.Owner](t, rec)
	if o.Name != "Ahmed" || o.Email != nil || o.CommissionPct != 15 {
		t.Fatalf("created = %+v (blank email must be stored as null, name trimmed)", o)
	}
	id := uuidString(o.ID)

	if list := decodeInto[[]db.Owner](t, adminDo(t, s, "GET", "/owners", nil)); len(list) != 1 {
		t.Fatalf("list = %d", len(list))
	}

	rec = adminDo(t, s, "PATCH", "/owners/"+id, map[string]any{"notes": "prefers WhatsApp"})
	expectStatus(t, rec, 200)
	if p := decodeInto[db.Owner](t, rec); p.Notes == nil || *p.Notes != "prefers WhatsApp" || p.Phone != "01000000000" {
		t.Fatalf("patched = %+v", p)
	}

	expectStatus(t, adminDo(t, s, "DELETE", "/owners/"+id, nil), 204)
	expectStatus(t, adminDo(t, s, "GET", "/owners/"+id, nil), 404)
}

func TestAdminOwners_Validation(t *testing.T) {
	s, _, _ := newAdminServer(t)
	expectStatus(t, adminDo(t, s, "POST", "/owners", map[string]any{"name": "A"}), 422)                                   // phone missing
	expectStatus(t, adminDo(t, s, "POST", "/owners", map[string]any{"name": "A", "phone": "1", "commission_pct": 101}), 422) // range
}

func TestAdminOwners_DeleteInUse(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	rec := adminDo(t, s, "DELETE", "/owners/"+idOf(t, pool, "owners", "name='Owner One'"), nil)
	expectStatus(t, rec, 409)
	if code := errorCode(t, rec); code != "in_use" {
		t.Fatalf("error.code = %q", code)
	}
}
```

- [ ] **Step 3: Confirm they fail**

Run: `GO 'go test ./internal/http/ -run TestAdminOwners'`
Expected: FAIL.

- [ ] **Step 4: Implement handlers**

Create `api/internal/http/admin_owners.go`:

```go
package http

import (
	"net/http"
	"time"

	"github.com/sahel/api/internal/store/postgres/db"
)

type ownerInput struct {
	Name          field[string] `json:"name"`
	Phone         field[string] `json:"phone"`
	Email         field[string] `json:"email"`
	NationalID    field[string] `json:"national_id"`
	Notes         field[string] `json:"notes"`
	CommissionPct field[int16]  `json:"commission_pct"`
}

func (in ownerInput) apply(o *db.Owner) error {
	var p problems
	setField(&p, &o.Name, in.Name, "name")
	setField(&p, &o.Phone, in.Phone, "phone")
	setNullable(&o.Email, in.Email)
	setNullable(&o.NationalID, in.NationalID)
	setNullable(&o.Notes, in.Notes)
	setField(&p, &o.CommissionPct, in.CommissionPct, "commission_pct")

	trimAll(&o.Name, &o.Phone)
	blankToNil(&o.Email)
	blankToNil(&o.NationalID)
	blankToNil(&o.Notes)

	requireText(&p, "name", o.Name)
	requireText(&p, "phone", o.Phone)
	if o.CommissionPct < 0 || o.CommissionPct > 100 {
		p.add("commission_pct must be between 0 and 100")
	}
	return p.err()
}

func (s *Server) adminListOwners(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListOwners(ctx)
	if err != nil {
		s.internalError(w, err, "owners")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetOwner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "owner")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	o, err := s.queries.AdminGetOwner(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (s *Server) adminCreateOwner(w http.ResponseWriter, r *http.Request) {
	var in ownerInput
	if !decodeJSON(w, r, &in) {
		return
	}
	var o db.Owner
	if err := in.apply(&o); err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := s.queries.AdminCreateOwner(ctx, db.AdminCreateOwnerParams{
		Name: o.Name, Phone: o.Phone, Email: o.Email, NationalID: o.NationalID,
		Notes: o.Notes, CommissionPct: o.CommissionPct,
	})
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchOwner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "owner")
	if !ok {
		return
	}
	var in ownerInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	o, err := s.queries.AdminGetOwner(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	if err := in.apply(&o); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateOwner(ctx, db.AdminUpdateOwnerParams{
		ID: id, Name: o.Name, Phone: o.Phone, Email: o.Email, NationalID: o.NationalID,
		Notes: o.Notes, CommissionPct: o.CommissionPct,
	})
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteOwner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "owner")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteOwner(ctx, id)
	s.finishDelete(w, n, err, "owner")
}
```

- [ ] **Step 5: Register routes**

Append to `registerAdminRoutes`:

```go
	r.Get("/owners", s.adminListOwners)
	r.Post("/owners", s.adminCreateOwner)
	r.Get("/owners/{id}", s.adminGetOwner)
	r.Patch("/owners/{id}", s.adminPatchOwner)
	r.Delete("/owners/{id}", s.adminDeleteOwner)
```

- [ ] **Step 6: Run tests**

Run: `GO 'go test ./internal/http/ -run TestAdminOwners -v'`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/store/postgres/queries/admin_owners.sql api/internal/store/postgres/db/ api/internal/http/admin_owners.go api/internal/http/admin_owners_test.go api/internal/http/router.go
git commit -m "feat(admin): owners CRUD"
```

---

## Task 8 — Admin units

**Files:**
- Create: `api/internal/store/postgres/queries/admin_units.sql`, `api/internal/http/admin_units.go`, `api/internal/http/admin_units_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Queries**

Create `api/internal/store/postgres/queries/admin_units.sql`:

```sql
-- name: AdminListUnits :many
-- Newest edits first: doubles as the dashboard's "recently edited" list.
SELECT u.id, u.slug, u.title_ar, u.title_en, u.type, u.status,
       u.bedrooms, u.max_guests, u.updated_at,
       c.name_en AS compound_name_en, o.name AS owner_name,
       ci.url AS cover_url
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN owners    o ON o.id = u.owner_id
LEFT JOIN unit_images ci ON ci.unit_id = u.id AND ci.is_cover
WHERE (sqlc.narg('slug')::text IS NULL OR u.slug = sqlc.narg('slug')::text)
ORDER BY u.updated_at DESC;

-- name: AdminGetUnit :one
SELECT * FROM units WHERE id = $1;

-- name: AdminCreateUnit :one
INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
                   house_rules_ar, house_rules_en, type, bedrooms, bathrooms, base_guests, max_guests,
                   area_sqm, floor, sea_distance_m, view, row_number, amenities, lat, lng,
                   exact_address, status)
VALUES (@owner_id, @compound_id, @slug, @title_ar, @title_en, @description_ar, @description_en,
        @house_rules_ar, @house_rules_en, @type, @bedrooms, @bathrooms, @base_guests, @max_guests,
        @area_sqm, @floor, @sea_distance_m, @view, @row_number, @amenities, @lat, @lng,
        @exact_address, @status)
RETURNING *;

-- name: AdminUpdateUnit :one
UPDATE units
SET owner_id = @owner_id, compound_id = @compound_id, slug = @slug,
    title_ar = @title_ar, title_en = @title_en,
    description_ar = @description_ar, description_en = @description_en,
    house_rules_ar = @house_rules_ar, house_rules_en = @house_rules_en,
    type = @type, bedrooms = @bedrooms, bathrooms = @bathrooms,
    base_guests = @base_guests, max_guests = @max_guests,
    area_sqm = @area_sqm, floor = @floor, sea_distance_m = @sea_distance_m,
    view = @view, row_number = @row_number, amenities = @amenities,
    lat = @lat, lng = @lng, exact_address = @exact_address, status = @status
WHERE id = @id
RETURNING *;

-- name: AdminDeleteUnit :execrows
DELETE FROM units WHERE id = $1;

-- name: AdminListUnitImages :many
SELECT * FROM unit_images WHERE unit_id = $1 ORDER BY sort ASC, created_at ASC;
```

Run sqlc generate. Expected: silent. `AdminListUnitsRow.CoverUrl` is `*string` (LEFT JOIN).

- [ ] **Step 2: Write the failing tests**

Create `api/internal/http/admin_units_test.go`:

```go
package http

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

func unitBody(ownerID, compoundID string) map[string]any {
	return map[string]any{
		"owner_id": ownerID, "compound_id": compoundID,
		"title_ar": "شاليه", "title_en": "Sea Chalet 2BR",
		"description_ar": "وصف", "description_en": "Desc",
		"type": "chalet", "view": "sea",
		"bedrooms": 2, "bathrooms": 1, "base_guests": 4, "max_guests": 6,
		"sea_distance_m": 80, "row_number": 1,
		"amenities": []string{"wifi", "bbq"}, "exact_address": "Bldg 7, Apt 3",
	}
}

type adminUnitBody struct {
	db.Unit
	Images []db.UnitImage `json:"images"`
}

func TestAdminUnits_CRUD(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	ownerID := idOf(t, pool, "owners", "name='Owner One'")
	compoundID := idOf(t, pool, "compounds", "slug='hac'")

	rec := adminDo(t, s, "POST", "/units", unitBody(ownerID, compoundID))
	expectStatus(t, rec, 201)
	u := decodeInto[db.Unit](t, rec)
	if u.Slug != "sea-chalet-2br" || u.Status != "draft" || u.ExactAddress == nil {
		t.Fatalf("created = %+v", u)
	}
	id := uuidString(u.ID)

	// Admin detail carries exact_address and an (empty) images array.
	rec = adminDo(t, s, "GET", "/units/"+id, nil)
	expectStatus(t, rec, 200)
	if !strings.Contains(rec.Body.String(), `"exact_address":"Bldg 7, Apt 3"`) ||
		!strings.Contains(rec.Body.String(), `"images":[]`) {
		t.Fatalf("detail = %s", rec.Body.String())
	}

	// Draft is invisible publicly; activating it makes it visible — without exact_address.
	pub := func() *httptest.ResponseRecorder {
		r := httptest.NewRecorder()
		s.Routes().ServeHTTP(r, httptest.NewRequest("GET", "/api/v1/units/sea-chalet-2br", nil))
		return r
	}
	expectStatus(t, pub(), 404)
	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+id, map[string]any{"status": "active"}), 200)
	p := pub()
	expectStatus(t, p, 200)
	if strings.Contains(p.Body.String(), "Bldg 7") {
		t.Fatal("public payload leaked exact_address")
	}

	list := decodeInto[[]db.AdminListUnitsRow](t, adminDo(t, s, "GET", "/units", nil))
	if len(list) != 2 || list[0].Slug != "sea-chalet-2br" || list[0].CompoundNameEn != "Hacienda" {
		t.Fatalf("list (newest edit first) = %+v", list)
	}

	expectStatus(t, adminDo(t, s, "DELETE", "/units/"+id, nil), 204)
	expectStatus(t, adminDo(t, s, "GET", "/units/"+id, nil), 404)
}

func TestAdminUnits_Validation(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	ownerID := idOf(t, pool, "owners", "name='Owner One'")
	compoundID := idOf(t, pool, "compounds", "slug='hac'")

	tooFew := unitBody(ownerID, compoundID)
	tooFew["max_guests"] = 2 // < base_guests 4
	rec := adminDo(t, s, "POST", "/units", tooFew)
	expectStatus(t, rec, 422)
	if !strings.Contains(rec.Body.String(), "max_guests") {
		t.Fatalf("body = %s", rec.Body.String())
	}

	noDistance := unitBody(ownerID, compoundID)
	delete(noDistance, "sea_distance_m")
	expectStatus(t, adminDo(t, s, "POST", "/units", noDistance), 422)

	badStatus := unitBody(ownerID, compoundID)
	badStatus["status"] = "live"
	expectStatus(t, adminDo(t, s, "POST", "/units", badStatus), 422)

	rec = adminDo(t, s, "POST", "/units", unitBody(zeroUUID, compoundID))
	expectStatus(t, rec, 422)
	if code := errorCode(t, rec); code != "invalid_reference" {
		t.Fatalf("error.code = %q", code)
	}
}

func TestAdminUnits_ArchiveHidesPublicly(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	id := idOf(t, pool, "units", "slug='u1'")

	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+id, map[string]any{"status": "archived"}), 200)
	r := httptest.NewRecorder()
	s.Routes().ServeHTTP(r, httptest.NewRequest("GET", "/api/v1/units/u1", nil))
	expectStatus(t, r, 404)
}
```

- [ ] **Step 3: Confirm they fail**

Run: `GO 'go test ./internal/http/ -run TestAdminUnits'`
Expected: FAIL.

- [ ] **Step 4: Implement handlers**

Create `api/internal/http/admin_units.go`:

```go
package http

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/unit"
	"github.com/sahel/api/internal/store/postgres/db"
)

type unitInput struct {
	OwnerID       field[pgtype.UUID]       `json:"owner_id"`
	CompoundID    field[pgtype.UUID]       `json:"compound_id"`
	Slug          field[string]            `json:"slug"`
	TitleAr       field[string]            `json:"title_ar"`
	TitleEn       field[string]            `json:"title_en"`
	DescriptionAr field[string]            `json:"description_ar"`
	DescriptionEn field[string]            `json:"description_en"`
	HouseRulesAr  field[string]            `json:"house_rules_ar"`
	HouseRulesEn  field[string]            `json:"house_rules_en"`
	Type          field[db.UnitTypeEnum]   `json:"type"`
	Bedrooms      field[int16]             `json:"bedrooms"`
	Bathrooms     field[int16]             `json:"bathrooms"`
	BaseGuests    field[int16]             `json:"base_guests"`
	MaxGuests     field[int16]             `json:"max_guests"`
	AreaSqm       field[int32]             `json:"area_sqm"`
	Floor         field[int16]             `json:"floor"`
	SeaDistanceM  field[int32]             `json:"sea_distance_m"`
	View          field[db.UnitViewEnum]   `json:"view"`
	RowNumber     field[int16]             `json:"row_number"`
	Amenities     field[[]string]          `json:"amenities"`
	Lat           field[float64]           `json:"lat"`
	Lng           field[float64]           `json:"lng"`
	ExactAddress  field[string]            `json:"exact_address"`
	Status        field[db.UnitStatusEnum] `json:"status"`
}

// requireOnCreate flags numeric fields whose zero value is a legal but
// almost certainly unintended answer.
func (in unitInput) requireOnCreate() error {
	var p problems
	requireSet(&p, "bedrooms", in.Bedrooms.Set)
	requireSet(&p, "bathrooms", in.Bathrooms.Set)
	requireSet(&p, "base_guests", in.BaseGuests.Set)
	requireSet(&p, "max_guests", in.MaxGuests.Set)
	requireSet(&p, "sea_distance_m", in.SeaDistanceM.Set)
	return p.err()
}

func (in unitInput) apply(u *db.Unit) error {
	var p problems
	setField(&p, &u.OwnerID, in.OwnerID, "owner_id")
	setField(&p, &u.CompoundID, in.CompoundID, "compound_id")
	setField(&p, &u.Slug, in.Slug, "slug")
	setField(&p, &u.TitleAr, in.TitleAr, "title_ar")
	setField(&p, &u.TitleEn, in.TitleEn, "title_en")
	setField(&p, &u.DescriptionAr, in.DescriptionAr, "description_ar")
	setField(&p, &u.DescriptionEn, in.DescriptionEn, "description_en")
	setNullable(&u.HouseRulesAr, in.HouseRulesAr)
	setNullable(&u.HouseRulesEn, in.HouseRulesEn)
	setField(&p, &u.Type, in.Type, "type")
	setField(&p, &u.Bedrooms, in.Bedrooms, "bedrooms")
	setField(&p, &u.Bathrooms, in.Bathrooms, "bathrooms")
	setField(&p, &u.BaseGuests, in.BaseGuests, "base_guests")
	setField(&p, &u.MaxGuests, in.MaxGuests, "max_guests")
	setNullable(&u.AreaSqm, in.AreaSqm)
	setNullable(&u.Floor, in.Floor)
	setField(&p, &u.SeaDistanceM, in.SeaDistanceM, "sea_distance_m")
	setField(&p, &u.View, in.View, "view")
	setNullable(&u.RowNumber, in.RowNumber)
	setField(&p, &u.Amenities, in.Amenities, "amenities")
	setCoord(&p, &u.Lat, in.Lat, "lat", 90)
	setCoord(&p, &u.Lng, in.Lng, "lng", 180)
	setNullable(&u.ExactAddress, in.ExactAddress)
	setField(&p, &u.Status, in.Status, "status")

	trimAll(&u.TitleAr, &u.TitleEn, &u.DescriptionAr, &u.DescriptionEn)
	blankToNil(&u.HouseRulesAr)
	blankToNil(&u.HouseRulesEn)
	blankToNil(&u.ExactAddress)
	u.Amenities = normalizeAmenities(u.Amenities)

	if !u.OwnerID.Valid {
		p.add("owner_id is required")
	}
	if !u.CompoundID.Valid {
		p.add("compound_id is required")
	}
	requirePair(&p, "title", u.TitleAr, u.TitleEn)
	requirePair(&p, "description", u.DescriptionAr, u.DescriptionEn)
	checkEnum(&p, "type", string(u.Type), unit.Type(u.Type).Valid())
	checkEnum(&p, "view", string(u.View), unit.View(u.View).Valid())
	checkEnum(&p, "status", string(u.Status), unit.Status(u.Status).Valid())
	if u.Bedrooms < 0 || u.Bathrooms < 0 {
		p.add("bedrooms and bathrooms must be >= 0")
	}
	if u.BaseGuests < 1 {
		p.add("base_guests must be >= 1")
	}
	if u.MaxGuests < u.BaseGuests {
		p.add("max_guests must be >= base_guests")
	}
	if u.SeaDistanceM < 0 {
		p.add("sea_distance_m must be >= 0")
	}
	if u.RowNumber != nil && *u.RowNumber < 1 {
		p.add("row_number must be >= 1 (1 = first row)")
	}
	if u.AreaSqm != nil && *u.AreaSqm <= 0 {
		p.add("area_sqm must be > 0")
	}
	return p.err()
}

func (s *Server) adminListUnits(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListUnits(ctx, queryOpt(r, "slug"))
	if err != nil {
		s.internalError(w, err, "units")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetUnit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	u, err := s.queries.AdminGetUnit(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	images, err := s.queries.AdminListUnitImages(ctx, id)
	if err != nil {
		s.internalError(w, err, "unit images")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		db.Unit
		Images []db.UnitImage `json:"images"`
	}{u, images})
}

func (s *Server) adminCreateUnit(w http.ResponseWriter, r *http.Request) {
	var in unitInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := in.requireOnCreate(); err != nil {
		writeInvalid(w, err)
		return
	}
	u := db.Unit{Status: db.UnitStatusEnum(unit.StatusDraft)}
	if err := in.apply(&u); err != nil {
		writeInvalid(w, err)
		return
	}
	base, explicit, err := resolveSlug(u.Slug, u.TitleEn)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := insertWithSlug(base, explicit, func(sl string) (db.Unit, error) {
		return s.queries.AdminCreateUnit(ctx, db.AdminCreateUnitParams{
			OwnerID: u.OwnerID, CompoundID: u.CompoundID, Slug: sl,
			TitleAr: u.TitleAr, TitleEn: u.TitleEn,
			DescriptionAr: u.DescriptionAr, DescriptionEn: u.DescriptionEn,
			HouseRulesAr: u.HouseRulesAr, HouseRulesEn: u.HouseRulesEn,
			Type: u.Type, Bedrooms: u.Bedrooms, Bathrooms: u.Bathrooms,
			BaseGuests: u.BaseGuests, MaxGuests: u.MaxGuests,
			AreaSqm: u.AreaSqm, Floor: u.Floor, SeaDistanceM: u.SeaDistanceM,
			View: u.View, RowNumber: u.RowNumber, Amenities: u.Amenities,
			Lat: u.Lat, Lng: u.Lng, ExactAddress: u.ExactAddress, Status: u.Status,
		})
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchUnit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	var in unitInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	u, err := s.queries.AdminGetUnit(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	if err := in.apply(&u); err != nil {
		writeInvalid(w, err)
		return
	}
	if err := checkSlug(u.Slug); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateUnit(ctx, db.AdminUpdateUnitParams{
		ID: id, OwnerID: u.OwnerID, CompoundID: u.CompoundID, Slug: u.Slug,
		TitleAr: u.TitleAr, TitleEn: u.TitleEn,
		DescriptionAr: u.DescriptionAr, DescriptionEn: u.DescriptionEn,
		HouseRulesAr: u.HouseRulesAr, HouseRulesEn: u.HouseRulesEn,
		Type: u.Type, Bedrooms: u.Bedrooms, Bathrooms: u.Bathrooms,
		BaseGuests: u.BaseGuests, MaxGuests: u.MaxGuests,
		AreaSqm: u.AreaSqm, Floor: u.Floor, SeaDistanceM: u.SeaDistanceM,
		View: u.View, RowNumber: u.RowNumber, Amenities: u.Amenities,
		Lat: u.Lat, Lng: u.Lng, ExactAddress: u.ExactAddress, Status: u.Status,
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// adminDeleteUnit removes the unit; unit_images rows cascade in the DB.
// Their S3 objects are left for the Phase 7 cleanup job (spec §3.3).
func (s *Server) adminDeleteUnit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteUnit(ctx, id)
	s.finishDelete(w, n, err, "unit")
}
```

- [ ] **Step 5: Register routes**

Append to `registerAdminRoutes`:

```go
	r.Get("/units", s.adminListUnits)
	r.Post("/units", s.adminCreateUnit)
	r.Get("/units/{id}", s.adminGetUnit)
	r.Patch("/units/{id}", s.adminPatchUnit)
	r.Delete("/units/{id}", s.adminDeleteUnit)
```

- [ ] **Step 6: Run tests**

Run: `GO 'go test ./internal/http/ -run TestAdminUnits -v'`
Expected: all PASS. (`adminUnitBody` in the test file is used in Task 9.)

- [ ] **Step 7: Commit**

```bash
git add api/internal/store/postgres/queries/admin_units.sql api/internal/store/postgres/db/ api/internal/http/admin_units.go api/internal/http/admin_units_test.go api/internal/http/router.go
git commit -m "feat(admin): units CRUD"
```

---

## Task 9 — Unit images

**Files:**
- Create: `api/internal/store/postgres/queries/admin_images.sql`, `api/internal/http/admin_images.go`, `api/internal/http/admin_images_test.go`
- Modify: `api/internal/http/router.go`

- [ ] **Step 1: Queries**

Create `api/internal/store/postgres/queries/admin_images.sql`:

```sql
-- name: AdminLockUnit :one
-- Serialises image writes per unit so sort/cover decisions can't race.
SELECT id FROM units WHERE id = $1 FOR UPDATE;

-- name: AdminCreateUnitImage :one
-- Appends at the end of the sort order; the first image becomes the cover.
INSERT INTO unit_images (unit_id, url, sort, is_cover)
VALUES (
  @unit_id, @url,
  (SELECT COALESCE(MAX(sort) + 1, 0) FROM unit_images WHERE unit_id = @unit_id),
  NOT EXISTS (SELECT 1 FROM unit_images WHERE unit_id = @unit_id AND is_cover)
)
RETURNING *;

-- name: AdminGetUnitImage :one
SELECT * FROM unit_images WHERE id = @id AND unit_id = @unit_id;

-- name: AdminClearUnitCover :exec
UPDATE unit_images SET is_cover = false
WHERE unit_id = @unit_id AND is_cover AND id <> @keep_id;

-- name: AdminUpdateUnitImage :one
UPDATE unit_images
SET alt_ar = @alt_ar, alt_en = @alt_en, sort = @sort, is_cover = @is_cover
WHERE id = @id
RETURNING *;

-- name: AdminDeleteUnitImage :one
DELETE FROM unit_images WHERE id = @id AND unit_id = @unit_id RETURNING url;
```

Run sqlc generate. Expected: silent. If sqlc rejects the sub-selects inside `VALUES`, rewrite `AdminCreateUnitImage` as `INSERT … SELECT @unit_id, @url, COALESCE(MAX(sort)+1,0), NOT bool_or(is_cover) IS TRUE FROM unit_images WHERE unit_id=@unit_id RETURNING *`. That version has the same semantics.

- [ ] **Step 2: Write the failing tests**

Create `api/internal/http/admin_images_test.go`:

```go
package http

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sahel/api/internal/store/postgres/db"
)

var (
	pngBytes  = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...)
	jpegBytes = append([]byte("\xff\xd8\xff\xe0"), bytes.Repeat([]byte{0}, 64)...)
)

func upload(t *testing.T, s *Server, unitID, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	fw.Write(content)
	mw.Close()

	req := httptest.NewRequest("POST", "/api/v1/admin/units/"+unitID+"/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.SetBasicAuth("admin", testAdminPassword)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	return rec
}

func TestAdminImages_UploadOrderAndCover(t *testing.T) {
	s, pool, store := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	unitID := idOf(t, pool, "units", "slug='u1'")

	rec := upload(t, s, unitID, "a.png", pngBytes)
	expectStatus(t, rec, 201)
	first := decodeInto[db.UnitImage](t, rec)
	if !first.IsCover || first.Sort != 0 {
		t.Fatalf("first image = %+v, want cover at sort 0", first)
	}
	if !strings.HasPrefix(first.Url, fakeStoreBase+"units/"+unitID+"/") || !strings.HasSuffix(first.Url, ".png") {
		t.Fatalf("url = %q, want units/{unit_id}/{uuid}.png", first.Url)
	}
	if len(store.objects) != 1 {
		t.Fatalf("store has %d objects", len(store.objects))
	}

	second := decodeInto[db.UnitImage](t, upload(t, s, unitID, "b.jpg", jpegBytes))
	if second.IsCover || second.Sort != 1 || !strings.HasSuffix(second.Url, ".jpg") {
		t.Fatalf("second image = %+v", second)
	}

	detail := decodeInto[adminUnitBody](t, adminDo(t, s, "GET", "/units/"+unitID, nil))
	if len(detail.Images) != 2 {
		t.Fatalf("unit detail has %d images", len(detail.Images))
	}
}

func TestAdminImages_UploadRejects(t *testing.T) {
	s, pool, store := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	unitID := idOf(t, pool, "units", "slug='u1'")

	// MIME is sniffed from the bytes, not trusted from the filename.
	rec := upload(t, s, unitID, "evil.png", []byte("#!/bin/sh\necho hi\n"))
	expectStatus(t, rec, 415)

	big := append(append([]byte{}, pngBytes...), bytes.Repeat([]byte{0}, 10<<20)...)
	expectStatus(t, upload(t, s, unitID, "big.png", big), 413)

	expectStatus(t, upload(t, s, zeroUUID, "a.png", pngBytes), 404)

	if len(store.objects) != 0 {
		t.Fatalf("rejected uploads must not reach storage; got %d objects", len(store.objects))
	}
}

func TestAdminImages_PatchCoverAltSort(t *testing.T) {
	s, pool, _ := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	unitID := idOf(t, pool, "units", "slug='u1'")
	a := decodeInto[db.UnitImage](t, upload(t, s, unitID, "a.png", pngBytes))
	b := decodeInto[db.UnitImage](t, upload(t, s, unitID, "b.png", pngBytes))

	rec := adminDo(t, s, "PATCH", "/units/"+unitID+"/images/"+uuidString(b.ID), map[string]any{
		"is_cover": true, "alt_en": "Terrace", "alt_ar": "تراس", "sort": 0,
	})
	expectStatus(t, rec, 200)
	pb := decodeInto[db.UnitImage](t, rec)
	if !pb.IsCover || pb.AltEn == nil || *pb.AltEn != "Terrace" || pb.Sort != 0 {
		t.Fatalf("patched = %+v", pb)
	}

	detail := decodeInto[adminUnitBody](t, adminDo(t, s, "GET", "/units/"+unitID, nil))
	covers := 0
	for _, img := range detail.Images {
		if img.IsCover {
			covers++
			if img.ID != b.ID {
				t.Fatal("cover did not move to b")
			}
		}
	}
	if covers != 1 {
		t.Fatalf("%d covers, want exactly 1", covers)
	}

	// Image must belong to the unit in the path.
	otherUnit := zeroUUID
	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+otherUnit+"/images/"+uuidString(a.ID), map[string]any{"sort": 3}), 404)
	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+unitID+"/images/"+uuidString(a.ID), map[string]any{"sort": -1}), 422)
}

func TestAdminImages_Delete(t *testing.T) {
	s, pool, store := newAdminServer(t)
	mustExec(t, pool, catalogSeedSQL)
	unitID := idOf(t, pool, "units", "slug='u1'")
	img := decodeInto[db.UnitImage](t, upload(t, s, unitID, "a.png", pngBytes))

	path := "/units/" + unitID + "/images/" + uuidString(img.ID)
	expectStatus(t, adminDo(t, s, "DELETE", path, nil), 204)
	expectStatus(t, adminDo(t, s, "DELETE", path, nil), 404)
	if len(store.deleted) != 1 || store.deleted[0] != img.Url {
		t.Fatalf("store.deleted = %v", store.deleted)
	}
}
```

- [ ] **Step 3: Confirm they fail**

Run: `GO 'go test ./internal/http/ -run TestAdminImages'`
Expected: FAIL.

- [ ] **Step 4: Implement handlers**

Create `api/internal/http/admin_images.go`:

```go
package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/store/postgres/db"
)

const maxImageBytes = 10 << 20

// imageExt is the upload MIME allowlist (spec §3.3), keyed by the sniffed
// type, never the client-declared one.
var imageExt = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

func (s *Server) adminUploadUnitImage(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 60*time.Second)
	defer cancel()

	// Check the unit before accepting bytes so a typo'd id can't orphan an object.
	if _, err := s.queries.AdminGetUnit(ctx, unitID); err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}

	const multipartOverhead = 1 << 20
	if r.ContentLength > maxImageBytes+multipartOverhead {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", "images are limited to 10 MB")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+multipartOverhead)
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", `expected a multipart field named "file"`)
		return
	}
	defer file.Close()
	if hdr.Size > maxImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", "images are limited to 10 MB")
		return
	}

	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid_upload", "could not read the file")
		return
	}
	mime := http.DetectContentType(head[:n])
	ext, ok := imageExt[mime]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "only JPEG, PNG and WebP images are accepted")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		s.internalError(w, err, "image upload")
		return
	}

	key := fmt.Sprintf("units/%s/%s.%s", uuidString(unitID), uuidString(newUUID()), ext)
	url, err := s.store.Put(ctx, key, mime, file, hdr.Size)
	if err != nil {
		s.internalError(w, err, "image upload")
		return
	}

	img, err := inTx(ctx, s, func(q *db.Queries) (db.UnitImage, error) {
		if _, err := q.AdminLockUnit(ctx, unitID); err != nil {
			return db.UnitImage{}, err
		}
		return q.AdminCreateUnitImage(ctx, db.AdminCreateUnitImageParams{UnitID: unitID, Url: url})
	})
	if err != nil {
		s.deleteObject(url)
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusCreated, img)
}

type imageInput struct {
	AltAr   field[string] `json:"alt_ar"`
	AltEn   field[string] `json:"alt_en"`
	Sort    field[int16]  `json:"sort"`
	IsCover field[bool]   `json:"is_cover"`
}

func (in imageInput) apply(img *db.UnitImage) error {
	var p problems
	setNullable(&img.AltAr, in.AltAr)
	setNullable(&img.AltEn, in.AltEn)
	setField(&p, &img.Sort, in.Sort, "sort")
	setField(&p, &img.IsCover, in.IsCover, "is_cover")
	blankToNil(&img.AltAr)
	blankToNil(&img.AltEn)
	if img.Sort < 0 {
		p.add("sort must be >= 0")
	}
	return p.err()
}

// adminPatchUnitImage edits alt text and sort, and moves the cover. Setting
// is_cover=true clears the previous cover in the same transaction (spec §4.3).
func (s *Server) adminPatchUnitImage(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	imageID, ok := parseID(w, r, "imageId", "image")
	if !ok {
		return
	}
	var in imageInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	var invalid error
	img, err := inTx(ctx, s, func(q *db.Queries) (db.UnitImage, error) {
		if _, err := q.AdminLockUnit(ctx, unitID); err != nil {
			return db.UnitImage{}, err
		}
		img, err := q.AdminGetUnitImage(ctx, db.AdminGetUnitImageParams{ID: imageID, UnitID: unitID})
		if err != nil {
			return db.UnitImage{}, err
		}
		if invalid = in.apply(&img); invalid != nil {
			return db.UnitImage{}, invalid
		}
		if img.IsCover {
			if err := q.AdminClearUnitCover(ctx, db.AdminClearUnitCoverParams{UnitID: unitID, KeepID: imageID}); err != nil {
				return db.UnitImage{}, err
			}
		}
		return q.AdminUpdateUnitImage(ctx, db.AdminUpdateUnitImageParams{
			ID: imageID, AltAr: img.AltAr, AltEn: img.AltEn, Sort: img.Sort, IsCover: img.IsCover,
		})
	})
	switch {
	case invalid != nil:
		writeInvalid(w, invalid)
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found", "image not found")
	case err != nil:
		s.writeStoreError(w, err, "image")
	default:
		writeJSON(w, http.StatusOK, img)
	}
}

func (s *Server) adminDeleteUnitImage(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	imageID, ok := parseID(w, r, "imageId", "image")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	url, err := s.queries.AdminDeleteUnitImage(ctx, db.AdminDeleteUnitImageParams{ID: imageID, UnitID: unitID})
	if err != nil {
		s.writeStoreError(w, err, "image")
		return
	}
	s.deleteObject(url)
	w.WriteHeader(http.StatusNoContent)
}

// deleteObject removes an object best-effort. The DB row is already gone
// (or never landed), so a failure here only leaves an orphan for Phase 7's
// cleanup job. It's logged, never surfaced.
func (s *Server) deleteObject(url string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.store.Delete(ctx, url); err != nil {
		s.log.Warn().Err(err).Str("url", url).Msg("orphaned object")
	}
}
```

- [ ] **Step 5: Register routes**

Append to `registerAdminRoutes`:

```go
	r.Post("/units/{id}/images", s.adminUploadUnitImage)
	r.Patch("/units/{id}/images/{imageId}", s.adminPatchUnitImage)
	r.Delete("/units/{id}/images/{imageId}", s.adminDeleteUnitImage)
```

- [ ] **Step 6: Run tests**

Run: `GO 'go test ./internal/http/ -run TestAdminImages -v'`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/store/postgres/queries/admin_images.sql api/internal/store/postgres/db/ api/internal/http/admin_images.go api/internal/http/admin_images_test.go api/internal/http/router.go
git commit -m "feat(admin): unit image upload, cover/sort/alt edits, delete"
```

---

## Task 10 — Whole suite + live smoke test

- [ ] **Step 1: Full suite**

Run: `GO 'gofmt -l internal/http internal/storage internal/config; go vet ./... && go test -count=1 ./...'`
Expected: `gofmt` prints nothing for these three dirs; every package `ok`.

- [ ] **Step 2: Restart the stack with the new env**

Make sure `.env` has `ADMIN_PASSWORD` and `S3_PUBLIC_URL` (Task 1 Step 5). Then:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
```

`minio-init` re-runs and applies the anonymous-download policy.

- [ ] **Step 3: Exercise the admin API with curl**

```bash
PW=$(grep ^ADMIN_PASSWORD= .env | cut -d= -f2-)
A="http://localhost:8090/api/v1/admin"
curl -s -o /dev/null -w '%{http_code}\n' $A/units                       # 401
curl -s -u admin:$PW $A/enums                                           # enum lists
AREA=$(curl -s -u admin:$PW -X POST $A/areas -d '{"name_ar":"سيدي عبد الرحمن","name_en":"Sidi Abdel Rahman","region":"north_coast"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')
echo "area=$AREA"
curl -s -u admin:$PW -X DELETE -o /dev/null -w '%{http_code}\n' $A/areas/$AREA   # 204
```

Then upload a real image to the smoke unit `u1` from Phase 2b and fetch it through the public URL:

```bash
U1=$(docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres psql -U sahel -d sahel -tAc "SELECT id FROM units WHERE slug='u1'")
IMG=$(curl -s -u admin:$PW -F "file=@web/public/og.png" $A/units/$U1/images)   # any local PNG/JPEG works
echo "$IMG"
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$(echo "$IMG" | sed 's/.*"url":"\([^"]*\)".*/\1/')"   # 200 image/png
```

Expected: `401`, the enum JSON, `204`, a `unit_images` row whose `url` starts with `http://localhost:9000/sahel-uploads/units/`, and `200 image/png` when fetching it. If `web/public/og.png` doesn't exist, pick any image via `ls web/public`.

- [ ] **Step 4: `git status` clean**

Run: `git status --short`
Expected: nothing tracked is modified.

---

## Done criteria for Phase 2c

- Every route in spec §3.3 exists behind basic auth; no credentials → 401 with a challenge.
- CRUD on areas/compounds/owners/units: happy path, 404 (unknown and malformed id), 409 (`in_use` on referenced delete, `slug_taken` on explicit duplicate slug), 422 (validation and unknown references), all covered by integration tests.
- Derived slugs auto-suffix on collision; explicit slugs must be canonical.
- Image upload: sniffed MIME allowlist, 10 MB cap, key `units/{unit_id}/{uuid}.{ext}`, first image becomes the cover, and the cover flip happens in one transaction with exactly one cover afterwards.
- `GET /admin/enums` returns the five enum lists from `internal/domain`.
- The API refuses to start without `ADMIN_PASSWORD` or the S3 settings.
- `go test ./...` green; the live smoke test shows an uploaded image served from MinIO.

**Handed to Phase 2d (admin UI):** everything above. **Handed to Phase 2e (public UI):** the public search/compound payloads carry no cover image yet. Phase 2e adds `cover_url` to `SearchUnits` / `ListActiveUnitsByCompoundID` when the cards need it.
