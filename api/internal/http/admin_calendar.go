package http

import (
	"net/http"
	"time"

	"github.com/sahel/api/internal/store/postgres/db"
)

func (s *Server) adminGetCalendar(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	from, to, err := parseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"), maxCalendarSpan)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	rows, err := s.queries.ListCalendar(r.Context(), db.ListCalendarParams{UnitID: unitID, FromDate: from, ToDate: to})
	if err != nil {
		s.internalError(w, err, "list calendar")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

type calendarEdit struct {
	From      string  `json:"from"`
	To        string  `json:"to"`
	Action    string  `json:"action"` // override | block | unblock | reset
	Price     *int64  `json:"price"`
	MinNights *int16  `json:"min_nights"`
	Note      *string `json:"note"`
}

func (s *Server) adminEditCalendar(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	var in calendarEdit
	if !decodeJSON(w, r, &in) {
		return
	}
	from, to, err := parseRange(in.From, in.To, maxCalendarSpan)
	if err != nil {
		writeInvalid(w, err)
		return
	}
	p := db.OverrideDaysParams{UnitID: unitID, FromDate: from, ToDate: to, Note: in.Note}
	yes, no := true, false
	switch in.Action {
	case "override":
		if in.Price == nil && in.MinNights == nil && in.Note == nil {
			writeInvalid(w, errString("override needs price, min_nights or note"))
			return
		}
		if (in.Price != nil && *in.Price < 0) || (in.MinNights != nil && *in.MinNights < 1) {
			writeInvalid(w, errString("price must be >= 0 and min_nights >= 1"))
			return
		}
		p.Price, p.MinNights = in.Price, in.MinNights
	case "block":
		p.IsAvailable = &no
	case "unblock":
		p.IsAvailable = &yes
	case "reset":
	default:
		writeInvalid(w, errString("action must be override, block, unblock or reset"))
		return
	}

	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	_, err = inTx(ctx, s, func(q *db.Queries) (int64, error) {
		if in.Action == "reset" {
			if err := q.DeleteManualDays(ctx, db.DeleteManualDaysParams{UnitID: unitID, FromDate: from, ToDate: to}); err != nil {
				return 0, err
			}
			return 0, regenerate(ctx, q, unitID, from, to)
		}
		return q.OverrideDays(ctx, p)
	})
	if err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}
	rows, err := s.queries.ListCalendar(ctx, db.ListCalendarParams{UnitID: unitID, FromDate: from, ToDate: to})
	if err != nil {
		s.internalError(w, err, "list calendar")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

type errString string

func (e errString) Error() string { return string(e) }
