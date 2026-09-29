// Package guestauth signs guest sessions and hashes guest passwords. A token
// is "<customer id>.<expiry unix>.<HMAC-SHA256>"; passwords are bcrypt.
package guestauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// TokenTTL is how long a guest stays signed in.
const TokenTTL = 30 * 24 * time.Hour

func mac(secret, msg string) []byte {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(msg))
	return h.Sum(nil)
}

func SignToken(secret, customerID string, now time.Time, ttl time.Duration) string {
	payload := customerID + "." + strconv.FormatInt(now.Add(ttl).Unix(), 10)
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac(secret, "guest:"+payload))
}

// VerifyToken returns the customer id of a valid, unexpired token.
func VerifyToken(secret, token string, now time.Time) (string, bool) {
	if secret == "" {
		return "", false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] == "" {
		return "", false
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || now.Unix() >= exp {
		return "", false
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac(secret, "guest:"+parts[0]+"."+parts[1])) {
		return "", false
	}
	return parts[0], true
}

// MinPasswordLen is the shortest password a guest may choose.
const MinPasswordLen = 8

// passwordCost makes each check take a noticeable fraction of a second,
// which keeps guessing slow.
const passwordCost = 12

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), passwordCost)
	return string(b), err
}

// dummyHash is checked when a phone has no account, so a wrong phone takes
// as long as a wrong password and reveals nothing about who has signed up.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("no-such-account"), passwordCost)

// CheckPassword reports whether password matches hash. An empty hash (no
// account, or one without a password) always fails, after the same work.
func CheckPassword(hash, password string) bool {
	if hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
