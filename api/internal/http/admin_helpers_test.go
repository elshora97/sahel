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
