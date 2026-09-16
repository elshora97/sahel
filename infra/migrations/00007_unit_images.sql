-- +goose Up
CREATE TABLE unit_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_ar      TEXT,
  alt_en      TEXT,
  sort        SMALLINT NOT NULL DEFAULT 0,
  is_cover    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX unit_images_unit_id_idx ON unit_images (unit_id);
CREATE UNIQUE INDEX unit_images_one_cover
  ON unit_images (unit_id) WHERE is_cover = true;

CREATE TRIGGER unit_images_set_updated_at
  BEFORE UPDATE ON unit_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS unit_images;
