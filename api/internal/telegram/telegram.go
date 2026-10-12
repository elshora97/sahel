// Package telegram sends plain-text messages through the Telegram Bot API.
// The bot token is part of every request URL, so no error from here ever
// contains a URL.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.telegram.org"

type Client struct {
	Token   string
	ChatIDs []string
	BaseURL string       // empty means api.telegram.org; tests point it at httptest
	HTTP    *http.Client // nil means a client with a 10s timeout
}

// Send delivers text to every chat. One failing chat does not stop the
// others; the errors are joined.
func (c Client) Send(ctx context.Context, text string) error {
	var errs []error
	for _, id := range c.ChatIDs {
		if err := c.send(ctx, id, text); err != nil {
			errs = append(errs, fmt.Errorf("telegram chat %s: %w", id, err))
		}
	}
	return errors.Join(errs...)
}

func (c Client) send(ctx context.Context, chatID, text string) error {
	// No parse_mode: plain text, so names and Arabic need no escaping.
	body, err := json.Marshal(map[string]any{"chat_id": chatID, "text": text, "disable_web_page_preview": true})
	if err != nil {
		return err
	}
	base := c.BaseURL
	if base == "" {
		base = defaultBaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(base, "/")+"/bot"+c.Token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return errors.New("build request") // err would quote the URL
	}
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		// *url.Error repeats the URL; keep only what went wrong.
		var ue *url.Error
		if errors.As(err, &ue) {
			return ue.Err
		}
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 == 2 {
		return nil
	}
	var out struct {
		Description string `json:"description"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&out)
	return fmt.Errorf("status %d: %s", resp.StatusCode, out.Description)
}
