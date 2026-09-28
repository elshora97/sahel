-- name: ListSeasons :many
SELECT * FROM seasons WHERE unit_id = $1 ORDER BY start_date, priority DESC;

-- name: GetSeason :one
SELECT * FROM seasons WHERE id = @id AND unit_id = @unit_id;

-- name: CreateSeason :one
INSERT INTO seasons (unit_id, name_ar, name_en, start_date, end_date, nightly_price, min_nights,
                     allowed_checkin_days, weekend_uplift_pct, priority)
VALUES (@unit_id, @name_ar, @name_en, @start_date, @end_date, @nightly_price, @min_nights,
        @allowed_checkin_days, @weekend_uplift_pct, @priority)
RETURNING *;

-- name: UpdateSeason :one
UPDATE seasons
SET name_ar = @name_ar, name_en = @name_en, start_date = @start_date, end_date = @end_date,
    nightly_price = @nightly_price, min_nights = @min_nights,
    allowed_checkin_days = @allowed_checkin_days, weekend_uplift_pct = @weekend_uplift_pct,
    priority = @priority
WHERE id = @id AND unit_id = @unit_id
RETURNING *;

-- name: DeleteSeason :one
DELETE FROM seasons WHERE id = @id AND unit_id = @unit_id RETURNING *;

-- name: DeleteUnitSeasons :exec
DELETE FROM seasons WHERE unit_id = $1;

-- name: CopySeasons :many
INSERT INTO seasons (unit_id, name_ar, name_en, start_date, end_date, nightly_price, min_nights,
                     allowed_checkin_days, weekend_uplift_pct, priority)
SELECT @to_unit_id, src.name_ar, src.name_en, src.start_date, src.end_date, src.nightly_price,
       src.min_nights, src.allowed_checkin_days, src.weekend_uplift_pct, src.priority
FROM seasons src WHERE src.unit_id = @from_unit_id
RETURNING *;
