package http

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/compound"
	"github.com/sahel/api/internal/store/postgres/db"
)

type compoundInput struct {
	AreaID        field[pgtype.UUID]      `json:"area_id"`
	Slug          field[string]           `json:"slug"`
	NameAr        field[string]           `json:"name_ar"`
	NameEn        field[string]           `json:"name_en"`
	DescriptionAr field[string]           `json:"description_ar"`
	DescriptionEn field[string]           `json:"description_en"`
	Amenities     field[[]string]         `json:"amenities"`
	BeachType     field[db.BeachTypeEnum] `json:"beach_type"`
	GateInfoAr    field[string]           `json:"gate_info_ar"`
	GateInfoEn    field[string]           `json:"gate_info_en"`
	Lat           field[float64]          `json:"lat"`
	Lng           field[float64]          `json:"lng"`
	CoverImageUrl field[string]           `json:"cover_image_url"`
	IsFeatured    field[bool]             `json:"is_featured"`
}

func (in compoundInput) apply(c *db.Compound) error {
	var p problems
	setField(&p, &c.AreaID, in.AreaID, "area_id")
	setField(&p, &c.Slug, in.Slug, "slug")
	setField(&p, &c.NameAr, in.NameAr, "name_ar")
	setField(&p, &c.NameEn, in.NameEn, "name_en")
	setField(&p, &c.DescriptionAr, in.DescriptionAr, "description_ar")
	setField(&p, &c.DescriptionEn, in.DescriptionEn, "description_en")
	setField(&p, &c.Amenities, in.Amenities, "amenities")
	setField(&p, &c.BeachType, in.BeachType, "beach_type")
	setNullable(&c.GateInfoAr, in.GateInfoAr)
	setNullable(&c.GateInfoEn, in.GateInfoEn)
	setCoord(&p, &c.Lat, in.Lat, "lat", 90)
	setCoord(&p, &c.Lng, in.Lng, "lng", 180)
	setNullable(&c.CoverImageUrl, in.CoverImageUrl)
	setField(&p, &c.IsFeatured, in.IsFeatured, "is_featured")

	trimAll(&c.NameAr, &c.NameEn, &c.DescriptionAr, &c.DescriptionEn)
	blankToNil(&c.GateInfoAr)
	blankToNil(&c.GateInfoEn)
	blankToNil(&c.CoverImageUrl)
	c.Amenities = normalizeAmenities(c.Amenities)

	if !c.AreaID.Valid {
		p.add("area_id is required")
	}
	requirePair(&p, "name", c.NameAr, c.NameEn)
	requirePair(&p, "description", c.DescriptionAr, c.DescriptionEn)
	checkEnum(&p, "beach_type", string(c.BeachType), compound.BeachType(c.BeachType).Valid())
	return p.err()
}

func (s *Server) adminListCompounds(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListCompounds(ctx, queryOpt(r, "slug"))
	if err != nil {
		s.internalError(w, err, "compounds")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetCompound(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "compound")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	c, err := s.queries.AdminGetCompound(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) adminCreateCompound(w http.ResponseWriter, r *http.Request) {
	var in compoundInput
	if !decodeJSON(w, r, &in) {
		return
	}
	var c db.Compound
	if err := in.apply(&c); err != nil {
		writeInvalid(w, err)
		return
	}
	base, explicit, err := resolveSlug(c.Slug, c.NameEn)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := insertWithSlug(base, explicit, func(sl string) (db.Compound, error) {
		return s.queries.AdminCreateCompound(ctx, db.AdminCreateCompoundParams{
			AreaID: c.AreaID, Slug: sl, NameAr: c.NameAr, NameEn: c.NameEn,
			DescriptionAr: c.DescriptionAr, DescriptionEn: c.DescriptionEn,
			Amenities: c.Amenities, BeachType: c.BeachType,
			GateInfoAr: c.GateInfoAr, GateInfoEn: c.GateInfoEn, Lat: c.Lat, Lng: c.Lng,
			CoverImageUrl: c.CoverImageUrl, IsFeatured: c.IsFeatured,
		})
	})
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchCompound(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "compound")
	if !ok {
		return
	}
	var in compoundInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	c, err := s.queries.AdminGetCompound(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	if err := in.apply(&c); err != nil {
		writeInvalid(w, err)
		return
	}
	if err := checkSlug(c.Slug); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateCompound(ctx, db.AdminUpdateCompoundParams{
		ID: id, AreaID: c.AreaID, Slug: c.Slug, NameAr: c.NameAr, NameEn: c.NameEn,
		DescriptionAr: c.DescriptionAr, DescriptionEn: c.DescriptionEn,
		Amenities: c.Amenities, BeachType: c.BeachType,
		GateInfoAr: c.GateInfoAr, GateInfoEn: c.GateInfoEn, Lat: c.Lat, Lng: c.Lng,
		CoverImageUrl: c.CoverImageUrl, IsFeatured: c.IsFeatured,
	})
	if err != nil {
		s.writeStoreError(w, err, "compound")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteCompound(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "compound")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteCompound(ctx, id)
	s.finishDelete(w, n, err, "compound")
}
