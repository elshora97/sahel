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
	}

	port, err := strconv.Atoi(env("API_PORT", "8080"))
	if err != nil {
		return c, fmt.Errorf("API_PORT is not a number: %w", err)
	}
	c.Port = port

	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
