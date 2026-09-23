-- name: AdminListCompounds :many
SELECT c.*, a.name_ar AS area_name_ar, a.name_en AS area_name_en
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE (sqlc.narg('slug')::text IS NULL OR c.slug = sqlc.narg('slug')::text)
ORDER BY c.name_en ASC;

-- name: AdminGetCompound :one
SELECT * FROM compounds WHERE id = $1;

-- name: AdminCreateCompound :one
INSERT INTO compounds (area_id, slug, name_ar, name_en, description_ar, description_en,
                       amenities, beach_type, gate_info_ar, gate_info_en, lat, lng,
                       cover_image_url, is_featured)
VALUES (@area_id, @slug, @name_ar, @name_en, @description_ar, @description_en,
        @amenities, @beach_type, @gate_info_ar, @gate_info_en, @lat, @lng,
        @cover_image_url, @is_featured)
RETURNING *;

-- name: AdminUpdateCompound :one
UPDATE compounds
SET area_id = @area_id, slug = @slug, name_ar = @name_ar, name_en = @name_en,
    description_ar = @description_ar, description_en = @description_en,
    amenities = @amenities, beach_type = @beach_type,
    gate_info_ar = @gate_info_ar, gate_info_en = @gate_info_en,
    lat = @lat, lng = @lng, cover_image_url = @cover_image_url, is_featured = @is_featured
WHERE id = @id
RETURNING *;

-- name: AdminDeleteCompound :execrows
DELETE FROM compounds WHERE id = $1;
