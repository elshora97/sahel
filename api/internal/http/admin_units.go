package http

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/unit"
	"github.com/sahel/api/internal/store/postgres/db"
)

type unitInput struct {
	OwnerID       field[pgtype.UUID]       `json:"owner_id"`
	CompoundID    field[pgtype.UUID]       `json:"compound_id"`
	Slug          field[string]            `json:"slug"`
	TitleAr       field[string]            `json:"title_ar"`
	TitleEn       field[string]            `json:"title_en"`
	DescriptionAr field[string]            `json:"description_ar"`
	DescriptionEn field[string]            `json:"description_en"`
	HouseRulesAr  field[string]            `json:"house_rules_ar"`
	HouseRulesEn  field[string]            `json:"house_rules_en"`
	Type          field[db.UnitTypeEnum]   `json:"type"`
	Bedrooms      field[int16]             `json:"bedrooms"`
	Bathrooms     field[int16]             `json:"bathrooms"`
	BaseGuests    field[int16]             `json:"base_guests"`
	MaxGuests     field[int16]             `json:"max_guests"`
	AreaSqm       field[int32]             `json:"area_sqm"`
	Floor         field[int16]             `json:"floor"`
	SeaDistanceM  field[int32]             `json:"sea_distance_m"`
	View          field[db.UnitViewEnum]   `json:"view"`
	RowNumber     field[int16]             `json:"row_number"`
	Amenities     field[[]string]          `json:"amenities"`
	Lat           field[float64]           `json:"lat"`
	Lng           field[float64]           `json:"lng"`
	ExactAddress  field[string]            `json:"exact_address"`
	Status        field[db.UnitStatusEnum] `json:"status"`
}

// requireOnCreate flags numeric fields whose zero value is a legal but
// almost certainly unintended answer.
func (in unitInput) requireOnCreate() error {
	var p problems
	requireSet(&p, "bedrooms", in.Bedrooms.Set)
	requireSet(&p, "bathrooms", in.Bathrooms.Set)
	requireSet(&p, "base_guests", in.BaseGuests.Set)
	requireSet(&p, "max_guests", in.MaxGuests.Set)
	requireSet(&p, "sea_distance_m", in.SeaDistanceM.Set)
	return p.err()
}

func (in unitInput) apply(u *db.Unit) error {
	var p problems
	setField(&p, &u.OwnerID, in.OwnerID, "owner_id")
	setField(&p, &u.CompoundID, in.CompoundID, "compound_id")
	setField(&p, &u.Slug, in.Slug, "slug")
	setField(&p, &u.TitleAr, in.TitleAr, "title_ar")
	setField(&p, &u.TitleEn, in.TitleEn, "title_en")
	setField(&p, &u.DescriptionAr, in.DescriptionAr, "description_ar")
	setField(&p, &u.DescriptionEn, in.DescriptionEn, "description_en")
	setNullable(&u.HouseRulesAr, in.HouseRulesAr)
	setNullable(&u.HouseRulesEn, in.HouseRulesEn)
	setField(&p, &u.Type, in.Type, "type")
	setField(&p, &u.Bedrooms, in.Bedrooms, "bedrooms")
	setField(&p, &u.Bathrooms, in.Bathrooms, "bathrooms")
	setField(&p, &u.BaseGuests, in.BaseGuests, "base_guests")
	setField(&p, &u.MaxGuests, in.MaxGuests, "max_guests")
	setNullable(&u.AreaSqm, in.AreaSqm)
	setNullable(&u.Floor, in.Floor)
	setField(&p, &u.SeaDistanceM, in.SeaDistanceM, "sea_distance_m")
	setField(&p, &u.View, in.View, "view")
	setNullable(&u.RowNumber, in.RowNumber)
	setField(&p, &u.Amenities, in.Amenities, "amenities")
	setCoord(&p, &u.Lat, in.Lat, "lat", 90)
	setCoord(&p, &u.Lng, in.Lng, "lng", 180)
	setNullable(&u.ExactAddress, in.ExactAddress)
	setField(&p, &u.Status, in.Status, "status")

	trimAll(&u.TitleAr, &u.TitleEn, &u.DescriptionAr, &u.DescriptionEn)
	blankToNil(&u.HouseRulesAr)
	blankToNil(&u.HouseRulesEn)
	blankToNil(&u.ExactAddress)
	u.Amenities = normalizeAmenities(u.Amenities)

	if !u.OwnerID.Valid {
		p.add("owner_id is required")
	}
	if !u.CompoundID.Valid {
		p.add("compound_id is required")
	}
	requirePair(&p, "title", u.TitleAr, u.TitleEn)
	requirePair(&p, "description", u.DescriptionAr, u.DescriptionEn)
	checkEnum(&p, "type", string(u.Type), unit.Type(u.Type).Valid())
	checkEnum(&p, "view", string(u.View), unit.View(u.View).Valid())
	checkEnum(&p, "status", string(u.Status), unit.Status(u.Status).Valid())
	if u.Bedrooms < 0 || u.Bathrooms < 0 {
		p.add("bedrooms and bathrooms must be >= 0")
	}
	if u.BaseGuests < 1 {
		p.add("base_guests must be >= 1")
	}
	if u.MaxGuests < u.BaseGuests {
		p.add("max_guests must be >= base_guests")
	}
	if u.SeaDistanceM < 0 {
		p.add("sea_distance_m must be >= 0")
	}
	if u.RowNumber != nil && *u.RowNumber < 1 {
		p.add("row_number must be >= 1 (1 = first row)")
	}
	if u.AreaSqm != nil && *u.AreaSqm <= 0 {
		p.add("area_sqm must be > 0")
	}
	return p.err()
}

func (s *Server) adminListUnits(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListUnits(ctx, queryOpt(r, "slug"))
	if err != nil {
		s.internalError(w, err, "units")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetUnit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	u, err := s.queries.AdminGetUnit(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	images, err := s.queries.AdminListUnitImages(ctx, id)
	if err != nil {
		s.internalError(w, err, "unit images")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		db.Unit
		Images []db.UnitImage `json:"images"`
	}{u, images})
}

func (s *Server) adminCreateUnit(w http.ResponseWriter, r *http.Request) {
	var in unitInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := in.requireOnCreate(); err != nil {
		writeInvalid(w, err)
		return
	}
	u := db.Unit{Status: db.UnitStatusEnum(unit.StatusDraft)}
	if err := in.apply(&u); err != nil {
		writeInvalid(w, err)
		return
	}
	base, explicit, err := resolveSlug(u.Slug, u.TitleEn)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := insertWithSlug(base, explicit, func(sl string) (db.Unit, error) {
		return s.queries.AdminCreateUnit(ctx, db.AdminCreateUnitParams{
			OwnerID: u.OwnerID, CompoundID: u.CompoundID, Slug: sl,
			TitleAr: u.TitleAr, TitleEn: u.TitleEn,
			DescriptionAr: u.DescriptionAr, DescriptionEn: u.DescriptionEn,
			HouseRulesAr: u.HouseRulesAr, HouseRulesEn: u.HouseRulesEn,
			Type: u.Type, Bedrooms: u.Bedrooms, Bathrooms: u.Bathrooms,
			BaseGuests: u.BaseGuests, MaxGuests: u.MaxGuests,
			AreaSqm: u.AreaSqm, Floor: u.Floor, SeaDistanceM: u.SeaDistanceM,
			View: u.View, RowNumber: u.RowNumber, Amenities: u.Amenities,
			Lat: u.Lat, Lng: u.Lng, ExactAddress: u.ExactAddress, Status: u.Status,
		})
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchUnit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	var in unitInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	u, err := s.queries.AdminGetUnit(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	if err := in.apply(&u); err != nil {
		writeInvalid(w, err)
		return
	}
	if err := checkSlug(u.Slug); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateUnit(ctx, db.AdminUpdateUnitParams{
		ID: id, OwnerID: u.OwnerID, CompoundID: u.CompoundID, Slug: u.Slug,
		TitleAr: u.TitleAr, TitleEn: u.TitleEn,
		DescriptionAr: u.DescriptionAr, DescriptionEn: u.DescriptionEn,
		HouseRulesAr: u.HouseRulesAr, HouseRulesEn: u.HouseRulesEn,
		Type: u.Type, Bedrooms: u.Bedrooms, Bathrooms: u.Bathrooms,
		BaseGuests: u.BaseGuests, MaxGuests: u.MaxGuests,
		AreaSqm: u.AreaSqm, Floor: u.Floor, SeaDistanceM: u.SeaDistanceM,
		View: u.View, RowNumber: u.RowNumber, Amenities: u.Amenities,
		Lat: u.Lat, Lng: u.Lng, ExactAddress: u.ExactAddress, Status: u.Status,
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// adminDeleteUnit removes the unit; unit_images rows cascade in the DB.
// Their S3 objects are left for the Phase 7 cleanup job (spec §3.3).
func (s *Server) adminDeleteUnit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteUnit(ctx, id)
	s.finishDelete(w, n, err, "unit")
}
