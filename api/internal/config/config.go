package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Env             string
	LogLevel        string
	Port            int
	DatabaseURL     string
	ShutdownTimeout time.Duration

	S3Endpoint  string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PublicURL string

	// AdminPassword gates /api/v1/admin/*. Required: the API refuses to start
	// without it so the admin surface can never be silently open.
	AdminPassword string
}

func Load() (Config, error) {
	c := Config{
		Env:             env("ENV", "development"),
		LogLevel:        env("LOG_LEVEL", "info"),
		DatabaseURL:     env("DATABASE_URL", ""),
		ShutdownTimeout: 15 * time.Second,
		S3Endpoint:      env("S3_ENDPOINT", ""),
		S3Bucket:        env("S3_BUCKET", ""),
		S3AccessKey:     env("S3_ACCESS_KEY", ""),
		S3SecretKey:     env("S3_SECRET_KEY", ""),
		S3PublicURL:     env("S3_PUBLIC_URL", ""),
		AdminPassword:   env("ADMIN_PASSWORD", ""),
	}

	port, err := strconv.Atoi(env("API_PORT", "8080"))
	if err != nil {
		return c, fmt.Errorf("API_PORT is not a number: %w", err)
	}
	c.Port = port

	required := []struct{ name, value string }{
		{"DATABASE_URL", c.DatabaseURL},
		{"ADMIN_PASSWORD", c.AdminPassword},
		{"S3_ENDPOINT", c.S3Endpoint},
		{"S3_BUCKET", c.S3Bucket},
		{"S3_PUBLIC_URL", c.S3PublicURL},
	}
	for _, r := range required {
		if r.value == "" {
			return c, fmt.Errorf("%s is required", r.name)
		}
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
