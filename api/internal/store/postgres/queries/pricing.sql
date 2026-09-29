-- name: GetPricingUnit :one
-- What pricing needs. Public callers pass only_active so drafts stay hidden.
SELECT id, slug, status, nightly_price, max_guests,
       advance_notice_hours, max_advance_days
FROM units
WHERE (sqlc.narg('slug')::text IS NULL OR slug = sqlc.narg('slug')::text)
  AND (sqlc.narg('id')::uuid IS NULL OR id = sqlc.narg('id')::uuid)
  AND (NOT @only_active::boolean OR status = 'active');
