-- name: AdminListCustomers :many
-- Every guest account with a summary of their bookings; newest account first.
SELECT cu.id, cu.name, cu.phone, cu.created_at,
       COUNT(b.id)::int AS bookings,
       COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in','completed'))::int AS stays,
       COALESCE(SUM(b.paid_total), 0)::bigint AS paid_total,
       MAX(b.created_at)::timestamptz AS last_booked_at
FROM customers cu
LEFT JOIN bookings b ON b.customer_id = cu.id
WHERE sqlc.narg('search')::text IS NULL
   OR cu.name ILIKE '%' || sqlc.narg('search')::text || '%'
   OR cu.phone LIKE '%' || sqlc.narg('search')::text || '%'
GROUP BY cu.id
ORDER BY cu.created_at DESC
LIMIT 500;

-- name: AdminGetCustomer :one
SELECT id, name, phone, email, created_at, (password_hash IS NOT NULL)::boolean AS has_password
FROM customers WHERE id = $1;
