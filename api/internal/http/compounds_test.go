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
