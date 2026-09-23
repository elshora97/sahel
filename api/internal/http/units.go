package http

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/domain/unit"
	"github.com/sahel/api/internal/store/postgres/db"
)

var allowedSorts = map[string]bool{
	"sea_distance_asc": true,
	"bedrooms_desc":    true,
	"created_desc":     true,
}

func (s *Server) searchUnits(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	q := r.URL.Query()
	page, size := parsePagination(q)

	params := db.SearchUnitsParams{
		PageLimit:  int32(size),
		PageOffset: int32((page - 1) * size),
		SortKey:    normSort(q.Get("sort")),
	}
	if v := q.Get("area"); v != "" {
		params.AreaSlug = &v
	}
	if v := q.Get("compound"); v != "" {
		params.CompoundSlug = &v
	}
	if v := q.Get("type"); v != "" {
		if _, err := unit.ParseType(v); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_param", "type: "+err.Error())
			return
		}
		params.UnitType = db.NullUnitTypeEnum{UnitTypeEnum: db.UnitTypeEnum(v), Valid: true}
	}
	if v := q.Get("view"); v != "" {
		if _, err := unit.ParseView(v); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_param", "view: "+err.Error())
			return
		}
		params.UnitView = db.NullUnitViewEnum{UnitViewEnum: db.UnitViewEnum(v), Valid: true}
	}
	if n, ok := atoiOpt(q.Get("guests")); ok {
		params.Guests = &n
	}
	if n, ok := atoiOpt(q.Get("bedrooms")); ok {
		params.Bedrooms = &n
	}
	if n, ok := atoiOpt(q.Get("maxSeaDistance")); ok {
		params.MaxSeaDistance = &n
	}

	items, err := s.queries.SearchUnits(ctx, params)
	if err != nil {
		s.log.Error().Err(err).Msg("search units")
		writeError(w, http.StatusInternalServerError, "internal", "search failed")
		return
	}

	total, err := s.queries.CountSearchUnits(ctx, db.CountSearchUnitsParams{
		AreaSlug:       params.AreaSlug,
		CompoundSlug:   params.CompoundSlug,
		UnitType:       params.UnitType,
		UnitView:       params.UnitView,
		Guests:         params.Guests,
		Bedrooms:       params.Bedrooms,
		MaxSeaDistance: params.MaxSeaDistance,
	})
	if err != nil {
		s.log.Error().Err(err).Msg("count units")
		writeError(w, http.StatusInternalServerError, "internal", "count failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"page":  page,
		"size":  size,
		"total": total,
	})
}

func (s *Server) getUnit(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	u, err := s.queries.GetPublicUnitBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "unit not found")
			return
		}
		s.log.Error().Err(err).Msg("get unit")
		writeError(w, http.StatusInternalServerError, "internal", "get unit failed")
		return
	}
	images, err := s.queries.ListImagesByUnitID(ctx, u.ID)
	if err != nil {
		s.log.Error().Err(err).Msg("list unit images")
		writeError(w, http.StatusInternalServerError, "internal", "images failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":             u.ID,
		"slug":           u.Slug,
		"title_ar":       u.TitleAr,
		"title_en":       u.TitleEn,
		"description_ar": u.DescriptionAr,
		"description_en": u.DescriptionEn,
		"house_rules_ar": u.HouseRulesAr,
		"house_rules_en": u.HouseRulesEn,
		"type":           u.Type,
		"bedrooms":       u.Bedrooms,
		"bathrooms":      u.Bathrooms,
		"base_guests":    u.BaseGuests,
		"max_guests":     u.MaxGuests,
		"area_sqm":       u.AreaSqm,
		"floor":          u.Floor,
		"sea_distance_m": u.SeaDistanceM,
		"view":           u.View,
		"row_number":     u.RowNumber,
		"amenities":      u.Amenities,
		"lat":            u.Lat,
		"lng":            u.Lng,
		"status":         u.Status,
		// deliberate: no exact_address
		"compound": map[string]any{
			"id":      u.CompoundIDOut,
			"slug":    u.CompoundSlug,
			"name_ar": u.CompoundNameAr,
			"name_en": u.CompoundNameEn,
		},
		"area": map[string]any{
			"id":      u.AreaID,
			"slug":    u.AreaSlug,
			"name_ar": u.AreaNameAr,
			"name_en": u.AreaNameEn,
		},
		"images":     images,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	})
}

func normSort(s string) string {
	if allowedSorts[s] {
		return s
	}
	return "created_desc"
}

func atoiOpt(s string) (int32, bool) {
	if s == "" {
		return 0, false
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return 0, false
	}
	return int32(n), true
}
