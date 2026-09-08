-- +goose Up
CREATE TYPE beach_type_enum AS ENUM ('sea', 'lagoon', 'both', 'none');

CREATE TABLE compounds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id           UUID NOT NULL REFERENCES areas(id),
  slug              TEXT NOT NULL UNIQUE,
  name_ar           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  description_ar    TEXT NOT NULL,
  description_en    TEXT NOT NULL,
  amenities         TEXT[] NOT NULL DEFAULT '{}',
  beach_type        beach_type_enum NOT NULL,
  gate_info_ar      TEXT,
  gate_info_en      TEXT,
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  cover_image_url   TEXT,
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX compounds_area_id_idx ON compounds (area_id);

CREATE TRIGGER compounds_set_updated_at
  BEFORE UPDATE ON compounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS compounds;
DROP TYPE  IF EXISTS beach_type_enum;
