package http

import (
	"net/http"
	"time"

	"github.com/sahel/api/internal/domain/area"
	"github.com/sahel/api/internal/store/postgres/db"
)

type areaInput struct {
	Slug      field[string]        `json:"slug"`
	NameAr    field[string]        `json:"name_ar"`
	NameEn    field[string]        `json:"name_en"`
	Region    field[db.RegionEnum] `json:"region"`
	KmMarker  field[int32]         `json:"km_marker"`
	SortOrder field[int32]         `json:"sort_order"`
}

func (in areaInput) apply(a *db.Area) error {
	var p problems
	setField(&p, &a.Slug, in.Slug, "slug")
	setField(&p, &a.NameAr, in.NameAr, "name_ar")
	setField(&p, &a.NameEn, in.NameEn, "name_en")
	setField(&p, &a.Region, in.Region, "region")
	setNullable(&a.KmMarker, in.KmMarker)
	setField(&p, &a.SortOrder, in.SortOrder, "sort_order")

	trimAll(&a.NameAr, &a.NameEn)
	requirePair(&p, "name", a.NameAr, a.NameEn)
	checkEnum(&p, "region", string(a.Region), area.Region(a.Region).Valid())
	if a.KmMarker != nil && *a.KmMarker < 0 {
		p.add("km_marker must be >= 0")
	}
	return p.err()
}

func (s *Server) adminListAreas(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListAreas(ctx, queryOpt(r, "slug"))
	if err != nil {
		s.internalError(w, err, "areas")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetArea(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "area")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	a, err := s.queries.AdminGetArea(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) adminCreateArea(w http.ResponseWriter, r *http.Request) {
	var in areaInput
	if !decodeJSON(w, r, &in) {
		return
	}
	var a db.Area
	if err := in.apply(&a); err != nil {
		writeInvalid(w, err)
		return
	}
	base, explicit, err := resolveSlug(a.Slug, a.NameEn)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := insertWithSlug(base, explicit, func(sl string) (db.Area, error) {
		return s.queries.AdminCreateArea(ctx, db.AdminCreateAreaParams{
			Slug: sl, NameAr: a.NameAr, NameEn: a.NameEn, Region: a.Region,
			KmMarker: a.KmMarker, SortOrder: a.SortOrder,
		})
	})
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchArea(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "area")
	if !ok {
		return
	}
	var in areaInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	a, err := s.queries.AdminGetArea(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	if err := in.apply(&a); err != nil {
		writeInvalid(w, err)
		return
	}
	if err := checkSlug(a.Slug); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateArea(ctx, db.AdminUpdateAreaParams{
		ID: id, Slug: a.Slug, NameAr: a.NameAr, NameEn: a.NameEn, Region: a.Region,
		KmMarker: a.KmMarker, SortOrder: a.SortOrder,
	})
	if err != nil {
		s.writeStoreError(w, err, "area")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteArea(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "area")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteArea(ctx, id)
	s.finishDelete(w, n, err, "area")
}
