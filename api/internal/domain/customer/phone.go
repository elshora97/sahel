// Package customer holds guest identity rules. Pure: no database.
package customer

import (
	"errors"
	"strings"
)

// ErrInvalidPhone is any number that is not an Egyptian mobile.
var ErrInvalidPhone = errors.New("not an Egyptian mobile number")

// NormalizePhone turns an Egyptian mobile typed any common way (spaces,
// dashes, brackets, +20 / 0020 / 20 prefix, Arabic-Indic digits) into
// E.164: +201XXXXXXXXX with a 010, 011, 012 or 015 prefix.
func NormalizePhone(in string) (string, error) {
	var b strings.Builder
	for _, r := range in {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= '٠' && r <= '٩':
			b.WriteRune('0' + (r - '٠'))
		case r >= '۰' && r <= '۹':
			b.WriteRune('0' + (r - '۰'))
		case r == '+' || r == ' ' || r == '-' || r == '(' || r == ')' || r == '.':
		default:
			return "", ErrInvalidPhone
		}
	}
	d := b.String()
	switch {
	case strings.HasPrefix(d, "0020"):
		d = "0" + d[4:]
	case strings.HasPrefix(d, "20") && len(d) == 12:
		d = "0" + d[2:]
	}
	if len(d) != 11 || d[0] != '0' || d[1] != '1' || !strings.ContainsRune("0125", rune(d[2])) {
		return "", ErrInvalidPhone
	}
	return "+20" + d[1:], nil
}
