-- +goose Up
-- Guests sign in with phone + password instead of SMS codes (2026-09-29).
ALTER TABLE customers ADD COLUMN password_hash TEXT;

DROP TABLE otp_codes;

-- Every sign-in or sign-up attempt, for rate limiting.
CREATE TABLE auth_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('login', 'register')),
  phone      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_attempts_phone_idx ON auth_attempts (phone, created_at DESC);
CREATE INDEX auth_attempts_ip_idx    ON auth_attempts (ip, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS auth_attempts;

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

ALTER TABLE customers DROP COLUMN password_hash;
