package postgres

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// TestMigrationsRoundTrip proves every migration can go up, then down to
// zero, then up again on the same database. Without this, a migration whose
// Down was never tried can rot silently — the next developer who runs
// `make migrate-down` gets a broken database.
func TestMigrationsRoundTrip(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("sahel_test"),
		tcpostgres.WithUsername("sahel"),
		tcpostgres.WithPassword("sahel_test"),
		tcpostgres.BasicWaitStrategies(),
		tcpostgres.WithInitScripts(filepath.Join("..", "..", "..", "..", "infra", "postgres", "init", "00-extensions.sql")),
	)
	if err != nil {
		t.Skipf("testcontainers unavailable (%v) - skipping migration round-trip", err)
	}
	t.Cleanup(func() {
		_ = container.Terminate(context.Background())
	})

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	for i := 0; i < 30; i++ {
		if err := db.PingContext(ctx); err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	migrations := filepath.Join("..", "..", "..", "..", "infra", "migrations")

	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("goose dialect: %v", err)
	}

	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("first Up: %v", err)
	}
	if err := goose.DownToContext(ctx, db, migrations, 0); err != nil {
		t.Fatalf("Down to 0: %v", err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("second Up: %v", err)
	}
}
