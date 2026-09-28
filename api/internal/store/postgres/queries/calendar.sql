-- name: DeleteRuleDays :exec
DELETE FROM unit_calendar
WHERE unit_id = @unit_id AND source = 'rule' AND date BETWEEN @from_date AND @to_date;

-- name: InsertRuleDays :exec
-- Manual rows already on a date win: they are never overwritten here.
INSERT INTO unit_calendar (unit_id, date, price, min_nights, allowed_checkin, is_available, source, season_id)
SELECT @unit_id, unnest(@dates::date[]), unnest(@prices::bigint[]), unnest(@min_nights::smallint[]),
       unnest(@allowed_checkin::boolean[]), true, 'rule', unnest(@season_ids::uuid[])
ON CONFLICT (unit_id, date) DO NOTHING;

-- name: ListCalendar :many
SELECT uc.date, uc.price, uc.min_nights, uc.allowed_checkin, uc.is_available, uc.source, uc.note,
       s.name_ar AS season_name_ar, s.name_en AS season_name_en
FROM unit_calendar uc
LEFT JOIN seasons s ON s.id = uc.season_id
WHERE uc.unit_id = @unit_id AND uc.date BETWEEN @from_date AND @to_date
ORDER BY uc.date;

-- name: OverrideDays :execrows
-- Sets the given fields on every date in the range and marks them manual.
-- A date with no row yet needs a price, so it is skipped unless one is given.
INSERT INTO unit_calendar (unit_id, date, price, min_nights, allowed_checkin, is_available, source, season_id, note)
SELECT @unit_id, g.d::date,
       COALESCE(sqlc.narg('price')::bigint, uc.price),
       COALESCE(sqlc.narg('min_nights')::smallint, uc.min_nights, u.min_nights_default),
       COALESCE(uc.allowed_checkin, true),
       COALESCE(sqlc.narg('is_available')::boolean, uc.is_available, true),
       'manual', uc.season_id,
       COALESCE(sqlc.narg('note')::text, uc.note)
FROM generate_series(@from_date::date, @to_date::date, interval '1 day') AS g(d)
JOIN units u ON u.id = @unit_id
LEFT JOIN unit_calendar uc ON uc.unit_id = @unit_id AND uc.date = g.d::date
WHERE COALESCE(sqlc.narg('price')::bigint, uc.price) IS NOT NULL
ON CONFLICT (unit_id, date) DO UPDATE
SET price = EXCLUDED.price, min_nights = EXCLUDED.min_nights, is_available = EXCLUDED.is_available,
    note = EXCLUDED.note, source = 'manual';

-- name: DeleteManualDays :exec
DELETE FROM unit_calendar
WHERE unit_id = @unit_id AND source = 'manual' AND date BETWEEN @from_date AND @to_date;

-- name: GetPricingUnitBySlug :one
-- What the quote needs; archived and non-active units are not bookable.
SELECT id, slug, base_guests, max_guests, cleaning_fee, deposit_pct, security_deposit,
       extra_guest_fee, advance_notice_hours, max_advance_days
FROM units WHERE slug = $1 AND status = 'active';
