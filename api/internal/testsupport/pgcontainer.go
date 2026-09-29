// Package testsupport gives handler and store tests a real Postgres. One
// container per process, truncated between callers. Not for production code.
package testsupport

import (
	"context"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"database/sql"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var (
	poolOnce   sync.Once
	sharedPool *pgxpool.Pool
	startErr   error
)

// Pool returns a *pgxpool.Pool pointed at a fresh Postgres 16 with every
// Phase 2 migration applied. Truncates the catalog tables before returning
// so each caller sees an empty schema. Calls t.Skip if Docker is unreachable.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	poolOnce.Do(startShared)
	if startErr != nil {
		t.Skipf("testcontainers unavailable (%v)", startErr)
	}
	if _, err := sharedPool.Exec(context.Background(),
		`TRUNCATE unit_images, units, compounds, owners, areas RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return sharedPool
}

func startShared() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("sahel_test"),
		tcpostgres.WithUsername("sahel"),
		tcpostgres.WithPassword("sahel_test"),
		tcpostgres.BasicWaitStrategies(),
		tcpostgres.WithInitScripts(filepath.Join(repoRoot(), "infra", "postgres", "init", "00-extensions.sql")),
	)
	if err != nil {
		startErr = err
		return
	}

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		startErr = err
		return
	}

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		startErr = err
		return
	}
	defer sqlDB.Close()

	migrations := filepath.Join(repoRoot(), "infra", "migrations")
	if err := goose.SetDialect("postgres"); err != nil {
		startErr = err
		return
	}
	if err := goose.UpContext(ctx, sqlDB, migrations); err != nil {
		startErr = err
		return
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		startErr = err
		return
	}
	sharedPool = pool
}

// repoRoot walks up from this file to the repo root (contains go.mod).
func repoRoot() string {
	_, thisFile, _, _ := runtime.Caller(0)
	// this file is api/internal/testsupport/pgcontainer.go
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "..")
}
