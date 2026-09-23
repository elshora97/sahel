package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sahel/api/internal/slug"
	"github.com/sahel/api/internal/store/postgres/db"
)

const (
	pgUniqueViolation = "23505"
	pgFKViolation     = "23503"
	pgCheckViolation  = "23514"
)

func pgCode(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

// writeStoreError maps a query error from a get/insert/update to the admin
// error envelope. what names the entity ("unit") for messages.
func (s *Server) writeStoreError(w http.ResponseWriter, err error, what string) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
	case pgCode(err) == pgUniqueViolation:
		writeError(w, http.StatusConflict, "slug_taken", "that slug is already used by another "+what)
	case pgCode(err) == pgFKViolation:
		writeError(w, http.StatusUnprocessableEntity, "invalid_reference", "a referenced record does not exist")
	case pgCode(err) == pgCheckViolation:
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
	default:
		s.internalError(w, err, what)
	}
}

// finishDelete answers a DELETE from its :execrows result.
func (s *Server) finishDelete(w http.ResponseWriter, n int64, err error, what string) {
	switch {
	case pgCode(err) == pgFKViolation:
		writeError(w, http.StatusConflict, "in_use", what+" is still referenced; move or delete what uses it first")
	case err != nil:
		s.internalError(w, err, "delete "+what)
	case n == 0:
		writeError(w, http.StatusNotFound, "not_found", what+" not found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) internalError(w http.ResponseWriter, err error, what string) {
	s.log.Error().Err(err).Str("entity", what).Msg("admin query failed")
	writeError(w, http.StatusInternalServerError, "internal", what+" request failed")
}

// insertWithSlug runs insert with base. When the slug was derived rather
// than typed by the admin and it collides, it retries base-2, base-3, …
func insertWithSlug[T any](base string, explicit bool, insert func(slug string) (T, error)) (T, error) {
	for n := 1; ; n++ {
		candidate := base
		if n > 1 {
			candidate = slug.MakeWithSuffix(base, n)
		}
		v, err := insert(candidate)
		if err == nil || explicit || pgCode(err) != pgUniqueViolation || n >= 50 {
			return v, err
		}
	}
}

// inTx runs fn inside one transaction and commits when it returns no error.
func inTx[T any](ctx context.Context, s *Server, fn func(q *db.Queries) (T, error)) (T, error) {
	var zero T
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return zero, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	v, err := fn(s.queries.WithTx(tx))
	if err != nil {
		return zero, err
	}
	if err := tx.Commit(ctx); err != nil {
		return zero, err
	}
	return v, nil
}
