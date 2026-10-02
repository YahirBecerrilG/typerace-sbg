import { supabase } from './supabase'

function messageOf(error, fallback) {
  if (!error) return fallback
  return (error.message || String(error)).replace(/^.*?: /, '')
}

// ─── Readiness (READY / READY) ──────────────────────────────────────────────
/**
 * Declare yourself READY for a match. When both players are ready the server
 * flips the match to 'ready' and the countdown may begin.
 */
export async function setMatchReady(matchId, ready) {
  const { data, error } = await supabase.rpc('set_match_ready', {
    p_match_id: matchId,
    p_ready: ready,
  })
  if (error) throw new Error(messageOf(error, 'Could not update your ready state.'))
  return data // { ok, status, player1_ready, player2_ready }
}

/**
 * Tell the server you are on the match screen (or not). Leaving clears your
 * READY flag so nobody waits forever for an absent opponent.
 */
export async function setMatchPresence(matchId, present) {
  const { error } = await supabase.rpc('set_match_presence', {
    p_match_id: matchId,
    p_present: present,
  })
  // Presence is best-effort: never surface an error for a silent cleanup call.
  if (error) console.warn('set_match_presence failed:', error.message)
}

// ─── Start ──────────────────────────────────────────────────────────────────
/**
 * Open the race. Only succeeds once both players are READY.
 * Safe to call from both clients at the same time (the second call is a no-op).
 */
export async function startRace(matchId) {
  const { data, error } = await supabase.rpc('start_race', {
    p_match_id: matchId,
  })
  if (error) throw new Error(messageOf(error, 'Could not start the race.'))
  return data // { ok, race_id } | { ok: false, error } | { already_racing: true }
}

// ─── Submit race result (server validates and decides) ──────────────────────
/**
 * Idempotent submit. Returns one of:
 *   { pending: true }              -> you finished, waiting for the opponent
 *   { i_won, winner_id, ... }      -> match decided, you won
 *   { i_won: false, ... }          -> match decided, you lost
 *   { already_processed: true }    -> duplicate submit / already decided
 */
export async function submitRaceResult({ raceId, matchId, playerId, typedText, elapsedMs }) {
  const { data, error } = await supabase.rpc('finish_race', {
    p_race_id: raceId,
    p_match_id: matchId,
    p_player_id: playerId,
    p_typed_text: typedText,
    p_elapsed_ms: elapsedMs,
  })

  if (error) throw new Error(messageOf(error, 'Could not submit your result.'))
  return data
}

// ─── Get race details ───────────────────────────────────────────────────────
export async function getRaceDetails(raceId) {
  const { data, error } = await supabase
    .from('races')
    .select('*, phrases(*), matches(*, rounds(*))')
    .eq('id', raceId)
    .single()

  if (error) throw error
  return data
}

// ─── Record race participation ───────────────────────────────────────────────
export async function recordRaceStart(raceId) {
  const { error } = await supabase.rpc('record_race_participation', {
    p_race_id: raceId,
  })
  // Best-effort presence tracking; never block the race on it.
  if (error) console.warn('record_race_participation failed:', error.message)
}