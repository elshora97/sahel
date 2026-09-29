-- +goose Up
-- Simpler pricing (2026-09-29): one nightly price and a cleaning fee per unit.
-- No check-in days, minimum stay, weekend price, extra-guest fee, security
-- deposit or per-date calendar edits.

DROP TABLE unit_calendar;

ALTER TABLE units
  DROP COLUMN weekend_price,
  DROP COLUMN allowed_checkin_days,
  DROP COLUMN min_nights_default,
  DROP COLUMN extra_guest_fee,
  DROP COLUMN security_deposit;

-- +goose Down
ALTER TABLE units
  ADD COLUMN weekend_price        BIGINT CHECK (weekend_price > 0),
  ADD COLUMN allowed_checkin_days SMALLINT[] NOT NULL DEFAULT '{}'
    CHECK (allowed_checkin_days <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]),
  ADD COLUMN min_nights_default   SMALLINT NOT NULL DEFAULT 1 CHECK (min_nights_default >= 1),
  ADD COLUMN extra_guest_fee      BIGINT   NOT NULL DEFAULT 0 CHECK (extra_guest_fee >= 0),
  ADD COLUMN security_deposit     BIGINT   NOT NULL DEFAULT 0 CHECK (security_deposit >= 0);

CREATE TABLE unit_calendar (
  unit_id      UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  price        BIGINT CHECK (price >= 0),
  min_nights   SMALLINT CHECK (min_nights >= 1),
  is_available BOOLEAN NOT NULL DEFAULT true,
  note         TEXT,
  PRIMARY KEY (unit_id, date)
);
