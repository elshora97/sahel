-- name: AdminListOwners :many
SELECT * FROM owners ORDER BY name ASC;

-- name: AdminGetOwner :one
SELECT * FROM owners WHERE id = $1;

-- name: AdminCreateOwner :one
INSERT INTO owners (name, phone, email, national_id, notes, commission_pct)
VALUES (@name, @phone, @email, @national_id, @notes, @commission_pct)
RETURNING *;

-- name: AdminUpdateOwner :one
UPDATE owners
SET name = @name, phone = @phone, email = @email, national_id = @national_id,
    notes = @notes, commission_pct = @commission_pct
WHERE id = @id
RETURNING *;

-- name: AdminDeleteOwner :execrows
DELETE FROM owners WHERE id = $1;
