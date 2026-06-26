-- Room presence / heartbeat / cleanup columns (v0.0.14.2).
-- All ALTER TABLE use IF NOT EXISTS to be safe on re-run.

-- room_memberships: heartbeat tracking
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- rooms: last activity + completion timestamp
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;
