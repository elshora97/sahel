-- name: AdminLockUnit :one
-- Serialises image writes per unit so sort/cover decisions can't race.
SELECT id FROM units WHERE id = $1 FOR UPDATE;

-- name: AdminCreateUnitImage :one
-- Appends at the end of the sort order; the first image becomes the cover.
INSERT INTO unit_images (unit_id, url, sort, is_cover)
VALUES (
  @unit_id, @url,
  (SELECT COALESCE(MAX(sort) + 1, 0) FROM unit_images WHERE unit_id = @unit_id),
  NOT EXISTS (SELECT 1 FROM unit_images WHERE unit_id = @unit_id AND is_cover)
)
RETURNING *;

-- name: AdminGetUnitImage :one
SELECT * FROM unit_images WHERE id = @id AND unit_id = @unit_id;

-- name: AdminClearUnitCover :exec
UPDATE unit_images SET is_cover = false
WHERE unit_id = @unit_id AND is_cover AND id <> @keep_id;

-- name: AdminUpdateUnitImage :one
UPDATE unit_images
SET alt_ar = @alt_ar, alt_en = @alt_en, sort = @sort, is_cover = @is_cover
WHERE id = @id
RETURNING *;

-- name: AdminDeleteUnitImage :one
DELETE FROM unit_images WHERE id = @id AND unit_id = @unit_id RETURNING url;
