-- +goose Up
-- Phase 5: guests pay the deposit by InstaPay and upload the receipt; an
-- admin verifies it and the booking is confirmed.

ALTER TABLE bookings
  ADD COLUMN hold_expires_at         TIMESTAMPTZ,
  ADD COLUMN paid_total              BIGINT   NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  ADD COLUMN payment_rejection_count SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX bookings_hold_idx ON bookings (hold_expires_at) WHERE status = 'pending_payment';

CREATE TYPE payment_status_enum AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  method           TEXT NOT NULL DEFAULT 'instapay' CHECK (method = 'instapay'),
  status           payment_status_enum NOT NULL DEFAULT 'pending',
  amount           BIGINT NOT NULL CHECK (amount >= 0),
  sender_name      TEXT NOT NULL DEFAULT '',
  sender_number    TEXT NOT NULL DEFAULT '',
  proof_key        TEXT,
  proof_type       TEXT,
  rejection_reason TEXT,
  notes            TEXT,
  recorded_by      TEXT NOT NULL CHECK (recorded_by IN ('guest', 'admin')),
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payments_booking_idx ON payments (booking_id, created_at);
CREATE INDEX payments_status_idx  ON payments (status, created_at DESC);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The one InstaPay account guests pay into.
CREATE TABLE instapay_account (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  address     TEXT NOT NULL DEFAULT '',
  mobile      TEXT NOT NULL DEFAULT '',
  holder_name TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO instapay_account (id) VALUES (1);

-- +goose Down
DROP TABLE IF EXISTS instapay_account;
DROP TABLE IF EXISTS payments;
DROP TYPE  IF EXISTS payment_status_enum;
DROP INDEX IF EXISTS bookings_hold_idx;
ALTER TABLE bookings
  DROP COLUMN IF EXISTS hold_expires_at,
  DROP COLUMN IF EXISTS paid_total,
  DROP COLUMN IF EXISTS payment_rejection_count;
