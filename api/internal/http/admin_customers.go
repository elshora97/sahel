package http

import (
	"net/http"
)

// adminListCustomers lists guest accounts with a summary of their bookings;
// ?q= matches the name or phone.
func (s *Server) adminListCustomers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queries.AdminListCustomers(r.Context(), queryOpt(r, "q"))
	if err != nil {
		s.internalError(w, err, "customers")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminGetCustomer(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "customer")
	if !ok {
		return
	}
	c, err := s.queries.AdminGetCustomer(r.Context(), id)
	if err != nil {
		s.writeStoreError(w, err, "customer")
		return
	}
	writeJSON(w, http.StatusOK, c)
}
