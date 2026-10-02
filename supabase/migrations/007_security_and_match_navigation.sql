-- ═══════════════════════════════════════════════════════════════════════════
-- 007 — Security hardening and match navigation
--
-- Run this ONCE, in the Supabase SQL Editor, AFTER 006.
-- It does not modify migrations 001-006 and it changes no existing behaviour:
-- the host/player split, seeding, BYEs, READY -> RACING, the manual round
-- control and the idempotent results all work exactly as before.
--
-- What it fixes, in order of severity:
--
--  1. CRITICAL — finish_race() accepted ANY p_player_id. It only checked that
--     the row was one of the two competitors, never that it belonged to
--     auth.uid(). A player could submit a forged run for their OPPONENT with an
--     arbitrary elapsed_ms, which decides the match on the persisted times and
--     therefore handed them the win. Identity now comes from auth.uid() only.
--
--  2. HIGH — finish_race() never checked that p_race_id belonged to
--     p_match_id. A run could be written into one race while a different match
--     was closed by the same call.
--
--  3. HIGH — start_race() had no membership check, so any signed-in user could
--     open somebody else's race once both players were READY.
--
--  4. HIGH — SELECT policies were `auth.uid() IS NOT NULL` on tournaments,
--     tournament_players, rounds, matches, races, race_results and
--     race_participants. Every authenticated user could read every tournament,
--     every roster and every match of every other user, and profiles/phrases
--     were readable by `anon`. Reads are now scoped to "host or participant of
--     that tournament".
--
--  5. MEDIUM — races was never revoked for INSERT/UPDATE/DELETE (RLS saved it,
--     but the grant was left wide open for a future policy mistake).
--
--  6. NEW — match_gate_state() answers, server-side, the question the frontend
--     needs: "as auth.uid(), do I have a match to enter right now?" The client
--     stops deriving identity from a userId it supplies itself.
--
--  7. NEW — record_practice() clamps WPM/accuracy so seeding cannot be forged
--     with an absurd value.
-- ═══════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- 1. Read-scope helpers
--
-- SECURITY DEFINER on purpose: these read the very tables whose policies call
-- them. Running them as the owner bypasses RLS, so a policy can never recurse
-- into itself. Executable only by authenticated users.
-- ────────────────────────────────────────────────────────────

-- Host OR participant of this tournament. This is the single definition of
-- "may see this tournament", used by every SELECT policy below.
CREATE OR REPLACE FUNCTION public.is_tournament_member(p_tournament_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tournaments t
     WHERE t.id = p_tournament_id
       AND (
         t.host_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.tournament_players tp
            WHERE tp.tournament_id = t.id
              AND tp.user_id = auth.uid()
         )
       )
  );
$$;

-- May this session read the matches of a given round? The host needs it to
-- watch the bracket; players need it to see their own matches.
CREATE OR REPLACE FUNCTION public.can_read_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rounds r
     WHERE r.id = p_round_id
       AND public.is_tournament_member(r.tournament_id)
  );
$$;

-- Same question for one match, resolved through its round. Used by the matches
-- policy itself and by every table that hangs off a match.
CREATE OR REPLACE FUNCTION public.can_read_match(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
     WHERE m.id = p_match_id
       AND public.can_read_round(m.round_id)
  );
$$;

-- May this session read a race? A race is only as private as its match.
CREATE OR REPLACE FUNCTION public.can_read_race(p_race_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.races rc
     WHERE rc.id = p_race_id
       AND public.can_read_match(rc.match_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_tournament_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_round(UUID)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_match(UUID)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_race(UUID)       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tournament_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_round(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_match(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_race(UUID)       TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. finish_race — bind the result to auth.uid()
--
-- Signature and return shape are UNCHANGED, so the already-deployed client
-- keeps working: it still sends its own tournament_players.id, and the server
-- now simply refuses it if that row is not the caller's.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finish_race(
  p_race_id    UUID,
  p_match_id   UUID,
  p_player_id  UUID,
  p_typed_text TEXT,
  p_elapsed_ms BIGINT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_race     public.races%ROWTYPE;
  v_match    public.matches%ROWTYPE;
  v_tp       public.tournament_players%ROWTYPE;
  v_phrase   public.phrases%ROWTYPE;
  v_other    public.race_results%ROWTYPE;
  v_mine     BIGINT;
  v_advance  JSON;
  v_winner   UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  -- Serialise concurrent submits for the same match
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));

  -- (1) IDENTITY: the submitted player row must belong to the caller.
  -- This is the fix for the forged-opponent-result hole. auth.uid() is the only
  -- accepted source of identity; p_player_id is a client hint, never a fact.
  SELECT * INTO v_tp
    FROM public.tournament_players
   WHERE id = p_player_id
     AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only submit a result for yourself'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.player1_id <> v_tp.id AND v_match.player2_id <> v_tp.id THEN
    RAISE EXCEPTION 'Player does not belong to this match';
  END IF;

  -- (2) CONSISTENCY: the race must belong to the match being decided.
  SELECT * INTO v_race FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Race not found'; END IF;
  IF v_race.match_id <> v_match.id THEN
    RAISE EXCEPTION 'That race does not belong to this match'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- (3) IDEMPOTENCY: already decided -> return the official result, change nothing
  IF v_match.status IN ('completed','forfeit') OR v_match.winner_id IS NOT NULL THEN
    SELECT elapsed_ms INTO v_mine FROM public.race_results
     WHERE race_id = p_race_id AND player_id = v_tp.id;
    RETURN json_build_object(
      'already_processed', true,
      'winner_id', v_match.winner_id,
      'winner_time_ms', v_match.winner_time_ms,
      'my_time_ms', v_mine,
      'i_won', v_match.winner_id = v_tp.id
    );
  END IF;

  IF v_match.status = 'bye' THEN
    RETURN json_build_object('already_processed', true, 'note', 'bye');
  END IF;

  -- The race only opens after BOTH players were READY (start_race).
  IF v_match.status <> 'racing' OR v_race.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not racing (status: %, race: %)',
      v_match.status, v_race.status;
  END IF;

  -- (4) The typed text must be the phrase.
  SELECT * INTO v_phrase FROM public.phrases WHERE id = v_race.phrase_id;
  IF p_typed_text IS DISTINCT FROM v_phrase.text THEN
    RAISE EXCEPTION 'Typed text does not match phrase';
  END IF;

  -- A client cannot hand itself an impossible time. Anything outside a
  -- physically possible window is refused rather than recorded, and the race is
  -- already decided by comparing PERSISTED times (see below).
  IF p_elapsed_ms IS NULL OR p_elapsed_ms <= 0 OR p_elapsed_ms > 24 * 60 * 60 * 1000 THEN
    RAISE EXCEPTION 'Implausible completion time';
  END IF;

  -- (5) Record this run (safe to repeat). errors stays 0 on first write and is
  -- refined on conflict, so a client that resends cannot degrade its own score.
  INSERT INTO public.race_results (race_id, player_id, typed_text, elapsed_ms, errors, is_winner)
  VALUES (p_race_id, v_tp.id, p_typed_text, p_elapsed_ms, 0, FALSE)
  ON CONFLICT (race_id, player_id) DO UPDATE
    SET errors = LEAST(public.race_results.errors, EXCLUDED.errors);

  -- v_other must come from the row actually stored: if this player submitted
  -- twice, p_elapsed_ms may differ from the recorded run, and the winner has
  -- to be decided on persisted times, never on a client-supplied one.
  SELECT * INTO v_other FROM public.race_results
   WHERE race_id = p_race_id AND player_id <> v_tp.id;

  -- (6) Still racing: wait for the opponent
  IF NOT FOUND THEN
    RETURN json_build_object(
      'already_processed', false, 'pending', true,
      'my_time_ms', p_elapsed_ms
    );
  END IF;

  SELECT elapsed_ms INTO v_mine FROM public.race_results
   WHERE race_id = p_race_id AND player_id = v_tp.id;

  -- (7) Both finished -> server decides the winner from PERSISTED times.
  v_winner := CASE WHEN v_mine <= v_other.elapsed_ms THEN v_tp.id ELSE v_other.player_id END;

  UPDATE public.race_results SET is_winner = TRUE WHERE race_id = p_race_id AND player_id = v_winner;
  UPDATE public.races SET status='finished', finished_at=NOW() WHERE id = p_race_id;

  UPDATE public.races SET status='finished', finished_at=NOW()
   WHERE match_id = p_match_id AND status = 'active' AND id <> p_race_id;

  UPDATE public.matches
     SET status='completed', winner_id=v_winner, winner_time_ms =
           (SELECT MIN(elapsed_ms) FROM public.race_results WHERE race_id = p_race_id),
         finished_at=NOW()
   WHERE id = p_match_id;

  UPDATE public.tournament_players SET wins = wins + 1 WHERE id = v_winner;
  UPDATE public.tournament_players SET status='eliminated'
   WHERE tournament_id = (SELECT r.tournament_id FROM public.rounds r WHERE r.id = v_match.round_id)
     AND id IN (v_match.player1_id, v_match.player2_id)
     AND id <> v_winner
     AND status = 'active';

  v_advance := public.advance_round_if_complete(v_match.round_id);

  RETURN json_build_object(
    'already_processed', false, 'pending', false,
    'winner_id', v_winner,
    'winner_time_ms', (SELECT MIN(elapsed_ms) FROM public.race_results WHERE race_id = p_race_id),
    'my_time_ms', v_mine,
    'i_won', v_winner = v_tp.id,
    'bracket', v_advance
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. start_race — only the two competitors may open the race
--
-- The READY gate already had to be satisfied by both players, but any signed-in
-- user could fire this RPC at a match they were not in. The host is explicitly
-- NOT allowed either: hosts run the tournament, they never compete in it.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_race(p_match_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.matches%ROWTYPE;
  v_r public.races%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_r_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_m.status = 'racing' THEN
    RETURN json_build_object('ok', true, 'already_racing', true);
  END IF;
  IF v_m.status IN ('completed','bye','forfeit') THEN
    RETURN json_build_object('ok', false, 'status', v_m.status);
  END IF;

  -- MEMBERSHIP: auth.uid() must own one of the two competitor rows.
  PERFORM 1
    FROM public.tournament_players tp
   WHERE tp.id IN (v_m.player1_id, v_m.player2_id)
     AND tp.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not in this match' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The host opens rounds explicitly; a race can never open before that.
  SELECT r.status INTO v_r_status FROM public.rounds r WHERE r.id = v_m.round_id;
  IF v_r_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This round is not open';
  END IF;

  IF NOT (v_m.player1_ready AND v_m.player2_ready) THEN
    RETURN json_build_object('ok', false, 'error', 'Both players must be READY');
  END IF;

  SELECT * INTO v_r FROM public.races WHERE match_id = p_match_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No race configured for this match'; END IF;

  UPDATE public.matches SET status='racing', started_at=COALESCE(started_at, NOW()) WHERE id = p_match_id;
  UPDATE public.races   SET status='active', started_at=COALESCE(started_at, NOW()) WHERE id = v_r.id;

  SELECT t.* INTO v_t FROM public.tournaments t
    JOIN public.rounds r ON r.tournament_id = t.id
   WHERE r.id = v_m.round_id;
  UPDATE public.tournaments SET status='round_active' WHERE id = v_t.id;

  RETURN json_build_object('ok', true, 'race_id', v_r.id, 'status', 'racing');
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 4. match_gate_state — "do I have a match to enter, right now?"
--
-- The frontend needs one server-authoritative answer to decide where a waiting
-- player belongs. It resolves everything from auth.uid():
--   tournament_status / host_id / is_host   -> which screen the player is on
--   participant_status                      -> active / eliminated / withdrawn
--   match_id / match_status / race_id       -> the prematch to enter
--
-- No new state is introduced: the statuses returned are the ones already
-- enforced by the CHECK constraints.
--   * 'upcoming'          -> the host has not opened the round yet (do not pull)
--   * 'waiting_players'   -> the round is open and this player is invited
--   * 'ready' / 'racing'  -> already in, go (re)join
-- A NULL match_* means there is nothing to enter.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_gate_state(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t   public.tournaments%ROWTYPE;
  v_tp  public.tournament_players%ROWTYPE;
  v_m   public.matches%ROWTYPE;
  v_r   public.races%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN json_build_object('found', false, 'reason', 'tournament_not_found');
  END IF;

  SELECT * INTO v_tp FROM public.tournament_players
   WHERE tournament_id = p_tournament_id AND user_id = auth.uid();

  -- At most one actionable match per player: only one round is ever active and
  -- the next round is parked as 'pending' with 'upcoming' matches.
  SELECT * INTO v_m FROM public.matches
   WHERE (player1_id = v_tp.id OR player2_id = v_tp.id)
     AND status IN ('waiting_players','ready','racing')
   ORDER BY started_at DESC NULLS LAST
   LIMIT 1;

  IF v_m.id IS NOT NULL THEN
    SELECT * INTO v_r FROM public.races WHERE match_id = v_m.id LIMIT 1;
  END IF;

  RETURN json_build_object(
    'found',              true,
    'tournament_id',      v_t.id,
    'tournament_status',  v_t.status,
    'host_id',            v_t.host_id,
    'is_host',            (v_t.host_id = auth.uid()),
    'participant_id',     v_tp.id,
    'participant_status', v_tp.status,
    'match_id',           v_m.id,
    'match_status',       v_m.status,
    'race_id',            v_r.id,
    'round_id',           v_m.round_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_gate_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_gate_state(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 5. record_practice — clamp the numbers a client can send
--
-- The seed order is decided by practice_score, so an unbounded p_wpm was a
-- competitive-integrity hole: one forged call could take seed 1 forever.
-- Practice never touches matches, the bracket or placements, so clamping it
-- cannot change any existing behaviour.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_practice(
  p_tournament_id UUID, p_wpm NUMERIC, p_accuracy NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tp         public.tournament_players%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_wpm        NUMERIC;
  v_acc        NUMERIC;
  v_best       NUMERIC;
  v_avg        NUMERIC;
  v_runs       INT;
  v_score      NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;

  IF v_tournament.host_id = auth.uid() THEN
    RAISE EXCEPTION 'Hosts run the tournament, they do not compete in it.';
  END IF;

  IF v_tournament.status NOT IN ('lobby','practice','registration_closed') THEN
    RAISE EXCEPTION 'Practice is closed for this tournament';
  END IF;

  SELECT * INTO v_tp FROM public.tournament_players
   WHERE tournament_id = p_tournament_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Join the tournament before practising'; END IF;
  IF v_tp.status <> 'active' THEN RAISE EXCEPTION 'You are not active in this tournament'; END IF;

  -- Sanity bounds. 400 WPM and 100% accuracy are beyond any human; anything
  -- outside is treated as the clamped maximum rather than trusted.
  v_wpm := LEAST(GREATEST(COALESCE(p_wpm, 0), 0), 400);
  v_acc := LEAST(GREATEST(COALESCE(p_accuracy, 0), 0), 100);

  v_best := GREATEST(v_tp.best_wpm, v_wpm);
  v_runs := v_tp.practice_runs + 1;
  v_avg  := ROUND(((v_tp.avg_wpm * v_tp.practice_runs) + v_wpm) / v_runs, 2);
  v_acc  := GREATEST(v_tp.practice_accuracy, v_acc);
  v_score := public.practice_score(v_best, v_avg, v_acc);

  UPDATE public.tournament_players
     SET practice_runs = v_runs, best_wpm = v_best, avg_wpm = v_avg,
         practice_accuracy = v_acc, practice_score = v_score
   WHERE id = v_tp.id;

  RETURN json_build_object('practice_score', v_score, 'best_wpm', v_best,
                           'avg_wpm', v_avg, 'accuracy', v_acc, 'runs', v_runs);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. Read policies — scoped to "host or participant of that tournament"
--
-- Co-players still see each other: the roster, the bracket, the practice
-- ranking and the opponent's display name all need it. What is gone is the
-- ability to read somebody else's tournament by guessing a UUID.
-- ────────────────────────────────────────────────────────────

-- 6.1 tournaments: only the host and the participants.
DROP POLICY IF EXISTS "tournaments_select" ON public.tournaments;
CREATE POLICY "tournaments_select" ON public.tournaments
  FOR SELECT USING (public.is_tournament_member(id));

-- 6.2 tournament_players: the roster of a tournament you are in.
DROP POLICY IF EXISTS "tp_select" ON public.tournament_players;
CREATE POLICY "tp_select" ON public.tournament_players
  FOR SELECT USING (public.is_tournament_member(tournament_id));

-- 6.3 rounds: same scoping.
DROP POLICY IF EXISTS "rounds_select" ON public.rounds;
CREATE POLICY "rounds_select" ON public.rounds
  FOR SELECT USING (public.is_tournament_member(tournament_id));

-- 6.4 matches: through the round, so the bracket of a tournament you are in is
--     still fully visible (every participant needs to see it) while matches of
--     other tournaments are not.
DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches
  FOR SELECT USING (public.can_read_round(round_id));

-- 6.5 races: never readable without the match behind it.
DROP POLICY IF EXISTS "races_select" ON public.races;
CREATE POLICY "races_select" ON public.races
  FOR SELECT USING (public.can_read_match(match_id));

-- 6.6 race_results / race_participants: the same, via the race.
DROP POLICY IF EXISTS "race_results_select" ON public.race_results;
CREATE POLICY "race_results_select" ON public.race_results
  FOR SELECT USING (public.can_read_race(race_id));

DROP POLICY IF EXISTS "race_participants_select" ON public.race_participants;
CREATE POLICY "race_participants_select" ON public.race_participants
  FOR SELECT USING (public.can_read_race(race_id));

-- race_participants rows are only ever written by record_race_participation()
-- (SECURITY DEFINER). The old policy let ANY authenticated user insert rows for
-- any race, which is forged presence data; the table grant is revoked below.
DROP POLICY IF EXISTS "race_participants_insert" ON public.race_participants;

-- 6.7 profiles: was `USING (true)`, so even `anon` could enumerate every
--     account's display name and avatar. Display names are needed by co-players
--     (they are embedded in the roster and the bracket), so authenticated reads
--     stay allowed — anonymous ones do not.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 6.8 phrases: same reasoning. Phrases are fetched through
--     practice_phrase() and through the races a participant may already read.
DROP POLICY IF EXISTS "phrases_select" ON public.phrases;
CREATE POLICY "phrases_select" ON public.phrases
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ────────────────────────────────────────────────────────────
-- 7. Grants — no direct write path for any client
--
-- Supabase grants broad table privileges to anon/authenticated by default, so
-- these are revoked explicitly and re-asserted on every table the client reads.
-- profiles keeps INSERT/UPDATE because a user creates and edits their own row;
-- its policies already restrict it to auth.uid() = id.
-- ────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.tournaments        FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tournament_players  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.rounds             FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.matches            FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.races              FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.race_results       FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.race_participants  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.phrases            FROM authenticated, anon;

-- Reads stay available to authenticated users (RLS decides which rows).
GRANT SELECT ON public.tournaments, public.tournament_players, public.rounds,
                public.matches, public.races, public.race_results,
                public.race_participants, public.phrases TO authenticated;

-- Note: the "a host can never hold a participant row / no participant can claim
-- role admin" rules are the tp_insert_self and tp_update_own policies created in
-- 006. They are deliberately not repeated here — re-stating identical policies
-- would add noise, and the triggers 006 installed (tp_assign_identity,
-- tp_guard_host_participation) enforce the same invariant from the other side.
-- See supabase/migrations/006_host_is_not_a_player.sql.


-- ────────────────────────────────────────────────────────────
-- 8. Function privileges
--
-- SECURITY DEFINER functions are executable by PUBLIC by default, which would
-- hand every sensitive RPC to anonymous callers. Close that globally first,
-- then hand out only what authenticated users actually need.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END $$;

-- Host-controlled actions.
GRANT EXECUTE ON FUNCTION public.create_tournament(TEXT,INT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_tournament(TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_tournament(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_registration(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_registration(UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_tournament(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_next_round(UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tournament_admin(UUID)              TO authenticated;

-- Match actions.
GRANT EXECUTE ON FUNCTION public.set_match_ready(UUID,BOOLEAN)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_presence(UUID,BOOLEAN)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_race_participation(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_race(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_race(UUID,UUID,UUID,TEXT,BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_gate_state(UUID)                 TO authenticated;

-- Practice.
GRANT EXECUTE ON FUNCTION public.record_practice(UUID,NUMERIC,NUMERIC)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_phrase(TEXT,UUID)             TO authenticated;

-- Read-only helpers. No anon: nothing in the app calls these before signing in.
GRANT EXECUTE ON FUNCTION public.practice_score(NUMERIC,NUMERIC,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.random_phrase_for(TEXT)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_power_of_two(INT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.bracket_seed_order(INT)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.bracket_bye_seeds(INT,INT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.total_rounds_for(INT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.places_from(INT,INT)                   TO authenticated;

-- Deliberately NOT granted to authenticated: advance_round_if_complete (only
-- called from inside other SECURITY DEFINER functions), sync_match_status, and
-- the trigger functions.


-- ────────────────────────────────────────────────────────────
-- 9. Realtime
--
-- postgres_changes is filtered by RLS, so a member still receives the updates
-- of their own tournaments and nothing else. The tables themselves must be in
-- the publication for the existing frontend subscriptions to work.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- The publication is created by Supabase; on a self-hosted instance it may be
  -- missing, in which case there is nothing to add the table to.
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'rounds'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';