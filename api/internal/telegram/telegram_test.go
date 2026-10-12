package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const token = "123456:secret-token"

func TestSend_PostsPlainTextToEveryChat(t *testing.T) {
	var paths []string
	var bodies []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		paths = append(paths, r.Method+" "+r.URL.Path)
		bodies = append(bodies, body)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := Client{Token: token, ChatIDs: []string{"111", "-222"}, BaseURL: srv.URL}
	text := "حجز جديد <b>&\nline 2"
	if err := c.Send(context.Background(), text); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(bodies) != 2 {
		t.Fatalf("requests = %d, want 2", len(bodies))
	}
	for i, id := range []string{"111", "-222"} {
		if paths[i] != "POST /bot"+token+"/sendMessage" {
			t.Errorf("path = %s", paths[i])
		}
		b := bodies[i]
		if b["chat_id"] != id || b["text"] != text || b["disable_web_page_preview"] != true {
			t.Errorf("body = %v", b)
		}
		if _, ok := b["parse_mode"]; ok {
			t.Errorf("parse_mode must be absent so text needs no escaping: %v", b)
		}
	}
}

func TestSend_ErrorNamesTelegramsReasonAndTriesEveryChat(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"ok":false,"description":"Bad Request: chat not found"}`))
	}))
	defer srv.Close()

	err := Client{Token: token, ChatIDs: []string{"1", "2"}, BaseURL: srv.URL}.Send(context.Background(), "hi")
	if err == nil || !strings.Contains(err.Error(), "chat not found") {
		t.Fatalf("err = %v", err)
	}
	if strings.Contains(err.Error(), token) {
		t.Fatalf("error leaks the token: %v", err)
	}
	if calls != 2 {
		t.Fatalf("calls = %d, want 2: one failing chat must not stop the others", calls)
	}
}

func TestSend_NetworkErrorHidesToken(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close() // nothing listens there now

	err := Client{Token: token, ChatIDs: []string{"1"}, BaseURL: url}.Send(context.Background(), "hi")
	if err == nil {
		t.Fatal("want an error from a closed server")
	}
	if strings.Contains(err.Error(), token) {
		t.Fatalf("error leaks the token: %v", err)
	}
}
