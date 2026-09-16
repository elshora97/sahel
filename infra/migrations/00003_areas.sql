-- +goose Up
CREATE TYPE region_enum AS ENUM (
  'north_coast', 'sokhna', 'gouna', 'ras_sudr', 'new_cairo'
);

CREATE TABLE areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  region      region_enum NOT NULL,
  km_marker   INT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER areas_set_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS areas;
DROP TYPE  IF EXISTS region_enum;
