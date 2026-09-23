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
