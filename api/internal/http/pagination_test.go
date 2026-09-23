package http

import (
	"net/url"
	"testing"
)

func TestParsePagination(t *testing.T) {
	cases := []struct {
		name               string
		q                  string
		wantPage, wantSize int
	}{
		{"defaults", "", 1, 20},
		{"explicit", "page=3&size=40", 3, 40},
		{"size clamped to max", "size=999", 1, 60},
		{"size floor", "size=0", 1, 20},
		{"page floor", "page=0", 1, 20},
		{"negative page", "page=-5", 1, 20},
		{"garbage", "page=abc&size=xyz", 1, 20},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v, _ := url.ParseQuery(c.q)
			page, size := parsePagination(v)
			if page != c.wantPage || size != c.wantSize {
				t.Fatalf("got (%d,%d), want (%d,%d)", page, size, c.wantPage, c.wantSize)
			}
		})
	}
}
