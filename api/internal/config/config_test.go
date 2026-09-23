package config

import (
	"strings"
	"testing"
)

func setValidEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("ADMIN_PASSWORD", "pw")
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("S3_BUCKET", "sahel-uploads")
	t.Setenv("S3_PUBLIC_URL", "http://localhost:9000/sahel-uploads")
}

func TestLoad_Valid(t *testing.T) {
	setValidEnv(t)
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.AdminPassword != "pw" || c.S3PublicURL != "http://localhost:9000/sahel-uploads" {
		t.Fatalf("got %+v", c)
	}
}

func TestLoad_RequiredVars(t *testing.T) {
	for _, name := range []string{"DATABASE_URL", "ADMIN_PASSWORD", "S3_ENDPOINT", "S3_BUCKET", "S3_PUBLIC_URL"} {
		t.Run(name, func(t *testing.T) {
			setValidEnv(t)
			t.Setenv(name, "")
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("want error naming %s, got %v", name, err)
			}
		})
	}
}
