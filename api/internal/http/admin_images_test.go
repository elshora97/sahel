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
	if _, err := fw.Write(content); err != nil {
		t.Fatal(err)
	}
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
	expectStatus(t, upload(t, s, unitID, "evil.png", []byte("#!/bin/sh\necho hi\n")), 415)

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

	// The image must belong to the unit in the path.
	expectStatus(t, adminDo(t, s, "PATCH", "/units/"+zeroUUID+"/images/"+uuidString(a.ID), map[string]any{"sort": 3}), 404)
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
