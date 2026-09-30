-- name: CountFailedLogins :one
SELECT
  COUNT(*) FILTER (WHERE phone = @phone AND created_at > now() - interval '15 minutes') AS by_phone,
  COUNT(*) FILTER (WHERE ip = @ip AND created_at > now() - interval '1 hour') AS by_ip
FROM auth_attempts
WHERE kind = 'login' AND NOT ok AND (phone = @phone OR ip = @ip);

-- name: CountRecentRegistrations :one
SELECT COUNT(*) FROM auth_attempts WHERE kind = 'register' AND ip = $1 AND created_at > now() - interval '1 hour';

-- name: RecordAuthAttempt :exec
INSERT INTO auth_attempts (kind, phone, ip, ok) VALUES (@kind, @phone, @ip, @ok);

-- name: GetCustomerByPhone :one
SELECT * FROM customers WHERE phone = $1;

-- name: CreateCustomer :one
-- A phone that exists without a password (from the old SMS sign-in) is
-- claimed by the first registration; one with a password is taken.
INSERT INTO customers (phone, name, password_hash) VALUES (@phone, @name, @password_hash)
ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
WHERE customers.password_hash IS NULL
RETURNING *;

-- name: SetCustomerPassword :execrows
UPDATE customers SET password_hash = @password_hash WHERE id = @id;

-- name: GetCustomer :one
SELECT * FROM customers WHERE id = $1;

-- name: SetCustomerName :one
UPDATE customers SET name = @name WHERE id = @id RETURNING *;

-- name: CountOverlappingStays :one
-- Occupying bookings and admin blocks that clash with [check_in, check_out),
-- counting each booking's turnover days after its check-out as taken too.
SELECT (
  SELECT COUNT(*) FROM bookings b
  WHERE b.unit_id = @unit_id
    AND b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
    AND daterange(b.check_in, b.check_out + @buffer_days::int, '[)') && daterange(@check_in::date, @check_out::date, '[)')
) + (
  SELECT COUNT(*) FROM unit_blocks k
  WHERE k.unit_id = @unit_id AND k.span && daterange(@check_in::date, @check_out::date, '[)')
) AS clashes;

-- name: ListOccupiedStays :many
-- Stays that touch a date range, with the unit's turnover days added, and
-- admin blocks (no turnover days).
SELECT b.check_in, (b.check_out + @buffer_days::int)::date AS blocked_until
FROM bookings b
WHERE b.unit_id = @unit_id
  AND b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
  AND b.check_in <= @to_date::date AND (b.check_out + @buffer_days::int) > @from_date::date
UNION ALL
SELECT k.start_date, k.end_date
FROM unit_blocks k
WHERE k.unit_id = @unit_id AND k.start_date <= @to_date::date AND k.end_date > @from_date::date;

-- name: CreateBooking :one
INSERT INTO bookings (ref, unit_id, customer_id, check_in, check_out, guests, status, nightly_price, total, deposit_due, source, hold_expires_at)
VALUES (@ref, @unit_id, @customer_id, @check_in, @check_out, @guests, @status, @nightly_price, @total, @deposit_due, 'web', sqlc.narg('hold_expires_at'))
RETURNING id, ref;

-- name: GetBookingView :one
-- A booking with what its pages show about the unit and guest.
SELECT b.id, b.ref, b.check_in, b.check_out, b.nights, b.guests, b.status, b.nightly_price, b.total,
       b.deposit_due, b.source, b.cancelled_at, b.cancel_reason, b.created_at, b.customer_id,
       b.hold_expires_at, b.paid_total, b.payment_rejection_count,
       u.id AS unit_id, u.slug AS unit_slug, u.title_ar AS unit_title_ar, u.title_en AS unit_title_en,
       c.name_ar AS compound_name_ar, c.name_en AS compound_name_en,
       cu.name AS customer_name, cu.phone AS customer_phone,
       ci.url AS cover_url
FROM bookings b
JOIN units u      ON u.id = b.unit_id
JOIN compounds c  ON c.id = u.compound_id
JOIN customers cu ON cu.id = b.customer_id
LEFT JOIN unit_images ci ON ci.unit_id = u.id AND ci.is_cover
WHERE (sqlc.narg('ref')::text IS NULL OR b.ref = sqlc.narg('ref')::text)
  AND (sqlc.narg('id')::uuid IS NULL OR b.id = sqlc.narg('id')::uuid);

-- name: ListCustomerBookings :many
SELECT b.id, b.ref, b.check_in, b.check_out, b.nights, b.guests, b.status, b.total, b.created_at,
       u.slug AS unit_slug, u.title_ar AS unit_title_ar, u.title_en AS unit_title_en, ci.url AS cover_url
FROM bookings b
JOIN units u ON u.id = b.unit_id
LEFT JOIN unit_images ci ON ci.unit_id = u.id AND ci.is_cover
WHERE b.customer_id = $1
ORDER BY b.created_at DESC;

-- name: AdminListBookings :many
-- A stay matches from_date/to_date when any of its nights, or its check-out
-- day, falls between them.
SELECT b.id, b.ref, b.check_in, b.check_out, b.nights, b.guests, b.status, b.total, b.created_at,
       b.deposit_due, b.paid_total, b.source,
       u.id AS unit_id, u.title_ar AS unit_title_ar, u.title_en AS unit_title_en,
       c.name_ar AS compound_name_ar, c.name_en AS compound_name_en,
       cu.name AS customer_name, cu.phone AS customer_phone
FROM bookings b
JOIN units u      ON u.id = b.unit_id
JOIN compounds c  ON c.id = u.compound_id
JOIN customers cu ON cu.id = b.customer_id
WHERE (sqlc.narg('status')::booking_status_enum IS NULL OR b.status = sqlc.narg('status')::booking_status_enum)
  AND (sqlc.narg('unit_id')::uuid IS NULL OR b.unit_id = sqlc.narg('unit_id')::uuid)
  AND (sqlc.narg('customer_id')::uuid IS NULL OR b.customer_id = sqlc.narg('customer_id')::uuid)
  AND (sqlc.narg('from_date')::date IS NULL OR b.check_out >= sqlc.narg('from_date')::date)
  AND (sqlc.narg('to_date')::date IS NULL OR b.check_in <= sqlc.narg('to_date')::date)
  AND (sqlc.narg('q')::text IS NULL OR b.ref ILIKE '%' || sqlc.narg('q')::text || '%'
       OR cu.phone LIKE '%' || sqlc.narg('q')::text || '%' OR cu.name ILIKE '%' || sqlc.narg('q')::text || '%')
ORDER BY b.check_in DESC, b.created_at DESC
LIMIT sqlc.arg(max_rows)::int;

-- name: CancelBooking :one
UPDATE bookings
SET status = 'cancelled', cancelled_at = now(), cancel_reason = sqlc.narg('reason')
WHERE id = @id AND status IN ('pending_payment','awaiting_verification','confirmed')
RETURNING id;
