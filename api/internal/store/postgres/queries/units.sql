-- name: SearchUnits :many
SELECT
  u.id, u.owner_id, u.compound_id, u.slug,
  u.title_ar, u.title_en, u.type, u.bedrooms, u.bathrooms,
  u.base_guests, u.max_guests, u.area_sqm, u.floor,
  u.sea_distance_m, u.view, u.status, u.created_at,
  c.slug AS compound_slug, c.name_en AS compound_name_en,
  a.slug AS area_slug,     a.name_en AS area_name_en
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN areas     a ON a.id = c.area_id
WHERE u.status = 'active'
  AND (sqlc.narg('area_slug')::text     IS NULL OR a.slug = sqlc.narg('area_slug')::text)
  AND (sqlc.narg('compound_slug')::text IS NULL OR c.slug = sqlc.narg('compound_slug')::text)
  AND (sqlc.narg('unit_type')::unit_type_enum IS NULL OR u.type = sqlc.narg('unit_type')::unit_type_enum)
  AND (sqlc.narg('unit_view')::unit_view_enum IS NULL OR u.view = sqlc.narg('unit_view')::unit_view_enum)
  AND (sqlc.narg('guests')::int         IS NULL OR u.max_guests >= sqlc.narg('guests')::int)
  AND (sqlc.narg('bedrooms')::int       IS NULL OR u.bedrooms   >= sqlc.narg('bedrooms')::int)
  AND (sqlc.narg('max_sea_distance')::int IS NULL OR u.sea_distance_m <= sqlc.narg('max_sea_distance')::int)
ORDER BY
  CASE WHEN @sort_key::text = 'sea_distance_asc' THEN u.sea_distance_m END ASC NULLS LAST,
  CASE WHEN @sort_key::text = 'bedrooms_desc'    THEN u.bedrooms       END DESC NULLS LAST,
  u.created_at DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: CountSearchUnits :one
SELECT COUNT(*)
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN areas     a ON a.id = c.area_id
WHERE u.status = 'active'
  AND (sqlc.narg('area_slug')::text     IS NULL OR a.slug = sqlc.narg('area_slug')::text)
  AND (sqlc.narg('compound_slug')::text IS NULL OR c.slug = sqlc.narg('compound_slug')::text)
  AND (sqlc.narg('unit_type')::unit_type_enum IS NULL OR u.type = sqlc.narg('unit_type')::unit_type_enum)
  AND (sqlc.narg('unit_view')::unit_view_enum IS NULL OR u.view = sqlc.narg('unit_view')::unit_view_enum)
  AND (sqlc.narg('guests')::int         IS NULL OR u.max_guests >= sqlc.narg('guests')::int)
  AND (sqlc.narg('bedrooms')::int       IS NULL OR u.bedrooms   >= sqlc.narg('bedrooms')::int)
  AND (sqlc.narg('max_sea_distance')::int IS NULL OR u.sea_distance_m <= sqlc.narg('max_sea_distance')::int);

-- name: GetPublicUnitBySlug :one
-- exact_address is deliberately absent: it must never reach public callers.
SELECT
  u.id, u.compound_id, u.slug,
  u.title_ar, u.title_en, u.description_ar, u.description_en,
  u.house_rules_ar, u.house_rules_en,
  u.type, u.bedrooms, u.bathrooms, u.base_guests, u.max_guests,
  u.area_sqm, u.floor, u.sea_distance_m, u.view, u.row_number,
  u.amenities, u.lat, u.lng, u.status, u.created_at, u.updated_at,
  c.id AS compound_id_out, c.slug AS compound_slug, c.name_ar AS compound_name_ar, c.name_en AS compound_name_en,
  a.id AS area_id, a.slug AS area_slug, a.name_ar AS area_name_ar, a.name_en AS area_name_en
FROM units u
JOIN compounds c ON c.id = u.compound_id
JOIN areas     a ON a.id = c.area_id
WHERE u.slug = $1 AND u.status = 'active';

-- name: ListImagesByUnitID :many
SELECT id, unit_id, url, alt_ar, alt_en, sort, is_cover
FROM unit_images
WHERE unit_id = $1
ORDER BY is_cover DESC, sort ASC, created_at ASC;
