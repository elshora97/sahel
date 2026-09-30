-- name: ExpireHolds :many
-- Unpaid bookings past their hold: released so others can book the dates.
UPDATE bookings SET status = 'expired'
WHERE status = 'pending_payment' AND hold_expires_at < now()
RETURNING ref;

-- name: LockBooking :one
SELECT id, ref, status, deposit_due, paid_total, payment_rejection_count, hold_expires_at, customer_id
FROM bookings WHERE id = $1 FOR UPDATE;

-- name: LockBookingByRef :one
SELECT id, ref, status, deposit_due, paid_total, payment_rejection_count, hold_expires_at, customer_id
FROM bookings WHERE ref = $1 FOR UPDATE;

-- name: SetBookingPayment :exec
UPDATE bookings
SET status = @status, paid_total = @paid_total, payment_rejection_count = @payment_rejection_count,
    hold_expires_at = sqlc.narg('hold_expires_at'),
    cancelled_at = CASE WHEN @status::booking_status_enum = 'cancelled' THEN now() ELSE cancelled_at END,
    cancel_reason = CASE WHEN @status::booking_status_enum = 'cancelled' THEN sqlc.narg('cancel_reason') ELSE cancel_reason END
WHERE id = @id;

-- name: CreatePayment :one
INSERT INTO payments (booking_id, status, amount, sender_name, sender_number, proof_key, proof_type, notes, recorded_by, verified_at)
VALUES (@booking_id, @status, @amount, @sender_name, @sender_number, sqlc.narg('proof_key'), sqlc.narg('proof_type'),
        sqlc.narg('notes'), @recorded_by, sqlc.narg('verified_at'))
RETURNING *;

-- name: LockPayment :one
SELECT * FROM payments WHERE id = $1 FOR UPDATE;

-- name: VerifyPayment :exec
UPDATE payments SET status = 'verified', amount = @amount, verified_at = now(), notes = COALESCE(sqlc.narg('notes'), notes)
WHERE id = @id;

-- name: RejectPayment :exec
UPDATE payments SET status = 'rejected', rejection_reason = @reason WHERE id = @id;

-- name: CountPendingPaymentsForBooking :one
SELECT COUNT(*) FROM payments WHERE booking_id = $1 AND status = 'pending';

-- name: ListBookingPayments :many
SELECT id, status, amount, sender_name, sender_number, rejection_reason, notes, recorded_by,
       verified_at, created_at, (proof_key IS NOT NULL)::boolean AS has_proof
FROM payments WHERE booking_id = $1 ORDER BY created_at;

-- name: GetPaymentProof :one
SELECT proof_key, proof_type FROM payments WHERE id = $1;

-- name: AdminListPayments :many
SELECT p.id, p.status, p.amount, p.sender_name, p.sender_number, p.rejection_reason, p.recorded_by,
       p.created_at, p.verified_at, (p.proof_key IS NOT NULL)::boolean AS has_proof, p.proof_type,
       b.id AS booking_id, b.ref, b.status AS booking_status, b.deposit_due, b.paid_total, b.total,
       b.check_in, b.check_out, u.title_ar AS unit_title_ar, u.title_en AS unit_title_en,
       cu.name AS customer_name, cu.phone AS customer_phone
FROM payments p
JOIN bookings b   ON b.id = p.booking_id
JOIN units u      ON u.id = b.unit_id
JOIN customers cu ON cu.id = b.customer_id
WHERE (sqlc.narg('status')::payment_status_enum IS NULL OR p.status = sqlc.narg('status')::payment_status_enum)
ORDER BY p.created_at DESC
LIMIT 300;

-- name: CountPendingPayments :one
SELECT COUNT(*) FROM payments WHERE status = 'pending';

-- name: GetInstapayAccount :one
SELECT address, mobile, holder_name, updated_at FROM instapay_account WHERE id = 1;

-- name: SetInstapayAccount :one
UPDATE instapay_account SET address = @address, mobile = @mobile, holder_name = @holder_name, updated_at = now()
WHERE id = 1
RETURNING address, mobile, holder_name, updated_at;
