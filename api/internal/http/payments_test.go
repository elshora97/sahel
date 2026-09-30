package http

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sahel/api/internal/domain/pricing"
	"github.com/sahel/api/internal/store/postgres/db"
)

// captureMail records alert emails instead of sending them.
type captureMail struct {
	mu   sync.Mutex
	sent []string
}

func (c *captureMail) Send(_ context.Context, to, subject, _ string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, to+"|"+subject)
	return nil
}

func (c *captureMail) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.sent)
}

// A tiny valid PNG header is enough for content sniffing.
var receiptPNG = append([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), make([]byte, 64)...)

func uploadReceipt(t *testing.T, s *Server, ref, token string, fields map[string]string, file []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	if file != nil {
		fw, _ := mw.CreateFormFile("file", "receipt.png")
		_, _ = fw.Write(file)
	}
	_ = mw.Close()
	req := httptest.NewRequest("POST", "/api/v1/bookings/"+ref+"/payments", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	return rec
}

type bookingWithPayments struct {
	db.GetBookingViewRow
	Payments []struct {
		Status          string  `json:"status"`
		Amount          int64   `json:"amount"`
		RejectionReason *string `json:"rejection_reason"`
	} `json:"payments"`
	Instapay struct {
		Address string `json:"address"`
	} `json:"instapay"`
}

func paymentServer(t *testing.T) (*Server, *captureMail) {
	t.Helper()
	s := newGuestServer(t)
	mail := &captureMail{}
	WithPayments(2*time.Hour, mail, "owner@example.com")(s)
	expectStatus(t, adminDo(t, s, "PUT", "/settings/instapay", map[string]any{"address": "beetelsahel@instapay", "mobile": "01000000000", "holder_name": "Beet Elsahel"}), 200)
	return s, mail
}

func book(t *testing.T, s *Server, token, in, out string) db.GetBookingViewRow {
	t.Helper()
	rec := guestDo(t, s, "POST", "/bookings", token, `{"unit_slug":"u1","check_in":"`+in+`","check_out":"`+out+`","guests":2}`)
	expectStatus(t, rec, 201)
	return decodeInto[db.GetBookingViewRow](t, rec)
}

func pendingPaymentID(t *testing.T, s *Server) string {
	t.Helper()
	rows := decodeInto[[]db.AdminListPaymentsRow](t, adminDo(t, s, "GET", "/payments?status=pending", nil))
	if len(rows) != 1 {
		t.Fatalf("pending payments = %d", len(rows))
	}
	return uuidString(rows[0].ID)
}

func TestPayments_UploadVerifyPartialAndReceiptPrivacy(t *testing.T) {
	s, mail := paymentServer(t)
	token := register(t, s, "01012345678", "Mona Ali")
	b := book(t, s, token, "2027-06-10", "2027-06-13") // deposit 2000 EGP

	// The guest sees the InstaPay details; a receipt needs a sender name and a real file type.
	got := decodeInto[bookingWithPayments](t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""))
	if got.Instapay.Address != "beetelsahel@instapay" || got.Status != "pending_payment" {
		t.Fatalf("booking = %+v", got)
	}
	expectStatus(t, uploadReceipt(t, s, b.Ref, token, map[string]string{}, receiptPNG), 422)
	expectStatus(t, uploadReceipt(t, s, b.Ref, token, map[string]string{"sender_name": "Mona"}, []byte("just text, not an image")), 415)
	expectStatus(t, uploadReceipt(t, s, b.Ref, "", map[string]string{"sender_name": "Mona"}, receiptPNG), 404) // not the owner

	// Partial first: 1500 of 2000, by ref + last 4 digits.
	rec := uploadReceipt(t, s, b.Ref, "", map[string]string{"sender_name": "Mona Ali", "phone_last4": "5678", "amount": "150000"}, receiptPNG)
	expectStatus(t, rec, 200)
	if st := decodeInto[bookingWithPayments](t, rec).Status; st != "awaiting_verification" {
		t.Fatalf("after upload = %s", st)
	}
	time.Sleep(50 * time.Millisecond)
	if mail.count() != 1 {
		t.Fatalf("alert emails = %d", mail.count())
	}
	if n := decodeInto[map[string]int64](t, adminDo(t, s, "GET", "/payments/pending-count", nil))["pending"]; n != 1 {
		t.Fatalf("pending count = %d", n)
	}

	// Only the admin can read the receipt.
	pid := pendingPaymentID(t, s)
	proof := adminDo(t, s, "GET", "/payments/"+pid+"/proof", nil)
	expectStatus(t, proof, 200)
	if proof.Header().Get("Content-Type") != "image/png" || !bytes.Equal(proof.Body.Bytes(), receiptPNG) {
		t.Fatalf("proof %s %d bytes", proof.Header().Get("Content-Type"), proof.Body.Len())
	}
	expectStatus(t, guestDo(t, s, "GET", "/admin/payments/"+pid+"/proof", token, ""), 401)

	expectStatus(t, adminDo(t, s, "POST", "/payments/"+pid+"/verify", map[string]any{"amount": 150000}), 200)
	expectStatus(t, adminDo(t, s, "POST", "/payments/"+pid+"/verify", map[string]any{"amount": 150000}), 409)
	got = decodeInto[bookingWithPayments](t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""))
	if got.Status != "awaiting_verification" || got.PaidTotal != 150000 {
		t.Fatalf("after partial = %s %d", got.Status, got.PaidTotal)
	}

	// The rest, recorded by the admin (the guest called): confirmed.
	expectStatus(t, adminDo(t, s, "POST", "/bookings/"+uuidString(b.ID)+"/payments", map[string]any{"amount": 50000, "sender_name": "Mona", "notes": "by phone"}), 200)
	got = decodeInto[bookingWithPayments](t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""))
	if got.Status != "confirmed" || got.PaidTotal != 200000 || len(got.Payments) != 2 {
		t.Fatalf("after top-up = %+v", got)
	}
}

func TestPayments_RejectTwiceCancels(t *testing.T) {
	s, _ := paymentServer(t)
	token := register(t, s, "01012345678", "Mona Ali")
	b := book(t, s, token, "2027-06-10", "2027-06-13")

	expectStatus(t, uploadReceipt(t, s, b.Ref, token, map[string]string{"sender_name": "Mona"}, receiptPNG), 200)
	expectStatus(t, adminDo(t, s, "POST", "/payments/"+pendingPaymentID(t, s)+"/reject", map[string]any{"reason": "amount not received"}), 200)
	got := decodeInto[bookingWithPayments](t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""))
	if got.Status != "pending_payment" || !got.HoldExpiresAt.Valid || got.Payments[0].RejectionReason == nil {
		t.Fatalf("after first rejection = %+v", got)
	}

	expectStatus(t, uploadReceipt(t, s, b.Ref, token, map[string]string{"sender_name": "Mona"}, receiptPNG), 200)
	expectStatus(t, adminDo(t, s, "POST", "/payments/"+pendingPaymentID(t, s)+"/reject", map[string]any{"reason": "still nothing"}), 200)
	got = decodeInto[bookingWithPayments](t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""))
	if got.Status != "cancelled" {
		t.Fatalf("after second rejection = %s", got.Status)
	}
	// Cancelled: the dates are free and no more receipts are taken.
	expectStatus(t, uploadReceipt(t, s, b.Ref, token, map[string]string{"sender_name": "Mona"}, receiptPNG), 409)
	book(t, s, register(t, s, "01112345678", "Omar"), "2027-06-10", "2027-06-13")
}

func TestPayments_UnpaidHoldExpires(t *testing.T) {
	s, _ := paymentServer(t)
	token := register(t, s, "01012345678", "Mona Ali")
	b := book(t, s, token, "2027-06-10", "2027-06-13")

	// The frozen clock is 2027-05-01, so the hold is in 2027: pull it into the past.
	_, err := s.pool.Exec(context.Background(), `UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE ref = $1`, b.Ref)
	if err != nil {
		t.Fatal(err)
	}
	if refs, err := s.ExpireHolds(context.Background()); err != nil || len(refs) != 1 || refs[0] != b.Ref {
		t.Fatalf("expired %v, %v", refs, err)
	}

	got := decodeInto[bookingWithPayments](t, guestDo(t, s, "GET", "/bookings/"+b.Ref, token, ""))
	if got.Status != "expired" {
		t.Fatalf("status = %s", got.Status)
	}
	expectStatus(t, uploadReceipt(t, s, b.Ref, token, map[string]string{"sender_name": "Mona"}, receiptPNG), 409)
	book(t, s, register(t, s, "01112345678", "Omar"), "2027-06-10", "2027-06-13") // dates released
}

func TestPayments_InstapaySettingsNeedAnAddressOrMobile(t *testing.T) {
	s, _ := paymentServer(t)
	expectStatus(t, adminDo(t, s, "PUT", "/settings/instapay", map[string]any{"address": " ", "mobile": "", "holder_name": "x"}), 422)
	rec := adminDo(t, s, "GET", "/settings/instapay", nil)
	if !strings.Contains(rec.Body.String(), "beetelsahel@instapay") {
		t.Fatalf("settings = %s", rec.Body.String())
	}
	_ = pricing.DateLayout
}
