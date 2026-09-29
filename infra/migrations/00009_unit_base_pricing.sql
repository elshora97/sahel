-- +goose Up
-- Pricing without seasons (2026-09-29): each unit carries its own nightly
-- price, optional weekend price and check-in days; unit_calendar keeps only
-- the admin's per-date edits.

ALTER TABLE units
  ADD COLUMN nightly_price        BIGINT CHECK (nightly_price > 0),
  ADD COLUMN weekend_price        BIGINT CHECK (weekend_price > 0),
  -- 0 = Sunday … 6 = Saturday; empty means every day.
  ADD COLUMN allowed_checkin_days SMALLINT[] NOT NULL DEFAULT '{}'
    CHECK (allowed_checkin_days <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]);

-- Rows generated from seasons carry no admin intent; manual edits stay.
DELETE FROM unit_calendar WHERE source = 'rule';

ALTER TABLE unit_calendar
  DROP COLUMN season_id,
  DROP COLUMN source,
  DROP COLUMN allowed_checkin,
  ALTER COLUMN price DROP NOT NULL,
  ALTER COLUMN min_nights DROP NOT NULL;

DROP TABLE seasons;
DROP TYPE calendar_source_enum;

-- +goose Down
CREATE TYPE calendar_source_enum AS ENUM ('rule', 'manual');

CREATE TABLE seasons (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name_ar              TEXT NOT NULL,
  name_en              TEXT NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  nightly_price        BIGINT NOT NULL CHECK (nightly_price > 0),
  min_nights           SMALLINT NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  allowed_checkin_days SMALLINT[] NOT NULL DEFAULT '{}',
  weekend_uplift_pct   SMALLINT NOT NULL DEFAULT 0 CHECK (weekend_uplift_pct BETWEEN 0 AND 300),
  priority             INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TRIGGER seasons_set_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DELETE FROM unit_calendar WHERE price IS NULL OR min_nights IS NULL;
ALTER TABLE unit_calendar
  ALTER COLUMN price SET NOT NULL,
  ALTER COLUMN min_nights SET NOT NULL,
  ADD COLUMN allowed_checkin BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN source calendar_source_enum NOT NULL DEFAULT 'manual',
  ADD COLUMN season_id UUID REFERENCES seasons(id) ON DELETE SET NULL;

ALTER TABLE units
  DROP COLUMN allowed_checkin_days,
  DROP COLUMN weekend_price,
  DROP COLUMN nightly_price;
