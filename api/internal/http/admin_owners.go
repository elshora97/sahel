package http

import (
	"net/http"
	"time"

	"github.com/sahel/api/internal/store/postgres/db"
)

type ownerInput struct {
	Name          field[string] `json:"name"`
	Phone         field[string] `json:"phone"`
	Email         field[string] `json:"email"`
	NationalID    field[string] `json:"national_id"`
	Notes         field[string] `json:"notes"`
	CommissionPct field[int16]  `json:"commission_pct"`
}

func (in ownerInput) apply(o *db.Owner) error {
	var p problems
	setField(&p, &o.Name, in.Name, "name")
	setField(&p, &o.Phone, in.Phone, "phone")
	setNullable(&o.Email, in.Email)
	setNullable(&o.NationalID, in.NationalID)
	setNullable(&o.Notes, in.Notes)
	setField(&p, &o.CommissionPct, in.CommissionPct, "commission_pct")

	trimAll(&o.Name, &o.Phone)
	blankToNil(&o.Email)
	blankToNil(&o.NationalID)
	blankToNil(&o.Notes)

	requireText(&p, "name", o.Name)
	requireText(&p, "phone", o.Phone)
	if o.CommissionPct < 0 || o.CommissionPct > 100 {
		p.add("commission_pct must be between 0 and 100")
	}
	return p.err()
}

func (s *Server) adminListOwners(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	rows, err := s.queries.AdminListOwners(ctx)
	if err != nil {
		s.internalError(w, err, "owners")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetOwner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "owner")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	o, err := s.queries.AdminGetOwner(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (s *Server) adminCreateOwner(w http.ResponseWriter, r *http.Request) {
	var in ownerInput
	if !decodeJSON(w, r, &in) {
		return
	}
	var o db.Owner
	if err := in.apply(&o); err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	created, err := s.queries.AdminCreateOwner(ctx, db.AdminCreateOwnerParams{
		Name: o.Name, Phone: o.Phone, Email: o.Email, NationalID: o.NationalID,
		Notes: o.Notes, CommissionPct: o.CommissionPct,
	})
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchOwner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "owner")
	if !ok {
		return
	}
	var in ownerInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	o, err := s.queries.AdminGetOwner(ctx, id)
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	if err := in.apply(&o); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := s.queries.AdminUpdateOwner(ctx, db.AdminUpdateOwnerParams{
		ID: id, Name: o.Name, Phone: o.Phone, Email: o.Email, NationalID: o.NationalID,
		Notes: o.Notes, CommissionPct: o.CommissionPct,
	})
	if err != nil {
		s.writeStoreError(w, err, "owner")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteOwner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "owner")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	n, err := s.queries.AdminDeleteOwner(ctx, id)
	s.finishDelete(w, n, err, "owner")
}
