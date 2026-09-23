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
	if list[1].AreaNameAr != "ن" {
		t.Fatalf("area_name_ar = %q", list[1].AreaNameAr)
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
