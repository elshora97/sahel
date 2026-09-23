package http

import (
	"net/url"
	"strconv"
)

const (
	defaultPageSize = 20
	maxPageSize     = 60
)

// parsePagination reads ?page= and ?size= with hard bounds. Anything invalid,
// zero, or negative falls back to defaults. Size is capped at maxPageSize.
func parsePagination(q url.Values) (page, size int) {
	page = intOrDefault(q.Get("page"), 1)
	if page < 1 {
		page = 1
	}
	size = intOrDefault(q.Get("size"), defaultPageSize)
	if size < 1 {
		size = defaultPageSize
	}
	if size > maxPageSize {
		size = maxPageSize
	}
	return page, size
}

func intOrDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
