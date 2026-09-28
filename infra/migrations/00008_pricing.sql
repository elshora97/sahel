-- +goose Up
-- Phase 3: per-unit seasons generate one calendar row per unit per date.
-- All money is integer piasters.

ALTER TABLE units
  ADD COLUMN cleaning_fee         BIGINT   NOT NULL DEFAULT 0  CHECK (cleaning_fee >= 0),
  ADD COLUMN deposit_pct          SMALLINT NOT NULL DEFAULT 30 CHECK (deposit_pct BETWEEN 0 AND 100),
  ADD COLUMN security_deposit     BIGINT   NOT NULL DEFAULT 0  CHECK (security_deposit >= 0),
  ADD COLUMN extra_guest_fee      BIGINT   NOT NULL DEFAULT 0  CHECK (extra_guest_fee >= 0),
  ADD COLUMN min_nights_default   SMALLINT NOT NULL DEFAULT 1  CHECK (min_nights_default >= 1),
  ADD COLUMN buffer_days          SMALLINT NOT NULL DEFAULT 0  CHECK (buffer_days >= 0),
  ADD COLUMN advance_notice_hours INT      NOT NULL DEFAULT 24 CHECK (advance_notice_hours >= 0),
  ADD COLUMN max_advance_days     INT      NOT NULL DEFAULT 365 CHECK (max_advance_days >= 1);

CREATE TABLE seasons (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name_ar              TEXT NOT NULL,
  name_en              TEXT NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  nightly_price        BIGINT NOT NULL CHECK (nightly_price > 0),
  min_nights           SMALLINT NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  -- 0 = Sunday … 6 = Saturday; empty means every day.
  allowed_checkin_days SMALLINT[] NOT NULL DEFAULT '{}',
  weekend_uplift_pct   SMALLINT NOT NULL DEFAULT 0 CHECK (weekend_uplift_pct BETWEEN 0 AND 300),
  priority             INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (allowed_checkin_days <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[])
);

CREATE INDEX seasons_unit_id_idx ON seasons (unit_id, start_date);

CREATE TRIGGER seasons_set_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE calendar_source_enum AS ENUM ('rule', 'manual');

CREATE TABLE unit_calendar (
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  price           BIGINT NOT NULL CHECK (price >= 0),
  min_nights      SMALLINT NOT NULL CHECK (min_nights >= 1),
  allowed_checkin BOOLEAN NOT NULL DEFAULT true,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  source          calendar_source_enum NOT NULL,
  season_id       UUID REFERENCES seasons(id) ON DELETE SET NULL,
  note            TEXT,
  PRIMARY KEY (unit_id, date)
);

-- +goose Down
DROP TABLE IF EXISTS unit_calendar;
DROP TYPE  IF EXISTS calendar_source_enum;
DROP TABLE IF EXISTS seasons;
ALTER TABLE units
  DROP COLUMN IF EXISTS cleaning_fee,
  DROP COLUMN IF EXISTS deposit_pct,
  DROP COLUMN IF EXISTS security_deposit,
  DROP COLUMN IF EXISTS extra_guest_fee,
  DROP COLUMN IF EXISTS min_nights_default,
  DROP COLUMN IF EXISTS buffer_days,
  DROP COLUMN IF EXISTS advance_notice_hours,
  DROP COLUMN IF EXISTS max_advance_days;
