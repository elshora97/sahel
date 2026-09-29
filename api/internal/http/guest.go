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
	otpTTL                = 5 * time.Minute
	otpPerPhone           = 3  // per 15 minutes
	otpPerIP              = 10 // per hour
	guestIDContext ctxKey = "guest-id"
)

type ctxKey string

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
			writeError(w, http.StatusUnauthorized, "sign_in_required", "sign in with your phone first")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), guestIDContext, uid)))
	})
}

func guestFrom(r *http.Request) pgtype.UUID {
	id, _ := r.Context().Value(guestIDContext).(pgtype.UUID)
	return id
}

func (s *Server) requestOTP(w http.ResponseWriter, r *http.Request) {
	if s.sms == nil || s.guestSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "unavailable", "phone sign-in is not configured")
		return
	}
	var in struct {
		Phone string `json:"phone"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	phone, err := customer.NormalizePhone(in.Phone)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_phone", err.Error())
		return
	}
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()
	ip := clientIP(r)
	byPhone, err := s.queries.CountRecentOTPsByPhone(ctx, phone)
	if err != nil {
		s.internalError(w, err, "otp")
		return
	}
	byIP, err := s.queries.CountRecentOTPsByIP(ctx, ip)
	if err != nil {
		s.internalError(w, err, "otp")
		return
	}
	if byPhone >= otpPerPhone || byIP >= otpPerIP {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many codes requested; try again later")
		return
	}
	code, err := guestauth.NewCode()
	if err != nil {
		s.internalError(w, err, "otp")
		return
	}
	if err := s.queries.CreateOTP(ctx, db.CreateOTPParams{
		Phone: phone, CodeHash: guestauth.HashCode(s.guestSecret, phone, code),
		ExpiresAt: pgtype.Timestamptz{Time: now().Add(otpTTL), Valid: true}, Ip: ip,
	}); err != nil {
		s.internalError(w, err, "otp")
		return
	}
	if err := s.sms.Send(ctx, phone, "بيت الساحل: كود الدخول "+code+" (Beet Elsahel code)"); err != nil {
		s.internalError(w, err, "send sms")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"phone": phone, "expires_in": int(otpTTL.Seconds())})
}

func (s *Server) verifyOTP(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	phone, err := customer.NormalizePhone(in.Phone)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_phone", err.Error())
		return
	}
	code := strings.TrimSpace(in.Code)
	ctx, cancel := contextWithTimeout(r, 10*time.Second)
	defer cancel()

	var wrong bool
	c, err := inTx(ctx, s, func(q *db.Queries) (db.Customer, error) {
		otp, err := q.LatestOTP(ctx, phone)
		if err != nil {
			return db.Customer{}, err
		}
		if !guestauth.CodeMatches(s.guestSecret, phone, code, otp.CodeHash) {
			wrong = true
			// Committed below so the attempt counts even though sign-in fails.
			return db.Customer{}, q.FailOTP(ctx, otp.ID)
		}
		if err := q.ConsumeOTP(ctx, otp.ID); err != nil {
			return db.Customer{}, err
		}
		return q.UpsertCustomer(ctx, phone)
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows) || wrong:
		writeError(w, http.StatusUnprocessableEntity, "invalid_code", "that code is wrong or has expired")
		return
	case err != nil:
		s.internalError(w, err, "verify otp")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token":      guestauth.SignToken(s.guestSecret, uuidString(c.ID), now(), guestauth.TokenTTL),
		"customer":   c,
		"needs_name": strings.TrimSpace(c.Name) == "",
	})
}

func (s *Server) getMe(w http.ResponseWriter, r *http.Request) {
	c, err := s.queries.GetCustomer(r.Context(), guestFrom(r))
	if err != nil {
		s.writeStoreError(w, err, "customer")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	name := strings.Join(strings.Fields(in.Name), " ")
	if len([]rune(name)) < 2 || len([]rune(name)) > 80 {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", "name must be 2 to 80 characters")
		return
	}
	c, err := s.queries.SetCustomerName(r.Context(), db.SetCustomerNameParams{ID: guestFrom(r), Name: name})
	if err != nil {
		s.writeStoreError(w, err, "customer")
		return
	}
	writeJSON(w, http.StatusOK, c)
}
