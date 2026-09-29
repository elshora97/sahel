package http

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/customer"
	"github.com/sahel/api/internal/guestauth"
	"github.com/sahel/api/internal/store/postgres/db"
)

const (
	failedLoginsPerPhone        = 10 // per 15 minutes
	failedLoginsPerIP           = 30 // per hour
	registrationsPerIP          = 10 // per hour
	guestIDContext       ctxKey = "guest-id"
)

type ctxKey string

// guestView is a customer as the API returns it: never the password hash.
type guestView struct {
	ID    string `json:"id"`
	Phone string `json:"phone"`
	Name  string `json:"name"`
}

func toGuestView(c db.Customer) guestView {
	return guestView{ID: uuidString(c.ID), Phone: c.Phone, Name: c.Name}
}

func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[len("Bearer "):])
	}
	return ""
}

// guestID is the signed-in customer's id, or "" when the request has no
// valid guest token.
func (s *Server) guestID(r *http.Request) string {
	id, ok := guestauth.VerifyToken(s.guestSecret, bearer(r), now())
	if !ok {
		return ""
	}
	return id
}

// guestAuth requires a valid guest token and puts the customer id in the
// request context.
func (s *Server) guestAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := s.guestID(r)
		var uid pgtype.UUID
		if id == "" || uid.Scan(id) != nil {
			writeError(w, http.StatusUnauthorized, "sign_in_required", "sign in first")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), guestIDContext, uid)))
	})
}

func guestFrom(r *http.Request) pgtype.UUID {
	id, _ := r.Context().Value(guestIDContext).(pgtype.UUID)
	return id
}

func cleanName(in string) string { return strings.Join(strings.Fields(in), " ") }

func validName(name string) bool {
	n := len([]rune(name))
	return n >= 2 && n <= 80
}

func (s *Server) signedIn(w http.ResponseWriter, status int, c db.Customer) {
	writeJSON(w, status, map[string]any{
		"token":    guestauth.SignToken(s.guestSecret, uuidString(c.ID), now(), guestauth.TokenTTL),
		"customer": toGuestView(c),
	})
}

type credentials struct {
	Phone    string `json:"phone"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !decodeJSON(w, r, &in) {
		return
	}
	phone, err := customer.NormalizePhone(in.Phone)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_phone", err.Error())
		return
	}
	name := cleanName(in.Name)
	if !validName(name) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_name", "name must be 2 to 80 characters")
		return
	}
	if len([]rune(in.Password)) < guestauth.MinPasswordLen || len(in.Password) > 72 {
		writeError(w, http.StatusUnprocessableEntity, "weak_password", "password must be 8 to 72 characters")
		return
	}
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	ip := clientIP(r)
	n, err := s.queries.CountRecentRegistrations(ctx, ip)
	if err != nil {
		s.internalError(w, err, "register")
		return
	}
	if n >= registrationsPerIP {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many new accounts from here; try again later")
		return
	}
	hash, err := guestauth.HashPassword(in.Password)
	if err != nil {
		s.internalError(w, err, "register")
		return
	}
	c, err := s.queries.CreateCustomer(ctx, db.CreateCustomerParams{Phone: phone, Name: name, PasswordHash: &hash})
	_ = s.queries.RecordAuthAttempt(ctx, db.RecordAuthAttemptParams{Kind: "register", Phone: phone, Ip: ip, Ok: err == nil})
	if errors.Is(err, pgx.ErrNoRows) {
		// The phone already has an account with a password.
		writeError(w, http.StatusConflict, "phone_taken", "this phone already has an account; sign in instead")
		return
	}
	if err != nil {
		s.internalError(w, err, "register")
		return
	}
	s.signedIn(w, http.StatusCreated, c)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !decodeJSON(w, r, &in) {
		return
	}
	// A malformed phone is treated like a wrong one: same message, same work.
	phone, _ := customer.NormalizePhone(in.Phone)
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	ip := clientIP(r)
	fails, err := s.queries.CountFailedLogins(ctx, db.CountFailedLoginsParams{Phone: phone, Ip: ip})
	if err != nil {
		s.internalError(w, err, "login")
		return
	}
	if fails.ByPhone >= failedLoginsPerPhone || fails.ByIp >= failedLoginsPerIP {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many failed sign-ins; try again later")
		return
	}
	c, err := s.queries.GetCustomerByPhone(ctx, phone)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		s.internalError(w, err, "login")
		return
	}
	hash := ""
	if err == nil && c.PasswordHash != nil {
		hash = *c.PasswordHash
	}
	ok := guestauth.CheckPassword(hash, in.Password)
	_ = s.queries.RecordAuthAttempt(ctx, db.RecordAuthAttemptParams{Kind: "login", Phone: phone, Ip: ip, Ok: ok})
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "that phone number or password is wrong")
		return
	}
	s.signedIn(w, http.StatusOK, c)
}

func (s *Server) getMe(w http.ResponseWriter, r *http.Request) {
	c, err := s.queries.GetCustomer(r.Context(), guestFrom(r))
	if err != nil {
		s.writeStoreError(w, err, "customer")
		return
	}
	writeJSON(w, http.StatusOK, toGuestView(c))
}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	name := cleanName(in.Name)
	if !validName(name) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_name", "name must be 2 to 80 characters")
		return
	}
	c, err := s.queries.SetCustomerName(r.Context(), db.SetCustomerNameParams{ID: guestFrom(r), Name: name})
	if err != nil {
		s.writeStoreError(w, err, "customer")
		return
	}
	writeJSON(w, http.StatusOK, toGuestView(c))
}

// adminSetCustomerPassword is how a guest who forgot their password gets
// back in: the admin sets a new one and tells them by phone.
func (s *Server) adminSetCustomerPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "customer")
	if !ok {
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if len([]rune(in.Password)) < guestauth.MinPasswordLen || len(in.Password) > 72 {
		writeInvalid(w, errString("password must be 8 to 72 characters"))
		return
	}
	hash, err := guestauth.HashPassword(in.Password)
	if err != nil {
		s.internalError(w, err, "set password")
		return
	}
	n, err := s.queries.SetCustomerPassword(r.Context(), db.SetCustomerPasswordParams{ID: id, PasswordHash: &hash})
	switch {
	case err != nil:
		s.internalError(w, err, "set password")
	case n == 0:
		writeError(w, http.StatusNotFound, "not_found", "customer not found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
