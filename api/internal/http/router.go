package http

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/sahel/api/internal/storage"
	"github.com/sahel/api/internal/store/postgres/db"
)

type Server struct {
	pool          *pgxpool.Pool
	queries       *db.Queries
	log           zerolog.Logger
	env           string
	adminPassword string
	store         storage.ObjectStore
}

// Option configures optional Server capabilities.
type Option func(*Server)

// WithAdmin enables /api/v1/admin/*. Without it every admin request is 401.
func WithAdmin(password string, store storage.ObjectStore) Option {
	return func(s *Server) {
		s.adminPassword = password
		s.store = store
	}
}

func NewServer(pool *pgxpool.Pool, log zerolog.Logger, env string, opts ...Option) *Server {
	s := &Server{
		pool:    pool,
		queries: db.New(pool),
		log:     log,
		env:     env,
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(s.requestLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(s.cors)

	r.Get("/healthz", s.healthz)
	r.Get("/readyz", s.readyz)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"pong": "sahel"})
		})
		s.registerCatalogRoutes(r)
		r.Route("/admin", func(r chi.Router) {
			r.Use(s.adminAuth)
			s.registerAdminRoutes(r)
		})
	})

	return r
}

func (s *Server) registerCatalogRoutes(r chi.Router) {
	r.Get("/areas", s.listAreas)
	r.Get("/areas/{slug}", s.getArea)
	r.Get("/compounds", s.listCompounds)
	r.Get("/compounds/{slug}", s.getCompound)
	r.Get("/units", s.searchUnits)
	r.Get("/units/{slug}", s.getUnit)
}

func (s *Server) registerAdminRoutes(r chi.Router) {
	r.Get("/enums", s.adminEnums)

	r.Get("/areas", s.adminListAreas)
	r.Post("/areas", s.adminCreateArea)
	r.Get("/areas/{id}", s.adminGetArea)
	r.Patch("/areas/{id}", s.adminPatchArea)
	r.Delete("/areas/{id}", s.adminDeleteArea)

	r.Get("/compounds", s.adminListCompounds)
	r.Post("/compounds", s.adminCreateCompound)
	r.Get("/compounds/{id}", s.adminGetCompound)
	r.Patch("/compounds/{id}", s.adminPatchCompound)
	r.Delete("/compounds/{id}", s.adminDeleteCompound)

	r.Get("/owners", s.adminListOwners)
	r.Post("/owners", s.adminCreateOwner)
	r.Get("/owners/{id}", s.adminGetOwner)
	r.Patch("/owners/{id}", s.adminPatchOwner)
	r.Delete("/owners/{id}", s.adminDeleteOwner)

	r.Get("/units", s.adminListUnits)
	r.Post("/units", s.adminCreateUnit)
	r.Get("/units/{id}", s.adminGetUnit)
	r.Patch("/units/{id}", s.adminPatchUnit)
	r.Delete("/units/{id}", s.adminDeleteUnit)
}

// healthz is liveness: the process is up. It must not touch the database,
// or a database blip will get the container killed and restarted for nothing.
func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyz is readiness: this instance can serve traffic, which means it can
// reach Postgres.
func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 2*time.Second)
	defer cancel()

	if err := s.pool.Ping(ctx); err != nil {
		s.log.Error().Err(err).Msg("readiness check failed")
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "unavailable",
			"reason": "database unreachable",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
