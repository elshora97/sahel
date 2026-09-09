-- +goose Up
CREATE TYPE unit_type_enum AS ENUM (
  'chalet', 'villa', 'twin', 'town', 'penthouse', 'studio', 'apartment'
);

CREATE TYPE unit_view_enum AS ENUM (
  'sea', 'lagoon', 'pool', 'garden', 'street'
);

CREATE TYPE unit_status_enum AS ENUM (
  'draft', 'active', 'paused', 'archived'
);

CREATE TABLE units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES owners(id),
  compound_id       UUID NOT NULL REFERENCES compounds(id),
  slug              TEXT NOT NULL UNIQUE,
  title_ar          TEXT NOT NULL,
  title_en          TEXT NOT NULL,
  description_ar    TEXT NOT NULL,
  description_en    TEXT NOT NULL,
  house_rules_ar    TEXT,
  house_rules_en    TEXT,
  type              unit_type_enum NOT NULL,
  bedrooms          SMALLINT NOT NULL,
  bathrooms         SMALLINT NOT NULL,
  base_guests       SMALLINT NOT NULL,
  max_guests        SMALLINT NOT NULL,
  area_sqm          INT,
  floor             SMALLINT,
  sea_distance_m    INT NOT NULL,
  view              unit_view_enum NOT NULL,
  row_number        SMALLINT,
  amenities         TEXT[] NOT NULL DEFAULT '{}',
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  exact_address     TEXT,
  status            unit_status_enum NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX units_owner_id_idx        ON units (owner_id);
CREATE INDEX units_compound_id_idx     ON units (compound_id);
CREATE INDEX units_status_idx          ON units (status);
CREATE INDEX units_view_idx            ON units (view);
CREATE INDEX units_sea_distance_m_idx  ON units (sea_distance_m);

CREATE TRIGGER units_set_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS units;
DROP TYPE  IF EXISTS unit_status_enum;
DROP TYPE  IF EXISTS unit_view_enum;
DROP TYPE  IF EXISTS unit_type_enum;
