package booking

import "errors"

// MaxPaymentRejections: the second rejected receipt cancels the booking.
const MaxPaymentRejections = 2

// ErrNotPayable is a receipt for a booking that no longer waits for money
// (expired, cancelled, already confirmed…).
var ErrNotPayable = errors.New("this booking is not waiting for a payment")

// PaymentState is the part of a booking that payments move.
type PaymentState struct {
	Status     Status
	DepositDue int64
	PaidTotal  int64
	Rejections int
}

// AfterUpload is the booking status once a guest uploads a receipt.
func AfterUpload(s Status) (Status, error) {
	switch s {
	case StatusPendingPayment, StatusAwaitingVerification:
		return StatusAwaitingVerification, nil
	default:
		return s, ErrNotPayable
	}
}

// AfterVerified adds a verified amount and confirms the booking once the
// deposit is covered. A partial payment leaves it waiting.
func AfterVerified(s PaymentState, amount int64) PaymentState {
	s.PaidTotal += amount
	if s.PaidTotal >= s.DepositDue && (s.Status == StatusPendingPayment || s.Status == StatusAwaitingVerification) {
		s.Status = StatusConfirmed
	}
	return s
}

// AfterRejected counts a rejected receipt. The second one cancels the
// booking; otherwise, with no other receipt waiting, the guest gets a fresh
// hold to pay again (newHold). There is no "rejected" booking status, so the
// dates are never released in between.
func AfterRejected(s PaymentState, otherPending int) (next PaymentState, newHold bool) {
	s.Rejections++
	switch {
	case s.Rejections >= MaxPaymentRejections:
		s.Status = StatusCancelled
	case otherPending == 0 && s.Status == StatusAwaitingVerification:
		s.Status = StatusPendingPayment
		newHold = true
	}
	return s, newHold
}
