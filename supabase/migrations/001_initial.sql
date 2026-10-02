-- ============================================================
-- TypeRacing Database Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. PROFILES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_avatar_url   TEXT;
BEGIN
  -- Extract and sanitize display_name
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
    'Racer_' || SUBSTRING(NEW.id::text, 1, 6)
  );

  -- Extract or set default avatar
  v_avatar_url := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    '🏎️'
  );

  -- Insert profile into public.profiles
  INSERT INTO public.profiles (id, display_name, avatar_url, created_at)
  VALUES (NEW.id, v_display_name, v_avatar_url, NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    avatar_url   = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure permissions for auth trigger
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- ── 2. PHRASES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phrases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text       TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. TOURNAMENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  host_id       UUID NOT NULL REFERENCES auth.users(id),
  max_players   INT NOT NULL DEFAULT 4 CHECK (max_players IN (2, 4, 8, 16)),
  difficulty    TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status        TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished')),
  current_round INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. TOURNAMENT_PLAYERS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed          INT,
  status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'eliminated', 'winner')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

-- ── 5. ROUNDS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number  INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished')),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  UNIQUE(tournament_id, round_number)
);

-- ── 6. MATCHES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player1_id  UUID REFERENCES tournament_players(id),
  player2_id  UUID REFERENCES tournament_players(id),
  winner_id   UUID REFERENCES tournament_players(id),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished')),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- ── 7. RACES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS races (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  phrase_id   UUID NOT NULL REFERENCES phrases(id),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished')),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- ── 8. RACE_RESULTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS race_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id        UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES tournament_players(id),
  typed_text     TEXT NOT NULL,
  elapsed_ms     BIGINT NOT NULL,
  errors         INT NOT NULL DEFAULT 0,
  is_winner      BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(race_id, player_id)
);

-- ── 9. RACE_PARTICIPANTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS race_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id    UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES tournament_players(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(race_id, player_id)
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_user ON tournament_players(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_id);
CREATE INDEX IF NOT EXISTS idx_races_match ON races(match_id);
CREATE INDEX IF NOT EXISTS idx_race_results_race ON race_results(race_id);

-- ============================================================
-- RPC: start_tournament
-- Creates bracket, rounds, matches and activates the tournament.
-- ============================================================
CREATE OR REPLACE FUNCTION start_tournament(p_tournament_id UUID, p_host_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament  tournaments%ROWTYPE;
  v_players     tournament_players[];
  v_player_ids  UUID[];
  v_n_players   INT;
  v_n_slots     INT;
  v_total_rounds INT;
  v_round_id    UUID;
  v_round_num   INT := 1;
  v_match_players UUID[];
  v_phrase_id   UUID;
  v_match_id    UUID;
  i INT;
BEGIN
  -- Verify host
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_tournament.host_id <> p_host_id THEN RAISE EXCEPTION 'Not the host'; END IF;
  IF v_tournament.status <> 'lobby' THEN RAISE EXCEPTION 'Tournament already started'; END IF;

  -- Get players
  SELECT ARRAY(
    SELECT id FROM tournament_players
    WHERE tournament_id = p_tournament_id
    ORDER BY joined_at
  ) INTO v_player_ids;

  v_n_players := ARRAY_LENGTH(v_player_ids, 1);
  IF v_n_players < 2 THEN RAISE EXCEPTION 'Need at least 2 players'; END IF;

  -- Find next power of 2
  v_n_slots := 1;
  WHILE v_n_slots < v_n_players LOOP
    v_n_slots := v_n_slots * 2;
  END LOOP;
  v_total_rounds := CAST(log(2, v_n_slots) AS INT);

  -- Seed players (update seed column)
  FOR i IN 1..v_n_players LOOP
    UPDATE tournament_players SET seed = i WHERE id = v_player_ids[i];
  END LOOP;

  -- Create Round 1 with its matches
  INSERT INTO rounds (tournament_id, round_number, status, started_at)
  VALUES (p_tournament_id, 1, 'active', NOW())
  RETURNING id INTO v_round_id;

  -- Get a phrase for this round's difficulty
  SELECT id INTO v_phrase_id
  FROM phrases
  WHERE difficulty = v_tournament.difficulty
  ORDER BY RANDOM()
  LIMIT 1;

  -- Create matches for round 1 (pair up players, BYE if odd)
  i := 1;
  WHILE i <= v_n_slots LOOP
    DECLARE
      v_p1 UUID := NULL;
      v_p2 UUID := NULL;
    BEGIN
      IF i <= v_n_players THEN v_p1 := v_player_ids[i]; END IF;
      IF i + 1 <= v_n_players THEN v_p2 := v_player_ids[i + 1]; END IF;

      -- If p2 is BYE (null), p1 auto-advances (match immediately finished with p1 as winner)
      IF v_p2 IS NULL THEN
        INSERT INTO matches (round_id, player1_id, player2_id, winner_id, status, started_at, finished_at)
        VALUES (v_round_id, v_p1, NULL, v_p1, 'finished', NOW(), NOW())
        RETURNING id INTO v_match_id;
      ELSE
        -- Active match
        INSERT INTO matches (round_id, player1_id, player2_id, status, started_at)
        VALUES (v_round_id, v_p1, v_p2, 'active', NOW())
        RETURNING id INTO v_match_id;

        -- Create race for this match
        INSERT INTO races (match_id, phrase_id, status, started_at)
        VALUES (v_match_id, v_phrase_id, 'active', NOW());
      END IF;
    END;
    i := i + 2;
  END LOOP;

  -- Activate the tournament
  UPDATE tournaments
  SET status = 'active', current_round = 1
  WHERE id = p_tournament_id;

  RETURN json_build_object('success', true, 'total_rounds', v_total_rounds);
END;
$$;

-- ============================================================
-- RPC: finish_race
-- Validates the race submission and determines the winner.
-- ============================================================
CREATE OR REPLACE FUNCTION finish_race(
  p_race_id    UUID,
  p_match_id   UUID,
  p_player_id  UUID,
  p_typed_text TEXT,
  p_elapsed_ms BIGINT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_race       races%ROWTYPE;
  v_match      matches%ROWTYPE;
  v_phrase     phrases%ROWTYPE;
  v_tp         tournament_players%ROWTYPE;
  v_errors     INT := 0;
  v_char_idx   INT;
  v_winner_id  UUID := NULL;
  v_other_result race_results%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_next_round_id UUID;
  v_next_round_num INT;
  v_phrase_id  UUID;
BEGIN
  -- Load and validate race
  SELECT * INTO v_race FROM races WHERE id = p_race_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Race not found'; END IF;
  IF v_race.status <> 'active' THEN RAISE EXCEPTION 'Race is not active'; END IF;

  -- Load and validate match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'Match is not active'; END IF;

  -- Validate player belongs to match
  SELECT * INTO v_tp FROM tournament_players WHERE id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF v_match.player1_id <> p_player_id AND v_match.player2_id <> p_player_id THEN
    RAISE EXCEPTION 'Player does not belong to this match';
  END IF;

  -- Load phrase
  SELECT * INTO v_phrase FROM phrases WHERE id = v_race.phrase_id;

  -- Validate typed text matches phrase (count errors)
  FOR v_char_idx IN 1..LENGTH(v_phrase.text) LOOP
    IF v_char_idx > LENGTH(p_typed_text) THEN
      v_errors := v_errors + 1;
    ELSIF SUBSTR(p_typed_text, v_char_idx, 1) <> SUBSTR(v_phrase.text, v_char_idx, 1) THEN
      v_errors := v_errors + 1;
    END IF;
  END LOOP;

  -- If too many errors, reject as incomplete
  -- (typed text must match phrase exactly)
  IF p_typed_text <> v_phrase.text THEN
    RAISE EXCEPTION 'Typed text does not match phrase';
  END IF;

  -- Record the result (upsert)
  INSERT INTO race_results (race_id, player_id, typed_text, elapsed_ms, errors, is_winner)
  VALUES (p_race_id, p_player_id, p_typed_text, p_elapsed_ms, 0, FALSE)
  ON CONFLICT (race_id, player_id) DO NOTHING;

  -- Check if other player has finished
  SELECT * INTO v_other_result
  FROM race_results
  WHERE race_id = p_race_id AND player_id <> p_player_id;

  -- Determine winner
  IF FOUND THEN
    -- Both finished — whoever was faster wins
    IF p_elapsed_ms <= v_other_result.elapsed_ms THEN
      v_winner_id := p_player_id;
    ELSE
      v_winner_id := v_other_result.player_id;
    END IF;
  ELSE
    -- First to finish — this player wins
    v_winner_id := p_player_id;
  END IF;

  -- Mark winner in result
  UPDATE race_results SET is_winner = TRUE WHERE race_id = p_race_id AND player_id = v_winner_id;

  -- Close the race
  UPDATE races SET status = 'finished', finished_at = NOW() WHERE id = p_race_id;

  -- Close the match and set winner
  UPDATE matches SET status = 'finished', winner_id = v_winner_id, finished_at = NOW() WHERE id = p_match_id;

  -- Update player statuses
  UPDATE tournament_players SET status = 'eliminated'
  WHERE id IN (v_match.player1_id, v_match.player2_id) AND id <> v_winner_id;
  UPDATE tournament_players SET status = 'active' WHERE id = v_winner_id;

  -- Check if all matches in the round are finished → advance tournament
  DECLARE
    v_unfinished_count INT;
    v_round_id UUID := v_match.round_id;
  BEGIN
    SELECT COUNT(*) INTO v_unfinished_count
    FROM matches
    WHERE round_id = v_round_id AND status <> 'finished';

    IF v_unfinished_count = 0 THEN
      -- Finish the round
      UPDATE rounds SET status = 'finished', finished_at = NOW() WHERE id = v_round_id;

      -- Check if tournament is over (only 1 winner left)
      SELECT id INTO v_phrase_id FROM phrases
      WHERE difficulty = (SELECT difficulty FROM tournaments WHERE id = v_tp.tournament_id)
      ORDER BY RANDOM() LIMIT 1;

      DECLARE
        v_winners UUID[];
        v_current_round INT;
        v_tournament_id UUID;
      BEGIN
        SELECT tournament_id INTO v_tournament_id FROM rounds WHERE id = v_round_id;

        SELECT ARRAY(
          SELECT winner_id FROM matches WHERE round_id = v_round_id AND winner_id IS NOT NULL
        ) INTO v_winners;

        IF ARRAY_LENGTH(v_winners, 1) = 1 THEN
          -- Tournament over!
          UPDATE tournaments SET status = 'finished' WHERE id = v_tournament_id;
          UPDATE tournament_players SET status = 'winner' WHERE id = v_winners[1];
        ELSE
          -- Create next round
          SELECT current_round INTO v_current_round FROM tournaments WHERE id = v_tournament_id;
          v_next_round_num := v_current_round + 1;

          INSERT INTO rounds (tournament_id, round_number, status, started_at)
          VALUES (v_tournament_id, v_next_round_num, 'active', NOW())
          RETURNING id INTO v_next_round_id;

          -- Create matches for next round from winners
          DECLARE
            i INT := 1;
            v_new_match_id UUID;
          BEGIN
            WHILE i <= ARRAY_LENGTH(v_winners, 1) LOOP
              INSERT INTO matches (round_id, player1_id, player2_id, status, started_at)
              VALUES (v_next_round_id, v_winners[i], v_winners[i+1], 'active', NOW())
              RETURNING id INTO v_new_match_id;

              INSERT INTO races (match_id, phrase_id, status, started_at)
              VALUES (v_new_match_id, v_phrase_id, 'active', NOW());

              i := i + 2;
            END LOOP;
          END;

          UPDATE tournaments SET current_round = v_next_round_num WHERE id = v_tournament_id;
        END IF;
      END;
    END IF;
  END;

  RETURN json_build_object(
    'winner_id', v_winner_id,
    'winner_time_ms', p_elapsed_ms
  );
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE phrases ENABLE ROW LEVEL SECURITY;

-- profiles: users can read all, update and insert only their own
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- tournaments: anyone authenticated can read; insert only by authenticated users
CREATE POLICY "tournaments_select" ON tournaments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tournaments_insert" ON tournaments FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "tournaments_update_host" ON tournaments FOR UPDATE USING (auth.uid() = host_id);

-- tournament_players: participants can read their tournament; can insert (join) themselves
CREATE POLICY "tp_select" ON tournament_players FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tp_insert_self" ON tournament_players FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tp_update_own" ON tournament_players FOR UPDATE USING (auth.uid() = user_id);

-- rounds: authenticated users can read
CREATE POLICY "rounds_select" ON rounds FOR SELECT USING (auth.uid() IS NOT NULL);

-- matches: authenticated users can read
CREATE POLICY "matches_select" ON matches FOR SELECT USING (auth.uid() IS NOT NULL);

-- races: authenticated users can read
CREATE POLICY "races_select" ON races FOR SELECT USING (auth.uid() IS NOT NULL);

-- race_results: participants can read; insert via RPC (SECURITY DEFINER)
CREATE POLICY "race_results_select" ON race_results FOR SELECT USING (auth.uid() IS NOT NULL);

-- race_participants: all authenticated can read/insert
CREATE POLICY "race_participants_select" ON race_participants FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "race_participants_insert" ON race_participants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- phrases: everyone can read (no write from client)
CREATE POLICY "phrases_select" ON phrases FOR SELECT USING (true);

-- ============================================================
-- ENABLE REALTIME for key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_players;
ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE races;
