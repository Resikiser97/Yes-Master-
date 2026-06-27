-- T1: Row Level Security Policies (v0.0.15.x - 2026-06-27)
-- Adds RLS to existing tables: player_profiles, rooms, room_memberships.
-- save_files RLS is applied in 20260627_active_saves.sql (table created there).
-- active_saves has no SELECT/INSERT/UPDATE/DELETE policies → DENY ALL for authenticated users.
-- All writes to rooms/room_memberships/active_saves go through Edge Functions (service_role bypasses RLS).
--
-- NOTE: player_profiles policy replicates what is already live on Supabase (select true / insert+update own).
-- Safe to re-run: all DROP IF EXISTS before CREATE.

-- ══════════════════════════════════════════════════════════════════
-- player_profiles
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read profiles (needed for friend lookup / waiting room member display)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON player_profiles;
CREATE POLICY "profiles_select_authenticated" ON player_profiles
  FOR SELECT TO authenticated USING (true);

-- Only own row for INSERT
DROP POLICY IF EXISTS "profiles_insert_own" ON player_profiles;
CREATE POLICY "profiles_insert_own" ON player_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Only own row for UPDATE
DROP POLICY IF EXISTS "profiles_update_own" ON player_profiles;
CREATE POLICY "profiles_update_own" ON player_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- rooms
-- SELECT: all authenticated (lobby listing needs to see public rooms)
-- INSERT / UPDATE / DELETE: no policy → DENY (all via Edge Function service_role)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_authenticated" ON rooms;
CREATE POLICY "rooms_select_authenticated" ON rooms
  FOR SELECT TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════
-- room_memberships
-- SELECT: own rows OR same-room rows (waiting room needs to list all members)
-- INSERT / UPDATE / DELETE: no policy → DENY (all via Edge Function service_role)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE room_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_select_own_or_same_room" ON room_memberships;
CREATE POLICY "memberships_select_own_or_same_room" ON room_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR room_id IN (
      SELECT rm.room_id
      FROM room_memberships rm
      WHERE rm.user_id = auth.uid()
    )
  );
