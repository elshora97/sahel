-- name: ListAreasWithUnitCount :many
SELECT
  a.id, a.slug, a.name_ar, a.name_en, a.region, a.km_marker, a.sort_order,
  COUNT(u.id) FILTER (WHERE u.status = 'active') AS unit_count
FROM areas a
LEFT JOIN compounds c ON c.area_id = a.id
LEFT JOIN units u     ON u.compound_id = c.id
GROUP BY a.id
ORDER BY a.sort_order ASC, a.name_en ASC;

-- name: GetAreaBySlug :one
SELECT id, slug, name_ar, name_en, region, km_marker, sort_order
FROM areas WHERE slug = $1;

-- name: ListFeaturedCompoundsByAreaID :many
SELECT id, area_id, slug, name_ar, name_en, description_ar, description_en,
       amenities, beach_type, gate_info_ar, gate_info_en, lat, lng,
       cover_image_url, is_featured
FROM compounds
WHERE area_id = $1 AND is_featured = true
ORDER BY name_en ASC;
