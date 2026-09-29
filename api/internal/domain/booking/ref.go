package booking

import (
	"crypto/rand"
	"io"
)

// RefPrefix starts every booking reference: Beet Elsahel.
const RefPrefix = "BES-"

// crockford is base32 without I, L, O and U: nothing to misread on a phone
// call or mistype into a bank transfer note.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// NewRef returns BES- plus 5 random Crockford characters. src defaults to
// crypto/rand; the unique index catches the rare collision and the caller
// retries.
func NewRef(src io.Reader) (string, error) {
	if src == nil {
		src = rand.Reader
	}
	buf := make([]byte, 5)
	if _, err := io.ReadFull(src, buf); err != nil {
		return "", err
	}
	out := []byte(RefPrefix)
	for _, b := range buf {
		out = append(out, crockford[b%32])
	}
	return string(out), nil
}
