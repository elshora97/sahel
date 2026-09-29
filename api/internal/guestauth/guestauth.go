// Package guestauth signs guest sessions and hashes one-time codes. A token
// is "<customer id>.<expiry unix>.<HMAC-SHA256>"; codes are stored only as
// an HMAC of phone + code, so a leaked table reveals no usable code.
package guestauth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"
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

// NewCode is a uniformly random 6-digit code.
func NewCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func HashCode(secret, phone, code string) string {
	return hex.EncodeToString(mac(secret, "otp:"+phone+":"+code))
}

func CodeMatches(secret, phone, code, hash string) bool {
	want, err := hex.DecodeString(hash)
	return err == nil && hmac.Equal(want, mac(secret, "otp:"+phone+":"+code))
}
