package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func (s *Server) listAreas(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	rows, err := s.queries.ListAreasWithUnitCount(ctx)
	if err != nil {
		s.log.Error().Err(err).Msg("list areas")
		writeError(w, http.StatusInternalServerError, "internal", "list areas failed")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) getArea(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	area, err := s.queries.GetAreaBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "area not found")
			return
		}
		s.log.Error().Err(err).Msg("get area")
		writeError(w, http.StatusInternalServerError, "internal", "get area failed")
		return
	}

	featured, err := s.queries.ListFeaturedCompoundsByAreaID(ctx, area.ID)
	if err != nil {
		s.log.Error().Err(err).Msg("list featured compounds")
		writeError(w, http.StatusInternalServerError, "internal", "featured compounds failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":                 area.ID,
		"slug":               area.Slug,
		"name_ar":            area.NameAr,
		"name_en":            area.NameEn,
		"region":             area.Region,
		"km_marker":          area.KmMarker,
		"sort_order":         area.SortOrder,
		"featured_compounds": featured,
	})
}
