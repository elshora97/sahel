package http

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
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

	// Two areas, one compound each, one active and one draft unit per compound.
	mustExec(t, pool, `
		INSERT INTO areas (slug, name_ar, name_en, region, sort_order) VALUES
		  ('nc', 'س', 'North Coast', 'north_coast', 1),
		  ('so', 'س', 'Sokhna',      'sokhna',      2);
		INSERT INTO owners (name, phone) VALUES ('O', '0');
		INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en, beach_type)
		  SELECT id, 'c-'||slug, 'ن', 'C', 'د', 'D', 'sea' FROM areas;
		INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
		                   type, bedrooms, bathrooms, base_guests, max_guests, sea_distance_m, view, status)
		SELECT (SELECT id FROM owners LIMIT 1), c.id, 'u-'||c.slug||'-'||g.status,
		       't', 't', 'd', 'd', 'chalet', 2, 1, 4, 6, 100, 'sea', g.status
		FROM compounds c
		CROSS JOIN (VALUES ('active'::unit_status_enum), ('draft'::unit_status_enum)) AS g(status);
	`)

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

// mustExec runs fixture SQL. With no args pgx uses the simple protocol, so
// one call can carry several statements.
func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("mustExec: %v\n%s", err, sql)
	}
}
