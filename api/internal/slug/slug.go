// Package slug turns a display string into a URL-safe slug. Diacritics are
// stripped (café → cafe); non-alphanumerics collapse to a single hyphen.
// Deterministic and side-effect free.
package slug

import (
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var diacriticStripper = transform.Chain(
	norm.NFD,
	runes.Remove(runes.In(unicode.Mn)),
	norm.NFC,
)

// Make lowercases, strips diacritics, replaces every run of non-alphanumeric
// characters with a single hyphen, and trims leading/trailing hyphens.
// Empty input and inputs that reduce to nothing (like "---") return "".
func Make(s string) string {
	folded, _, err := transform.String(diacriticStripper, s)
	if err != nil {
		folded = s
	}
	folded = strings.ToLower(folded)

	var b strings.Builder
	b.Grow(len(folded))
	prevDash := true
	for _, r := range folded {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := b.String()
	return strings.TrimRight(out, "-")
}

// MakeWithSuffix returns Make(s) when n == 0, otherwise appends "-<n>".
// Callers use this when a base slug collides on unique index insert.
func MakeWithSuffix(s string, n int) string {
	base := Make(s)
	if n == 0 {
		return base
	}
	return base + "-" + strconv.Itoa(n)
}
