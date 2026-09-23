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
SELECT id, compound_id, slug, title_ar, title_en, type, bedrooms, bathrooms,
       max_guests, sea_distance_m, view, status, created_at
FROM units
WHERE compound_id = $1 AND status = 'active'
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountActiveUnitsByCompoundID :one
SELECT COUNT(*) FROM units WHERE compound_id = $1 AND status = 'active';
