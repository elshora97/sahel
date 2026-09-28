-- name: ListCompounds :many
SELECT
  c.id, c.area_id, c.slug, c.name_ar, c.name_en, c.description_ar, c.description_en,
  c.amenities, c.beach_type, c.cover_image_url, c.is_featured,
  a.slug AS area_slug
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE (sqlc.narg('area_slug')::text IS NULL OR a.slug = sqlc.narg('area_slug')::text)
ORDER BY c.name_en ASC
LIMIT @page_limit OFFSET @page_offset;

-- name: CountCompounds :one
SELECT COUNT(*)
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE (sqlc.narg('area_slug')::text IS NULL OR a.slug = sqlc.narg('area_slug')::text);

-- name: GetCompoundBySlug :one
SELECT
  c.id, c.area_id, c.slug, c.name_ar, c.name_en, c.description_ar, c.description_en,
  c.amenities, c.beach_type, c.gate_info_ar, c.gate_info_en, c.lat, c.lng,
  c.cover_image_url, c.is_featured,
  a.slug AS area_slug, a.name_ar AS area_name_ar, a.name_en AS area_name_en
FROM compounds c
JOIN areas a ON a.id = c.area_id
WHERE c.slug = $1;

-- name: ListActiveUnitsByCompoundID :many
SELECT u.id, u.compound_id, u.slug, u.title_ar, u.title_en, u.type, u.bedrooms, u.bathrooms,
       u.max_guests, u.sea_distance_m, u.view, u.status, u.created_at,
       ci.url AS cover_url
FROM units u
LEFT JOIN unit_images ci ON ci.unit_id = u.id AND ci.is_cover
WHERE u.compound_id = $1 AND u.status = 'active'
ORDER BY u.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountActiveUnitsByCompoundID :one
SELECT COUNT(*) FROM units WHERE compound_id = $1 AND status = 'active';
