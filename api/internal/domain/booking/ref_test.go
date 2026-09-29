package booking

import (
	"bytes"
	"regexp"
	"testing"
)

func TestNewRefFormat(t *testing.T) {
	pattern := regexp.MustCompile(`^BES-[0-9A-HJKMNP-TV-Z]{5}$`)
	seen := map[string]bool{}
	for i := 0; i < 2000; i++ {
		ref, err := NewRef(nil)
		if err != nil {
			t.Fatal(err)
		}
		if !pattern.MatchString(ref) {
			t.Fatalf("bad ref %q", ref)
		}
		seen[ref] = true
	}
	if len(seen) < 1990 {
		t.Fatalf("refs repeat too often: %d unique of 2000", len(seen))
	}
}

func TestNewRefIsDeterministicForAGivenSource(t *testing.T) {
	ref, err := NewRef(bytes.NewReader([]byte{0, 1, 2, 31, 32}))
	if err != nil {
		t.Fatal(err)
	}
	// Byte values are taken mod 32 into the Crockford alphabet.
	if ref != "BES-012Z0" {
		t.Fatalf("got %q", ref)
	}
}
