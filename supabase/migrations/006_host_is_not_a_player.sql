-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — The host is a host, not a player
-- ═══════════════════════════════════════════════════════════════════════════
-- Problem 1: create_tournament() inserted the host into tournament_players as
--   role='admin'. That made the host a bracket participant: counted in
--   "Players 2/8", seeded, given matches, and able to READY/RACE.
-- Problem 2: start_tournament() picked every active row, host included.
-- Problem 3: next_power_of_two() used `1 << numeric`, which is not a valid
--   operator in PostgreSQL ("operator does not exist: integer << numeric").
--   It short-circuited through the p_n <= 2 CASE, so brackets of 3+ players
--   crashed on the very first call. The client then surfaced a bare UUID
--   because messageOf() stripped the real error text.
--
-- Fix: host authority lives ONLY in tournaments.host_id. tournament_players
--      contains players and nothing else.
-- ═══════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- 1. Bracket math: 1 << numeric is not an operator
-- ────────────────────────────────────────────────────────────
-- PostgreSQL has no `integer << numeric`; it raises
-- "operator does not exist: integer << numeric". power() takes numerics
-- directly, so the shift is replaced by an exponentiation.
CREATE OR REPLACE FUNCTION public.next_power_of_two(p_n INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN COALESCE(p_n, 0) <= 2 THEN 2
           ELSE power(2, CEIL(LOG(2, GREATEST(p_n, 2)::numeric)))::INT
         END;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. Data: drop host rows from tournaments that never started
-- ────────────────────────────────────────────────────────────
-- Only pre-start tournaments are cleaned. If a bracket already ran with the
-- host inside it, those rows are match history (matches.player1_id /
-- player2_id are FKs) and are preserved; they are simply excluded from every
-- future query and RPC from here on.
DELETE FROM public.tournament_players tp
 USING public.tournaments t
 WHERE tp.tournament_id = t.id
   AND tp.user_id = t.host_id
   AND t.status IN ('lobby', 'practice', 'registration_closed')
   AND NOT EXISTS (SELECT 1 FROM public.rounds r WHERE r.tournament_id = t.id)
   AND NOT EXISTS (
     SELECT 1 FROM public.matches m
      WHERE m.player1_id = tp.id OR m.player2_id = tp.id
   );

-- Pre-start tournaments can no longer be "bracket_ready" with a host inside.
UPDATE public.tournaments t
   SET bracket_slots = NULL
 WHERE t.status IN ('lobby', 'practice', 'registration_closed')
   AND t.host_id IN (SELECT user_id FROM public.tournament_players WHERE tournament_id = t.id);


-- ────────────────────────────────────────────────────────────
-- 3. The host can never hold a participant row again
-- ────────────────────────────────────────────────────────────
-- The old trigger promoted the host to role='admin'. It now refuses the row
-- outright, so no RPC, SECURITY DEFINER path or future migration can put the
-- host back into the bracket.
CREATE OR REPLACE FUNCTION public.tp_assign_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_host UUID;
BEGIN
  SELECT host_id INTO v_host FROM public.tournaments WHERE id = NEW.tournament_id;

  IF v_host IS NOT NULL AND v_host = NEW.user_id THEN
    RAISE EXCEPTION 'The host cannot be a player in their own tournament.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Participants are always 'player'; there is no self-promotion path.
  NEW.role := 'player';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tp_assign_identity_trg ON public.tournament_players;
CREATE TRIGGER tp_assign_identity_trg
  BEFORE INSERT ON public.tournament_players
  FOR EACH ROW EXECUTE FUNCTION public.tp_assign_identity();

-- Defence in depth: the same rule for UPDATEs, so an existing row cannot be
-- re-pointed at the host either.
CREATE OR REPLACE FUNCTION public.tp_guard_host_participation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_host UUID;
BEGIN
  SELECT host_id INTO v_host FROM public.tournaments WHERE id = NEW.tournament_id;
  IF v_host IS NOT NULL AND v_host = NEW.user_id THEN
    RAISE EXCEPTION 'The host cannot be a player in their own tournament.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tp_guard_host_participation_trg ON public.tournament_players;
CREATE TRIGGER tp_guard_host_participation_trg
  BEFORE INSERT OR UPDATE OF tournament_id, user_id ON public.tournament_players
  FOR EACH ROW EXECUTE FUNCTION public.tp_guard_host_participation();


-- ────────────────────────────────────────────────────────────
-- 4. create_tournament: no host participant row
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_name TEXT, p_max_players INT, p_difficulty TEXT, p_code TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id   UUID;
  v_code TEXT := UPPER(TRIM(COALESCE(p_code, '')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;

  IF char_length(trim(COALESCE(p_name, ''))) < 1 THEN
    RAISE EXCEPTION 'Tournament name is required.';
  END IF;
  IF p_max_players < 2 OR p_max_players > 64 THEN
    RAISE EXCEPTION 'Tournament size must be between 2 and 64.';
  END IF;
  IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'Unknown difficulty.';
  END IF;
  IF char_length(v_code) <> 7 OR v_code !~ '^TR-[A-Z2-9]{4}$' THEN
    RAISE EXCEPTION 'Tournament codes look like TR-XXXX.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tournaments WHERE code = v_code) THEN
    RAISE EXCEPTION 'That code is already taken. Try another one.';
  END IF;

  -- The host is stored on tournaments.host_id and nowhere else. There is
  -- deliberately no tournament_players row: hosts run the tournament, they
  -- do not compete in it.
  INSERT INTO public.tournaments (code, name, host_id, max_players, difficulty, status, current_round)
  VALUES (v_code, trim(p_name), auth.uid(), p_max_players, p_difficulty, 'lobby', 0)
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id, 'code', v_code);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 5. join_tournament: players only, never the host
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_tournament(p_code TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_tp public.tournament_players%ROWTYPE; v_n INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE code = UPPER(TRIM(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found. Check the code and try again.'; END IF;

  IF v_t.status NOT IN ('lobby','practice') THEN
    RAISE EXCEPTION 'Registration for this tournament is closed.';
  END IF;

  IF v_t.host_id = auth.uid() THEN
    RAISE EXCEPTION 'You are the host of this tournament. Hosts do not compete in it.';
  END IF;

  SELECT * INTO v_tp FROM public.tournament_players
   WHERE tournament_id = v_t.id AND user_id = auth.uid();
  IF FOUND THEN
    RETURN json_build_object('ok', true, 'tournament_id', v_t.id, 'already_joined', true);
  END IF;

  -- Capacity counts players only; the host no longer consumes a slot.
  SELECT COUNT(*) INTO v_n FROM public.tournament_players
   WHERE tournament_id = v_t.id AND status = 'active';
  IF v_n >= v_t.max_players THEN RAISE EXCEPTION 'Tournament is full.'; END IF;

  INSERT INTO public.tournament_players (tournament_id, user_id, status, role)
  VALUES (v_t.id, auth.uid(), 'active', 'player');

  RETURN json_build_object('ok', true, 'tournament_id', v_t.id, 'already_joined', false);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. record_practice: players only
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_practice(
  p_tournament_id UUID, p_wpm NUMERIC, p_accuracy NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tp        public.tournament_players%ROWTYPE;
  v_best      NUMERIC; v_avg NUMERIC; v_acc NUMERIC; v_runs INT; v_score NUMERIC;
  v_tournament public.tournaments%ROWTYPE;
BEGIN
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

  v_best := GREATEST(v_tp.best_wpm, COALESCE(p_wpm,0));
  v_runs  := v_tp.practice_runs + 1;
  v_avg   := ROUND(((v_tp.avg_wpm * v_tp.practice_runs) + COALESCE(p_wpm,0)) / v_runs, 2);
  v_acc   := GREATEST(v_tp.practice_accuracy, LEAST(COALESCE(p_accuracy,0), 100));
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
-- 7. start_tournament: seeds players only, fails loudly
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t        public.tournaments%ROWTYPE;
  v_players  UUID[];
  v_player_count INT;
  v_slots    INT;
  v_byes     INT;
  v_order    INT[];
  v_bye_seeds INT[];
  v_phrase   UUID;
  v_round_id UUID;
  v_rounds   INT;
  v_i        INT;
  v_seed     INT;
  v_grid     UUID[] := ARRAY[]::UUID[];
  v_p1       UUID;
  v_p2       UUID;
  v_mid      UUID;
  v_exists   INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.host_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the host can start the tournament';
  END IF;

  IF v_t.status IN ('bracket_ready','round_active','completed') THEN
    RETURN json_build_object('ok', true, 'note', 'already_started', 'status', v_t.status);
  END IF;

  IF v_t.status NOT IN ('lobby','practice','registration_closed') THEN
    RAISE EXCEPTION 'This tournament cannot be started from its current state.';
  END IF;

  -- Participants only. role = 'player' is redundant after migration 006, but
  -- it keeps historical rows (from brackets that already ran with a host
  -- inside) out of any future seeding.
  SELECT array_agg(id ORDER BY practice_score DESC, best_wpm DESC, joined_at ASC),
         COUNT(*)
    INTO v_players, v_player_count
  FROM public.tournament_players
  WHERE tournament_id = p_tournament_id
    AND status = 'active'
    AND role = 'player'
    AND user_id <> v_t.host_id;

  IF COALESCE(v_player_count, 0) < 2 THEN
    RAISE EXCEPTION 'At least 2 players are needed to start a tournament (currently %).',
      COALESCE(v_player_count, 0);
  END IF;

  v_slots  := public.next_power_of_two(v_player_count);
  v_byes   := v_slots - v_player_count;
  v_rounds := public.total_rounds_for(v_slots);
  v_order  := public.bracket_seed_order(v_slots);

  -- next_power_of_two/bracket_seed_order are pure, but a bracket with a
  -- mis-sized grid is unrecoverable, so assert the invariant loudly.
  IF COALESCE(array_length(v_order, 1), 0) <> v_slots THEN
    RAISE EXCEPTION 'Bracket layout failed: expected % slots, got %.',
      v_slots, COALESCE(array_length(v_order, 1), 0);
  END IF;

  SELECT COUNT(*) INTO v_exists
    FROM public.rounds WHERE tournament_id = p_tournament_id;
  IF v_exists > 0 THEN
    RETURN json_build_object('ok', true, 'note', 'already_started', 'status', v_t.status);
  END IF;

  v_bye_seeds := public.bracket_bye_seeds(v_slots, v_byes);

  v_phrase := public.random_phrase_for(v_t.difficulty);
  IF v_phrase IS NULL THEN
    RAISE EXCEPTION 'No phrases are available, so the tournament cannot be started.';
  END IF;

  -- Seeds are ranked 1..players by practice score. Every seed number above the
  -- player count is an empty slot, and those empty slots are exactly the BYEs.
  v_i := 1;
  WHILE v_i <= v_slots LOOP
    IF v_order[v_i] > v_player_count THEN
      v_grid := array_append(v_grid, NULL::UUID);
    ELSE
      v_grid := array_append(v_grid, v_players[v_order[v_i]]);
    END IF;
    v_i := v_i + 1;
  END LOOP;

  INSERT INTO public.rounds (tournament_id, round_number, status)
  VALUES (p_tournament_id, 1, 'active')
  RETURNING id INTO v_round_id;

  v_i := 1;
  WHILE v_i <= v_slots LOOP
    v_p1 := v_grid[v_i];
    v_p2 := CASE WHEN v_i + 1 <= v_slots THEN v_grid[v_i+1] ELSE NULL END;

    IF v_p1 IS NULL AND v_p2 IS NULL THEN
      -- Empty slot against empty slot: nothing to play.
      NULL;
    ELSIF v_p1 IS NULL THEN
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, winner_id, status, started_at, finished_at, bracket_index)
      VALUES
        (v_round_id, v_p2, NULL, v_p2, 'bye', NOW(), NOW(), (v_i + 1) / 2);
    ELSIF v_p2 IS NULL THEN
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, winner_id, status, started_at, finished_at, bracket_index)
      VALUES
        (v_round_id, v_p1, NULL, v_p1, 'bye', NOW(), NOW(), (v_i + 1) / 2);
    ELSE
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, status, started_at, bracket_index)
      VALUES
        (v_round_id, v_p1, v_p2, 'waiting_players', NOW(), (v_i + 1) / 2)
      RETURNING id INTO v_mid;

      INSERT INTO public.races (match_id, phrase_id, status, started_at)
      VALUES (v_mid, v_phrase, 'pending', NOW());
    END IF;

    v_i := v_i + 2;
  END LOOP;

  UPDATE public.tournaments
     SET status = 'round_active', current_round = 1,
         bracket_slots = v_slots, bracket_byes = v_byes
   WHERE id = p_tournament_id;

  RETURN json_build_object('ok', true, 'slots', v_slots, 'byes', v_byes,
                           'rounds', v_rounds, 'players', v_player_count,
                           'bye_seeds', v_bye_seeds);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 8. close_registration: report players, not rows
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_registration(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_n INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the host can do that'; END IF;
  IF v_t.status NOT IN ('lobby','practice') THEN
    RETURN json_build_object('ok', true, 'status', v_t.status, 'note', 'already_closed');
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.tournament_players
   WHERE tournament_id = p_tournament_id AND status = 'active' AND role = 'player';

  UPDATE public.tournaments SET status='registration_closed' WHERE id = p_tournament_id;
  RETURN json_build_object('ok', true, 'status', 'registration_closed', 'participants', v_n);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 9. Practice phrases: a new one per attempt, never a repeat
-- ────────────────────────────────────────────────────────────
-- The practice screen used `.limit(1)` with no ordering, which returned the
-- same first phrase every single attempt. This picks at random and excludes
-- the phrase the player just ran. Phrases are English only, by design.
CREATE OR REPLACE FUNCTION public.practice_phrase(
  p_difficulty TEXT DEFAULT NULL,
  p_exclude_id  UUID DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.phrases%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.phrases
   WHERE (p_difficulty IS NULL OR difficulty = p_difficulty)
     AND (p_exclude_id IS NULL OR id <> p_exclude_id)
   ORDER BY random()
   LIMIT 1;

  -- If the pool only holds the excluded phrase, reuse it rather than fail.
  IF NOT FOUND AND p_exclude_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.phrases
      WHERE p_difficulty IS NULL OR difficulty = p_difficulty
      ORDER BY random() LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.phrases ORDER BY random() LIMIT 1;
  END IF;

  IF NOT FOUND THEN RAISE EXCEPTION 'No phrases are available.'; END IF;

  RETURN json_build_object('id', v_row.id, 'text', v_row.text, 'difficulty', v_row.difficulty);
END;
$$;

REVOKE ALL ON FUNCTION public.practice_phrase(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_phrase(TEXT, UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 10. RLS: a player row can never claim admin
-- ────────────────────────────────────────────────────────────
-- Re-asserted here so this migration is self-contained: revocations are
-- persistent, but re-stating them means a grant that was ever widened by hand
-- is closed again the moment 006 runs.
REVOKE INSERT, UPDATE, DELETE ON public.tournaments       FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tournament_players FROM authenticated, anon;

-- INSERT is revoked on the table, so these are belt-and-braces in case a
-- grant is ever widened again.
DROP POLICY IF EXISTS "tp_insert_self" ON public.tournament_players;
CREATE POLICY "tp_insert_self" ON public.tournament_players
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND role = 'player'
    AND NOT EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_id AND t.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tp_update_own" ON public.tournament_players;
CREATE POLICY "tp_update_own" ON public.tournament_players
  FOR UPDATE USING (auth.uid() = user_id AND role = 'player')
  WITH CHECK (auth.uid() = user_id AND role = 'player');


-- ────────────────────────────────────────────────────────────
-- 11. Helpers
-- ────────────────────────────────────────────────────────────
-- Same shape as next_power_of_two, used for final placements. The shift was
-- `1 << GREATEST(int, 0)`, which happens to resolve because both arguments are
-- INT; this is written explicitly so the intent is not lost.
CREATE OR REPLACE FUNCTION public.places_from(v_slots INT, v_round_number INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT power(2, GREATEST(public.total_rounds_for(v_slots) - v_round_number, 0))::INT + 1;
$$;

CREATE OR REPLACE FUNCTION public.advance_round_if_complete(p_round_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round      rounds%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_pending    INT;
  v_winners    UUID[];
  v_slots      INT;
  v_next_round INT;
  v_next_rid   UUID;
  v_phrase_id  UUID;
  v_i          INT;
  v_idx        INT;
  v_mid        UUID;
  v_pair       UUID[];
  v_place      INT;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.status <> 'active' THEN
    RETURN json_build_object('advanced', false, 'reason', 'round_not_open');
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM public.matches
  WHERE round_id = p_round_id
    AND status NOT IN ('completed','bye','forfeit');
  IF v_pending > 0 THEN
    RETURN json_build_object('advanced', false, 'pending', v_pending);
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_round.tournament_id;

  v_slots := public.next_power_of_two(
               GREATEST(COALESCE(v_tournament.bracket_slots, v_tournament.max_players, 2), 2));

  -- Final placement for everyone knocked out in THIS round.
  -- 8-slot bracket -> R1 losers place 5, R2 losers place 3, final loser place 2
  v_place := public.places_from(v_slots, v_round.round_number);

  UPDATE public.tournament_players tp
     SET status = 'eliminated',
         placement = COALESCE(tp.placement, v_place)
    FROM public.matches m
   WHERE m.round_id = p_round_id
     AND m.status IN ('completed','forfeit')
     AND m.winner_id IS NOT NULL
     AND tp.id = CASE WHEN m.winner_id = m.player1_id THEN m.player2_id ELSE m.player1_id END
     AND tp.status <> 'withdrawn'
     AND tp.placement IS NULL;

  UPDATE public.rounds SET status='finished', finished_at=NOW() WHERE id = p_round_id;

  SELECT ARRAY(
    SELECT winner_id FROM public.matches
    WHERE round_id = p_round_id AND winner_id IS NOT NULL
    ORDER BY bracket_index
  ) INTO v_winners;

  IF COALESCE(array_length(v_winners,1),0) = 1 THEN
    UPDATE public.tournament_players
       SET status='champion', placement=1
     WHERE id = v_winners[1];
    UPDATE public.tournaments SET status='completed' WHERE id = v_round.tournament_id;
    RETURN json_build_object('advanced', true, 'completed', true,
                             'champion_id', v_winners[1]);
  END IF;

  -- Create the next round, parked as 'pending' until the host starts it.
  v_next_round := v_round.round_number + 1;

  INSERT INTO public.rounds (tournament_id, round_number, status)
  VALUES (v_round.tournament_id, v_next_round, 'pending')
  RETURNING id INTO v_next_rid;

  v_phrase_id := public.random_phrase_for(v_tournament.difficulty);

  v_i  := 1;
  v_idx := 0;
  WHILE v_i <= COALESCE(array_length(v_winners,1),0) LOOP
    v_idx := v_idx + 1;
    v_pair := ARRAY[
      v_winners[v_i],
      CASE WHEN v_i + 1 <= array_length(v_winners,1) THEN v_winners[v_i+1] ELSE NULL END
    ];

    IF v_pair[2] IS NULL THEN
      -- Odd one out this round -> BYE, auto-advances, never a race win
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, winner_id, status, started_at, finished_at, bracket_index)
      VALUES (v_next_rid, v_pair[1], NULL, v_pair[1], 'bye', NOW(), NOW(), v_idx);
    ELSE
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, status, bracket_index)
      VALUES (v_next_rid, v_pair[1], v_pair[2], 'upcoming', v_idx)
      RETURNING id INTO v_mid;
      INSERT INTO public.races (match_id, phrase_id, status)
      VALUES (v_mid, v_phrase_id, 'pending');
    END IF;

    v_i := v_i + 2;
  END LOOP;

  RETURN json_build_object('advanced', true, 'next_round', v_next_round,
                           'next_round_id', v_next_rid, 'winners', v_winners);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 12. Grants
-- ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.next_power_of_two(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.places_from(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_power_of_two(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.places_from(INT, INT) TO authenticated, anon;
