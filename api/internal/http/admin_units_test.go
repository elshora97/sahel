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

	// Draft is invisible publicly; activating it makes it visible, without exact_address.
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
	if list[0].SeaDistanceM != 80 {
		t.Fatalf("sea_distance_m = %d", list[0].SeaDistanceM)
	}
	if list[0].CompoundNameAr != "ه" || uuidString(list[0].CompoundID) != compoundID {
		t.Fatalf("list row compound = %q / %s, want ه / %s", list[0].CompoundNameAr, uuidString(list[0].CompoundID), compoundID)
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
