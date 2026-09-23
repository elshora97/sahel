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
	// phone missing
	expectStatus(t, adminDo(t, s, "POST", "/owners", map[string]any{"name": "A"}), 422)
	// commission out of range
	expectStatus(t, adminDo(t, s, "POST", "/owners", map[string]any{"name": "A", "phone": "1", "commission_pct": 101}), 422)
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
