import { supabase } from './supabase'

// ─── Generate tournament code ───────────────────────────────────────────────
export function generateTournamentCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'TR-'
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ─── Errors ─────────────────────────────────────────────────────────────────
function messageOf(error, fallback) {
  if (!error) return fallback

  // Postgres errors arrive as "message" plus optional "details" / "hint", and
  // the message can be a bare identifier (e.g. a UUID) when the real cause
  // lives in details. Stripping everything before the first ": " used to throw
  // that context away and show a lone UUID, so keep the raw text and only fall
  // back when there is nothing to show.
  const parts = [error.message, error.details, error.hint]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter((p) => p.length > 0)

  if (parts.length === 0) return fallback

  // Deduplicate: Supabase often repeats the message inside details.
  return [...new Set(parts)].join(' — ')
}

// ─── Create tournament ──────────────────────────────────────────────────────
export async function createTournament({ name, maxPlayers, difficulty }) {
  // Server-authoritative: host_id, status and the host's participant row are
  // all created inside one RPC, so the client has no direct write path and
  // cannot claim the admin label on someone else's behalf.
  let lastError = null

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.rpc('create_tournament', {
      p_name: name,
      p_max_players: maxPlayers,
      p_difficulty: difficulty,
      p_code: generateTournamentCode(),
    })

    if (!error) return data // { ok, id, code }

    lastError = error
    // Only a code collision is worth retrying with a fresh code.
    if (!/already taken/i.test(error.message || '')) break
  }

  throw new Error(messageOf(lastError, 'Could not create the tournament.'))
}

// ─── Join tournament ────────────────────────────────────────────────────────
export async function joinTournament({ code }) {
  // Server-authoritative: refuses joins once registration is closed, enforces
  // capacity, and takes the player from auth.uid() — never from the client.
  const { data, error } = await supabase.rpc('join_tournament', {
    p_code: code,
  })

  if (error) throw new Error(messageOf(error, 'Could not join the tournament.'))
  return data // { ok, tournament_id, already_joined }
}

// ─── Get tournament with players ────────────────────────────────────────────
/**
 * Tournament plus its roster. `players` is participants only: hosts are not in
 * tournament_players, so they are never counted, seeded or rendered as a
 * competitor. A bracket that already ran with a host inside it is filtered out
 * here as well, so the UI stays consistent while the data is being cleaned up.
 */
export async function getTournamentWithPlayers(tournamentId) {
  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      *,
      tournament_players (
        *,
        profiles (id, display_name, avatar_url)
      )
    `)
    .eq('id', tournamentId)
    .single()

  if (error) throw error

  const roster = data.tournament_players || []
  const players = roster.filter(
    (p) => p.role === 'player' && p.user_id !== data.host_id
  )

  return { ...data, players, playerCount: players.length }
}

/** The signed-in user's participant row for a tournament (or null). */
export async function getMyParticipant(tournamentId, userId) {
  const { data, error } = await supabase
    .from('tournament_players')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * A single tournament row, without the roster.
 *
 * Used by the match gate, which only needs `id`, `status` and `host_id` to
 * decide where a waiting player belongs. Deliberately does NOT filter by
 * anything the client could tamper with: RLS decides whether this tournament is
 * visible at all, and a row that is not visible simply comes back as null.
 */
export async function getTournament(tournamentId) {
  if (!tournamentId) return null
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, code, status, host_id, current_round, difficulty, bracket_slots, bracket_byes, max_players')
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) throw error
  return data
}

// ─── Host controls ──────────────────────────────────────────────────────────
export async function closeRegistration(tournamentId) {
  const { data, error } = await supabase.rpc('close_registration', {
    p_tournament_id: tournamentId,
  })
  if (error) throw new Error(messageOf(error, 'Could not close registration.'))
  return data
}

export async function reopenRegistration(tournamentId) {
  const { data, error } = await supabase.rpc('reopen_registration', {
    p_tournament_id: tournamentId,
  })
  if (error) throw new Error(messageOf(error, 'Could not reopen registration.'))
  return data
}

/**
 * Build the bracket: closes registration, seeds by practice score and
 * creates round 1 (with any BYEs). Host only — decided server-side.
 */
export async function startTournament(tournamentId) {
  const { data, error } = await supabase.rpc('start_tournament', {
    p_tournament_id: tournamentId,
  })
  if (error) throw new Error(messageOf(error, 'Could not start the tournament.'))
  return data
}

/** Open the next round once the previous one is fully settled. */
export async function startNextRound(tournamentId) {
  const { data, error } = await supabase.rpc('start_next_round', {
    p_tournament_id: tournamentId,
  })
  if (error) throw new Error(messageOf(error, 'Could not start the round.'))
  return data
}

export async function leaveTournament(tournamentId) {
  const { data, error } = await supabase.rpc('leave_tournament', {
    p_tournament_id: tournamentId,
  })
  if (error) throw new Error(messageOf(error, 'Could not leave the tournament.'))
  return data
}

// ─── Practice / qualifier ───────────────────────────────────────────────────
/**
 * Store a practice run. Practice never touches matches, race results or the
 * bracket — it only moves the seeding order.
 */
export async function recordPractice(tournamentId, { wpm, accuracy }) {
  const { data, error } = await supabase.rpc('record_practice', {
    p_tournament_id: tournamentId,
    p_wpm: wpm,
    p_accuracy: accuracy,
  })
  if (error) throw new Error(messageOf(error, 'Could not save practice result.'))
  return data
}

// ─── Bracket ────────────────────────────────────────────────────────────────
export async function getTournamentBracket(tournamentId) {
  const { data, error } = await supabase
    .from('rounds')
    .select(`
      *,
      matches (
        *,
        player1:tournament_players!matches_player1_id_fkey (
          *,
          profiles (id, display_name)
        ),
        player2:tournament_players!matches_player2_id_fkey (
          *,
          profiles (id, display_name)
        ),
        winner:tournament_players!matches_winner_id_fkey (
          *,
          profiles (id, display_name)
        ),
        races (*)
      )
    `)
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true })

  if (error) throw error
  return data
}

/** Match statuses a player can still act on. */
export const ACTIONABLE_MATCH_STATUSES = ['waiting_players', 'ready', 'racing']

/** Embeds used wherever a match is read. rounds.tournaments carries bracket_slots. */
const MATCH_SELECT = `
  *,
  player1:tournament_players!matches_player1_id_fkey (*, profiles(*)),
  player2:tournament_players!matches_player2_id_fkey (*, profiles(*)),
  races (*, phrases(*)),
  rounds (*, tournaments(*))
`

/** Load a single match with everything the race screen needs. */
export async function getMatch(matchId) {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('id', matchId)
    .single()

  if (error) throw error
  return data
}

/**
 * Everything the match gate needs, resolved server-side from `auth.uid()`.
 *
 * `match_gate_state()` (migration 007) answers the whole question in one call:
 * the tournament status, whether the caller is the host, the caller's
 * participant status and the one match the caller may act on. The client never
 * supplies an identity the server has to trust — `userId` is only used by the
 * fallback path below.
 *
 * If 007 has not been applied yet the RPC does not exist, and the gate silently
 * degrades to the three scoped reads the frontend did before. Both paths return
 * the same shape, so the gate itself has no notion of which one ran.
 */
export async function getMatchGateState(tournamentId, userId) {
  const { data, error } = await supabase.rpc('match_gate_state', {
    p_tournament_id: tournamentId,
  })

  if (!error && data) {
    return {
      source: 'rpc',
      tournament: data.tournament_id
        ? { id: data.tournament_id, status: data.tournament_status, host_id: data.host_id }
        : null,
      participant: data.participant_status
        ? { id: data.participant_id ?? null, status: data.participant_status }
        : null,
      // A match with no race (a BYE) is terminal, so it never reaches here; the
      // race-less case still returns null instead of a half-built URL.
      match:
        data.match_id && ACTIONABLE_MATCH_STATUSES.includes(data.match_status)
          ? {
              id: data.match_id,
              status: data.match_status,
              races: data.race_id ? [{ id: data.race_id }] : [],
            }
          : null,
    }
  }

  // Fallback for a project that has not run 007 yet.
  const missingRpc =
    error &&
    (error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.code === '404' ||
      /match_gate_state|does not exist/i.test(error.message || ''))

  if (!missingRpc) throw error

  const [match, tournament, participant] = await Promise.all([
    getActiveMatchForPlayer(tournamentId, userId),
    getTournament(tournamentId),
    getMyParticipant(tournamentId, userId),
  ])
  return { source: 'fallback', tournament, participant, match }
}

/** The participant's current actionable match in a tournament (or null). */
export async function getActiveMatchForPlayer(tournamentId, userId) {
  const { data: tp } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!tp) return null

  const { data: match, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .or(`player1_id.eq.${tp.id},player2_id.eq.${tp.id}`)
    .in('status', ACTIONABLE_MATCH_STATUSES)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return match
}