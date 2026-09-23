package http

import (
	"crypto/rand"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// parseID reads a UUID path parameter. A malformed id is answered with the
// same 404 as an unknown one: from the client's view neither exists.
func parseID(w http.ResponseWriter, r *http.Request, param, what string) (pgtype.UUID, bool) {
	var id pgtype.UUID
	if err := id.Scan(chi.URLParam(r, param)); err != nil {
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
		return id, false
	}
	return id, true
}

// uuidString formats a UUID in canonical 8-4-4-4-12 lowercase form.
func uuidString(u pgtype.UUID) string {
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// newUUID returns a random (version 4) UUID.
func newUUID() pgtype.UUID {
	var u pgtype.UUID
	if _, err := rand.Read(u.Bytes[:]); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	u.Bytes[6] = u.Bytes[6]&0x0f | 0x40
	u.Bytes[8] = u.Bytes[8]&0x3f | 0x80
	u.Valid = true
	return u
}
