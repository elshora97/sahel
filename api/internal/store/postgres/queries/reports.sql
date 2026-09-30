-- name: ReportMonths :many
-- One row per month from the first of from_date: confirmed nights and their
-- revenue, blocked nights, verified payments and bookings made (Cairo days).
WITH p AS (
  SELECT sqlc.arg(from_date)::date AS start, sqlc.arg(months)::int AS n
), m AS (
  SELECT (p.start + make_interval(months => g))::date AS month_start,
         (p.start + make_interval(months => g + 1))::date AS month_end
  FROM p, generate_series(0, p.n - 1) AS g
)
SELECT m.month_start, m.month_end,
  (SELECT COALESCE(SUM(upper(x.r) - lower(x.r)), 0)::bigint FROM (
     SELECT b.stay * daterange(m.month_start, m.month_end, '[)') AS r FROM bookings b
     WHERE b.status IN ('confirmed','checked_in','completed') AND b.stay && daterange(m.month_start, m.month_end, '[)')
   ) x) AS nights,
  (SELECT COALESCE(SUM((upper(x.r) - lower(x.r)) * x.price), 0)::bigint FROM (
     SELECT b.stay * daterange(m.month_start, m.month_end, '[)') AS r, b.nightly_price AS price FROM bookings b
     WHERE b.status IN ('confirmed','checked_in','completed') AND b.stay && daterange(m.month_start, m.month_end, '[)')
   ) x) AS revenue,
  (SELECT COALESCE(SUM(upper(x.r) - lower(x.r)), 0)::bigint FROM (
     SELECT k.span * daterange(m.month_start, m.month_end, '[)') AS r FROM unit_blocks k
     JOIN units u ON u.id = k.unit_id AND u.status = 'active'
     WHERE k.span && daterange(m.month_start, m.month_end, '[)')
   ) x) AS blocked_nights,
  (SELECT COALESCE(SUM(pay.amount), 0)::bigint FROM payments pay
   WHERE pay.status = 'verified'
     AND (pay.verified_at AT TIME ZONE 'Africa/Cairo')::date >= m.month_start
     AND (pay.verified_at AT TIME ZONE 'Africa/Cairo')::date < m.month_end) AS collected,
  (SELECT COUNT(*) FROM bookings b
   WHERE b.status IN ('pending_payment','awaiting_verification','confirmed','checked_in','completed')
     AND (b.created_at AT TIME ZONE 'Africa/Cairo')::date >= m.month_start
     AND (b.created_at AT TIME ZONE 'Africa/Cairo')::date < m.month_end)::bigint AS bookings_made
FROM m
ORDER BY m.month_start;

-- name: ReportUnits :many
-- Each unit that is not archived, with its confirmed nights, their revenue and
-- its blocked nights over the nights [from_date, to_date).
WITH p AS (SELECT daterange(sqlc.arg(from_date)::date, sqlc.arg(to_date)::date, '[)') AS span)
SELECT u.id, u.title_ar, u.title_en, u.status,
  (SELECT COALESCE(SUM(upper(b.stay * p.span) - lower(b.stay * p.span)), 0)::bigint FROM bookings b
   WHERE b.unit_id = u.id AND b.status IN ('confirmed','checked_in','completed') AND b.stay && p.span) AS nights,
  (SELECT COALESCE(SUM((upper(b.stay * p.span) - lower(b.stay * p.span)) * b.nightly_price), 0)::bigint FROM bookings b
   WHERE b.unit_id = u.id AND b.status IN ('confirmed','checked_in','completed') AND b.stay && p.span) AS revenue,
  (SELECT COALESCE(SUM(upper(k.span * p.span) - lower(k.span * p.span)), 0)::bigint FROM unit_blocks k
   WHERE k.unit_id = u.id AND k.span && p.span) AS blocked_nights
FROM units u, p
WHERE u.status <> 'archived'
ORDER BY revenue DESC, u.title_en;
