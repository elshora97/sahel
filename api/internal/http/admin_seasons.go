package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/store/postgres/db"
)

type seasonInput struct {
	NameAr             field[string]  `json:"name_ar"`
	NameEn             field[string]  `json:"name_en"`
	StartDate          field[string]  `json:"start_date"`
	EndDate            field[string]  `json:"end_date"`
	NightlyPrice       field[int64]   `json:"nightly_price"`
	MinNights          field[int16]   `json:"min_nights"`
	AllowedCheckinDays field[[]int16] `json:"allowed_checkin_days"`
	WeekendUpliftPct   field[int16]   `json:"weekend_uplift_pct"`
	Priority           field[int32]   `json:"priority"`
}

func (in seasonInput) apply(s *db.Season) error {
	var p problems
	setField(&p, &s.NameAr, in.NameAr, "name_ar")
	setField(&p, &s.NameEn, in.NameEn, "name_en")
	if in.StartDate.Set {
		t, err := parseDate(in.StartDate.V)
		if err != nil {
			p.add("start_date: %v", err)
		}
		s.StartDate = t
	}
	if in.EndDate.Set {
		t, err := parseDate(in.EndDate.V)
		if err != nil {
			p.add("end_date: %v", err)
		}
		s.EndDate = t
	}
	setField(&p, &s.NightlyPrice, in.NightlyPrice, "nightly_price")
	setField(&p, &s.MinNights, in.MinNights, "min_nights")
	setField(&p, &s.AllowedCheckinDays, in.AllowedCheckinDays, "allowed_checkin_days")
	setField(&p, &s.WeekendUpliftPct, in.WeekendUpliftPct, "weekend_uplift_pct")
	setField(&p, &s.Priority, in.Priority, "priority")

	s.NameAr, s.NameEn = strings.TrimSpace(s.NameAr), strings.TrimSpace(s.NameEn)
	requirePair(&p, "name", s.NameAr, s.NameEn)
	if s.StartDate.IsZero() || s.EndDate.IsZero() {
		p.add("start_date and end_date are required")
	} else if s.EndDate.Before(s.StartDate) {
		p.add("end_date must not be before start_date")
	} else if int(s.EndDate.Sub(s.StartDate).Hours()/24) > maxCalendarSpan {
		p.add("a season can span at most %d days", maxCalendarSpan)
	}
	if s.NightlyPrice <= 0 {
		p.add("nightly_price must be > 0")
	}
	if s.MinNights < 1 {
		p.add("min_nights must be >= 1")
	}
	if s.WeekendUpliftPct < 0 || s.WeekendUpliftPct > 300 {
		p.add("weekend_uplift_pct must be between 0 and 300")
	}
	seen := map[int16]bool{}
	days := s.AllowedCheckinDays[:0:0]
	for _, d := range s.AllowedCheckinDays {
		if d < 0 || d > 6 {
			p.add("allowed_checkin_days holds weekdays 0 (Sunday) to 6 (Saturday)")
			break
		}
		if !seen[d] {
			seen[d] = true
			days = append(days, d)
		}
	}
	s.AllowedCheckinDays = days
	return p.err()
}

func (s *Server) adminListSeasons(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	rows, err := s.queries.ListSeasons(r.Context(), id)
	if err != nil {
		s.internalError(w, err, "list seasons")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminCreateSeason(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	var in seasonInput
	if !decodeJSON(w, r, &in) {
		return
	}
	season := db.Season{MinNights: 1, AllowedCheckinDays: []int16{}}
	if err := in.apply(&season); err != nil {
		writeInvalid(w, err)
		return
	}
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	created, err := inTx(ctx, s, func(q *db.Queries) (db.Season, error) {
		c, err := q.CreateSeason(ctx, db.CreateSeasonParams{
			UnitID: unitID, NameAr: season.NameAr, NameEn: season.NameEn,
			StartDate: season.StartDate, EndDate: season.EndDate, NightlyPrice: season.NightlyPrice,
			MinNights: season.MinNights, AllowedCheckinDays: season.AllowedCheckinDays,
			WeekendUpliftPct: season.WeekendUpliftPct, Priority: season.Priority,
		})
		if err != nil {
			return c, err
		}
		return c, regenerate(ctx, q, unitID, c.StartDate, c.EndDate)
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminPatchSeason(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	seasonID, ok := parseID(w, r, "seasonId", "season")
	if !ok {
		return
	}
	var in seasonInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	old, err := s.queries.GetSeason(ctx, db.GetSeasonParams{ID: seasonID, UnitID: unitID})
	if err != nil {
		s.writeStoreError(w, err, "season")
		return
	}
	next := old
	if err := in.apply(&next); err != nil {
		writeInvalid(w, err)
		return
	}
	updated, err := inTx(ctx, s, func(q *db.Queries) (db.Season, error) {
		u, err := q.UpdateSeason(ctx, db.UpdateSeasonParams{
			ID: seasonID, UnitID: unitID, NameAr: next.NameAr, NameEn: next.NameEn,
			StartDate: next.StartDate, EndDate: next.EndDate, NightlyPrice: next.NightlyPrice,
			MinNights: next.MinNights, AllowedCheckinDays: next.AllowedCheckinDays,
			WeekendUpliftPct: next.WeekendUpliftPct, Priority: next.Priority,
		})
		if err != nil {
			return u, err
		}
		// Dates the season left must fall back to whatever else covers them.
		from, to, _ := spanOf(old, u)
		return u, regenerate(ctx, q, unitID, from, to)
	})
	if err != nil {
		s.writeStoreError(w, err, "season")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) adminDeleteSeason(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	seasonID, ok := parseID(w, r, "seasonId", "season")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	_, err := inTx(ctx, s, func(q *db.Queries) (db.Season, error) {
		d, err := q.DeleteSeason(ctx, db.DeleteSeasonParams{ID: seasonID, UnitID: unitID})
		if err != nil {
			return d, err
		}
		return d, regenerate(ctx, q, unitID, d.StartDate, d.EndDate)
	})
	if err != nil {
		s.writeStoreError(w, err, "season")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// adminCopySeasons replaces this unit's seasons with copies of another's.
func (s *Server) adminCopySeasons(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	var in struct {
		FromUnitID pgtype.UUID `json:"from_unit_id"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if !in.FromUnitID.Valid || in.FromUnitID == unitID {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", "from_unit_id must name another unit")
		return
	}
	ctx, cancel := contextWithTimeout(r, 20*time.Second)
	defer cancel()
	copied, err := inTx(ctx, s, func(q *db.Queries) ([]db.Season, error) {
		old, err := q.ListSeasons(ctx, unitID)
		if err != nil {
			return nil, err
		}
		if err := q.DeleteUnitSeasons(ctx, unitID); err != nil {
			return nil, err
		}
		c, err := q.CopySeasons(ctx, db.CopySeasonsParams{ToUnitID: unitID, FromUnitID: in.FromUnitID})
		if err != nil {
			return nil, err
		}
		if from, to, ok := spanOf(append(old, c...)...); ok {
			return c, regenerate(ctx, q, unitID, from, to)
		}
		return c, nil
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusOK, copied)
}
