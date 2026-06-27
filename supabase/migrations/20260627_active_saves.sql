-- T2: active_saves + save_files tables (v0.0.15.x - 2026-06-27)
--
-- active_saves: one row per room, stores multiplayer in-progress world state.
--   Written ONLY by the save-active Edge Function (service_role).
--   RLS enabled with no policies → DENY ALL for authenticated users.
--
-- save_files: formal persistent saves created when host chooses "save and exit".
--   owner_id is the host's auth.uid() at save time (RLS: read/write own slot).
--   Up to 3 save slots per player (UNIQUE owner_id + slot).

-- ══════════════════════════════════════════════════════════════════
-- active_saves
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS active_saves (
  room_id        TEXT        PRIMARY KEY,
  data           JSONB       NOT NULL,
  schema_version INT         NOT NULL DEFAULT 1,
  -- data_revision is used as an optimistic lock: client sends back the revision it last read,
  -- Edge Function rejects if DB value has changed since then (prevents concurrent overwrites).
  data_revision  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DENY ALL from authenticated / anon users: all writes go through Edge Function service_role
ALTER TABLE active_saves ENABLE ROW LEVEL SECURITY;
-- No policies created → default deny

-- ══════════════════════════════════════════════════════════════════
-- save_files
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS save_files (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- room_id is nullable: records where this save originated from (optional audit trail)
  room_id        TEXT        DEFAULT NULL,
  -- 1-3 save slots per player; overwriting slot re-uses the existing row (ON CONFLICT)
  slot           INT         NOT NULL DEFAULT 1 CHECK (slot BETWEEN 1 AND 3),
  data           JSONB       NOT NULL,
  schema_version INT         NOT NULL DEFAULT 1,
  data_revision  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slot)
);

-- RLS: each player can only see and write their own save slots
ALTER TABLE save_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "save_files_select_own" ON save_files;
CREATE POLICY "save_files_select_own" ON save_files
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "save_files_insert_own" ON save_files;
CREATE POLICY "save_files_insert_own" ON save_files
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "save_files_update_own" ON save_files;
CREATE POLICY "save_files_update_own" ON save_files
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "save_files_delete_own" ON save_files;
CREATE POLICY "save_files_delete_own" ON save_files
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);
