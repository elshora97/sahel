package http

import "net/http"

// writeError emits the {"error":{"code","message"}} envelope required by
// the spec. Code strings are stable identifiers that clients may switch on;
// messages are human-readable and may change.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}
