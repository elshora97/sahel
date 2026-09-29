-- +goose Up
-- The guest pays exactly the unit's nightly price × nights, with no extra
-- fees, and confirms with a deposit of one night's price.
ALTER TABLE units
  DROP COLUMN cleaning_fee,
  DROP COLUMN deposit_pct;

-- +goose Down
ALTER TABLE units
  ADD COLUMN cleaning_fee BIGINT   NOT NULL DEFAULT 0  CHECK (cleaning_fee >= 0),
  ADD COLUMN deposit_pct  SMALLINT NOT NULL DEFAULT 30 CHECK (deposit_pct BETWEEN 0 AND 100);
