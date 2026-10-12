package config

import (
	"reflect"
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

func TestLoad_TelegramAndWebURL(t *testing.T) {
	setValidEnv(t)
	t.Setenv("TELEGRAM_BOT_TOKEN", "123:abc")
	t.Setenv("TELEGRAM_CHAT_ID", " 111 , -222,")
	t.Setenv("WEB_URL", "https://sahel.vercel.app/")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.TelegramToken != "123:abc" || !reflect.DeepEqual(c.TelegramChatIDs, []string{"111", "-222"}) {
		t.Fatalf("telegram = %q %q", c.TelegramToken, c.TelegramChatIDs)
	}
	if c.WebURL != "https://sahel.vercel.app" {
		t.Fatalf("WebURL = %q, want no trailing slash", c.WebURL)
	}
}

func TestLoad_TelegramOffByDefault(t *testing.T) {
	setValidEnv(t)
	t.Setenv("TELEGRAM_BOT_TOKEN", "")
	t.Setenv("TELEGRAM_CHAT_ID", "")
	c, err := Load()
	if err != nil || c.TelegramToken != "" || len(c.TelegramChatIDs) != 0 {
		t.Fatalf("got %q %q, err %v", c.TelegramToken, c.TelegramChatIDs, err)
	}
}

// Half a Telegram setup is a typo, not a choice: refuse to start rather
// than silently send nothing.
func TestLoad_TelegramNeedsTokenAndChat(t *testing.T) {
	for _, only := range []string{"TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"} {
		t.Run(only, func(t *testing.T) {
			setValidEnv(t)
			t.Setenv("TELEGRAM_BOT_TOKEN", "")
			t.Setenv("TELEGRAM_CHAT_ID", " , ")
			t.Setenv(only, "123")
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), "TELEGRAM_BOT_TOKEN") {
				t.Fatalf("err = %v", err)
			}
		})
	}
}
