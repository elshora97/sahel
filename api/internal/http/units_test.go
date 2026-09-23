package http

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
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

type unitSearchBody struct {
	Items []map[string]any `json:"items"`
	Page  int              `json:"page"`
	Size  int              `json:"size"`
	Total int              `json:"total"`
}

func searchUnits(t *testing.T, s *Server, query string) (int, unitSearchBody) {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/v1/units"+query, nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)

	var body unitSearchBody
	if rec.Code == 200 {
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
	}
	return rec.Code, body
}

func TestSearchUnits_NoFilters_OnlyActive(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	code, body := searchUnits(t, s, "")
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if body.Total != 3 || len(body.Items) != 3 {
		t.Fatalf("total=%d items=%d, want 3/3 (active only)", body.Total, len(body.Items))
	}
}

func TestSearchUnits_FilterByArea(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	_, body := searchUnits(t, s, "?area=nc")
	if body.Total != 2 {
		t.Fatalf("total=%d, want 2 (2 active in nc)", body.Total)
	}
}

func TestSearchUnits_FilterByGuestsAndBedrooms(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	// max_guests>=8 AND bedrooms>=4 → only nc-villa-4br
	_, body := searchUnits(t, s, "?guests=8&bedrooms=4")
	if body.Total != 1 || len(body.Items) != 1 || body.Items[0]["slug"] != "nc-villa-4br" {
		t.Fatalf("got %+v", body)
	}
}

func TestSearchUnits_FilterByTypeAndView(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	_, body := searchUnits(t, s, "?type=villa&view=lagoon")
	if body.Total != 1 || len(body.Items) != 1 || body.Items[0]["slug"] != "nc-villa-4br" {
		t.Fatalf("got %+v", body)
	}
}

func TestSearchUnits_InvalidTypeIs400(t *testing.T) {
	pool := testsupport.Pool(t)
	s := NewServer(pool, zerolog.Nop(), "test")

	if code, _ := searchUnits(t, s, "?type=castle"); code != 400 {
		t.Fatalf("status=%d, want 400", code)
	}
}

func TestSearchUnits_SortSeaDistanceAsc(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	_, body := searchUnits(t, s, "?sort=sea_distance_asc")
	if len(body.Items) == 0 || body.Items[0]["slug"] != "so-chalet" {
		t.Fatalf("got %+v, want so-chalet (20m) first", body.Items)
	}
}

func TestSearchUnits_SortBedroomsDesc(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	_, body := searchUnits(t, s, "?sort=bedrooms_desc")
	if len(body.Items) == 0 || body.Items[0]["slug"] != "nc-villa-4br" {
		t.Fatalf("got %+v, want nc-villa-4br (4br) first", body.Items)
	}
}

func TestSearchUnits_MaxSize60(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	_, body := searchUnits(t, s, "?size=500")
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
	if strings.Contains(body, "exact_address") {
		t.Fatalf("response leaks exact_address: %s", body)
	}
	if strings.Contains(body, "SECRET-") {
		t.Fatalf("response leaks SECRET-N value: %s", body)
	}
	if !strings.Contains(body, `"slug":"nc-chalet-2br"`) {
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

func TestGetUnit_DraftIs404(t *testing.T) {
	pool := testsupport.Pool(t)
	mustExec(t, pool, unitSeedSQL)
	s := NewServer(pool, zerolog.Nop(), "test")

	req := httptest.NewRequest("GET", "/api/v1/units/nc-draft", nil)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("status=%d, want 404", rec.Code)
	}
}
