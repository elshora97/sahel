-- +goose Up
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- +goose Down
-- Deliberately a no-op. Dropping btree_gist would take the bookings
-- exclusion index with it, silently, which is the one failure mode
-- this whole system is built to avoid.
SELECT 1;
