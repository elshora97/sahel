-- +goose Up
-- Phase 6: an admin blocks a unit's nights (owner staying, maintenance) so
-- guests can't book them. A block has no price, no guest and no turnover days.

CREATE TABLE unit_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id    UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL, -- exclusive, like a booking's check-out
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  span       DATERANGE GENERATED ALWAYS AS (daterange(start_date, end_date, '[)')) STORED,
  CHECK (end_date > start_date)
);

-- One unit's blocks never overlap; blocks against bookings are checked in
-- the transaction that holds the unit's row lock.
ALTER TABLE unit_blocks ADD CONSTRAINT unit_blocks_no_overlap
  EXCLUDE USING gist (unit_id WITH =, span WITH &&);

-- +goose Down
DROP TABLE IF EXISTS unit_blocks;
