package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/store/postgres/db"
)

func (s *Server) listCompounds(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	page, size := parsePagination(r.URL.Query())
	area := r.URL.Query().Get("area")

	var areaSlug *string
	if area != "" {
		areaSlug = &area
	}

	items, err := s.queries.ListCompounds(ctx, db.ListCompoundsParams{
		AreaSlug:   areaSlug,
		PageLimit:  int32(size),
		PageOffset: int32((page - 1) * size),
	})
	if err != nil {
		s.log.Error().Err(err).Msg("list compounds")
		writeError(w, http.StatusInternalServerError, "internal", "list compounds failed")
		return
	}
	total, err := s.queries.CountCompounds(ctx, areaSlug)
	if err != nil {
		s.log.Error().Err(err).Msg("count compounds")
		writeError(w, http.StatusInternalServerError, "internal", "count compounds failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"page":  page,
		"size":  size,
		"total": total,
	})
}

func (s *Server) getCompound(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	c, err := s.queries.GetCompoundBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "compound not found")
			return
		}
		s.log.Error().Err(err).Msg("get compound")
		writeError(w, http.StatusInternalServerError, "internal", "get compound failed")
		return
	}

	page, size := parsePagination(r.URL.Query())
	units, err := s.queries.ListActiveUnitsByCompoundID(ctx, db.ListActiveUnitsByCompoundIDParams{
		CompoundID: c.ID,
		Limit:      int32(size),
		Offset:     int32((page - 1) * size),
	})
	if err != nil {
		s.log.Error().Err(err).Msg("list compound units")
		writeError(w, http.StatusInternalServerError, "internal", "compound units failed")
		return
	}
	total, err := s.queries.CountActiveUnitsByCompoundID(ctx, c.ID)
	if err != nil {
		s.log.Error().Err(err).Msg("count compound units")
		writeError(w, http.StatusInternalServerError, "internal", "compound units count failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":              c.ID,
		"slug":            c.Slug,
		"name_ar":         c.NameAr,
		"name_en":         c.NameEn,
		"description_ar":  c.DescriptionAr,
		"description_en":  c.DescriptionEn,
		"amenities":       c.Amenities,
		"beach_type":      c.BeachType,
		"gate_info_ar":    c.GateInfoAr,
		"gate_info_en":    c.GateInfoEn,
		"lat":             c.Lat,
		"lng":             c.Lng,
		"cover_image_url": c.CoverImageUrl,
		"is_featured":     c.IsFeatured,
		"area": map[string]any{
			"slug":    c.AreaSlug,
			"name_ar": c.AreaNameAr,
			"name_en": c.AreaNameEn,
		},
		"units": map[string]any{
			"items": units,
			"page":  page,
			"size":  size,
			"total": total,
		},
	})
}
