-- name: LockUnit :one
-- Serialises bookings and blocks on one unit: both take this lock first.
SELECT id FROM units WHERE id = $1 FOR UPDATE;

-- name: CountBookingsInRange :one
-- Occupying bookings on these nights of the unit, without turnover days.
SELECT COUNT(*) FROM bookings
WHERE unit_id = @unit_id
  AND status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
  AND stay && daterange(@start_date::date, @end_date::date, '[)');

-- name: CreateBlock :one
INSERT INTO unit_blocks (unit_id, start_date, end_date, note)
VALUES (@unit_id, @start_date, @end_date, @note)
RETURNING id, unit_id, start_date, end_date, note, created_at;

-- name: DeleteBlock :execrows
DELETE FROM unit_blocks WHERE id = $1;

-- name: TimelineUnits :many
SELECT u.id, u.slug, u.title_ar, u.title_en, u.status,
       c.name_ar AS compound_name_ar, c.name_en AS compound_name_en
FROM units u
JOIN compounds c ON c.id = u.compound_id
WHERE u.status <> 'archived'
ORDER BY c.name_en, u.title_en, u.id;

-- name: TimelineBookings :many
SELECT b.id, b.ref, b.unit_id, b.status, b.check_in, b.check_out, cu.name AS customer_name
FROM bookings b
JOIN customers cu ON cu.id = b.customer_id
WHERE b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
  AND b.stay && daterange(@from_date::date, @to_date::date, '[)')
ORDER BY b.check_in;

-- name: TimelineBlocks :many
SELECT id, unit_id, start_date, end_date, note
FROM unit_blocks
WHERE span && daterange(@from_date::date, @to_date::date, '[)')
ORDER BY start_date;

-- name: TodayMovements :many
-- Occupying bookings that check in or check out on @day.
SELECT b.id, b.ref, b.status, b.check_in, b.check_out, b.nights, b.guests,
       cu.name AS customer_name, cu.phone AS customer_phone,
       u.id AS unit_id, u.title_ar AS unit_title_ar, u.title_en AS unit_title_en
FROM bookings b
JOIN customers cu ON cu.id = b.customer_id
JOIN units u      ON u.id = b.unit_id
WHERE b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
  AND (b.check_in = @day::date OR b.check_out = @day::date)
ORDER BY u.title_en, b.check_in;

-- name: TodayCounts :one
-- Stays tonight, holds running out within the hour, and the next seven
-- nights of occupancy on active units (booked plus blocked nights).
WITH w AS (
  SELECT sqlc.arg(day)::date AS day, daterange(sqlc.arg(day)::date, sqlc.arg(day)::date + 7, '[)') AS week
)
SELECT
  (SELECT COUNT(*) FROM bookings b, w
   WHERE b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
     AND b.check_in <= w.day AND b.check_out > w.day) AS staying_tonight,
  (SELECT COUNT(*) FROM bookings
   WHERE status = 'pending_payment' AND hold_expires_at <= now() + interval '1 hour') AS holds_expiring,
  (SELECT COUNT(*) FROM units WHERE status = 'active') AS active_units,
  (SELECT COALESCE(SUM(upper(n.r) - lower(n.r)), 0)::bigint FROM (
     SELECT b.stay * w.week AS r
     FROM bookings b JOIN units u ON u.id = b.unit_id AND u.status = 'active', w
     WHERE b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
       AND b.stay && w.week
     UNION ALL
     SELECT k.span * w.week
     FROM unit_blocks k JOIN units u ON u.id = k.unit_id AND u.status = 'active', w
     WHERE k.span && w.week
   ) n) AS occupied_nights;
