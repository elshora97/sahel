package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env             string
	LogLevel        string
	Port            int
	DatabaseURL     string
	ShutdownTimeout time.Duration

	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PublicURL string

	// AdminPassword gates /api/v1/admin/*. Required: the API refuses to start
	// without it so the admin surface can never be silently open.
	AdminPassword string

	// GuestSecret signs guest sessions. Derived from the admin password
	// outside production; required in production.
	GuestSecret string

	// HoldMinutes is how long an unpaid booking keeps its dates.
	HoldMinutes int

	// SMTP sends admin alerts (a new receipt to check). Empty SMTPHost logs
	// them instead. AlertEmailTo is where they go.
	SMTPHost, SMTPPort, SMTPUser, SMTPPass, MailFrom, AlertEmailTo string

	// TelegramToken and TelegramChatIDs send the same alerts to Telegram.
	// Both empty: off. One without the other: Load fails.
	TelegramToken   string
	TelegramChatIDs []string

	// WebURL is the public site origin, used for dashboard links in alerts.
	// Optional; no trailing slash.
	WebURL string
}

func Load() (Config, error) {
	c := Config{
		Env:             env("ENV", "development"),
		LogLevel:        env("LOG_LEVEL", "info"),
		DatabaseURL:     env("DATABASE_URL", ""),
		ShutdownTimeout: 15 * time.Second,
		S3Endpoint:      env("S3_ENDPOINT", ""),
		S3Region:        env("S3_REGION", ""),
		S3Bucket:        env("S3_BUCKET", ""),
		S3AccessKey:     env("S3_ACCESS_KEY", ""),
		S3SecretKey:     env("S3_SECRET_KEY", ""),
		S3PublicURL:     env("S3_PUBLIC_URL", ""),
		AdminPassword:   env("ADMIN_PASSWORD", ""),
		GuestSecret:     env("GUEST_SESSION_SECRET", ""),
		SMTPHost:        env("SMTP_HOST", ""),
		SMTPPort:        env("SMTP_PORT", "587"),
		SMTPUser:        env("SMTP_USER", ""),
		SMTPPass:        env("SMTP_PASS", ""),
		MailFrom:        env("MAIL_FROM", ""),
		AlertEmailTo:    env("ALERT_EMAIL_TO", ""),
		TelegramToken:   env("TELEGRAM_BOT_TOKEN", ""),
		WebURL:          strings.TrimRight(env("WEB_URL", ""), "/"),
	}

	for _, id := range strings.Split(env("TELEGRAM_CHAT_ID", ""), ",") {
		if id = strings.TrimSpace(id); id != "" {
			c.TelegramChatIDs = append(c.TelegramChatIDs, id)
		}
	}
	if (c.TelegramToken == "") != (len(c.TelegramChatIDs) == 0) {
		return c, fmt.Errorf("set both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or neither")
	}

	hold, err := strconv.Atoi(env("HOLD_MINUTES", "120"))
	if err != nil || hold < 5 {
		return c, fmt.Errorf("HOLD_MINUTES must be a number of minutes, at least 5")
	}
	c.HoldMinutes = hold

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
	if c.GuestSecret == "" {
		if c.Env == "production" {
			return c, fmt.Errorf("GUEST_SESSION_SECRET is required in production")
		}
		c.GuestSecret = "guest:" + c.AdminPassword
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
