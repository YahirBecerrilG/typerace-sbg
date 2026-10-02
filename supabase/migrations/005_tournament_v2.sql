-- ============================================================
-- TypeRacing — Phase 2: competitive tournament system
-- Run this in Supabase SQL Editor (after 004)
-- Incremental: no table is dropped, no data is deleted, RLS stays ON.
-- ============================================================
-- Server is the authority for: winner, advancement, bracket,
-- tournament state. Clients may only READ those and REQUEST actions.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. STATE MODEL — widen CHECK constraints
-- ────────────────────────────────────────────────────────────
-- Drop first, migrate legacy values, then re-add.

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
UPDATE public.tournaments SET status = 'round_active' WHERE status = 'active';
UPDATE public.tournaments SET status = 'completed'     WHERE status = 'finished';
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('lobby','practice','registration_closed','bracket_ready','round_active','completed'));

-- Any reasonable participant count. Only used as a display/soft cap.
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_max_players_check;
UPDATE public.tournaments SET max_players = 64 WHERE max_players IS NULL OR max_players > 64;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_max_players_check
  CHECK (max_players BETWEEN 2 AND 64);

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
UPDATE public.matches SET status = 'upcoming'  WHERE status = 'pending';
UPDATE public.matches SET status = 'racing'    WHERE status = 'active';
UPDATE public.matches SET status = 'completed' WHERE status = 'finished';
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('upcoming','waiting_players','ready','racing','completed','bye','forfeit'));

ALTER TABLE public.tournament_players DROP CONSTRAINT IF EXISTS tournament_players_status_check;
UPDATE public.tournament_players SET status = 'active'     WHERE status = 'waiting';
UPDATE public.tournament_players SET status = 'champion'   WHERE status = 'winner';
ALTER TABLE public.tournament_players ADD CONSTRAINT tournament_players_status_check
  CHECK (status IN ('active','eliminated','withdrawn','champion'));

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_status_check;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_status_check
  CHECK (status IN ('pending','active','finished'));


-- ────────────────────────────────────────────────────────────
-- 2. NEW COLUMNS
-- ────────────────────────────────────────────────────────────
-- Per-tournament role. The authoritative check is always
-- tournaments.host_id (see RLS + RPC guards); role is a label.
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS seed INT;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS placement INT;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS wins INT NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Practice / qualifier stats. Never part of a match.
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS practice_runs INT NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS best_wpm NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS avg_wpm NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS practice_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS practice_score NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Match readiness + outcome bookkeeping
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS player1_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS player2_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS winner_time_ms BIGINT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS bracket_index INT;

-- Bracket size actually built (power of two). Kept separate from max_players,
-- which stays the tournament's advertised capacity.
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS bracket_slots INT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS bracket_byes INT NOT NULL DEFAULT 0;

ALTER TABLE public.tournament_players DROP CONSTRAINT IF EXISTS tournament_players_role_check;
ALTER TABLE public.tournament_players ADD CONSTRAINT tournament_players_role_check
  CHECK (role IN ('admin','player'));

-- Existing hosts become admin of their own tournaments
UPDATE public.tournament_players tp
   SET role = 'admin'
  FROM public.tournaments t
 WHERE t.id = tp.tournament_id AND t.host_id = tp.user_id;

CREATE INDEX IF NOT EXISTS idx_tp_tournament_role  ON public.tournament_players (tournament_id, role);
CREATE INDEX IF NOT EXISTS idx_tp_practice_score   ON public.tournament_players (tournament_id, practice_score DESC);
CREATE INDEX IF NOT EXISTS idx_matches_round       ON public.matches (round_id);


-- ────────────────────────────────────────────────────────────
-- 3. PRACTICE SCORE — isolated, easy to re-tune later
-- ────────────────────────────────────────────────────────────
-- Change this one function to re-balance the whole seeding.
CREATE OR REPLACE FUNCTION public.practice_score(
  p_best_wpm  NUMERIC,
  p_avg_wpm   NUMERIC,
  p_accuracy  NUMERIC
) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT ROUND(
    (COALESCE(p_best_wpm,0) * 0.6 + COALESCE(p_avg_wpm,0) * 0.4)
    * (COALESCE(p_accuracy,0) / 100.0)
  , 2);
$$;


-- ────────────────────────────────────────────────────────────
-- 4. BRACKET MATH — pure helpers (also mirrored in utils/bracket.js)
-- ────────────────────────────────────────────────────────────

-- Pick a phrase for a round, falling back to any phrase so a missing
-- difficulty bucket can never block the bracket (phrase_id is NOT NULL).
CREATE OR REPLACE FUNCTION public.random_phrase_for(p_difficulty TEXT)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT id FROM public.phrases WHERE difficulty = p_difficulty ORDER BY RANDOM() LIMIT 1),
    (SELECT id FROM public.phrases ORDER BY RANDOM() LIMIT 1)
  );
$$;


-- Smallest power of two >= n
CREATE OR REPLACE FUNCTION public.next_power_of_two(p_n INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_n <= 2 THEN 2 ELSE (1 << CEIL(LOG(2, p_n::numeric)))::INT END;
$$;

-- Standard bracket seed order for `p_slots` slots.
-- 4 -> [1,4,2,3] ; 8 -> [1,8,4,5,2,7,3,6]
CREATE OR REPLACE FUNCTION public.bracket_seed_order(p_slots INT)
RETURNS INT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_order INT[] := ARRAY[1];
  v_next  INT[];
  v_size  INT;
BEGIN
  WHILE COALESCE(array_length(v_order,1),0) < p_slots LOOP
    v_size := array_length(v_order,1);
    SELECT array_agg(x ORDER BY i) INTO v_next
    FROM (
      SELECT s AS x, (rn*2 - 1) AS i FROM unnest(v_order) WITH ORDINALITY AS u(s, rn)
      UNION ALL
      SELECT (v_size*2 + 1 - s) AS x, (rn*2) AS i FROM unnest(v_order) WITH ORDINALITY AS u(s, rn)
    ) t;
    v_order := v_next;
  END LOOP;
  RETURN v_order;
END;
$$;

-- Seeds that receive a BYE, spread so two byes never meet early.
CREATE OR REPLACE FUNCTION public.bracket_bye_seeds(p_slots INT, p_byes INT)
RETURNS INT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_order INT[] := public.bracket_seed_order(p_slots);
  v_res   INT[] := '{}';
  v_pos   INT;
  i       INT;
BEGIN
  IF COALESCE(p_byes,0) <= 0 THEN RETURN v_res; END IF;
  FOR i IN 0..p_byes-1 LOOP
    v_pos := (i * p_slots) / p_byes;           -- evenly spaced slot positions
    v_res := array_append(v_res, v_order[v_pos + 1]);
  END LOOP;
  RETURN v_res;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 5. helpers
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_tournament_admin(p_tournament_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = p_tournament_id AND host_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.total_rounds_for(p_slots INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(1, CEIL(LOG(2, GREATEST(p_slots,2)::numeric))::INT);
$$;

-- Resolve a match's readiness into a canonical status.
CREATE OR REPLACE FUNCTION public.sync_match_status(p_match_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT; v_p1 UUID; v_p2 UUID; v_r1 BOOLEAN; v_r2 BOOLEAN;
BEGIN
  SELECT status, player1_id, player2_id, player1_ready, player2_ready
    INTO v_status, v_p1, v_p2, v_r1, v_r2
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_status IN ('completed','bye','forfeit','racing') THEN RETURN; END IF;

  IF v_p1 IS NULL OR v_p2 IS NULL THEN
    UPDATE public.matches SET status = 'bye' WHERE id = p_match_id;
  ELSIF v_r1 AND v_r2 THEN
    UPDATE public.matches SET status = 'ready' WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET status = 'waiting_players' WHERE id = p_match_id;
  END IF;
END;
$$;

-- Advance the bracket once every decided match of a round is settled.
-- The next round is CREATED but left 'pending': the host starts it explicitly
-- via start_next_round(), so players are never dropped into a race by surprise.
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

  -- Final placement for everyone knocked out in THIS round: 2^(total - round) + 1
  -- 8-slot bracket -> R1 losers place 5, R2 losers place 3, final loser place 2
  v_place := (1 << GREATEST(public.total_rounds_for(v_slots) - v_round.round_number, 0)) + 1;

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

  UPDATE public.tournaments SET status='bracket_ready' WHERE id = v_round.tournament_id;

  RETURN json_build_object('advanced', true, 'round', v_next_round,
                           'round_id', v_next_rid, 'awaiting_host', true);
END;
$$;


-- Host opens the next round: matches become WAITING and players are invited.
CREATE OR REPLACE FUNCTION public.start_next_round(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t     public.tournaments%ROWTYPE;
  v_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_tournament_admin(p_tournament_id) THEN
    RAISE EXCEPTION 'Only the host can start a round';
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.status = 'completed' THEN
    RETURN json_build_object('ok', false, 'error', 'Tournament already completed');
  END IF;

  SELECT * INTO v_round FROM public.rounds
   WHERE tournament_id = p_tournament_id AND status = 'pending'
   ORDER BY round_number LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'No round is waiting to start');
  END IF;

  UPDATE public.rounds SET status='active', started_at=COALESCE(started_at, NOW())
   WHERE id = v_round.id;
  UPDATE public.matches SET status='waiting_players'
   WHERE round_id = v_round.id AND status = 'upcoming';
  UPDATE public.tournaments SET status='round_active', current_round = v_round.round_number
   WHERE id = p_tournament_id;

  RETURN json_build_object('ok', true, 'round', v_round.round_number, 'round_id', v_round.id);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. PRACTICE (does not touch matches, bracket or race results)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_practice(
  p_tournament_id UUID,
  p_wpm          NUMERIC,
  p_accuracy     NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tp        public.tournament_players%ROWTYPE;
  v_best      NUMERIC;
  v_avg       NUMERIC;
  v_acc       NUMERIC;
  v_runs      INT;
  v_score     NUMERIC;
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  -- Practice only while the bracket is not decided
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
-- 7. REGISTRATION
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_registration(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_n INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.host_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can do that'; END IF;
  IF v_t.status NOT IN ('lobby','practice') THEN
    RETURN json_build_object('ok', true, 'status', v_t.status, 'note', 'already_closed');
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.tournament_players
   WHERE tournament_id = p_tournament_id AND status = 'active';

  UPDATE public.tournaments SET status='registration_closed' WHERE id = p_tournament_id;
  RETURN json_build_object('ok', true, 'status', 'registration_closed', 'participants', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_registration(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tournament_admin(p_tournament_id) THEN
    RAISE EXCEPTION 'Only the host can do that';
  END IF;
  UPDATE public.tournaments SET status='lobby'
   WHERE id = p_tournament_id AND status = 'registration_closed';
  RETURN json_build_object('ok', true);
END;
$$;

-- Create the tournament and register the host in a single server-authoritative
-- call. Doing this over RPC (instead of client inserts) is what lets us revoke
-- direct writes on tournament_players without stranding the host row.
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

  INSERT INTO public.tournaments (code, name, host_id, max_players, difficulty, status, current_round)
  VALUES (v_code, trim(p_name), auth.uid(), p_max_players, p_difficulty, 'lobby', 0)
  RETURNING id INTO v_id;

  -- The trigger stamps user_id from auth.uid() and derives role from host_id.
  INSERT INTO public.tournament_players (tournament_id, user_id, status, role)
  VALUES (v_id, auth.uid(), 'active', 'admin');

  RETURN json_build_object('ok', true, 'id', v_id, 'code', v_code);
END;
$$;

-- Join is refused once registration is closed. (Server side, authoritative.)
CREATE OR REPLACE FUNCTION public.join_tournament(p_code TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_tp public.tournament_players%ROWTYPE; v_n INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE code = UPPER(TRIM(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found. Check the code and try again.'; END IF;

  IF v_t.status NOT IN ('lobby','practice') THEN
    RAISE EXCEPTION 'Registration for this tournament is closed.';
  END IF;

  SELECT * INTO v_tp FROM public.tournament_players
   WHERE tournament_id = v_t.id AND user_id = auth.uid();
  IF FOUND THEN
    RETURN json_build_object('ok', true, 'tournament_id', v_t.id, 'already_joined', true);
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.tournament_players
   WHERE tournament_id = v_t.id AND status = 'active';
  IF v_n >= v_t.max_players THEN RAISE EXCEPTION 'Tournament is full.'; END IF;

  INSERT INTO public.tournament_players (tournament_id, user_id, status, role)
  VALUES (v_t.id, auth.uid(), 'active',
          CASE WHEN v_t.host_id = auth.uid() THEN 'admin' ELSE 'player' END);

  RETURN json_build_object('ok', true, 'tournament_id', v_t.id, 'already_joined', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_tournament(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tp      public.tournament_players%ROWTYPE;
  v_t       public.tournaments%ROWTYPE;
  v_started BOOLEAN;
  v_open_rounds UUID[];
  v_r       UUID;
  v_adv     JSON;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;

  SELECT * INTO v_tp FROM public.tournament_players
   WHERE tournament_id = p_tournament_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not in this tournament'; END IF;
  IF v_t.host_id = auth.uid() THEN RAISE EXCEPTION 'The host cannot leave their own tournament'; END IF;

  v_started := v_t.status IN ('bracket_ready','round_active','completed');

  -- Never delete the row: history and results are preserved.
  UPDATE public.tournament_players
     SET status='withdrawn', left_at=NOW()
   WHERE id = v_tp.id;

  -- Rounds this player was still competing in, before we free their matches.
  SELECT COALESCE(array_agg(DISTINCT m.round_id), '{}'::UUID[]) INTO v_open_rounds
  FROM public.matches m
  WHERE (m.player1_id = v_tp.id OR m.player2_id = v_tp.id)
    AND m.status NOT IN ('completed','bye','forfeit');

  -- Free any match that is still open so the opponent is not blocked.
  -- The parentheses matter: without them AND binds tighter than OR and the
  -- status filter would only apply to the player2 branch.
  UPDATE public.matches m
     SET status = 'forfeit',
         winner_id = CASE
           WHEN m.player1_id = v_tp.id THEN m.player2_id
           WHEN m.player2_id = v_tp.id THEN m.player1_id
           ELSE m.winner_id END,
         winner_time_ms = NULL,
         finished_at = NOW()
   WHERE (m.player1_id = v_tp.id OR m.player2_id = v_tp.id)
     AND m.status NOT IN ('completed','bye','forfeit');

  -- A forfeit can be the deciding match of a round: unblock the bracket.
  FOREACH v_r IN ARRAY v_open_rounds LOOP
    v_adv := public.advance_round_if_complete(v_r);
  END LOOP;

  RETURN json_build_object('ok', true, 'withdrawn', true, 'tournament_started', v_started);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 8. HOST STARTS THE TOURNAMENT — seeding, bracket, BYEs
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t        public.tournaments%ROWTYPE;
  v_players  UUID[];
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
  IF v_t.host_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can start the tournament'; END IF;

  IF v_t.status IN ('bracket_ready','round_active','completed') THEN
    RETURN json_build_object('ok', true, 'note', 'already_started', 'status', v_t.status);
  END IF;

  SELECT array_agg(id ORDER BY practice_score DESC, best_wpm DESC, joined_at ASC)
    INTO v_players
  FROM public.tournament_players
  WHERE tournament_id = p_tournament_id AND status = 'active';

  IF COALESCE(array_length(v_players,1),0) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 players to start';
  END IF;

  -- Already built? then just make sure round 1 is live
  SELECT COUNT(*) INTO v_exists FROM public.rounds WHERE tournament_id = p_tournament_id;
  IF v_exists > 0 THEN
    RETURN json_build_object('ok', true, 'note', 'bracket_exists');
  END IF;

  v_slots := public.next_power_of_two(array_length(v_players,1));
  v_byes  := v_slots - array_length(v_players,1);
  v_rounds := public.total_rounds_for(v_slots);

  -- Persist seeds: rank 1 = best practice score
  v_i := 1;
  FOREACH v_seed IN ARRAY v_players LOOP
    UPDATE public.tournament_players SET seed = v_i WHERE id = v_seed;
    v_i := v_i + 1;
  END LOOP;

  v_order     := public.bracket_seed_order(v_slots);
  v_bye_seeds := public.bracket_bye_seeds(v_slots, v_byes);

  v_phrase := public.random_phrase_for(v_t.difficulty);

  INSERT INTO public.rounds (tournament_id, round_number, status, started_at)
  VALUES (p_tournament_id, 1, 'active', NOW()) RETURNING id INTO v_round_id;

  -- Build the slot grid from the seed order.
  -- Seeds are ranked 1..players by practice score. Every seed number above the
  -- player count is an empty slot, and those empty slots are exactly the BYEs.
  v_i := 1;
  WHILE v_i <= v_slots LOOP
    IF v_order[v_i] > array_length(v_players,1) THEN
      v_grid := array_append(v_grid, NULL::UUID);
    ELSE
      v_grid := array_append(v_grid, v_players[v_order[v_i]]);
    END IF;
    v_i := v_i + 1;
  END LOOP;

  v_i := 1;
  WHILE v_i <= v_slots LOOP
    v_p1 := v_grid[v_i];
    v_p2 := CASE WHEN v_i + 1 <= v_slots THEN v_grid[v_i+1] ELSE NULL END;

    IF v_p1 IS NULL AND v_p2 IS NULL THEN
      v_i := v_i + 2;
      CONTINUE;                       -- never emit a phantom match
    ELSIF v_p1 IS NULL OR v_p2 IS NULL THEN
      v_p1 := COALESCE(v_p1, v_p2);
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, winner_id, status, started_at, finished_at, bracket_index)
      VALUES (v_round_id, v_p1, NULL, v_p1, 'bye', NOW(), NOW(), (v_i + 1) / 2);
    ELSE
      INSERT INTO public.matches
        (round_id, player1_id, player2_id, status, started_at, bracket_index)
      VALUES (v_round_id, v_p1, v_p2, 'waiting_players', NOW(), (v_i + 1) / 2)
      RETURNING id INTO v_mid;
      INSERT INTO public.races (match_id, phrase_id, status, started_at)
      VALUES (v_mid, v_phrase, 'pending', NOW());
    END IF;

    v_i := v_i + 2;
  END LOOP;

  -- Round 1 opens immediately (the host just pressed "Start tournament").
  -- Later rounds stay pending until the host calls start_next_round().
  UPDATE public.tournaments
     SET status='round_active',
         current_round=1,
         bracket_slots=v_slots,
         bracket_byes=v_byes
   WHERE id = p_tournament_id;

  RETURN json_build_object(
    'ok', true, 'slots', v_slots, 'byes', v_byes,
    'total_rounds', v_rounds, 'participants', array_length(v_players,1));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 9. MATCH READY SYSTEM
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_match_ready(p_match_id UUID, p_ready BOOLEAN)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.matches%ROWTYPE;
  v_me public.tournament_players%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_m.status IN ('completed','bye','forfeit','racing') THEN
    RETURN json_build_object('ok', true, 'status', v_m.status, 'note', 'match_closed');
  END IF;

  SELECT * INTO v_me FROM public.tournament_players
   WHERE id IN (v_m.player1_id, v_m.player2_id) AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not in this match'; END IF;

  IF v_me.id = v_m.player1_id THEN
    UPDATE public.matches SET player1_ready = p_ready WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET player2_ready = p_ready WHERE id = p_match_id;
  END IF;

  PERFORM public.sync_match_status(p_match_id);

  SELECT status, player1_ready, player2_ready INTO v_m.status, v_m.player1_ready, v_m.player2_ready
  FROM public.matches WHERE id = p_match_id;

  RETURN json_build_object('ok', true, 'status', v_m.status,
                           'player1_ready', v_m.player1_ready,
                           'player2_ready', v_m.player2_ready);
END;
$$;

-- Clear readiness when a player leaves the match screen (liveness).
CREATE OR REPLACE FUNCTION public.set_match_presence(p_match_id UUID, p_present BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m public.matches%ROWTYPE; v_me public.tournament_players%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR v_m.status IN ('completed','bye','forfeit','racing') THEN RETURN; END IF;
  SELECT * INTO v_me FROM public.tournament_players
   WHERE id IN (v_m.player1_id, v_m.player2_id) AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN; END IF;
  IF v_me.id = v_m.player1_id THEN
    UPDATE public.matches SET player1_ready = v_m.player1_ready AND p_present WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET player2_ready = v_m.player2_ready AND p_present WHERE id = p_match_id;
  END IF;
  PERFORM public.sync_match_status(p_match_id);
END;
$$;

-- Record that this user actually loaded the race screen (liveness/audit).
CREATE OR REPLACE FUNCTION public.record_race_participation(p_race_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_race public.races%ROWTYPE; v_m public.matches%ROWTYPE; v_me public.tournament_players%ROWTYPE;
BEGIN
  SELECT * INTO v_race FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = v_race.match_id;
  SELECT * INTO v_me FROM public.tournament_players
   WHERE id IN (v_m.player1_id, v_m.player2_id) AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not in this match'; END IF;

  INSERT INTO public.race_participants (race_id, player_id, started_at)
  VALUES (p_race_id, v_me.id, NOW())
  ON CONFLICT (race_id, player_id) DO NOTHING;
END;
$$;


-- The race only opens once BOTH players are READY.
CREATE OR REPLACE FUNCTION public.start_race(p_match_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m public.matches%ROWTYPE; v_r public.races%ROWTYPE; v_t public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_m.status = 'racing' THEN
    RETURN json_build_object('ok', true, 'already_racing', true);
  END IF;
  IF v_m.status IN ('completed','bye','forfeit') THEN
    RETURN json_build_object('ok', false, 'status', v_m.status);
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
-- 10. FINISH RACE — IDEMPOTENT, server decides the winner
-- ────────────────────────────────────────────────────────────
-- Fixes the previous behaviour where the FIRST finisher immediately closed
-- the race and declared a winner, so the second finisher always got
-- "Race is not active" and any duplicate submit corrupted the bracket.
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
  v_n        INT;
  v_winner   UUID;
  v_mine     BIGINT;
  v_advance  JSON;
BEGIN
  -- Serialise concurrent submits for the same match
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  SELECT * INTO v_tp FROM public.tournament_players WHERE id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF v_match.player1_id <> p_player_id AND v_match.player2_id <> p_player_id THEN
    RAISE EXCEPTION 'Player does not belong to this match';
  END IF;

  -- (1) IDEMPOTENCY: already decided -> return the official result, change nothing
  IF v_match.status IN ('completed','forfeit') OR v_match.winner_id IS NOT NULL THEN
    SELECT elapsed_ms INTO v_mine FROM public.race_results
     WHERE race_id = p_race_id AND player_id = p_player_id;
    RETURN json_build_object(
      'already_processed', true,
      'winner_id', v_match.winner_id,
      'winner_time_ms', v_match.winner_time_ms,
      'my_time_ms', v_mine,
      'i_won', v_match.winner_id = p_player_id
    );
  END IF;

  SELECT * INTO v_race FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Race not found'; END IF;

  IF v_match.status = 'bye' THEN
    RETURN json_build_object('already_processed', true, 'note', 'bye');
  END IF;

  -- The race only opens after BOTH players were READY (start_race).
  -- Without this a client could submit and skip the READY gate entirely.
  IF v_match.status <> 'racing' OR v_race.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not racing (status: %, race: %)',
      v_match.status, v_race.status;
  END IF;

  -- (2) Validate the typed text against the phrase
  SELECT * INTO v_phrase FROM public.phrases WHERE id = v_race.phrase_id;
  IF p_typed_text IS DISTINCT FROM v_phrase.text THEN
    RAISE EXCEPTION 'Typed text does not match phrase';
  END IF;

  -- (3) Record this run (safe to repeat). errors stays 0 on first write and is
  -- refined on conflict, so a client that resends cannot degrade its own score.
  INSERT INTO public.race_results (race_id, player_id, typed_text, elapsed_ms, errors, is_winner)
  VALUES (p_race_id, p_player_id, p_typed_text, p_elapsed_ms, 0, FALSE)
  ON CONFLICT (race_id, player_id) DO UPDATE
    SET errors = LEAST(public.race_results.errors, EXCLUDED.errors);

  -- v_other must come from the row actually stored: if this player submitted
  -- twice, p_elapsed_ms may differ from the recorded run, and the winner has
  -- to be decided on persisted times, never on a client-supplied one.
  SELECT * INTO v_other FROM public.race_results
   WHERE race_id = p_race_id AND player_id <> p_player_id;

  -- (4) Still racing: wait for the opponent
  IF NOT FOUND THEN
    RETURN json_build_object(
      'already_processed', false, 'pending', true,
      'my_time_ms', p_elapsed_ms
    );
  END IF;

  SELECT elapsed_ms INTO v_mine FROM public.race_results
   WHERE race_id = p_race_id AND player_id = p_player_id;

  -- (5) Both finished -> server decides the winner from PERSISTED times.
  -- Ties go to whoever was recorded first (the ON CONFLICT insert above).
  v_winner := CASE WHEN v_mine <= v_other.elapsed_ms THEN p_player_id ELSE v_other.player_id END;

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
    'i_won', v_winner = p_player_id,
    'bracket', v_advance
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 11. REALTIME
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='tournament_players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_players;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='tournaments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='rounds') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- 12. SECURITY — RLS stays enabled
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds            ENABLE ROW LEVEL SECURITY;

-- Creation and every status change go through SECURITY DEFINER RPCs, so the
-- client has no direct write path on tournaments at all. RLS below is kept as
-- defence in depth in case the grants are ever widened again.
DROP POLICY IF EXISTS "tournaments_insert" ON public.tournaments;
CREATE POLICY "tournaments_insert" ON public.tournaments
  FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "tournaments_update_host" ON public.tournaments;
CREATE POLICY "tournaments_update_host" ON public.tournaments
  FOR UPDATE USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- Players must not self-promote to admin. Anyone may join themselves as a
-- player; only the tournament host may claim the admin label on their own row.
DROP POLICY IF EXISTS "tp_insert_self" ON public.tournament_players;
CREATE POLICY "tp_insert_self" ON public.tournament_players
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      role = 'player'
      OR (role = 'admin' AND EXISTS (
            SELECT 1 FROM public.tournaments t
             WHERE t.id = tournament_id AND t.host_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "tp_update_own" ON public.tournament_players;
CREATE POLICY "tp_update_own" ON public.tournament_players
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No client may touch brackets directly
DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Clients cannot write tournament_players at all: practice stats, seeds,
-- placements, wins and status are all awarded by SECURITY DEFINER RPCs.
-- (Withdrawing is done through leave_tournament, which also frees matches.)
-- NOTE: this also removes the column-level INSERT(tournament_id) grant from the
-- previous migration. Leaving it in place would let any authenticated user
-- insert their own participant row directly, bypassing join_tournament's
-- registration-closed and capacity checks.
REVOKE INSERT, UPDATE, DELETE ON public.tournaments       FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tournament_players FROM authenticated, anon;

-- Defence in depth: even if a column grant is ever added back, the trigger
-- below overwrites user_id and role, so a client cannot forge an identity or
-- claim the admin label on someone else's behalf.
CREATE OR REPLACE FUNCTION public.tp_assign_identity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host UUID;
BEGIN
  SELECT host_id INTO v_host FROM public.tournaments WHERE id = NEW.tournament_id;

  IF v_host IS NOT NULL AND v_host = auth.uid() THEN
    NEW.role := 'admin';
  ELSE
    NEW.role := 'player';
  END IF;
  NEW.user_id := auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tp_assign_identity_trg ON public.tournament_players;
CREATE TRIGGER tp_assign_identity_trg
  BEFORE INSERT ON public.tournament_players
  FOR EACH ROW EXECUTE FUNCTION public.tp_assign_identity();

REVOKE INSERT, UPDATE, DELETE ON public.matches        FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.rounds         FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.race_results   FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.race_participants FROM authenticated, anon;

-- SECURITY DEFINER functions are executable by PUBLIC by default. Close that
-- first, then hand out only what authenticated users actually need.
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

GRANT EXECUTE ON FUNCTION public.practice_score(NUMERIC,NUMERIC,NUMERIC) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.random_phrase_for(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_power_of_two(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.bracket_seed_order(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.bracket_bye_seeds(INT,INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.total_rounds_for(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_tournament_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_practice(UUID,NUMERIC,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tournament(TEXT,INT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_tournament(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_tournament(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_tournament(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_next_round(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_ready(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_presence(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_race_participation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_race(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_race(UUID,UUID,UUID,TEXT,BIGINT) TO authenticated;

-- The old host_id-parameterised start_tournament is gone: the host is
-- derived from tournaments.host_id inside the function.
REVOKE EXECUTE ON FUNCTION public.start_tournament(UUID,UUID) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.start_tournament(UUID,UUID);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Host = tournaments.host_id only. There is no global admin.
-- Clients request actions; this server decides every outcome.
-- ============================================================
