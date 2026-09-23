package http

import (
	"crypto/subtle"
	"net/http"
)

// adminAuth gates the admin subtree with HTTP Basic auth against the single
// shared ADMIN_PASSWORD (spec §6). The username is ignored. An empty
// configured password rejects everything; it never matches an empty guess.
func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, pw, ok := r.BasicAuth()
		if !ok || s.adminPassword == "" ||
			subtle.ConstantTimeCompare([]byte(pw), []byte(s.adminPassword)) != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="sahel-admin", charset="UTF-8"`)
			writeError(w, http.StatusUnauthorized, "unauthorized", "admin credentials required")
			return
		}
		next.ServeHTTP(w, r)
	})
}
