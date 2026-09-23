-- name: AdminListUnits :many
-- Newest edits first: doubles as the dashboard's "recently edited" list.
SELECT u.id, u.compound_id, u.slug, u.title_ar, u.title_en, u.type, u.status,
       u.bedrooms, u.max_guests, u.updated_at,
       c.name_ar AS compound_name_ar, c.name_en AS compound_name_en, o.name AS owner_name,
       ci.url AS cover_url
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN owners    o ON o.id = u.owner_id
LEFT JOIN unit_images ci ON ci.unit_id = u.id AND ci.is_cover
WHERE (sqlc.narg('slug')::text IS NULL OR u.slug = sqlc.narg('slug')::text)
ORDER BY u.updated_at DESC;

-- name: AdminGetUnit :one
SELECT * FROM units WHERE id = $1;

-- name: AdminCreateUnit :one
INSERT INTO units (owner_id, compound_id, slug, title_ar, title_en, description_ar, description_en,
                   house_rules_ar, house_rules_en, type, bedrooms, bathrooms, base_guests, max_guests,
                   area_sqm, floor, sea_distance_m, view, row_number, amenities, lat, lng,
                   exact_address, status)
VALUES (@owner_id, @compound_id, @slug, @title_ar, @title_en, @description_ar, @description_en,
        @house_rules_ar, @house_rules_en, @type, @bedrooms, @bathrooms, @base_guests, @max_guests,
        @area_sqm, @floor, @sea_distance_m, @view, @row_number, @amenities, @lat, @lng,
        @exact_address, @status)
RETURNING *;

-- name: AdminUpdateUnit :one
UPDATE units
SET owner_id = @owner_id, compound_id = @compound_id, slug = @slug,
    title_ar = @title_ar, title_en = @title_en,
    description_ar = @description_ar, description_en = @description_en,
    house_rules_ar = @house_rules_ar, house_rules_en = @house_rules_en,
    type = @type, bedrooms = @bedrooms, bathrooms = @bathrooms,
    base_guests = @base_guests, max_guests = @max_guests,
    area_sqm = @area_sqm, floor = @floor, sea_distance_m = @sea_distance_m,
    view = @view, row_number = @row_number, amenities = @amenities,
    lat = @lat, lng = @lng, exact_address = @exact_address, status = @status
WHERE id = @id
RETURNING *;

-- name: AdminDeleteUnit :execrows
DELETE FROM units WHERE id = $1;

-- name: AdminListUnitImages :many
SELECT * FROM unit_images WHERE unit_id = $1 ORDER BY sort ASC, created_at ASC;
