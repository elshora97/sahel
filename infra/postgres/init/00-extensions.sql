-- Runs once, on an empty data directory, before any migration.
-- btree_gist is what lets the bookings exclusion constraint mix an equality
-- column (unit_id) with a range column (stay) in a single index.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
