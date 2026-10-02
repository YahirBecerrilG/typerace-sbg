/**
 * Match navigation policy.
 *
 * The tournament model (migrations 001 -> 006) already defines every state we
 * need, so this module invents nothing. The vocabulary is:
 *
 *   match.status
 *     upcoming          created with the bracket, the HOST has not opened the
 *                       round yet -> players must NOT be pulled anywhere
 *     waiting_players   the host opened the round, both players are invited
 *                       -> THIS is the "go to the prematch" signal
 *     ready             both players pressed READY
 *     racing            the countdown ran / the race is live
 *     completed|bye|forfeit   terminal, decided, never re-entered
 *
 *   tournament.status
 *     lobby | practice | registration_closed   practice is open
 *     bracket_ready | round_active            practice is closed
 *     completed                                final standings
 *
 *   tournament_players.status
 *     active | eliminated | withdrawn | champion
 *
 * A player belongs to a match through matches.player1_id / player2_id, which
 * reference tournament_players.id (there is no separate match_players table).
 *
 * Everything here is pure so the policy can be unit tested without React,
 * without a router and without Supabase.
 */

/** Matches a player can still act on: these are the prematch states. */
export const ACTIONABLE_MATCH_STATUSES = ['waiting_players', 'ready', 'racing']

/** Decided matches. Never opened again, never re-raced. */
export const TERMINAL_MATCH_STATUSES = ['completed', 'bye', 'forfeit']

/** Tournament states where practice (and a match to play) is still possible. */
export const PRACTICE_OPEN_TOURNAMENT_STATUSES = ['lobby', 'practice', 'registration_closed']

/** Tournament states that mean the bracket has been built. */
export const STARTED_TOURNAMENT_STATUSES = ['bracket_ready', 'round_active']

export function isActionableMatchStatus(status) {
  return ACTIONABLE_MATCH_STATUSES.includes(status)
}

export function isTerminalMatchStatus(status) {
  return TERMINAL_MATCH_STATUSES.includes(status)
}

/**
 * The participant row of `match` that belongs to `userId`, or null.
 * Matches the id -> user_id resolution Race.jsx performs on mount.
 */
export function myPlayerInMatch(match, userId) {
  if (!match || !userId) return null
  if (match.player1?.user_id === userId) return match.player1
  if (match.player2?.user_id === userId) return match.player2
  return null
}

/** True when the signed-in user is one of the two competitors. */
export function isMatchParticipant(match, userId) {
  return myPlayerInMatch(match, userId) !== null
}

/**
 * The race attached to a match, or null.
 *
 * Matches are created together with their single race row (BYEs have none, and
 * a BYE is terminal so it never reaches this point). `races[0]` is the race the
 * race screen actually plays, which is why Race.jsx reads the phrase from the
 * embedded match rather than from the URL.
 */
export function raceOfMatch(match) {
  if (!match || !Array.isArray(match.races) || match.races.length === 0) return null
  return match.races[0] || null
}

/**
 * The prematch URL for a match, or null when there is nothing to enter.
 *
 * Returns null (instead of a half-built URL) so callers can never navigate to a
 * race screen that has no phrase — that used to render a dead READY button.
 */
export function racePathForMatch(match) {
  if (!match?.id) return null
  if (!isActionableMatchStatus(match.status)) return null
  const race = raceOfMatch(match)
  if (!race?.id) return null
  return `/race/${match.id}/${race.id}`
}

export function tournamentPath(tournamentId) {
  return tournamentId ? `/tournament/${tournamentId}` : null
}

export function resultsPath(tournamentId) {
  return tournamentId ? `/results/${tournamentId}` : null
}

export function practicePath(tournamentId) {
  return tournamentId ? `/tournament/${tournamentId}/practice` : null
}

/**
 * Decide where a player standing in Practice actually belongs.
 *
 * This is the single source of truth for the "Practice -> prematch" fix and is
 * shared by Practice and Lobby so both behave identically.
 *
 * Inputs:
 *   tournament  the tournaments row (or null while it is still loading)
 *   participant the signed-in user's tournament_players row (or null)
 *   match       the caller's actionable match (or null)
 *
 * Returns one of:
 *   { type: 'race',       to }  an actionable match exists -> go READY up
 *   { type: 'results',    to }  the tournament is over -> final standings
 *   { type: 'tournament', to }  out of the tournament -> overview / bracket
 *   { type: 'stay',       to: null }
 *
 * `replace` is true for every automatic redirect: the player must never be able
 * to press Back and land on Practice again, because the gate would immediately
 * push them forward and trap them in a loop. Replacing the entry lets Back
 * continue to whatever they came from (the Lobby), which is what the rest of
 * the app already does when it leaves a screen automatically.
 */
export function resolveMatchDestination({ tournament, participant, match } = {}) {
  const tournamentId = tournament?.id

  // An actionable match always wins, whatever the tournament status says. The
  // match row is the authoritative per-player signal and it is already filtered
  // to waiting_players | ready | racing by the server query.
  const raceTo = racePathForMatch(match)
  if (raceTo) return { type: 'race', to: raceTo, replace: true }

  // Nothing to race yet. A finished tournament always resolves to the
  // standings, so a player never sits in Practice waiting for a match that will
  // never be created.
  if (tournament?.status === 'completed') {
    const to = resultsPath(tournamentId)
    if (to) return { type: 'results', to, replace: true }
  }

  // The player is in the bracket but not in it any more: eliminated or
  // withdrawn. Send them to the overview, which is the screen that shows the
  // bracket and their placement.
  if (participant && participant.status !== 'active') {
    const to = tournamentPath(tournamentId)
    if (to) return { type: 'tournament', to, replace: true }
  }

  return { type: 'stay', to: null, replace: false }
}

/**
 * Human-readable explanation for the "Practice unavailable" screen.
 * Returns null when practice may run.
 */
export function practiceUnavailableReason({ tournament, participant, userId } = {}) {
  if (!tournament) return 'This tournament does not exist, or the link is no longer valid.'

  // Host authority lives only on tournaments.host_id.
  if (tournament.host_id && userId && tournament.host_id === userId) {
    return 'You are the host of this tournament. Hosts run it, they do not compete in it.'
  }

  if (!participant) return 'You are not registered for this tournament.'

  if (participant.status === 'withdrawn') return 'You left this tournament.'
  if (participant.status === 'eliminated') return 'You have been knocked out of this tournament.'
  if (participant.status === 'champion') return 'You won this tournament.'

  // Still an active player but the bracket moved on: practice only runs while
  // the tournament is still accepting it (server: record_practice enforces this).
  if (!PRACTICE_OPEN_TOURNAMENT_STATUSES.includes(tournament.status)) {
    return 'Practice is closed: the bracket is already running. You can follow your matches from the tournament page.'
  }

  return null
}