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
