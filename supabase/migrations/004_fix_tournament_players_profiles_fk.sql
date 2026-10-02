-- ============================================================
-- Fix: tournament_players -> profiles relationship
-- Run this in Supabase SQL Editor
-- ============================================================
-- WHY
-- The app reads player names with an embedded resource:
--   tournaments?select=*,tournament_players(*,profiles(id,display_name,avatar_url))
--
-- PostgREST resolves embedded resources ONLY through direct
-- foreign keys inside the exposed schema. Both tables pointed at
-- auth.users(id), which is NOT exposed, so PostgREST could not
-- infer the link and every lobby request failed with:
--   PGRST200: Could not find a relationship between
--   'tournament_players' and 'profiles' in the schema cache
--
-- This adds the missing direct FK. No RLS changes, no Auth
-- changes, no tables are dropped or recreated.
-- ============================================================


-- ── 1. Backfill any profile missing for an existing auth user ──────────────
-- tournament_players.user_id already references auth.users(id), so after this
-- every participant is guaranteed to have a profile row and the FK below
-- can be created as a fully validated constraint.
INSERT INTO public.profiles (id, display_name, avatar_url, created_at)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
    'Racer_' || SUBSTRING(u.id::text, 1, 6)
  ),
  COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'avatar_url'), ''), '🏎️'),
  NOW()
FROM auth.users u
ON CONFLICT (id) DO NOTHING;


-- ── 2. Create the direct FK PostgREST needs for the embed ──────────────────
-- Idempotent: safe to re-run.
ALTER TABLE public.tournament_players
  DROP CONSTRAINT IF EXISTS tournament_players_user_id_profiles_fkey;

ALTER TABLE public.tournament_players
  ADD CONSTRAINT tournament_players_user_id_profiles_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles (id)
  ON DELETE CASCADE;


-- ── 3. Reload the PostgREST schema cache ───────────────────────────────────
-- Without this the new FK may not be picked up immediately.
NOTIFY pgrst, 'reload schema';


-- ── 4. Verify (all should return 1 row / 0 rows as shown) ───────────────────
-- Expect 1: the constraint now exists
SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'public.tournament_players'::regclass
  AND conname = 'tournament_players_user_id_profiles_fkey';

-- Expect 0: participants without a profile (must be empty for the FK above)
SELECT COUNT(*) AS orphan_participants
FROM public.tournament_players tp
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = tp.user_id);

-- Expect 0: players still missing a profile row
SELECT COUNT(*) AS users_without_profile
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);


-- ============================================================
-- After running this, the lobby query that previously failed
-- should return 200 with the tournament and its players:
--
--   tournaments?select=*,tournament_players(*,profiles(id,display_name,avatar_url))
--
-- If it still returns PGRST200, the schema cache did not reload;
-- re-run just the NOTIFY statement above.
-- ============================================================
