// Package booking holds the booking entity and its rules. It imports no
// database driver on purpose: everything here is a pure function over values.
package booking

import (
	"fmt"
	"sort"
	"strings"
)

type Status string

const (
	StatusDraft                Status = "draft"
	StatusPendingPayment       Status = "pending_payment"
	StatusAwaitingVerification Status = "awaiting_verification"
	StatusConfirmed            Status = "confirmed"
	StatusCheckedIn            Status = "checked_in"
	StatusCompleted            Status = "completed"
	StatusExpired              Status = "expired"
	StatusCancelled            Status = "cancelled"
	StatusRefundPending        Status = "refund_pending"
	StatusRefunded             Status = "refunded"
)

// All is the canonical enum. Nothing outside this list is a valid status.
// Note what is absent: there is no "hold" and no "rejected". A rejected
// payment is recorded on the payment row and sends the booking straight back
// to pending_payment, so the dates are never unheld for the instant in
// between. See DECISIONS.md, D-001 and D-003.
var All = []Status{
	StatusDraft,
	StatusPendingPayment,
	StatusAwaitingVerification,
	StatusConfirmed,
	StatusCheckedIn,
	StatusCompleted,
	StatusExpired,
	StatusCancelled,
	StatusRefundPending,
	StatusRefunded,
}

// Occupying lists every status whose booking owns its dates. This is the
// single source of truth for the bookings_no_overlap exclusion predicate:
// the migration is checked against it by TestMigrationPredicateMatchesDomain.
// Adding a status here is a migration, not a comment.
var Occupying = []Status{
	StatusPendingPayment,
	StatusAwaitingVerification,
	StatusConfirmed,
	StatusCheckedIn,
	StatusCompleted,
}

var occupyingSet = func() map[Status]bool {
	m := make(map[Status]bool, len(Occupying))
	for _, s := range Occupying {
		m[s] = true
	}
	return m
}()

var validSet = func() map[Status]bool {
	m := make(map[Status]bool, len(All))
	for _, s := range All {
		m[s] = true
	}
	return m
}()

// Occupies reports whether a booking in this status holds its dates against
// every other booking on the same unit.
func (s Status) Occupies() bool { return occupyingSet[s] }

// Valid reports whether s is in the canonical enum.
func (s Status) Valid() bool { return validSet[s] }

func (s Status) String() string { return string(s) }

// ParseStatus converts a string from the database or an API payload.
func ParseStatus(v string) (Status, error) {
	s := Status(v)
	if !s.Valid() {
		return "", fmt.Errorf("unknown booking status %q", v)
	}
	return s, nil
}

// OccupyingSQLList renders Occupying as a SQL literal list, sorted so the
// output is stable: 'awaiting_verification','checked_in',...
// Generate the migration predicate from this rather than typing it out.
func OccupyingSQLList() string {
	quoted := make([]string, 0, len(Occupying))
	for _, s := range Occupying {
		quoted = append(quoted, "'"+string(s)+"'")
	}
	sort.Strings(quoted)
	return strings.Join(quoted, ",")
}
