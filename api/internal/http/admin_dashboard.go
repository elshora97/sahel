package http

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

const (
	// maxBlockNights bounds one block, so a typo can't close a unit for years.
	maxBlockNights = 180
	// maxTimelineDays bounds one timeline read.
	maxTimelineDays = 31
	maxBlockNote    = 200
)

var errBlockClashesBooking = errors.New("an occupying booking overlaps the block")

type blockRequest struct {
	Start string `json:"start"`
	End   string `json:"end"`
	Note  string `json:"note"`
}

// adminCreateBlock closes a unit's nights [start, end) to guests. It holds the
// unit's row lock, as booking does, so a block and a booking never share a night.
func (s *Server) adminCreateBlock(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	var in blockRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	start, end, err := parseRange(in.Start, in.End, maxBlockNights)
	if err == nil && !end.After(start) {
		err = errors.New("end must be after start")
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_range", err.Error())
		return
	}
	note := strings.TrimSpace(in.Note)
	if len([]rune(note)) > maxBlockNote {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", "the note can be at most 200 characters")
		return
	}
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	block, err := inTx(ctx, s, func(q *db.Queries) (db.CreateBlockRow, error) {
		if _, err := q.LockUnit(ctx, unitID); err != nil {
			return db.CreateBlockRow{}, err
		}
		n, err := q.CountBookingsInRange(ctx, db.CountBookingsInRangeParams{UnitID: unitID, StartDate: start, EndDate: end})
		if err != nil {
			return db.CreateBlockRow{}, err
		}
		if n > 0 {
			return db.CreateBlockRow{}, errBlockClashesBooking
		}
		return q.CreateBlock(ctx, db.CreateBlockParams{UnitID: unitID, StartDate: start, EndDate: end, Note: note})
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found", "unit not found")
	case errors.Is(err, errBlockClashesBooking):
		writeError(w, http.StatusConflict, "dates_taken", "a booking already holds some of these nights")
	case pgCode(err) == pgExclusionViolation:
		writeError(w, http.StatusConflict, "overlaps_block", "some of these nights are already blocked")
	case err != nil:
		s.internalError(w, err, "create block")
	default:
		writeJSON(w, http.StatusCreated, toBlock(block.ID, block.UnitID, block.StartDate, block.EndDate, block.Note))
	}
}

func (s *Server) adminDeleteBlock(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "block")
	if !ok {
		return
	}
	n, err := s.queries.DeleteBlock(r.Context(), id)
	s.finishDelete(w, n, err, "block")
}

type blockView struct {
	ID     string `json:"id"`
	UnitID string `json:"unit_id"`
	Start  string `json:"start"`
	End    string `json:"end"`
	Note   string `json:"note"`
}

func toBlock(id, unitID pgtype.UUID, start, end time.Time, note string) blockView {
	return blockView{ID: uuidString(id), UnitID: uuidString(unitID), Start: start.Format(pricing.DateLayout), End: end.Format(pricing.DateLayout), Note: note}
}

type timelineBooking struct {
	ID           string `json:"id"`
	Ref          string `json:"ref"`
	Status       string `json:"status"`
	CheckIn      string `json:"check_in"`
	CheckOut     string `json:"check_out"`
	CustomerName string `json:"customer_name"`
}

type timelineUnit struct {
	ID             string            `json:"id"`
	Slug           string            `json:"slug"`
	TitleAr        string            `json:"title_ar"`
	TitleEn        string            `json:"title_en"`
	Status         string            `json:"status"`
	CompoundNameAr string            `json:"compound_name_ar"`
	CompoundNameEn string            `json:"compound_name_en"`
	Bookings       []timelineBooking `json:"bookings"`
	Blocks         []blockView       `json:"blocks"`
}

// adminTimeline lists every unit that isn't archived, with the occupying
// bookings and blocks that touch the nights [from, from+days).
func (s *Server) adminTimeline(w http.ResponseWriter, r *http.Request) {
	from, err := parseDate(r.URL.Query().Get("from"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_param", err.Error())
		return
	}
	days := 14
	if v := r.URL.Query().Get("days"); v != "" {
		days, err = strconv.Atoi(v)
		if err != nil || days < 1 || days > maxTimelineDays {
			writeError(w, http.StatusBadRequest, "invalid_param", "days must be between 1 and 31")
			return
		}
	}
	to := from.AddDate(0, 0, days)
	ctx := r.Context()
	units, err := s.queries.TimelineUnits(ctx)
	if err != nil {
		s.internalError(w, err, "timeline units")
		return
	}
	bookings, err := s.queries.TimelineBookings(ctx, db.TimelineBookingsParams{FromDate: from, ToDate: to})
	if err != nil {
		s.internalError(w, err, "timeline bookings")
		return
	}
	blocks, err := s.queries.TimelineBlocks(ctx, db.TimelineBlocksParams{FromDate: from, ToDate: to})
	if err != nil {
		s.internalError(w, err, "timeline blocks")
		return
	}
	out := make([]timelineUnit, len(units))
	index := make(map[[16]byte]int, len(units))
	for i, u := range units {
		index[u.ID.Bytes] = i
		out[i] = timelineUnit{
			ID: uuidString(u.ID), Slug: u.Slug, TitleAr: u.TitleAr, TitleEn: u.TitleEn, Status: string(u.Status),
			CompoundNameAr: u.CompoundNameAr, CompoundNameEn: u.CompoundNameEn,
			Bookings: []timelineBooking{}, Blocks: []blockView{},
		}
	}
	for _, b := range bookings {
		if i, ok := index[b.UnitID.Bytes]; ok {
			out[i].Bookings = append(out[i].Bookings, timelineBooking{
				ID: uuidString(b.ID), Ref: b.Ref, Status: string(b.Status),
				CheckIn: b.CheckIn.Format(pricing.DateLayout), CheckOut: b.CheckOut.Format(pricing.DateLayout), CustomerName: b.CustomerName,
			})
		}
	}
	for _, k := range blocks {
		if i, ok := index[k.UnitID.Bytes]; ok {
			out[i].Blocks = append(out[i].Blocks, toBlock(k.ID, k.UnitID, k.StartDate, k.EndDate, k.Note))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from": from.Format(pricing.DateLayout), "days": days, "today": cairoToday().Format(pricing.DateLayout), "units": out,
	})
}

type movement struct {
	ID            string `json:"id"`
	Ref           string `json:"ref"`
	Status        string `json:"status"`
	CheckIn       string `json:"check_in"`
	CheckOut      string `json:"check_out"`
	Nights        int32  `json:"nights"`
	Guests        int16  `json:"guests"`
	CustomerName  string `json:"customer_name"`
	CustomerPhone string `json:"customer_phone"`
	UnitID        string `json:"unit_id"`
	UnitTitleAr   string `json:"unit_title_ar"`
	UnitTitleEn   string `json:"unit_title_en"`
}

// adminToday is the dashboard's first screen: today's arrivals and
// departures in Cairo, and the numbers around them.
func (s *Server) adminToday(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	today := cairoToday()
	rows, err := s.queries.TodayMovements(ctx, today)
	if err != nil {
		s.internalError(w, err, "today movements")
		return
	}
	counts, err := s.queries.TodayCounts(ctx, today)
	if err != nil {
		s.internalError(w, err, "today counts")
		return
	}
	arrivals, departures := []movement{}, []movement{}
	for _, b := range rows {
		m := movement{
			ID: uuidString(b.ID), Ref: b.Ref, Status: string(b.Status),
			CheckIn: b.CheckIn.Format(pricing.DateLayout), CheckOut: b.CheckOut.Format(pricing.DateLayout),
			Guests: b.Guests, CustomerName: b.CustomerName, CustomerPhone: b.CustomerPhone,
			UnitID: uuidString(b.UnitID), UnitTitleAr: b.UnitTitleAr, UnitTitleEn: b.UnitTitleEn,
		}
		if b.Nights != nil {
			m.Nights = *b.Nights
		}
		if b.CheckIn.Equal(today) {
			arrivals = append(arrivals, m)
		}
		if b.CheckOut.Equal(today) {
			departures = append(departures, m)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"today":           today.Format(pricing.DateLayout),
		"arrivals":        arrivals,
		"departures":      departures,
		"staying_tonight": counts.StayingTonight,
		"holds_expiring":  counts.HoldsExpiring,
		"active_units":    counts.ActiveUnits,
		"occupied_nights": counts.OccupiedNights,
		// Nights on offer over the next seven: every active unit, every night.
		"week_nights": counts.ActiveUnits * 7,
	})
}
