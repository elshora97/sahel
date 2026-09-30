package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/domain/booking"
	"github.com/sahel/api/internal/store/postgres/db"
)

const maxProofBytes = 10 << 20

var proofExt = map[string]string{
	"image/jpeg":      "jpg",
	"image/png":       "png",
	"image/webp":      "webp",
	"application/pdf": "pdf",
}

func (s *Server) holdFor() time.Duration {
	if s.hold > 0 {
		return s.hold
	}
	return 2 * time.Hour
}

func tsNow(d time.Duration) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: now().Add(d), Valid: true}
}

// ExpireHolds releases unpaid bookings whose hold ran out.
func (s *Server) ExpireHolds(ctx context.Context) ([]string, error) {
	return s.queries.ExpireHolds(ctx)
}

// ExpireHoldsEvery runs ExpireHolds now and then every d, until ctx ends.
func (s *Server) ExpireHoldsEvery(ctx context.Context, d time.Duration) {
	t := time.NewTicker(d)
	defer t.Stop()
	for {
		if refs, err := s.ExpireHolds(ctx); err != nil {
			if ctx.Err() == nil {
				s.log.Error().Err(err).Msg("expire holds")
			}
		} else if len(refs) > 0 {
			s.log.Info().Strs("refs", refs).Msg("unpaid holds expired")
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// guestPayment is what the guest sees of a payment: no receipt, no notes.
type guestPayment struct {
	Status          db.PaymentStatusEnum `json:"status"`
	Amount          int64                `json:"amount"`
	RejectionReason *string              `json:"rejection_reason"`
	CreatedAt       pgtype.Timestamptz   `json:"created_at"`
}

type instapay struct {
	Address    string `json:"address"`
	Mobile     string `json:"mobile"`
	HolderName string `json:"holder_name"`
}

// guestBooking finds a booking the caller may see: its owner, or anyone
// with the reference and the last 4 digits of the guest's phone.
func (s *Server) guestBooking(w http.ResponseWriter, r *http.Request, last4 string) (db.GetBookingViewRow, bool) {
	ref := strings.ToUpper(chi.URLParam(r, "ref"))
	view, err := s.queries.GetBookingView(r.Context(), db.GetBookingViewParams{Ref: &ref})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		s.internalError(w, err, "booking")
		return view, false
	}
	owner := err == nil && s.guestID(r) != "" && s.guestID(r) == uuidString(view.CustomerID)
	byPhone := err == nil && len(last4) == 4 && strings.HasSuffix(view.CustomerPhone, last4)
	if !owner && !byPhone {
		writeError(w, http.StatusNotFound, "not_found", "booking not found")
		return view, false
	}
	return view, true
}

func (s *Server) getBooking(w http.ResponseWriter, r *http.Request) {
	view, ok := s.guestBooking(w, r, r.URL.Query().Get("phone_last4"))
	if !ok {
		return
	}
	s.writeGuestBooking(w, r, view.Ref)
}

// writeGuestBooking answers with the booking (fresh from the database), its
// payments and where to pay. The caller has already checked access.
func (s *Server) writeGuestBooking(w http.ResponseWriter, r *http.Request, ref string) {
	view, err := s.queries.GetBookingView(r.Context(), db.GetBookingViewParams{Ref: &ref})
	if err != nil {
		s.writeStoreError(w, err, "booking")
		return
	}
	rows, err := s.queries.ListBookingPayments(r.Context(), view.ID)
	if err != nil {
		s.internalError(w, err, "payments")
		return
	}
	payments := make([]guestPayment, len(rows))
	for i, p := range rows {
		payments[i] = guestPayment{Status: p.Status, Amount: p.Amount, RejectionReason: p.RejectionReason, CreatedAt: p.CreatedAt}
	}
	acct, err := s.queries.GetInstapayAccount(r.Context())
	if err != nil {
		s.internalError(w, err, "instapay")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		db.GetBookingViewRow
		Payments []guestPayment `json:"payments"`
		Instapay instapay       `json:"instapay"`
	}{view, payments, instapay{Address: acct.Address, Mobile: acct.Mobile, HolderName: acct.HolderName}})
}

// uploadPayment takes a receipt from the guest: the booking waits for an
// admin to check it and its hold stops running.
func (s *Server) uploadPayment(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > maxProofBytes+(1<<20) {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", "receipts are limited to 10 MB")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxProofBytes+(1<<20))
	if err := r.ParseMultipartForm(maxProofBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", "expected a multipart form with the receipt")
		return
	}
	view, ok := s.guestBooking(w, r, r.FormValue("phone_last4"))
	if !ok {
		return
	}
	if _, err := booking.AfterUpload(booking.Status(view.Status)); err != nil {
		writeError(w, http.StatusConflict, "not_payable", err.Error())
		return
	}
	if view.Status == db.BookingStatusEnum(booking.StatusPendingPayment) && view.HoldExpiresAt.Valid && now().After(view.HoldExpiresAt.Time) {
		writeError(w, http.StatusConflict, "hold_expired", "the time to pay ran out and the dates were released")
		return
	}

	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", `expected a file field named "file"`)
		return
	}
	defer file.Close()
	if hdr.Size > maxProofBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", "receipts are limited to 10 MB")
		return
	}
	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	mime := http.DetectContentType(head[:n])
	ext, ok := proofExt[mime]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "send a photo (JPEG, PNG, WebP) or a PDF of the receipt")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		s.internalError(w, err, "receipt")
		return
	}
	amount := view.DepositDue
	if v := strings.TrimSpace(r.FormValue("amount")); v != "" {
		if a, err := strconv.ParseInt(v, 10, 64); err == nil && a > 0 {
			amount = a
		}
	}
	senderName := strings.TrimSpace(r.FormValue("sender_name"))
	senderNumber := strings.TrimSpace(r.FormValue("sender_number"))
	if senderName == "" || len([]rune(senderName)) > 120 || len([]rune(senderNumber)) > 60 {
		writeError(w, http.StatusUnprocessableEntity, "sender_required", "add the name the transfer was sent from")
		return
	}

	ctx, cancel := contextWithTimeout(r, 60*time.Second)
	defer cancel()
	key := fmt.Sprintf("proofs/%s/%s.%s", uuidString(view.ID), uuidString(newUUID()), ext)
	if err := s.store.PutPrivate(ctx, key, mime, file, hdr.Size); err != nil {
		s.internalError(w, err, "store receipt")
		return
	}

	_, err = inTx(ctx, s, func(q *db.Queries) (struct{}, error) {
		b, err := q.LockBooking(ctx, view.ID)
		if err != nil {
			return struct{}{}, err
		}
		next, err := booking.AfterUpload(booking.Status(b.Status))
		if err != nil {
			return struct{}{}, err
		}
		if _, err := q.CreatePayment(ctx, db.CreatePaymentParams{
			BookingID: b.ID, Status: db.PaymentStatusEnumPending, Amount: amount,
			SenderName: senderName, SenderNumber: senderNumber, ProofKey: &key, ProofType: &mime, RecordedBy: "guest",
		}); err != nil {
			return struct{}{}, err
		}
		return struct{}{}, q.SetBookingPayment(ctx, db.SetBookingPaymentParams{
			ID: b.ID, Status: db.BookingStatusEnum(next), PaidTotal: b.PaidTotal,
			PaymentRejectionCount: b.PaymentRejectionCount, // the hold stops while a receipt waits
		})
	})
	if errors.Is(err, booking.ErrNotPayable) {
		writeError(w, http.StatusConflict, "not_payable", err.Error())
		return
	}
	if err != nil {
		s.internalError(w, err, "record receipt")
		return
	}
	s.alertNewReceipt(view, amount, senderName)
	s.writeGuestBooking(w, r, view.Ref)
}

// alertNewReceipt emails the admin in the background: a slow or failing
// mail server never delays or fails the guest's upload.
func (s *Server) alertNewReceipt(view db.GetBookingViewRow, amount int64, sender string) {
	if s.mailer == nil || s.alertTo == "" {
		return
	}
	subject := "إيصال دفع جديد " + view.Ref + " — New InstaPay receipt"
	body := fmt.Sprintf("Booking %s\nGuest: %s (%s)\nUnit: %s\nDates: %s → %s\nAmount stated: %s EGP (deposit due %s EGP)\nSent by: %s\n\nCheck it in the dashboard: Payments.\n",
		view.Ref, view.CustomerName, view.CustomerPhone, view.UnitTitleEn,
		view.CheckIn.Format("2006-01-02"), view.CheckOut.Format("2006-01-02"),
		pounds(amount), pounds(view.DepositDue), sender)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.mailer.Send(ctx, s.alertTo, subject, body); err != nil {
			s.log.Error().Err(err).Str("ref", view.Ref).Msg("receipt alert email")
		}
	}()
}

func pounds(p int64) string {
	if p%100 == 0 {
		return strconv.FormatInt(p/100, 10)
	}
	return fmt.Sprintf("%d.%02d", p/100, p%100)
}

// --- admin ---

func (s *Server) adminListPayments(w http.ResponseWriter, r *http.Request) {
	var status db.NullPaymentStatusEnum
	switch v := r.URL.Query().Get("status"); v {
	case "":
	case "pending", "verified", "rejected":
		status = db.NullPaymentStatusEnum{PaymentStatusEnum: db.PaymentStatusEnum(v), Valid: true}
	default:
		writeInvalid(w, errString("status must be pending, verified or rejected"))
		return
	}
	rows, err := s.queries.AdminListPayments(r.Context(), status)
	if err != nil {
		s.internalError(w, err, "payments")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) adminPendingPaymentCount(w http.ResponseWriter, r *http.Request) {
	n, err := s.queries.CountPendingPayments(r.Context())
	if err != nil {
		s.internalError(w, err, "payments")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"pending": n})
}

func (s *Server) adminPaymentProof(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "payment")
	if !ok {
		return
	}
	p, err := s.queries.GetPaymentProof(r.Context(), id)
	if err != nil {
		s.writeStoreError(w, err, "payment")
		return
	}
	if p.ProofKey == nil {
		writeError(w, http.StatusNotFound, "not_found", "this payment has no receipt")
		return
	}
	obj, err := s.store.GetPrivate(r.Context(), *p.ProofKey)
	if err != nil {
		s.internalError(w, err, "receipt")
		return
	}
	defer obj.Close()
	if p.ProofType != nil {
		w.Header().Set("Content-Type", *p.ProofType)
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(w, obj)
}

// settle applies one verified amount to a booking inside a transaction.
func (s *Server) settle(ctx context.Context, q *db.Queries, bookingID pgtype.UUID, amount int64) error {
	b, err := q.LockBooking(ctx, bookingID)
	if err != nil {
		return err
	}
	next := booking.AfterVerified(booking.PaymentState{
		Status: booking.Status(b.Status), DepositDue: b.DepositDue, PaidTotal: b.PaidTotal,
	}, amount)
	hold := b.HoldExpiresAt
	if next.Status == booking.StatusConfirmed {
		hold = pgtype.Timestamptz{}
	}
	return q.SetBookingPayment(ctx, db.SetBookingPaymentParams{
		ID: b.ID, Status: db.BookingStatusEnum(next.Status), PaidTotal: next.PaidTotal,
		PaymentRejectionCount: b.PaymentRejectionCount, HoldExpiresAt: hold,
	})
}

func (s *Server) adminVerifyPayment(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "payment")
	if !ok {
		return
	}
	var in struct {
		Amount int64   `json:"amount"`
		Notes  *string `json:"notes"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Amount <= 0 {
		writeInvalid(w, errString("amount must be more than 0"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	p, err := inTx(ctx, s, func(q *db.Queries) (db.Payment, error) {
		p, err := q.LockPayment(ctx, id)
		if err != nil {
			return p, err
		}
		if p.Status != db.PaymentStatusEnumPending {
			return p, errString("already checked")
		}
		if err := q.VerifyPayment(ctx, db.VerifyPaymentParams{ID: id, Amount: in.Amount, Notes: in.Notes}); err != nil {
			return p, err
		}
		return p, s.settle(ctx, q, p.BookingID, in.Amount)
	})
	s.finishPaymentAction(w, err, p)
}

func (s *Server) adminRejectPayment(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "payment")
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" || len([]rune(reason)) > 300 {
		writeInvalid(w, errString("give the guest a reason (up to 300 characters)"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	p, err := inTx(ctx, s, func(q *db.Queries) (db.Payment, error) {
		p, err := q.LockPayment(ctx, id)
		if err != nil {
			return p, err
		}
		if p.Status != db.PaymentStatusEnumPending {
			return p, errString("already checked")
		}
		if err := q.RejectPayment(ctx, db.RejectPaymentParams{ID: id, Reason: &reason}); err != nil {
			return p, err
		}
		b, err := q.LockBooking(ctx, p.BookingID)
		if err != nil {
			return p, err
		}
		others, err := q.CountPendingPaymentsForBooking(ctx, b.ID)
		if err != nil {
			return p, err
		}
		next, newHold := booking.AfterRejected(booking.PaymentState{
			Status: booking.Status(b.Status), DepositDue: b.DepositDue, PaidTotal: b.PaidTotal, Rejections: int(b.PaymentRejectionCount),
		}, int(others))
		hold := b.HoldExpiresAt
		if newHold {
			hold = tsNow(s.holdFor())
		}
		cancelReason := "payment rejected twice: " + reason
		return p, q.SetBookingPayment(ctx, db.SetBookingPaymentParams{
			ID: b.ID, Status: db.BookingStatusEnum(next.Status), PaidTotal: b.PaidTotal,
			PaymentRejectionCount: int16(next.Rejections), HoldExpiresAt: hold, CancelReason: &cancelReason,
		})
	})
	s.finishPaymentAction(w, err, p)
}

// adminRecordPayment records money that arrived without a receipt upload
// (the guest called): verified straight away.
func (s *Server) adminRecordPayment(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id", "booking")
	if !ok {
		return
	}
	var in struct {
		Amount     int64   `json:"amount"`
		SenderName string  `json:"sender_name"`
		Notes      *string `json:"notes"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Amount <= 0 {
		writeInvalid(w, errString("amount must be more than 0"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	_, err := inTx(ctx, s, func(q *db.Queries) (struct{}, error) {
		b, err := q.LockBooking(ctx, id)
		if err != nil {
			return struct{}{}, err
		}
		switch booking.Status(b.Status) {
		case booking.StatusPendingPayment, booking.StatusAwaitingVerification, booking.StatusConfirmed:
		default:
			return struct{}{}, booking.ErrNotPayable
		}
		if _, err := q.CreatePayment(ctx, db.CreatePaymentParams{
			BookingID: b.ID, Status: db.PaymentStatusEnumVerified, Amount: in.Amount,
			SenderName: strings.TrimSpace(in.SenderName), Notes: in.Notes, RecordedBy: "admin",
			VerifiedAt: tsNow(0),
		}); err != nil {
			return struct{}{}, err
		}
		return struct{}{}, s.settle(ctx, q, b.ID, in.Amount)
	})
	switch {
	case errors.Is(err, booking.ErrNotPayable):
		writeError(w, http.StatusConflict, "not_payable", err.Error())
	case err != nil:
		s.writeStoreError(w, err, "booking")
	default:
		s.adminGetBooking(w, r)
	}
}

func (s *Server) finishPaymentAction(w http.ResponseWriter, err error, p db.Payment) {
	var es errString
	switch {
	case errors.As(err, &es):
		writeError(w, http.StatusConflict, "already_checked", "this payment was already verified or rejected")
	case pgCode(err) == pgExclusionViolation:
		writeError(w, http.StatusConflict, "dates_taken", "the dates were booked by someone else meanwhile")
	case err != nil:
		s.writeStoreError(w, err, "payment")
	default:
		writeJSON(w, http.StatusOK, map[string]string{"booking_id": uuidString(p.BookingID)})
	}
}

func (s *Server) adminGetInstapay(w http.ResponseWriter, r *http.Request) {
	a, err := s.queries.GetInstapayAccount(r.Context())
	if err != nil {
		s.internalError(w, err, "instapay")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) adminPutInstapay(w http.ResponseWriter, r *http.Request) {
	var in instapay
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Address, in.Mobile, in.HolderName = strings.TrimSpace(in.Address), strings.TrimSpace(in.Mobile), strings.TrimSpace(in.HolderName)
	if in.Address == "" && in.Mobile == "" {
		writeInvalid(w, errString("give an InstaPay address or a mobile number"))
		return
	}
	a, err := s.queries.SetInstapayAccount(r.Context(), db.SetInstapayAccountParams{Address: in.Address, Mobile: in.Mobile, HolderName: in.HolderName})
	if err != nil {
		s.internalError(w, err, "instapay")
		return
	}
	writeJSON(w, http.StatusOK, a)
}
