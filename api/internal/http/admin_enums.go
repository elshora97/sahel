package http

import (
	"net/http"

	"github.com/sahel/api/internal/domain/area"
	"github.com/sahel/api/internal/domain/compound"
	"github.com/sahel/api/internal/domain/unit"
)

// adminEnums feeds the admin UI's <select> options from the same Go enums
// that validate writes, so the form can't drift from the database.
func (s *Server) adminEnums(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string][]string{
		"region":      strs(area.All),
		"beach_type":  strs(compound.AllBeachTypes),
		"type":        strs(unit.AllTypes),
		"view":        strs(unit.AllViews),
		"unit_status": strs(unit.AllStatuses),
	})
}

func strs[T ~string](vs []T) []string {
	out := make([]string, len(vs))
	for i, v := range vs {
		out[i] = string(v)
	}
	return out
}
