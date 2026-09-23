-- name: AdminListAreas :many
SELECT * FROM areas
WHERE (sqlc.narg('slug')::text IS NULL OR slug = sqlc.narg('slug')::text)
ORDER BY sort_order ASC, name_en ASC;

-- name: AdminGetArea :one
SELECT * FROM areas WHERE id = $1;

-- name: AdminCreateArea :one
INSERT INTO areas (slug, name_ar, name_en, region, km_marker, sort_order)
VALUES (@slug, @name_ar, @name_en, @region, @km_marker, @sort_order)
RETURNING *;

-- name: AdminUpdateArea :one
UPDATE areas
SET slug = @slug, name_ar = @name_ar, name_en = @name_en, region = @region,
    km_marker = @km_marker, sort_order = @sort_order
WHERE id = @id
RETURNING *;

-- name: AdminDeleteArea :execrows
DELETE FROM areas WHERE id = $1;
