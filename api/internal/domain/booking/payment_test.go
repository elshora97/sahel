package booking

import (
	"errors"
	"testing"
)

func TestAfterUpload(t *testing.T) {
	for from, want := range map[Status]Status{StatusPendingPayment: StatusAwaitingVerification, StatusAwaitingVerification: StatusAwaitingVerification} {
		got, err := AfterUpload(from)
		if err != nil || got != want {
			t.Errorf("%s: got %s, %v", from, got, err)
		}
	}
	for _, from := range []Status{StatusExpired, StatusCancelled, StatusConfirmed} {
		if _, err := AfterUpload(from); !errors.Is(err, ErrNotPayable) {
			t.Errorf("%s: want ErrNotPayable, got %v", from, err)
		}
	}
}

func TestAfterVerified(t *testing.T) {
	full := AfterVerified(PaymentState{Status: StatusAwaitingVerification, DepositDue: 500000}, 500000)
	if full.Status != StatusConfirmed || full.PaidTotal != 500000 {
		t.Fatalf("full = %+v", full)
	}
	partial := AfterVerified(PaymentState{Status: StatusAwaitingVerification, DepositDue: 500000}, 200000)
	if partial.Status != StatusAwaitingVerification || partial.PaidTotal != 200000 {
		t.Fatalf("partial = %+v", partial)
	}
	topUp := AfterVerified(partial, 300000)
	if topUp.Status != StatusConfirmed || topUp.PaidTotal != 500000 {
		t.Fatalf("top-up = %+v", topUp)
	}
	// Recorded by the admin while still unpaid: confirms straight from pending_payment.
	if s := AfterVerified(PaymentState{Status: StatusPendingPayment, DepositDue: 1}, 1); s.Status != StatusConfirmed {
		t.Fatalf("pending → %s", s.Status)
	}
	// Money on an already confirmed booking adds up but changes nothing else.
	if s := AfterVerified(PaymentState{Status: StatusConfirmed, DepositDue: 1, PaidTotal: 1}, 5); s.Status != StatusConfirmed || s.PaidTotal != 6 {
		t.Fatalf("confirmed → %+v", s)
	}
}

func TestAfterRejected(t *testing.T) {
	first, newHold := AfterRejected(PaymentState{Status: StatusAwaitingVerification}, 0)
	if first.Status != StatusPendingPayment || first.Rejections != 1 || !newHold {
		t.Fatalf("first = %+v hold=%v", first, newHold)
	}
	// Another receipt is still waiting: the booking keeps waiting too.
	waiting, newHold := AfterRejected(PaymentState{Status: StatusAwaitingVerification}, 1)
	if waiting.Status != StatusAwaitingVerification || newHold {
		t.Fatalf("waiting = %+v hold=%v", waiting, newHold)
	}
	second, _ := AfterRejected(first, 0)
	if second.Status != StatusCancelled || second.Rejections != 2 {
		t.Fatalf("second = %+v", second)
	}
}
