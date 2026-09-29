-- +goose Up
-- Phase 4: guests sign in with a phone code and book; overlaps are
-- impossible at the database level.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+201[0125][0-9]{8}$'),
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);
CREATE INDEX otp_codes_ip_idx    ON otp_codes (ip, created_at DESC);

CREATE TYPE booking_status_enum AS ENUM (
  'draft', 'pending_payment', 'awaiting_verification', 'confirmed', 'checked_in',
  'completed', 'expired', 'cancelled', 'refund_pending', 'refunded'
);

CREATE TABLE bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT NOT NULL UNIQUE CHECK (ref ~ '^BES-[0-9A-HJKMNP-TV-Z]{5}$'),
  unit_id       UUID NOT NULL REFERENCES units(id),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  check_in      DATE NOT NULL,
  check_out     DATE NOT NULL,
  nights        INT GENERATED ALWAYS AS (check_out - check_in) STORED,
  guests        SMALLINT NOT NULL CHECK (guests >= 1),
  status        booking_status_enum NOT NULL,
  nightly_price BIGINT NOT NULL CHECK (nightly_price > 0),
  total         BIGINT NOT NULL CHECK (total > 0),
  deposit_due   BIGINT NOT NULL CHECK (deposit_due >= 0),
  source        TEXT NOT NULL DEFAULT 'web',
  cancelled_at  TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stay          DATERANGE GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED,
  CHECK (check_out > check_in)
);

-- The predicate must name every status in booking.Occupying; the Go test
-- TestMigrationPredicateMatchesDomain fails if the two drift apart.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (unit_id WITH =, stay WITH &&)
  WHERE (status IN ('awaiting_verification','checked_in','completed','confirmed','pending_payment'));

CREATE INDEX bookings_customer_idx ON bookings (customer_id, created_at DESC);
CREATE INDEX bookings_unit_idx     ON bookings (unit_id, check_in);
CREATE INDEX bookings_status_idx   ON bookings (status);

CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS bookings;
DROP TYPE  IF EXISTS booking_status_enum;
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS customers;
